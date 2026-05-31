"""
SPP2 Harmonize v4 - SAFE hybrid algorithm (no neural model required)

Purpose:
- Prevent destructive/aggressive harmonize results.
- Use local background sampling + hard correction limits.
- Preserve alpha and original detail.
- Optional contact shadow output.

CLI example:
python harmonize_v4_service.py layer.png background.png '{"x":100,"y":100,"w":300,"h":500}' '{"strength":0.35}' output.png

Expected integration:
Use this logic inside your existing harmonize IPC handler/service. If your current Electron
handler calls a different Python file, copy the functions below into that file or call this script.
"""
from __future__ import annotations

import base64
import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, Tuple

import numpy as np
from PIL import Image, ImageFilter, ImageChops


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _load_rgba(path: str) -> Image.Image:
    return Image.open(path).convert("RGBA")


def _load_rgb(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")


def _rgb_to_luma(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def _rgb_to_saturation_approx(rgb: np.ndarray) -> np.ndarray:
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    return (mx - mn) / np.maximum(mx, 1e-6)


def _stats_rgb(rgb: np.ndarray) -> Dict[str, float]:
    rgb = np.asarray(rgb, dtype=np.float32) / 255.0
    if rgb.size == 0:
        return {"luma_mean": 0.5, "luma_std": 0.18, "sat_mean": 0.35, "temp": 0.0}
    luma = _rgb_to_luma(rgb)
    sat = _rgb_to_saturation_approx(rgb)
    # simple warm/cool estimate, positive = warmer/redder, negative = cooler/bluer
    temp = float(np.mean(rgb[..., 0] - rgb[..., 2]))
    return {
        "luma_mean": float(np.mean(luma)),
        "luma_std": float(np.std(luma)),
        "sat_mean": float(np.mean(sat)),
        "temp": temp,
    }


def _sample_local_background(bg: Image.Image, bbox: Dict[str, float], margin: int) -> np.ndarray:
    """Sample a ring around bbox. Falls back to bbox crop, then whole image."""
    w, h = bg.size
    x = int(round(float(bbox.get("x", 0))))
    y = int(round(float(bbox.get("y", 0))))
    bw = int(round(float(bbox.get("w", bbox.get("width", 0)))))
    bh = int(round(float(bbox.get("h", bbox.get("height", 0)))))

    x0 = max(0, x - margin)
    y0 = max(0, y - margin)
    x1 = min(w, x + bw + margin)
    y1 = min(h, y + bh + margin)
    if x1 <= x0 or y1 <= y0:
        return np.asarray(bg.resize((min(w, 800), int(min(w, 800) * h / max(w, 1)))) if w > 800 else bg)

    crop = bg.crop((x0, y0, x1, y1)).convert("RGB")
    arr = np.asarray(crop, dtype=np.uint8)

    # Ring mask: keep pixels outside original bbox inside the expanded crop.
    mask = np.ones(arr.shape[:2], dtype=bool)
    ix0 = max(0, x - x0)
    iy0 = max(0, y - y0)
    ix1 = min(arr.shape[1], x + bw - x0)
    iy1 = min(arr.shape[0], y + bh - y0)
    if ix1 > ix0 and iy1 > iy0:
        mask[iy0:iy1, ix0:ix1] = False

    ring = arr[mask]
    if ring.shape[0] < 500:
        # If bbox fills too much of the crop, sample under/near bbox instead.
        under_y0 = min(h, max(0, y + int(bh * 0.65)))
        under_y1 = min(h, y + bh + margin)
        under_x0 = max(0, x - margin)
        under_x1 = min(w, x + bw + margin)
        if under_y1 > under_y0 and under_x1 > under_x0:
            ring = np.asarray(bg.crop((under_x0, under_y0, under_x1, under_y1)).convert("RGB"), dtype=np.uint8).reshape(-1, 3)
    if ring.shape[0] < 100:
        ring = np.asarray(bg.convert("RGB"), dtype=np.uint8).reshape(-1, 3)
    return ring.reshape(-1, 3)


def _apply_safe_corrections(layer: Image.Image, bg_stats: Dict[str, float], opts: Dict[str, Any]) -> Tuple[Image.Image, Dict[str, float]]:
    arr = np.asarray(layer, dtype=np.float32)
    rgb = arr[..., :3] / 255.0
    alpha = arr[..., 3] / 255.0
    fg_mask = alpha > 0.08
    if fg_mask.sum() < 20:
        return layer, {"brightnessAdj": 0, "saturationAdj": 0, "tempAdj": 0, "contrastAdj": 1.0}

    fg_stats = _stats_rgb((rgb[fg_mask] * 255).astype(np.uint8))

    # UI strength must not mean destructive strength. Cap internally.
    ui_strength = float(opts.get("strength", 0.35))
    safe_strength = _clamp(ui_strength, 0.0, 1.0) * 0.45

    max_brightness = float(opts.get("maxBrightnessShift", 0.14))
    max_contrast = float(opts.get("maxContrastShift", 0.12))
    max_saturation = float(opts.get("maxSaturationShift", 0.18))
    max_temp = float(opts.get("maxTemperatureShift", 0.08))

    brightness_delta = 0.0
    if opts.get("matchBrightness", True):
        brightness_delta = _clamp(bg_stats["luma_mean"] - fg_stats["luma_mean"], -max_brightness, max_brightness) * safe_strength

    contrast_factor = 1.0
    if opts.get("matchContrast", True):
        ratio = bg_stats["luma_std"] / max(fg_stats["luma_std"], 1e-4)
        ratio = _clamp(ratio, 1.0 - max_contrast, 1.0 + max_contrast)
        contrast_factor = 1.0 + (ratio - 1.0) * safe_strength

    sat_factor = 1.0
    if opts.get("matchSaturation", True):
        ratio = bg_stats["sat_mean"] / max(fg_stats["sat_mean"], 1e-4)
        ratio = _clamp(ratio, 1.0 - max_saturation, 1.0 + max_saturation)
        sat_factor = 1.0 + (ratio - 1.0) * safe_strength

    temp_delta = 0.0
    if opts.get("matchTemperature", True):
        temp_delta = _clamp(bg_stats["temp"] - fg_stats["temp"], -max_temp, max_temp) * safe_strength

    # Apply contrast around foreground mean luma, then brightness.
    mean = fg_stats["luma_mean"]
    luma = _rgb_to_luma(rgb)
    rgb2 = (rgb - mean) * contrast_factor + mean + brightness_delta

    # Approx saturation adjustment by moving from gray toward color.
    gray = _rgb_to_luma(rgb2)[..., None]
    rgb2 = gray + (rgb2 - gray) * sat_factor

    # Temperature: red up/down, blue opposite. Keep green mostly stable.
    rgb2[..., 0] += temp_delta * 0.55
    rgb2[..., 2] -= temp_delta * 0.55

    # Preserve original outside meaningful alpha, and blend correction by alpha to avoid dirty edges.
    edge_weight = np.clip((alpha - 0.02) / 0.45, 0, 1)[..., None]
    rgb_final = rgb * (1.0 - edge_weight) + rgb2 * edge_weight
    rgb_final = np.clip(rgb_final, 0.0, 1.0)

    out = np.dstack([rgb_final * 255.0, arr[..., 3]]).astype(np.uint8)
    diagnostics = {
        "brightnessAdj": float(brightness_delta),
        "saturationAdj": float(sat_factor - 1.0),
        "tempAdj": float(temp_delta),
        "contrastAdj": float(contrast_factor),
        "sourceLuma": fg_stats["luma_mean"],
        "backgroundLuma": bg_stats["luma_mean"],
        "safeStrength": safe_strength,
    }
    return Image.fromarray(out, "RGBA"), diagnostics


def create_contact_shadow(layer: Image.Image, opts: Dict[str, Any]) -> Image.Image:
    """Create a safe, subtle shadow PNG with same dimensions as layer."""
    alpha = layer.getchannel("A")
    w, h = layer.size

    strength = _clamp(float(opts.get("shadowStrength", 0.28)), 0, 1)
    softness = _clamp(float(opts.get("shadowSoftness", 14)), 0, 80)
    distance = _clamp(float(opts.get("shadowDistance", 8)), 0, 120)
    direction = math.radians(float(opts.get("shadowDirection", 135)))

    # Convert degrees to image-space offset. 0=up, 90=right, 180=down.
    dx = int(round(math.sin(direction) * distance))
    dy = int(round(-math.cos(direction) * distance))

    # Ground/contact bias: emphasize lower half, reduce halo around upper body.
    a = np.asarray(alpha, dtype=np.float32) / 255.0
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    lower_weight = np.clip((yy - 0.35) / 0.65, 0, 1) ** 1.8
    contact = a * lower_weight

    contact_img = Image.fromarray(np.uint8(np.clip(contact * 255, 0, 255)), "L")
    if softness > 0:
        contact_img = contact_img.filter(ImageFilter.GaussianBlur(radius=softness))
    contact_img = ImageChops.offset(contact_img, dx, dy)

    # Remove wrapped pixels from ImageChops.offset.
    mask_arr = np.asarray(contact_img, dtype=np.float32)
    if dx > 0:
        mask_arr[:, :dx] = 0
    elif dx < 0:
        mask_arr[:, dx:] = 0
    if dy > 0:
        mask_arr[:dy, :] = 0
    elif dy < 0:
        mask_arr[dy:, :] = 0

    # Keep it subtle.
    mask_arr = np.clip(mask_arr * strength, 0, 180)
    shadow = np.zeros((h, w, 4), dtype=np.uint8)
    shadow[..., 3] = mask_arr.astype(np.uint8)
    return Image.fromarray(shadow, "RGBA")


def harmonize_file(layer_path: str, bg_path: str, bbox_json: str, options_json: str, output_path: str) -> Dict[str, Any]:
    try:
        opts = json.loads(options_json or "{}")
        bbox = json.loads(bbox_json or "{}")
        layer = _load_rgba(layer_path)
        bg = _load_rgb(bg_path)

        margin = int(opts.get("localSampleMargin", max(40, min(140, round(max(float(bbox.get('w', bbox.get('width', 100))), float(bbox.get('h', bbox.get('height', 100)))) * 0.18)))))
        bg_pixels = _sample_local_background(bg, bbox, margin=margin)
        bg_stats = _stats_rgb(bg_pixels)

        result, diagnostics = _apply_safe_corrections(layer, bg_stats, opts)
        result.save(output_path)

        shadow_info = None
        if opts.get("addShadow", False) and opts.get("shadowOutputPath"):
            try:
                shadow = create_contact_shadow(layer, opts)
                shadow.save(str(opts["shadowOutputPath"]))
                shadow_info = {"ok": True}
            except Exception as e:
                shadow_info = {"ok": False, "error": str(e)}

        return {"ok": True, "mode": "algorithm", "diagnostics": diagnostics, "shadow": shadow_info}
    except Exception as e:
        return {"ok": False, "error": str(e), "mode": "passthrough"}


def main(argv: list[str]) -> int:
    if len(argv) != 6:
        print(json.dumps({"ok": False, "error": "Usage: harmonize_v4_service.py layer bg bboxJson optionsJson output"}, ensure_ascii=False))
        return 2
    res = harmonize_file(argv[1], argv[2], argv[3], argv[4], argv[5])
    print(json.dumps(res, ensure_ascii=False))
    return 0 if res.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

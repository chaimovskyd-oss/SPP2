"""
harmonize_service.py v3 – Conservative layer harmonization.

Improvements over v2:
  - Hard delta limits per channel prevent aggressive over-correction:
      L (brightness/contrast) : ±15 % of range  (38 / 255)
      A (green↔red saturation): ±20 % of range  (51 / 255)
      B (blue↔yellow temp)    : ±15 % of range  (38 / 255)
  - Correction is "delta-clamped + strength-blended", not raw histogram swap:
      result = original + clip(matched − original, −maxΔ, +maxΔ) × strength
  - "Neural" mode remains an ONNX hook; no model is bundled – it silently
    falls back to the algorithm unless model.onnx exists.

Usage:
  python harmonize_service.py \\
    --layer-path <PNG with alpha> \\
    --bg-path    <PNG background (layer hidden)> \\
    --bbox       '{"x":100,"y":80,"w":400,"h":300}' \\
    --options    '{"strength":0.75,"matchBrightness":true,"matchContrast":true,
                   "matchSaturation":true,"matchTemperature":true,"mode":"algorithm"}' \\
    --output-path <output.png>

Stdout (last line): JSON {"ok":bool,"diagnostics":{...},"mode":str}
"""

from __future__ import annotations

import argparse
import json
import math
import os
import traceback
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageFilter


# ─── CDF histogram-matching helpers ──────────────────────────────────────────

def _cdf_lut(src: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Build a uint8→uint8 LUT that maps src's histogram to match ref's."""
    src_hist, _ = np.histogram(src.ravel(), 256, (0, 256))
    ref_hist, _ = np.histogram(ref.ravel(), 256, (0, 256))

    src_cdf = src_hist.cumsum().astype(np.float64)
    ref_cdf = ref_hist.cumsum().astype(np.float64)
    src_cdf /= max(src_cdf[-1], 1.0)
    ref_cdf /= max(ref_cdf[-1], 1.0)

    lut = np.empty(256, dtype=np.uint8)
    j = 0
    for i in range(256):
        while j < 255 and ref_cdf[j] < src_cdf[i]:
            j += 1
        lut[i] = j
    return lut


# Hard limits — prevent catastrophic over-correction when scene lighting
# differs drastically between foreground and background.
_L_MAX_DELTA  = 38.0   # ±15 % of L range  (brightness / contrast)
_AB_MAX_DELTA = 51.0   # ±20 % of A/B range (saturation / temperature)


def _match_channel(
    layer_ch: np.ndarray,     # float32 (H, W), values in [0, 255]
    ref_ch: np.ndarray,       # float32 (any shape), values in [0, 255]
    opaque: np.ndarray,       # bool (H, W)
    strength: float,
    max_delta: float = _AB_MAX_DELTA,
) -> tuple[np.ndarray, float, float]:
    """
    Compute target histogram from ref_ch, then apply a *clamped* delta.

    Formula:
        delta  = clip(matched − original, −max_delta, +max_delta)
        result = original + delta × strength

    This prevents a bright foreground from being crushed to match a dark
    background even when strength = 1.0.
    Returns (result_float32, mean_shift_fraction, std_ratio).
    """
    src_pixels = np.clip(layer_ch[opaque], 0, 255).astype(np.uint8)
    ref_pixels = np.clip(ref_ch.ravel(), 0, 255).astype(np.uint8)

    if len(src_pixels) < 4 or len(ref_pixels) < 4:
        return layer_ch.copy(), 0.0, 1.0

    lut = _cdf_lut(src_pixels, ref_pixels)
    layer_f = layer_ch.astype(np.float32)
    layer_uint8 = np.clip(layer_f, 0, 255).astype(np.uint8)
    matched = lut[layer_uint8].astype(np.float32)

    # Clamp the per-pixel correction before blending with strength
    delta = np.clip(matched - layer_f, -max_delta, max_delta)
    result = layer_f + delta * strength

    # Diagnostics (from opaque region only)
    orig_mean  = float(src_pixels.mean())
    result_mean = float(result[opaque].mean())
    orig_std   = float(src_pixels.std()) + 1e-6
    result_std = float(result[opaque].std()) + 1e-6

    return result, (result_mean - orig_mean) / 255.0, result_std / orig_std


# ─── Background sampling ──────────────────────────────────────────────────────

def _sample_bg(bg_rgb: np.ndarray, bbox: dict, margin: int = 40) -> np.ndarray:
    """Return background pixels near the layer bbox. Falls back to full image."""
    h, w = bg_rgb.shape[:2]
    x1 = max(0, int(bbox.get("x", 0)) - margin)
    y1 = max(0, int(bbox.get("y", 0)) - margin)
    x2 = min(w, int(bbox.get("x", 0)) + int(bbox.get("w", w)) + margin)
    y2 = min(h, int(bbox.get("y", 0)) + int(bbox.get("h", h)) + margin)
    region = bg_rgb[y1:y2, x1:x2] if (x2 > x1 and y2 > y1) else bg_rgb
    return region if region.size >= 12 else bg_rgb


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _rgb_to_luma(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def _rgb_to_saturation_approx(rgb: np.ndarray) -> np.ndarray:
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    return (mx - mn) / np.maximum(mx, 1e-6)


def _stats_rgb(rgb: np.ndarray) -> dict[str, float]:
    rgb = np.asarray(rgb, dtype=np.float32) / 255.0
    if rgb.size == 0:
        return {"luma_mean": 0.5, "luma_std": 0.18, "sat_mean": 0.35, "temp": 0.0}
    luma = _rgb_to_luma(rgb)
    sat = _rgb_to_saturation_approx(rgb)
    return {
        "luma_mean": float(np.mean(luma)),
        "luma_std": float(np.std(luma)),
        "sat_mean": float(np.mean(sat)),
        "temp": float(np.mean(rgb[..., 0] - rgb[..., 2])),
    }


def _sample_local_background(bg_rgb: np.ndarray, bbox: dict, margin: int) -> np.ndarray:
    """Sample a ring around the object instead of the whole nearby crop."""
    h, w = bg_rgb.shape[:2]
    x = int(round(float(bbox.get("x", 0))))
    y = int(round(float(bbox.get("y", 0))))
    bw = int(round(float(bbox.get("w", bbox.get("width", 0)))))
    bh = int(round(float(bbox.get("h", bbox.get("height", 0)))))

    x0 = max(0, x - margin)
    y0 = max(0, y - margin)
    x1 = min(w, x + bw + margin)
    y1 = min(h, y + bh + margin)
    if x1 <= x0 or y1 <= y0:
        return bg_rgb.reshape(-1, 3)

    arr = bg_rgb[y0:y1, x0:x1]
    mask = np.ones(arr.shape[:2], dtype=bool)
    ix0 = max(0, x - x0)
    iy0 = max(0, y - y0)
    ix1 = min(arr.shape[1], x + bw - x0)
    iy1 = min(arr.shape[0], y + bh - y0)
    if ix1 > ix0 and iy1 > iy0:
        mask[iy0:iy1, ix0:ix1] = False

    ring = arr[mask]
    if ring.shape[0] < 500:
        under_y0 = min(h, max(0, y + int(bh * 0.65)))
        under_y1 = min(h, y + bh + margin)
        under_x0 = max(0, x - margin)
        under_x1 = min(w, x + bw + margin)
        if under_y1 > under_y0 and under_x1 > under_x0:
            ring = bg_rgb[under_y0:under_y1, under_x0:under_x1].reshape(-1, 3)
    if ring.shape[0] < 100:
        ring = bg_rgb.reshape(-1, 3)
    return ring.reshape(-1, 3)


def _apply_safe_corrections(layer_np: np.ndarray, bg_stats: dict[str, float], options: dict) -> tuple[np.ndarray, dict]:
    arr = layer_np.astype(np.float32)
    rgb = arr[..., :3] / 255.0
    alpha = arr[..., 3] / 255.0
    fg_mask = alpha > 0.08
    if int(fg_mask.sum()) < 20:
        return layer_np, {"brightnessAdj": 0.0, "saturationAdj": 0.0, "tempAdj": 0.0, "contrastAdj": 1.0}

    fg_stats = _stats_rgb((rgb[fg_mask] * 255).astype(np.uint8))

    ui_strength = float(options.get("strength", 0.35))
    safe_strength = _clamp(ui_strength, 0.0, 1.0) * 0.45
    max_brightness = float(options.get("maxBrightnessShift", 0.14))
    max_contrast = float(options.get("maxContrastShift", 0.12))
    max_saturation = float(options.get("maxSaturationShift", 0.18))
    max_temp = float(options.get("maxTemperatureShift", 0.08))

    brightness_delta = 0.0
    if options.get("matchBrightness", True):
        brightness_delta = _clamp(
            bg_stats["luma_mean"] - fg_stats["luma_mean"],
            -max_brightness,
            max_brightness,
        ) * safe_strength

    contrast_factor = 1.0
    if options.get("matchContrast", True):
        ratio = bg_stats["luma_std"] / max(fg_stats["luma_std"], 1e-4)
        ratio = _clamp(ratio, 1.0 - max_contrast, 1.0 + max_contrast)
        contrast_factor = 1.0 + (ratio - 1.0) * safe_strength

    sat_factor = 1.0
    if options.get("matchSaturation", True):
        ratio = bg_stats["sat_mean"] / max(fg_stats["sat_mean"], 1e-4)
        ratio = _clamp(ratio, 1.0 - max_saturation, 1.0 + max_saturation)
        sat_factor = 1.0 + (ratio - 1.0) * safe_strength

    temp_delta = 0.0
    if options.get("matchTemperature", True):
        temp_delta = _clamp(bg_stats["temp"] - fg_stats["temp"], -max_temp, max_temp) * safe_strength

    mean = fg_stats["luma_mean"]
    rgb2 = (rgb - mean) * contrast_factor + mean + brightness_delta
    gray = _rgb_to_luma(rgb2)[..., None]
    rgb2 = gray + (rgb2 - gray) * sat_factor
    rgb2[..., 0] += temp_delta * 0.55
    rgb2[..., 2] -= temp_delta * 0.55

    edge_weight = np.clip((alpha - 0.02) / 0.45, 0, 1)[..., None]
    rgb_final = rgb * (1.0 - edge_weight) + rgb2 * edge_weight
    out = np.dstack([np.clip(rgb_final, 0.0, 1.0) * 255.0, arr[..., 3]]).astype(np.uint8)
    diagnostics = {
        "brightnessAdj": round(float(brightness_delta), 4),
        "saturationAdj": round(float(sat_factor - 1.0), 4),
        "tempAdj": round(float(temp_delta), 4),
        "contrastAdj": round(float(contrast_factor), 4),
        "sourceLuma": round(float(fg_stats["luma_mean"]), 4),
        "backgroundLuma": round(float(bg_stats["luma_mean"]), 4),
        "safeStrength": round(float(safe_strength), 4),
    }
    return out, diagnostics


def _neural_result_is_safe(source_rgba: np.ndarray, result_rgba: np.ndarray) -> bool:
    if result_rgba.shape != source_rgba.shape:
        return False
    alpha = source_rgba[..., 3] > 30
    if int(alpha.sum()) < 20:
        return False

    src_rgb = source_rgba[..., :3].astype(np.float32) / 255.0
    out_rgb = result_rgba[..., :3].astype(np.float32) / 255.0
    src_luma = _rgb_to_luma(src_rgb)[alpha]
    out_luma = _rgb_to_luma(out_rgb)[alpha]

    luma_shift = abs(float(out_luma.mean() - src_luma.mean()))
    dark_ratio = float(np.mean(out_luma < 0.08))
    clipped_ratio = float(np.mean((out_rgb[alpha] < 0.02) | (out_rgb[alpha] > 0.98)))
    return luma_shift <= 0.24 and dark_ratio <= 0.22 and clipped_ratio <= 0.35


# ─── Optional ONNX neural refinement ─────────────────────────────────────────

def _try_neural(
    layer_lab: np.ndarray,   # uint8 (H, W, 3)
    bg_lab: np.ndarray,      # uint8 (any h, w, 3)
    alpha: np.ndarray,       # uint8 (H, W)
) -> np.ndarray | None:
    """
    Try to run harmonization ONNX model.
    Returns refined LAB uint8 (H, W, 3) or None if unavailable.

    Place model at: $SPP2_MODELS_DIR/harmonize/model.onnx
    Expected input: float32 (1, 7, 256, 256) – [layer_lab_norm, bg_lab_norm, alpha_norm]
    Expected output: float32 (1, 3, 256, 256) – refined LAB normalized
    """
    try:
        import onnxruntime as ort  # type: ignore
    except ImportError:
        return None

    models_dir = Path(os.environ.get("SPP2_MODELS_DIR", "models"))
    model_path = models_dir / "harmonize" / "model.onnx"
    if not model_path.exists():
        return None

    try:
        sess = ort.InferenceSession(
            str(model_path),
            providers=["CPUExecutionProvider"],
        )
        inp_name = sess.get_inputs()[0].name
        H, W = layer_lab.shape[:2]
        SIZE = 256

        layer_f = cv2.resize(layer_lab, (SIZE, SIZE)).astype(np.float32) / 255.0
        bg_f = cv2.resize(bg_lab, (SIZE, SIZE)).astype(np.float32) / 255.0
        alpha_f = cv2.resize(alpha, (SIZE, SIZE)).astype(np.float32)[..., np.newaxis] / 255.0

        # Build (1, 7, SIZE, SIZE) input
        combined = np.concatenate([layer_f, bg_f, alpha_f], axis=-1)  # (SIZE, SIZE, 7)
        tensor = combined.transpose(2, 0, 1)[np.newaxis]               # (1, 7, SIZE, SIZE)

        out = sess.run(None, {inp_name: tensor.astype(np.float32)})[0][0]  # (3, SIZE, SIZE)
        out_lab = np.clip(out.transpose(1, 2, 0) * 255.0, 0, 255).astype(np.uint8)

        # Resize back to original resolution
        return cv2.resize(out_lab, (W, H), interpolation=cv2.INTER_LINEAR)
    except Exception:
        return None


# ─── Contact shadow ───────────────────────────────────────────────────────────

def create_contact_shadow(alpha: np.ndarray, options: dict) -> np.ndarray:
    """
    Build a contact-shadow RGBA image from a layer's alpha channel.

    Convention for direction:
      0° = shadow cast upward
      90° = shadow cast right
      135° = shadow cast to bottom-right  ← default (light from upper-left)
      180° = shadow cast downward
      270° = shadow cast left

    Returns uint8 RGBA (H, W, 4): pure black with soft shadow in alpha.
    """
    H, W = alpha.shape
    strength = _clamp(float(options.get("shadowStrength", 0.28)), 0, 1)
    softness = _clamp(float(options.get("shadowSoftness", 14.0)), 0, 80)
    distance = _clamp(float(options.get("shadowDistance", 8.0)), 0, 120)
    direction = math.radians(float(options.get("shadowDirection", 135.0)))

    dx = int(round(math.sin(direction) * distance))
    dy = int(round(-math.cos(direction) * distance))

    # Bias the mask to the lower part of the object so the result reads as a
    # contact shadow instead of a full-body glow.
    a = alpha.astype(np.float32) / 255.0
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    lower_weight = np.clip((yy - 0.35) / 0.65, 0, 1) ** 1.8
    contact = a * lower_weight

    contact_img = Image.fromarray(np.uint8(np.clip(contact * 255, 0, 255)), "L")
    if softness > 0:
        contact_img = contact_img.filter(ImageFilter.GaussianBlur(radius=softness))
    contact_img = ImageChops.offset(contact_img, dx, dy)

    shadow_alpha = np.asarray(contact_img, dtype=np.float32)
    if dx > 0:
        shadow_alpha[:, :dx] = 0
    elif dx < 0:
        shadow_alpha[:, dx:] = 0
    if dy > 0:
        shadow_alpha[:dy, :] = 0
    elif dy < 0:
        shadow_alpha[dy:, :] = 0

    shadow_alpha = np.clip(shadow_alpha * strength, 0, 180).astype(np.uint8)
    out = np.zeros((H, W, 4), dtype=np.uint8)
    out[:, :, 3] = shadow_alpha
    return out

    strength = float(options.get("shadowStrength", 0.35))
    softness = float(options.get("shadowSoftness", 18.0))   # px → treated as sigma
    distance = float(options.get("shadowDistance", 8.0))    # px offset
    direction = float(options.get("shadowDirection", 135.0))

    rad = math.radians(direction)
    # dx/dy: where the shadow shifts *toward*
    dx = int(round(distance * math.sin(rad)))    # +right
    dy = int(round(distance * -math.cos(rad)))   # +down  (image y increases downward)

    H, W = alpha.shape

    # 1. Translate alpha channel by (dx, dy) – creates a directional offset
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    shifted = cv2.warpAffine(
        alpha.astype(np.float32), M, (W, H),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )

    # 2. Gaussian blur for softness (sigma = softness / 3 → "radius" feel)
    if softness > 0.5:
        sigma = max(0.5, softness / 3.0)
        ksize = max(3, int(math.ceil(sigma * 6)) | 1)   # odd, covers ±3σ
        blurred = cv2.GaussianBlur(shifted, (ksize, ksize), sigma)
    else:
        blurred = shifted

    # 3. Scale by strength
    shadow_alpha = np.clip(blurred * strength, 0, 255).astype(np.uint8)

    # 4. Pack as RGBA (black shadow)
    out = np.zeros((H, W, 4), dtype=np.uint8)
    out[:, :, 3] = shadow_alpha
    return out


# ─── Main harmonization ───────────────────────────────────────────────────────

def harmonize(
    layer_path: str,
    bg_path: str,
    bbox: dict,
    options: dict,
    output_path: str,
) -> dict:
    strength = float(options.get("strength", 0.75))
    do_brightness = bool(options.get("matchBrightness", True))
    do_contrast = bool(options.get("matchContrast", True))
    do_saturation = bool(options.get("matchSaturation", True))
    do_temperature = bool(options.get("matchTemperature", True))
    use_neural = str(options.get("mode", "algorithm")).lower() == "neural"

    # ── Load images ────────────────────────────────────────────────────────────
    layer_pil = Image.open(layer_path).convert("RGBA")
    layer_np = np.array(layer_pil)
    alpha = layer_np[:, :, 3]                      # uint8 (H, W)
    layer_rgb = layer_np[:, :, :3]                 # uint8 (H, W, 3)

    bg_rgb = np.array(Image.open(bg_path).convert("RGB"))  # uint8

    opaque = alpha > 30   # pixels with meaningful opacity

    if not np.any(opaque):
        layer_pil.save(output_path, format="PNG")
        return {
            "ok": True,
            "diagnostics": {"brightnessAdj": 0.0, "saturationAdj": 0.0, "tempAdj": 0.0, "contrastAdj": 1.0},
            "mode": "passthrough",
        }

    # ── Neural path (IIH) ──────────────────────────────────────────────────────
    if use_neural:
        try:
            from harmonize_iih_runner import run_iih  # type: ignore
            neural_rgba = run_iih(layer_np, bg_rgb)
            if neural_rgba is not None and _neural_result_is_safe(layer_np, neural_rgba):
                Image.fromarray(neural_rgba).save(output_path, format="PNG")
                shadow_info: dict = {}
                shadow_output_path = options.get("shadowOutputPath")
                if options.get("addShadow") and shadow_output_path:
                    try:
                        shadow_rgba = create_contact_shadow(alpha, options)
                        Image.fromarray(shadow_rgba).save(shadow_output_path, format="PNG")
                        shadow_info = {"ok": True}
                    except Exception as exc:
                        shadow_info = {"ok": False, "error": str(exc)}
                result: dict = {
                    "ok": True,
                    "diagnostics": {"brightnessAdj": 0.0, "saturationAdj": 0.0, "tempAdj": 0.0, "contrastAdj": 1.0},
                    "mode": "neural",
                }
                if shadow_info:
                    result["shadow"] = shadow_info
                return result
            if neural_rgba is not None:
                print("[harmonize] IIH result rejected by safety guard; falling back to algorithm", flush=True)
        except Exception as _e:
            print(f"[harmonize] IIH unavailable, falling back to algorithm: {_e}", flush=True)

    # ── Convert to LAB ─────────────────────────────────────────────────────────
    margin_default = max(
        40,
        min(
            140,
            round(
                max(
                    float(bbox.get("w", bbox.get("width", 100))),
                    float(bbox.get("h", bbox.get("height", 100))),
                )
                * 0.18
            ),
        ),
    )
    margin = int(options.get("localSampleMargin", margin_default))
    bg_pixels = _sample_local_background(bg_rgb, bbox, margin)
    bg_stats = _stats_rgb(bg_pixels)

    result_rgba, diag = _apply_safe_corrections(layer_np, bg_stats, options)
    Image.fromarray(result_rgba).save(output_path, format="PNG")

    shadow_info: dict = {}
    shadow_output_path = options.get("shadowOutputPath")
    if options.get("addShadow") and shadow_output_path:
        try:
            shadow_rgba = create_contact_shadow(alpha, options)
            Image.fromarray(shadow_rgba).save(shadow_output_path, format="PNG")
            shadow_info = {"ok": True}
        except Exception as exc:
            shadow_info = {"ok": False, "error": str(exc)}

    result: dict = {"ok": True, "diagnostics": diag, "mode": "algorithm"}
    if shadow_info:
        result["shadow"] = shadow_info
    return result

    # OpenCV LAB ranges: L [0,255], A [0,255] (=[-128,127]), B [0,255] (=[-128,127])
    def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
        return cv2.cvtColor(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), cv2.COLOR_BGR2LAB)

    layer_lab = rgb_to_lab(layer_rgb).astype(np.float32)   # (H, W, 3)
    bg_region = _sample_bg(bg_rgb, bbox)
    bg_lab = rgb_to_lab(bg_region).astype(np.float32)       # (h, w, 3)

    L_src, A_src, B_src = layer_lab[:, :, 0], layer_lab[:, :, 1], layer_lab[:, :, 2]

    result_L = L_src.copy()
    result_A = A_src.copy()
    result_B = B_src.copy()

    diag: dict[str, float] = {
        "brightnessAdj": 0.0, "saturationAdj": 0.0,
        "tempAdj": 0.0, "contrastAdj": 1.0,
    }

    # ── Channel matching ────────────────────────────────────────────────────────

    # L channel → brightness + contrast  (tighter ±15 % limit)
    if do_brightness or do_contrast:
        result_L, l_shift, l_scale = _match_channel(
            L_src, bg_lab[:, :, 0], opaque, strength, max_delta=_L_MAX_DELTA
        )
        if do_brightness:
            diag["brightnessAdj"] = round(l_shift, 4)
        if do_contrast:
            diag["contrastAdj"] = round(l_scale, 4)

    # A channel → green↔red axis (saturation component, ±20 % limit)
    if do_saturation:
        result_A, a_shift, _ = _match_channel(
            A_src, bg_lab[:, :, 1], opaque, strength, max_delta=_AB_MAX_DELTA
        )
        diag["saturationAdj"] = round(a_shift, 4)

    # B channel → blue↔yellow axis (temperature, ±15 % limit)
    if do_temperature:
        result_B, b_shift, _ = _match_channel(
            B_src, bg_lab[:, :, 2], opaque, strength, max_delta=_L_MAX_DELTA
        )
        diag["tempAdj"] = round(b_shift, 4)

    # ── Reconstruct LAB and back to RGB ────────────────────────────────────────
    result_lab_uint8 = np.clip(
        np.stack([result_L, result_A, result_B], axis=-1), 0, 255
    ).astype(np.uint8)

    # Optional ONNX refinement
    mode_used = "algorithm"
    if use_neural:
        neural_lab = _try_neural(result_lab_uint8, bg_lab.astype(np.uint8), alpha)
        if neural_lab is not None:
            result_lab_uint8 = neural_lab
            mode_used = "neural"

    result_rgb = cv2.cvtColor(
        cv2.cvtColor(result_lab_uint8, cv2.COLOR_LAB2BGR), cv2.COLOR_BGR2RGB
    )

    # Reconstruct RGBA (original alpha preserved exactly)
    result_rgba = np.dstack([result_rgb, alpha])
    Image.fromarray(result_rgba.astype(np.uint8)).save(output_path, format="PNG")

    # ── Optional contact shadow ────────────────────────────────────────────────
    shadow_info: dict = {}
    shadow_output_path = options.get("shadowOutputPath")
    if options.get("addShadow") and shadow_output_path:
        try:
            shadow_rgba = create_contact_shadow(alpha, options)
            Image.fromarray(shadow_rgba).save(shadow_output_path, format="PNG")
            shadow_info = {"ok": True}
        except Exception as exc:
            shadow_info = {"ok": False, "error": str(exc)}

    result: dict = {"ok": True, "diagnostics": diag, "mode": mode_used}
    if shadow_info:
        result["shadow"] = shadow_info
    return result


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--layer-path", required=True)
    parser.add_argument("--bg-path", required=True)
    parser.add_argument("--bbox", required=True)
    parser.add_argument("--options", default="{}")
    parser.add_argument("--output-path", required=True)
    args = parser.parse_args()

    try:
        result = harmonize(
            args.layer_path,
            args.bg_path,
            json.loads(args.bbox),
            json.loads(args.options),
            args.output_path,
        )
    except Exception:
        result = {"ok": False, "error": traceback.format_exc()}

    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

"""Color/ICC pass for the Advanced Print Engine.

Applies an OutputPreset's tonal adjustments and, when SPP manages color, a real ICC transform
(sRGB -> printer profile) via littleCMS (PIL.ImageCms). The single most important rule: when the
*printer* manages color we must NOT apply an ICC transform, to avoid double correction.

Called from the smart-selection sidecar via the `advanced_print_color` method.
"""

from __future__ import annotations

import os
import tempfile
from typing import Any

from PIL import Image, ImageEnhance


_INTENT_MAP = {
    "perceptual": 0,
    "relative-colorimetric": 1,
    "saturation": 2,
    "absolute-colorimetric": 3,
}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _apply_temperature(image: Image.Image, temperature: float) -> Image.Image:
    """Shift warm/cool. temperature in roughly [-30, 30]; positive = warmer."""
    if abs(temperature) < 0.01:
        return image
    img = image.convert("RGB")
    r, g, b = img.split()
    factor = temperature / 100.0  # gentle
    r = r.point(lambda i: _clamp(i * (1 + factor), 0, 255))
    b = b.point(lambda i: _clamp(i * (1 - factor), 0, 255))
    return Image.merge("RGB", (r, g, b))


def _apply_gamma(image: Image.Image, gamma: float) -> Image.Image:
    if abs(gamma - 1.0) < 0.001 or gamma <= 0:
        return image
    inv = 1.0 / gamma
    lut = [int(_clamp((i / 255.0) ** inv * 255.0, 0, 255)) for i in range(256)]
    img = image.convert("RGB")
    return img.point(lut * 3)


def _apply_adjustments(image: Image.Image, preset: dict[str, Any]) -> Image.Image:
    """Applies brightness/contrast/saturation/temperature/gamma/sharpness from an OutputPreset.

    Slider values are centered at 0 (gamma at 1). Scales are gentle and print-oriented.
    """
    img = image.convert("RGB")

    brightness = float(preset.get("brightness", 0) or 0)
    contrast = float(preset.get("contrast", 0) or 0)
    saturation = float(preset.get("saturation", 0) or 0)
    temperature = float(preset.get("temperature", 0) or 0)
    gamma = float(preset.get("gamma", 1) or 1)
    vibrance = float(preset.get("vibrance", 0) or 0)
    sharpness = float(preset.get("sharpness", 0) or 0)

    if brightness:
        img = ImageEnhance.Brightness(img).enhance(1 + brightness / 100.0)
    if contrast:
        img = ImageEnhance.Contrast(img).enhance(1 + contrast / 100.0)
    # Vibrance folded into saturation for V1 (a true vibrance needs per-pixel weighting).
    sat = saturation + 0.5 * vibrance
    if sat:
        img = ImageEnhance.Color(img).enhance(1 + sat / 100.0)
    img = _apply_temperature(img, temperature)
    img = _apply_gamma(img, gamma)
    if sharpness:
        img = ImageEnhance.Sharpness(img).enhance(1 + sharpness / 100.0)
    return img


def _apply_icc(image: Image.Image, icc_profile_path: str, rendering_intent: str, bpc: bool) -> Image.Image:
    """Transforms sRGB -> printer ICC profile using littleCMS. Returns the original on failure."""
    try:
        from PIL import ImageCms
    except Exception:
        return image
    if not icc_profile_path or not os.path.exists(icc_profile_path):
        return image
    try:
        src = ImageCms.createProfile("sRGB")
        dst = ImageCms.getOpenProfile(icc_profile_path)
        intent = _INTENT_MAP.get(rendering_intent, 1)
        flags = 0
        try:
            if bpc:
                flags |= ImageCms.FLAGS.get("BLACKPOINTCOMPENSATION", 0) if isinstance(ImageCms.FLAGS, dict) else 0
        except Exception:
            flags = 0
        transform = ImageCms.buildTransform(
            src, dst, "RGB", "RGB", renderingIntent=intent, flags=flags
        )
        return ImageCms.applyTransform(image.convert("RGB"), transform)
    except Exception:
        # ICC transform is best-effort in V1: never block printing on a profile error.
        return image


def advanced_print_color(params: dict[str, Any]) -> dict[str, Any]:
    """Entry point. Applies adjustments and (optionally) an ICC transform; writes a PNG.

    params:
      input_path:        path to the rendered bitmap
      output_path:       optional target path (else a temp file)
      preset:            OutputPreset dict (adjustments)
      color_mode:        "app-manages-color" | "printer-manages-color" | "none"
      apply_icc:         bool — only honored when color_mode == app-manages-color
      icc_profile_path:  printer ICC profile path
      rendering_intent:  one of perceptual/relative-colorimetric/saturation/absolute-colorimetric
      black_point_compensation: bool
    """
    input_path = str(params["input_path"])
    preset = dict(params.get("preset") or {})
    color_mode = str(params.get("color_mode") or "printer-manages-color")
    apply_icc = bool(params.get("apply_icc")) and color_mode == "app-manages-color"
    icc_profile_path = str(params.get("icc_profile_path") or "")
    rendering_intent = str(params.get("rendering_intent") or "relative-colorimetric")
    bpc = bool(params.get("black_point_compensation", True))
    preview_max_px = params.get("preview_max_px")

    image = Image.open(input_path)
    # For a fast on-screen preview, downscale first — the color math is identical, just cheaper.
    if preview_max_px:
        try:
            image.thumbnail((int(preview_max_px), int(preview_max_px)))
        except Exception:
            pass
    image = _apply_adjustments(image, preset)
    if apply_icc:
        image = _apply_icc(image, icc_profile_path, rendering_intent, bpc)

    output_path = params.get("output_path")
    if not output_path:
        fd, output_path = tempfile.mkstemp(suffix="_ape_color.png")
        os.close(fd)
    image.save(output_path, "PNG")

    return {
        "outputPath": output_path,
        "appliedIcc": apply_icc,
        "colorMode": color_mode,
    }

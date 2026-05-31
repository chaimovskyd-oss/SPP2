#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from PIL import Image


def safe_filename(value: str, fallback: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", value).strip(" .")
    return cleaned[:80] or fallback


def layer_opacity(layer: Any) -> float:
    opacity = getattr(layer, "opacity", None)
    if opacity is None:
        return 1.0
    try:
        numeric = float(opacity)
    except Exception:
        return 1.0
    if numeric > 1:
        numeric = numeric / 255.0
    return max(0.0, min(1.0, numeric))


def is_group(layer: Any) -> bool:
    try:
        return bool(layer.is_group())
    except Exception:
        return False


def is_text_layer(layer: Any) -> bool:
    try:
        from psd_tools.api.layers import TypeLayer

        return isinstance(layer, TypeLayer)
    except Exception:
        return hasattr(layer, "text") and getattr(layer, "text") is not None


def is_adjustment_layer(layer: Any) -> bool:
    try:
        from psd_tools.api.layers import AdjustmentLayer

        return isinstance(layer, AdjustmentLayer)
    except Exception:
        return layer.__class__.__name__ in {
            "BrightnessContrast",
            "Exposure",
            "HueSaturation",
            "BlackAndWhite",
            "Invert",
            "Levels",
        }


def json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    return str(value)


def find_first_key(value: Any, keys: set[str]) -> Any:
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key) in keys:
                return item
        for item in value.values():
            found = find_first_key(item, keys)
            if found is not None:
                return found
    elif isinstance(value, (list, tuple)):
        for item in value:
            found = find_first_key(item, keys)
            if found is not None:
                return found
    return None


def number_or_none(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except Exception:
        return None


def extract_fill_color(value: Any) -> str | None:
    raw = find_first_key(value, {"FillColor", "fillColor", "Color"})
    if raw is None:
        return None
    if isinstance(raw, dict):
        values = raw.get("Values") or raw.get("values")
        if isinstance(values, (list, tuple)) and len(values) >= 4:
            nums = [number_or_none(item) for item in values]
            if all(item is not None for item in nums[:4]):
                # Photoshop often stores CMYK-ish 0..1 values here. For RGB documents,
                # the final three channels are commonly usable enough as a fallback.
                channels = nums[-3:]
                rgb = [max(0, min(255, round(float(channel) * 255 if float(channel) <= 1 else float(channel)))) for channel in channels]
                return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"
    return None


def extract_text_metadata(layer: Any) -> dict[str, Any] | None:
    if not is_text_layer(layer):
        return None
    warnings: list[str] = []
    try:
        text = str(getattr(layer, "text", "") or "")
    except Exception as exc:
        text = ""
        warnings.append(f"Could not read text content: {exc}")
    try:
        font_names = list(getattr(layer, "font_names", []) or [])
    except Exception:
        font_names = []
    try:
        engine_dict = json_safe(getattr(layer, "engine_dict", {}) or {})
    except Exception as exc:
        engine_dict = {}
        warnings.append(f"Could not read text engine data: {exc}")
    font_size = number_or_none(find_first_key(engine_dict, {"FontSize", "fontSize"}))
    color = extract_fill_color(engine_dict)
    transform = json_safe(getattr(layer, "transform", None))
    warp = json_safe(getattr(layer, "warp", None))
    if warp not in (None, {}, []):
        warnings.append("Photoshop text warp is preserved only in the raster preview.")
    return {
        "kind": "text",
        "text": text,
        "fontNames": font_names,
        "fontSize": font_size,
        "color": color,
        "transform": transform,
        "warnings": warnings,
    }


def psd_blend_mode(layer: Any) -> str:
    raw = getattr(layer, "blend_mode", None)
    value = str(getattr(raw, "value", raw) or "normal").lower()
    table = {
        "b'norm'": "normal",
        "b'mul '": "multiply",
        "b'scrn'": "screen",
        "b'over'": "overlay",
        "b'dark'": "darken",
        "b'lite'": "lighten",
        "normal": "normal",
        "multiply": "multiply",
        "screen": "screen",
        "overlay": "overlay",
        "darken": "darken",
        "lighten": "lighten",
    }
    return table.get(value, "normal")


def numeric_attr(layer: Any, name: str, fallback: float) -> float:
    value = getattr(layer, name, fallback)
    numeric = number_or_none(value)
    return fallback if numeric is None else numeric


def first_numbers(value: Any, limit: int) -> list[float]:
    out: list[float] = []

    def visit(item: Any) -> None:
        if len(out) >= limit:
            return
        numeric = number_or_none(item)
        if numeric is not None:
            out.append(numeric)
            return
        if isinstance(item, dict):
            for child in item.values():
                visit(child)
        elif isinstance(item, (list, tuple)):
            for child in item:
                visit(child)
        elif hasattr(item, "__dict__"):
            visit(vars(item))

    visit(value)
    return out


def extract_adjustment_metadata(layer: Any) -> dict[str, Any]:
    class_name = layer.__class__.__name__
    warnings: list[str] = []
    operation: dict[str, Any] | None = None

    if class_name == "BrightnessContrast":
      operation = {
          "type": "brightnessContrast",
          "brightness": numeric_attr(layer, "brightness", 0),
          "contrast": numeric_attr(layer, "contrast", 0),
      }
    elif class_name == "Exposure":
      operation = {
          "type": "exposure",
          "exposure": numeric_attr(layer, "exposure", 0),
          "gamma": max(0.1, numeric_attr(layer, "gamma", 1)),
          "offset": numeric_attr(layer, "exposure_offset", 0),
      }
    elif class_name == "HueSaturation":
      values = first_numbers(getattr(layer, "master", None), 3)
      operation = {
          "type": "hueSaturation",
          "hue": values[0] if len(values) > 0 else 0,
          "saturation": values[1] if len(values) > 1 else 0,
          "lightness": values[2] if len(values) > 2 else 0,
      }
    elif class_name == "BlackAndWhite":
      operation = {"type": "blackWhite", "enabled": True}
    elif class_name == "Invert":
      operation = {"type": "invert", "enabled": True}
    elif class_name == "Levels":
      master = getattr(layer, "master", None)
      operation = {
          "type": "levels",
          "black": numeric_attr(master, "input_floor", 0) if master is not None else 0,
          "mid": max(0.1, numeric_attr(master, "gamma", 1)) if master is not None else 1,
          "white": numeric_attr(master, "input_ceiling", 255) if master is not None else 255,
      }
    else:
      warnings.append(f'Unsupported PSD adjustment layer "{class_name}" was preserved as a warning and not rasterized.')

    return {
        "kind": "adjustment",
        "psdAdjustmentType": class_name,
        "supported": operation is not None,
        "operation": operation,
        "raw": json_safe(getattr(layer, "_data", None)),
        "warnings": warnings,
    }


def bbox_to_rect(layer: Any) -> tuple[int, int, int, int] | None:
    bbox = getattr(layer, "bbox", None)
    if bbox is None:
        return None
    try:
        left, top, right, bottom = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
    except Exception:
        return None
    width = max(0, right - left)
    height = max(0, bottom - top)
    if width <= 0 or height <= 0:
        return None
    return left, top, width, height


def render_layer(layer: Any) -> Image.Image | None:
    image = None
    try:
        image = layer.composite()
    except Exception:
        try:
            image = layer.topil()
        except Exception:
            image = None
    if image is None:
        return None
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    if image.width <= 0 or image.height <= 0:
        return None
    return image


def traverse_layers(layer_container: Any, group_path: list[str], out_dir: Path, warnings: list[str]) -> list[dict[str, Any]]:
    exported: list[dict[str, Any]] = []
    children = list(layer_container)
    for index, layer in enumerate(children):
        name = str(getattr(layer, "name", "") or f"Layer {index + 1}")
        layer_warnings: list[str] = []
        visible = bool(getattr(layer, "visible", True))

        if is_group(layer):
            exported.extend(traverse_layers(layer, [*group_path, name], out_dir, warnings))
            continue

        if is_adjustment_layer(layer):
            adjustment = extract_adjustment_metadata(layer)
            layer_warnings.extend(adjustment.get("warnings", []))
            if not adjustment.get("supported", False):
                warnings.extend(layer_warnings)
            rect = bbox_to_rect(layer) or (0, 0, 1, 1)
            x, y, width, height = rect
            exported.append(
                {
                    "id": str(uuid.uuid4()),
                    "name": name,
                    "groupPath": group_path,
                    "x": x,
                    "y": y,
                    "width": int(width),
                    "height": int(height),
                    "opacity": layer_opacity(layer),
                    "visible": visible,
                    "blendMode": psd_blend_mode(layer),
                    "clipping": bool(getattr(layer, "clipping", False)),
                    "warnings": layer_warnings,
                    "adjustment": adjustment,
                }
            )
            continue

        rect = bbox_to_rect(layer)
        if rect is None:
            warning = f'Skipped "{name}": empty or unreadable bounding box.'
            warnings.append(warning)
            continue

        image = render_layer(layer)
        if image is None:
            warning = f'Skipped "{name}": layer could not be rendered.'
            warnings.append(warning)
            continue

        x, y, width, height = rect
        if image.width != width or image.height != height:
            layer_warnings.append(
                f"Rendered size {image.width}x{image.height} differs from bbox {width}x{height}."
            )
            width, height = image.width, image.height

        layer_id = str(uuid.uuid4())
        filename = f"{len(exported):04d}_{safe_filename(name, 'layer')}_{layer_id[:8]}.png"
        png_path = out_dir / filename
        try:
            image.save(png_path, "PNG")
        except Exception as exc:
            warning = f'Skipped "{name}": failed to write PNG ({exc}).'
            warnings.append(warning)
            continue

        exported.append(
            {
                "id": layer_id,
                "name": name,
                "groupPath": group_path,
                "pngPath": str(png_path),
                "x": x,
                "y": y,
                "width": int(width),
                "height": int(height),
                "opacity": layer_opacity(layer),
                "visible": visible,
                "blendMode": psd_blend_mode(layer),
                "warnings": layer_warnings,
                **({"text": extract_text_metadata(layer)} if is_text_layer(layer) else {}),
            }
        )
    return exported


def import_psd(input_path: Path, output_dir: Path) -> dict[str, Any]:
    warnings: list[str] = []
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        from psd_tools import PSDImage
    except Exception as exc:
        return {
            "type": "psd-import",
            "canvas": {"width": 0, "height": 0},
            "layers": [],
            "warnings": [f"psd-tools is not available: {exc}"],
            "error": "PSD import dependencies are missing.",
        }

    try:
        psd = PSDImage.open(input_path)
    except Exception as exc:
        return {
            "type": "psd-import",
            "canvas": {"width": 0, "height": 0},
            "layers": [],
            "warnings": [f"Failed to open PSD: {exc}"],
            "error": "PSD file could not be opened.",
        }

    width = int(getattr(psd, "width", 0) or 0)
    height = int(getattr(psd, "height", 0) or 0)
    layers = traverse_layers(psd, [], output_dir, warnings)
    return {
        "type": "psd-import",
        "canvas": {"width": width, "height": height},
        "layers": layers,
        "warnings": warnings,
    }


def log(message: str, **fields: Any) -> None:
    record = {"ts": time.time(), "message": message, **fields}
    print(json.dumps(record, ensure_ascii=False), file=sys.stderr, flush=True)
    logs_dir = os.environ.get("SPP2_LOGS_DIR")
    if not logs_dir:
        return
    try:
        path = Path(logs_dir) / "psd-import.log"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Import PSD/PSB layers into transparent PNGs.")
    parser.add_argument("--input", required=True, help="PSD/PSB file path")
    parser.add_argument("--output-dir", required=True, help="Directory for exported layer PNG files")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    log("psd import start", input=str(input_path), output_dir=str(output_dir))
    manifest = import_psd(input_path, output_dir)
    log(
        "psd import end",
        input=str(input_path),
        layers=len(manifest.get("layers", [])),
        warnings=len(manifest.get("warnings", [])),
        error=manifest.get("error"),
    )
    print(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), flush=True)
    return 1 if manifest.get("error") and not manifest.get("layers") else 0


if __name__ == "__main__":
    raise SystemExit(main())

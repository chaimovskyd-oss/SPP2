from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "image.editor.engine"))

from smart_selection.inpaint_service import InpaintService  # noqa: E402


def main() -> int:
    out_root = Path("tmp/lama-benchmark") / time.strftime("%Y%m%d-%H%M%S")
    out_root.mkdir(parents=True, exist_ok=True)
    service = InpaintService()
    summaries = []
    for name, image, mask in [
        make_text_case(),
        make_logo_case(),
        make_watermark_case(),
    ]:
        case_dir = out_root / name
        case_dir.mkdir(parents=True, exist_ok=True)
        image.save(case_dir / "00_input.png")
        Image.fromarray(mask, mode="L").save(case_dir / "01_mask.png")
        result = service.inpaint(image, mask, {
            "targetWidth": image.width,
            "targetHeight": image.height,
            "debug": True,
            "debugDir": str(case_dir / "debug"),
        })
        data = result.to_json()
        patch = Image.open(__import__("io").BytesIO(__import__("base64").b64decode(data["patchPngBase64"]))).convert("RGBA")
        final = image.convert("RGBA")
        roi = data["roi"]
        final.alpha_composite(patch, (roi["x"], roi["y"]))
        final.save(case_dir / "02_final.png")
        (case_dir / "metadata.json").write_text(json.dumps({k: v for k, v in data.items() if k != "patchPngBase64"}, indent=2), encoding="utf-8")
        summaries.append({
            "case": name,
            "backendUsed": data["backendUsed"],
            "fallback": data["fallback"],
            "processingMs": data["processingMs"],
            "roi": data["roi"],
            "debugDir": data.get("debugDir"),
        })
        print(f"{name}: backendUsed={data['backendUsed']} fallback={data['fallback']} processingMs={data['processingMs']}")
    (out_root / "summary.json").write_text(json.dumps(summaries, indent=2), encoding="utf-8")
    print(f"benchmarkDir={out_root}")
    return 0


def make_text_case() -> tuple[str, Image.Image, np.ndarray]:
    image = Image.new("RGB", (900, 520), (191, 190, 184))
    draw = ImageDraw.Draw(image)
    for y in range(0, image.height, 8):
        shade = 184 + (y % 32)
        draw.line((0, y, image.width, y), fill=(shade, shade, shade - 4))
    draw.text((330, 240), "SALE 50%", fill=(8, 8, 8))
    mask = np.zeros((image.height, image.width), dtype=np.uint8)
    mask[226:282, 318:452] = 255
    return "text_on_plain_wall", image, mask


def make_logo_case() -> tuple[str, Image.Image, np.ndarray]:
    image = Image.new("RGB", (720, 420), (94, 151, 176))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((300, 170, 420, 250), radius=12, fill=(245, 245, 245))
    draw.text((326, 199), "LOGO", fill=(10, 10, 10))
    mask = np.zeros((image.height, image.width), dtype=np.uint8)
    mask[160:260, 290:430] = 255
    return "small_logo_flat_color", image, mask


def make_watermark_case() -> tuple[str, Image.Image, np.ndarray]:
    base = Image.new("RGBA", (820, 480), (160, 174, 164, 255))
    draw = ImageDraw.Draw(base)
    for x in range(0, base.width, 22):
        draw.line((x, 0, x + 160, base.height), fill=(148, 160, 152, 70), width=2)
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.text((300, 220), "WATERMARK", fill=(255, 255, 255, 105))
    image = Image.alpha_composite(base, overlay).convert("RGB")
    mask = np.zeros((image.height, image.width), dtype=np.uint8)
    mask[205:268, 288:485] = 255
    return "semi_transparent_watermark", image, mask


if __name__ == "__main__":
    raise SystemExit(main())

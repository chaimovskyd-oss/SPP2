from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test simple-lama-inpainting outside SPP2.")
    parser.add_argument("--output-dir", default="tmp/lama-smoke", help="Directory for input/mask/output artifacts.")
    parser.add_argument("--device", default="", help="Optional torch device, for example cuda or cpu.")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    started = time.time()
    import torch
    from simple_lama_inpainting import SimpleLama

    device = torch.device(args.device or ("cuda" if torch.cuda.is_available() else "cpu"))

    image = Image.new("RGB", (640, 360), (188, 188, 182))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 639, 359), outline=(178, 178, 172), width=2)
    draw.text((245, 160), "REMOVE", fill=(5, 5, 5))

    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rectangle((235, 148, 360, 195), fill=255)

    image_path = output_dir / "00_input.png"
    mask_path = output_dir / "01_mask.png"
    output_path = output_dir / "02_lama_output.png"
    metadata_path = output_dir / "metadata.json"

    image.save(image_path)
    mask.save(mask_path)

    model = SimpleLama(device=device)
    result = model(image, mask)
    result.save(output_path)

    metadata = {
        "backendAttempted": "simple-lama-inpainting",
        "backendUsed": "lama",
        "model": "big-lama.pt",
        "device": str(device),
        "torchVersion": torch.__version__,
        "cudaAvailable": torch.cuda.is_available(),
        "lamaModelEnv": os.environ.get("LAMA_MODEL"),
        "lamaModelUrlEnv": os.environ.get("LAMA_MODEL_URL"),
        "processingSeconds": round(time.time() - started, 3),
        "input": str(image_path),
        "mask": str(mask_path),
        "output": str(output_path),
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print("backendUsed=lama")
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

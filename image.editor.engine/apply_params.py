#!/usr/bin/env python
"""
Headless image processor for SPP2.

Usage:
    python apply_params.py --input <path> --output <path> --params <json_string>

Exit codes:
    0 — success
    1 — failure
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Headless image processor for SPP2")
    parser.add_argument("--input", required=True, help="Input image path")
    parser.add_argument("--output", required=True, help="Output image path")
    parser.add_argument("--params", required=True, help="Edit params as JSON string")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"[apply_params] Input not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        params = json.loads(args.params)
    except json.JSONDecodeError as exc:
        print(f"[apply_params] Invalid params JSON: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        from smart_image_editor.core.adjustment_pipeline import load_image
        from smart_image_editor.core.export_service import export_image

        image = load_image(str(input_path))

        # Important:
        # export_image already calls apply_adjustments internally.
        # Do not call apply_adjustments here, otherwise every edit is applied twice.
        export_image(image, params, output_path, save_sidecar=False)

        if not output_path.exists():
            print(f"[apply_params] Output was not created: {output_path}", file=sys.stderr)
            sys.exit(1)

        print(f"[apply_params] Saved to {output_path}")
        sys.exit(0)

    except Exception as exc:
        print(f"[apply_params] Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
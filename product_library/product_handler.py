"""
CLI entry point for Product Library IPC calls from Electron main process.

Called by electron/main.cjs with cwd=product_library/ and PYTHONPATH including
product_library/, so `import pl_storage` resolves without any path manipulation.

Exit codes:
  0  — success (JSON written to stdout)
  1  — error   (traceback + {"error": "..."} written to stderr)

Usage:
  python product_handler.py --action get-all
  python product_handler.py --action save-one --input /tmp/product.json
  python product_handler.py --action upload-mask --product-id abc123 --mask-file /tmp/mask.png --file-name mask.png
  python product_handler.py --action reload-one --product-id abc123
"""

import argparse
import json
import os
import sys

from product_library import pl_storage  # run via: python -m product_library.product_handler


# ── Actions ───────────────────────────────────────────────────────────────────

def action_get_all():
    products = pl_storage.get_all_products()
    print(json.dumps(products, ensure_ascii=False))


def action_save_one(args):
    if not args.input:
        raise ValueError("--input is required for save-one")
    if not os.path.isfile(args.input):
        raise FileNotFoundError(f"Input file not found: {args.input}")
    with open(args.input, "r", encoding="utf-8") as fh:
        product_dict = json.load(fh)
    pl_storage.save_product(product_dict)
    print(json.dumps({"success": True}))


def action_upload_mask(args):
    if not args.product_id:
        raise ValueError("--product-id is required for upload-mask")
    if not args.mask_file:
        raise ValueError("--mask-file is required for upload-mask")
    if not os.path.isfile(args.mask_file):
        raise FileNotFoundError(f"Mask file not found: {args.mask_file}")
    # Electron already decoded base64 → temp file; just copy it to the library.
    rel_path = pl_storage.copy_mask_to_library(args.mask_file, args.product_id)
    print(json.dumps({"path": rel_path}))


def action_reload_one(args):
    if not args.product_id:
        raise ValueError("--product-id is required for reload-one")
    product_dict = pl_storage.reload_product(args.product_id)
    # JSON null when not found; product dict otherwise
    print(json.dumps(product_dict, ensure_ascii=False))


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SPP2 Product Library IPC handler")
    parser.add_argument(
        "--action", required=True,
        choices=["get-all", "save-one", "upload-mask", "reload-one"]
    )
    parser.add_argument("--input",      help="Path to input JSON file (save-one)")
    parser.add_argument("--product-id", dest="product_id", help="Product ID")
    parser.add_argument("--mask-file",  dest="mask_file",  help="Path to decoded mask file (upload-mask)")
    parser.add_argument("--file-name",  dest="file_name",  help="Original filename (upload-mask)")
    args = parser.parse_args()

    dispatch = {
        "get-all":      lambda: action_get_all(),
        "save-one":     lambda: action_save_one(args),
        "upload-mask":  lambda: action_upload_mask(args),
        "reload-one":   lambda: action_reload_one(args),
    }
    dispatch[args.action]()


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except Exception as exc:
        import traceback
        traceback.print_exc(file=sys.stderr)
        # Also emit a JSON error line so the Node side can surface a readable message
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)

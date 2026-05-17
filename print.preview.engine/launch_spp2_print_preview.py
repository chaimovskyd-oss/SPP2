from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from types import SimpleNamespace

from PySide6.QtWidgets import QApplication, QMessageBox

from print_preview.controller.print_preview_controller import PrintPreviewController
from print_preview.ui.main_window import PrintPreviewWindow
from spp2_rendered_image_adapter import SPP2MultiPageAdapter, SPP2RenderedImageAdapter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Open SPP2 rendered page(s) in the Python Print Preview module.")
    # ── Single-page mode (original) ───────────────────────────────────────────
    parser.add_argument("--file", default=None, help="Single rendered PNG/JPEG file path from SPP2")
    parser.add_argument("--document-name", default="SPP2 Document")
    parser.add_argument("--page-name", default="Page 1")
    parser.add_argument("--width-mm", type=float, default=None)
    parser.add_argument("--height-mm", type=float, default=None)
    parser.add_argument("--width-px", type=int, default=0)
    parser.add_argument("--height-px", type=int, default=0)
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--mime-type", default="image/png")
    parser.add_argument("--orientation", choices=["portrait", "landscape", "auto"], default="auto")
    # ── Multi-page manifest mode ───────────────────────────────────────────────
    parser.add_argument(
        "--manifest",
        default=None,
        help="Path to a JSON manifest file for multi-page printing (overrides --file and friends)",
    )
    return parser.parse_args()


def _resolve_orientation(width_mm: float, height_mm: float, hint: str) -> str:
    if hint in ("portrait", "landscape"):
        return hint
    return "landscape" if width_mm >= height_mm else "portrait"


def main_singlepage(args: argparse.Namespace) -> int:
    """Original single-page flow — unchanged behaviour."""
    if not args.file:
        print("Error: --file is required in single-page mode.", file=sys.stderr)
        return 2
    if not args.width_mm or not args.height_mm:
        print("Error: --width-mm and --height-mm are required.", file=sys.stderr)
        return 2

    image_path = Path(args.file)
    if not image_path.exists():
        print(f"Rendered file not found: {image_path}", file=sys.stderr)
        return 2

    app = QApplication.instance() or QApplication(sys.argv)

    try:
        adapter = SPP2RenderedImageAdapter(
            image_path=image_path,
            width_mm=args.width_mm,
            height_mm=args.height_mm,
            dpi=args.dpi,
        )
        controller = PrintPreviewController(adapter)
        orientation = _resolve_orientation(args.width_mm, args.height_mm, args.orientation)
        page = SimpleNamespace(
            name=args.page_name,
            document_name=args.document_name,
            width_mm=args.width_mm,
            height_mm=args.height_mm,
            width_px=args.width_px,
            height_px=args.height_px,
            dpi=args.dpi,
            source_file=str(image_path),
            orientation=orientation,
        )
        controller.set_page(page)
        controller.set_dpi(args.dpi)
        controller.set_output_orientation(orientation)

        window = PrintPreviewWindow(controller)
        window.setWindowTitle(f"SPP2 תצוגת הדפסה — {args.document_name}")
        window.show()
        return int(app.exec())
    except Exception as exc:
        QMessageBox.critical(None, "SPP2 תצוגת הדפסה", str(exc))
        print(str(exc), file=sys.stderr)
        return 1


def main_multipage(args: argparse.Namespace) -> int:
    """Multi-page flow: reads a JSON manifest and opens all pages in one preview window."""
    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        print(f"Manifest file not found: {manifest_path}", file=sys.stderr)
        return 2

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Failed to parse manifest: {exc}", file=sys.stderr)
        return 2

    document_name = manifest.get("document_name", "SPP2 Document")
    raw_pages = manifest.get("pages", [])

    if not raw_pages:
        print("Manifest contains no pages.", file=sys.stderr)
        return 2

    # Validate all image files exist before starting the UI
    pages_data = []
    for i, raw in enumerate(raw_pages):
        img_path = Path(raw.get("image_path", ""))
        if not img_path.exists():
            print(f"Page {i + 1} image not found: {img_path}", file=sys.stderr)
            return 2
        pages_data.append({
            "image_path": img_path,
            "width_mm":   float(raw.get("width_mm", 210)),
            "height_mm":  float(raw.get("height_mm", 297)),
            "dpi":        int(raw.get("dpi", 300)),
        })

    app = QApplication.instance() or QApplication(sys.argv)

    try:
        adapter = SPP2MultiPageAdapter(pages_data)
        controller = PrintPreviewController(adapter)

        # Build page objects with _spp2_page_index so the adapter can look them up
        pages = []
        default_dpi = pages_data[0]["dpi"] if pages_data else 300
        for i, (raw, data) in enumerate(zip(raw_pages, pages_data)):
            w_mm = data["width_mm"]
            h_mm = data["height_mm"]
            orientation = _resolve_orientation(w_mm, h_mm, raw.get("orientation", "auto"))
            page = SimpleNamespace(
                _spp2_page_index=i,
                name=raw.get("page_name", f"עמוד {i + 1}"),
                document_name=document_name,
                width_mm=w_mm,
                height_mm=h_mm,
                dpi=data["dpi"],
                source_file=str(data["image_path"]),
                orientation=orientation,
            )
            pages.append(page)

        controller.set_pages(pages, index=0)
        controller.set_dpi(default_dpi)
        controller.set_output_orientation(pages[0].orientation if pages else "portrait")

        window = PrintPreviewWindow(controller)
        window.setWindowTitle(f"SPP2 תצוגת הדפסה — {document_name}  ({len(pages)} עמודים)")
        window.show()
        return int(app.exec())
    except Exception as exc:
        QMessageBox.critical(None, "SPP2 תצוגת הדפסה", str(exc))
        print(str(exc), file=sys.stderr)
        return 1


def main() -> int:
    args = parse_args()
    if args.manifest:
        return main_multipage(args)
    return main_singlepage(args)


if __name__ == "__main__":
    raise SystemExit(main())

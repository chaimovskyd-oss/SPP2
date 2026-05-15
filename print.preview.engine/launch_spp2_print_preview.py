from __future__ import annotations

import argparse
import sys
from pathlib import Path
from types import SimpleNamespace

from PySide6.QtWidgets import QApplication, QMessageBox

from print_preview.controller.print_preview_controller import PrintPreviewController
from print_preview.ui.main_window import PrintPreviewWindow
from spp2_rendered_image_adapter import SPP2RenderedImageAdapter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Open SPP2 rendered page in the Python Print Preview module.")
    parser.add_argument("--file", required=True, help="Rendered PNG/JPEG file path from SPP2")
    parser.add_argument("--document-name", default="SPP2 Document")
    parser.add_argument("--page-name", default="Page 1")
    parser.add_argument("--width-mm", type=float, required=True)
    parser.add_argument("--height-mm", type=float, required=True)
    parser.add_argument("--width-px", type=int, default=0)
    parser.add_argument("--height-px", type=int, default=0)
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--mime-type", default="image/png")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
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
        # The original print preview UI expects a page-like object with
        # attributes such as page.width_mm and page.height_mm, not a dict.
        # SimpleNamespace keeps the bridge small while matching that contract.
        page = SimpleNamespace(
            name=args.page_name,
            document_name=args.document_name,
            width_mm=args.width_mm,
            height_mm=args.height_mm,
            width_px=args.width_px,
            height_px=args.height_px,
            dpi=args.dpi,
            source_file=str(image_path),
        )
        controller.set_page(page)
        # Keep output DPI aligned with the SPP2 document by default.
        controller.set_dpi(args.dpi)

        window = PrintPreviewWindow(controller)
        window.setWindowTitle(f"SPP2 Print Preview — {args.document_name}")
        window.show()
        return int(app.exec())
    except Exception as exc:
        QMessageBox.critical(None, "SPP2 Print Preview", str(exc))
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

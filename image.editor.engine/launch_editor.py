#!/usr/bin/env python
"""
CLI entry point for launching the Smart Image Editor from SPP2 (Electron).

Usage:
    python launch_editor.py --input <path> --output <path>

Exit codes:
    0 — user clicked "Apply to Canvas" and image was saved to --output
    1 — user closed the window without saving
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Smart Image Editor — hosted mode")
    parser.add_argument("--input", required=True, help="Input image path")
    parser.add_argument("--output", required=True, help="Output image path (written on Apply)")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"[launch_editor] Input file not found: {input_path}", file=sys.stderr)
        sys.exit(2)

    from PySide6.QtWidgets import QApplication, QPushButton
    from smart_image_editor.ui.editor_window import EditorWindow
    from smart_image_editor.ui.theme import APP_QSS

    app = QApplication(sys.argv)
    app.setStyleSheet(APP_QSS)

    win = _HostedEditorWindow(output_path)
    win.open_image_path(str(input_path))
    win.show()

    app.exec()
    sys.exit(0 if win.applied else 1)


class _HostedEditorWindow:
    """Wraps EditorWindow and injects an 'Apply to Canvas' button."""

    def __init__(self, output_path: Path) -> None:
        from PySide6.QtWidgets import QPushButton
        from smart_image_editor.ui.editor_window import EditorWindow

        self.output_path = output_path
        self.applied = False
        self._win = EditorWindow()

        # Insert "Apply to Canvas" as the first button in the top bar.
        # The top bar is the first QHBoxLayout child of the central widget's QVBoxLayout.
        top_layout = self._win.centralWidget().layout().itemAt(0).layout()
        self._apply_btn = QPushButton("✓ החל על הקנבס")
        self._apply_btn.setObjectName("ApplyToCanvasBtn")
        self._apply_btn.setEnabled(False)
        self._apply_btn.setStyleSheet(
            "QPushButton#ApplyToCanvasBtn { background: #7C6FE0; color: #fff; font-weight: bold;"
            " padding: 4px 14px; border-radius: 5px; }"
            "QPushButton#ApplyToCanvasBtn:disabled { background: #444; color: #888; }"
            "QPushButton#ApplyToCanvasBtn:hover { background: #9480ff; }"
        )
        top_layout.insertWidget(0, self._apply_btn)
        self._apply_btn.clicked.connect(self._apply_and_close)

        # Enable Apply button once an image is loaded
        original_open = self._win.open_image_path

        def _patched_open(path: str) -> None:
            original_open(path)
            self._apply_btn.setEnabled(self._win.original_image is not None)

        self._win.open_image_path = _patched_open  # type: ignore[method-assign]

        # Also hook into adjustment changes to keep Apply enabled
        self._win.setWindowTitle("עורך תמונות חכם — מצב SPP2")

    # Delegate show / close to the inner window
    def show(self) -> None:
        self._win.show()

    @property
    def applied(self) -> bool:
        return self._applied

    @applied.setter
    def applied(self, value: bool) -> None:
        self._applied = value

    def open_image_path(self, path: str) -> None:
        self._win.open_image_path(path)
        self._apply_btn.setEnabled(self._win.original_image is not None)

    def _apply_and_close(self) -> None:
        if self._win.original_image is None:
            return
        try:
            self._win._export_copy(self.output_path, show_message=False)
            self.applied = True
            self._win.close()
        except Exception as exc:
            from PySide6.QtWidgets import QMessageBox
            QMessageBox.critical(self._win, "שגיאת שמירה", str(exc))


if __name__ == "__main__":
    main()

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

from print_preview.adapters.render_adapter import RenderAdapter


class SPP2RenderedImageAdapter(RenderAdapter):
    """RenderAdapter for SPP2.

    SPP2 already renders the Konva canvas to a clean, print-ready raster image.
    This adapter simply gives that image to the Python print-preview module while
    preserving the physical page size supplied by SPP2.
    """

    def __init__(self, image_path: str | Path, width_mm: float, height_mm: float, dpi: int = 300):
        self.image_path = Path(image_path)
        self.width_mm = float(width_mm)
        self.height_mm = float(height_mm)
        self.dpi = int(dpi or 300)
        self._image: Image.Image | None = None

    def _load(self) -> Image.Image:
        if self._image is None:
            image = Image.open(self.image_path)
            # Use RGBA for transparent PNGs and RGB for JPEG-style output.
            self._image = image.convert("RGBA") if image.mode in ("RGBA", "LA", "P") else image.convert("RGB")
        return self._image

    def render_preview_page(self, page: Any, scale: float, settings=None):
        return self._load().copy()

    def render_export_page(self, page: Any, dpi: int, scale: float = 1.0, settings=None):
        image = self._load().copy()
        image.info["dpi"] = (int(dpi or self.dpi), int(dpi or self.dpi))
        return image

    def get_design_page_size_mm(self, page: Any):
        return self.width_mm, self.height_mm

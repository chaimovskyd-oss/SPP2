from __future__ import annotations

import base64
import io
import time
from dataclasses import dataclass
from typing import Any, Callable

import numpy as np
from PIL import Image, ImageFilter


ProgressCallback = Callable[[dict[str, Any]], None]


@dataclass(frozen=True)
class InpaintRoi:
    x: int
    y: int
    width: int
    height: int

    def to_json(self) -> dict[str, int]:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}


@dataclass(frozen=True)
class InpaintResult:
    patch: Image.Image
    roi: InpaintRoi
    image_width: int
    image_height: int
    model_id: str
    model_version: str
    fallback: bool
    message: str
    processing_ms: int

    def to_json(self) -> dict[str, Any]:
        buffer = io.BytesIO()
        self.patch.save(buffer, format="PNG")
        return {
            "ok": True,
            "patchPngBase64": base64.b64encode(buffer.getvalue()).decode("ascii"),
            "roi": self.roi.to_json(),
            "imageWidth": self.image_width,
            "imageHeight": self.image_height,
            "modelId": self.model_id,
            "modelVersion": self.model_version,
            "fallback": self.fallback,
            "message": self.message,
            "processingMs": self.processing_ms,
        }


class InpaintService:
    def __init__(self) -> None:
        self._lama: Any | None = None
        self._lama_failed = False

    def inpaint(
        self,
        image: Image.Image,
        mask: np.ndarray,
        options: dict[str, Any],
        *,
        progress: ProgressCallback | None = None,
    ) -> InpaintResult:
        started = time.time()
        target_width = int(options.get("targetWidth") or image.width)
        target_height = int(options.get("targetHeight") or image.height)
        if target_width <= 0 or target_height <= 0:
            raise RuntimeError("invalid_size")

        image = image.convert("RGB").resize((target_width, target_height), Image.Resampling.LANCZOS)
        mask = normalize_mask(mask, target_width, target_height)
        selected_pixels = int(np.count_nonzero(mask > 128))
        if selected_pixels == 0:
            raise RuntimeError("empty_mask")

        image_pixels = target_width * target_height
        selected_ratio = selected_pixels / max(1, image_pixels)
        if selected_ratio > 0.5:
            raise RuntimeError("selection_too_large")

        emit(progress, "roi", "Preparing selected area...", None)
        bounds = mask_bounds(mask)
        if bounds is None:
            raise RuntimeError("empty_mask")
        x, y, width, height = bounds
        padding = int(options.get("roiPadding") or clamp(round(max(width, height) * 0.35), 64, 384))
        roi = expand_roi(x, y, width, height, padding, target_width, target_height)
        max_patch_pixels = int(options.get("maxPatchPixels") or 6_000_000)
        if roi.width * roi.height > max_patch_pixels or roi.width * roi.height > 8_000_000:
            raise RuntimeError("selection_too_large")

        image_patch = image.crop((roi.x, roi.y, roi.x + roi.width, roi.y + roi.height))
        mask_patch = Image.fromarray(mask[roi.y:roi.y + roi.height, roi.x:roi.x + roi.width], mode="L")
        force_fallback = bool(options.get("forceFallback"))

        model_id = "lama"
        model_version = "simple-lama-inpainting"
        fallback = False
        message = "AI Fill applied."
        emit(progress, "inpaint", "Filling selected area...", None, modelId=model_id)
        try:
            if force_fallback:
                raise RuntimeError("forced fallback")
            inpainted = self._run_lama(image_patch, mask_patch)
        except Exception:
            emit(progress, "inpaint", "Using fast fallback fill...", None, modelId="opencv_telea")
            inpainted = self._run_telea(image_patch, mask_patch)
            model_id = "opencv_telea"
            model_version = "opencv"
            fallback = True
            message = "Fast fallback fill applied."

        emit(progress, "blend", "Blending result...", None, modelId=model_id)
        patch = blend_patch(image_patch.convert("RGBA"), inpainted.convert("RGBA"), mask_patch)
        emit(progress, "ready", message, 100, modelId=model_id)
        return InpaintResult(
            patch=patch,
            roi=roi,
            image_width=target_width,
            image_height=target_height,
            model_id=model_id,
            model_version=model_version,
            fallback=fallback,
            message=message,
            processing_ms=round((time.time() - started) * 1000),
        )

    def _run_lama(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        if self._lama_failed:
            raise RuntimeError("LaMa is unavailable")
        if self._lama is None:
            try:
                from simple_lama_inpainting import SimpleLama  # type: ignore

                self._lama = SimpleLama()
            except Exception as exc:
                self._lama_failed = True
                raise RuntimeError(f"LaMa is unavailable: {exc}") from exc
        return self._lama(image.convert("RGB"), mask.convert("L"))

    def _run_telea(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        import cv2  # type: ignore

        rgb = np.array(image.convert("RGB"), dtype=np.uint8)
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        mask_arr = np.array(mask.convert("L"), dtype=np.uint8)
        _, mask_arr = cv2.threshold(mask_arr, 128, 255, cv2.THRESH_BINARY)
        result = cv2.inpaint(bgr, mask_arr, 3, cv2.INPAINT_TELEA)
        return Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB), mode="RGB")


def emit(progress: ProgressCallback | None, phase: str, message: str, percent: float | None = None, **fields: Any) -> None:
    if progress is None:
        return
    progress({"operation": "inpaint_remove", "phase": phase, "message": message, "percent": percent, **fields})


def normalize_mask(mask: np.ndarray, width: int, height: int) -> np.ndarray:
    arr = np.asarray(mask, dtype=np.uint8)
    if arr.ndim == 3:
        arr = arr[:, :, -1]
    if arr.shape[1] != width or arr.shape[0] != height:
        img = Image.fromarray(arr, mode="L").resize((width, height), Image.Resampling.LANCZOS)
        arr = np.array(img, dtype=np.uint8)
    return arr


def mask_bounds(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask > 128)
    if len(xs) == 0 or len(ys) == 0:
        return None
    min_x = int(xs.min())
    max_x = int(xs.max())
    min_y = int(ys.min())
    max_y = int(ys.max())
    return min_x, min_y, max_x - min_x + 1, max_y - min_y + 1


def expand_roi(x: int, y: int, width: int, height: int, padding: int, image_width: int, image_height: int) -> InpaintRoi:
    left = max(0, x - padding)
    top = max(0, y - padding)
    right = min(image_width, x + width + padding)
    bottom = min(image_height, y + height + padding)
    return InpaintRoi(left, top, max(1, right - left), max(1, bottom - top))


def blend_patch(original: Image.Image, inpainted: Image.Image, mask: Image.Image) -> Image.Image:
    alpha = mask.convert("L").filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(3))
    result = Image.alpha_composite(original, inpainted)
    return Image.composite(result, original, alpha)


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))

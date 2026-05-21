from __future__ import annotations

import base64
import io
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
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
    backend_attempted: str
    fallback_reason: str | None
    backend_device: str | None = None
    model_weights_path: str | None = None
    debug_dir: str | None = None

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
            "backendAttempted": self.backend_attempted,
            "backendUsed": self.model_id,
            "backendDevice": self.backend_device,
            "modelWeightsPath": self.model_weights_path,
            "fallbackReason": self.fallback_reason,
            "debugDir": self.debug_dir,
            "message": self.message,
            "processingMs": self.processing_ms,
        }


class InpaintService:
    def __init__(self) -> None:
        self._lama: Any | None = None
        self._lama_last_error: str | None = None

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

        image = resize_if_needed(image.convert("RGB"), target_width, target_height)
        raw_mask = normalize_mask(mask, target_width, target_height)
        selected_pixels = int(np.count_nonzero(raw_mask > 128))
        if selected_pixels == 0:
            raise RuntimeError("empty_mask")

        image_pixels = target_width * target_height
        selected_ratio = selected_pixels / max(1, image_pixels)
        if selected_ratio > 0.5:
            raise RuntimeError(f"selection_too_large:selected_ratio={selected_ratio:.4f};selected_pixels={selected_pixels};image_pixels={image_pixels}")

        emit(progress, "roi", "Preparing selected area...", None)
        processed_mask, dilation_px = preprocess_mask(raw_mask, options)
        bounds = mask_bounds(processed_mask)
        if bounds is None:
            raise RuntimeError("empty_mask")
        x, y, width, height = bounds
        padding_x, padding_y = compute_padding(width, height, options)
        roi = expand_roi(x, y, width, height, padding_x, padding_y, target_width, target_height, min_size=int(options.get("minRoiSize") or 512))
        max_patch_pixels = int(options.get("maxPatchPixels") or 10_000_000)
        if roi.width * roi.height > max_patch_pixels:
            raise RuntimeError(f"selection_too_large:roi_pixels={roi.width * roi.height};max_patch_pixels={max_patch_pixels};roi={roi.to_json()}")

        image_patch = image.crop((roi.x, roi.y, roi.x + roi.width, roi.y + roi.height))
        mask_patch = Image.fromarray(processed_mask[roi.y:roi.y + roi.height, roi.x:roi.x + roi.width], mode="L")
        raw_mask_patch = Image.fromarray(raw_mask[roi.y:roi.y + roi.height, roi.x:roi.x + roi.width], mode="L")
        force_fallback = bool(options.get("forceFallback"))
        debug = DebugDumper(options, image, raw_mask, processed_mask, roi, dilation_px, (padding_x, padding_y))

        model_id = "lama"
        model_version = "simple-lama-inpainting"
        backend_attempted = "simple-lama-inpainting"
        backend_device: str | None = None
        model_weights_path: str | None = None
        fallback_reason: str | None = None
        fallback = False
        message = "AI Fill: LaMa."
        emit(progress, "inpaint", "Loading LaMa model...", None, modelId=model_id)
        try:
            if force_fallback:
                raise RuntimeError("forced fallback")
            inpainted = self._run_lama(image_patch, mask_patch)
            backend_device = self._lama_device()
            model_weights_path = self._lama_model_path()
        except Exception as exc:
            fallback_reason = str(exc)
            emit(progress, "inpaint", "Using fast fallback fill...", None, modelId="opencv_telea", fallbackReason=fallback_reason)
            inpainted = self._run_telea(image_patch, mask_patch)
            model_id = "opencv_telea"
            model_version = "opencv"
            fallback = True
            message = "Fallback: OpenCV."
            backend_device = "cpu"

        emit(progress, "blend", "Blending result...", None, modelId=model_id)
        patch = blend_patch(image_patch.convert("RGBA"), inpainted.convert("RGBA"), raw_mask_patch, mask_patch)
        debug_dir = debug.save(image_patch, mask_patch, raw_mask_patch, inpainted, patch, {
            "backendAttempted": backend_attempted,
            "backendUsed": model_id,
            "backendDevice": backend_device,
            "modelWeightsPath": model_weights_path,
            "fallbackReason": fallback_reason,
            "roi": roi.to_json(),
            "paddingX": padding_x,
            "paddingY": padding_y,
            "maskDilationPx": dilation_px,
            "selectedRatio": selected_ratio,
            "patchPixels": roi.width * roi.height,
        })
        emit(progress, "ready", message, 100, modelId=model_id, backendUsed=model_id, fallbackReason=fallback_reason)
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
            backend_attempted=backend_attempted,
            fallback_reason=fallback_reason,
            backend_device=backend_device,
            model_weights_path=model_weights_path,
            debug_dir=debug_dir,
        )

    def _run_lama(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        if self._lama is None:
            try:
                import torch  # type: ignore
                from simple_lama_inpainting import SimpleLama  # type: ignore

                if torch.cuda.is_available():
                    torch.backends.cudnn.benchmark = True
                    torch.backends.cuda.matmul.allow_tf32 = True
                    torch.backends.cudnn.allow_tf32 = True
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                self._lama = SimpleLama(device=device)
            except Exception as exc:
                self._lama_last_error = str(exc)
                raise RuntimeError(f"LaMa is unavailable: {exc}") from exc
        return self._lama(image.convert("RGB"), mask.convert("L"))

    def _lama_device(self) -> str | None:
        device = getattr(self._lama, "device", None)
        return None if device is None else str(device)

    def _lama_model_path(self) -> str | None:
        try:
            import simple_lama_inpainting.models.model as lama_model  # type: ignore

            if os.environ.get("LAMA_MODEL"):
                return os.environ.get("LAMA_MODEL")
            return str(lama_model.get_cache_path_by_url(lama_model.LAMA_MODEL_URL))
        except Exception:
            return None

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


def resize_if_needed(image: Image.Image, width: int, height: int) -> Image.Image:
    if image.width == width and image.height == height:
        return image
    return image.resize((width, height), Image.Resampling.LANCZOS)


def compute_padding(width: int, height: int, options: dict[str, Any]) -> tuple[int, int]:
    explicit = options.get("roiPadding")
    if explicit is not None:
        value = int(explicit)
        return value, value
    short_side = max(1, min(width, height))
    pad_x = clamp(round(max(width * 0.75, short_side * 2.0, 96)), 96, 768)
    pad_y = clamp(round(max(height * 1.75, short_side * 2.0, 96)), 96, 768)
    return pad_x, pad_y


def expand_roi(
    x: int,
    y: int,
    width: int,
    height: int,
    padding_x: int,
    padding_y: int,
    image_width: int,
    image_height: int,
    *,
    min_size: int,
) -> InpaintRoi:
    left = max(0, x - padding_x)
    top = max(0, y - padding_y)
    right = min(image_width, x + width + padding_x)
    bottom = min(image_height, y + height + padding_y)
    if right - left < min_size:
        extra = min_size - (right - left)
        left = max(0, left - extra // 2)
        right = min(image_width, right + extra - extra // 2)
    if bottom - top < min_size:
        extra = min_size - (bottom - top)
        top = max(0, top - extra // 2)
        bottom = min(image_height, bottom + extra - extra // 2)
    return InpaintRoi(left, top, max(1, right - left), max(1, bottom - top))


def preprocess_mask(mask: np.ndarray, options: dict[str, Any]) -> tuple[np.ndarray, int]:
    binary = (mask > 128).astype(np.uint8) * 255
    if options.get("maskDilationPx") is not None:
        dilation_px = int(options.get("maskDilationPx") or 0)
    else:
        dilation_px = clamp(round(min(binary.shape[0], binary.shape[1]) * 0.006), 4, 18)
    try:
        import cv2  # type: ignore

        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=1)
        if dilation_px > 0:
            kernel_size = max(3, dilation_px * 2 + 1)
            processed = cv2.dilate(closed, np.ones((kernel_size, kernel_size), np.uint8), iterations=1)
        else:
            processed = closed
        return np.asarray(processed, dtype=np.uint8), dilation_px
    except Exception:
        image = Image.fromarray(binary, mode="L").filter(ImageFilter.MaxFilter(3))
        if dilation_px > 0:
            image = image.filter(ImageFilter.MaxFilter(max(3, dilation_px * 2 + 1)))
        return np.array(image, dtype=np.uint8), dilation_px


def blend_patch(original: Image.Image, inpainted: Image.Image, raw_mask: Image.Image, processed_mask: Image.Image) -> Image.Image:
    if inpainted.size != original.size:
        inpainted = inpainted.resize(original.size, Image.Resampling.LANCZOS)
    alpha = processed_mask.convert("L").filter(ImageFilter.GaussianBlur(3))
    raw_alpha = raw_mask.convert("L").filter(ImageFilter.GaussianBlur(1))
    alpha = Image.fromarray(np.maximum(np.array(alpha, dtype=np.uint8), np.array(raw_alpha, dtype=np.uint8)), mode="L")
    result = Image.alpha_composite(original, inpainted)
    return Image.composite(result, original, alpha)


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


class DebugDumper:
    def __init__(
        self,
        options: dict[str, Any],
        input_image: Image.Image,
        raw_mask: np.ndarray,
        processed_mask: np.ndarray,
        roi: InpaintRoi,
        dilation_px: int,
        padding: tuple[int, int],
    ) -> None:
        enabled = bool(options.get("debug")) or os.environ.get("SPP2_INPAINT_DEBUG") == "1"
        self.dir: Path | None = None
        if enabled:
            configured_dir = options.get("debugDir")
            self.dir = Path(str(configured_dir)) if configured_dir else Path(os.environ.get("SPP2_LOGS_DIR") or ".") / "inpaint-debug" / time.strftime("%Y%m%d-%H%M%S")
            self.dir.mkdir(parents=True, exist_ok=True)
            input_image.save(self.dir / "00_input.png")
            Image.fromarray(raw_mask, mode="L").save(self.dir / "01_mask_raw.png")
            Image.fromarray(processed_mask, mode="L").save(self.dir / "02_mask_processed.png")
            metadata = {"roi": roi.to_json(), "maskDilationPx": dilation_px, "paddingX": padding[0], "paddingY": padding[1]}
            (self.dir / "metadata-initial.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    def save(
        self,
        roi_input: Image.Image,
        mask: Image.Image,
        raw_mask: Image.Image,
        model_output: Image.Image,
        final_patch: Image.Image,
        metadata: dict[str, Any],
    ) -> str | None:
        if self.dir is None:
            return None
        roi_input.save(self.dir / "03_roi_input.png")
        raw_mask.save(self.dir / "04_roi_mask_raw.png")
        mask.save(self.dir / "05_roi_mask_processed.png")
        model_output.save(self.dir / "06_model_output.png")
        final_patch.save(self.dir / "07_final_patch.png")
        (self.dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        return str(self.dir)

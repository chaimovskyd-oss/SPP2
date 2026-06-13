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

_CUDA_AVAILABLE: bool | None = None


def torch_cuda_available() -> bool:
    """Cached check for a CUDA-capable torch build. Safe if torch is missing."""
    global _CUDA_AVAILABLE
    if _CUDA_AVAILABLE is None:
        try:
            import torch  # type: ignore

            _CUDA_AVAILABLE = bool(torch.cuda.is_available())
        except Exception:
            _CUDA_AVAILABLE = False
    return _CUDA_AVAILABLE


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
        self._sd: Any | None = None
        self._texture: Any | None = None

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
        # Object-removal defaults to 0.5; outpainting (Smart Canvas Fill) legitimately
        # masks most of the canvas and passes a higher maxSelectedRatio.
        max_selected_ratio = min(0.98, max(0.05, float(options.get("maxSelectedRatio") or 0.5)))
        if selected_ratio > max_selected_ratio:
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

        roi_max_side = max(roi.width, roi.height)
        requested_engine = resolve_engine(options, selected_ratio, roi_max_side)

        # SD on CPU takes minutes per fill. When SD was auto-selected (not an explicit
        # user choice) and no CUDA-capable torch is present, prefer LaMa — far faster on
        # CPU and still high quality. Explicit engine="sd_inpaint" is always honoured.
        auto_engine = str(options.get("engine") or "auto").lower() in ("", "auto")
        sd_no_accel = False
        if requested_engine == "sd_inpaint" and auto_engine and not force_fallback and not torch_cuda_available():
            emit(
                progress,
                "inpaint",
                "SD CUDA acceleration is unavailable; trying SD anyway. This may be slow.",
                None,
                modelId="sd_inpaint",
                backendDevice="cpu",
            )

        model_id = "lama"
        model_version = "simple-lama-inpainting"
        backend_attempted = requested_engine
        backend_device: str | None = None
        model_weights_path: str | None = None
        fallback_reason: str | None = None
        fallback = False
        message = "AI Fill: LaMa."

        if requested_engine == "quick_heal" or force_fallback:
            if force_fallback and requested_engine != "quick_heal":
                fallback_reason = "forced fallback"
                fallback = True
            emit(progress, "inpaint", "Quick Heal (OpenCV)...", None, modelId="opencv_telea")
            inpainted = self._run_telea(image_patch, mask_patch)
            model_id = "opencv_telea"
            model_version = "opencv"
            backend_device = "cpu"
            message = "Fallback: OpenCV." if fallback else "Quick Heal: OpenCV."
        elif requested_engine == "sd_inpaint":
            # High-quality generative fill (Stable Diffusion). Degrade SD → LaMa → Telea on failure.
            model_id = "sd_inpaint"
            model_version = "stable-diffusion-inpainting"
            message = "מילוי איכותי: SD."
            emit(progress, "inpaint", "טוען מנוע SD איכותי...", None, modelId=model_id)
            try:
                inpainted = self._run_sd(image_patch, mask_patch, options, progress)
                backend_device = self._sd_device()
            except Exception as exc:
                fallback_reason = str(exc)
                emit(progress, "inpaint", "SD לא זמין — נופל ל-LaMa...", None, modelId="lama", fallbackReason=fallback_reason)
                raise RuntimeError(f"sd_inpaint_unavailable:{fallback_reason}") from exc
        elif requested_engine == "texture_fill":
            # Patch-based / PatchMatch texture synthesis. Honours Sampling Include/Exclude.
            model_id = "texture_fill"
            model_version = "patchmatch"
            message = "מילוי טקסטורה."
            backend_device = "cpu"
            emit(progress, "inpaint", "מילוי טקסטורה (PatchMatch)...", None, modelId=model_id)
            try:
                include = decode_roi_mask(options.get("samplingIncludeMaskPngBase64"), target_width, target_height, roi)
                exclude = decode_roi_mask(options.get("samplingExcludeMaskPngBase64"), target_width, target_height, roi)
                inpainted = self._run_texture(image_patch, mask_patch, options, include, exclude, progress)
            except Exception as exc:
                fallback_reason = str(exc)
                emit(progress, "inpaint", "טקסטורה נכשלה — נופל ל-LaMa...", None, modelId="lama", fallbackReason=fallback_reason)
                fallback = True
                try:
                    inpainted = self._run_lama(image_patch, mask_patch)
                    model_id = "lama"
                    model_version = "simple-lama-inpainting"
                    message = "Fallback: LaMa."
                    backend_device = self._lama_device()
                    model_weights_path = self._lama_model_path()
                except Exception as exc2:
                    fallback_reason = f"{fallback_reason}; {exc2}"
                    raise RuntimeError(f"content_aware_fill_unavailable:{fallback_reason}") from exc2
        else:
            # lama (default). migan / texture_fill engines arrive in later phases;
            # until their services exist, degrade to LaMa rather than error.
            if sd_no_accel:
                fallback = True
                fallback_reason = "sd_acceleration_unavailable_no_cuda"
                message = "SD Inpaint acceleration unavailable. Falling back to CPU / LaMa."
                emit(progress, "inpaint", "האצת SD לא זמינה (אין CUDA) — משתמש ב-LaMa...", None, modelId=model_id, fallbackReason=fallback_reason)
            elif requested_engine not in ("lama",):
                fallback_reason = f"engine_unavailable:{requested_engine}"
            if not sd_no_accel:
                emit(progress, "inpaint", "Loading LaMa model...", None, modelId=model_id)
            try:
                inpainted = self._run_lama(image_patch, mask_patch)
                backend_device = self._lama_device()
                model_weights_path = self._lama_model_path()
            except Exception as exc:
                fallback_reason = str(exc)
                emit(progress, "inpaint", "LaMa fill is unavailable.", None, modelId=model_id, fallbackReason=fallback_reason)
                raise RuntimeError(f"lama_unavailable:{fallback_reason}") from exc

        if bool(options.get("colorAdaptation")):
            emit(progress, "blend", "התאמת צבעים...", None, modelId=model_id)
            inpainted = adapt_patch_colors(image_patch, inpainted, mask_patch)

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

    def warm(self) -> dict[str, Any]:
        """Idempotently load LaMa so the first real fill is fast. Never raises."""
        try:
            self._ensure_lama()
            return {"ok": True, "ready": True, "device": self._lama_device()}
        except Exception as exc:
            self._lama_last_error = str(exc)
            return {"ok": True, "ready": False, "error": str(exc)}

    def _ensure_lama(self) -> Any:
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
        return self._lama

    def _run_lama(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        lama = self._ensure_lama()
        return lama(image.convert("RGB"), mask.convert("L"))

    def _sd_service(self) -> Any:
        if self._sd is None:
            from smart_selection.sd_inpaint_service import SdInpaintService

            self._sd = SdInpaintService()
        return self._sd

    def _run_sd(self, image: Image.Image, mask: Image.Image, options: dict[str, Any], progress: ProgressCallback | None) -> Image.Image:
        return self._sd_service().fill(image, mask, options, progress=progress)

    def _texture_service(self) -> Any:
        if self._texture is None:
            from smart_selection.texture_fill_service import TextureFillService

            self._texture = TextureFillService()
        return self._texture

    def _run_texture(self, image: Image.Image, mask: Image.Image, options: dict[str, Any], include: Any, exclude: Any, progress: ProgressCallback | None) -> Image.Image:
        return self._texture_service().fill(image, mask, options, sampling_include=include, sampling_exclude=exclude, progress=progress)

    def warm_sd(self) -> dict[str, Any]:
        try:
            return self._sd_service().warm()
        except Exception as exc:  # noqa: BLE001
            return {"ok": True, "ready": False, "error": str(exc)}

    def _sd_device(self) -> str | None:
        return getattr(self._sd, "_device", None) if self._sd is not None else None

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


def resolve_engine(options: dict[str, Any], selected_ratio: float, roi_max_side: int) -> str:
    """Pick the fill engine. Explicit `engine` wins; otherwise mirror the spec §11 heuristic.

    Valid engines: quick_heal | lama | sd_inpaint | texture_fill. `auto` resolves to one
    of these. SD inpaint is the default quality engine (it degrades to LaMa → Telea if the
    Stable Diffusion stack/model is unavailable), so "auto" prefers it for real fills while
    keeping live previews on the instant Quick Heal path.
    """
    engine = str(options.get("engine") or "auto").lower()
    if engine != "auto":
        return engine
    # Live previews must stay instant — never spin up SD for a preview pass.
    if bool(options.get("preview")):
        return "quick_heal"
    has_sampling = bool(options.get("samplingIncludeMaskPngBase64") or options.get("samplingExcludeMaskPngBase64"))
    # Explicit sampling regions are a PatchMatch/texture feature, not a generative one.
    if has_sampling:
        return "texture_fill"
    # Default quality engine for EVERY real fill (incl. small touch-ups) — the user
    # wants SD as the base. Degrades to LaMa → OpenCV only if SD is unavailable.
    return "sd_inpaint"


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


def decode_roi_mask(b64: Any, width: int, height: int, roi: "InpaintRoi") -> np.ndarray | None:
    """Decode a full-resolution sampling mask (alpha=region) and crop it to the ROI. Returns
    a bool array of shape (roi.height, roi.width), or None when no mask was provided."""
    if not b64:
        return None
    raw = base64.b64decode(str(b64))
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    arr = np.array(img)[:, :, 3]
    if arr.shape[1] != width or arr.shape[0] != height:
        resized = Image.fromarray(arr, mode="L").resize((width, height), Image.Resampling.NEAREST)
        arr = np.array(resized)
    crop = arr[roi.y:roi.y + roi.height, roi.x:roi.x + roi.width]
    return crop > 128


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


def adapt_patch_colors(original: Image.Image, inpainted: Image.Image, mask: Image.Image) -> Image.Image:
    """Correct a generator's global color drift (diffusion models — SDXL especially —
    shift hue/saturation of the whole patch). The generator renders its own version
    of the KEEP region too; comparing that rendition against the real pixels yields
    the per-channel affine drift it introduced, and applying the inverse to the whole
    patch pulls the generated fill back to the original palette."""
    try:
        orig = np.asarray(original.convert("RGB"), dtype=np.float32)
        gen = np.asarray(inpainted.convert("RGB"), dtype=np.float32)
        if gen.shape != orig.shape:
            return inpainted
        keep = np.asarray(mask.convert("L"), dtype=np.uint8) < 128
        if int(keep.sum()) < 256:
            return inpainted
        out = np.empty_like(gen)
        for c in range(3):
            o = orig[..., c][keep]
            g = gen[..., c][keep]
            g_std = float(g.std())
            g_mean = float(g.mean())
            scale = float(o.std()) / g_std if g_std > 1e-3 else 1.0
            # Tight clamps: this corrects global drift only. Letting it stretch
            # contrast or shift brightness aggressively can wash a patch out.
            scale = float(np.clip(scale, 0.75, 1.35))
            shift = float(np.clip(float(o.mean()) - g_mean, -40.0, 40.0))
            out[..., c] = (gen[..., c] - g_mean) * scale + g_mean + shift
        return Image.fromarray(np.clip(out, 0.0, 255.0).astype(np.uint8), mode="RGB")
    except Exception:  # noqa: BLE001
        return inpainted


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

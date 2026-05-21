#!/usr/bin/env python
from __future__ import annotations

import base64
import io
import json
import os
import platform
import struct
import sys
import time
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageFilter

from smart_selection.birefnet_service import BiRefNetService
from smart_selection.inpaint_service import InpaintService
from smart_selection.mask_refine_service import MaskRefineService
from smart_selection.model_manager import ModelManager
from smart_selection.sam_service import SamService


PROFILE = "balanced"
MODEL_VERSION = "fallback-0.1"
MAX_IMAGE_CACHE = 20
MODEL_MANAGER = ModelManager()
BIREFNET_SERVICE = BiRefNetService()
SAM_SERVICE = SamService()
MASK_REFINE_SERVICE = MaskRefineService()
INPAINT_SERVICE = InpaintService()
LOG_FILE = Path(os.environ.get("SPP2_LOGS_DIR", "")) / "smart-selection-sidecar.log" if os.environ.get("SPP2_LOGS_DIR") else None
AUTO_SEGMENT_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
MAX_AUTO_SEGMENT_CACHE = 12


@dataclass
class ImageEntry:
    image_id: str
    path: str
    source_hash: str
    width: int
    height: int


IMAGE_CACHE: OrderedDict[str, ImageEntry] = OrderedDict()
EMBEDDING_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()


def write_response(message_id: int, result: Any = None, error: str | None = None) -> None:
    payload = {"id": message_id}
    if error is None:
        payload["result"] = result
    else:
        payload["error"] = {"message": error}
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack(">I", len(body)))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def write_event(event: str, payload: dict[str, Any]) -> None:
    body = json.dumps({"event": event, "payload": payload}, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack(">I", len(body)))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def emit_progress(payload: dict[str, Any]) -> None:
    write_event("smart-selection-progress", payload)


def emit_step(phase: str, message: str, percent: float | None = None, **fields: Any) -> None:
    emit_progress({"phase": phase, "message": message, "percent": percent, **fields})


def read_message() -> dict[str, Any] | None:
    header = sys.stdin.buffer.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise RuntimeError("Invalid JSON-RPC frame header")
    length = struct.unpack(">I", header)[0]
    body = sys.stdin.buffer.read(length)
    if len(body) != length:
        raise RuntimeError("Invalid JSON-RPC frame body")
    return json.loads(body.decode("utf-8"))


def log(message: str, **fields: Any) -> None:
    record = {"ts": time.time(), "message": message, **fields}
    line = json.dumps(record, ensure_ascii=False)
    print(line, file=sys.stderr, flush=True)
    if LOG_FILE is not None:
        try:
            LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
            with LOG_FILE.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
        except Exception:
            pass


def probe_capabilities() -> dict[str, Any]:
    providers: list[str] = []
    cuda = False
    mps = False
    directml = False
    try:
        import onnxruntime as ort  # type: ignore

        providers = list(ort.get_available_providers())
        cuda = "CUDAExecutionProvider" in providers
        directml = "DmlExecutionProvider" in providers or "DirectMLExecutionProvider" in providers
    except Exception as exc:
        providers = ["CPUExecutionProvider"]
        log("onnxruntime probe failed", error=str(exc))
    try:
        import torch  # type: ignore

        cuda = bool(cuda or torch.cuda.is_available())
        mps = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
    except Exception as exc:
        log("torch probe failed", error=str(exc))
    recommended = "balanced" if cuda or mps or directml else "performance"
    return {
        "ok": True,
        "profile": PROFILE,
        "recommendedProfile": recommended,
        "providers": providers,
        "gpu": {"cuda": cuda, "mps": mps, "directml": directml},
        "platform": {"system": platform.system(), "machine": platform.machine()},
        "modelsDir": os.environ.get("SPP2_MODELS_DIR"),
        "models": MODEL_MANAGER.list_models(),
        "fallback": True,
        "message": "Smart Selection sidecar is ready. Model-backed inference will activate when models are installed.",
    }


def ensure_model(model_id: str) -> dict[str, Any]:
    status = MODEL_MANAGER.ensure(model_id, auto_download=True, progress=emit_progress)
    log("ensure_model", model_id=model_id, status=status.status, available=status.available)
    return status.to_json()


def load_image(image_id: str, path: str, source_hash: str) -> dict[str, Any]:
    image = open_image(path)
    entry = ImageEntry(image_id=image_id, path=path, source_hash=source_hash, width=image.width, height=image.height)
    IMAGE_CACHE[image_id] = entry
    IMAGE_CACHE.move_to_end(image_id)
    while len(IMAGE_CACHE) > MAX_IMAGE_CACHE:
        old_id, _ = IMAGE_CACHE.popitem(last=False)
        EMBEDDING_CACHE.pop(old_id, None)
    return {"ok": True, "imageId": image_id, "cached": image_id in EMBEDDING_CACHE, "width": image.width, "height": image.height}


def encode_sam(image_id: str) -> dict[str, Any]:
    entry = require_image(image_id)
    emit_step("prepare", "Preparing smart selection model...", None, modelId="sam2_hiera_small")
    model_status = MODEL_MANAGER.ensure("sam2_hiera_small", auto_download=True, progress=emit_progress)
    if not model_status.available:
        log("encode_sam fallback", model_status=model_status.status, status_message=model_status.message)
    image = open_image(entry.path)
    emit_step("encode", "Analyzing image for smart selection...", None, modelId="sam2_hiera_small")
    result = SAM_SERVICE.encode_image(
        image_id,
        entry.source_hash,
        image,
        model_files=model_status.files,
        model_available=model_status.available,
    )
    EMBEDDING_CACHE[image_id] = {"sourceHash": entry.source_hash, "createdAt": time.time(), "fallback": result.get("fallback", True)}
    EMBEDDING_CACHE.move_to_end(image_id)
    emit_step("ready", "Smart selection model is ready.", 100, modelId="sam2_hiera_small")
    return result


def auto_segment(image_id: str, options: dict[str, Any]) -> dict[str, Any]:
    entry = require_image(image_id)
    emit_step("prepare", "Preparing object selection...", None, modelId="birefnet")
    model_status = MODEL_MANAGER.ensure("birefnet", auto_download=True, progress=emit_progress)
    if not model_status.available:
        log("auto_segment fallback", model_status=model_status.status, status_message=model_status.message)
    width, height = target_size(entry, options)
    cache_key = f"{image_id}:{entry.source_hash}:{width}x{height}:{model_status.status}:{model_status.sha256 or model_status.version or 'fallback'}"
    cached = AUTO_SEGMENT_CACHE.get(cache_key)
    if cached is not None:
        AUTO_SEGMENT_CACHE.move_to_end(cache_key)
        return cached
    image = open_image(entry.path)
    providers = options.get("providers") if isinstance(options.get("providers"), list) else None
    emit_step("predict", "Finding the main object...", None, modelId="birefnet")
    result = BIREFNET_SERVICE.auto_segment(
        image,
        model_path=model_status.path if model_status.available else None,
        model_version=model_status.version,
        target_width=width,
        target_height=height,
        providers=providers,
    )
    response = mask_response(result.mask, width, height, entry, result.model_id, result.message, fallback=result.fallback, model_version=result.model_version)
    AUTO_SEGMENT_CACHE[cache_key] = response
    AUTO_SEGMENT_CACHE.move_to_end(cache_key)
    while len(AUTO_SEGMENT_CACHE) > MAX_AUTO_SEGMENT_CACHE:
        AUTO_SEGMENT_CACHE.popitem(last=False)
    emit_step("ready", "Object selection is ready.", 100, modelId=result.model_id)
    return response


def predict_mask(image_id: str, options: dict[str, Any]) -> dict[str, Any]:
    entry = require_image(image_id)
    model_status = MODEL_MANAGER.ensure("sam2_hiera_small", auto_download=True, progress=emit_progress)
    if not model_status.available:
        log("predict_mask fallback", model_status=model_status.status, status_message=model_status.message)
    width, height = target_size(entry, options)
    prompts = options.get("prompts") or []
    image = open_image(entry.path)
    emit_step("predict", "Updating smart selection...", None, modelId="sam2_hiera_small")
    result = SAM_SERVICE.predict(
        image_id=image_id,
        source_hash=entry.source_hash,
        image=image,
        prompts=prompts,
        target_width=width,
        target_height=height,
        model_available=model_status.available,
        model_message=model_status.message,
        model_files=model_status.files,
    )
    response = mask_response(result.mask, width, height, entry, result.model_id, result.message, fallback=result.fallback, model_version=result.model_version)
    emit_step("ready", "Smart selection ready.", 100, modelId=result.model_id)
    return response


def refine_mask(image_id: str, options: dict[str, Any]) -> dict[str, Any]:
    entry = require_image(image_id)
    preferred_model = "modnet" if PROFILE == "performance" else "cascadepsp"
    emit_step("refine", "Refining selection edges...", None, modelId=preferred_model)
    model_status = MODEL_MANAGER.ensure(preferred_model, auto_download=True, progress=emit_progress)
    if not model_status.available:
        log("refine_mask fallback", model_id=preferred_model, model_status=model_status.status, status_message=model_status.message)
    width = int(options.get("width") or options.get("targetWidth") or entry.width)
    height = int(options.get("height") or options.get("targetHeight") or entry.height)
    mask_b64 = str(options.get("maskPngBase64") or "")
    softness = str(options.get("softness") or "natural")
    if mask_b64:
        mask = decode_mask(mask_b64, width, height)
    else:
        mask = fallback_ellipse_mask(width, height)
    image = open_image(entry.path)
    result = MASK_REFINE_SERVICE.refine(
        image,
        mask,
        softness=softness,
        model_id=preferred_model,
        model_path=model_status.path if model_status.available else None,
        model_version=model_status.version,
        model_message=model_status.message,
    )
    response = mask_response(result.mask, width, height, entry, result.model_id, result.message, fallback=result.fallback, model_version=result.model_version)
    emit_step("ready", "Edges refined.", 100, modelId=result.model_id)
    return response


def inpaint_remove(image_id: str, options: dict[str, Any]) -> dict[str, Any]:
    mask_b64 = str(options.get("maskPngBase64") or "")
    if not mask_b64:
        raise RuntimeError("invalid_mask")
    image_b64 = str(options.get("imagePngBase64") or "")
    entry: ImageEntry | None = None
    if image_b64:
        image = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGBA")
    else:
        entry = require_image(image_id)
        image = open_image(entry.path)
    width = int(options.get("targetWidth") or options.get("width") or image.width)
    height = int(options.get("targetHeight") or options.get("height") or image.height)
    emit_progress({
        "operation": "inpaint_remove",
        "phase": "prepare",
        "message": "Preparing AI Fill...",
        "percent": None,
        "modelId": "lama",
    })
    mask = decode_mask(mask_b64, width, height)
    result = INPAINT_SERVICE.inpaint(image, mask, {**options, "targetWidth": width, "targetHeight": height}, progress=emit_progress)
    return result.to_json()


def unload_image(image_id: str) -> dict[str, Any]:
    IMAGE_CACHE.pop(image_id, None)
    EMBEDDING_CACHE.pop(image_id, None)
    SAM_SERVICE.unload(image_id)
    for key in list(AUTO_SEGMENT_CACHE.keys()):
        if key.startswith(f"{image_id}:"):
            AUTO_SEGMENT_CACHE.pop(key, None)
    return {"ok": True}


# ─── Face detection ──────────────────────────────────────────────────────────
# Priority: MediaPipe BlazeFace (full-range) → OpenCV Haar cascade → empty.
# Cached lazily; both run on CPU and add no startup cost when unused.

_FACE_DETECTOR_MP = None
_FACE_DETECTOR_MP_LOADED = False
_FACE_DETECTOR_HAAR = None
_FACE_DETECTOR_HAAR_LOADED = False


def _mediapipe_face_detector():
    global _FACE_DETECTOR_MP, _FACE_DETECTOR_MP_LOADED
    if _FACE_DETECTOR_MP_LOADED:
        return _FACE_DETECTOR_MP
    _FACE_DETECTOR_MP_LOADED = True
    try:
        import mediapipe as mp  # type: ignore
        if not hasattr(mp, "solutions") or not hasattr(mp.solutions, "face_detection"):
            return None
        _FACE_DETECTOR_MP = mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.45
        )
    except Exception as exc:
        log("mediapipe face detector load failed", error=str(exc))
        _FACE_DETECTOR_MP = None
    return _FACE_DETECTOR_MP


def _haar_face_detector():
    global _FACE_DETECTOR_HAAR, _FACE_DETECTOR_HAAR_LOADED
    if _FACE_DETECTOR_HAAR_LOADED:
        return _FACE_DETECTOR_HAAR
    _FACE_DETECTOR_HAAR_LOADED = True
    try:
        import cv2  # type: ignore
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        detector = cv2.CascadeClassifier(cascade_path)
        if detector.empty():
            _FACE_DETECTOR_HAAR = None
        else:
            _FACE_DETECTOR_HAAR = detector
    except Exception as exc:
        log("haar face detector load failed", error=str(exc))
        _FACE_DETECTOR_HAAR = None
    return _FACE_DETECTOR_HAAR


def detect_faces(image_id: str) -> dict[str, Any]:
    entry = require_image(image_id)
    image = open_image(entry.path)
    rgb = np.asarray(image.convert("RGB"))
    height, width = rgb.shape[:2]

    faces: list[dict[str, Any]] = []
    backend = "none"

    mp_detector = _mediapipe_face_detector()
    if mp_detector is not None:
        try:
            result = mp_detector.process(rgb)
            for detection in result.detections or []:
                box = detection.location_data.relative_bounding_box
                x = max(0, int(box.xmin * width))
                y = max(0, int(box.ymin * height))
                w = max(0, min(width - x, int(box.width * width)))
                h = max(0, min(height - y, int(box.height * height)))
                if w > 0 and h > 0:
                    faces.append({
                        "x": x, "y": y, "width": w, "height": h,
                        "score": float(detection.score[0]) if detection.score else 0.5,
                    })
            backend = "mediapipe"
        except Exception as exc:
            log("mediapipe detect_faces failed", image_id=image_id, error=str(exc))

    if not faces:
        haar = _haar_face_detector()
        if haar is not None:
            try:
                import cv2  # type: ignore
                gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
                found = haar.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(32, 32))
                for (x, y, w, h) in found:
                    faces.append({
                        "x": int(x), "y": int(y), "width": int(w), "height": int(h),
                        "score": 0.5,
                    })
                backend = "haar"
            except Exception as exc:
                log("haar detect_faces failed", image_id=image_id, error=str(exc))

    return {
        "ok": True,
        "imageId": image_id,
        "width": width,
        "height": height,
        "backend": backend,
        "faces": faces,
    }


def target_size(entry: ImageEntry, options: dict[str, Any]) -> tuple[int, int]:
    width = int(options.get("targetWidth") or min(entry.width, 1024))
    height = int(options.get("targetHeight") or min(entry.height, 1024))
    return max(1, width), max(1, height)


def require_image(image_id: str) -> ImageEntry:
    entry = IMAGE_CACHE.get(image_id)
    if entry is None:
        raise RuntimeError(f"Image is not loaded: {image_id}")
    IMAGE_CACHE.move_to_end(image_id)
    return entry


def open_image(path: str) -> Image.Image:
    if path.startswith("data:"):
        encoded = path.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGBA")
    return Image.open(path).convert("RGBA")


def fallback_ellipse_mask(width: int, height: int) -> np.ndarray:
    yy, xx = np.ogrid[:height, :width]
    cx = width / 2
    cy = height / 2
    rx = max(1, width * 0.36)
    ry = max(1, height * 0.42)
    mask = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1).astype(np.uint8) * 255
    return mask


def decode_mask(mask_b64: str, width: int, height: int) -> np.ndarray:
    img = Image.open(io.BytesIO(base64.b64decode(mask_b64))).convert("RGBA").resize((width, height), Image.Resampling.LANCZOS)
    return np.array(img.getchannel("A"), dtype=np.uint8)


def mask_response(
    mask: np.ndarray,
    width: int,
    height: int,
    entry: ImageEntry,
    model_id: str,
    message: str,
    *,
    fallback: bool = True,
    model_version: str = MODEL_VERSION,
) -> dict[str, Any]:
    alpha = Image.fromarray(mask, mode="L")
    rgba = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    rgba.putalpha(alpha)
    buffer = io.BytesIO()
    rgba.save(buffer, format="PNG")
    return {
        "maskPngBase64": base64.b64encode(buffer.getvalue()).decode("ascii"),
        "width": width,
        "height": height,
        "sourceWidth": entry.width,
        "sourceHeight": entry.height,
        "modelId": model_id,
        "modelVersion": model_version,
        "profile": PROFILE,
        "fallback": fallback,
        "message": message,
    }


def dispatch(method: str, params: dict[str, Any]) -> Any:
    global PROFILE
    if method == "health":
        return probe_capabilities()
    if method == "set_performance_profile":
        PROFILE = str(params.get("profile") or "balanced")
        return {"ok": True, "profile": PROFILE}
    if method == "ensure_model":
        return ensure_model(str(params.get("model_id") or "unknown"))
    if method == "list_models":
        return MODEL_MANAGER.list_models()
    if method == "load_image":
        return load_image(str(params["image_id"]), str(params["path"]), str(params.get("source_hash") or params["image_id"]))
    if method == "encode_sam":
        return encode_sam(str(params["image_id"]))
    if method == "auto_segment":
        return auto_segment(str(params["image_id"]), dict(params.get("options") or {}))
    if method == "predict_mask":
        return predict_mask(str(params["image_id"]), dict(params.get("options") or {}))
    if method == "refine_mask":
        return refine_mask(str(params["image_id"]), dict(params.get("options") or {}))
    if method == "inpaint_remove":
        return inpaint_remove(str(params["image_id"]), dict(params.get("options") or {}))
    if method == "unload_image":
        return unload_image(str(params["image_id"]))
    if method == "detect_faces":
        return detect_faces(str(params["image_id"]))
    if method == "cancel":
        return {"ok": True}
    if method == "shutdown":
        return {"ok": True}
    raise RuntimeError(f"Unknown method: {method}")


def main() -> None:
    log("smart selection sidecar started")
    while True:
        message = read_message()
        if message is None:
            break
        message_id = int(message.get("id", 0))
        method = str(message.get("method"))
        try:
            result = dispatch(method, dict(message.get("params") or {}))
            write_response(message_id, result=result)
            if method == "shutdown":
                break
        except Exception as exc:
            log("request failed", method=method, error=str(exc))
            write_response(message_id, error=str(exc))


if __name__ == "__main__":
    main()

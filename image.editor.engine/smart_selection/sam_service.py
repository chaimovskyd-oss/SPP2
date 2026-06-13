from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass
import threading
from typing import Any

import numpy as np
from PIL import Image

from smart_selection.providers import preferred_onnx_providers, selected_provider


MAX_EMBEDDING_CACHE = 20
SAM_IMAGE_SIZE = 1024
SAM_MASK_SIZE = 256
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


@dataclass
class SamEmbedding:
    image_id: str
    source_hash: str
    width: int
    height: int
    rgb_small: np.ndarray
    created_at: float
    fallback: bool = True
    embeddings: list[np.ndarray] | None = None


@dataclass
class PromptMaskResult:
    mask: np.ndarray
    model_id: str
    model_version: str
    fallback: bool
    message: str


class SamService:
    def __init__(self) -> None:
        self._embeddings: OrderedDict[str, SamEmbedding] = OrderedDict()
        self._model_key: str | None = None
        self._vision_session: Any | None = None
        self._decoder_session: Any | None = None
        self._run_lock = threading.Lock()

    def prepare_model(self, files: list[dict[str, Any]] | None, providers: list[str] | None = None) -> dict[str, Any]:
        if not files:
            return {"ok": False, "ready": False, "message": "SAM 2.1 model files are not available."}
        vision = next((item for item in files if item.get("role") == "vision_encoder"), None)
        decoder = next((item for item in files if item.get("role") == "prompt_encoder_mask_decoder"), None)
        if not vision or not decoder:
            return {"ok": False, "ready": False, "message": "SAM 2.1 model manifest is missing encoder/decoder files."}
        vision_path = str(vision.get("path") or "")
        decoder_path = str(decoder.get("path") or "")
        key = f"{vision_path}|{vision.get('sha256')}|{decoder_path}|{decoder.get('sha256')}"
        if self._model_key == key and self._vision_session is not None and self._decoder_session is not None:
            return {"ok": True, "ready": True, "cached": True, "message": "SAM 2.1 ONNX sessions are ready."}
        try:
            import onnxruntime as ort  # type: ignore

            requested = preferred_onnx_providers(ort.get_available_providers(), providers)
            self._vision_session = ort.InferenceSession(vision_path, providers=requested)
            self._decoder_session = ort.InferenceSession(decoder_path, providers=requested)
            self._model_key = key
            return {
                "ok": True,
                "ready": True,
                "cached": False,
                "providers": requested,
                "visionInputs": [item.name for item in self._vision_session.get_inputs()],
                "decoderInputs": [item.name for item in self._decoder_session.get_inputs()],
                "message": "SAM 2.1 ONNX sessions are ready.",
            }
        except Exception as exc:
            self._model_key = None
            self._vision_session = None
            self._decoder_session = None
            return {"ok": False, "ready": False, "message": f"SAM 2.1 ONNX session load failed: {exc}"}

    def encode_image(
        self,
        image_id: str,
        source_hash: str,
        image: Image.Image,
        *,
        model_files: list[dict[str, Any]] | None = None,
        model_available: bool = False,
    ) -> dict[str, Any]:
        existing = self._embeddings.get(image_id)
        if existing is not None and existing.source_hash == source_hash and not (model_available and existing.fallback):
            self._embeddings.move_to_end(image_id)
            return {"ok": True, "imageId": image_id, "cached": True, "fallback": existing.fallback}

        model_ready = self.prepare_model(model_files) if model_available else {"ready": False}
        rgb = image.convert("RGB")
        embeddings: list[np.ndarray] | None = None
        fallback = True
        if bool(model_ready.get("ready")) and self._vision_session is not None:
            try:
                embeddings = self._run_vision_encoder(rgb)
                fallback = False
            except Exception:
                embeddings = None
                fallback = True
        rgb_small = np.asarray(rgb.resize(fit_size(rgb.width, rgb.height, 1024), Image.Resampling.BICUBIC))
        self._embeddings[image_id] = SamEmbedding(
            image_id=image_id,
            source_hash=source_hash,
            width=rgb.width,
            height=rgb.height,
            rgb_small=rgb_small,
            created_at=time.time(),
            fallback=fallback,
            embeddings=embeddings,
        )
        self._embeddings.move_to_end(image_id)
        while len(self._embeddings) > MAX_EMBEDDING_CACHE:
            self._embeddings.popitem(last=False)
        return {
            "ok": True,
            "imageId": image_id,
            "cached": False,
            "fallback": fallback,
            "modelReady": bool(model_ready.get("ready")),
            "message": model_ready.get("message"),
        }

    def predict(
        self,
        *,
        image_id: str,
        source_hash: str,
        image: Image.Image,
        prompts: list[dict[str, Any]],
        target_width: int,
        target_height: int,
        model_available: bool,
        model_message: str,
        model_files: list[dict[str, Any]] | None = None,
    ) -> PromptMaskResult:
        embedding = self._embeddings.get(image_id)
        if embedding is None or embedding.source_hash != source_hash:
            self.encode_image(image_id, source_hash, image, model_files=model_files, model_available=model_available)
            embedding = self._embeddings.get(image_id)
        else:
            self._embeddings.move_to_end(image_id)

        if model_available and embedding is not None and embedding.embeddings is not None and self._decoder_session is not None:
            try:
                mask = self._run_decoder(embedding.embeddings, prompts, target_width, target_height)
                return PromptMaskResult(
                    mask=mask,
                    model_id="sam2_hiera_small",
                    model_version="onnx-community/sam2.1-hiera-small-ONNX",
                    fallback=False,
                    message="Interactive smart selection ready.",
                )
            except Exception as exc:
                model_message = f"SAM 2.1 decoder failed; interactive fallback is active. {exc}"

        mask = prompt_fallback_mask(image, prompts, target_width, target_height)
        if model_available:
            message = "SAM 2.1 ONNX files are ready; interactive fallback is active until decoder tensor wiring is enabled."
        else:
            message = model_message
        return PromptMaskResult(
            mask=mask,
            model_id="sam2-ready-fallback" if model_available else "sam2-fallback",
            model_version="fallback-0.1",
            fallback=True,
            message=message,
        )

    def unload(self, image_id: str) -> None:
        self._embeddings.pop(image_id, None)

    def _run_vision_encoder(self, image: Image.Image) -> list[np.ndarray]:
        if self._vision_session is None:
            raise RuntimeError("SAM vision session is not ready")
        resized = image.resize((SAM_IMAGE_SIZE, SAM_IMAGE_SIZE), Image.Resampling.BICUBIC)
        arr = np.asarray(resized).astype(np.float32) / 255.0
        arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
        pixel_values = np.transpose(arr, (2, 0, 1))[None, ...].astype(np.float32)
        with self._run_lock:
            outputs = self._vision_session.run(None, {"pixel_values": pixel_values})
        return [np.asarray(output, dtype=np.float32) for output in outputs]

    def warmup_vision(self) -> None:
        if self._vision_session is None:
            return
        pixel_values = np.zeros((1, 3, SAM_IMAGE_SIZE, SAM_IMAGE_SIZE), dtype=np.float32)
        with self._run_lock:
            self._vision_session.run(None, {"pixel_values": pixel_values})

    def provider(self) -> str | None:
        if self._vision_session is None:
            return None
        return selected_provider(self._vision_session)

    def _run_decoder(self, embeddings: list[np.ndarray], prompts: list[dict[str, Any]], target_width: int, target_height: int) -> np.ndarray:
        if self._decoder_session is None:
            raise RuntimeError("SAM decoder session is not ready")
        points, labels, boxes = prompts_to_tensors(prompts)
        with self._run_lock:
            outputs = self._decoder_session.run(
                None,
                {
                    "input_points": points,
                    "input_labels": labels,
                    "input_boxes": boxes,
                    "image_embeddings.0": embeddings[0],
                    "image_embeddings.1": embeddings[1],
                    "image_embeddings.2": embeddings[2],
                },
            )
        iou_scores = np.asarray(outputs[0])
        pred_masks = np.asarray(outputs[1])
        if pred_masks.ndim != 5:
            raise RuntimeError(f"Unexpected SAM mask output shape: {pred_masks.shape}")
        best_prompt = 0
        best_mask = int(np.argmax(iou_scores[0, best_prompt])) if iou_scores.size else 0
        logits = pred_masks[0, best_prompt, best_mask]
        alpha = logits_to_alpha(logits)
        pil = Image.fromarray(alpha, mode="L").resize((target_width, target_height), Image.Resampling.LANCZOS)
        return np.array(pil, dtype=np.uint8)


def fit_size(width: int, height: int, max_size: int) -> tuple[int, int]:
    scale = min(1.0, max_size / max(1, width), max_size / max(1, height))
    return max(1, int(round(width * scale))), max(1, int(round(height * scale)))


def prompts_to_tensors(prompts: list[dict[str, Any]]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    points: list[list[float]] = []
    labels: list[int] = []
    box_prompt = next((prompt for prompt in reversed(prompts) if prompt.get("type") == "box"), None)
    for prompt in prompts:
        if prompt.get("type") != "point":
            continue
        x = float(np.clip(float(prompt.get("x", 0.5)), 0.0, 1.0)) * SAM_IMAGE_SIZE
        y = float(np.clip(float(prompt.get("y", 0.5)), 0.0, 1.0)) * SAM_IMAGE_SIZE
        points.append([x, y])
        labels.append(0 if prompt.get("label") == "negative" else 1)
    if points:
        point_tensor = np.asarray(points, dtype=np.float32)[None, None, :, :]
        label_tensor = np.asarray(labels, dtype=np.int64)[None, None, :]
    else:
        point_tensor = np.zeros((1, 1, 0, 2), dtype=np.float32)
        label_tensor = np.zeros((1, 1, 0), dtype=np.int64)
    if box_prompt is not None:
        x0 = float(np.clip(float(box_prompt.get("x", 0.0)), 0.0, 1.0)) * SAM_IMAGE_SIZE
        y0 = float(np.clip(float(box_prompt.get("y", 0.0)), 0.0, 1.0)) * SAM_IMAGE_SIZE
        x1 = float(np.clip(float(box_prompt.get("x", 0.0)) + float(box_prompt.get("width", 0.0)), 0.0, 1.0)) * SAM_IMAGE_SIZE
        y1 = float(np.clip(float(box_prompt.get("y", 0.0)) + float(box_prompt.get("height", 0.0)), 0.0, 1.0)) * SAM_IMAGE_SIZE
        box_tensor = np.asarray([[[x0, y0, x1, y1]]], dtype=np.float32)
    else:
        box_tensor = np.zeros((1, 0, 4), dtype=np.float32)
    return point_tensor, label_tensor, box_tensor


def logits_to_alpha(logits: np.ndarray) -> np.ndarray:
    logits = np.asarray(logits, dtype=np.float32)
    alpha = 1.0 / (1.0 + np.exp(-np.clip(logits, -40, 40)))
    return (np.clip(alpha, 0.0, 1.0) * 255.0).astype(np.uint8)


def prompt_fallback_mask(image: Image.Image, prompts: list[dict[str, Any]], target_width: int, target_height: int) -> np.ndarray:
    if not prompts:
        return fallback_subject_mask(target_width, target_height)
    box_prompt = next((prompt for prompt in reversed(prompts) if prompt.get("type") == "box"), None)
    if box_prompt is not None:
        mask = grabcut_box_mask(image, box_prompt, target_width, target_height)
    else:
        mask = np.zeros((target_height, target_width), dtype=np.uint8)

    yy, xx = np.ogrid[:target_height, :target_width]
    radius = max(10, min(target_width, target_height) // 8)
    for prompt in prompts:
        if prompt.get("type") != "point":
            continue
        cx = int(np.clip(float(prompt.get("x", 0.5)) * target_width, 0, target_width - 1))
        cy = int(np.clip(float(prompt.get("y", 0.5)) * target_height, 0, target_height - 1))
        disk = (xx - cx) ** 2 + (yy - cy) ** 2 <= radius ** 2
        if prompt.get("label") == "negative":
            mask[disk] = 0
        else:
            mask[disk] = 255
    if not np.any(mask):
        return fallback_subject_mask(target_width, target_height)
    return mask


def grabcut_box_mask(image: Image.Image, box_prompt: dict[str, Any], target_width: int, target_height: int) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB").resize((target_width, target_height), Image.Resampling.BICUBIC))
    x = int(np.clip(float(box_prompt.get("x", 0)) * target_width, 0, target_width - 1))
    y = int(np.clip(float(box_prompt.get("y", 0)) * target_height, 0, target_height - 1))
    w = int(np.clip(float(box_prompt.get("width", 0)) * target_width, 1, target_width - x))
    h = int(np.clip(float(box_prompt.get("height", 0)) * target_height, 1, target_height - y))
    if w <= 2 or h <= 2:
        mask = np.zeros((target_height, target_width), dtype=np.uint8)
        mask[y:y + h, x:x + w] = 255
        return mask
    try:
        import cv2  # type: ignore

        grab_mask = np.zeros(rgb.shape[:2], np.uint8)
        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)
        rect = (x, y, w, h)
        cv2.grabCut(rgb, grab_mask, rect, bgd_model, fgd_model, 3, cv2.GC_INIT_WITH_RECT)
        out = np.where((grab_mask == cv2.GC_FGD) | (grab_mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
        return out
    except Exception:
        mask = np.zeros((target_height, target_width), dtype=np.uint8)
        mask[y:y + h, x:x + w] = 255
        return mask


def fallback_subject_mask(width: int, height: int) -> np.ndarray:
    yy, xx = np.ogrid[:height, :width]
    cx = width / 2
    cy = height * 0.48
    rx = max(1, width * 0.34)
    ry = max(1, height * 0.42)
    dist = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    return (np.clip(1.25 - dist, 0, 1) * 255).astype(np.uint8)

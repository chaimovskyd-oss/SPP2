from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image, ImageFilter


@dataclass
class RefineResult:
    mask: np.ndarray
    model_id: str
    model_version: str
    fallback: bool
    message: str


class MaskRefineService:
    def __init__(self) -> None:
        self._session: Any | None = None
        self._model_path: str | None = None

    def refine(
        self,
        image: Image.Image,
        mask: np.ndarray,
        *,
        softness: str,
        model_id: str,
        model_path: str | None,
        model_version: str | None,
        model_message: str,
    ) -> RefineResult:
        if model_path:
            # Session loading is intentionally conservative for V1. CascadePSP and
            # MODNet exports vary in input contracts, so local refinement remains
            # the production fallback until a specific ONNX contract is approved.
            try:
                self._warm_session(model_path)
                message = f"{model_message} Local edge polish is active until model tensor wiring is enabled."
            except Exception as exc:
                message = f"{model_message} Local edge polish is active; model load failed: {exc}"
        else:
            message = model_message
        return RefineResult(
            mask=refine_alpha(mask, softness=softness),
            model_id=f"{model_id}-local-refine",
            model_version=model_version or "local-refine-0.1",
            fallback=True,
            message=message,
        )

    def _warm_session(self, model_path: str) -> None:
        if self._session is not None and self._model_path == model_path:
            return
        import onnxruntime as ort  # type: ignore

        available = set(ort.get_available_providers())
        preferred = [
            "CUDAExecutionProvider",
            "DmlExecutionProvider",
            "DirectMLExecutionProvider",
            "CoreMLExecutionProvider",
            "CPUExecutionProvider",
        ]
        providers = [provider for provider in preferred if provider in available] or ["CPUExecutionProvider"]
        self._session = ort.InferenceSession(model_path, providers=providers)
        self._model_path = model_path


def refine_alpha(mask: np.ndarray, *, softness: str) -> np.ndarray:
    alpha = normalize_mask(mask)
    alpha = remove_speckles(alpha)
    alpha = close_small_holes(alpha)
    alpha = antialias_edge(alpha)
    alpha = apply_softness(alpha, softness)
    return np.clip(alpha, 0, 255).astype(np.uint8)


def normalize_mask(mask: np.ndarray) -> np.ndarray:
    alpha = np.asarray(mask, dtype=np.float32)
    if alpha.ndim == 3:
        alpha = alpha[..., -1]
    if alpha.size == 0:
        return alpha.astype(np.uint8)
    if float(np.nanmax(alpha)) <= 1.0:
        alpha = alpha * 255.0
    return np.clip(alpha, 0, 255).astype(np.uint8)


def remove_speckles(alpha: np.ndarray) -> np.ndarray:
    try:
        import cv2  # type: ignore

        binary = (alpha > 10).astype(np.uint8)
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
        if num_labels <= 1:
            return alpha
        min_area = max(12, int(alpha.shape[0] * alpha.shape[1] * 0.00015))
        keep = np.zeros_like(binary)
        for label in range(1, num_labels):
            if stats[label, cv2.CC_STAT_AREA] >= min_area:
                keep[labels == label] = 1
        return (alpha * keep).astype(np.uint8)
    except Exception:
        return alpha


def close_small_holes(alpha: np.ndarray) -> np.ndarray:
    try:
        import cv2  # type: ignore

        kernel = np.ones((3, 3), np.uint8)
        binary = (alpha > 128).astype(np.uint8) * 255
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
        soft = np.maximum(alpha, (closed * 0.35).astype(np.uint8))
        return soft.astype(np.uint8)
    except Exception:
        return alpha


def antialias_edge(alpha: np.ndarray) -> np.ndarray:
    img = Image.fromarray(alpha, mode="L")
    high = img.resize((max(1, img.width * 2), max(1, img.height * 2)), Image.Resampling.LANCZOS)
    low = high.resize(img.size, Image.Resampling.LANCZOS)
    return np.array(low, dtype=np.uint8)


def apply_softness(alpha: np.ndarray, softness: str) -> np.ndarray:
    radius_map = {
        "sharp": 0.35,
        "natural": 1.1,
        "soft": 2.2,
    }
    contrast_map = {
        "sharp": 1.18,
        "natural": 1.04,
        "soft": 0.94,
    }
    radius = radius_map.get(softness, 1.1)
    contrast = contrast_map.get(softness, 1.04)
    blurred = np.array(Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(radius=radius)), dtype=np.float32)
    centered = (blurred - 127.5) * contrast + 127.5
    if softness == "sharp":
        # Preserve solid interiors while keeping the antialiased boundary.
        centered = np.where(alpha > 245, 255, centered)
        centered = np.where(alpha < 8, 0, centered)
    return np.clip(centered, 0, 255).astype(np.uint8)

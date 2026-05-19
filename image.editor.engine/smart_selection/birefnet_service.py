from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageFilter


IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


@dataclass
class SegmentResult:
    mask: np.ndarray
    model_id: str
    model_version: str
    fallback: bool
    message: str


class BiRefNetService:
    def __init__(self) -> None:
        self._session: Any | None = None
        self._model_path: str | None = None
        self._providers: list[str] = []

    def auto_segment(
        self,
        image: Image.Image,
        *,
        model_path: str | None,
        model_version: str | None,
        target_width: int,
        target_height: int,
        providers: list[str] | None = None,
    ) -> SegmentResult:
        if not model_path:
            return self.fallback(target_width, target_height, "BiRefNet is not configured yet; fallback selection is active.")
        path = Path(model_path)
        if not path.exists():
            return self.fallback(target_width, target_height, "BiRefNet model file is missing; fallback selection is active.")
        try:
            session = self._get_session(path, providers)
            mask = self._run_session(session, image, target_width, target_height)
            return SegmentResult(
                mask=mask,
                model_id="birefnet",
                model_version=model_version or "onnx",
                fallback=False,
                message="Smart object selection ready.",
            )
        except Exception as exc:
            return self.fallback(target_width, target_height, f"BiRefNet failed; fallback selection is active. {exc}")

    def fallback(self, width: int, height: int, message: str) -> SegmentResult:
        return SegmentResult(
            mask=fallback_subject_mask(width, height),
            model_id="birefnet-fallback",
            model_version="fallback-0.1",
            fallback=True,
            message=message,
        )

    def _get_session(self, path: Path, providers: list[str] | None) -> Any:
        provider_key = providers or []
        if self._session is not None and self._model_path == str(path) and self._providers == provider_key:
            return self._session
        import onnxruntime as ort  # type: ignore

        available = set(ort.get_available_providers())
        requested = [provider for provider in provider_key if provider in available]
        if not requested:
            preferred = [
                "CUDAExecutionProvider",
                "DmlExecutionProvider",
                "DirectMLExecutionProvider",
                "CoreMLExecutionProvider",
                "CPUExecutionProvider",
            ]
            requested = [provider for provider in preferred if provider in available]
        if not requested:
            requested = ["CPUExecutionProvider"]
        self._session = ort.InferenceSession(str(path), providers=requested)
        self._model_path = str(path)
        self._providers = provider_key
        return self._session

    def _run_session(self, session: Any, image: Image.Image, target_width: int, target_height: int) -> np.ndarray:
        input_meta = session.get_inputs()[0]
        input_name = input_meta.name
        model_width, model_height = infer_input_size(input_meta.shape)
        rgb = image.convert("RGB").resize((model_width, model_height), Image.Resampling.BICUBIC)
        arr = np.asarray(rgb).astype(np.float32) / 255.0
        arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
        tensor = np.transpose(arr, (2, 0, 1))[None, ...].astype(np.float32)
        outputs = session.run(None, {input_name: tensor})
        mask = output_to_mask(outputs[0])
        pil = Image.fromarray(mask, mode="L").resize((target_width, target_height), Image.Resampling.LANCZOS)
        return np.array(pil, dtype=np.uint8)


def infer_input_size(shape: list[Any] | tuple[Any, ...]) -> tuple[int, int]:
    dims = list(shape)
    if len(dims) == 4:
        if dims[1] == 3:
            height = int(dims[2]) if isinstance(dims[2], int) and dims[2] > 0 else 1024
            width = int(dims[3]) if isinstance(dims[3], int) and dims[3] > 0 else 1024
            return width, height
        if dims[3] == 3:
            height = int(dims[1]) if isinstance(dims[1], int) and dims[1] > 0 else 1024
            width = int(dims[2]) if isinstance(dims[2], int) and dims[2] > 0 else 1024
            return width, height
    return 1024, 1024


def output_to_mask(output: Any) -> np.ndarray:
    arr = np.asarray(output)
    while arr.ndim > 2:
        arr = arr[0]
    arr = arr.astype(np.float32)
    if arr.size == 0:
        raise RuntimeError("BiRefNet returned an empty mask")
    arr_min = float(np.nanmin(arr))
    arr_max = float(np.nanmax(arr))
    if arr_min < 0.0 or arr_max > 1.0:
        arr = 1.0 / (1.0 + np.exp(-arr))
        arr_min = float(np.nanmin(arr))
        arr_max = float(np.nanmax(arr))
    if arr_max - arr_min > 1e-6:
        arr = (arr - arr_min) / (arr_max - arr_min)
    arr = np.clip(arr, 0.0, 1.0)
    return (arr * 255.0).astype(np.uint8)


def fallback_subject_mask(width: int, height: int) -> np.ndarray:
    yy, xx = np.ogrid[:height, :width]
    cx = width / 2
    cy = height * 0.48
    rx = max(1, width * 0.32)
    ry = max(1, height * 0.42)
    dist = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    soft = np.clip(1.25 - dist, 0, 1).astype(np.float32)
    img = Image.fromarray((soft * 255).astype(np.uint8), mode="L").filter(ImageFilter.GaussianBlur(radius=max(1, min(width, height) * 0.01)))
    return np.array(img, dtype=np.uint8)

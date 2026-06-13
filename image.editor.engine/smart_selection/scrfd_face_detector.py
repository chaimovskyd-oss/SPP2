from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np
from PIL import Image


@dataclass(frozen=True)
class ScrfdDetection:
    x: int
    y: int
    width: int
    height: int
    score: float
    landmarks: list[dict[str, int]]

    def to_json(self) -> dict[str, Any]:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "score": self.score,
            "landmarks": self.landmarks,
        }


class ScrfdFaceDetector:
    def __init__(
        self,
        session: Any,
        *,
        input_size: tuple[int, int] = (640, 640),
        score_threshold: float = 0.35,
        nms_threshold: float = 0.4,
    ) -> None:
        self.session = session
        self.input_name = session.get_inputs()[0].name
        self.input_size = input_size
        self.score_threshold = score_threshold
        self.nms_threshold = nms_threshold
        self.strides = (8, 16, 32)
        self.num_anchors = 2

    def detect(self, image: Image.Image) -> list[ScrfdDetection]:
        tensor, scale, original_w, original_h = self._preprocess(image)
        outputs = self.session.run(None, {self.input_name: tensor})

        scores_all: list[np.ndarray] = []
        boxes_all: list[np.ndarray] = []
        kps_all: list[np.ndarray] = []
        input_h, input_w = self.input_size[1], self.input_size[0]

        for level, stride in enumerate(self.strides):
            scores = np.asarray(outputs[level]).reshape(-1)
            bbox_preds = np.asarray(outputs[level + len(self.strides)]).reshape(-1, 4) * stride
            kps_preds = np.asarray(outputs[level + len(self.strides) * 2]).reshape(-1, 10) * stride
            anchors = _anchor_centers(input_w, input_h, stride, self.num_anchors)
            keep = np.where(scores >= self.score_threshold)[0]
            if keep.size == 0:
                continue
            scores_all.append(scores[keep])
            boxes_all.append(_distance_to_bbox(anchors[keep], bbox_preds[keep]))
            kps_all.append(_distance_to_kps(anchors[keep], kps_preds[keep]))

        if not scores_all:
            return []

        scores = np.concatenate(scores_all, axis=0)
        boxes = np.concatenate(boxes_all, axis=0) / max(scale, 1e-6)
        kps = np.concatenate(kps_all, axis=0) / max(scale, 1e-6)
        keep_indices = _nms(boxes, scores, self.nms_threshold)

        detections: list[ScrfdDetection] = []
        for index in keep_indices:
            x1, y1, x2, y2 = boxes[index]
            x1 = float(np.clip(x1, 0, original_w))
            y1 = float(np.clip(y1, 0, original_h))
            x2 = float(np.clip(x2, 0, original_w))
            y2 = float(np.clip(y2, 0, original_h))
            width = max(0, int(round(x2 - x1)))
            height = max(0, int(round(y2 - y1)))
            if width <= 0 or height <= 0:
                continue
            landmarks = [
                {
                    "x": int(round(float(np.clip(kps[index, point_i, 0], 0, original_w)))),
                    "y": int(round(float(np.clip(kps[index, point_i, 1], 0, original_h)))),
                }
                for point_i in range(5)
            ]
            detections.append(ScrfdDetection(
                x=int(round(x1)),
                y=int(round(y1)),
                width=width,
                height=height,
                score=float(scores[index]),
                landmarks=landmarks,
            ))

        return detections

    def warmup(self) -> None:
        blank = np.zeros((1, 3, self.input_size[1], self.input_size[0]), dtype=np.float32)
        self.session.run(None, {self.input_name: blank})

    def _preprocess(self, image: Image.Image) -> tuple[np.ndarray, float, int, int]:
        rgb = np.asarray(image.convert("RGB"))
        original_h, original_w = rgb.shape[:2]
        input_w, input_h = self.input_size
        scale = min(input_w / max(1, original_w), input_h / max(1, original_h))
        resized_w = max(1, int(round(original_w * scale)))
        resized_h = max(1, int(round(original_h * scale)))

        try:
            import cv2  # type: ignore

            resized = cv2.resize(rgb, (resized_w, resized_h), interpolation=cv2.INTER_LINEAR)
        except Exception:
            resized = np.asarray(Image.fromarray(rgb).resize((resized_w, resized_h), Image.Resampling.BILINEAR))

        canvas = np.zeros((input_h, input_w, 3), dtype=np.float32)
        canvas[:resized_h, :resized_w, :] = resized.astype(np.float32)
        canvas = (canvas - 127.5) / 128.0
        tensor = np.transpose(canvas, (2, 0, 1))[None, :, :, :].astype(np.float32)
        return tensor, scale, original_w, original_h


@lru_cache(maxsize=16)
def _anchor_centers(input_w: int, input_h: int, stride: int, num_anchors: int) -> np.ndarray:
    height = input_h // stride
    width = input_w // stride
    shifts_x = np.arange(width, dtype=np.float32) * stride
    shifts_y = np.arange(height, dtype=np.float32) * stride
    grid_x, grid_y = np.meshgrid(shifts_x, shifts_y)
    centers = np.stack((grid_x, grid_y), axis=-1).reshape(-1, 2)
    if num_anchors > 1:
        centers = np.stack([centers] * num_anchors, axis=1).reshape(-1, 2)
    return centers


def _distance_to_bbox(points: np.ndarray, distance: np.ndarray) -> np.ndarray:
    x1 = points[:, 0] - distance[:, 0]
    y1 = points[:, 1] - distance[:, 1]
    x2 = points[:, 0] + distance[:, 2]
    y2 = points[:, 1] + distance[:, 3]
    return np.stack((x1, y1, x2, y2), axis=-1)


def _distance_to_kps(points: np.ndarray, distance: np.ndarray) -> np.ndarray:
    preds = []
    for i in range(0, distance.shape[1], 2):
        px = points[:, 0] + distance[:, i]
        py = points[:, 1] + distance[:, i + 1]
        preds.append(np.stack((px, py), axis=-1))
    return np.stack(preds, axis=1)


def _nms(boxes: np.ndarray, scores: np.ndarray, threshold: float) -> list[int]:
    if boxes.size == 0:
        return []
    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]
    areas = np.maximum(0, x2 - x1 + 1) * np.maximum(0, y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep: list[int] = []

    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        if order.size == 1:
            break
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1 + 1)
        h = np.maximum(0.0, yy2 - yy1 + 1)
        inter = w * h
        overlap = inter / np.maximum(areas[i] + areas[order[1:]] - inter, 1e-6)
        order = order[np.where(overlap <= threshold)[0] + 1]

    return keep

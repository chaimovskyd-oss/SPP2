from __future__ import annotations

from typing import Any, Callable

import numpy as np
from PIL import Image

ProgressCallback = Callable[[dict[str, Any]], None]

try:
    from numba import njit  # type: ignore

    _HAS_NUMBA = True
except Exception:  # pragma: no cover - numba optional
    _HAS_NUMBA = False

    def njit(*args: Any, **kwargs: Any):  # type: ignore
        if len(args) == 1 and callable(args[0]) and not kwargs:
            return args[0]

        def wrap(fn: Any) -> Any:
            return fn

        return wrap


@njit(cache=True)
def _patch_dist(img: np.ndarray, yc: int, xc: int, sy: int, sx: int, r: int, H: int, W: int, best: float) -> float:
    total = 0.0
    pen = 3.0 * 255.0 * 255.0
    for dy in range(-r, r + 1):
        ay = yc + dy
        by = sy + dy
        for dx in range(-r, r + 1):
            ax = xc + dx
            bx = sx + dx
            if ay < 0 or ay >= H or ax < 0 or ax >= W or by < 0 or by >= H or bx < 0 or bx >= W:
                total += pen
            else:
                d0 = img[ay, ax, 0] - img[by, bx, 0]
                d1 = img[ay, ax, 1] - img[by, bx, 1]
                d2 = img[ay, ax, 2] - img[by, bx, 2]
                total += d0 * d0 + d1 * d1 + d2 * d2
        if total >= best:
            return total
    return total


@njit(cache=True)
def _patchmatch(
    img: np.ndarray,
    target: np.ndarray,
    src_center: np.ndarray,
    nnf_y: np.ndarray,
    nnf_x: np.ndarray,
    ty: np.ndarray,
    tx: np.ndarray,
    ntar: int,
    r: int,
    H: int,
    W: int,
    iters: int,
    src_ys: np.ndarray,
    src_xs: np.ndarray,
    nsrc: int,
) -> None:
    for it in range(iters):
        forward = (it % 2) == 0
        if forward:
            start, end, step = 0, ntar, 1
        else:
            start, end, step = ntar - 1, -1, -1
        i = start
        while i != end:
            y = ty[i]
            x = tx[i]
            best = _patch_dist(img, y, x, nnf_y[y, x], nnf_x[y, x], r, H, W, 1e18)
            off = -1 if forward else 1
            # horizontal propagation
            nx = x + off
            if 0 <= nx < W and target[y, nx]:
                cy = nnf_y[y, nx]
                cx = nnf_x[y, nx] - off
                if 0 <= cy < H and 0 <= cx < W and src_center[cy, cx]:
                    d = _patch_dist(img, y, x, cy, cx, r, H, W, best)
                    if d < best:
                        best = d
                        nnf_y[y, x] = cy
                        nnf_x[y, x] = cx
            # vertical propagation
            ny = y + off
            if 0 <= ny < H and target[ny, x]:
                cy = nnf_y[ny, x] - off
                cx = nnf_x[ny, x]
                if 0 <= cy < H and 0 <= cx < W and src_center[cy, cx]:
                    d = _patch_dist(img, y, x, cy, cx, r, H, W, best)
                    if d < best:
                        best = d
                        nnf_y[y, x] = cy
                        nnf_x[y, x] = cx
            # random search (exponentially shrinking radius)
            rad = H if H > W else W
            cyb = nnf_y[y, x]
            cxb = nnf_x[y, x]
            while rad >= 1:
                ry = np.random.randint(cyb - rad, cyb + rad + 1)
                rx = np.random.randint(cxb - rad, cxb + rad + 1)
                if 0 <= ry < H and 0 <= rx < W and src_center[ry, rx]:
                    d = _patch_dist(img, y, x, ry, rx, r, H, W, best)
                    if d < best:
                        best = d
                        nnf_y[y, x] = ry
                        nnf_x[y, x] = rx
                rad //= 2
            i += step


@njit(cache=True)
def _reconstruct(
    img: np.ndarray,
    target: np.ndarray,
    nnf_y: np.ndarray,
    nnf_x: np.ndarray,
    ty: np.ndarray,
    tx: np.ndarray,
    ntar: int,
    r: int,
    H: int,
    W: int,
) -> None:
    accum = np.zeros((H, W, 3), np.float64)
    weight = np.zeros((H, W), np.float64)
    for i in range(ntar):
        y = ty[i]
        x = tx[i]
        sy = nnf_y[y, x]
        sx = nnf_x[y, x]
        for dy in range(-r, r + 1):
            yy = y + dy
            syy = sy + dy
            if yy < 0 or yy >= H or syy < 0 or syy >= H:
                continue
            for dx in range(-r, r + 1):
                xx = x + dx
                sxx = sx + dx
                if xx < 0 or xx >= W or sxx < 0 or sxx >= W:
                    continue
                if not target[yy, xx]:
                    continue
                accum[yy, xx, 0] += img[syy, sxx, 0]
                accum[yy, xx, 1] += img[syy, sxx, 1]
                accum[yy, xx, 2] += img[syy, sxx, 2]
                weight[yy, xx] += 1.0
    for i in range(ntar):
        y = ty[i]
        x = tx[i]
        w = weight[y, x]
        if w > 0.0:
            img[y, x, 0] = accum[y, x, 0] / w
            img[y, x, 1] = accum[y, x, 1] / w
            img[y, x, 2] = accum[y, x, 2] / w


class TextureFillService:
    """Classic content-aware / patch-based fill (PatchMatch). Best for stochastic textures
    (grass, foliage, gravel) and the only engine that honours Sampling Include/Exclude regions.
    CPU-only, no model download. Falls back to OpenCV Telea init when accelerated path is unusable."""

    def fill(
        self,
        image_patch: Image.Image,
        mask_patch: Image.Image,
        options: dict[str, Any],
        *,
        sampling_include: np.ndarray | None = None,
        sampling_exclude: np.ndarray | None = None,
        progress: ProgressCallback | None = None,
    ) -> Image.Image:
        import cv2  # type: ignore

        rgb_full = np.asarray(image_patch.convert("RGB"), dtype=np.uint8)
        target_full = np.asarray(mask_patch.convert("L"), dtype=np.uint8) > 128
        full_h, full_w = target_full.shape

        preview = bool(options.get("preview"))
        max_side = int(options.get("textureMaxSide") or (240 if preview else 480))
        if not _HAS_NUMBA:
            max_side = min(max_side, 160)

        scale = min(1.0, max_side / float(max(full_h, full_w)))
        wt = max(8, int(round(full_w * scale)))
        ht = max(8, int(round(full_h * scale)))

        rgb = cv2.resize(rgb_full, (wt, ht), interpolation=cv2.INTER_AREA)
        target = cv2.resize(target_full.astype(np.uint8), (wt, ht), interpolation=cv2.INTER_NEAREST) > 0
        include = _resize_mask(sampling_include, wt, ht, cv2)
        exclude = _resize_mask(sampling_exclude, wt, ht, cv2)

        H, W = ht, wt
        if progress is not None:
            progress({"operation": "inpaint_remove", "phase": "inpaint", "message": "מילוי טקסטורה...", "percent": 20, "modelId": "texture_fill"})

        # Telea provides a smooth starting estimate; PatchMatch then injects real texture.
        target_u8 = (target.astype(np.uint8)) * 255
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        init_bgr = cv2.inpaint(bgr, target_u8, 3, cv2.INPAINT_TELEA)
        img = cv2.cvtColor(init_bgr, cv2.COLOR_BGR2RGB).astype(np.float64)

        # Valid source CENTERS: known pixels, inside include (if given), outside exclude,
        # and far enough from the hole/border that the whole patch is valid.
        r = 3
        valid = (~target)
        if include is not None:
            valid = valid & include
        if exclude is not None:
            valid = valid & (~exclude)
        kernel = np.ones((2 * r + 1, 2 * r + 1), np.uint8)
        src_center = cv2.erode(valid.astype(np.uint8), kernel, borderType=cv2.BORDER_CONSTANT, borderValue=0) > 0

        src_idx = np.where(src_center)
        nsrc = int(src_idx[0].shape[0])
        if nsrc == 0:
            # No admissible source (e.g. exclude removed everything) → keep Telea result.
            out = np.clip(img, 0, 255).astype(np.uint8)
            return Image.fromarray(cv2.resize(out, (full_w, full_h), interpolation=cv2.INTER_LANCZOS4), mode="RGB")

        src_ys = src_idx[0].astype(np.int64)
        src_xs = src_idx[1].astype(np.int64)
        tgt_idx = np.where(target)
        ty = tgt_idx[0].astype(np.int64)
        tx = tgt_idx[1].astype(np.int64)
        ntar = int(ty.shape[0])

        nnf_y = np.zeros((H, W), np.int64)
        nnf_x = np.zeros((H, W), np.int64)
        rng = np.random.default_rng(int(options.get("textureSeed") or 1234))
        init_pick = rng.integers(0, nsrc, size=ntar)
        for i in range(ntar):
            k = int(init_pick[i])
            nnf_y[ty[i], tx[i]] = src_ys[k]
            nnf_x[ty[i], tx[i]] = src_xs[k]

        n_em = max(2, min(8, int(options.get("textureEm") or (3 if preview else 5))))
        pm_iters = 4
        for em in range(n_em):
            _patchmatch(img, target, src_center, nnf_y, nnf_x, ty, tx, ntar, r, H, W, pm_iters, src_ys, src_xs, nsrc)
            _reconstruct(img, target, nnf_y, nnf_x, ty, tx, ntar, r, H, W)
            if progress is not None:
                progress({"operation": "inpaint_remove", "phase": "inpaint", "message": "מילוי טקסטורה...", "percent": 20 + int((em + 1) / n_em * 70), "modelId": "texture_fill"})

        out = np.clip(img, 0, 255).astype(np.uint8)
        if (H, W) != (full_h, full_w):
            out = cv2.resize(out, (full_w, full_h), interpolation=cv2.INTER_LANCZOS4)
        return Image.fromarray(out, mode="RGB")


def _resize_mask(mask: np.ndarray | None, w: int, h: int, cv2: Any) -> np.ndarray | None:
    if mask is None:
        return None
    m = np.asarray(mask)
    if m.dtype != np.uint8:
        m = (m > 0).astype(np.uint8)
    resized = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
    return resized > 0

"""
harmonize_iih_runner.py – IntrinsicHarmony (iih_base_gd) neural runner.

On first use:
  1. Downloads the IntrinsicHarmony repo zip from GitHub → extracts models/ dir
  2. Downloads checkpoint via gdown from Google Drive (~47 MB)

The model is then cached in $SPP2_MODELS_DIR/harmonize/iih/.
Subsequent calls load from cache instantly.

Model: iih_base_gd (BaseGDGenerator, CVPR 2021)
Paper: "Intrinsic Image Harmonization"
Repo:  https://github.com/zhenglab/IntrinsicHarmony
"""

from __future__ import annotations

import os
import sys
import shutil
import urllib.request
import zipfile
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np


# ─── Cache layout ─────────────────────────────────────────────────────────────

def _iih_dir() -> Path:
    root = Path(os.environ.get("SPP2_MODELS_DIR", "models"))
    return root / "harmonize" / "iih"


_REPO_ZIP_URL = (
    "https://github.com/zhenglab/IntrinsicHarmony/archive/refs/heads/main.zip"
)
_WEIGHTS_GDRIVE_ID = "1L4SgUBLi5wCfDb0bNmB_qac7WSk6WUfM"
_WEIGHTS_FILENAME = "iih_base_gd.pth"
_SETUP_SENTINEL = ".models_extracted_v2"   # bumped so old installs re-extract
_EXTRACT_DIRS = {"models", "util"}         # util/ needed by harmony_networks imports
_INPUT_SIZE = 256  # model trained on 256×256


# ─── First-time setup ────────────────────────────────────────────────────────

def _download_repo_models(iih_dir: Path) -> None:
    """Download repo zip and extract models/ and util/ subdirectories."""
    zip_path = iih_dir / "_repo.zip"
    print("[IIH] Downloading IntrinsicHarmony source (~500 KB)...", flush=True)
    urllib.request.urlretrieve(_REPO_ZIP_URL, str(zip_path))

    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.namelist():
            parts = Path(member).parts
            # members look like: IntrinsicHarmony-main/models/harmony_networks.py
            if len(parts) >= 2 and parts[1] in _EXTRACT_DIRS:
                subdir = parts[1]
                rel = Path(*parts[2:]) if len(parts) > 2 else Path()
                dst = iih_dir / subdir / rel
                if member.endswith("/"):
                    dst.mkdir(parents=True, exist_ok=True)
                else:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(member) as src, open(dst, "wb") as out:
                        shutil.copyfileobj(src, out)

    zip_path.unlink(missing_ok=True)
    (iih_dir / _SETUP_SENTINEL).touch()
    print("[IIH] Source files extracted.", flush=True)


def _download_weights(iih_dir: Path) -> Path:
    """Download model checkpoint via gdown. Returns path to .pth file."""
    weights_path = iih_dir / _WEIGHTS_FILENAME
    if weights_path.exists() and weights_path.stat().st_size > 1_000_000:
        return weights_path

    try:
        import gdown  # type: ignore
    except ImportError:
        raise RuntimeError(
            "gdown is required to download IIH weights. "
            "Install it: pip install gdown"
        )

    print("[IIH] Downloading model weights (~47 MB) from Google Drive...", flush=True)
    url = f"https://drive.google.com/uc?id={_WEIGHTS_GDRIVE_ID}"
    gdown.download(url, str(weights_path), quiet=False)

    if not weights_path.exists() or weights_path.stat().st_size < 1_000_000:
        weights_path.unlink(missing_ok=True)
        raise RuntimeError(
            "Failed to download IIH weights from Google Drive. "
            "Check internet connection or Google Drive availability."
        )
    return weights_path


def _ensure_setup(iih_dir: Path) -> Path:
    """Ensure repo models + weights are present. Returns path to .pth file."""
    iih_dir.mkdir(parents=True, exist_ok=True)

    sentinel = iih_dir / _SETUP_SENTINEL
    missing = any(not (iih_dir / d).exists() for d in _EXTRACT_DIRS)
    if not sentinel.exists() or missing:
        sentinel.unlink(missing_ok=True)
        _download_repo_models(iih_dir)

    return _download_weights(iih_dir)


def is_iih_available() -> bool:
    """Return True if the model weights are already downloaded (no network needed)."""
    weights = _iih_dir() / _WEIGHTS_FILENAME
    return weights.exists() and weights.stat().st_size > 1_000_000


# ─── Model loading ────────────────────────────────────────────────────────────

_cached: dict = {}


def _build_opt(device: str) -> SimpleNamespace:
    """Default hyper-parameters for iih_base_gd (from base_options.py defaults)."""
    return SimpleNamespace(
        n_downsample=2,
        input_nc=3,
        output_nc=3,
        ngf=64,
        activ="lrelu",
        pad_type="reflect",
        ifm_n_res=0,
        inharmonyfree_norm="ln",
        inharmonyfree_embed_layers=2,
        device=device,
    )


def _load_model(weights_path: Path, iih_dir: Path):
    if "model" in _cached:
        return _cached["model"], _cached["device"]

    import torch

    # Add both models/ and iih_dir root (so 'util' package is importable) to sys.path
    models_dir = str(iih_dir / "models")
    iih_root = str(iih_dir)
    for p in [iih_root, models_dir]:
        if p not in sys.path:
            sys.path.insert(0, p)

    try:
        from harmony_networks import BaseGDGenerator  # type: ignore
    except ImportError as exc:
        raise RuntimeError(f"Cannot import BaseGDGenerator from {models_dir}: {exc}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    opt = _build_opt(device)

    model = BaseGDGenerator(opt=opt)

    ckpt = torch.load(str(weights_path), map_location=device, weights_only=False)

    # Handle multiple checkpoint formats
    if isinstance(ckpt, dict):
        sd = (
            ckpt.get("netG")
            or ckpt.get("state_dict")
            or ckpt.get("generator")
        )
        if sd is None:
            # Might be a raw state dict
            sd = ckpt
    else:
        sd = ckpt

    # Strip DataParallel "module." prefix if present
    if isinstance(sd, dict) and any(k.startswith("module.") for k in sd):
        sd = {k[len("module."):]: v for k, v in sd.items()}

    model.load_state_dict(sd, strict=False)
    model.eval()
    model.to(device)

    _cached.update({"model": model, "device": device})
    print(f"[IIH] Model loaded on {device}.", flush=True)
    return model, device


# ─── Inference ────────────────────────────────────────────────────────────────

def run_iih(
    layer_rgba: np.ndarray,  # uint8 (H, W, 4) – foreground with alpha
    bg_rgb: np.ndarray,       # uint8 (H, W, 3) – background without layer
) -> np.ndarray | None:
    """
    Harmonize layer_rgba against bg_rgb using the IIH neural model.

    Returns harmonized RGBA uint8 (H, W, 4) with the original alpha preserved,
    or None if the model is unavailable or inference fails (caller falls back).
    """
    try:
        import torch
        import torch.nn.functional as F
    except ImportError:
        return None

    iih_dir = _iih_dir()
    try:
        weights_path = _ensure_setup(iih_dir)
        model, device = _load_model(weights_path, iih_dir)
    except Exception as exc:
        print(f"[IIH] Setup error: {exc}", flush=True)
        return None

    H, W = layer_rgba.shape[:2]
    alpha = layer_rgba[:, :, 3]         # uint8 (H, W)
    layer_rgb = layer_rgba[:, :, :3]    # uint8 (H, W, 3)

    # Resize background to match layer if needed
    if bg_rgb.shape[:2] != (H, W):
        bg_rgb = cv2.resize(bg_rgb, (W, H), interpolation=cv2.INTER_LINEAR)

    # Build composite: alpha-blend foreground over background
    alpha_f = alpha.astype(np.float32) / 255.0    # (H, W) in [0, 1]
    composite = (
        layer_rgb.astype(np.float32) * alpha_f[..., np.newaxis]
        + bg_rgb.astype(np.float32) * (1.0 - alpha_f[..., np.newaxis])
    ).astype(np.uint8)

    # Binary foreground mask
    mask_np = (alpha_f > (30.0 / 255.0)).astype(np.float32)  # (H, W)

    # Resize to 256×256
    comp_s = cv2.resize(composite, (_INPUT_SIZE, _INPUT_SIZE), interpolation=cv2.INTER_LINEAR)
    mask_s = cv2.resize(mask_np, (_INPUT_SIZE, _INPUT_SIZE), interpolation=cv2.INTER_NEAREST)

    # Build tensors
    comp_t = (
        torch.from_numpy(comp_s.astype(np.float32) / 255.0)
        .permute(2, 0, 1)
        .unsqueeze(0)
        .to(device)
    )  # (1, 3, 256, 256)

    mask_t = (
        torch.from_numpy(mask_s)
        .unsqueeze(0)
        .unsqueeze(0)
        .to(device)
    )  # (1, 1, 256, 256)

    # IIH input: concatenate composite + mask → (1, 4, 256, 256)
    inputs = torch.cat([comp_t, mask_t], dim=1)

    # mask_r at encoder feature-map resolution: 256 / 2^n_downsample = 64
    feat_size = _INPUT_SIZE // (2 ** 2)            # 64
    mask_r = F.interpolate(mask_t, size=(feat_size, feat_size), mode="nearest")
    mask_r_32 = F.interpolate(mask_t, size=(32, 32), mode="nearest")

    try:
        with torch.no_grad():
            outputs = model(inputs, mask_r, mask_r_32)
    except Exception as exc:
        print(f"[IIH] Inference error: {exc}", flush=True)
        return None

    harmonized_t = outputs[0] if isinstance(outputs, (tuple, list)) else outputs

    # Back to numpy uint8 (256, 256, 3)
    harm_np = (
        harmonized_t.squeeze(0).permute(1, 2, 0).clamp(0.0, 1.0).cpu().numpy()
        * 255.0
    ).astype(np.uint8)

    # Resize back to original resolution
    harm_full = cv2.resize(harm_np, (W, H), interpolation=cv2.INTER_LINEAR)

    # Copy harmonized pixels only where the foreground is opaque;
    # transparent areas keep their original (transparent) values.
    opaque = alpha_f > (30.0 / 255.0)
    result_rgb = layer_rgb.copy()
    result_rgb[opaque] = harm_full[opaque]

    return np.dstack([result_rgb, alpha]).astype(np.uint8)

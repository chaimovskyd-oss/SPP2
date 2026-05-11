"""Product Library storage — all file I/O for SPP integration.

Data lives in product_library/ next to this file:
  products_library.json  — product catalogue
  masks/                 — local mask files
  thumbnails/            — cached remote thumbnails (keyed by URL md5)
"""

import csv
import json
import re
import shutil
import hashlib
import io
from pathlib import Path
from typing import List, Tuple

from .pl_models import Product

# ── Paths ──────────────────────────────────────────────────────────────────────

PRODUCT_LIBRARY_DIR = str(Path(__file__).resolve().parent)
_ROOT = Path(PRODUCT_LIBRARY_DIR)

DATA_FILE  = _ROOT / "products_library.json"
MASKS_DIR  = _ROOT / "masks"
THUMB_DIR  = _ROOT / "thumbnails"
EXPORT_DIR = _ROOT / "exports"


def _ensure_dirs():
    for d in (DATA_FILE.parent, MASKS_DIR, THUMB_DIR, EXPORT_DIR):
        d.mkdir(parents=True, exist_ok=True)


# ── Helpers ────────────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    text = str(text or "product").strip().lower()
    text = re.sub(r"[^\w֐-׿]+", "_", text, flags=re.UNICODE)
    return text.strip("_") or "product"


def safe_float(value, default: float = 0.0) -> float:
    try:
        if value in (None, "", "nan"):
            return default
        return float(value)
    except Exception:
        return default


def _parse_list(value) -> list:
    if value is None or value == "" or str(value).lower() == "nan":
        return []
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        try:
            import ast
            parsed = ast.literal_eval(value)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return [str(value)]


# ── CRUD ───────────────────────────────────────────────────────────────────────

def load_products() -> List[Product]:
    _ensure_dirs()
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]", encoding="utf-8")
        return []
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return [Product.from_dict(item) for item in data]


def save_products(products: List[Product]):
    _ensure_dirs()
    DATA_FILE.write_text(
        json.dumps([p.to_dict() for p in products], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ── Mask operations ────────────────────────────────────────────────────────────

def copy_mask_to_library(src_path: str, product_id: str) -> str:
    """Copy a mask file into product_library/masks/ and return relative path."""
    _ensure_dirs()
    src = Path(src_path)
    ext = src.suffix.lower() or ".png"
    dst = MASKS_DIR / f"{slugify(product_id)}{ext}"
    shutil.copy2(src, dst)
    return str(dst.relative_to(_ROOT))


def remove_white_background(src_path: str, dst_path: str, tolerance: int = 28):
    """Remove near-white pixels from an image and save as transparent PNG."""
    from PIL import Image
    img = Image.open(src_path).convert("RGBA")
    pix = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if r >= 255 - tolerance and g >= 255 - tolerance and b >= 255 - tolerance:
                pix[x, y] = (255, 255, 255, 0)
    img.save(dst_path)


# ── Path resolution ────────────────────────────────────────────────────────────

def resolve_mask_path(mask_path: str) -> str:
    """Return absolute path for a mask_path that may be relative to product_library/."""
    if not mask_path:
        return ""
    p = Path(mask_path)
    if p.is_absolute():
        return str(p)
    candidate = _ROOT / mask_path
    return str(candidate)


# ── Thumbnail cache ────────────────────────────────────────────────────────────

def thumb_cache_path(url: str) -> Path:
    """Return the local cache path for a given image URL."""
    h = hashlib.md5(url.encode("utf-8")).hexdigest()
    return THUMB_DIR / f"{h}.jpg"


def load_cached_thumbnail(url: str):
    """Return a PIL Image if the thumbnail is already cached, else None."""
    if not url:
        return None
    try:
        from PIL import Image
        p = thumb_cache_path(url)
        if p.exists():
            return Image.open(p).convert("RGB")
    except Exception:
        pass
    return None


def download_and_cache_thumbnail(url: str, size=(96, 96)):
    """Download image from URL, cache it, and return a PIL Image or None."""
    if not url:
        return None
    _ensure_dirs()
    cache = thumb_cache_path(url)
    try:
        from PIL import Image

        # Already cached?
        if cache.exists():
            img = Image.open(cache).convert("RGB")
            img.thumbnail(size)
            return img

        # Download
        raw = None
        try:
            import requests
            r = requests.get(url, timeout=8)
            r.raise_for_status()
            raw = r.content
        except ImportError:
            import urllib.request
            with urllib.request.urlopen(url, timeout=8) as resp:
                raw = resp.read()

        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail(size)
        img.save(str(cache), quality=85)
        return img

    except Exception:
        return None


# ── CSV import ────────────────────────────────────────────────────────────────

def _normalize_csv_row(row: dict):
    """Parse a CSV row into a Product, or None if dimensions are missing."""
    width = safe_float(row.get("width") or row.get("width_cm"))
    height = safe_float(row.get("height") or row.get("height_cm"))
    if width <= 0 or height <= 0:
        return None

    pid = str(row.get("id") or slugify(row.get("name", "product")))
    image_url = str(row.get("imageUrl") or row.get("image_url") or "")
    mockup = str(row.get("mockupImageUrl") or row.get("mockup_image_url") or "")
    if image_url.lower() == "nan":
        image_url = ""
    if mockup.lower() == "nan":
        mockup = ""

    return Product(
        id=pid,
        name=str(row.get("name") or "Unnamed Product"),
        category=str(row.get("category") or ""),
        price=safe_float(row.get("price")),
        width_cm=width,
        height_cm=height,
        orientation=str(row.get("orientation") or "any"),
        material="" if str(row.get("material") or "").lower() == "nan" else str(row.get("material") or ""),
        audience=_parse_list(row.get("suitableFor") or row.get("audience")),
        mounting_options=_parse_list(row.get("mountingOptions") or row.get("mounting_options")),
        tips="" if str(row.get("tips") or "").lower() == "nan" else str(row.get("tips") or ""),
        image_url=image_url,
        mockup_image_url=mockup,
        active=str(row.get("active", "true")).lower() not in ("false", "0", "no"),
    )


def import_csv(path: str) -> Tuple[int, int, int]:
    """Import products from a CSV file; merge by ID.  Returns (added, updated, skipped)."""
    products = load_products()
    by_id = {p.id: p for p in products}
    added = updated = skipped = 0

    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            p = _normalize_csv_row(row)
            if not p:
                skipped += 1
                continue
            if p.id in by_id:
                old = by_id[p.id]
                p.mask_path = old.mask_path  # preserve existing mask
                by_id[p.id] = p
                updated += 1
            else:
                by_id[p.id] = p
                added += 1

    save_products(list(by_id.values()))
    return added, updated, skipped

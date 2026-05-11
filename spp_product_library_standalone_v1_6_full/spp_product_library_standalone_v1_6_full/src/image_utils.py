from pathlib import Path
from PIL import Image
import requests, hashlib, io

ROOT = Path(__file__).resolve().parents[1]
THUMB_DIR = ROOT / "thumbnails"

def cache_name(url: str) -> Path:
    h = hashlib.md5(url.encode("utf-8")).hexdigest()
    return THUMB_DIR / f"{h}.jpg"

def get_thumbnail_from_url(url: str, size=(96, 96)) -> Image.Image | None:
    if not url:
        return None
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    path = cache_name(url)
    try:
        if path.exists():
            img = Image.open(path).convert("RGB")
            img.thumbnail(size)
            return img
        r = requests.get(url, timeout=8)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        img.thumbnail(size)
        img.save(path, quality=85)
        return img
    except Exception:
        # Network may be unavailable. Return a simple placeholder instead of breaking thumbnails.
        try:
            img = Image.new("RGB", size, (238, 238, 238))
            return img
        except Exception:
            return None

def remove_white_background(src_path: str, dst_path: str, tolerance=28):
    img = Image.open(src_path).convert("RGBA")
    pix = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if r >= 255 - tolerance and g >= 255 - tolerance and b >= 255 - tolerance:
                pix[x, y] = (255, 255, 255, 0)
    img.save(dst_path)

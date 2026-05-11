from __future__ import annotations
import json
import os
import shutil
import urllib.request
import hashlib
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image, ImageOps


class ProductLibrary:
    def __init__(self, root_dir: str):
        self.root_dir = Path(root_dir)
        self.data_path = self.root_dir / "products_library.json"
        self.thumbnail_dir = self.root_dir / "thumbnails"
        self.mask_dir = self.root_dir / "masks"
        self.thumbnail_dir.mkdir(parents=True, exist_ok=True)
        self.mask_dir.mkdir(parents=True, exist_ok=True)
        self.products: List[Dict[str, Any]] = []
        self.reload()

    def reload(self) -> None:
        if not self.data_path.exists():
            self.products = []
            return
        with self.data_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        self.products = data if isinstance(data, list) else []

    def save(self) -> None:
        with self.data_path.open("w", encoding="utf-8") as f:
            json.dump(self.products, f, ensure_ascii=False, indent=2)

    def categories(self) -> List[str]:
        return sorted({str(p.get("category", "")).strip() for p in self.products if p.get("category")})

    def audiences(self) -> List[str]:
        vals = set()
        for p in self.products:
            aud = p.get("audience", []) or []
            if isinstance(aud, str):
                aud = [aud]
            for item in aud:
                if item:
                    vals.add(str(item))
        return sorted(vals)

    def materials(self) -> List[str]:
        return sorted({str(p.get("material", "")).strip() for p in self.products if p.get("material")})

    def resolve_mask_path(self, product: Dict[str, Any]) -> str:
        mask_path = product.get("mask_path") or ""
        if not mask_path:
            return ""
        path = Path(mask_path)
        if path.is_absolute():
            return str(path)
        return str((self.root_dir / mask_path).resolve())

    def image_url_for(self, product: Dict[str, Any]) -> str:
        return product.get("mockup_image_url") or product.get("image_url") or ""

    def thumbnail_path_for(self, product: Dict[str, Any]) -> Optional[Path]:
        url = self.image_url_for(product)
        if not url:
            return None
        pid = str(product.get("id") or product.get("name") or url)
        key = hashlib.sha1((pid + url).encode("utf-8", errors="ignore")).hexdigest()[:16]
        return self.thumbnail_dir / f"{key}.jpg"

    def ensure_thumbnail(self, product: Dict[str, Any], size=(72, 72)) -> Optional[str]:
        thumb_path = self.thumbnail_path_for(product)
        if thumb_path is None:
            return None
        if thumb_path.exists():
            return str(thumb_path)
        url = self.image_url_for(product)
        if not url:
            return None
        tmp = thumb_path.with_suffix(".download")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=8) as r, tmp.open("wb") as f:
                shutil.copyfileobj(r, f)
            with Image.open(tmp) as img:
                img = ImageOps.exif_transpose(img).convert("RGB")
                img.thumbnail(size)
                canvas = Image.new("RGB", size, "white")
                x = (size[0] - img.width) // 2
                y = (size[1] - img.height) // 2
                canvas.paste(img, (x, y))
                canvas.save(thumb_path, "JPEG", quality=85)
            tmp.unlink(missing_ok=True)
            return str(thumb_path)
        except Exception:
            tmp.unlink(missing_ok=True)
            return None

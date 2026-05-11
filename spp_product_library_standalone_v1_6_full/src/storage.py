import csv, json, ast, shutil, re
from pathlib import Path
from typing import List, Dict, Any, Tuple
from .models import Product, DEFAULT_PRODUCTION

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "products_library.json"
MASKS_DIR = ROOT / "masks"
EXPORTS_DIR = ROOT / "exports"

def ensure_dirs():
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    MASKS_DIR.mkdir(parents=True, exist_ok=True)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

def slugify(text: str) -> str:
    text = str(text or "product").strip().lower()
    text = re.sub(r"[^\w\u0590-\u05FF]+", "_", text, flags=re.UNICODE)
    return text.strip("_") or "product"

def safe_float(value, default=0.0):
    try:
        if value in (None, "", "nan"):
            return default
        return float(value)
    except Exception:
        return default

def parse_list(value):
    if value is None or value == "" or str(value).lower() == "nan":
        return []
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        try:
            parsed = ast.literal_eval(value)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return [str(value)]

def load_products() -> List[Product]:
    ensure_dirs()
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]", encoding="utf-8")
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return [Product.from_dict(item) for item in data]

def save_products(products: List[Product]):
    ensure_dirs()
    DATA_FILE.write_text(json.dumps([p.to_dict() for p in products], ensure_ascii=False, indent=2), encoding="utf-8")

def normalize_csv_row(row: Dict[str, Any]) -> Product | None:
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
        audience=parse_list(row.get("suitableFor") or row.get("audience")),
        mounting_options=parse_list(row.get("mountingOptions") or row.get("mounting_options")),
        tips="" if str(row.get("tips") or "").lower() == "nan" else str(row.get("tips") or ""),
        image_url=image_url,
        mockup_image_url=mockup,
        bleed_cm=safe_float(row.get("bleed_cm"), 0.2),
        production=dict(DEFAULT_PRODUCTION),
        active=str(row.get("active", "true")).lower() not in ("false", "0", "no")
    )

def import_csv(path: str) -> Tuple[int, int, int]:
    products = load_products()
    by_id = {p.id: p for p in products}
    added = updated = skipped = 0

    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            p = normalize_csv_row(row)
            if not p:
                skipped += 1
                continue

            if p.id in by_id:
                old = by_id[p.id]
                p.mask_path = old.mask_path
                by_id[p.id] = p
                updated += 1
            else:
                by_id[p.id] = p
                added += 1

    save_products(list(by_id.values()))
    return added, updated, skipped

def copy_mask_to_library(src_path: str, product_id: str) -> str:
    ensure_dirs()
    src = Path(src_path)
    ext = src.suffix.lower() or ".png"
    dst = MASKS_DIR / f"{slugify(product_id)}{ext}"
    shutil.copy2(src, dst)
    return str(dst.relative_to(ROOT))

def export_selected_product(product: Product) -> Path:
    ensure_dirs()
    payload = {
        "product": product.to_dict(),
        "spp_canvas": {
            "width_cm": product.width_cm + (float(product.bleed_cm or 0) * 2),
            "height_cm": product.height_cm + (float(product.bleed_cm or 0) * 2),
            "safe_width_cm": product.width_cm,
            "safe_height_cm": product.height_cm,
            "bleed_cm": product.bleed_cm,
            "orientation": product.orientation,
            "mask_path": product.mask_path,
            "production": product.production,
        }
    }
    out = EXPORTS_DIR / "selected_product_for_spp.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out

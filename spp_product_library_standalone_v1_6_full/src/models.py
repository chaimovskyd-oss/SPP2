from dataclasses import dataclass, asdict, field
from typing import List, Dict, Any

DEFAULT_PRODUCTION = {
    "printer_type": "",
    "press_temperature_celsius": "",
    "press_time_seconds": "",
    "press_enabled": False,
    "press_notes": "",
}

@dataclass
class Product:
    id: str
    name: str
    category: str = ""
    price: float = 0.0
    width_cm: float = 0.0
    height_cm: float = 0.0
    orientation: str = "any"
    material: str = ""
    audience: List[str] = field(default_factory=list)
    mounting_options: List[str] = field(default_factory=list)
    tips: str = ""
    image_url: str = ""
    mockup_image_url: str = ""
    mask_path: str = ""
    bleed_cm: float = 0.1
    production: Dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_PRODUCTION))
    active: bool = True

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Product":
        allowed = {f.name for f in cls.__dataclass_fields__.values()}
        clean = {k: v for k, v in data.items() if k in allowed}
        if "audience" in clean and not isinstance(clean["audience"], list):
            clean["audience"] = [str(clean["audience"])]
        if "mounting_options" in clean and not isinstance(clean["mounting_options"], list):
            clean["mounting_options"] = [str(clean["mounting_options"])]
        if "bleed_cm" not in clean or clean.get("bleed_cm") in (None, ""):
            clean["bleed_cm"] = 0.2
        try:
            clean["bleed_cm"] = float(clean.get("bleed_cm", 0.2) or 0.2)
        except Exception:
            clean["bleed_cm"] = 0.2
        prod = dict(DEFAULT_PRODUCTION)
        incoming = clean.get("production") or {}
        if isinstance(incoming, dict):
            prod.update(incoming)
        clean["production"] = prod
        return cls(**clean)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        prod = dict(DEFAULT_PRODUCTION)
        prod.update(data.get("production") or {})
        data["production"] = prod
        return data

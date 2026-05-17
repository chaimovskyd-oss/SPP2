"""Product data model for SPP Product Library integration."""

from dataclasses import dataclass, asdict, field
from typing import List, Dict, Any, Optional


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
    active: bool = True
    # Phase 7 — product canvas & print metadata
    bleed_mm: float = 2.0
    safe_area: Optional[Dict[str, Any]] = None        # {top, right, bottom, left} in mm
    print_zones: List[Dict[str, Any]] = field(default_factory=list)
    production_type: Optional[str] = None             # 'photo'|'sublimation'|'laser'|…
    instructions: Optional[Dict[str, Any]] = None     # heat-press settings, notes, …
    recommended_dpi: Optional[int] = None
    tags: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Product":
        allowed = {f for f in cls.__dataclass_fields__}
        clean = {k: v for k, v in data.items() if k in allowed}
        for list_field in ("audience", "mounting_options", "tags"):
            val = clean.get(list_field)
            if val is not None and not isinstance(val, list):
                clean[list_field] = [str(val)] if val else []
        if "print_zones" in clean and not isinstance(clean.get("print_zones"), list):
            clean["print_zones"] = []
        return cls(**clean)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

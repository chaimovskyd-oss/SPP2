"""Product data model for SPP Product Library integration."""

from dataclasses import dataclass, asdict, field
from typing import List, Dict, Any


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

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Product":
        allowed = {f for f in cls.__dataclass_fields__}
        clean = {k: v for k, v in data.items() if k in allowed}
        for list_field in ("audience", "mounting_options"):
            val = clean.get(list_field)
            if val is not None and not isinstance(val, list):
                clean[list_field] = [str(val)] if val else []
        return cls(**clean)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

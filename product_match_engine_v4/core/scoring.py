from __future__ import annotations
from typing import Any, Dict, List


def _to_float(value, default=0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except Exception:
        return default


def image_info(width_px: int, height_px: int) -> Dict[str, Any]:
    ratio = width_px / height_px if height_px else 1.0
    if abs(ratio - 1.0) < 0.08:
        orientation = "square"
    elif ratio > 1:
        orientation = "landscape"
    else:
        orientation = "portrait"
    return {
        "width_px": width_px,
        "height_px": height_px,
        "ratio": ratio,
        "orientation": orientation,
    }


def _aspect_score_for_ratio(image_ratio: float, target_ratio: float) -> float:
    if image_ratio <= 0 or target_ratio <= 0:
        return 0.0
    diff = abs(image_ratio - target_ratio) / max(image_ratio, target_ratio)
    return max(0.0, 100.0 * (1.0 - diff * 1.25))


def aspect_score(image_ratio: float, product_ratio: float, orientation: str) -> float:
    orientation = (orientation or "any").lower().strip()
    if orientation == "any":
        # any = product can be used in the direct ratio OR the inverse ratio equally.
        inverse = 1 / product_ratio if product_ratio else product_ratio
        return max(
            _aspect_score_for_ratio(image_ratio, product_ratio),
            _aspect_score_for_ratio(image_ratio, inverse),
        )
    if orientation == "square":
        return _aspect_score_for_ratio(image_ratio, 1.0)
    return _aspect_score_for_ratio(image_ratio, product_ratio)


def orientation_score(image_orientation: str, product_orientation: str) -> float:
    po = (product_orientation or "any").lower().strip()
    if po == "any":
        return 100.0
    if po == "square":
        return 100.0 if image_orientation == "square" else 70.0
    return 100.0 if image_orientation == po else 35.0


def dpi_score(width_px: int, height_px: int, width_cm: float, height_cm: float, orientation: str) -> tuple[float, float]:
    candidates = [(width_cm, height_cm)]
    if (orientation or "any").lower().strip() == "any":
        candidates.append((height_cm, width_cm))

    best_score = 0.0
    best_dpi = 0.0
    for w_cm, h_cm in candidates:
        if w_cm <= 0 or h_cm <= 0:
            continue
        dpi_x = width_px / (w_cm / 2.54)
        dpi_y = height_px / (h_cm / 2.54)
        effective = min(dpi_x, dpi_y)
        if effective >= 250:
            score = 100.0
        elif effective >= 180:
            score = 75.0 + (effective - 180.0) / 70.0 * 25.0
        elif effective >= 120:
            score = 45.0 + (effective - 120.0) / 60.0 * 30.0
        else:
            score = max(0.0, effective / 120.0 * 45.0)
        if score > best_score:
            best_score = score
            best_dpi = effective
    return best_score, best_dpi


def score_product(product: Dict[str, Any], info: Dict[str, Any]) -> Dict[str, Any]:
    w = _to_float(product.get("width_cm"))
    h = _to_float(product.get("height_cm"))
    orientation = (product.get("orientation") or "any").lower().strip()
    if w <= 0 or h <= 0:
        return {"product": product, "score": 0.0, "warnings": ["Missing dimensions"]}

    p_ratio = w / h
    aspect = aspect_score(info["ratio"], p_ratio, orientation)
    orient = orientation_score(info["orientation"], orientation)
    dpi, effective_dpi = dpi_score(info["width_px"], info["height_px"], w, h, orientation)

    final = aspect * 0.50 + dpi * 0.35 + orient * 0.15
    warnings: List[str] = []
    reasons: List[str] = []

    if aspect >= 85:
        reasons.append("יחס תמונה מתאים מאוד")
    elif aspect >= 65:
        reasons.append("יחס תמונה סביר")
    else:
        warnings.append("יידרש חיתוך או רווח משמעותי")

    if dpi >= 75:
        reasons.append("רזולוציה טובה")
    elif dpi >= 45:
        warnings.append("רזולוציה גבולית")
    else:
        warnings.append("רזולוציה נמוכה")

    if orientation != "any" and orient < 100:
        warnings.append("האוריינטציה לא אידיאלית למוצר")
    elif orientation == "any":
        reasons.append("המוצר תומך גם ביחס הפוך")

    fit_mode = "full_area"
    return {
        "product": product,
        "score": round(final, 1),
        "aspect_score": round(aspect, 1),
        "dpi_score": round(dpi, 1),
        "effective_dpi": round(effective_dpi, 1),
        "orientation_score": round(orient, 1),
        "selected_fit_mode": fit_mode,
        "reason": ", ".join(reasons) if reasons else "התאמה בסיסית",
        "warnings": warnings,
    }


def rank_products(products: List[Dict[str, Any]], image_width_px: int, image_height_px: int) -> List[Dict[str, Any]]:
    info = image_info(image_width_px, image_height_px)
    scored = []
    for product in products:
        if not product.get("active", True):
            continue
        if not product.get("width_cm") or not product.get("height_cm"):
            continue
        scored.append(score_product(product, info))
    return sorted(scored, key=lambda item: item.get("score", 0), reverse=True)

# Product Match Engine V4

Standalone recommendation engine synced with the SPP Product Library.

## Run

```bash
pip install -r requirements.txt
python main.py
```

## What changed in V4

- Uses `product_library/products_library.json` as the single source of truth.
- No separate `products_clean.json`.
- Shows product thumbnails from product URLs with local cache in `product_library/thumbnails/`.
- Thick vertical and horizontal scrollbars.
- Larger rows for thumbnails.
- `orientation=any` checks the product ratio and inverse ratio and takes the best score.
- Exports a stable SPP handoff file: `exports/selected_product_for_spp.json`.
- Can be embedded later using a callback pattern: `on_product_selected(product_data)`.

## SPP handoff contract

When a recommendation is opened, the app exports:

```json
{
  "source": "product_match_engine_v4",
  "product_id": "...",
  "name": "...",
  "width_cm": 15.0,
  "height_cm": 20.0,
  "orientation": "any",
  "mask_path": "...",
  "match_score": 92.0,
  "selected_fit_mode": "full_area"
}
```

SPP should use `width_cm` and `height_cm` as centimeters. Do not multiply by 10 unless calling an internal SPP function that explicitly expects millimeters.

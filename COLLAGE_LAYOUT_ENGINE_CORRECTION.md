# Collage Mode — Layout Engine Correction
## Critical architectural fix before implementing Phase 5

This document corrects a fundamental design flaw in `COLLAGE_MODE_PHASE5_PROMPT.md`.
Apply this correction **before** writing any layout engine code.

---

## THE PROBLEM IN THE CURRENT PLAN

The Phase 5 plan stores `CollageLayout[]` (snapshots of `CollageSlot[]`) inside `CollageRule`.
This causes three breakages:

1. **Canvas resize breaks layout** — stored pixel positions become wrong for the new canvas size
2. **Image count change breaks layout** — a snapshot for 6 images doesn't know how to become 7 or 5 images
3. **Switching layout families breaks assignments** — no consistent slot identity to preserve

The original Python collage app avoids all three problems with a simple principle:

> **A layout is a function, not a snapshot.**
> Geometry is recomputed every time from `(imageCount, canvasW, canvasH, spacingPx, marginPx)`.

---

## REFERENCE: HOW THE PYTHON APP WORKS

### `app/core/collage_engine.py`

**`_make_grid_cells()` (line 62)** — The core building block.
Every single layout family in the Python app calls this function.
It takes `(count, x_start, y_start, available_w, available_h, spacing, max_cols)` and returns
exactly `count` pixel-based `CellRect` objects. Never more, never fewer.
**Last-row stretch** (lines 93–100): if the last row has fewer cells than `max_cols`,
those cells expand proportionally to fill the full row width.

```python
def _make_grid_cells(count, x_start, y_start, available_w, available_h, spacing, max_cols=5):
    cols = min(count, max_cols)
    rows = (count + cols - 1) // cols
    cell_w = (available_w - spacing * (cols - 1)) / max(1, cols)
    cell_h = (available_h - spacing * (rows - 1)) / max(1, rows)
    cells = []
    for i in range(count):
        row = i // cols
        row_start = row * cols
        row_count = min(cols, count - row_start)
        if row_count < cols:          # last row — stretch cells
            w = (available_w - spacing * (row_count - 1)) / row_count
            x = x_start + (i - row_start) * (w + spacing)
        else:
            w = cell_w
            x = x_start + (i % cols) * (cell_w + spacing)
        y = y_start + row * (cell_h + spacing)
        cells.append(CellRect(x, y, w, cell_h))
    return cells
```

**Every layout function signature (lines 185–1115):**
```python
def _hero_top_layout(settings: ProjectSettings, image_count: int) -> LayoutSuggestion:
```
- Takes the current `ProjectSettings` (contains canvas size, spacing, margin)
- Takes `image_count` (current number of images)
- Returns a `LayoutSuggestion` with **exactly** `image_count` cells
- Recomputes geometry from scratch every call

**`generate_suggestions()` (line 1121):**
```python
def generate_suggestions(settings, image_count, images=None, custom_cols=0):
    candidates = [
        _grid_layout(settings, image_count),
        _hero_top_layout(settings, image_count),
        _hero_bottom_layout(settings, image_count),
        _feature_left_layout(settings, image_count),
        _mosaic_layout(settings, image_count),
        # ... 14 more layout functions ...
    ]
    # Line 1181 — invariant enforced with assertion:
    for layout in unique:
        assert len(layout.cells) == image_count
```

The function **does not store** the results. They are generated, scored, and shown to the user.
When the user picks one, only the **family name** (and splitTree ratios if applicable) is saved —
not the pixel positions.

---

### `app/core/template_engine.py`

**`template_to_layout()` (line 23)** — Converts saved relative [0..1] template to pixels:
```python
def template_to_layout(template, canvas_px):
    cw, ch = canvas_px
    cells = []
    for i, slot in enumerate(template.slots):
        cell = CellRect(
            x = round(slot.x * cw),
            y = round(slot.y * ch),
            w = max(1, round(slot.w * cw)),
            h = max(1, round(slot.h * ch)),
            image_index = i if i < template.target_image_count else None,
        )
        cells.append(cell)
    return LayoutSuggestion(name=template.name, cells=cells)
```

**Key insight**: this function is called every time a template is applied or the canvas changes.
The template stores relative [0..1] → multiply by canvas → fresh pixel geometry.
The template does NOT store pixel geometry.

**`layout_to_template()` (line 57)** — The inverse: pixels → relative [0..1]:
```python
def layout_to_template(layout, canvas_px, name='Imported Layout'):
    cw, ch = canvas_px
    slots = [
        TemplateSlot(
            x = round(cell.x / cw, 4),
            y = round(cell.y / ch, 4),
            w = round(cell.w / cw, 4),
            h = round(cell.h / ch, 4),
            # ...
        )
        for cell in layout.cells
    ]
    return Template(id=..., name=name, slots=slots, target_image_count=len(slots))
```

**`apply_template_to_project()` (line 88)** — Applies a saved template:
```python
def apply_template_to_project(template, project):
    layout = template_to_layout(template, project.settings.canvas_px)  # recompute from relative
    for i, cell in enumerate(layout.cells):
        cell.image_index = i if i < len(project.images) else None       # assign in order
    project.selected_layout = layout
    return layout
```

---

### `app/core/layout_tree_engine.py`

**`compute_rects()` (line 51)** — The split tree recomputes from ratios every time:
```python
def compute_rects(tree, canvas_w, canvas_h):
    _compute(tree.root, 0.0, 0.0, float(canvas_w), float(canvas_h), tree.spacing)

def _compute(node, x, y, w, h, sp):
    node.x, node.y, node.w, node.h = x, y, w, h
    if isinstance(node, SplitNode):
        if node.direction == 'H':
            w1 = max(1.0, w * node.ratio - sp/2)
            w2 = max(1.0, w - w1 - sp)
            _compute(node.first,  x,           y, w1, h, sp)
            _compute(node.second, x + w1 + sp, y, w2, h, sp)
        else:
            h1 = max(1.0, h * node.ratio - sp/2)
            h2 = max(1.0, h - h1 - sp)
            _compute(node.first,  x, y,           w, h1, sp)
            _compute(node.second, x, y + h1 + sp, w, h2, sp)
```

**Key insight**: ratios are [0..1] — canvas-size invariant.
Change canvas size → call `compute_rects` again → correct pixel geometry.
The tree stores only `direction` and `ratio` on each node, never pixel values.

**`clamp_ratio()` (line 191)**:
```python
def clamp_ratio(node, new_ratio, min_px=MIN_CELL_PX):
    size = node.w if node.direction == 'H' else node.h
    lo = max(0.02, min_px / size)
    hi = min(0.98, 1.0 - min_px / size)
    return max(lo, min(hi, new_ratio))
```
Enforces minimum cell size (80px) regardless of canvas dimensions.

---

### `app/models/project.py` — `CellRect` (line 136)

```python
@dataclass
class CellRect:
    x: float; y: float; w: float; h: float  # canvas PIXELS
    image_index: Optional[int] = None
    edge_style: str = 'hard'
    fade_amount: int = 16
    fade_sides: str = 'all'
    fade_curve: str = 'smooth'
    rotation_deg: float = 0.0    # visual cell rotation (degrees, arbitrary)
    z_index: int = 0             # draw order — larger = painted above
    mask_seed: int = 0           # deterministic seed for torn paper
    shape_type: str = 'rectangle'
    shape_params: Dict[str, float] = field(default_factory=dict)
```

`CellRect` is always in **canvas pixels**. Never stored long-term. Always regenerated.

---

### `app/models/template.py` — `TemplateSlot` (line 78)

```python
@dataclass
class TemplateSlot:
    id: str
    x: float; y: float; w: float; h: float  # relative [0..1] — NEVER pixels
    shape: SlotShape
    role: str = ''
    group_id: str = ''
    required: bool = True
    label: str = ''
```

`TemplateSlot` is always in **relative [0..1]**. Stored in JSON. Canvas-size invariant.

---

## THE CORRECT ARCHITECTURE FOR PHASE 5

### Two types of slots — clearly separated

| | `CollageSlot` (live) | `CollageTemplateSlot` (saved) |
|---|---|---|
| **Coordinate system** | relative [0..1] | relative [0..1] |
| **Source** | computed by generator function | stored in template JSON |
| **Stored in CollageRule?** | as `cachedSlots` only — not source of truth | No — templates are external |
| **Adapts to image count** | yes — generator recomputes | no — mismatch rules apply |
| **Adapts to canvas size** | yes — generator recomputes | yes — multiply by new canvas |

---

### The corrected `CollageRule` type

```typescript
// src/types/collage.ts

interface CollageRule extends VersionedEntity {
  id: ID;
  pageId: ID;

  // ─── SOURCE OF TRUTH — these three fields define the layout ──────────────
  activeFamily: CollageLayoutFamily;
  spacingMM: number;     // stored in mm — converted to px at compute time
  marginMM: number;      // stored in mm — converted to px at compute time
  splitTree?: CollageSplitNode;  // only for family === "splitTree"
  // For "artisticLayered" — per-slot rotation and z overrides (user-adjustable in future)
  artisticConfig?: CollageArtisticConfig;

  // ─── COMPUTED CACHE — derived from source of truth + current canvas size ─
  // NEVER edit directly. Always call computeSlots() and then setCachedSlots().
  cachedSlots: CollageSlot[];   // relative [0..1], imageCount slots of type "image"

  // ─── IMAGE DATA ───────────────────────────────────────────────────────────
  imagePool: ID[];                          // ordered list of all assetIds
  imageAssignments: CollageImageAssignment[]; // by slotId

  // ─── STYLE ───────────────────────────────────────────────────────────────
  canvasSettings: CollageCanvasSettings;
  smartCropEnabled: boolean;
  smartCropMode: "none" | "face" | "center" | "ruleOfThirds";

  // ─── FRAME REFS ───────────────────────────────────────────────────────────
  frameIds: ID[];   // managed FrameLayer IDs currently on the page

  metadata: Metadata;
}

// NOTE: There is NO `layouts: CollageLayout[]` field.
// Suggestions are generated in-memory and never stored in the project file.
```

---

### The layout generator contract

```typescript
// src/core/collage/collageLayoutEngine.ts

interface CollageLayoutParams {
  imageCount: number;   // number of image slots to produce — EXACTLY this many
  canvasW: number;      // canvas width in pixels
  canvasH: number;      // canvas height in pixels
  spacingPx: number;    // gap between cells in pixels
  marginPx: number;     // outer margin in pixels
  splitTree?: CollageSplitNode;  // only used by generateSplitTreeSlots
}

// Contract: generator must return EXACTLY imageCount slots of type "image"
type CollageLayoutGenerator = (params: CollageLayoutParams) => CollageSlot[];

interface CollageLayoutFamilyDef {
  family: CollageLayoutFamily;
  name: string;
  nameHe: string;
  minImages: number;
  maxImages: number;
  mode: "simple" | "creative" | "both";
  generate: CollageLayoutGenerator;
}

export const LAYOUT_REGISTRY: CollageLayoutFamilyDef[] = [
  { family: "grid",            minImages: 1,  maxImages: 100, mode: "both",     generate: generateGridSlots },
  { family: "hero",            minImages: 2,  maxImages: 100, mode: "both",     generate: generateHeroSlots },
  { family: "mosaic",          minImages: 3,  maxImages: 100, mode: "simple",   generate: generateMosaicSlots },
  { family: "dualHero",        minImages: 2,  maxImages: 100, mode: "simple",   generate: generateDualHeroSlots },
  { family: "triptych",        minImages: 3,  maxImages: 100, mode: "simple",   generate: generateTriptychSlots },
  { family: "strip",           minImages: 2,  maxImages: 8,   mode: "simple",   generate: generateStripSlots },
  { family: "wideBanner",      minImages: 3,  maxImages: 100, mode: "simple",   generate: generateWideBannerSlots },
  { family: "filmStrip",       minImages: 3,  maxImages: 20,  mode: "creative", generate: generateFilmStripSlots },
  { family: "staircase",       minImages: 4,  maxImages: 15,  mode: "creative", generate: generateStaircaseSlots },
  { family: "ringFocus",       minImages: 4,  maxImages: 20,  mode: "creative", generate: generateRingFocusSlots },
  { family: "splitTree",       minImages: 2,  maxImages: 8,   mode: "creative", generate: generateSplitTreeSlots },
  { family: "diagonal",        minImages: 2,  maxImages: 6,   mode: "creative", generate: generateDiagonalBandSlots },
  { family: "diagonalHero",    minImages: 3,  maxImages: 8,   mode: "creative", generate: generateDiagonalHeroSlots },
  { family: "shapedCircle",    minImages: 4,  maxImages: 20,  mode: "creative", generate: generateShapedCircleSlots },
  { family: "shapedHeart",     minImages: 4,  maxImages: 20,  mode: "creative", generate: generateShapedHeartSlots },
  { family: "ringCollage",     minImages: 4,  maxImages: 16,  mode: "creative", generate: generateRingCollageSlots },
  { family: "artisticLayered", minImages: 3,  maxImages: 10,  mode: "creative", generate: generateArtisticLayeredSlots },
];
```

---

### The core building block — `makeGridSlots`

Port of `_make_grid_cells()` from `app/core/collage_engine.py:62`.
All layout generator functions must use this as their building block.

```typescript
// src/core/collage/collageLayoutEngine.ts

/**
 * Uniform grid of `count` image slots within a bounding box.
 * Port of Python's _make_grid_cells() from app/core/collage_engine.py:62
 *
 * Inputs: pixels. Output: CollageSlot[] with relative [0..1] geometry.
 * INVARIANT: always returns exactly `count` slots.
 *
 * LAST ROW STRETCH: if the last row has fewer cells than maxCols,
 * those cells expand proportionally to fill the full row width.
 * This prevents partial empty rows — the defining behavior of collage layout.
 */
export function makeGridSlots(
  count: number,
  xPx: number,       // bounding box left edge in pixels
  yPx: number,       // bounding box top edge in pixels
  availWPx: number,  // available width in pixels
  availHPx: number,  // available height in pixels
  spacingPx: number,
  maxCols: number,
  canvasW: number,   // full canvas width — for normalization to [0..1]
  canvasH: number,   // full canvas height
): CollageSlot[] {
  if (count <= 0) return [];

  const cols = Math.min(count, Math.max(1, maxCols));
  const rows = Math.ceil(count / cols);
  const cellW = (availWPx - spacingPx * (cols - 1)) / cols;
  const cellH = (availHPx - spacingPx * (rows - 1)) / rows;

  return Array.from({ length: count }, (_, i) => {
    const row      = Math.floor(i / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, count - rowStart);

    let xCell: number, wCell: number;
    if (rowCount < cols) {
      // Last partial row: stretch cells to fill full available width
      wCell = (availWPx - spacingPx * (rowCount - 1)) / rowCount;
      xCell = xPx + (i - rowStart) * (wCell + spacingPx);
    } else {
      wCell = cellW;
      xCell = xPx + (i % cols) * (cellW + spacingPx);
    }
    const yCell = yPx + row * (cellH + spacingPx);

    return createCollageSlot({
      type: "image",
      x: xCell / canvasW,
      y: yCell / canvasH,
      w: wCell / canvasW,
      h: cellH  / canvasH,
    });
  });
}
```

---

### Example generator — `generateHeroTopSlots`

Port of `_hero_top_layout()` from `app/core/collage_engine.py:209`.

```typescript
// src/core/collage/collageLayoutEngine.ts

export function generateHeroTopSlots(params: CollageLayoutParams): CollageSlot[] {
  const { imageCount, canvasW, canvasH, spacingPx, marginPx } = params;

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;

  if (imageCount === 1) {
    return [createCollageSlot({
      type: "image", role: "hero",
      x: marginPx / canvasW, y: marginPx / canvasH,
      w: usableW / canvasW,  h: usableH / canvasH,
    })];
  }

  const heroH   = usableH * 0.55;
  const belowH  = usableH - heroH - spacingPx;
  const remaining = imageCount - 1;

  const heroSlot = createCollageSlot({
    type: "image", role: "hero",
    x: marginPx / canvasW,
    y: marginPx / canvasH,
    w: usableW / canvasW,
    h: heroH / canvasH,
  });

  const belowSlots = makeGridSlots(
    remaining,
    marginPx,
    marginPx + heroH + spacingPx,
    usableW,
    belowH,
    spacingPx,
    Math.min(remaining, 4),
    canvasW, canvasH,
  );

  // Returns hero + (imageCount-1) supporting slots = exactly imageCount total
  return [heroSlot, ...belowSlots];
}
```

---

### The five core engine functions

```typescript
// src/core/collage/collageModeEngine.ts

// ─── 1. Generate scored suggestions (in-memory only, never stored) ────────────

interface ScoredLayoutSuggestion {
  family: CollageLayoutFamily;
  name: string;
  nameHe: string;
  slots: CollageSlot[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

export function generateCollageSuggestions(
  imageInputs: CollageImageInput[],
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number,
  mode: CollageComplexityMode,
): ScoredLayoutSuggestion[] {
  const imageCount = imageInputs.length;
  if (imageCount === 0) return [];

  const params: CollageLayoutParams = { imageCount, canvasW, canvasH, spacingPx, marginPx };

  const candidates = LAYOUT_REGISTRY
    .filter(def =>
      imageCount >= def.minImages &&
      imageCount <= def.maxImages &&
      (mode === "creative" || def.mode !== "creative")
    )
    .map(def => {
      const slots = def.generate(params);
      const { total, ...breakdown } = scoreLayout(slots, imageInputs);
      return { family: def.family, name: def.name, nameHe: def.nameHe, slots, score: total, scoreBreakdown: breakdown };
    });

  // Deduplicate structurally identical results
  // (some families collapse to the same layout for certain image counts)
  const seen = new Set<string>();
  return candidates
    .filter(c => {
      const key = c.slots.map(s => `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.w.toFixed(3)},${s.h.toFixed(3)}`).join("|");
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .sort((a, b) => b.score - a.score);
}

// ─── 2. Apply a layout family (user picks from suggestions or switches family) ─

export function applyLayoutFamily(
  rule: CollageRule,
  newFamily: CollageLayoutFamily,
  canvasW: number,
  canvasH: number,
): CollageRule {
  const spacingPx = mmToPx(rule.spacingMM, canvasW);
  const marginPx  = mmToPx(rule.marginMM,  canvasW);
  const imageCount = countAssignableImages(rule);  // pool length

  // For splitTree: build a default tree if switching into it for the first time
  const splitTree = newFamily === "splitTree"
    ? (rule.activeFamily === "splitTree" && rule.splitTree
        ? rule.splitTree                           // keep user-adjusted ratios
        : buildDefaultSplitTree(imageCount))       // fresh balanced tree
    : undefined;

  const params: CollageLayoutParams = { imageCount, canvasW, canvasH, spacingPx, marginPx, splitTree };
  const newSlots = computeSlots(newFamily, params);

  return {
    ...rule,
    activeFamily: newFamily,
    splitTree,
    cachedSlots: newSlots,
    imageAssignments: reIndexAssignments(rule.imageAssignments, rule.cachedSlots, newSlots),
  };
}

// ─── 3. Reflow when canvas size or spacing/margin changes ─────────────────────

export function reflowCollage(
  rule: CollageRule,
  canvasW: number,
  canvasH: number,
): CollageRule {
  // Same family, same spacing/margin (in mm) → same proportional layout
  // splitTree ratios are [0..1] → invariant to canvas size
  const spacingPx = mmToPx(rule.spacingMM, canvasW);
  const marginPx  = mmToPx(rule.marginMM,  canvasW);
  const imageCount = countAssignableImages(rule);

  const params: CollageLayoutParams = {
    imageCount, canvasW, canvasH, spacingPx, marginPx,
    splitTree: rule.splitTree,
  };

  const newSlots = computeSlots(rule.activeFamily, params);

  // Same family → slots are structurally identical, only pixel geometry changed
  // No reIndexAssignments needed — preserve all assignments by index
  const newAssignments = rule.imageAssignments.map((a, i) => ({
    ...a,
    slotId: newSlots[i]?.id ?? a.slotId,
  }));

  return { ...rule, cachedSlots: newSlots, imageAssignments: newAssignments };
}

// ─── 4. Add or remove images ─────────────────────────────────────────────────

export function addImagesToCollage(
  rule: CollageRule,
  newAssetIds: ID[],
  canvasW: number,
  canvasH: number,
): CollageRule {
  const newPool = [...rule.imagePool, ...newAssetIds];
  return recomputeWithNewImageCount(rule, newPool, canvasW, canvasH);
}

export function removeImageFromCollage(
  rule: CollageRule,
  assetId: ID,
  canvasW: number,
  canvasH: number,
): CollageRule {
  const newPool = rule.imagePool.filter(id => id !== assetId);
  return recomputeWithNewImageCount(rule, newPool, canvasW, canvasH);
}

function recomputeWithNewImageCount(
  rule: CollageRule,
  newPool: ID[],
  canvasW: number,
  canvasH: number,
): CollageRule {
  const spacingPx  = mmToPx(rule.spacingMM, canvasW);
  const marginPx   = mmToPx(rule.marginMM,  canvasW);
  const imageCount = newPool.length;

  const splitTree  = rule.activeFamily === "splitTree"
    ? resizeSplitTree(rule.splitTree, imageCount)  // add/remove leaves while preserving ratios
    : undefined;

  const params: CollageLayoutParams = {
    imageCount, canvasW, canvasH, spacingPx, marginPx, splitTree,
  };

  const newSlots      = computeSlots(rule.activeFamily, params);
  const newAssignments = reIndexAssignments(rule.imageAssignments, rule.cachedSlots, newSlots);

  // New assets get assigned to the new empty slots (in pool order)
  const assignedIds = new Set(newAssignments.map(a => a.assetId));
  const unassigned  = newPool.filter(id => !assignedIds.has(id));
  const emptySlots  = newSlots.filter(s => !newAssignments.find(a => a.slotId === s.id));
  unassigned.forEach((assetId, i) => {
    if (emptySlots[i]) {
      newAssignments.push(createImageAssignment({ collageRuleId: rule.id, assetId, slotId: emptySlots[i].id }));
    }
  });

  return { ...rule, imagePool: newPool, cachedSlots: newSlots, imageAssignments: newAssignments, splitTree };
}

// ─── 5. Apply a saved template (different from applying a generated family) ───

export function applyCollageTemplate(
  rule: CollageRule,
  template: CollageTemplate,
  canvasW: number,
  canvasH: number,
): CollageRule {
  // Template stores relative [0..1] geometry — scale to current canvas
  // Equivalent to template_engine.py:template_to_layout()
  const scaledSlots: CollageSlot[] = template.slots.map(slot => ({
    ...slot,
    id: createId("slot"),   // fresh IDs
    // x, y, w, h are already relative [0..1] — no scaling needed
    // FrameLayer positions are computed from these × canvasW/H
  }));

  // Mismatch rule (from clarifications doc):
  // - fewer images than image slots → remaining slots become empty
  // - more images than image slots → extras go to unassigned panel
  const imageSlots   = scaledSlots.filter(s => s.type === "image");
  const imageCount   = imageSlots.length;
  const availImages  = rule.imagePool.slice(0, imageCount);  // assign in pool order

  const newAssignments: CollageImageAssignment[] = availImages.map((assetId, i) => ({
    ...createImageAssignment({ collageRuleId: rule.id, assetId, slotId: imageSlots[i].id }),
  }));

  return {
    ...rule,
    activeFamily: "custom",   // template-applied = "custom" family (no generator)
    splitTree: template.splitTree,
    cachedSlots: scaledSlots,
    imageAssignments: newAssignments,
    // imagePool unchanged — extras remain in pool → shown in Unassigned panel
  };
}
```

---

### Index-based assignment preservation

```typescript
// src/core/collage/collageModeEngine.ts

/**
 * Preserve image assignments when slots change (family switch, image count change).
 * Port of the preservation logic described in the Python app's generate_suggestions()
 * and apply_template_to_project().
 *
 * Rules (from architectural decisions doc):
 * 1. Hero exception: if both old and new have a hero slot, preserve the hero assignment
 *    regardless of index.
 * 2. Index-based: old slot[i] → new slot[i] for all non-hero image slots.
 * 3. Aspect ratio change > 0.3: keep assignment, reset contentTransform to default.
 * 4. Fewer new slots: extra assignments are dropped (images go to unassigned pool).
 * 5. More new slots: new slots have no assignment (empty until user assigns).
 */
function reIndexAssignments(
  oldAssignments: CollageImageAssignment[],
  oldSlots: CollageSlot[],
  newSlots: CollageSlot[],
): CollageImageAssignment[] {
  const result: CollageImageAssignment[] = [];

  // 1. Hero exception
  const oldHeroSlot   = oldSlots.find(s => s.role === "hero");
  const newHeroSlot   = newSlots.find(s => s.role === "hero");
  const heroAssignment = oldHeroSlot ? oldAssignments.find(a => a.slotId === oldHeroSlot.id) : null;

  if (heroAssignment && newHeroSlot) {
    result.push({ ...heroAssignment, slotId: newHeroSlot.id });
  }

  // 2. Index-based for remaining image slots
  const oldImageSlots = oldSlots.filter(s => s.type === "image" && s.role !== "hero");
  const newImageSlots = newSlots.filter(s => s.type === "image" && s !== newHeroSlot);

  newImageSlots.forEach((newSlot, idx) => {
    const oldSlot  = oldImageSlots[idx];
    if (!oldSlot) return;  // more new slots than old — leave unassigned
    const assignment = oldAssignments.find(a => a.slotId === oldSlot.id);
    if (!assignment) return;

    // 3. Aspect ratio check
    const oldAR = oldSlot.w / oldSlot.h;
    const newAR = newSlot.w / newSlot.h;
    const aspectChanged = Math.abs(oldAR - newAR) > 0.3;

    result.push({
      ...assignment,
      slotId: newSlot.id,
      contentTransform: aspectChanged ? defaultContentTransform() : assignment.contentTransform,
    });
  });

  return result;
}
```

---

### FrameLayer sync — the bridge to SPP2 canvas

After every engine call that changes `cachedSlots`, call this to update the page:

```typescript
// src/core/collage/collageModeEngine.ts

/**
 * Remove old collage FrameLayers and create new ones from cachedSlots.
 * Called after any operation that changes slot positions or count.
 * Equivalent to what template_engine.py:apply_template_to_project() triggers
 * on the canvas side.
 */
export function syncFrameLayersToPage(
  page: Page,
  rule: CollageRule,
  canvasW: number,
  canvasH: number,
): Page {
  // 1. Remove all existing FrameLayers owned by this collage rule
  const otherLayers = page.layers.filter(
    l => l.metadata?.collageFrame?.collageRuleId !== rule.id
  );

  // 2. Create FrameLayers from cachedSlots, sorted by zIndex (lower = rendered first)
  const sortedSlots = [...rule.cachedSlots].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  const newFrameLayers: FrameLayer[] = sortedSlots.map(slot => {
    const assignment = rule.imageAssignments.find(a => a.slotId === slot.id);

    return createFrameLayer({
      // Position: relative [0..1] → pixels
      x:      slot.x * canvasW,
      y:      slot.y * canvasH,
      width:  slot.w * canvasW,
      height: slot.h * canvasH,
      rotation: slot.rotationDeg ?? 0,

      // Content
      imageAssetId:     assignment?.assetId,
      contentTransform: assignment?.contentTransform ?? defaultContentTransform(),
      fitMode:          assignment?.fitMode ?? "fill",
      contentType:      slot.type === "empty" ? "empty" : (assignment ? "image" : "empty"),

      // Shape
      shape:         mapCollageShapeToFrameShape(slot.shape),
      cornerRadius:  slot.shapeParams.cornerRadius,

      // Effects (from assignment, falling back to global canvas settings)
      visualEffects: assignment?.visualEffects ?? buildDefaultVisualEffects(rule.canvasSettings),

      // Collage ownership tag
      metadata: {
        collageFrame: {
          collageRuleId: rule.id,
          slotId:        slot.id,
          slotType:      slot.type,
          isCollageFrame: true,
          layoutManaged:  true,
          slotShape:     slot.shape,
          zIndex:        slot.zIndex ?? 0,
        }
      }
    });
  });

  // 3. Update frameIds in the rule (caller must also update the rule in the store)
  return { ...page, layers: [...otherLayers, ...newFrameLayers] };
}
```

---

## WHAT CHANGES IN THE MAIN PROMPT

In `COLLAGE_MODE_PHASE5_PROMPT.md`, apply these corrections:

### Remove from `CollageRule`:
```typescript
// DELETE these fields:
layouts: CollageLayout[];
activeLayoutId: ID;
```

### Add to `CollageRule`:
```typescript
// ADD these fields:
activeFamily: CollageLayoutFamily;
spacingMM: number;
marginMM: number;
splitTree?: CollageSplitNode;
cachedSlots: CollageSlot[];   // computed cache — do not edit directly
```

### Remove `CollageLayout` interface entirely.
It is replaced by `ScoredLayoutSuggestion` which is in-memory only.

### Add `LAYOUT_REGISTRY` to `collageLayoutEngine.ts`.

### Replace `generateCollageLayouts()` signature with `generateCollageSuggestions()` and `computeSlots()`.

### Add `syncFrameLayersToPage()` to `collageModeEngine.ts`.

### In `documentStore.ts`, every action that changes image count, canvas size, family, spacing, or margin must call:
```typescript
const newRule = reflowCollage(rule, canvasW, canvasH);  // or applyLayoutFamily, addImagesToCollage, etc.
const newPage = syncFrameLayersToPage(page, newRule, canvasW, canvasH);
// Then dispatch as a single undoable command
```

---

## FILE REFERENCES SUMMARY

| Concept | Python source | TypeScript target |
|---|---|---|
| Core grid builder | `collage_engine.py:62 _make_grid_cells()` | `collageLayoutEngine.ts makeGridSlots()` |
| Layout generator pattern | `collage_engine.py:185–1115` (every `_xxx_layout()`) | `collageLayoutEngine.ts generateXxxSlots()` |
| Generation entry point | `collage_engine.py:1121 generate_suggestions()` | `collageModeEngine.ts generateCollageSuggestions()` |
| Template → pixels | `template_engine.py:23 template_to_layout()` | `collageModeEngine.ts applyCollageTemplate()` |
| Pixels → template | `template_engine.py:57 layout_to_template()` | `collageTemplateService.ts saveCurrentAsTemplate()` |
| Split tree compute | `layout_tree_engine.py:51 compute_rects()` | `collageSplitTree.ts computeSplitTreeSlots()` |
| Split tree build | `layout_tree_engine.py:209 build_tree()` | `collageSplitTree.ts buildDefaultSplitTree()` |
| Ratio clamp | `layout_tree_engine.py:191 clamp_ratio()` | `collageSplitTree.ts clampSplitRatio()` |
| Cell model (pixels) | `project.py:136 CellRect` | `FrameLayer` (SPP2 existing) |
| Slot model (relative) | `template.py:78 TemplateSlot` | `CollageSlot` |
| Assignment preservation | `collage_engine.py:129 _optimize_layout_assignments()` | `collageModeEngine.ts reIndexAssignments()` |

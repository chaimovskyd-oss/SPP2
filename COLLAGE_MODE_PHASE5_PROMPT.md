# SPP2 — Phase 5: Collage Mode
## Full Implementation Prompt (Final — All Decisions Locked)

---

## FEATURE PARITY ANALYSIS
### Python collage app vs Phase 5 plan

Before implementing, review this feature audit. All features marked ✅ or ⚠️ must be in the plan.
Features marked 🔮 are explicitly deferred.

| Feature | Status | Notes |
|---|---|---|
| **LAYOUT FAMILIES** | | |
| Grid (last-row-stretch) | ✅ Covered | Defining behavior of collage vs Grid Mode |
| Hero Top / Bottom | ✅ Covered | Large cell + grid below/above |
| Feature Left / Magazine | ✅ Covered | Wide feature cell + stacked right |
| Mosaic (62%/38% top pair + grid) | ✅ Added | Two asymmetric top cells |
| Strip (single horizontal row) | ✅ Added | Wraps to 2 rows if >6 images |
| Dual Hero (two heroes side-by-side) | ✅ Added | Equal heroes + grid below |
| Triptych (three equal full-height columns) | ✅ Added | Classic 3-panel layout |
| Wide Banner (full-width top strip + grid) | ✅ Added | Common editorial format |
| Film Strip (uneven row heights) | ✅ Added | 36% / 29% / remaining |
| Staircase (diagonal descending steps) | ✅ Added | Each step extends to bottom |
| Ring Focus (central cell + surrounding) | ✅ Added | Center-dominant composition |
| **Artistic Layered** (overlapping rotated cards) | ✅ Added | Uses z_index + rotationDeg on slots |
| Binary Split Tree | ✅ Covered | Interactive divider dragging |
| Diagonal Bands (12° / 20°) | ✅ Covered | Parallelogram shapes |
| Diagonal Hero | ✅ Covered | Trapezoid hero + column |
| Circle packing (cells inside circle silhouette) | ✅ Covered | Grid inside circle boundary |
| Heart packing (cells inside heart silhouette) | ✅ Covered | Parametric heart boundary |
| **Ring Collage** (concentric ring segments) | ✅ Added | Uses ringSegment shape type |
| **CELL SHAPES** | | |
| rect, rounded, circle, ellipse, heart, polygon, diagonalPolygon | ✅ Covered | |
| **Ring Segment** (donut slice) | ✅ Added | `ringSegment` shape type added |
| svgPath (future) | 🔮 Future | Shape parameter kept for extensibility |
| **EDGE STYLES** | | |
| Hard edge | ✅ Covered | |
| Soft edge (feathered fade inward) | ✅ Covered | Via VisualEffectStack softEdge |
| Soft edge sides: all/left/right/top/bottom | ✅ Covered | `softEdgeSides` array |
| Soft edge auto-neighbors (detect adjacent cells) | ✅ Added | `softEdgeSides: "autoNeighbors"` option |
| Soft edge curve: linear / smooth / ease_out | ✅ Covered | `softEdgeCurve` field |
| **Overlap Fade** (cells extend beyond bounds, overlap each other) | ✅ Added | New `overlapFade` edge style |
| Overlap sides + overlap px | ✅ Added | `overlapPx`, `overlapSides` fields |
| Spacing override when overlap enabled | ✅ Added | `spacingOverridePx` in CanvasSettings |
| **Torn Paper** (procedural jagged edge) | ✅ Covered | Deterministic seed, cached |
| Outline Circle | ✅ Covered | Via stroke VisualEffect |
| **PER-CELL PROPERTIES** | | |
| Visual rotation (arbitrary degrees, rotates whole cell) | ✅ Added | `rotationDeg` on CollageSlot |
| Z-index (draw order for overlapping cells) | ✅ Added | `zIndex` on CollageSlot |
| Per-cell edge config override | ✅ Covered | `edgeConfig` on CollageSlot |
| Per-cell visual effects (shadow, glow, etc.) | ✅ Covered | `visualEffects` on CollageImageAssignment |
| Fit mode: fill / fit (letterbox) | ✅ Covered | `FitMode` includes fit + fill |
| Slot type: image / empty | ✅ Covered | `CollageSlotType` |
| **IMAGE ADJUSTMENTS** | | |
| Brightness, contrast, saturation, sharpness | ✅ Covered | |
| Black & White | ✅ Covered | |
| Exposure EV (-3..+3) | ✅ Covered | |
| Vignette (0..1) | ✅ Covered | |
| **Per-channel levels** (R/G/B black+white points) | ✅ Added | `levelsR/G/B` in colorAdjustments |
| **CLAHE** (local contrast enhancement) | ✅ Added | `claheEnabled`, `claheClip` |
| **Auto levels** (1-click 1%/99% per-channel stretch) | ✅ Added | Button in CollageTonePanel |
| Color Equalizer (8-node hue/sat/brightness curves) | 🔮 Future | High complexity, Phase 6 |
| **BACKGROUND** | | |
| Solid color | ✅ Covered | |
| Gradient (two colors + angle) | ✅ Covered | `backgroundGradient.angle` explicit |
| Image background | ✅ Covered | `backgroundAssetId` |
| Transparent | ✅ Covered | |
| **BORDERS & SHADOWS** | | |
| Border width + color | ✅ Covered | `globalBorderWidth/Color` |
| Drop shadow (offset, blur, opacity) | ✅ Covered | `globalShadow*` fields |
| **EXPORT** | | |
| JPEG / PNG / PDF | ✅ Covered | Python Pillow export |
| 300 DPI print quality | ✅ Covered | Python required |
| Bleed area | ✅ Covered | `bleedMM` |
| Safe area guides | ✅ Covered | `safeAreaMM` |
| Soft fade in full-res export | ✅ Covered | Python renders final quality |
| Torn Paper in full-res export | ✅ Covered | Python required |
| Overlap Fade in export | ✅ Added | Python renders correct compositing |
| **CANVAS INTERACTIONS** | | |
| Swap mode (click two cells to swap images) | ✅ Covered | |
| Pan/zoom within selected cell | ✅ Covered | |
| Replace image in cell | ✅ Covered | |
| Remove image from cell | ✅ Covered | |
| Compare mode (original vs edited) | 🔮 Future | Low priority |
| Smart crop debug overlay | 🔮 Future | Python feature |
| **MISCELLANEOUS** | | |
| Depth features (DepthAnything model) | 🔮 Future | Phase 6 |
| Spotify code detection | 🔮 Future | Niche feature |
| Color Lab / Photoshop integration | 🔮 N/A | SPP2's own territory |
| Multi-page album | 🔮 Future | Phase 6 (Album Mode) |

---

## CONTEXT & GOAL

You are extending **SPP2** — a React 19 + TypeScript + Electron + Konva 10 + Zustand 5 print-preparation desktop app — with a new **Collage Mode**.

SPP2 already has:
- Grid Mode (Phase 3): uniform rows×columns cell layout, `GridLayoutRule` pattern
- Mask Mode (Phase 4): shaped masks (circle, heart, etc.) in packed rows, `MaskLayoutRule` pattern
- Pro Text Engine: full typography with warp, effects, RTL
- VisualEffectStack: stroke, dropShadow, outerGlow, softEdge, colorOverlay, gradientOverlay, innerShadow, innerGlow
- FrameLayer: image frames with contentTransform (pan/zoom), smartCrop, visualEffects
- Zustand stores: documentStore (history/undo), selectionStore, viewportStore
- Python bridge (PythonBridge.ts) for heavy computation
- Save format: ProjectEnvelope (.spp zip container)

Existing types live in `src/types/`. Existing engines live in `src/core/`. Modes follow a strict pattern: a document-level managed rule entity owns a set of standard FrameLayer objects tagged with metadata.

**DO NOT break or modify** Grid Mode, Mask Mode, or any existing functionality. Follow the exact same architectural patterns established in Phase 3 and Phase 4.

---

## WHAT COLLAGE MODE IS

Collage Mode lets a user load N images and generates a set of scored layout suggestions that arrange all images on a **single canvas page**. The user picks a layout, edits individual cells, and exports a print-ready result.

Key characteristics:
- **Non-uniform cells**: cells can have different sizes, positions, and even overlap
- **Rich layout families**: 15+ layout types including artistic overlapping cards, ring compositions, diagonal bands
- **Scored suggestions**: engine produces 8–12 ranked layouts based on image aspect ratios and face safety
- **Per-cell visual effects**: soft edge, overlap fade, torn paper, shadow — each cell independently
- **Per-cell rotation and z-index**: cells can be rotated and stacked for artistic layouts
- **Empty slots**: reserved spaces for QR/logo/text placed as free layers above
- **Managed entity**: cells are NOT free-movable (except Split Tree dividers)

**Text, QR, logos, stickers** = regular free SPP2 layers placed above the collage. `CollageTextOverlayRule` is deferred to Phase 6.

---

## ARCHITECTURAL DECISIONS (LOCKED)

### A. CollageRule is a document-level entity — NOT a new layer type

`CollageRule` lives in `document.collageRules[]`, exactly like `GridLayoutRule` lives in `document.gridRules[]`.

The rendered visual cells are **standard FrameLayer objects** on the page, tagged with:
```typescript
metadata.collageFrame = {
  collageRuleId: ID,
  slotId: ID,
  isCollageFrame: true,
  layoutManaged: true,
  slotShape: CollageSlotShape
}
```

Do NOT create a new layer type called `CollageGroupLayer`. The collage is not a new rendering primitive — it is a managed entity that owns and controls existing FrameLayers.

The Layers Panel shows these FrameLayers as a **virtual managed group** (UI representation only):
```
Collage — 7 slots
  ├─ Slot 1 — image
  ├─ Slot 2 — image
  ├─ Slot 3 — empty
  ├─ Slot 4 — image
  └─ Slot 5 — image
```

### B. One managed collage per page

Only ONE `CollageRule` per page. If a page already has one, show/edit the existing one. Enforce in state and UI.

### C. Cells are managed — not free-movable

Individual collage frames CANNOT be freely dragged or resized on the canvas. The only exception is **Split Tree layouts** (divider drag). **Artistic Layered** layouts define `rotationDeg` and `zIndex` in the slots themselves — these are not editable per-cell in Phase 5.

Allowed structural changes:
- Change layout family/type
- Change spacing / margin
- Change page size (triggers reflow)
- Add/remove images through "Add images to collage"
- Add/remove empty slots
- Drag Split Tree dividers
- Regenerate layout suggestions
- Apply saved template

### D. CollageSlot coordinate system

`CollageSlot` stores geometry in **relative [0..1] coordinates**. FrameLayer positions (absolute pixels) are computed from `CollageSlot` × page dimensions at render/commit time.

### E. Background ownership

While a `CollageRule` is active, `CollageCanvasSettings.background` is the authoritative background for the page. It overrides `Page.background`.

### F. Z-order

Default: background → collage frames (sorted by `slot.zIndex`) → free layers above. Users can reorder in Layers Panel. Reordering does NOT detach cells from `CollageRule`.

### G. Python bridge dependency

The core Collage Mode **must work without Python running**.

| Feature | Python required? |
|---|---|
| All layout generation | ❌ Pure TypeScript |
| Scoring algorithm | ❌ Pure TypeScript |
| Template save/load | ❌ Pure TypeScript |
| Canvas preview rendering | ❌ Pure TypeScript |
| Overlap Fade preview | ❌ Pure TypeScript (Canvas2D composite) |
| Smart crop / face detection | ✅ Python |
| Full-res 300 DPI export | ✅ Python |
| Torn Paper in export | ✅ Python |
| Overlap Fade in export | ✅ Python |
| Image analysis / quality score | ✅ Python |

### H. Index-based slot identity matching with hero exception

During reflow, preserve by slot index: slot 0 → slot 0, slot 1 → slot 1, etc.

**Hero exception**: if both layouts have a hero slot (`role: "hero"`), assign the hero image to the new hero slot first, regardless of index. Then apply index-based matching for remaining images.

When slot count changes:
- Fewer slots → extra images go to Unassigned Images panel
- More slots → new slots become empty
- Cannot map crop/pan/zoom → keep assignment, reset transform to default

### I. Live preview strategy for reflow

During drag: SVG overlay showing slot outlines only. No FrameLayer movement. No undo entries.
On commit: real reflow → update slot geometry → update FrameLayers → one undoable command.
Split Tree exception: dividers move live, commit ratio on mouse-up.

---

## NEW COLLAGE WIZARD ("יצירת קולאז׳ חדש")

**Do NOT** open into an empty canvas. The wizard creates the collage and lands in `CollageScreen` with it already built.

### Step 1 — Select images
- Drag-and-drop + "Choose photos" button
- Show thumbnails, allow reorder and remove
- Recommended: 2–30. Warning above 30. Hard limit: 100. 1 image allowed with note.

### Step 2 — Page size / format
- Existing SPP2 presets: A4, A3, 10×15, 13×18, 20×30, 30×40, Custom
- Portrait / landscape, existing unit system

### Step 3 — Layout settings
- Spacing (default 2–4 mm), margin (default 3–5 mm)
- Corner radius default
- Complexity mode:
  - **Simple** (default): Grid + Hero + Mosaic + Strip + Dual Hero + Triptych
  - **Creative**: all families including Split Tree, Diagonal, Shaped, Film Strip, Staircase, Ring Focus, Artistic Layered, Ring Collage

### Step 4 — Layout source
- A. **Suggested Layouts** (default) → Step 5 shows scored suggestions
- B. **Saved Template** → Step 5 shows template gallery with preview + metadata

### Step 5 — Preview and create
**Suggested path**: 6–12 scored mini previews (SVG thumbnails). Score %, family badge, "Recommended" badge on top.
**Template path**: gallery → select → larger preview showing name, slot count, image/empty counts, recommended aspect.
**After Create**: build `CollageRule`, create FrameLayers, assign images, navigate to `CollageScreen`.

---

## TYPESCRIPT TYPES (`src/types/collage.ts`)

```typescript
import type { ContentTransform, FrameLayer } from "./layers";
import type { CropRect, FitMode, ID, Margins, Metadata, Rect, VersionedEntity } from "./primitives";
import type { VisualEffectStack } from "./visualEffects";

// ─── Slot shapes ──────────────────────────────────────────────────────────────

export type CollageSlotShape =
  | "rect"
  | "rounded"
  | "circle"
  | "ellipse"
  | "heart"
  | "polygon"           // regular N-gon (hexagon, star, etc.)
  | "ringSegment"       // donut slice: inner radius + start/end angles
  | "diagonalPolygon"   // arbitrary convex polygon for parallelogram bands
  | "svgPath";          // future extension

export interface CollageSlotShapeParams {
  cornerRadius?: number;       // "rounded": fraction of min(w,h), 0..0.5
  sides?: number;              // "polygon": 3..12
  rotation?: number;           // "polygon": initial rotation degrees
  vertices?: Array<{ x: number; y: number }>;  // "diagonalPolygon": [0..1] relative to cell bbox
  // "ringSegment":
  innerRadiusFrac?: number;    // fraction of outer radius, 0..0.9
  startAngleDeg?: number;
  endAngleDeg?: number;
  pathData?: string;           // "svgPath"
}

// ─── Edge effects ─────────────────────────────────────────────────────────────

export type CollageEdgeStyle =
  | "hard"
  | "softEdge"          // feathered fade inward from edges
  | "overlapFade"       // cell extends BEYOND its bounds, overlapping neighbors
  | "tornPaper"         // procedural jagged torn edge
  | "outlineCircle";    // stroke + circle clip

export type CollageEdgeSides =
  | "all"
  | "left" | "right" | "top" | "bottom"
  | "horizontal" | "vertical"
  | "autoNeighbors";    // engine detects which sides touch adjacent cells

export interface CollageEdgeConfig {
  style: CollageEdgeStyle;
  // softEdge:
  softEdgeRadius?: number;          // px, 0..80
  softEdgeSides?: CollageEdgeSides;
  softEdgeCurve?: "linear" | "smooth" | "easeOut";
  // overlapFade: cell expands beyond bounds and blends into neighbors
  overlapPx?: number;               // how many px the cell extends past its bbox, 0..80
  overlapSides?: CollageEdgeSides;  // which sides expand (default: "autoNeighbors")
  // tornPaper:
  tornPaperSeed?: number;           // deterministic seed, fixed per slot
  tornPaperRoughness?: number;      // 0..1
  tornPaperSides?: CollageEdgeSides;
  // outlineCircle:
  outlineColor?: string;
  outlineWidth?: number;            // px
}

// ─── Slot types ───────────────────────────────────────────────────────────────

export type CollageSlotType = "image" | "empty";

// ─── Collage slot — relative [0..1] coordinates ───────────────────────────────

export interface CollageSlot extends VersionedEntity {
  id: ID;
  type: CollageSlotType;
  // Geometry: relative [0..1] — top-left = (0,0), bottom-right = (1,1)
  x: number;
  y: number;
  w: number;
  h: number;
  // Shape masking
  shape: CollageSlotShape;
  shapeParams: CollageSlotShapeParams;
  // Visual cell rotation (degrees, arbitrary). Applied to the whole rendered cell.
  // Used by Artistic Layered layouts to tilt cards. Default 0.
  rotationDeg: number;
  // Draw order within the collage. Higher = painted above. Default 0.
  // Used by Artistic Layered layouts for overlapping card stacks.
  zIndex: number;
  // Per-slot edge config (overrides global CanvasSettings.globalEdgeConfig)
  edgeConfig?: CollageEdgeConfig;
  // Role for scoring + hero matching
  role: "hero" | "accent" | "standard" | "";
  label: string;
  groupId: string;
  metadata: Metadata;
}

// ─── Layout families ──────────────────────────────────────────────────────────

export type CollageLayoutFamily =
  | "grid"             // uniform or last-row-stretch grid
  | "hero"             // one large hero + supporting grid (top/bottom/left/right)
  | "mosaic"           // asymmetric top pair (62%/38%) + grid below
  | "strip"            // single horizontal row (or 2 rows if >6)
  | "dualHero"         // two equal heroes side-by-side + grid below
  | "triptych"         // three equal full-height columns + grid below
  | "wideBanner"       // full-width banner top (30%) + grid below
  | "filmStrip"        // three rows of uneven heights (36% / 29% / rest)
  | "staircase"        // diagonal descending steps, each extends to canvas bottom
  | "ringFocus"        // central ~50% cell + cells wrapped around perimeter
  | "artisticLayered"  // overlapping rotated cards, spiral arrangement from center
  | "splitTree"        // interactive binary split with draggable dividers
  | "diagonal"         // parallelogram bands (subtle 12° or dramatic 20°)
  | "diagonalHero"     // trapezoid hero + supporting column
  | "shapedCircle"     // cells packed inside circle silhouette
  | "shapedHeart"      // cells packed inside heart silhouette
  | "ringCollage"      // cells as ring segments (donut slices) around center
  | "custom";          // user-created / template-based

// ─── Collage layout (one scored suggestion) ───────────────────────────────────

export interface CollageLayout extends VersionedEntity {
  id: ID;
  name: string;
  family: CollageLayoutFamily;
  slots: CollageSlot[];
  score: number;          // 0..1, higher = better fit for current images
  scoreBreakdown: {
    aspectRatioScore: number;   // 0..1, weight 0.50
    faceSafetyScore: number;    // 0..1, weight 0.25
    balanceScore: number;       // 0..1, weight 0.15
    diversityScore: number;     // 0..1, weight 0.10
  };
  splitTree?: CollageSplitNode;   // only for family === "splitTree"
  targetImageCount: number;
  metadata: Metadata;
}

// ─── Binary split tree ────────────────────────────────────────────────────────

export type CollageSplitNode =
  | { type: "leaf"; slotId: ID }
  | {
      type: "split";
      direction: "H" | "V";    // H = left|right, V = top|bottom
      ratio: number;            // 0..1, position of divider
      first: CollageSplitNode;
      second: CollageSplitNode;
    };

// ─── Image assignment ─────────────────────────────────────────────────────────

export interface CollageImageAssignment extends VersionedEntity {
  id: ID;
  collageRuleId: ID;
  assetId: ID;
  slotId: ID;
  contentTransform: ContentTransform;
  manualCrop?: CropRect;
  fitMode: FitMode;           // "fill" | "fit" (letterbox) | "smartCrop" | "stretch"
  colorAdjustments: {
    brightness: number;       // 1.0 = neutral, 0.2..2.0
    contrast: number;
    saturation: number;       // 0 = full B&W, 1 = neutral, 2 = vivid
    sharpness: number;
    isBlackAndWhite: boolean;
    exposureEV: number;       // -3..+3 stops
    vignette: number;         // 0..1, darkens edges
    // Per-channel levels (black point, white point) 0..255
    levelsR: [number, number];
    levelsG: [number, number];
    levelsB: [number, number];
    // CLAHE local contrast enhancement
    claheEnabled: boolean;
    claheClip: number;        // clip limit, 1.0..4.0, default 2.0
  };
  visualEffects?: VisualEffectStack;
  edgeConfig?: CollageEdgeConfig;   // overrides slot.edgeConfig and global
  hasManualCrop?: boolean;
  hasManualTransform?: boolean;
  metadata: Metadata;
}

// ─── Canvas settings ──────────────────────────────────────────────────────────

export interface CollageCanvasSettings extends VersionedEntity {
  // Background — authoritative for the page while CollageRule is active
  backgroundType: "solid" | "gradient" | "image" | "transparent";
  backgroundColor: string;
  backgroundGradient?: {
    startColor: string;
    endColor: string;
    angle: number;    // 0=left→right, 90=top→bottom, 45=diagonal
  };
  backgroundAssetId?: ID;
  // Global cell style (can be overridden per-slot or per-assignment)
  globalCornerRadius: number;         // mm
  globalBorderWidth: number;          // mm
  globalBorderColor: string;
  globalShadowEnabled: boolean;
  globalShadowOffsetX: number;        // mm
  globalShadowOffsetY: number;        // mm
  globalShadowBlur: number;           // mm
  globalShadowOpacity: number;        // 0..1
  // Global edge config (can be overridden per-slot)
  globalEdgeConfig: CollageEdgeConfig;
  // Spacing override: when overlapFade is enabled, spacing between cells
  // may be overridden so cells are positioned closer together / overlapping.
  spacingOverrideEnabled: boolean;
  spacingOverridePx: number;          // effective spacing when override active
  // Print guides
  bleedMM: number;
  safeAreaMM: number;
}

// ─── Main collage rule ────────────────────────────────────────────────────────

export interface CollageRule extends VersionedEntity {
  id: ID;
  name: string;
  pageId: ID;                   // ONE CollageRule per page — enforced
  activeLayoutId: ID;
  layouts: CollageLayout[];     // all scored suggestions for this session
  imageAssignments: CollageImageAssignment[];
  imagePool: ID[];              // ordered list of all assetIds (assigned + unassigned)
  canvasSettings: CollageCanvasSettings;
  smartCropEnabled: boolean;
  smartCropMode: "none" | "face" | "center" | "ruleOfThirds";
  frameIds: ID[];               // managed FrameLayer IDs on the page
  metadata: Metadata;
}

// ─── Template ─────────────────────────────────────────────────────────────────

export interface CollageTemplate extends VersionedEntity {
  id: ID;
  name: string;
  category: string;       // user-defined: "Family", "Birthday", "Event", etc.
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  recommendedAspectW: number;
  recommendedAspectH: number;
  family: CollageLayoutFamily;
  slotCount: number;
  imageSlotCount: number;
  emptySlotCount: number;
  slots: CollageSlot[];         // relative [0..1] geometry + rotationDeg + zIndex
  splitTree?: CollageSplitNode;
  spacing: number;              // mm
  margin: number;               // mm
  canvasDefaults: Partial<CollageCanvasSettings>;
  svgThumbnail: string;         // inline SVG, generated at save time from slot geometry
}

// ─── Engine options ───────────────────────────────────────────────────────────

export type CollageComplexityMode = "simple" | "creative";
// simple  = grid, hero, mosaic, strip, dualHero, triptych
// creative = all families

export interface CollageGenerateOptions {
  imageCount: number;
  canvasAspectW: number;
  canvasAspectH: number;
  spacingPx: number;
  marginPx: number;
  complexityMode: CollageComplexityMode;
}

export interface CollageCreateOptions {
  name?: string;
  canvasSettings?: Partial<CollageCanvasSettings>;
  generateOptions?: Partial<CollageGenerateOptions>;
}

// ─── Frame metadata tag ───────────────────────────────────────────────────────

export interface CollageFrameMetadata {
  collageRuleId: ID;
  slotId: ID;
  slotType: CollageSlotType;
  isCollageFrame: true;
  layoutManaged: true;
  slotShape: CollageSlotShape;
}

export type CollageFrameLayer = FrameLayer & {
  metadata: FrameLayer["metadata"] & {
    collageFrame: CollageFrameMetadata;
  };
};
```

---

## EXTEND `src/types/document.ts`

```typescript
// Add to Document interface:
collageRules: CollageRule[];
```

`CollageImageAssignment[]` is stored inside `CollageRule.imageAssignments` (not at document root — unlike Grid Mode's separate top-level arrays).

---

## COLLAGE LAYOUT ENGINE (`src/core/collage/collageLayoutEngine.ts`)

**This is pure TypeScript. No Python calls. All coordinates returned in relative [0..1].**

### Core helper

```typescript
function makeGridSlots(
  count: number, x0: number, y0: number,
  availW: number, availH: number,
  spacingFrac: number, maxCols: number
): CollageSlot[]
```

**Last-row stretch**: if the last row has fewer cells than `maxCols`, those cells expand proportionally to fill the available width. This is the defining collage behavior — every row looks complete with no empty white space.

### Layout families to generate

#### A. Grid
Balanced grid + 2/3/4-column variants + single row (N≤4) + single column (N≤4).

#### B. Hero
- **Hero Top**: hero (55% height) + grid below
- **Hero Bottom**: grid (35% height) + hero below
- **Feature Left**: hero (58% width) + stacked column right
- **Magazine**: hero (60% width) + stacked column right (slightly different proportions)
- All use `role: "hero"` on the dominant cell.

#### C. Mosaic
Two asymmetric top cells (62% / 38% split) + grid below. 3+ images only.
```
[  62%  | 38% ]
[ grid below  ]
```

#### D. Strip
All images in a single horizontal row. Wraps to 2 rows if >6 images. Cells equal width.

#### E. Dual Hero
Two equal heroes side-by-side (50/50) + grid below. 2+ images.

#### F. Triptych
Three equal full-height columns (for 3 images) or 60% height columns + grid below (4+ images).

#### G. Wide Banner
Full-width banner at top (30% height) + grid below. Good for landscape format.

#### H. Film Strip
Three rows with deliberately uneven heights: **36% / 29% / 35%**. Each row is a full-width strip of cells with last-row-stretch. Creates a film-strip editorial feel.

#### I. Staircase
Diagonal descending steps. Each step is a wider cell that starts further right than the previous, and every cell extends to the canvas bottom. Creates a cascading diagonal composition.

```typescript
function buildStaircaseSlots(n: number, canvasW: number, canvasH: number, spacingPx: number, marginPx: number): CollageSlot[]
// Step i starts at x = margin + i*(stepWidth + spacing), extends from y=stepY[i] to canvas bottom
// stepY[i] increases linearly: stepY[i] = margin + i * (usableH / n * 0.4)
```

#### J. Ring Focus
Central cell occupying ~50% of canvas area, centered. Remaining cells distributed around the perimeter (top strip, right strip, bottom strip, left strip — distributed to fill available space).

```typescript
function buildRingFocusSlots(n: number, canvasW: number, canvasH: number, spacingPx: number, marginPx: number): CollageSlot[]
// center cell: x=0.25, y=0.25, w=0.5, h=0.5 (relative)
// perimeter cells: distributed in 4 strips around center
```

#### K. Artistic Layered
Overlapping rotated cards arranged in a loose spiral from center outward. Uses `rotationDeg` and `zIndex` on each slot.

```typescript
function buildArtisticLayeredSlots(n: number, canvasW: number, canvasH: number): CollageSlot[]
```

Algorithm:
1. Define base card size: ~60% of canvas width, ~50% of canvas height
2. First card (hero): centered at (0.5, 0.5), `rotationDeg: 0`, `zIndex: n`
3. Subsequent cards: placed in an outward spiral with increasing rotation offset
   - Card i: offset `(cos(i * 2.4) * 0.15, sin(i * 2.4) * 0.12)` from center
   - `rotationDeg: (i % 2 === 0 ? 1 : -1) * (3 + i * 2)` degrees — alternating tilt, growing with distance
   - `zIndex: n - i` (first card on top)
4. Cards overlap significantly (intentional — this is the artistic effect)
5. Slot sizes reduce slightly for cards further from center (hero is largest)

This layout requires `overlapFade` or `softEdge` edge effects to look good. The layout generator should set `edgeConfig: { style: "softEdge", softEdgeRadius: 24, softEdgeSides: "all" }` as default for all slots in this layout.

#### L. Binary Split Tree
```typescript
function buildSplitTree(n: number): CollageSplitNode
function computeSplitTreeSlots(tree: CollageSplitNode, canvasW: number, canvasH: number, spacingPx: number, marginPx: number): CollageSlot[]
```
Recursive alternating H/V splits at ratio 0.5. User drags dividers to adjust.

#### M. Diagonal Bands
```typescript
function buildDiagonalBands(n: number, shearAngleDeg: number, canvasW: number, canvasH: number, spacingPx: number): CollageSlot[]
```
N parallelogram bands. Vertices computed from shear geometry. Generate 2 variants: 12° (subtle) and 20° (dramatic).

#### N. Diagonal Hero
Large trapezoid hero on the left (with diagonal right edge) + supporting column on the right. Uses `diagonalPolygon` shape.

#### O. Shaped Circle
Grid of cells inside a circle silhouette. Each cell gets `shape: "circle"`. Center test: `(cx-0.5)² + (cy-0.5)² < 0.42²`.

#### P. Shaped Heart
Grid of cells inside a heart silhouette.
```typescript
function isInsideHeart(nx: number, ny: number): boolean {
  const x = (nx - 0.5) * 2.6;
  const y = (ny - 0.42) * -2.2;
  return Math.pow(x*x + y*y - 1, 3) - x*x * Math.pow(y, 3) < 0;
}
```

#### Q. Ring Collage
Cells as concentric ring segments (donut slices) arranged around a center point. Uses `ringSegment` shape type.

```typescript
function buildRingCollageSlots(n: number, centerX: number, centerY: number, outerRadius: number, innerRadius: number): CollageSlot[]
// Distribute n cells as equal angular slices
// Each cell: CollageSlot with shape: "ringSegment",
//   shapeParams: { innerRadiusFrac: innerRadius/outerRadius, startAngleDeg, endAngleDeg }
// Bounding box of each slice becomes the slot x/y/w/h
```

---

## SCORING ALGORITHM (`src/core/collage/collageScoring.ts`)

**Pure TypeScript.**

```typescript
function scoreLayout(layout: CollageLayout, images: CollageImageInput[]): ScoreResult
```

**Step 1** — Greedy image-to-slot assignment by aspect ratio (slots sorted by area desc):
```typescript
function assignImagesToSlots(slots: CollageSlot[], images: CollageImageInput[]): Map<ID, ID>
```

**Step 2** — Aspect ratio score (weight 0.50):
```typescript
const pairScore = Math.min(slotAR, imgAR) / Math.max(slotAR, imgAR);
// Weighted average by slot area
```

**Step 3** — Face safety score (weight 0.25):
For images with `faceRegions`: check face centers stay within fill-crop area. Only computed if Python analysis has run; otherwise defaults to 0.5.

**Step 4** — Balance score (weight 0.15):
Center of mass deviation from (0.5, 0.5). Lower = higher score.

**Step 5** — Diversity score (weight 0.10):
Coefficient of variation of cell areas. Higher variation = more interesting. Uniform grid ≈ 0.3; artistic layouts ≈ 0.8.

---

## OVERLAP FADE EFFECT

**Overlap Fade** is a key collage feature: cells extend BEYOND their bounding box and blend with neighbors using feathering. This creates the blended, seamless feel of classic photo collages.

### How it works

When `edgeConfig.style === "overlapFade"`:
1. The cell's **rendered area** expands by `overlapPx` on the specified sides
2. The expanded region fades from fully opaque (at original boundary) to transparent (at the expanded edge)
3. Because multiple cells overlap in the same physical area, the result is a smooth blend

### Preview rendering (Canvas2D / Konva)

```typescript
// In KonvaLayerNode.tsx:
// 1. Render image into expanded bounding box (originalBBox + overlapPx on each side)
// 2. Apply feathering mask via Konva.Filter or offscreen canvas:
//    - Alpha = 1.0 at original boundary, 0.0 at expanded boundary
//    - Curve follows softEdgeCurve (linear / smooth / easeOut)
// 3. Composite with existing layer using default "source-over" blend
// 4. Sort cells by zIndex before rendering (lower zIndex = rendered first = appears below)
```

### Spacing override

When `overlapFade` is active globally, set `canvasSettings.spacingOverrideEnabled = true` and reduce `spacingOverridePx` to 0 or negative equivalent — so cells are geometrically adjacent or slightly overlapping in their layout positions.

### Auto-neighbors detection

When `overlapSides === "autoNeighbors"` (the default for overlapFade):

```typescript
function detectNeighborSides(slots: CollageSlot[], slotIndex: number, maxGapFrac: number = 0.02): CollageEdgeSides[]
// Returns which sides of slots[slotIndex] are adjacent to another slot
// maxGapFrac: maximum gap (in relative [0..1] units) to consider "adjacent"
// Result: array of sides where overlapFade should be applied
```

This replaces the Python `detect_neighbor_sides()` function from `cell_edge_render.py`.

### Export

Python Pillow export handles full-quality Overlap Fade:
- Expand crop box by `overlapPx × scale` on relevant sides
- Apply gradient alpha mask (Gaussian falloff) to the expanded region
- Composite cells in `zIndex` order using PIL `paste` with alpha mask

---

## TORN PAPER EFFECT

Keep Torn Paper. Mark as advanced. Apply adaptive quality.

### Adaptive preview thresholds
| Cell count | Preview |
|---|---|
| 0–20 | Full torn paper |
| 20–50 | Cached simplified masks |
| 50+ | softEdge approximation |
| Export | Always full quality (Python/Pillow) |

### Implementation (`src/core/collage/collageTornPaper.ts`)

Seeded LCG PRNG:
```typescript
function lcgRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (1664525 * s + 1013904223) & 0xffffffff; return (s >>> 0) / 4294967296; };
}
```

- Each slot has `edgeConfig.tornPaperSeed` — deterministic per slot
- Path cached: `Map<string, number[]>` keyed by `"{slotId}_{w}_{h}_{roughness}_{seed}"`
- Recalculate only when size, roughness, seed, or slot shape changes
- During drag/zoom: disable or use cached simplified

Konva rendering: `Konva.Shape` with `sceneFunc` using `globalCompositeOperation: 'destination-out'`.

---

## RING SEGMENT SHAPE RENDERING

When `slot.shape === "ringSegment"`:
```typescript
// In KonvaLayerNode.tsx, clip the FrameLayer to a ring segment:
// 1. Create Konva.Arc with: innerRadius, outerRadius, rotation, angle
// 2. Use as clip region for the cell's Konva.Group
// shapeParams.innerRadiusFrac × min(cellW, cellH) / 2 = innerRadius
// shapeParams.startAngleDeg, endAngleDeg define the arc span
```

In the Konva rendering pipeline, `ringSegment` is handled alongside `circle`, `heart`, `polygon`, and `diagonalPolygon` in the cell shape masking logic.

---

## IMAGE ADJUSTMENTS — FULL PANEL (`src/ui/collage/CollageTonePanel.tsx`)

The tone panel exposes all `CollageImageAssignment.colorAdjustments` fields:

### Basic adjustments
- Brightness slider: 0.2–2.0 (neutral: 1.0)
- Contrast slider: 0.2–2.0
- Saturation slider: 0.0–2.0 (0 = full B&W, 1 = neutral)
- Sharpness slider: 0.2–2.0
- B&W toggle (sets saturation to 0, locks slider)
- Exposure EV: -3.0 to +3.0 stops (slider with center = 0)

### Advanced adjustments (collapsible section)
- Vignette: 0–1 (darkens edges radially)
- **Per-channel levels** (RGB):
  - Each channel has a black point (0–127) and white point (128–255) slider
  - Stretch range like Lightroom Blacks/Whites per channel
- **CLAHE**: toggle + clip limit slider (1.0–4.0, default 2.0)
  - Label: "Local contrast" / "ניגודיות מקומית"

### Auto-adjust button
- "Auto levels" / "כוונון אוטומטי" — sets levelsR/G/B to 1st/99th percentile of each channel
- Applied as preview in browser (Canvas2D ImageData) for fast feedback
- Final quality version applied by Python in export

### Rendering in preview
Per-channel levels + CLAHE are computationally expensive for real-time. Strategy:
- Apply via Canvas2D `getImageData` / `putImageData` in a Web Worker
- Cache adjusted image per (assetId + adjustments hash)
- Show loading indicator while computing
- Debounce slider changes (200ms)

---

## STATE MANAGEMENT (`src/state/documentStore.ts`)

All mutations are undoable (command-based).

```typescript
// Collage rule CRUD
createCollageRule(pageId: ID, options: CollageCreateOptions): void
deleteCollageRule(ruleId: ID): void   // removes owned FrameLayers
setActiveCollageLayout(ruleId: ID, layoutId: ID): void
regenerateCollageSuggestions(ruleId: ID, images: CollageImageInput[]): void

// Image pool
addImagesToCollage(ruleId: ID, assetIds: ID[]): void
removeImageFromCollage(ruleId: ID, assetId: ID): void
assignImageToSlot(ruleId: ID, slotId: ID, assetId: ID): void
removeImageFromSlot(ruleId: ID, slotId: ID): void
swapCollageImages(ruleId: ID, slotIdA: ID, slotIdB: ID): void

// Per-cell editing
updateCollageImageTransform(ruleId: ID, slotId: ID, transform: ContentTransform): void
updateCollageImageAdjustments(ruleId: ID, slotId: ID, adj: Partial<CollageImageAssignment["colorAdjustments"]>): void
updateCollageImageEffects(ruleId: ID, slotId: ID, effects: VisualEffectStack): void
updateCollageEdgeConfig(ruleId: ID, slotId: ID, config: CollageEdgeConfig): void
autoLevelsForSlot(ruleId: ID, slotId: ID): Promise<void>  // async, may use Python

// Split tree
adjustCollageDivider(ruleId: ID, nodeRef: string, newRatio: number): void

// Canvas settings
updateCollageCanvasSettings(ruleId: ID, settings: Partial<CollageCanvasSettings>): void
reflowCollage(ruleId: ID, newPageW: number, newPageH: number): void

// Smart crop (Python required)
applySmartCropToSlot(ruleId: ID, slotId: ID): Promise<void>
analyzeAllCollageImages(ruleId: ID): Promise<void>
```

---

## UI COMPONENTS

### `CollageScreen.tsx`
```
┌───────────────────────────────────────────────────────────┐
│  Toolbar: layout name · score% · Regenerate · Export       │
├──────────────┬────────────────────────────┬───────────────┤
│ Left Panel   │    Canvas Stage             │ Right Panel   │
│ ─ Images     │  (existing Konva canvas)    │ ─ Cell        │
│   pool       │                             │ ─ Effects     │
│   unassigned │                             │ ─ Canvas      │
│ ─ Layouts    │                             │               │
│   suggested  │                             │               │
│   templates  │                             │               │
└──────────────┴────────────────────────────┴───────────────┘
```

### `CollageLeftPanel.tsx` — Two tabs

**Tab 1: Images**
- "Add images to collage" / "הוסף תמונות לקולאז׳" (primary button)
- "Add image to page" / "הוסף תמונה חופשית לדף" (secondary)
- Image pool thumbnails with drag-to-slot assignment
- **Unassigned Images section** (hidden when empty):
  - "Unassigned (N)" header
  - Thumbnails + remove button
  - "Regenerate layout using all images" button

**Tab 2: Layouts**
- Suggested: 6–12 `CollageMiniPreview` cards sorted by score
- Templates: Favorites / Recent / All / Category / Search
- "Regenerate" button
- "Save current as template" button

### `CollageRightPanel.tsx` — Three tabs

**Tab 1: Cell** (when cell selected)
- `CollageTonePanel` (full adjustments including levels, CLAHE)
- Fit mode: fill / fit / smartCrop / stretch
- Replace image / Swap / Smart crop (Python)

**Tab 2: Effects**
- Existing VisualEffectStack panel (SPP2 component reuse)
- `CollageEdgePanel` (edge style + parameters)

**Tab 3: Canvas**
- Background type + picker
- Global border, corner radius, shadow
- Spacing + margin (with SVG overlay preview during drag)
- Overlap Fade global settings (style, overlapPx, spacingOverride)
- Bleed + safe area

### `CollageEdgePanel.tsx`

- Style selector: Hard / Soft Edge / Overlap Fade / Torn Paper / Outline Circle
- **Soft Edge**: radius slider (0–80px), sides selector (all/left/right/top/bottom/auto-neighbors), curve selector
- **Overlap Fade**: overlap px slider (0–80px), sides selector (auto-neighbors default), spacing override toggle
- **Torn Paper**: roughness slider, sides selector, "Regenerate seed" button
- **Outline Circle**: color picker, width slider

---

## CANVAS RENDERING ADDITIONS

### Sorting by zIndex

When rendering collage FrameLayers, sort them by `slot.zIndex` ascending before compositing. FrameLayers with lower zIndex are rendered (painted) first. This enables overlapping layouts.

```typescript
// In CanvasStage.tsx:
const collageFrames = page.layers
  .filter(l => l.metadata?.collageFrame)
  .sort((a, b) => (a.metadata.collageFrame.zIndex ?? 0) - (b.metadata.collageFrame.zIndex ?? 0));
```

### Cell rotation

When `slot.rotationDeg !== 0`, wrap the `Konva.Group` for that cell in an additional rotation transform:
```typescript
<Group rotation={slot.rotationDeg} offsetX={cellW/2} offsetY={cellH/2} x={cellX + cellW/2} y={cellY + cellH/2}>
  {/* cell image + effects */}
</Group>
```

### Overlap Fade rendering

```typescript
// In KonvaLayerNode.tsx:
// 1. Expand cell render area by overlapPx on applicable sides
// 2. Draw image into expanded bounds
// 3. Apply feathering: offscreen canvas with gradient alpha mask
//    - Gradient from alpha=1.0 at original boundary to alpha=0.0 at expanded edge
//    - Use canvas 2D globalCompositeOperation = 'destination-in' with radial/linear gradient
// 4. Draw result onto main Konva layer
// 5. Cells are rendered in zIndex order so overlaps composite correctly
```

### Split Tree dividers

When `activeLayout.family === "splitTree"`:
- Render `Konva.Line` dividers on dedicated UI layer
- Hit test: 18px half-width
- Drag: update ratio → SVG overlay preview → commit on mouse-up

### Empty slot placeholder

When `slot.type === "empty"`:
- Light gray fill (`#e0e0e0`)
- Dashed border (`#aaaaaa`, dash [6, 4])
- Centered "תא ריק" / "Empty slot" label + plus icon
- Export: renders as `canvasSettings.backgroundColor`, no dashed border

### Collage cell selection highlight

Selected collage frame: teal/cyan highlight instead of default blue.

---

## PYTHON BRIDGE ADDITIONS

```typescript
// POST /collage/analyze
async analyzeCollageImages(request: {
  imagePaths: string[];
}): Promise<{
  results: Array<{
    assetId: string;
    width: number; height: number;
    faceRegions: Array<{ cx: number; cy: number; w: number; h: number; confidence: number }>;
    analysisScore: number;    // 0..1 composite quality
    imageType: "noPeople" | "singlePortrait" | "group" | "fullBody";
  }>;
}>

// POST /collage/export
async exportCollage(request: {
  collageRuleJson: string;
  imageAssignmentsJson: string;
  imagePaths: Record<string, string>;
  outputPath: string;
  format: "jpg" | "png" | "pdf";
  dpi: number;
  includeBleed: boolean;
}): Promise<{ success: boolean; outputPath: string; fileSizeBytes: number }>
```

Python export pipeline renders (in order per cell):
1. Crop image with content transform
2. Apply all color adjustments (brightness, contrast, saturation, sharpness, exposure, levels R/G/B, CLAHE, vignette)
3. Apply shape masking (circle, heart, polygon, ringSegment, diagonalPolygon)
4. Apply overlap expansion + Gaussian feathering mask (for overlapFade)
5. Apply torn paper mask (for tornPaper)
6. Apply cell rotation (for artistic layered layouts)
7. Composite cells in zIndex order
8. Apply borders + shadows
9. Render background
10. Convert RGBA → RGB for JPEG export

---

## TEMPLATE SYSTEM

### Storage: `Electron.app.getPath("userData")/collage-templates/*.json`

One JSON file per template. File name = `{id}.json`.

### Template service (`src/core/collage/collageTemplateService.ts`)

```typescript
listTemplates(): Promise<CollageTemplate[]>
saveTemplate(t: CollageTemplate): Promise<void>
loadTemplate(id: ID): Promise<CollageTemplate>
deleteTemplate(id: ID): Promise<void>
setFavorite(id: ID, fav: boolean): Promise<void>
duplicateTemplate(id: ID): Promise<CollageTemplate>
```

### Template mismatch rules

Generated layouts: always adapt to current image count.

Saved templates: preserve structure.
- Fewer images than slots → remaining image slots become empty
- More images than slots → extra go to Unassigned panel

### SVG thumbnail (`src/core/collage/collageSvgThumb.ts`)

Generated at save time from slot geometry. No Konva involved.
- hero slot: accent color fill
- standard slot: neutral fill
- empty slot: dashed outline, no fill
- `rotationDeg !== 0`: show tilted rectangle in SVG

---

## SAVE / LOAD

- `CollageRule` saved inside `.spp` in `document.collageRules[]`
- `CollageImageAssignment[]` inside `CollageRule.imageAssignments`
- Templates in `userData/collage-templates/` — NOT in `.spp`
- Apply template = copy slot geometry into `CollageRule` (project self-contained)
- Extend `ProjectEnvelope` schema with `collageRules: CollageRule[]`
- Migration: initialize `collageRules: []` for older projects

---

## FILE STRUCTURE

**New files:**
```
src/
├── types/
│   └── collage.ts
├── core/
│   └── collage/
│       ├── index.ts
│       ├── collageLayoutEngine.ts      ← all layout families (15+)
│       ├── collageScoring.ts           ← scoring algorithm
│       ├── collageSplitTree.ts         ← tree builder + computeRects
│       ├── collageDiagonal.ts          ← diagonal bands + hero
│       ├── collageShapedLayouts.ts     ← circle + heart packing
│       ├── collageRingCollage.ts       ← ring segment layout
│       ├── collageOverlapFade.ts       ← overlap fade math + neighbor detection
│       ├── collageTornPaper.ts         ← torn paper generation + cache
│       ├── collageSvgThumb.ts          ← SVG thumbnail generator
│       ├── collageTemplateService.ts   ← template CRUD (userData JSON)
│       ├── collageFactory.ts           ← factory functions
│       └── collageModeEngine.ts        ← high-level orchestration
├── ui/
│   └── collage/
│       ├── CollageSetupWizard.tsx
│       ├── CollageScreen.tsx
│       ├── CollageLeftPanel.tsx
│       ├── CollageLayoutGrid.tsx
│       ├── CollageMiniPreview.tsx
│       ├── CollageImageList.tsx
│       ├── CollageUnassignedPanel.tsx
│       ├── CollageRightPanel.tsx
│       ├── CollageTonePanel.tsx
│       ├── CollageEdgePanel.tsx
│       └── CollageCanvasSettings.tsx
```

**Modified files:**
```
src/types/document.ts                    ← add collageRules: CollageRule[]
src/core/save/projectFormat.ts
src/core/save/migrations.ts             ← init collageRules: []
src/state/documentStore.ts              ← all collage actions
src/ui/App.tsx                          ← /collage route
src/ui/home/HomeScreen.tsx              ← "New Collage" button
src/ui/editor/KonvaLayerNode.tsx        ← ringSegment + tornPaper + overlapFade + rotation + zIndex sort
src/ui/editor/CanvasStage.tsx           ← split tree dividers + SVG overlay preview
src/services/python_bridge/PythonBridge.ts ← analyze + export
```

---

## IMPLEMENTATION ORDER

1. `src/types/collage.ts` — complete type definitions
2. Extend `document.ts` + `projectFormat.ts` + migration
3. `collageFactory.ts` — factory functions
4. One-collage-per-page enforcement in `documentStore`
5. Virtual Layers Panel grouping + zIndex-aware rendering
6. Empty slot placeholder rendering + ringSegment shape
7. `CollageSetupWizard.tsx` — 5-step wizard
8. `collageLayoutEngine.ts` — grid, hero, mosaic, strip, dualHero, triptych (simple families first)
9. `collageScoring.ts` — scoring
10. `documentStore.ts` — all collage actions
11. `collageTemplateService.ts` + `collageSvgThumb.ts` — template system
12. `CollageScreen.tsx` + `CollageLeftPanel.tsx` + `CollageRightPanel.tsx` + `CollageTonePanel.tsx`
13. `CollageLayoutGrid.tsx` + `CollageMiniPreview.tsx`
14. `CollageImageList.tsx` + `CollageUnassignedPanel.tsx`
15. Save/load round-trip (`.spp`)
16. Template save/apply + mismatch rules
17. Reflow (SVG overlay preview + commit)
18. Additional layout families: wideBanner, filmStrip, staircase, ringFocus
19. `collageOverlapFade.ts` + `CollageEdgePanel.tsx` + overlap fade rendering
20. `collageSplitTree.ts` + divider dragging in `CanvasStage.tsx`
21. `collageDiagonal.ts` + `collageShapedLayouts.ts` + `collageRingCollage.ts`
22. `artisticLayered` layout (rotation + zIndex on slots)
23. `collageTornPaper.ts` + adaptive preview + `KonvaLayerNode.tsx`
24. Per-channel levels + CLAHE + auto-levels in CollageTonePanel
25. Python bridge: `/collage/analyze` + `/collage/export`
26. Hebrew i18n, keyboard shortcuts, UX polish

---

## KEYBOARD SHORTCUTS

| Shortcut | Action |
|---|---|
| `1`–`9` | Switch to layout suggestion N |
| `Tab` / `Shift+Tab` | Next / previous cell |
| Arrow keys | Pan image in selected cell (10px) |
| `+` / `-` | Zoom in/out in selected cell |
| `R` | Rotate cell image 90° clockwise |
| `S` | Swap mode |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Escape` | Deselect / exit cell edit |
| `Cmd/Ctrl+E` | Export |

---

## IMPLEMENTATION CHECKLIST

- [ ] `src/types/collage.ts` — incl. ringSegment, rotationDeg, zIndex, overlapFade, levelsR/G/B, clahe
- [ ] `document.ts` + `projectFormat.ts` + `migrations.ts`
- [ ] `collageFactory.ts`
- [ ] One-per-page enforcement + zIndex-sorted rendering in documentStore + CanvasStage
- [ ] `collageLayoutEngine.ts` — all 17 layout families
- [ ] `collageOverlapFade.ts` — neighbor detection + overlap math
- [ ] `collageScoring.ts`
- [ ] `collageSplitTree.ts`
- [ ] `collageDiagonal.ts`
- [ ] `collageShapedLayouts.ts` (circle + heart)
- [ ] `collageRingCollage.ts` (ring segments)
- [ ] `collageTornPaper.ts` — deterministic, cached, adaptive thresholds
- [ ] `collageSvgThumb.ts` — handles rotationDeg in SVG preview
- [ ] `collageTemplateService.ts`
- [ ] `collageModeEngine.ts`
- [ ] `documentStore.ts` — all collage actions
- [ ] `CollageSetupWizard.tsx`
- [ ] `CollageScreen.tsx`
- [ ] `CollageLeftPanel.tsx`
- [ ] `CollageLayoutGrid.tsx` + `CollageMiniPreview.tsx`
- [ ] `CollageImageList.tsx` + `CollageUnassignedPanel.tsx`
- [ ] `CollageRightPanel.tsx` + `CollageTonePanel.tsx` + `CollageEdgePanel.tsx` + `CollageCanvasSettings.tsx`
- [ ] `KonvaLayerNode.tsx` — ringSegment clip, tornPaper, overlapFade, cell rotation, zIndex sort
- [ ] `CanvasStage.tsx` — split tree dividers, SVG overlay preview
- [ ] `App.tsx` + `HomeScreen.tsx`
- [ ] `PythonBridge.ts` — analyze + export (with overlapFade + levels + CLAHE in export pipeline)
- [ ] Python `collage_mode/routes.py`
- [ ] All Hebrew i18n strings
- [ ] Keyboard shortcuts

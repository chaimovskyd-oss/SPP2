# SPP Pro Text Engine — Full Implementation Prompt
### Claude Code | Electron + React + Konva + Python backend
### RTL & Hebrew first-class | One engine, all contexts

---

## 0. BEFORE YOU WRITE A SINGLE LINE

Read `src/core/save/projectFormat.ts` and understand `ProjectEnvelope` fully.
Read all existing Zustand stores in `src/core/stores/`.
Read all existing TypeScript types in `src/core/types/`.

Do not create new types that duplicate existing ones. Extend what exists.
Ask before touching any file from Phase 0 — those are stable contracts.

---

## 1. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRO TEXT ENGINE                             │
│                                                                 │
│  TextLayerModel  ──►  TextRenderer  ──►  Konva.Text / Canvas   │
│       │                    │                                    │
│       │              (3-tier rendering)                        │
│       │              Tier 1: Konva native  (preview fast)      │
│       │              Tier 2: Canvas/WebGL  (preview quality)   │
│       │              Tier 3: Python        (export only)       │
│       │                                                        │
│       └──► serializes into ProjectEnvelope (existing format)  │
└─────────────────────────────────────────────────────────────────┘

Access points (same engine, different UI wrappers):
  CanvasTextItem       — standalone text on Konva stage
  FrameChildText       — text inside a FrameLayer (Cycle/Mask/Grid)
  WizardTextStep       — reusable wizard page component
  ContextualBar        — floating toolbar above selected text
  AdvancedTextPanel    — full effects panel (right sidebar)
  LayersPanel          — text layer list + access
```

---

## 2. COORDINATE SPACE CONTRACT

This is the most important architectural decision. Internalize it before coding.

### Standalone text (`parent: null`)
- Position is in **canvas (stage) coordinates**
- `x, y` = top-left of bounding box in stage pixels
- Transform origin = center of bounding box
- Snap targets = stage edges, stage center, other layer bounds

### Frame-child text (`parent: frameId`)
- Position is in **frame-local coordinates**
- `x, y` = offset from frame origin (0,0 = frame top-left)
- `anchor` overrides `x,y` — if anchor is set, x/y become the padding offset
- Auto-contrast samples **only the frame's image content**, not the full canvas
- Bounding constraints = frame dimensions, not stage dimensions
- When frame moves/resizes → child text moves with it automatically

### Rule: The engine never knows which mode it's in.
`TextRenderer` receives an `availableRect: Rect` parameter.
For standalone: availableRect = full stage bounds.
For frame-child: availableRect = frame bounds.
That's the only difference at the render level.

---

## 3. DATA MODEL

### 3.1 TextLayerModel

Extends whatever base layer type already exists in Phase 0 types.
Do NOT duplicate fields that already exist on base layer (id, name, visible, locked, zIndex).

```typescript
// src/core/types/textLayer.ts

export type TextDirection = 'auto' | 'ltr' | 'rtl';
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';
export type OverflowPolicy = 'auto_shrink' | 'clip' | 'warn';
export type AnchorPoint =
  | 'top_left' | 'top_center' | 'top_right'
  | 'mid_left' | 'center'    | 'mid_right'
  | 'bot_left' | 'bot_center'| 'bot_right';

export interface TextLayerModel {
  // Relationship
  layerType: 'text';
  parentFrameId: string | null;       // null = standalone

  // Content
  text: string;
  isDynamic: boolean;
  dynamicTemplate: string;            // e.g. "Photo {n} of {total}"

  // Typography
  fontFamily: string;                 // default: 'Heebo'
  fontSize: number;                   // logical points
  fontWeight: number;                 // 100–900
  fontItalic: boolean;
  letterSpacing: number;              // px (Konva uses px not em)
  lineHeight: number;                 // multiplier, default 1.2
  textDirection: TextDirection;
  align: TextAlignment;

  // Bounding box & layout
  x: number;
  y: number;
  width: number | 'auto';
  height: number | 'auto';
  rotation: number;                   // degrees
  scaleX: number;
  scaleY: number;
  anchorPoint: AnchorPoint | null;    // null = free positioning
  anchorOffsetX: number;
  anchorOffsetY: number;
  overflowPolicy: OverflowPolicy;

  // Effects stack (ordered, rendered bottom to top)
  effects: TextEffect[];

  // Layer compositing
  opacity: number;                    // 0–1, applies to composited result
  fillOpacity: number;                // 0–1, applies to FILL effect only
  blendMode: GlobalCompositeOperation;

  // Warp
  warp: WarpConfig;

  // Auto-contrast (frame-child context)
  autoContrast: AutoContrastConfig;

  // Manual override flag (set when user edits auto-contrasted text)
  autoContrastOverridden: boolean;

  // Render cache hints (not persisted)
  _cacheKey?: string;
}

export interface WarpConfig {
  type: WarpType;
  amount: number;                     // -100 to 100
  horizontalDistortion: number;       // -100 to 100
  verticalDistortion: number;         // -100 to 100
  pathPoints?: Point[];               // for 'path' type
  pathOffset?: number;
  pathSide?: 'above' | 'below';
}

export type WarpType =
  | 'none' | 'arc' | 'arc_lower' | 'arc_upper' | 'arch'
  | 'bulge' | 'shell_lower' | 'shell_upper' | 'flag'
  | 'wave' | 'fish' | 'rise' | 'fisheye' | 'inflate'
  | 'squeeze' | 'twist' | 'path';

export interface AutoContrastConfig {
  enabled: boolean;
  lightBgColor: string;               // hex color when bg is light
  darkBgColor: string;                // hex color when bg is dark
  threshold: number;                  // 0–1
}
```

### 3.2 TextEffect

```typescript
// src/core/types/textEffects.ts

export type EffectType =
  | 'fill' | 'stroke' | 'drop_shadow' | 'inner_shadow'
  | 'outer_glow' | 'inner_glow' | 'bevel_emboss'
  | 'gradient_map' | 'pattern_overlay' | 'color_overlay' | 'satin';

export interface TextEffect {
  effectId: string;
  effectType: EffectType;
  enabled: boolean;
  blendMode: GlobalCompositeOperation;
  opacity: number;                    // 0–1
  params: EffectParams[EffectType];   // discriminated union
}

// Discriminated union for params — define each:

export interface FillParams {
  fillType: 'solid' | 'gradient' | 'pattern' | 'image';
  color?: string;
  gradient?: GradientConfig;
  patternUrl?: string;
  patternScale?: number;
  patternRotation?: number;
  patternOffsetX?: number;
  patternOffsetY?: number;
  imageUrl?: string;
  perLetter?: boolean;
}

export interface GradientConfig {
  type: 'linear' | 'radial' | 'conical' | 'diamond';
  stops: Array<{ offset: number; color: string }>;
  angle?: number;
  centerX?: number;
  centerY?: number;
}

export interface StrokeParams {
  color: string;
  width: number;
  position: 'inside' | 'center' | 'outside';
  gradientEnabled: boolean;
  gradient?: GradientConfig;
  dashEnabled: boolean;
  dashPattern?: number[];
}

export interface DropShadowParams {
  color: string;
  opacity: number;
  angle: number;
  distance: number;
  spread: number;
  blur: number;
  perLetter: boolean;
}

export interface InnerShadowParams {
  color: string;
  opacity: number;
  angle: number;
  distance: number;
  blur: number;
}

export interface OuterGlowParams {
  colorOrGradient: string | GradientConfig;
  spread: number;
  blur: number;
  neonMode: boolean;
}

export interface InnerGlowParams {
  colorOrGradient: string | GradientConfig;
  spread: number;
  blur: number;
  source: 'edge' | 'center';
}

export interface BevelEmbossParams {
  style: 'inner_bevel' | 'outer_bevel' | 'emboss' | 'pillow_emboss';
  technique: 'smooth' | 'chisel_hard' | 'chisel_soft';
  depth: number;
  size: number;
  soften: number;
  lightAngle: number;
  lightAltitude: number;
  highlightColor: string;
  highlightOpacity: number;
  shadowColor: string;
  shadowOpacity: number;
  glossContour: Array<{ x: number; y: number }>;
}
```

### 3.3 ProjectEnvelope Integration

When serializing a TextLayerModel into ProjectEnvelope:
- Use the existing layer schema — do NOT add a new top-level key
- TextLayerModel fields go into the existing `data` or `properties` field (check Phase 0 schema)
- Add `"layerType": "text"` as the discriminator
- Version the schema: if Phase 0 has `schemaVersion`, increment it and add a migration entry

---

## 4. THREE-TIER RENDERING

### 4.1 Tier 1 — Konva Native (instant preview)

Used for: basic shadow, stroke, opacity, simple gradient fill.
Triggers on every keystroke and drag. Must be < 16ms.

```typescript
// src/renderer/tiers/konvaNative.ts

export function applyKonvaNativeEffects(
  textNode: Konva.Text,
  model: TextLayerModel
): void {
  // Apply only effects that Konva handles natively:
  // - Drop shadow via textNode.shadowColor/shadowBlur/shadowOffset
  // - Stroke via textNode.stroke/strokeWidth
  // - Opacity via textNode.opacity
  // - Fill color via textNode.fill
  // - Simple linear gradient via textNode.fillLinearGradientColorStops

  // Everything else: delegate to Tier 2
}
```

### 4.2 Tier 2 — Canvas/WebGL (quality preview)

Used for: inner shadow, outer glow, multi-effect compositing, complex gradients.
Runs on a debounce of 150ms after last model change. Renders to an offscreen canvas, then replaces Konva node image.

```typescript
// src/renderer/tiers/canvasComposite.ts

export class CanvasCompositeRenderer {
  private offscreenCanvas: OffscreenCanvas;

  async render(model: TextLayerModel, availableRect: Rect): Promise<ImageData> {
    // 1. Render text shape to path using canvas 2D
    // 2. For each enabled effect (in stack order):
    //    - Render effect to temp canvas
    //    - Composite onto result canvas using effect blendMode
    // 3. Apply fillOpacity to FILL layer only
    // 4. Apply model.opacity to final composited result
    // 5. Return ImageData
  }

  renderFill(ctx: CanvasRenderingContext2D, path: Path2D, params: FillParams): void { ... }
  renderStroke(ctx: CanvasRenderingContext2D, path: Path2D, params: StrokeParams): void { ... }
  renderDropShadow(ctx: CanvasRenderingContext2D, path: Path2D, params: DropShadowParams): void { ... }
  renderOuterGlow(ctx: CanvasRenderingContext2D, path: Path2D, params: OuterGlowParams): void { ... }
  renderInnerGlow(ctx: CanvasRenderingContext2D, path: Path2D, params: InnerGlowParams): void { ... }
  renderInnerShadow(ctx: CanvasRenderingContext2D, path: Path2D, params: InnerShadowParams): void { ... }
  // Bevel — approximated for preview only; full quality in Tier 3
  renderBevelPreview(ctx: CanvasRenderingContext2D, path: Path2D, params: BevelEmbossParams): void { ... }
}
```

### 4.3 Tier 3 — Python Backend (export only)

The user never waits for this. It runs only when:
- User clicks Export
- User triggers Print

```typescript
// src/renderer/tiers/pythonExport.ts

export async function requestPythonRender(
  model: TextLayerModel,
  availableRect: Rect,
  dpi: number = 300
): Promise<Blob> {
  // Send to Electron IPC → Python service
  // Payload: full TextLayerModel JSON + availableRect + dpi
  // Returns: PNG blob at print DPI
  // Python renders ALL effects at full quality (Pillow + Skia or Cairo)
}
```

**Python side contract:**
Python receives the full `TextLayerModel` JSON. It must support all effect types.
Bevel, complex gradients, satin, and pattern overlay are Python-only at full quality.
Python output must be pixel-identical to what the user saw in preview, modulo resolution.

### 4.4 Render Coordinator

```typescript
// src/renderer/TextRenderCoordinator.ts

export class TextRenderCoordinator {
  private tier1Debounce = 0;       // ms — immediate
  private tier2Debounce = 150;     // ms after last change
  private pendingTier2: ReturnType<typeof setTimeout> | null = null;

  onModelChange(model: TextLayerModel, konvaNode: Konva.Group): void {
    // Always: apply tier 1 immediately
    applyKonvaNativeEffects(konvaNode.findOne('Text'), model);

    // Debounce tier 2
    if (this.pendingTier2) clearTimeout(this.pendingTier2);
    this.pendingTier2 = setTimeout(async () => {
      const imageData = await canvasCompositeRenderer.render(model, availableRect);
      replaceKonvaNodeWithImage(konvaNode, imageData);
    }, this.tier2Debounce);
  }
}
```

### 4.5 WYSIWYG Contract

**This is non-negotiable.** Canvas preview and print output must match.

Enforce via a test:
```typescript
// src/renderer/__tests__/wysiwyg.test.ts
// For each built-in preset:
// 1. Render via Tier 2 (canvas) at 1x
// 2. Render via Tier 3 (Python) at 1x
// 3. Compare pixel histograms — must be within 2% tolerance
// If test fails, the preset is flagged as "print-unsafe"
```

---

## 5. WARP SYSTEM

Warp deforms the text's canvas Path2D before effects are applied.
Effects render on the warped path — not on the pre-warp path.

```typescript
// src/renderer/warp/warpEngine.ts

export function applyWarp(
  textPath: Path2D,
  bounds: Rect,
  config: WarpConfig
): Path2D {
  if (config.type === 'none') return textPath;

  // 1. Sample N points from textPath
  // 2. Apply warp function to each point
  // 3. Reconstruct Path2D from warped points

  const warpFunctions: Record<WarpType, WarpFn> = {
    arc:         arcWarp(config.amount, config.verticalDistortion),
    arc_lower:   arcLowerWarp(config.amount),
    arc_upper:   arcUpperWarp(config.amount),
    arch:        archWarp(config.amount),
    bulge:       bulgeWarp(config.amount),
    shell_lower: shellLowerWarp(config.amount),
    shell_upper: shellUpperWarp(config.amount),
    flag:        flagWarp(config.amount, config.horizontalDistortion),
    wave:        waveWarp(config.amount, config.horizontalDistortion),
    fish:        fishWarp(config.amount),
    rise:        riseWarp(config.amount),
    fisheye:     fisheyeWarp(config.amount),
    inflate:     inflateWarp(config.amount),
    squeeze:     squeezeWarp(config.amount),
    twist:       twistWarp(config.amount),
    path:        pathWarp(config.pathPoints!, config.pathOffset!),
  };

  return warpFunctions[config.type](textPath, bounds);
}
```

Each warp function is a pure function: `(path: Path2D, bounds: Rect) => Path2D`.
Implement them using standard parametric deformation math.
The `amount` parameter maps linearly: 0 = no deformation, ±100 = max deformation.

---

## 6. RTL & HEBREW — FIRST CLASS

This is not an afterthought. Hebrew is the primary language for many users.

### Rules:
1. **Text direction detection:** When `textDirection === 'auto'`, use the Unicode Bidi Algorithm to detect direction per paragraph. Use the `bidi-js` or `unicode-bidi` npm package — do not implement bidi yourself.

2. **Konva RTL:** Konva.Text does not handle RTL natively. You must:
   - Measure text using Canvas 2D API with `ctx.direction = 'rtl'`
   - Set `align: 'right'` as the Konva default for RTL text
   - For mixed Hebrew/English lines, use Canvas 2D text rendering directly (not Konva.Text)

3. **Font loading:** Load Hebrew fonts (Heebo, David Libre, Frank Ruhl Libre, Secular One) via Google Fonts at startup. Do not wait for user to select them — prefetch.

4. **Input:** The text input field in the contextual bar and advanced panel must support Hebrew input natively. Use a standard `<textarea>` or `<input>` with `dir="auto"` — do not intercept keyboard events.

5. **Cursor direction:** When in inline edit mode on canvas, the cursor must move right-to-left for Hebrew text. This requires implementing a custom cursor overlay on the Konva stage.

6. **Test:** Every warp type, every effect type, and every preset must be tested with Hebrew text before shipping.

---

## 7. CANVAS TEXT ITEM (React + Konva)

```tsx
// src/components/canvas/CanvasTextItem.tsx

interface CanvasTextItemProps {
  model: TextLayerModel;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onModelChange: (patch: Partial<TextLayerModel>) => void;
  availableRect: Rect;   // stage bounds for standalone, frame bounds for child
}

export const CanvasTextItem: React.FC<CanvasTextItemProps> = ({ ... }) => {
  // Konva.Group containing:
  // - Konva.Image (rendered by TextRenderCoordinator)
  // - Transform handles (when selected, not editing)
  // - Inline edit overlay (when editing)
  // - Snap guide lines (when dragging)
}
```

### Transform Handles

Use `react-konva`'s `Transformer` component for scale and rotation.
**Customize it:**
- 8 scale anchors (corners + edges)
- Rotation handle above top-center
- Drag anywhere inside bounding box = move
- Double-click inside = enter edit mode
- Rotation snaps to 0°, 45°, 90°, 135°, 180° when within 5°

### Inline Edit Mode

When `isEditing === true`:
- Hide the Konva image node
- Show an HTML `<textarea>` absolutely positioned over the canvas (via Electron's overlay layer or a portal)
- Style the textarea to match the text exactly: font, size, color, direction
- Textarea has `dir="auto"` and transparent background
- On Escape or click-outside: commit text, exit edit mode, re-render Konva image

```tsx
// src/components/canvas/InlineTextEditor.tsx
// Absolutely positioned textarea overlay
// Positioned using Konva stage.container().getBoundingClientRect()
// + item's canvas position converted to screen coordinates
```

---

## 8. SNAP SYSTEM

```typescript
// src/systems/snapSystem.ts

export interface SnapTarget {
  x?: number;    // snap to this x if within threshold
  y?: number;    // snap to this y if within threshold
  label?: string;
  guideLines: Line[];
}

export class SnapSystem {
  readonly THRESHOLD_PX = 8;

  computeSnap(
    item: TextLayerModel,
    allLayers: LayerModel[],
    stageSize: Size,
    parentFrame?: FrameLayerModel
  ): { snappedPos: Point; guides: Line[] } {
    const bounds = parentFrame ? parentFrame.bounds : { x: 0, y: 0, ...stageSize };

    const targets: SnapTarget[] = [
      // Stage/frame center
      { x: bounds.width / 2, y: bounds.height / 2, guideLines: [centerH, centerV] },
      // Stage/frame edges with padding (8px default)
      { x: 8, guideLines: [leftEdge] },
      { x: bounds.width - 8, guideLines: [rightEdge] },
      { y: 8, guideLines: [topEdge] },
      { y: bounds.height - 8, guideLines: [bottomEdge] },
      // Other text layer bounds
      ...allLayers.filter(l => l.id !== item.id).flatMap(layerSnapTargets),
    ];

    // Find closest snap target within threshold
    // Return snapped position + guide lines to draw
  }

  // Guide lines: blue (#4A90E2), 1px, appear during drag, disappear on mouseup
}
```

### Contextual Bar Flip Logic

```typescript
export function getContextualBarPosition(
  itemBounds: Rect,
  stageContainer: HTMLElement,
  barHeight: number = 48
): { top: number; flip: boolean } {
  const stageRect = stageContainer.getBoundingClientRect();
  const itemScreenTop = stageRect.top + itemBounds.y;
  const spaceAbove = itemScreenTop - stageRect.top;

  const flip = spaceAbove < barHeight + 16;
  return {
    top: flip
      ? itemBounds.y + itemBounds.height + 8   // below item
      : itemBounds.y - barHeight - 8,           // above item
    flip,
  };
}
```

---

## 9. CONTEXTUAL BAR

```tsx
// src/components/ui/TextContextualBar.tsx

// Floating, absolutely positioned over canvas
// Appears when a text layer is selected
// Disappears on deselection (not on click-outside — user may be clicking canvas)

interface TextContextualBarProps {
  model: TextLayerModel;
  position: { top: number; left: number };
  onModelChange: (patch: Partial<TextLayerModel>) => void;
  onOpenAdvanced: () => void;
}
```

### Bar layout (left to right, RTL-aware):

```
[FontFamily▼] [Size] [B][I]  │  [Fill●] [Stroke]  │  [Arch▼]  [Presets▼]  │  [⚙]
```

**FontFamily dropdown:**
- Input + dropdown list
- Each option rendered in its own font (use CSS `font-family` on the option)
- Group: Recent (top 5) | Hebrew | Latin | All
- Searchable

**Size field:**
- `<input type="number">` + up/down arrows
- Mouse wheel: ±1pt
- Common sizes dropdown: 12, 16, 18, 24, 32, 48, 64, 72, 96, 128

**B / I toggles:**
- Bold: cycles fontWeight 400 → 700 → 900 → 400
- Italic: toggles fontItalic

**Fill button:**
- Small color swatch (16x16) showing current fill
- Shows gradient bar if fill is gradient type
- Click: inline color picker popover (no dialog)
  - Solid / Gradient tabs
  - Gradient: 3 preset directions + custom angle
  - Recent colors (last 10)

**Stroke button:**
- Color swatch + width number
- Click: popover with color, width slider, position radio (inside/center/outside)

**Arch dropdown:**
- Slider: -100 to +100, default 0
- Sets `warp.type = 'arc'` and `warp.amount = sliderValue`
- Shows current value number
- "More warp options →" link → opens Advanced panel on Shape tab

**Presets dropdown:**
- Search input
- Filter chips: All | 3D | Neon | Metal | Modern | ⭐
- Thumbnail grid (3 columns)
- Thumbnails: 120×60px, rendered with user's actual current text
- Hover thumbnail: live preview on canvas (Tier 2 render, debounced 100ms)
- Click thumbnail: apply preset
- Bottom: [+ Save current style]

**⚙ button:**
- Opens AdvancedTextPanel (right sidebar)
- Highlighted while panel is open

---

## 10. ADVANCED TEXT PANEL

```tsx
// src/components/panels/AdvancedTextPanel.tsx

// Docked right sidebar
// Replaces currently open properties panel
// Three tabs: Type | Shape | Effects
```

### Tab: Type

```
Font Family    [Heebo                    ▼] [RTL]
Size           [48      ] pt
Weight         [━━━━●━━━━━━━━━━] 700
Italic         [☐]
Letter Spacing [━━━━●━━━━━━━━━━] 0 px
Line Height    [━━━━━●━━━━━━━━━] 1.2 ×
Text Direction [Auto ▼]
Alignment      [≡] [≡] [≡] [≡]

─── Advanced ───────────────────
Overflow       [Auto-shrink ▼]
Baseline Shift [━━━━━●━━━━━━━━] 0

─── Position (Precise) ─────────
X [______] Y [______]
W [______] H [______]
⚠ Primary positioning = drag on canvas
```

### Tab: Shape

```
─── Warp ────────────────────────
Type    [None ▼]  (shows icon grid when clicked)
Amount  [━━━━━●━━━━━━━━━━━━━] 0
Horiz   [━━━━━●━━━━━━━━━━━━━] 0
Vert    [━━━━━●━━━━━━━━━━━━━] 0

─── Text on Path ────────────────
[○ Off  ● Draw Path  ○ Use Shape]
Offset  [━━━━━●━━━━━━━━━━━━━] 0
Side    [Above ▼]
```

Warp type selector: icon grid (4×4), one icon per warp type, tooltip with name.
All warp sliders update live on canvas (Tier 2, debounced 150ms).

### Tab: Effects

```
EFFECTS                          [+ Add ▼]

[☑] Fill           [Normal ▼] [100%]  [↑][↓][⊕][🗑]
  ▼ expanded
  [Solid][Gradient][Pattern][Image]
  ● #FF6B35
  Fill opacity: [━━━━━━━━━━━━━━●] 100%

[☑] Drop Shadow    [Normal ▼] [80%]   [↑][↓][⊕][🗑]
  ► collapsed

[○] Outer Glow     [Screen ▼] [100%]  [↑][↓][⊕][🗑]
  ► collapsed (disabled)

[+ Add Effect ▼]
  → shows menu: Fill / Stroke / Drop Shadow / Inner Shadow /
    Outer Glow / Inner Glow / Bevel & Emboss /
    Gradient Map / Pattern Overlay / Color Overlay / Satin
  → multiple instances of same type allowed
```

Rules:
- Filled circle (●) = enabled
- Empty circle (○) = disabled
- [↑][↓] = reorder in stack
- [⊕] = duplicate this effect
- [🗑] = delete (with confirm if effect has non-default params)
- Blend mode + opacity per effect, always visible even when collapsed

### Panel Footer: Live Preview

Always visible, never scrolls away.

```
PREVIEW                    [← RTL]
┌────────────────────────────────┐
│                                │
│     your actual text here      │  120px tall
│                                │
└────────────────────────────────┘
[◼ Dark bg] [◻ Light bg] [⬜ Transparent]
```

- Preview renders via Tier 2 (canvas composite), debounced 200ms
- RTL toggle forces `textDirection` in preview only (does not change model)
- Background toggle cycles preview background only

---

## 11. PRESETS SYSTEM

```typescript
// src/core/presets/textPresets.ts

export interface TextPreset {
  presetId: string;
  name: string;
  nameHe?: string;                    // Hebrew name if applicable
  category: PresetCategory;
  tags: string[];
  effects: TextEffect[];              // effects stack only, no typography
  includesTypography: boolean;
  typography?: Partial<TextLayerModel>; // only if includesTypography
  isBuiltin: boolean;
  isFavourite: boolean;
  folder: string;
  thumbnailCacheKey?: string;         // for cache invalidation
}

export type PresetCategory =
  | 'favourites' | '3d' | 'neon' | 'metal' | 'modern'
  | 'retro' | 'minimal' | 'hebrew' | 'user';
```

### Built-in presets — implement all:

| ID | Name | Key effects |
|----|------|-------------|
| `gold_classic` | זהב קלאסי | Fill: gold gradient + Bevel Inner + Drop Shadow |
| `chrome` | כרום | Fill: silver gradient + Inner Shadow + Satin |
| `balloon` | בלון | Fill: white 80% opaque + Stroke 1px + Inner Shadow soft |
| `neon_blue` | ניאון כחול | Fill: #00FFFF + Outer Glow neonMode=true blue |
| `neon_pink` | ניאון ורוד | Fill: #FF00FF + Outer Glow neonMode=true magenta |
| `glass` | זכוכית | Fill: transparent 30% + Stroke + Inner Glow white |
| `fire` | אש | Fill: red→orange gradient + Outer Glow orange + warp.type='rise' |
| `retro_press` | רטרו | Fill: dark + Bevel chisel_hard + Pattern Overlay grain |
| `stamp` | חותמת | Stroke thick + Emboss + worn texture |
| `minimal_white` | לבן | Fill: #FFFFFF + Drop Shadow subtle |
| `minimal_black` | שחור | Fill: #000000, no effects |
| `3d_extrude` | תלת מימד | Fill: gradient + multiple Drop Shadows offset = depth illusion |

### Thumbnail Generation

```typescript
// src/core/presets/thumbnailGenerator.ts

export class PresetThumbnailGenerator {
  private cache = new Map<string, ImageData>();

  async generate(
    preset: TextPreset,
    userText: string,
    lang: 'he' | 'en' = 'he'
  ): Promise<ImageData> {
    const sampleText = userText.trim() || (lang === 'he' ? 'טקסט' : 'Text');
    const cacheKey = `${preset.presetId}::${sampleText}`;

    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const model: TextLayerModel = createBaseModel({
      text: sampleText,
      fontSize: 36,
      effects: preset.effects,
    });

    const imageData = await canvasCompositeRenderer.render(model, { width: 120, height: 60 });
    this.cache.set(cacheKey, imageData);
    return imageData;
  }

  invalidateAll(): void { this.cache.clear(); }
}
```

Thumbnails are generated on demand. Not stored in preset file. Not persisted to disk.

### Preset Storage

User presets: stored in `ProjectEnvelope` (existing format) under a `userPresets` key, or in a separate `presets.json` in the app's user data directory — check Phase 0 for the right location.

Built-in presets: hardcoded in `src/core/presets/builtinPresets.ts`. Never modified by user actions.

Import/Export: user can export a preset as a `.sppstyle` file (JSON, rename extension). Import parses and validates before adding to user library.

---

## 12. LAYERS PANEL INTEGRATION

```tsx
// src/components/panels/LayersPanel.tsx (extend existing)

// Text layer row:
// [T icon] [text preview (first 20 chars)] [fx badge] [👁] [🔒]
//
// T icon: shows RTL indicator if textDirection !== 'ltr'
// fx badge: shows if any effect is enabled (count of enabled effects)
// Single click: select + scroll canvas to item
// Double-click: enter inline edit mode
// Right-click context menu:
//   Rename | Duplicate | Delete | ─── | Copy Style | Paste Style | ─── | Lock | Unlock

// Filter button in panel header: [T] — shows only text layers
// When filter active: header turns accent color, badge shows count

// "Overridden" badge: shown on layers where autoContrastOverridden === true
// Badge: small pencil icon (✏) in accent color
```

### Copy/Paste Style

```typescript
// Clipboard is in-memory (not system clipboard)
// Stores: TextEffect[] (the full effects stack)
// Paste applies to all currently selected text layers at once
// Does NOT change typography (font, size) — effects only
// Does NOT change text content
// Does NOT change position or warp
```

---

## 13. WIZARD TEXT STEP

```tsx
// src/components/wizard/WizardTextStep.tsx

// Reusable component used by ALL wizards:
// CycleImagesWizard, MaskWizard, GridWizard, PhotoDevWizard

interface WizardTextStepProps {
  context: 'cycle' | 'mask' | 'grid' | 'photo_dev';
  sampleImage: ImageBitmap | null;    // representative frame for preview
  frameSize: Size;                    // dimensions of one cell/frame
  onTextConfigChange: (config: WizardTextConfig) => void;
}

export interface WizardTextConfig {
  enabled: boolean;
  model: TextLayerModel;              // full model, will be applied to all frames
}
```

### Layout:

```
[☑ Add text to output]

Left: Live preview (one representative cell)
Right:
  Content
    [textarea: text content]
    [☑ Dynamic text]
    Variables: {n} {total} {filename} {date}

  Position
    [AnchorPointWidget 3×3 grid]
    Offset X [___] Y [___]

  Auto-contrast
    [☑ Enable auto-contrast]
    Light bg color [●] Dark bg color [●]
    Threshold [━━━━━●━━━━━━━━] 0.5

  [⚙ Open full text editor →]
```

**[⚙ Open full text editor]** opens a modal dialog:
- Left: large live preview (400×300px min)
- Right: full AdvancedTextPanel (all three tabs)
- [Apply] [Cancel]

### AnchorPointWidget

```tsx
// src/components/ui/AnchorPointWidget.tsx
// 3×3 grid of clickable dots
// Selected dot: filled, accent color
// Hover: slightly larger
// Emits: onChange(anchor: AnchorPoint)
// Also used in: AdvancedTextPanel → Type tab → Position section
```

### Dynamic Variables

| Variable | Replaced with |
|----------|--------------|
| `{n}` | Frame number (1, 2, 3...) |
| `{total}` | Total frame count |
| `{filename}` | Source image filename (no extension) |
| `{date}` | ISO date of export |

Variables are resolved at render time (Tier 2/3), not stored as resolved values.

### Auto-Contrast Logic

```typescript
// src/systems/autoContrast.ts

export function applyAutoContrast(
  model: TextLayerModel,
  frameImageBitmap: ImageBitmap
): Partial<TextLayerModel> {
  if (!model.autoContrast.enabled) return {};
  if (model.autoContrastOverridden) return {};  // user edited manually — hands off

  const brightness = sampleBrightness(frameImageBitmap, getTextRegion(model));
  const targetColor = brightness > model.autoContrast.threshold
    ? model.autoContrast.lightBgColor    // light bg → use "light bg text color" (typically dark)
    : model.autoContrast.darkBgColor;    // dark bg → use "dark bg text color" (typically light)

  // Patch only the Fill effect color — nothing else
  return {
    effects: model.effects.map(e =>
      e.effectType === 'fill' && e.params.fillType === 'solid'
        ? { ...e, params: { ...e.params, color: targetColor } }
        : e
    )
  };
}

function sampleBrightness(image: ImageBitmap, region: Rect): number {
  // Draw to offscreen canvas, sample region, return average luminance 0–1
}
```

When user manually changes any effect param on a frame-child text that has `autoContrast.enabled`:
- Set `autoContrastOverridden = true`
- Show overridden badge (✏) on that layer in layers panel
- Tooltip on badge: "Auto-contrast overridden. Click to re-enable."
- Clicking badge: sets `autoContrastOverridden = false`, re-applies auto-contrast

### Overflow Policy

```typescript
// src/systems/overflowPolicy.ts

export function enforceOverflowPolicy(
  model: TextLayerModel,
  frameSize: Size
): Partial<TextLayerModel> {
  const renderedSize = measureTextBounds(model);

  if (renderedSize.width <= frameSize.width && renderedSize.height <= frameSize.height) {
    return {};  // fits, no action needed
  }

  switch (model.overflowPolicy) {
    case 'auto_shrink':
      return { fontSize: findMaxFontSize(model, frameSize) };

    case 'clip':
      return { width: frameSize.width, height: frameSize.height };

    case 'warn':
      // Don't modify model — mark the frame as "overflow" in wizard preview UI
      // Show orange warning badge on that frame's thumbnail
      return {};
  }
}

function findMaxFontSize(model: TextLayerModel, maxSize: Size): number {
  // Binary search: largest fontSize where text fits within maxSize
  // Search range: 6pt to model.fontSize
  // Tolerance: 1pt
}
```

---

## 14. STATE MANAGEMENT

Use existing Zustand stores from Phase 0. Extend them — do not replace.

```typescript
// Extend existing canvas/layer store with text-specific actions:

interface TextActions {
  addTextLayer: (parentFrameId?: string) => string;           // returns new layerId
  updateTextLayer: (id: string, patch: Partial<TextLayerModel>) => void;
  removeTextLayer: (id: string) => void;
  enterTextEdit: (id: string) => void;
  exitTextEdit: () => void;
  copyTextStyle: (id: string) => void;
  pasteTextStyle: (ids: string[]) => void;                    // multi-select
  applyPreset: (id: string, preset: TextPreset) => void;
  setAutoContrastOverride: (id: string, overridden: boolean) => void;
}

// Text edit state (ephemeral, not persisted):
interface TextEditState {
  editingLayerId: string | null;
  cursorPosition: number;
  selectionStart: number;
  selectionEnd: number;
}
```

### Undo/Redo

Every `updateTextLayer` call must go through the existing undo stack (check Phase 0).
Batch rapid changes (e.g. slider drag): use a debounced commit — intermediate values do NOT create undo entries.
Commit on: slider mouseup, text input blur, transform handle release.

---

## 15. MIGRATION

```typescript
// src/core/save/migrations/textLayerMigration.ts

export function migrateTextLayer(oldData: any, fromVersion: number): TextLayerModel {
  // Called by ProjectEnvelope loader when schemaVersion < current
  // Map old fields → new fields
  // Unknown old fields → store in a `legacyData` dict (don't drop)
  // Log each migration at debug level
  // Never throw — if migration fails, create a default TextLayerModel
  //   and log a warning with the original data
}
```

Add migration to the existing version migration chain in `projectFormat.ts`.
Do not break the existing migration chain.

---

## 16. IMPLEMENTATION ORDER

Follow this exactly. Do not jump ahead.

```
Phase 1 — Foundation
  1.  Read all Phase 0 files. Map existing types. Do not start coding yet.
  2.  TextLayerModel + TextEffect types (extend Phase 0, don't duplicate)
  3.  Migration layer (old format → TextLayerModel)
  4.  Zustand store extensions (text actions + undo integration)
  5.  TextRenderer Tier 1 — Konva native, solid fill only, no effects

Phase 2 — Canvas Basics
  6.  CanvasTextItem — display + selection handles + drag to move
  7.  Transform handles — scale + rotate via Konva Transformer
  8.  SnapSystem — center, edges, other layers
  9.  Contextual bar — font, size, B/I only (no effects yet)
  10. Inline edit mode — textarea overlay, Hebrew input, RTL cursor

Phase 3 — Effects
  11. TextRenderer Tier 2 — canvas composite, fill effect
  12. Stroke effect
  13. Drop Shadow effect
  14. Outer Glow + neon mode
  15. Inner Shadow + Inner Glow
  16. Bevel & Emboss (preview quality — full quality in Python)
  17. Remaining effects: Satin, Gradient Map, Pattern Overlay, Color Overlay
  18. fillOpacity (separate from layer opacity)
  19. Per-effect blend mode

Phase 4 — Warp
  20. WarpEngine — arc, arch, bulge (most used first)
  21. Remaining warp types
  22. Text on Path

Phase 5 — UI Panels
  23. AdvancedTextPanel — Type tab
  24. AdvancedTextPanel — Shape tab (warp controls)
  25. AdvancedTextPanel — Effects tab (full stack UI)
  26. Live preview strip in panel footer

Phase 6 — Presets
  27. TextPreset model + storage
  28. Built-in presets (all 12)
  29. ThumbnailGenerator
  30. Presets dropdown in contextual bar (with live hover preview)
  31. Preset import/export (.sppstyle)

Phase 7 — Layers & Panel
  32. Layers panel — text rows, filter, overridden badge
  33. Copy/Paste Style (multi-select)
  34. Contextual bar — Fill, Stroke, Arch, Presets (complete)

Phase 8 — Wizard Integration
  35. AnchorPointWidget
  36. WizardTextStep (reusable)
  37. CycleImagesWizard — add text step
  38. MaskWizard — add text step
  39. GridWizard — add text step
  40. PhotoDevWizard — add text step
  41. Auto-contrast system
  42. Dynamic variables
  43. Overflow policy

Phase 9 — Python Export
  44. IPC bridge: Electron → Python for text render
  45. Python renderer: all effects at 300 DPI
  46. WYSIWYG test suite (canvas vs Python output comparison)

Phase 10 — QA
  47. Full feature parity checklist (below)
  48. Hebrew text: all warps, all effects, all presets
  49. Print output matches canvas for all effects
  50. Performance: no stutter during drag or typing
```

---

## 17. FEATURE PARITY CHECKLIST

Before shipping any phase, verify:

**Canvas basics:**
- [ ] Text renders on canvas with correct font, size, color
- [ ] Drag to move works, snap guides appear and disappear
- [ ] Scale handles work (maintain aspect ratio when holding Shift)
- [ ] Rotation handle works, snaps to 45° intervals
- [ ] Double-click enters inline edit mode
- [ ] Hebrew input works in inline edit mode
- [ ] RTL text renders correctly with correct cursor direction
- [ ] Mixed Hebrew/English line renders correctly
- [ ] Escape exits edit mode without losing changes
- [ ] Undo/redo works for all text changes

**Effects:**
- [ ] Each effect type renders on canvas
- [ ] Effects stack order affects visual output correctly
- [ ] Multiple instances of same effect type work
- [ ] Per-effect blend mode affects compositing correctly
- [ ] fillOpacity is independent of layer opacity
- [ ] Disabling an effect immediately updates canvas

**Warp:**
- [ ] All warp types deform text correctly
- [ ] Warp sliders update canvas live (no lag)
- [ ] Warp works correctly with Hebrew text

**Presets:**
- [ ] All 12 built-in presets render correctly
- [ ] Thumbnails show user's actual text
- [ ] Hover preview updates canvas live
- [ ] Save/load user presets works
- [ ] Import/export .sppstyle works

**Wizard:**
- [ ] Text step appears in all 4 wizards
- [ ] Anchor point positions text correctly in frame
- [ ] Auto-contrast detects dark/light correctly
- [ ] Auto-contrast override badge appears and works
- [ ] Dynamic variables resolve correctly at export
- [ ] Overflow policy enforces correctly

**Export:**
- [ ] Canvas preview matches print output (within 2% tolerance)
- [ ] Print output is at correct DPI (300)
- [ ] All effects render in Python export
- [ ] Text in wizards renders in export output

---

## 18. QUALITY STANDARDS

- **No stubs.** Every item in the implementation order is fully implemented.
- **No canvas/print mismatch.** Test every effect type.
- **RTL first.** Every feature tested with Hebrew before marked done.
- **Performance.** Tier 1 < 16ms. Tier 2 debounced 150ms. No jank during typing or drag.
- **Undo granularity.** Slider drag = one undo entry. Each keystroke = NOT a separate undo entry. Commit on blur/mouseup.
- **Error resilience.** Font not found → fallback + warning badge. Effect render error → skip effect + log + no crash. Python export timeout → retry once, then show user error.
- **Coordinate clarity.** Every function that takes position params must document: "canvas coords" or "frame-local coords". No ambiguity.

---

*Start with Step 1: read all Phase 0 files and report back what you find in existing types and stores before writing any new code.*

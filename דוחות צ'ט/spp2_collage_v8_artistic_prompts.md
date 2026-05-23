# SPP2 Collage V8 — Artistic Shape Collage Engine  
## סט פרומפטים מורחב ומדורג לבנייה לפי המבנה הנוכחי

> מטרת המסמך: לתת לקלוד / AI קוד סט פרומפטים מסודר, מפורט ומדורג להרחבת מנוע הקולאז׳ של SPP2 לשלב V8: קווים מעוגלים, Blob, צורות אמנותיות, מסיכות מותאמות אישית, אותיות/מילים כמסיכות, ומבנים אסתטיים מתקדמים.  
> חשוב: המסמך לא מחליף את V6/V7. הוא בנוי כהמשך לאחר שהבסיס הגיאומטרי, ה־FrameLayer rendering, ה־metadata, ה־crop, ה־preview וה־selection יציבים.

---

## עקרונות בסיס לפני ביצוע V8

### לא לשבור את מה שכבר עובד

1. אל תשכתב את מנוע הקולאז׳ כולו.
2. אל תיגע בלוגיקת הלב הקיימת אם היא עובדת טוב.
3. אל תחליף את `CollageRule`, `CollageSlot`, `FrameLayer`, `CanvasStage` או `KonvaLayerNode` מהיסוד.
4. כל הרחבה צריכה להתחבר למבנה הקיים:
   - `CollageRule`
   - `CollageSlot`
   - `cachedSlots`
   - `imageAssignments`
   - `FrameLayer.metadata.collageFrame`
   - `CollageModePanel`
   - `CollageLayoutsPanel`
   - `collageLayoutEngine`
   - `collageSvgThumb`
   - מנגנון save/load הקיים.

### מה כן מוסיפים

V8 מוסיף שכבת יכולות חדשה:

- `svgPath` / `bezier path` לתאים אורגניים.
- `globalMask` מתקדם לקולאז׳ כולו.
- Shape library חדשה: כוכב, ענן, פרח, עץ, פרפר, Blob, Wave, מספרים, מילים.
- Upload mask MVP.
- Word / Letter collage MVP.
- Guardrails כדי למנוע תאים שבורים, דקים או לא שמישים.

---

# Prompt 0 — קריאת מצב לפני התחלת V8

השתמש בפרומפט הזה קודם, לפני כל יישום.

```txt
Before implementing V8, inspect the current SPP2 collage implementation.

Do not assume file names from older patches. Search the current codebase and identify the actual current files responsible for:

1. Collage type definitions
2. Collage layout generation
3. Geometric / polygon layout generation
4. Shaped / heart / circle layout generation
5. SVG thumbnails
6. FrameLayer sync from CollageRule
7. Konva rendering / clipping
8. Collage right-side panel / mode panel
9. Collage layout panel
10. Save/load migration if relevant

Return a short implementation map:
- current files to edit
- existing types that can be extended
- existing rendering path for polygon / svgPath / heart / global mask
- risks before starting V8

Important:
Do not implement anything yet.
This is only a codebase orientation step.
```

---

# Prompt 1 — V8 Master Plan

זה פרומפט התכנון הכללי. הוא מגדיר את V8 בלי להתחיל מיד בקוד.

```txt
Plan V8 — Artistic Shape Collage Engine for SPP2.

Build this as an extension of the current collage engine, not a replacement.

Current assumptions:
- Existing heart collage behavior is already good. Do not rewrite heart unless required for compatibility.
- V6 geometric layouts should remain separate from V8 organic layouts.
- V7 quality features such as smart crop, soft fade and image-to-cell matching may be used if already available, but V8 should not depend on them being perfect.
- The system must continue to render through existing CanvasStage / Konva / FrameLayer architecture.

V8 goals:
1. Add organic / blob / curved collage layouts.
2. Add smooth curved boundaries between cells.
3. Add built-in global shape masks beyond heart/circle.
4. Add uploaded custom mask support.
5. Add text/word/letter collage mask support.
6. Keep layouts stable across page sizes, image counts, spacing and margins.
7. Keep SVG previews and actual canvas rendering visually aligned.
8. Keep output export-ready.

Important constraints:
- No chaotic random cell generator in V8 MVP.
- Every generated cell must pass readability checks:
  - minimum visible area
  - minimum width and height
  - no extreme thinness
  - no broken path
  - no invalid clipping
- Organic cells must be deterministic using seed values.
- If a complex layout fails validation, fall back to a safer layout.
- Do not break regular collage, grid, hero, split tree, heart, circle or geometric layouts.

Return a detailed V8 plan with:
- new types
- affected files
- new layout families
- UI changes
- preview changes
- rendering changes
- save/load changes
- validation rules
- phased implementation order
- fallback behavior
```

---

# Prompt 2 — Type System Extension for V8

המטרה: להרחיב טיפוסים בלי לשבור שמירה/טעינה קיימת.

```txt
Implement V8 type extensions carefully.

Search the current collage type definitions and extend them without breaking existing projects.

Required new capabilities:

1. Smooth path slot support
Each CollageSlot should be able to represent:
- rect
- rounded
- circle
- ellipse
- polygon
- diagonalPolygon
- svgPath
- blobPath
- wavePath

If existing shape types already include svgPath/pathData, reuse them. Do not duplicate.

Each path-based slot should support:
- normalized pathData inside slot bounding box
- optional seed
- optional pathVariant
- optional smoothness
- optional organicIntensity

2. Global collage mask
Add optional globalMask to CollageRule or equivalent current rule type.

Suggested structure:
globalMask?: {
  version: 1;
  enabled: boolean;
  shape: "none" | "heart" | "circle" | "star" | "cloud" | "flower" | "tree" | "butterfly" | "blob" | "customSvg" | "customRaster" | "text";
  pathData?: string;
  rasterAssetId?: string;
  text?: string;
  fontFamily?: string;
  fontWeight?: string;
  direction?: "ltr" | "rtl";
  letterSpacing?: number;
  paddingPct?: number;
  featherPx?: number;
  invert?: boolean;
  preserveAspect?: boolean;
  metadata?: Record<string, unknown>;
}

3. New layout families
Add only if the current architecture requires enum registration:
- blobGrid
- liquidHero
- waveSplit
- organicMosaic
- maskedStar
- maskedCloud
- maskedFlower
- maskedTree
- uploadedMask
- wordMask

If the current architecture uses registry objects rather than enum-only logic, register these in the layout registry.

4. Backward compatibility
Existing documents without globalMask must behave exactly as before.
Existing slots without pathData must behave exactly as before.

Return:
- modified types
- migration requirements if any
- exact fallback defaults
```

---

# Prompt 3 — Path Geometry Utilities

זה השלב שבו בונים תשתית ל־Blob/Wave בצורה יציבה.

```txt
Create a V8 geometry utility module for organic and path-based collage shapes.

Do not mix this directly into UI components.
Create or extend a core collage geometry utility file.

Required utilities:

1. Normalized path helpers
- buildSvgPathFromPoints(points, closed, smooth)
- normalizePathToBox(path or points)
- pathBounds
- clamp/control invalid values

2. Blob path generator
Function:
generateBlobPath(options)

Inputs:
- width/height normalized box, usually 1x1
- seed
- pointCount, e.g. 8–14
- irregularity, e.g. 0..1
- smoothness, e.g. 0..1
- minRadius / maxRadius

Output:
- SVG pathData normalized to [0..1] slot coordinates

Rules:
- deterministic by seed
- no self-intersections if possible
- avoid sharp spikes
- avoid extremely thin regions
- always closed path

3. Wave boundary helper
Function:
generateWaveBoundary(options)

Inputs:
- orientation: horizontal / vertical / diagonal
- amplitude
- frequency
- phase
- smoothness
- seed

Output:
- path points or pathData usable to split a rectangular area into complementary regions

Rules:
- the two sides of a wave split must complement each other
- no gaps
- no overlaps
- works with spacing/margin

4. Readability validation
Function:
validateOrganicSlot(slot)

Checks:
- min bounding width
- min bounding height
- min approximate area
- no invalid pathData
- no NaN
- no impossible coordinates

5. Fallback
If validation fails:
- return null or fallback rect slot
- do not create broken cells

Return implementation and add unit-like helper comments explaining how each utility is used.
```

---

# Prompt 4 — Organic Layout Family: Blob Grid MVP

זה השלב הראשון שבאמת יוצר layout אורגני, אבל בצורה בטוחה כי הבסיס הוא גריד.

```txt
Implement V8A layout family: blobGrid.

Goal:
Create a safe organic collage layout that looks soft and playful, but is still based on a stable grid so it works for varying image counts and page sizes.

Behavior:
1. Start from a normal adaptive grid layout for the current image count.
2. Convert each cell into a blob-like svgPath slot.
3. The slot bounding boxes remain grid-based and non-overlapping.
4. Each slot gets a deterministic blob path using:
   - slot id or index
   - layout seed
   - image count
5. Apply spacing/margin normally.
6. Do not allow blobs to visually overlap outside their cell bounding box in MVP.

Layout rules:
- image count: 2–30
- works in portrait and landscape
- if cell is too small, use rounded rect instead of blob
- for high image counts, reduce organic intensity automatically
- default intensity should be moderate, not chaotic

Required:
- SVG thumbnail must show blob shapes, not rectangles.
- Konva rendering must clip images to blob path.
- FrameLayer metadata must preserve pathData.
- Save/load must preserve pathData or regenerate deterministically.

UI:
- Add layout family label: "Blob Grid" / "גריד כתמים"
- Optional slider in collage settings:
  "Organic intensity" 0–100
  default 35

Do not touch existing heart/circle behavior.
```

---

# Prompt 5 — Organic Layout Family: Liquid Hero

Layout עם תמונת hero גדולה בצורת Blob, מסביב תאים רגילים/מעוגלים.

```txt
Implement V8A layout family: liquidHero.

Goal:
Create an artistic layout with a large organic hero cell and supporting cells around it.

Behavior:
- For 3–12 images.
- One large hero blob, usually center or left/center depending on page aspect.
- Remaining images are placed in supporting cells around or beside the hero.
- Supporting cells can be rounded rectangles or mild blob shapes.
- No overlaps.
- The layout should feel designed, not random.

Variants:
1. centerBlob
   - hero blob in center
   - supporting cells around in top/bottom/side bands

2. leftBlob
   - hero blob left/center
   - supporting cells in right grid

3. topBlob
   - hero blob on top
   - supporting grid below

Rules:
- choose variant based on aspect ratio:
  - landscape: leftBlob or centerBlob
  - portrait: topBlob or centerBlob
- hero should cover roughly 40–60% of usable area depending on image count
- if image count > 12, do not show this layout suggestion

Validation:
- every supporting cell readable
- hero not too small
- no negative width/height
- no broken path

Rendering:
- hero cell uses blobPath/svgPath
- supporting cells use rounded or mild blob path

Scoring:
- prefer layouts where the largest image or face-heavy image can go into hero
- use existing scoring if available
```

---

# Prompt 6 — Wave Split Layout MVP

זה layout עם קווים לא ישרים, אבל בשליטה.

```txt
Implement V8A layout family: waveSplit.

Goal:
Create a stable curved layout with one or more wave dividers that split the page into complementary regions.

MVP scope:
- Support 2–5 images.
- Use one or two wave dividers.
- Do not attempt arbitrary many organic regions yet.

Variants:
1. verticalWave2
   - two cells divided by a vertical wavy line

2. horizontalWave2
   - two cells divided by a horizontal wavy line

3. doubleWave3
   - three cells using two parallel wave bands

4. heroWave
   - large hero region + 2–4 supporting rectangular/rounded cells

Technical rules:
- Generated regions must be complementary:
  - no gaps
  - no overlaps
- Each cell is a path-based slot with normalized pathData.
- Use deterministic wave seed.
- Spacing can be simulated by inset or by keeping a narrow gap between paths.
- If curved clipping is not fully reliable, fall back to polygon approximations with many points.

UI:
- Add layout label: "Wave Split" / "חלוקה גלית"
- Add optional settings:
  - Wave amount 0–100
  - Wave frequency low/medium/high
  - Direction: auto / horizontal / vertical

Validation:
- Reject if any cell has too little visible area.
- Reject if any cell becomes too narrow.
- For more than 5 images, do not offer waveSplit in MVP.

Important:
Do not generate chaotic blob mosaics yet.
Wave Split should be controlled, predictable and clean.
```

---

# Prompt 7 — Global Shape Mask Engine

זה קריטי למסיכות צורה מתקדמות, והוא הבסיס ל־Uploaded Mask ו־Word Mask.

```txt
Implement V8B: Global Shape Mask Engine.

Goal:
Allow a collage to be clipped by a single global mask shape, similar to the existing heart/circle behavior, but generalized.

Important:
The global mask clips the entire collage group visually.
Individual cells can remain normal internal layouts.

Supported MVP shapes:
- star
- cloud
- flower
- simple tree
- blob
- customSvg later
- text later

Do not rewrite current heart if it works.
If heart/circle already use a special global mask path, reuse the same concept.

Data:
Use CollageRule.globalMask or current equivalent.

Rendering:
1. SVG thumbnails:
   - show internal cells clipped inside the global mask when possible.
   - fallback: draw mask outline over cells.

2. Konva:
   - preferred: render collage frames inside clipped group.
   - if difficult with existing FrameLayer architecture, apply mask-aware per-frame clipping only for globalMask layouts.
   - do not break selection.

3. Export-readiness:
   - store mask path/raster reference in project.
   - final export can apply mask at full quality later.

UI:
Add general collage setting:
- Mask Shape:
  none / star / cloud / flower / tree / blob / custom / text
- Mask padding
- Feather
- Invert mask toggle, optional later

Validation:
- If selected mask has too little usable area, show warning.
- If image count too high for shape, show warning but allow.

Deliver:
- type changes
- mask path generation functions
- thumbnail support
- canvas preview support
- safe fallback behavior
```

---

# Prompt 8 — Built-in Shape Library

הספרייה המוכנה: כוכב, ענן, פרח, עץ, פרפר וכו׳.

```txt
Implement V8C: Built-in Shape Mask Library.

Goal:
Add a small but high-quality library of built-in shape masks for collage.

Shapes to add in MVP:
1. star
2. cloud
3. flower
4. simple tree
5. blob badge
6. butterfly simple, optional if stable
7. number badge, optional

Each shape should define:
- id
- nameHe
- nameEn
- category
- recommended minImages
- recommended maxImages
- path generator
- default internal layout family
- warning rules

Shape implementation rules:

Star:
- Use global mask, not individual triangle cells.
- Internal layout can be grid/hero.
- Avoid tiny star tips becoming main image areas.

Cloud:
- Use smooth blob/cloud path.
- Good for kids/family designs.
- Internal layout can be grid/organic.

Flower:
- Center circle/soft cell + petal mask.
- For MVP, can be global mask with internal layout.
- Later can support per-petal cells.

Simple tree:
- MVP should be a tree silhouette mask:
  - trunk + crown
  - internal grid clipped to tree
- Do not build a full family-tree graph yet.
- Recommended for 8–25 images.

Blob badge:
- Simple organic global mask.
- Useful for modern designs.

Butterfly:
- Optional if stable.
- Two wing areas + center body.
- If too complex, return plan only and defer.

UI:
Add shape picker in CollageModePanel under general collage settings:
- None
- Heart
- Circle
- Star
- Cloud
- Flower
- Tree
- Blob
- Custom upload
- Text

Do not implement uploaded custom or text mask in this prompt unless the base shape library is stable.
```

---

# Prompt 9 — Uploaded Mask MVP

זה השדרוג שהמשתמש מעלה מסיכה אישית.

```txt
Implement V8D: Uploaded Custom Mask MVP.

Goal:
Allow the user to upload a custom mask and generate a collage clipped to that mask.

Supported input MVP:
1. Transparent PNG:
   - alpha > threshold means inside mask

2. Black/white PNG:
   - white/bright pixels mean inside mask
   - black/dark pixels mean outside

3. SVG simple path:
   - use path as mask if safe
   - otherwise rasterize or reject with message

Behavior MVP:
- Store uploaded mask as an asset or mask resource in project.
- Normalize mask to canvas while preserving aspect ratio.
- Generate an internal layout inside the mask bounding box.
- Clip the final collage by the uploaded mask.
- Do not attempt perfect intelligent cell subdivision yet.

UI:
Add button:
"העלה מסיכה לקולאז׳"

Options:
- Fit: contain / cover / stretch
- Padding
- Feather
- Invert mask
- Threshold for raster masks

Validation:
Analyze mask:
- usable area percentage
- bounding box
- too thin regions
- too many disconnected islands
- too small effective area

Warnings:
- "המסיכה דקה מדי, ייתכן שהתמונות ייחתכו חזק"
- "המסיכה מורכבת מדי לשלב זה"
- "המסיכה מכילה אזורים נפרדים רבים"

Fallback:
- If mask invalid, do not apply it.
- Keep current collage unchanged.

Important:
This MVP should clip the collage to the uploaded mask.
It does not yet need to divide the mask into perfect custom cells.

Return implementation with:
- file upload flow
- asset storage decision
- mask normalization
- preview
- save/load
- error handling
```

---

# Prompt 10 — Mask-Aware Packing V2

זה השלב שבו לא רק חותכים את הקולאז׳ במסיכה, אלא מנסים לבנות תאים לפי המסיכה.

```txt
Implement V8D-2: Mask-aware packing for uploaded and built-in masks.

Goal:
Generate cell layouts that respect the proportions of the mask, not just a rectangular layout clipped by the mask.

Approach:
Use a safe row-span / band-span algorithm inspired by the old collage app shape layout logic.

Algorithm:
1. Rasterize the mask to a working resolution, e.g. 512–1024 px max dimension.
2. Divide the mask into horizontal bands based on image count and mask height.
3. For each band, find the widest continuous inside-mask span.
4. Build cells inside those spans.
5. Distribute image count across bands by available area.
6. Prefer larger cells near the center and smaller cells near edges.
7. Reject edge spans that are too narrow.
8. Apply spacing by shrinking cells or adding gaps.
9. Generate normalized CollageSlot geometry.
10. Apply global mask as final clip.

Inputs:
- mask
- imageCount
- page aspect
- spacing
- margin
- density
- minCellSize
- preferLargeCenterCells

Outputs:
- slots
- globalMask
- warnings if quality is low

Rules:
- Do not generate cells in tiny mask tips.
- Avoid cells with visible area below threshold.
- Allow fallback to regular internal grid clipped by mask.
- Keep deterministic result.

UI:
Add option:
Packing mode:
- Simple internal grid
- Mask-aware rows
- Center-weighted
- Dense

Recommended default:
Mask-aware rows.

Important:
Do not implement Voronoi yet.
Do not attempt mathematically perfect decomposition.
Build a useful, stable and understandable algorithm first.
```

---

# Prompt 11 — Word / Letter Collage MVP

מילים ואותיות כמסיכות קולאז׳.

```txt
Implement V8E: Word / Letter Collage MVP.

Goal:
Allow the user to type a word or short phrase and turn it into a collage mask.

Use cases:
- שמות ילדים
- אמא
- אבא
- LOVE
- FAMILY
- 2026
- גיל / מספר

MVP modes:

Mode A — Whole Word Mask
- Render the entire word as one combined mask.
- Generate internal collage layout behind it.
- Clip collage to the word mask.
- This is the first and safest implementation.

Mode B — Per Letter Mask, optional after Mode A
- Treat each letter as a separate mask region.
- Distribute images between letters by letter area.
- Each letter gets its own internal packing.

Text settings:
- text
- font family
- font weight
- direction: auto / rtl / ltr
- letter spacing
- line height if multiline later
- padding
- alignment
- mask feather
- invert optional

Hebrew support:
- Support RTL text direction.
- Start without nikud-specific handling.
- Use bold fonts by default.
- Warn if selected font is too thin for collage.

Validation:
- Text mask usable area must be large enough.
- Letters must not be too thin.
- If text is too long, show warning:
  "המילה ארוכה מדי, מומלץ לבחור פחות אותיות או להגדיל את הדף"

Image distribution:
Mode A:
- use all selected images inside the whole word mask.

Mode B:
- distribute image count by letter area.
- each letter gets at least one image if possible.
- extra images assigned to larger letters.

UI:
Add "Text Mask" option under mask shape.
Fields:
- Text input
- Font picker
- Direction
- Letter spacing
- Mode: whole word / per letter
- Apply button

Rendering:
- Generate text as SVG path or raster mask.
- Prefer path if available.
- Use raster mask fallback if path extraction is difficult.

Save/load:
- Store text settings, font info and generated mask reference/path.

Fallback:
- If text-to-path fails, use rasterized text mask.
- If font unavailable, use safe fallback font.

Do not implement advanced typography editing in this phase.
```

---

# Prompt 12 — V8 UI Integration

איך כל זה מופיע בממשק בלי להפוך אותו לבלגן.

```txt
Update Collage UI for V8 without cluttering the interface.

Rules:
- Advanced artistic features should be grouped and collapsible.
- Do not show every setting at once.
- Keep the normal collage workflow simple.

CollageModePanel behavior:

When no layer/cell is selected:
Show general collage settings:
1. Layout
   - Current layout family
   - Regenerate
   - Spacing
   - Margin

2. Cell style
   - Cell shape: rect / rounded / circle / blob / path
   - Corner radius
   - Edge style
   - Soft fade / torn paper

3. Artistic shape mask
   - Mask shape picker:
     none / heart / circle / star / cloud / flower / tree / blob / upload / text
   - Mask padding
   - Mask feather
   - Packing mode

4. Organic settings, collapsed by default:
   - organic intensity
   - wave amount
   - wave frequency
   - seed / shuffle

When a collage image cell is selected:
Show image editing:
- Fit / Fill
- Reset crop
- Smart crop
- Replace image
- Swap image
- Color adjustments
- Tips tab

Do not duplicate layout previews in both side panels.
Layout previews should remain in the designated layout panel only.

Add warnings:
- too many images for selected artistic layout
- mask too thin
- cells too small
- preview simplified for performance

Return updated UI plan and implementation.
```

---

# Prompt 13 — Validation and Safety Guards

זה קריטי כדי שלא יהיו תאים שבורים.

```txt
Implement V8 validation and fallback guards.

Every V8-generated layout must be validated before being shown as a suggestion or applied.

Validation checks:
1. No NaN coordinates.
2. All bounding boxes inside [0..1] or safely clamped.
3. Slot width/height above minimum.
4. Approximate visible area above minimum.
5. Aspect ratio not extreme unless explicitly allowed.
6. No duplicate zero-area slots.
7. No more image slots than reasonable for layout family.
8. PathData valid if used.
9. Global mask usable area above threshold.
10. SVG preview can render without errors.

If validation fails:
- Do not show layout suggestion.
- Or downgrade to safe fallback:
  - rounded grid
  - regular grid clipped by mask
  - no organic path

Add debug metadata for development:
- validationWarnings
- fallbackReason
- effectiveVisibleArea
- minSlotSize

UI:
If a selected layout is downgraded, show small non-blocking message:
"הפריסה פושטת כדי לשמור על יציבות"

Performance:
- limit blob path complexity
- limit number of points per path
- for many images, reduce organic intensity automatically
- no live recomputation every mouse move unless throttled

Return exact validation functions and where they are called.
```

---

# Prompt 14 — V8 Save/Load and Compatibility

```txt
Implement V8 save/load compatibility.

Requirements:
1. Existing projects must open unchanged.
2. Projects without globalMask behave as before.
3. Projects with V8 slots preserve:
   - pathData
   - slot shape
   - seed
   - organic settings
   - globalMask settings
   - uploaded mask reference if used
   - text mask settings if used

4. If a referenced uploaded mask asset is missing:
   - show warning
   - disable mask
   - keep internal layout visible

5. If a font used for word mask is missing:
   - use fallback font
   - show warning

6. Migrations:
   - add defaults only
   - do not rewrite existing collageRules aggressively
   - do not delete unknown metadata

7. Export-readiness:
   - preserve enough information to render later in Python/high-res export.

Return:
- migration changes
- default values
- compatibility tests
```

---

# Prompt 15 — V8 Testing Checklist

פרומפט בדיקות לפני שסוגרים V8.

```txt
Create and run a V8 collage testing checklist.

Test categories:

A. Existing behavior must remain stable
- Regular grid
- Hero
- Split tree
- Heart
- Circle
- Existing geometric layouts
- Add images to collage
- Replace image
- Swap image
- Save/load

B. Blob / organic
- Blob grid with 3, 6, 12, 24 images
- Portrait and landscape pages
- Large spacing
- Small spacing
- Page resize/reflow
- SVG thumbnail matches canvas

C. Wave Split
- 2 images horizontal
- 2 images vertical
- 3 images double wave
- 5 images hero wave
- high spacing fallback
- no gaps/overlaps

D. Shape masks
- Star
- Cloud
- Flower
- Tree
- Blob
- Mask padding
- Mask feather
- Too many images warning

E. Uploaded mask
- Transparent PNG
- Black/white PNG
- Invalid image
- Very thin mask
- Mask with disconnected islands
- Save/load

F. Word mask
- English word
- Hebrew word
- Number
- Long text warning
- Missing font fallback
- Whole word mode
- Per-letter mode if implemented

G. Performance
- 30 images
- Many blob paths
- Zoom/pan responsiveness
- Layout suggestion generation time
- No continuous heavy recompute

Return issues grouped by:
- blocker
- important
- polish
```

---

# V7 / V8 / V9 Roadmap Summary

## V7 — Quality and Control
- Soft Fade אמיתי עם סליידר.
- Smart Crop משופר.
- Image-to-cell matching.
- Crop tips.
- שיפור החלפת תמונות.
- Templates דינמיים.

## V8 — Artistic Shapes
- Blob Grid.
- Liquid Hero.
- Wave Split.
- Global Shape Mask Engine.
- Shape Library.
- Uploaded Mask MVP.
- Word/Letter Mask MVP.
- Guardrails ו־fallbacks.

## V9 — Advanced Custom Collage
- Mask-aware packing מתקדם.
- Per-letter intelligent layout.
- Tree/family-tree templates.
- Voronoi / organic mosaic.
- Full export למסיכות מורכבות.
- Template marketplace/library פנימית.
- Advanced custom SVG editing.

---

# סיכום קצר לקלוד

אם צריך לשלוח רק פרומפט אחד מקוצר לפתיחת העבודה, שלח את זה:

```txt
We are starting SPP2 Collage V8: Artistic Shape Collage Engine.

Do not rewrite the collage system. Extend the current CollageRule / CollageSlot / FrameLayer / CanvasStage architecture.

Do not touch the existing heart layout unless required for compatibility.

V8 should add:
1. Organic path-based slots: blobGrid, liquidHero, waveSplit.
2. Global shape masks: star, cloud, flower, tree, blob.
3. Uploaded custom mask MVP.
4. Text/word/letter collage mask MVP.
5. Validation and fallback guards so no broken/thin/ugly cells are generated.

Work in phases:
V8A: path utilities + blobGrid + liquidHero + waveSplit
V8B: globalMask engine
V8C: built-in shape library
V8D: uploaded mask MVP
V8D-2: mask-aware row packing
V8E: word/letter mask MVP
V8F: validation, save/load, UI integration, testing

Every layout must support page size changes, spacing/margin, image count changes and SVG/Konva preview alignment.

Return a detailed implementation plan before coding.
```

# SPP v2 — Phase 3 Grid Mode — Detailed Build Prompt for Claude Code

## Context
You are working inside the existing SPP v2 architecture.
This prompt is specifically for **Phase 3 — Grid Mode**.

Do not rebuild the app.
Do not create a separate mini-app.
Do not create a separate canvas engine.
Do not create a separate text engine.
Do not create a separate save/export/history system.

Grid Mode must be built on top of the existing SPP v2 shared core:

- Document System
- Page System
- Layer System
- FrameLayer System
- TextLayer System
- Asset System
- Selection / Transform System
- History / Command System
- Batch Operations System
- Export System
- Zustand state stores
- React-Konva rendering layer

Grid Mode is a workflow layer only.
It manages layout rules and automation, but every visible object must still be represented by canonical core objects.

---

# Main Goal

Build a robust, predictable, print-ready **Grid Mode** for SPP v2.

Grid Mode allows the user to:

1. Create a structured table-like layout of identical rectangular cells.
2. Drag/import many images.
3. Automatically fill the grid cells.
4. Automatically create multiple pages when there are more images than fit on one page.
5. Change global grid settings such as rows, columns, spacing, margins, fit mode, and orientation behavior.
6. Keep manual image rotation and crop behavior as much as possible when the grid is regenerated.
7. Swap images between cells by drag/drop.
8. Delete an image and have the last used image fill the deleted slot.
9. Apply a shared text overlay to every grid cell using the existing Pro Text Engine.
10. Export all pages correctly through the existing Export System.

---

# Core Architectural Rule

Grid Mode does not own visual objects.

Every grid cell is a normal `FrameLayer`.
Every image inside a grid cell is represented through the normal image/frame relationship.
Every text overlay inside a cell is a normal `TextLayer`.
Every page is a normal `Page`.
Every change goes through the normal history/command system.

Grid Mode owns only:

- Grid layout rules
- Cell indexing
- Batch fill logic
- Multi-page generation logic
- Relationship between grid cells across pages
- Shared grid text overlay rules
- UI workflow behavior

Do not store canonical visual data only inside the Grid Mode state.
The Grid Mode state may reference layer IDs, page IDs, grid IDs, and rule IDs, but the actual visual objects must live in the core document model.

---

# Important Product Decisions

These decisions are final and must be implemented accordingly.

## 1. Grid is live, but mostly static

A grid is a live layout entity, not a one-time generator.

However, it should not constantly reflow on every small edit.
The grid stays visually stable unless the user changes a meaningful grid setting, such as:

- rows
- columns
- spacing
- margins
- page size
- fit mode
- auto-rotate policy
- global orientation policy
- text overlay placement rule

Small edits like rotating an image inside a cell should not trigger full grid regeneration.

## 2. Grid supports only uniform rectangles

For Phase 3, Grid Mode supports only rectangular cells.

Allowed:

- regular rectangles
- optional corner radius if already supported by FrameLayer
- uniform cell size within each page

Not allowed in Grid Mode:

- circles
- polygons
- SVG masks
- PNG masks
- mixed-size cells
- collage-style dynamic cells

Complex shapes belong to Mask Mode.
Mixed-size layouts belong to Collage Mode or a later phase.

## 3. Grid and Mask Mode are different by layout logic

Grid Mode is a strict table-like layout.
It divides the usable page area into equal rectangular cells.

Mask Mode is not a strict table.
Mask Mode arranges shaped frames on a page with controllable spacing, but does not behave like a classic rows/columns grid.

This distinction must be preserved in the code.
Do not merge Grid Mode and Mask Mode into one messy implementation.
Shared code is allowed only in core systems such as FrameLayer, Batch, Smart Crop, and Transform.

## 4. No mixed-size grid cells

All grid cells in a single grid are the same size.
Changing margins or spacing reduces/increases the computed cell size.
It does not create uneven cells.

## 5. FrameLayers should be created upfront

When a grid is created, its cells should be represented by actual `FrameLayer` objects.

For example, if the user creates a 3x2 grid, each page has 6 FrameLayers.
If 30 images are imported, the system creates 5 pages, each with 6 FrameLayers.

Empty cells are allowed only where needed, but unused trailing cells should be removed or hidden according to the grid cleanup rules defined below.

## 6. Multi-page grid is one grid entity

If the user creates a 3x2 grid and imports 30 images, this is one grid job/entity spanning multiple pages.

Do not treat each page as a totally separate unrelated grid.

There should be a single grid ID / grid rule that can control all pages created by that grid.
Each page has page-local instances/cells, but they remain connected to the same grid entity.

## 7. Duplicating a page preserves the grid relationship

If a grid page is duplicated, it should preserve its grid relationship unless the user explicitly detaches it.

## 8. Detach from Grid is optional

If not too complex, support a command called:

`Detach From Grid`

This command converts selected grid cells into regular independent FrameLayers while preserving their current visual state.

If this feature is too complex for this phase, prepare the data model for it but do not block Phase 3 on it.

---

# Required Data Model Additions

Add explicit grid-related metadata to the model.
Do not rely on implicit naming or visual positions to understand grid membership.

## GridLayoutRule

Create a typed model similar to this:

```ts
interface GridLayoutRule {
  id: string;
  version: number;
  name: string;

  pageIds: string[];
  frameIds: string[];

  rows: number;
  columns: number;

  margins: Margins;
  spacingX: number;
  spacingY: number;

  fillDirection: 'rtl' | 'ltr';
  fillOrder: 'rowMajor';

  fitMode: FitMode;

  autoCreatePages: boolean;
  removeUnusedTrailingCells: boolean;

  imageOverflowBehavior: 'createPages';
  imageDeleteBehavior: 'fillFromLastUsedImage';
  dragDropBehavior: 'swapImages';

  autoRotatePolicy: 'none' | 'rotateToCellOrientation' | 'forcePortrait' | 'forceLandscape';
  orientationPolicy: 'allowMixed' | 'preferCellOrientation' | 'forcePortrait' | 'forceLandscape';

  preserveManualRotationOnRegenerate: boolean;
  preserveManualCropAsMuchAsPossible: boolean;
  preserveImageAssignmentByStableIndex: boolean;

  linkedGroupId?: string;
  textOverlayRuleIds: string[];

  metadata: Record<string, unknown>;
}
```

## Grid Cell Metadata

Each grid FrameLayer should know that it belongs to a grid.

Add metadata fields to FrameLayer or to its metadata object:

```ts
interface GridCellMetadata {
  gridId: string;
  gridPageIndex: number;
  cellIndexGlobal: number;
  cellIndexOnPage: number;
  row: number;
  column: number;
  isGridCell: true;
}
```

Do not store this only in UI state.
It must survive save/load.

## Grid Image Assignment

The grid must maintain stable image assignments.

Suggested model:

```ts
interface GridImageAssignment {
  id: string;
  gridId: string;
  assetId: string;
  frameId: string;
  globalIndex: number;
  pageIndex: number;
  cellIndexOnPage: number;

  manualRotation?: number;
  manualCrop?: CropRect;
  manualFitModeOverride?: FitMode;
  hasManualCropOverride?: boolean;
  hasManualRotationOverride?: boolean;
}
```

The purpose is to preserve user work during regenerate/reflow.

---

# Grid Generation Rules

## Basic generation

When the user creates a grid:

1. Determine usable page area:
   - page width/height
   - minus margins
   - respect safe area / bleed guides if enabled
2. Determine cell count:
   - rows * columns
3. Determine spacing:
   - spacingX between columns
   - spacingY between rows
4. Compute cell size:
   - cellWidth = availableWidth minus total horizontal spacing, divided by columns
   - cellHeight = availableHeight minus total vertical spacing, divided by rows
5. Create one `FrameLayer` per cell.
6. Assign grid metadata to each FrameLayer.
7. Add the cells to the page layers.
8. Register the grid rule in the document/state.
9. Add all generated frame IDs to a LinkedGroup or grid-specific group so global settings can be applied consistently.

## Cell size behavior

In Grid Mode, the user does not define a fixed cell size by default.
The user defines division rules: rows, columns, margins, and spacing.
The cell size is computed automatically.

If spacing or margins increase, cells shrink.
If spacing or margins decrease, cells grow.

This is a key difference from Mask Mode, where the actual mask/frame size should usually stay fixed and spacing changes the arrangement.

## Fill direction

Default fill direction may be RTL.

But RTL is not highly critical for this phase, so implement it simply:

- RTL means the first cell in a row is the rightmost cell.
- LTR means the first cell in a row is the leftmost cell.
- Fill order is row-major.

Do not overcomplicate page navigation or numbering for now.

---

# Multi-page Rules

If the user imports more images than fit on one page:

1. Calculate cells per page = rows * columns.
2. Calculate required pages = ceil(imageCount / cellsPerPage).
3. Create enough pages.
4. Create the same grid cell structure on every generated page.
5. Assign images by stable global index.

Example:

- Grid: 3x2
- Cells per page: 6
- Images: 30
- Required pages: 5
- Result: 5 pages, 6 cells each, one grid entity spanning all pages.

If the number of images later decreases, remove unused trailing cells/pages when safe.

Do not delete a page if it contains non-grid user content unless the user confirms or unless the content belongs fully to the grid being cleaned up.

---

# Image Fill Rules

## Initial fill

When images are imported into the grid:

1. Create assets through the existing Asset System.
2. Use preview assets for canvas rendering.
3. Keep originals for export.
4. Fill frames by global index.
5. Use the grid's current fit mode.
6. Apply auto-rotate policy if enabled.
7. Use face detection/smart crop only if already available through the existing Python worker bridge.
8. Never block the UI thread.
9. Use BatchJob with visible progress.

## Fit / Fill / Crop behavior

Changing global fit mode should not destroy manual crop work by default.

Rules:

- Global fit/fill changes apply to cells that do not have manual crop overrides.
- Cells with manual crop overrides should preserve their crop as much as possible.
- Provide a separate command: `Reset Crops For All Grid Images`.
- Provide another command if easy: `Reset Crops For Selected Cells`.

## Regenerate behavior

When the grid is regenerated because rows/columns/spacing/margins changed:

Preserve as much as possible:

- image assignment by stable global index
- manual image rotation
- manual crop intent
- fit mode override if any
- text content per cell
- text override per cell if any

The image should still contain the full original image asset, even if part of it visually disappears because the new cell is smaller or has a different aspect ratio.
Do not destructively crop image files.
All cropping remains non-destructive.

---

# Image Rotation and Orientation Rules

This is important.

Grid Mode must support orientation handling.

Required policies:

```ts
type GridAutoRotatePolicy =
  | 'none'
  | 'rotateToCellOrientation'
  | 'forcePortrait'
  | 'forceLandscape';
```

## none

Do not automatically rotate imported images.

## rotateToCellOrientation

If a cell is portrait and the image is landscape, rotate if that creates a better fit.
If a cell is landscape and the image is portrait, rotate if that creates a better fit.

This should be non-destructive and reversible.

## forcePortrait

All images are displayed as portrait orientation where possible.

## forceLandscape

All images are displayed as landscape orientation where possible.

Manual rotation must override auto-rotation.

If the user manually rotates a specific image, mark it as having a manual rotation override.
Future regenerate/reflow must preserve it.

---

# Delete Behavior

When the user deletes an image from a grid cell:

- If there are images after it, the last used image should move into the deleted slot.
- The last now-unused cell should be cleared or removed according to cleanup rules.
- If this causes the final page to become empty, remove that final page if it contains only grid-generated content.

This behavior is intentional.

Example:

- 30 images in a 3x2 grid = 5 pages.
- User deletes image in page 1, cell 2.
- The image from the last occupied cell moves into that deleted location.
- The last occupied cell becomes empty.
- If the last page is now empty, remove it.

This should be one undoable command.

Command name suggestion:

`DeleteGridImageAndCompactFromEndCommand`

---

# Drag and Drop Behavior

Dragging an image from one grid cell to another must swap images.

It must not move the cell itself.
It must not change the grid geometry.

Rules:

- Drag image A from cell 1 to cell 5.
- Image A and image B swap cells.
- Their manual crop/rotation behavior should follow the image assignment when appropriate.
- The cells remain in the same position.

This should be one undoable command.

Command name suggestion:

`SwapGridCellImagesCommand`

---

# What Users Can Manually Edit in Grid Cells

For Phase 3, keep this simple.

Allowed:

- rotate image inside a cell
- crop/reposition image inside a cell
- change fit mode for selected cell if the core supports it
- edit text content in a cell
- override text style/position for a selected cell if supported

Not allowed for now:

- move a grid cell independently
- resize a grid cell independently
- create mixed-size cells
- freely distort the table structure

If the user tries to move or resize a grid cell directly, the UI should either prevent it or show a clear indication that this is a managed grid cell.

Future support for breaking a cell out of the grid should be handled via `Detach From Grid`, not accidental manual transforms.

---

# Apply Settings To All

Implement `Apply To All` as explicit scoped commands.
Do not create one vague destructive operation.

Required operations:

- Apply Fit Mode To All Grid Cells
- Apply Border/Stroke To All Grid Cells, if stroke exists in FrameLayer
- Apply Spacing To Entire Grid
- Apply Margins To Entire Grid
- Apply Auto Rotate Policy To Entire Grid
- Apply Text Overlay Style To All Cells
- Apply Text Overlay Position To All Cells
- Reset Crops For All Grid Images

Important:

`Apply Fit Mode To All` must not reset manual crop by default.
Crop reset must be a separate explicit action.

---

# Grid Text Overlay System

This is a required part of Phase 3.

The user needs a tool that can create a text box once and apply it to every grid cell in the same relative position.

This is not a new text engine.
This must use the existing Pro Text Engine and regular `TextLayer` objects.

## Goal

The user can define a text overlay relative to a grid cell, for example:

- bottom center
- 5 mm above the bottom edge
- 90% of the cell width
- auto-fit text to the box
- same font/color/alignment across all cells

The system then creates/manages one TextLayer per grid cell.
Each TextLayer is positioned relative to its parent cell.

## Required behavior

- Create one text overlay rule.
- Apply it to all existing grid cells.
- Automatically apply it to new cells created later by auto pages/regenerate.
- Changing global text style updates all linked cell text layers.
- Changing global text position updates all linked cell text layers.
- Individual cell text can be edited manually.
- Individual cell text can have overrides if needed.
- The global overlay rule should not erase individual text content unless explicitly requested.

## Suggested model

```ts
interface GridTextOverlayRule {
  id: string;
  version: number;
  gridId: string;
  name: string;

  anchor:
    | 'topLeft'
    | 'topCenter'
    | 'topRight'
    | 'centerLeft'
    | 'center'
    | 'centerRight'
    | 'bottomLeft'
    | 'bottomCenter'
    | 'bottomRight'
    | 'custom';

  relativeX: number;      // 0-1 relative to cell
  relativeY: number;      // 0-1 relative to cell
  relativeWidth: number;  // 0-1 relative to cell
  relativeHeight?: number;

  offsetX: number;        // print units or document units
  offsetY: number;
  padding: number;

  autoFitText: boolean;
  minFontSize: number;
  maxFontSize: number;

  textSource:
    | 'filename'
    | 'manual'
    | 'index'
    | 'empty'
    | 'metadata';

  defaultText: string;
  textStyle: TextStyle;

  applyToExistingCells: boolean;
  applyToNewCells: boolean;

  overridable: boolean;

  textLayerIdsByFrameId: Record<string, string>;
  perCellOverrides: Record<string, GridTextOverlayOverride>;

  metadata: Record<string, unknown>;
}

interface GridTextOverlayOverride {
  text?: string;
  textStyle?: Partial<TextStyle>;
  relativeX?: number;
  relativeY?: number;
  relativeWidth?: number;
  relativeHeight?: number;
  offsetX?: number;
  offsetY?: number;
  autoFitText?: boolean;
}
```

## Text source behavior

Support these text sources:

### filename

Use the image filename as the default text.
Clean the filename:

- remove extension
- replace `_` with spaces
- preserve Hebrew filenames correctly

Example:

`יותם_כהן.jpeg` becomes `יותם כהן`

### index

Use running number:

1, 2, 3, 4...

### empty

Create empty editable text layers.

### manual

Use a user-entered default string for all cells.

### metadata

Prepare the model for metadata-based text, even if UI support is minimal in this phase.

## Text auto-fit

Text should be able to auto-fit inside the relative text box.

Rules:

- Use maxFontSize as starting point.
- Reduce font size down to minFontSize if text does not fit.
- Do not scale non-uniformly.
- Preserve RTL behavior.
- Hebrew must be first-class.
- Mixed Hebrew/English should use the existing text engine behavior.

## Text position updates

If the user moves the master text overlay position, update all non-overridden text layers.

If a single cell's text position was manually changed and overrides are enabled, preserve that override.

## Text content updates

Changing the global text style must not overwrite individual text content.

Changing the global default text should ask/require explicit command if it would overwrite existing per-cell text.

---

# Grid Mode UI / UX Flow

This section is very important.
Grid Mode must not only work technically — it must feel simple, predictable, and fast for a non-technical print-shop user.

The user should never feel that they need to understand the internal architecture.
The UI should guide them through a natural workflow:

1. Choose page/product size.
2. Choose grid structure.
3. Import images.
4. Adjust image behavior.
5. Optionally add shared text overlays.
6. Make small manual corrections.
7. Export/print.

---

## Entry Flow — Creating a Grid Project

When the user enters Grid Mode from the home screen, show a simple creation flow before opening the full canvas.

### Step 1 — Page Setup

Ask the user to choose the page/canvas size.

Options:

- Common print sizes
- A4
- A3
- 10x15
- 13x18
- 20x30
- Custom size
- Product/library size if Product Library integration is available

Fields:

- Width
- Height
- Units: mm / cm / inch / px if already supported
- DPI
- Orientation: portrait / landscape
- Bleed: optional, default 0
- Safe area / margins: optional, default 0

Important:

Do not force the user to define bleed/safe area if they do not need it.
Default values should be simple and print-shop friendly.

### Step 2 — Grid Setup

After page size, ask for grid structure.

Fields:

- Rows
- Columns
- Spacing
- Margins
- Fill direction: RTL / LTR, default can be RTL
- Auto-create pages: on by default

At this stage show a small live preview thumbnail of the grid structure if possible.

The user should be able to create a basic grid in less than 10 seconds.

### Step 3 — Open Canvas

After confirming page size and grid setup:

- Open the normal canvas view.
- Create the first page.
- Create the grid cells as FrameLayers.
- Show Grid Mode controls in the right panel.
- Show the grid as selected/active.

---

## Canvas UX

In Grid Mode, the canvas should behave like a managed layout.

The user sees the grid cells directly on the page.
Each cell should have a subtle visible frame/boundary when the grid or a cell is selected.

### Empty cell state

Empty cells should show a simple placeholder:

- subtle dashed border
- small image icon
- text such as “Drop image” or Hebrew equivalent

The placeholder should disappear when the cell has an image.

### Selected grid state

When the whole grid is selected:

- all cells show a subtle unified selection indication
- right panel shows Grid settings
- top contextual controls may show: Add images, Add text overlay, Regenerate, Export

### Selected cell state

When one cell is selected:

- the selected cell shows a stronger outline
- right panel shows Cell/Image controls
- if the cell has text overlay, text controls may appear in a secondary section

The user should understand whether they are editing the whole grid or one cell.

---

## Where Grid Settings Live

Grid settings should appear only when relevant.

The main location is the **Right Context Panel**.

When Grid Mode is active and no specific non-grid object is selected, the right panel shows Grid controls.

When a grid cell is selected, the panel shows:

1. selected cell controls first
2. then grid-level controls in a collapsed or secondary section

When a regular text/image/layer outside the grid is selected, the panel should show the normal shared core controls.

Do not put all grid settings in a large always-visible toolbar.
Do not use modals for every small setting change.

---

## Right Panel UI Requirements

The Grid Mode right panel should be contextual and clear.

Required sections:

## Grid Setup

- Rows
- Columns
- Spacing X
- Spacing Y
- Margins
- Fill Direction: RTL / LTR
- Auto-create pages toggle

## Image Behavior

- Fit Mode: fit / fill / smartCrop / stretch if supported
- Auto Rotate Policy:
  - None
  - Rotate to Cell Orientation
  - Force Portrait
  - Force Landscape
- Reset crops button
- Apply fit to all button

## Text Overlay

The text overlay UI needs to be clear and practical.
This feature is very important for real print-shop workflows.

The user should be able to create one text box and apply it to every grid cell at the same relative position.

### Main button

In the Grid Mode right panel, add a clear button:

`Add Text To All Cells`

or in Hebrew UI:

`הוסף טקסט לכל התאים`

This button opens an inline panel/section, not a full modal unless the existing UI pattern requires it.

### Text Overlay Panel Layout

The panel should include these sections:

#### 1. Text Source

Dropdown:

- Filename
- Manual text
- Running number
- Empty editable text
- Metadata, prepared for later

Behavior:

- Filename: use each image filename as the text for its cell.
- Manual text: use the same starting text for all cells.
- Running number: 1, 2, 3, etc.
- Empty: create empty text boxes in all cells.

For filename source, clean names:

- remove file extension
- replace underscores with spaces
- preserve Hebrew correctly

Example:

`נועה_כהן.jpeg` → `נועה כהן`

#### 2. Position In Cell

Use simple visual controls first, not only raw numbers.

Provide a 3x3 anchor selector:

- top left
- top center
- top right
- center left
- center
- center right
- bottom left
- bottom center
- bottom right

Default: bottom center.

Additional controls:

- Offset X
- Offset Y
- Width relative to cell, default 90%
- Height or auto height
- Padding

The user should understand that this position is relative to each cell, not relative to the whole page.

#### 3. Text Style

Use the existing text style controls from the Pro Text Engine.
Do not create a second text UI.

Controls should include where available:

- font family
- font size / auto-fit
- min font size
- max font size
- color
- alignment
- direction RTL/LTR/auto
- stroke/shadow only if already supported by the text engine

Default direction should handle Hebrew well.

#### 4. Apply Behavior

Buttons/toggles:

- Apply to existing cells
- Apply automatically to new cells
- Update style for all
- Update position for all
- Reset individual text overrides, optional

Important:

Changing global text style should not overwrite individual text content.
Changing global position should not overwrite cells that have explicit position overrides unless the user chooses reset overrides.

### After Text Overlay Is Created

After applying text to all cells:

- each cell gets its own normal TextLayer
- the text layer is visually attached to the cell
- selecting a cell should allow editing that cell's text
- selecting the grid should allow editing the shared overlay rule

### Editing One Cell's Text

If the user double-clicks or edits one cell's text:

- only that cell's text content changes
- the shared style remains linked
- mark that text layer as having a content override

If the user manually moves/resizes one cell's text box:

- mark it as a position override if overrides are enabled
- future global position changes should not affect it unless reset overrides is used

### Suggested UX Labels

Use clear action labels:

- Add Text To All Cells
- Text From Filenames
- Apply Style To All Texts
- Apply Position To All Texts
- Reset Text Overrides
- Auto-fit Text In Cell
- Create Empty Text Boxes

Avoid technical labels like `GridTextOverlayRule` in the UI.

## Grid Actions

- Regenerate grid
- Reflow after settings change
- Clean unused trailing cells
- Detach from Grid, optional

---

# Detailed Grid UX States

## New Grid With No Images

Show the grid cells as empty placeholders.
Right panel should focus on:

- Add images
- Rows / Columns
- Spacing
- Margins
- Add Text To All Cells, optional but available

Primary CTA should be:

`Add Images`

The user should also be able to drag images directly onto the canvas/grid.

## Grid With Images

After images are added:

- cells fill automatically
- pages are created automatically if needed
- bottom page strip shows all pages
- batch progress appears while images are being processed

Right panel should focus on:

- Fit mode
- Auto rotate
- Spacing
- Margins
- Text overlay
- Export

## Selecting One Cell

When selecting a single grid cell, show:

- image fit/crop controls
- rotate image buttons
- replace image
- remove image
- cell text edit shortcut if text overlay exists

Also show a small note/indicator:

`Managed by grid`

Do not allow free move/resize of the cell in Phase 3.

## Selecting Text Inside a Cell

When selecting a text layer that belongs to a grid overlay:

Show regular text controls, plus a small section:

- This text is part of grid overlay
- Edit only this text
- Apply this style to all grid texts
- Reset this text override

This prevents confusion between local text editing and global overlay editing.

## Changing Rows / Columns

Changing rows/columns is a meaningful layout change.

Do not instantly destroy the current layout with every keystroke.
Use one of these approaches:

Preferred:

- user changes values
- preview updates lightly if possible
- user clicks `Apply / Regenerate Grid`

Alternative:

- debounce changes
- provide undoable regenerate

The user should understand that rows/columns changes may reflow pages.

## Changing Spacing / Margins

Spacing and margins can update live with debounce.

Because Grid Mode uses division-based sizing, increasing spacing/margins should shrink cells.

This must be visually predictable.

## Export UX

Grid Mode should have a clear export button, but export itself must use the central export system.

From Grid Mode the export action should naturally export all grid pages unless the user chooses selected/current page only.

---

# Batch / Progress Requirements

Any heavy operation must use the existing Batch Operations System.

This includes:

- importing many images
- filling frames
- creating many pages
- smart crop / face detect
- applying text overlays to many cells
- exporting multiple pages

The UI must not freeze.
Show progress in the bottom progress area, not a blocking modal.

Batch errors must be per item.
One failed image should not fail the entire job.

---

# History / Undo Requirements

Every meaningful action must be undoable.

Required undoable commands:

- CreateGridCommand
- RegenerateGridCommand
- FillGridWithImagesCommand
- AddImagesToGridCommand
- DeleteGridImageAndCompactFromEndCommand
- SwapGridCellImagesCommand
- ApplyGridSettingsCommand
- ApplyGridFitModeToAllCommand
- ResetGridCropsCommand
- ApplyGridTextOverlayCommand
- UpdateGridTextOverlayRuleCommand
- DetachFromGridCommand, if implemented

Do not mutate Zustand/document state directly from UI components.
Use actions/commands.

---

# Save / Load Requirements

Grid state must survive save/load.

Saved project must include:

- grid layout rule
- grid IDs
- page IDs
- frame IDs
- grid cell metadata
- image assignments
- manual crop overrides
- manual rotation overrides
- text overlay rules
- text layer links
- per-cell text overrides

Loading the project must restore the exact same visual state.

Definition of done for save/load:

1. Create grid.
2. Import images.
3. Rotate some images manually.
4. Crop some images manually.
5. Add text overlay from filenames.
6. Edit one cell's text manually.
7. Save project.
8. Close/reload.
9. Visual result must be identical.
10. Grid controls must still work after reload.

---

# Export Requirements

Export must use the existing central Export System.

Grid Mode must not implement its own export logic.

Export must support:

- all grid pages
- correct DPI
- correct margins
- bleed if enabled
- safe area guides not included unless intentionally configured
- text overlays
- rotations
- crops
- full-resolution original assets, not canvas previews

---

# Performance Requirements

Grid Mode must handle at least:

- 80 images smoothly
- 200 images acceptably
- 500 images without crashing, using previews, virtualization, and background workers

Performance rules:

- Do not render full-resolution originals live on canvas.
- Use preview assets for editing.
- Use originals only during export.
- Lazy render pages where possible.
- Avoid heavy calculations inside React render loops.
- Debounce numeric controls such as spacing/margins.
- Use background jobs for batch operations.

---

# Edge Cases To Handle

Handle these explicitly:

1. User imports fewer images than available cells.
2. User imports more images than available cells.
3. User changes rows/columns after images are already placed.
4. User changes spacing after images are already placed.
5. User changes margins after images are already placed.
6. User changes fit mode after manual crops exist.
7. User deletes an image from the first page while later pages exist.
8. User swaps images between different pages.
9. User saves and reloads a multi-page grid.
10. User adds text overlay after images are already placed.
11. User changes text overlay position after manually editing one text layer.
12. User imports Hebrew filenames.
13. User imports portrait and landscape photos into a grid with strong orientation.
14. User applies force landscape / force portrait.
15. User exports after multiple regenerations.

---

# Tests Required

Before considering Phase 3 complete, add unit/integration tests for these scenarios.

## Test 1 — Basic grid generation

Create a 3x2 grid on one page.
Expect 6 FrameLayers with correct grid metadata.

## Test 2 — Multi-page generation

Create a 3x2 grid and import 30 images.
Expect 5 pages, 30 image assignments, and one shared grid rule.

## Test 3 — Delete and compact from end

Create a 3x2 grid with 30 images.
Delete image at global index 1.
Expect the last image to move into index 1 and the final occupied slot to become empty/removed.

## Test 4 — Swap images

Swap image from cell 1 with image from cell 5.
Expect frame positions unchanged and image assignments swapped.

## Test 5 — Preserve manual rotation

Import images, manually rotate one image, change spacing/regenerate.
Expect the manual rotation to remain.

## Test 6 — Preserve manual crop as much as possible

Manually crop/reposition one image, change rows/columns, regenerate.
Expect the same asset to remain assigned and crop behavior to remain non-destructive.

## Test 7 — Apply fit mode without resetting manual crop

Set manual crop on one cell.
Apply global fit mode to all.
Expect manual crop cell to preserve its override.

## Test 8 — Reset crops

After manual crop exists, run Reset Crops For All.
Expect manual crop overrides removed.

## Test 9 — Text overlay from filename

Import files:

- `יותם.jpeg`
- `נועה_כהן.jpeg`

Apply filename text overlay.
Expect text layers:

- `יותם`
- `נועה כהן`

## Test 10 — Text overlay style update

Apply text overlay to all cells.
Edit one cell text content manually.
Change global font style.
Expect style to update but manual text content to remain.

## Test 11 — Save/load exact restore

Create multi-page grid with images, rotations, manual crops, and text overlays.
Save and reload.
Expect exact restoration of visual state and grid editability.

## Test 12 — Export multi-page grid

Export a multi-page grid.
Expect all pages exported using central export pipeline.

---

# Implementation Order

Build in this order:

## Step 1 — Types and model extensions

Add:

- GridLayoutRule
- GridCellMetadata
- GridImageAssignment
- GridTextOverlayRule
- GridTextOverlayOverride
- GridAutoRotatePolicy
- related command types

## Step 2 — Store support

Add typed Zustand support for grid rules.
Do not duplicate document/layer state.
Store references and rule data only.

## Step 3 — Grid generation service

Create a pure service that receives:

- page setup
- rows
- columns
- margins
- spacing
- fill direction

And returns calculated cell rectangles.

This should be testable without UI.

## Step 4 — Commands

Implement commands for:

- create grid
- regenerate grid
- fill grid
- swap images
- delete and compact
- apply settings
- reset crops

## Step 5 — Canvas rendering integration

Render FrameLayers normally through existing canvas rendering.
Do not create a special GridCanvas.

## Step 6 — Right Panel UI

Add contextual Grid Mode controls.
Use debounced updates for spacing/margins.

## Step 7 — Text overlay system

Implement grid text overlay rules using existing TextLayer and text engine.

## Step 8 — Batch operations

Wire image import/fill/text overlay generation to BatchJob progress.

## Step 9 — Save/load

Ensure all grid-related state persists correctly.

## Step 10 — Tests

Add all required tests above.

---

# Definition of Done

Phase 3 is complete only when all of the following are true:

1. User can create a rectangular uniform grid.
2. User can import many images into the grid.
3. System creates multiple pages automatically.
4. Grid cells are normal FrameLayers.
5. Images use the normal asset/image/frame system.
6. Text overlays use the normal TextLayer system.
7. No separate canvas/text/export/save/history implementation exists.
8. User can change rows/columns/spacing/margins and regenerate safely.
9. Manual image rotation is preserved.
10. Manual crop is preserved as much as possible and is never destructive.
11. Fit mode changes do not reset manual crop unless explicitly requested.
12. Drag/drop between cells swaps images.
13. Deleting an image fills the slot from the last used image.
14. Text overlay can be applied to all cells at the same relative position.
15. Filename-based text works with Hebrew filenames.
16. Save/load restores the exact grid state.
17. Export works through the central export pipeline.
18. Batch operations show progress and do not freeze the UI.
19. Tests cover the required scenarios.
20. The implementation remains compatible with future Mask Mode, Class Photo Mode, Product Mode, and Collage Mode.

---

# Final Reminder

If something feels like it requires a separate grid-specific engine, stop and rethink.

Grid Mode should be a smart workflow over the shared core, not a new system.

The correct mental model is:

`GridLayoutRule` manages many normal `FrameLayer` cells across one or more normal `Page` objects.

`GridTextOverlayRule` manages many normal `TextLayer` objects, one per grid cell.

All visual truth stays in the shared Document/Page/Layer model.

No shortcuts in core.
No duplicate states.
No canvas-only objects.
No separate text engine.
No destructive crop.
No UI freezes.


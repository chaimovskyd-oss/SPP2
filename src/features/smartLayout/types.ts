import type { Rect } from "@/types/primitives";

/**
 * Smart Sheet Layout / סידור חכם לדף — shared types.
 *
 * Two workflows share this contract:
 *  - "repeat": tile ONE design (Smart Repeat / שכפול חכם לדף).
 *  - "photoPack": pack MANY mixed-aspect images without cropping (V2).
 *
 * All geometry is expressed in **page pixels** so mapping a result to real
 * SPP layers is a direct copy. Millimetres only appear in the user-facing
 * option objects below.
 */

/** How the repeat grid is derived. */
export type CalcMode = "copiesPerPage" | "unitSizeMm" | "totalCopies";

/** Cut-line overlay style. `cropMarks` is reserved for V1.5. */
export type CutLineStyle = "none" | "hairlineGrid";

/** Packing aesthetic for the photo-packing workflow (V2). */
export type LayoutStyle = "uniform" | "balanced" | "maximumArea";

/** Options common to both workflows. */
export interface SmartLayoutOptions {
  /** Symmetric outer page margin, millimetres. */
  marginsMm: number;
  /** Gap between cells, millimetres (default 0 → touching copies). */
  gapMm: number;
  /** Allow rotating a unit/image 90° if it improves the fit. */
  allowRotate: boolean;
  /** Cut-line overlay style. */
  cutLines: CutLineStyle;
  /** DPI for mm↔px conversion (from the target page setup). */
  dpi: number;
}

/** Smart Repeat inputs. */
export interface RepeatOptions extends SmartLayoutOptions {
  calcMode: CalcMode;
  /** mode `copiesPerPage`. */
  copiesPerPage?: number;
  /** mode `unitSizeMm`. */
  unitWidthMm?: number;
  unitHeightMm?: number;
  /** mode `totalCopies`. */
  totalCopies?: number;
  /** Remove the source layers from the active page when committing. */
  replaceOriginal: boolean;
}

/** Smart Photo Packing inputs (V2). */
export interface PhotoPackOptions extends SmartLayoutOptions {
  photosPerPage: number;
  /** Minimum size of an image's SHORT side, mm (0 = no minimum). */
  minSizeMm: number;
  /** Maximum size of an image's LONG side, mm (0 = no maximum). */
  maxSizeMm: number;
  layoutStyle: LayoutStyle;
}

/** One image fed to the packing solver. */
export interface PackImageInput {
  /** assetId (commit) or a temp id (preview). */
  id: string;
  /** Intrinsic aspect ratio width/height. */
  aspect: number;
}

/** One placed cell on a page, in page px. */
export interface PlacedItem {
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
  /** 90° rotation applied to the unit/image for this cell. */
  rotated: boolean;
  /** WF1: design-unit id; WF2: assetId. */
  sourceRef: string;
  /** WF2: intrinsic aspect (w/h) used to size the cell without cropping. */
  aspect?: number;
}

/** A single laid-out page. */
export interface LayoutPageResult {
  items: PlacedItem[];
  /** Grid dims when applicable (undefined for free packing). */
  cols?: number;
  rows?: number;
  /** Last page that is not completely filled. */
  isPartial: boolean;
}

/** Unified output of both solvers. */
export interface SmartLayoutResult {
  kind: "repeat" | "photoPack";
  pages: LayoutPageResult[];
  pageWidthPx: number;
  pageHeightPx: number;
  usablePx: Rect;
  cutLineStyle: CutLineStyle;
  /** Human-readable Hebrew warnings (e.g. "היחידה גדולה מהדף"). */
  warnings: string[];
  /** WF2 only: aggregate score of the chosen candidates. */
  score?: number;
}

/** Resolved grid plan for Smart Repeat. */
export interface RepeatPlan {
  cols: number;
  rows: number;
  cellWPx: number;
  cellHPx: number;
  /** Whether each cell's unit is rotated 90°. */
  rotated: boolean;
  perPage: number;
  totalPages: number;
  /** Item count on the (possibly partial) last page. */
  lastPageCount: number;
  warnings: string[];
}

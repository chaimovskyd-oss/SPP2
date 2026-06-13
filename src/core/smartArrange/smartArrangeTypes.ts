import type { Rect } from "@/types/primitives";
import type { TextAlignment } from "@/types/text";

/** Which arrange behaviour to run. `auto` lets the router pick. */
export type SmartArrangeMode =
  | "auto"
  | "polish"
  | "spacingOnly"
  | "imageText"
  | "titleText"
  | "fitToSafeArea";

/** Transient semantic role inferred per run — never persisted. */
export type SmartArrangeRole =
  | "title"
  | "subtitle"
  | "bodyText"
  | "shortText"
  | "mainImage"
  | "secondaryImage"
  | "logo"
  | "decoration"
  | "background"
  | "unknown";

export type SmartArrangeItemKind = "text" | "image" | "shape" | "group" | "unknown";

/** One arrangeable layer with its analysed geometry + role. */
export interface SmartArrangeItem {
  layerId: string;
  role: SmartArrangeRole;
  kind: SmartArrangeItemKind;
  /** Current axis-aligned bounding box (page px). Mutated by strategies. */
  bounds: Rect;
  /** Snapshot of bounds at analysis time — used to penalise large moves. */
  originalBounds: Rect;
  locked: boolean;
  visible: boolean;
  /** Higher = more important; important items win overlap resolution. */
  importance: number;
  canMove: boolean;
  canResize: boolean;
  /** Layer type, for downstream patch building. */
  layerType: string;
  // Text-only hints (undefined for non-text):
  fontSize?: number;
  originalFontSize?: number;
  alignment?: TextAlignment;
  direction?: "auto" | "ltr" | "rtl";
  textLength?: number;
  lineCount?: number;
}

export interface SmartArrangeContext {
  pageId: string;
  /** Full canvas (page px). */
  canvasBounds: Rect;
  /** Safe area inside the canvas (page px). */
  safeBounds: Rect;
  items: SmartArrangeItem[];
  direction: "rtl" | "ltr";
  mode: SmartArrangeMode;
  /** Spacing presets derived from canvas size (page px). */
  gaps: { small: number; normal: number; large: number };
}

/** A geometry patch the store applies to a single layer. */
export interface SmartArrangeLayerUpdate {
  layerId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  fontSize?: number;
  alignment?: TextAlignment;
}

export interface SmartArrangeResult {
  updates: SmartArrangeLayerUpdate[];
  changedLayerIds: string[];
  /** Mode actually executed (router resolves `auto`). */
  resolvedMode: SmartArrangeMode;
  reason?: string;
}

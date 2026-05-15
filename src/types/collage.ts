import type { ContentTransform, FrameLayer } from "./layers";
import type { CropRect, FitMode, ID, Metadata, VersionedEntity } from "./primitives";
import type { VisualEffectStack } from "./visualEffects";

// ─── Slot shapes ──────────────────────────────────────────────────────────────

export type CollageSlotShape =
  | "rect"
  | "rounded"
  | "circle"
  | "ellipse"
  | "heart"
  | "polygon"
  | "diagonalPolygon"
  | "svgPath";

export interface CollageSlotShapeParams {
  cornerRadius?: number;
  sides?: number;
  rotation?: number;
  vertices?: Array<{ x: number; y: number }>;
  pathData?: string;
}

// ─── Edge effects ─────────────────────────────────────────────────────────────

export type CollageEdgeStyle = "hard" | "softEdge" | "tornPaper" | "outlineCircle";

export interface CollageEdgeConfig {
  style: CollageEdgeStyle;
  softEdgeRadius?: number;
  softEdgeSides?: ("top" | "right" | "bottom" | "left")[];
  softEdgeCurve?: "linear" | "smooth" | "easeOut";
  tornPaperSeed?: number;
  tornPaperRoughness?: number;
  outlineColor?: string;
  outlineWidth?: number;
}

// ─── Slot type ────────────────────────────────────────────────────────────────

export type CollageSlotType = "image" | "empty";

// ─── Collage slot – relative [0..1] coordinates ───────────────────────────────

export interface CollageSlot extends VersionedEntity {
  id: ID;
  type: CollageSlotType;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: CollageSlotShape;
  shapeParams: CollageSlotShapeParams;
  edgeConfig?: CollageEdgeConfig;
  role: "hero" | "accent" | "standard" | "";
  label: string;
  groupId: string;
  rotationDeg: number;
  zIndex: number;
  metadata: Metadata;
}

// ─── Layout families ──────────────────────────────────────────────────────────

export type CollageLayoutFamily =
  | "grid"
  | "hero"           // hero top
  | "heroBottom"     // hero bottom
  | "heroLeft"       // feature left (58%)
  | "magazine"       // feature left (60%)
  | "mosaic"         // asymmetric top pair + grid
  | "strip"          // single row
  | "dualHero"       // two heroes + grid
  | "triptych"       // three equal columns
  | "wideBanner"     // full-width top + grid
  | "filmStrip"      // three rows uneven heights
  | "staircase"      // cascade / diagonal steps
  | "ringFocus"      // central cell + surrounding
  | "artisticLayered" // overlapping rotated cards
  | "splitTree"      // binary split
  | "diagonal"       // parallelogram bands
  | "diagonalHero"   // trapezoid hero
  | "shapedCircle"   // circle packing
  | "shapedHeart"    // heart packing
  | "ringCollage"    // ring segments
  | "diamondCenter"  // central diamond (rotated 45°) + surrounding
  | "frameCollage"   // images arranged as border frame
  | "plusCross"      // images in + / cross pattern
  | "custom";        // template-applied

// ─── Layout params (used when regenerating slots) ─────────────────────────────

export interface CollageLayoutParams {
  imageCount: number;
  canvasW: number;
  canvasH: number;
  spacingPx: number;
  marginPx: number;
  splitTree?: CollageSplitNode;
}

// ─── Layout (kept for CollageMiniPreview / template storage) ─────────────────

export interface CollageLayout extends VersionedEntity {
  id: ID;
  name: string;
  family: CollageLayoutFamily;
  slots: CollageSlot[];
  score: number;
  scoreBreakdown: {
    aspectRatioScore: number;
    faceSafetyScore: number;
    balanceScore: number;
    diversityScore: number;
  };
  splitTree?: CollageSplitNode;
  targetImageCount: number;
  metadata: Metadata;
}

// ─── Scored layout suggestion (in-memory only, never serialized) ──────────────

export interface ScoredLayoutSuggestion {
  family: CollageLayoutFamily;
  name: string;
  nameHe: string;
  slots: CollageSlot[];
  score: number;
  scoreBreakdown: {
    aspectRatioScore: number;
    faceSafetyScore: number;
    balanceScore: number;
    diversityScore: number;
  };
  splitTree?: CollageSplitNode;
}

// ─── Binary split tree ────────────────────────────────────────────────────────

export type CollageSplitNode =
  | { type: "leaf"; slotId: ID }
  | {
      type: "split";
      direction: "H" | "V";
      ratio: number;
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
  fitMode: FitMode;
  colorAdjustments: {
    brightness: number;
    contrast: number;
    saturation: number;
    sharpness: number;
    isBlackAndWhite: boolean;
    exposureEV: number;
    vignette: number;
  };
  visualEffects?: VisualEffectStack;
  edgeConfig?: CollageEdgeConfig;
  hasManualCrop?: boolean;
  hasManualTransform?: boolean;
  metadata: Metadata;
}

// ─── Canvas settings ──────────────────────────────────────────────────────────

export interface CollageCanvasSettings extends VersionedEntity {
  backgroundType: "solid" | "gradient" | "image" | "transparent";
  backgroundColor: string;
  backgroundGradient?: { startColor: string; endColor: string; angle: number };
  backgroundAssetId?: ID;
  globalCornerRadius: number;
  globalBorderWidth: number;
  globalBorderColor: string;
  globalShadowEnabled: boolean;
  globalShadowOffsetX: number;
  globalShadowOffsetY: number;
  globalShadowBlur: number;
  globalShadowOpacity: number;
  globalEdgeConfig: CollageEdgeConfig;
  bleedMM: number;
  safeAreaMM: number;
}

// ─── Main collage rule (new architecture: stores family + spacing/margin + cachedSlots) ──

export interface CollageRule extends VersionedEntity {
  id: ID;
  name: string;
  pageId: ID;
  /** Active layout family — geometry is regenerated on demand */
  activeFamily: CollageLayoutFamily;
  /** Spacing between cells in mm — converted to px at compute time */
  spacingMM: number;
  /** Canvas margin in mm — converted to px at compute time */
  marginMM: number;
  /** Cached slot geometry (regenerated when family/spacing/canvas changes) */
  cachedSlots: CollageSlot[];
  /** Split tree for "splitTree" family */
  splitTree?: CollageSplitNode;
  imageAssignments: CollageImageAssignment[];
  imagePool: ID[];
  canvasSettings: CollageCanvasSettings;
  smartCropEnabled: boolean;
  smartCropMode: "none" | "face" | "center" | "ruleOfThirds";
  frameIds: ID[];
  metadata: Metadata;
}

// ─── Template ─────────────────────────────────────────────────────────────────

export interface CollageTemplate extends VersionedEntity {
  id: ID;
  name: string;
  category: string;
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
  slots: CollageSlot[];
  splitTree?: CollageSplitNode;
  spacing: number;
  margin: number;
  canvasDefaults: Partial<CollageCanvasSettings>;
  svgThumbnail: string;
}

// ─── Engine options ───────────────────────────────────────────────────────────

export type CollageComplexityMode = "simple" | "creative";

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

// ─── Image input for scoring ──────────────────────────────────────────────────

export interface CollageImageInput {
  assetId: ID;
  width: number;
  height: number;
  faceRegions?: Array<{ cx: number; cy: number; w: number; h: number; confidence: number }>;
  analysisScore?: number;
}

// ─── Frame metadata tag ───────────────────────────────────────────────────────

export interface CollageFrameMetadata {
  collageRuleId: ID;
  slotId: ID;
  slotType: CollageSlotType;
  isCollageFrame: true;
  layoutManaged: true;
  slotShape: CollageSlotShape;
  zIndex?: number;
}

export type CollageFrameLayer = FrameLayer & {
  metadata: FrameLayer["metadata"] & {
    collageFrame: CollageFrameMetadata;
  };
};

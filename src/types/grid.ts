import type { Asset } from "./document";
import type { ContentTransform, FrameLayer } from "./layers";
import type { CropRect, FitMode, ID, JsonValue, Margins, Metadata, Rect, VersionedEntity } from "./primitives";
import type { TextAlignment, TextDirection, TextStylePatch } from "./text";
import type { VisualEffectStack } from "./visualEffects";

export type GridImageEditParams = Record<string, number | boolean | string>;

export type GridFillDirection = "rtl" | "ltr";
export type GridFillOrder = "rowMajor";
export type GridImageOverflowBehavior = "createPages";
export type GridImageDeleteBehavior = "fillFromLastUsedImage";
export type GridDragDropBehavior = "swapImages";
export type GridAutoRotatePolicy = "none" | "rotateToCellOrientation" | "forcePortrait" | "forceLandscape";
export type GridOrientationPolicy = "allowMixed" | "preferCellOrientation" | "forcePortrait" | "forceLandscape";

export interface GridLayoutRule extends VersionedEntity {
  id: ID;
  name: string;
  pageIds: ID[];
  frameIds: ID[];
  rows: number;
  columns: number;
  margins: Margins;
  spacingX: number;
  spacingY: number;
  fillDirection: GridFillDirection;
  fillOrder: GridFillOrder;
  fitMode: FitMode;
  autoCreatePages: boolean;
  removeUnusedTrailingCells: boolean;
  imageOverflowBehavior: GridImageOverflowBehavior;
  imageDeleteBehavior: GridImageDeleteBehavior;
  dragDropBehavior: GridDragDropBehavior;
  autoRotatePolicy: GridAutoRotatePolicy;
  orientationPolicy: GridOrientationPolicy;
  preserveManualRotationOnRegenerate: boolean;
  preserveManualCropAsMuchAsPossible: boolean;
  preserveImageAssignmentByStableIndex: boolean;
  linkedGroupId?: ID;
  textOverlayRuleIds: ID[];
  metadata: Metadata;
}

export interface GridCellMetadata extends Record<string, JsonValue> {
  gridId: ID;
  gridPageIndex: number;
  cellIndexGlobal: number;
  cellIndexOnPage: number;
  row: number;
  column: number;
  isGridCell: true;
}

export interface GridImageAssignment extends VersionedEntity {
  id: ID;
  gridId: ID;
  assetId: ID;
  frameId: ID;
  globalIndex: number;
  pageIndex: number;
  cellIndexOnPage: number;
  manualRotation?: number;
  manualCrop?: CropRect;
  manualContentTransform?: ContentTransform;
  manualFitModeOverride?: FitMode;
  imageEditParams?: GridImageEditParams;
  visualEffects?: VisualEffectStack;
  hasManualCropOverride?: boolean;
  hasManualRotationOverride?: boolean;
}

export type GridTextAnchor =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "centerLeft"
  | "center"
  | "centerRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight"
  | "custom";

export type GridTextSource = "filename" | "manual" | "index" | "empty" | "metadata";

export interface GridTextOverlayOverride {
  text?: string;
  textStyle?: Partial<TextStylePatch>;
  relativeX?: number;
  relativeY?: number;
  relativeWidth?: number;
  relativeHeight?: number;
  offsetX?: number;
  offsetY?: number;
  autoFitText?: boolean;
}

export interface GridTextOverlayRule extends VersionedEntity {
  id: ID;
  gridId: ID;
  name: string;
  anchor: GridTextAnchor;
  relativeX: number;
  relativeY: number;
  relativeWidth: number;
  relativeHeight?: number;
  offsetX: number;
  offsetY: number;
  padding: number;
  autoFitText: boolean;
  minFontSize: number;
  maxFontSize: number;
  textSource: GridTextSource;
  defaultText: string;
  textStyle: TextStylePatch & {
    alignment?: TextAlignment;
    direction?: TextDirection;
  };
  applyToExistingCells: boolean;
  applyToNewCells: boolean;
  overridable: boolean;
  textLayerIdsByFrameId: Record<ID, ID>;
  perCellOverrides: Record<ID, GridTextOverlayOverride>;
  metadata: Metadata;
}

export interface GridModeState extends VersionedEntity {
  rules: GridLayoutRule[];
  imageAssignments: GridImageAssignment[];
  textOverlayRules: GridTextOverlayRule[];
}

export interface GridCreateOptions {
  name?: string;
  rows: number;
  columns: number;
  margins: Margins;
  spacingX: number;
  spacingY: number;
  fillDirection?: GridFillDirection;
  fitMode?: FitMode;
  autoCreatePages?: boolean;
}

export interface GridCellRect extends Rect {
  row: number;
  column: number;
  cellIndexOnPage: number;
}

export interface GridImageInput {
  asset: Asset;
  manualContentTransform?: ContentTransform;
  manualFitModeOverride?: FitMode;
  imageEditParams?: GridImageEditParams;
  visualEffects?: VisualEffectStack;
}

export type GridFrameLayer = FrameLayer & {
  metadata: FrameLayer["metadata"] & {
    gridCell: GridCellMetadata;
  };
};

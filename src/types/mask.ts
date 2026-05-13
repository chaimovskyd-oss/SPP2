import type { Asset } from "./document";
import type { ContentTransform, FrameLayer } from "./layers";
import type { CropRect, FitMode, ID, JsonValue, Margins, Metadata, Rect, Size, VersionedEntity } from "./primitives";
import type { GridTextAnchor, GridTextOverlayOverride, GridTextSource } from "./grid";
import type { TextAlignment, TextDirection, TextStylePatch } from "./text";

export type MaskShape = "circle" | "heart" | "roundedRect" | "star" | "custom";
export type MaskPresetType = "builtInShape" | "svg" | "png" | "pngThreshold";
export type MaskArrangement = "packedRows";
export type MaskImageDeleteBehavior = "fillFromLastUsedImage";
export type MaskDragDropBehavior = "swapImages";

export interface MaskThresholdSettings extends VersionedEntity {
  enabled: boolean;
  color: "white" | "black" | "custom";
  tolerance: number;
  feather?: number;
}

export interface MaskPreset extends VersionedEntity {
  id: ID;
  name: string;
  type: MaskPresetType;
  shape?: MaskShape;
  assetId?: ID;
  thumbnailAssetId?: ID;
  thresholdSettings?: MaskThresholdSettings;
  defaultSize?: Size;
  keepProportionsDefault: boolean;
  createdAt: string;
  updatedAt: string;
  metadata: Metadata;
}

export interface MaskLayoutRule extends VersionedEntity {
  id: ID;
  name: string;
  pageIds: ID[];
  frameIds: ID[];
  maskPresetId: ID;
  maskShape: MaskShape;
  maskWidth: number;
  maskHeight: number;
  keepProportions: boolean;
  margins: Margins;
  spacingX: number;
  spacingY: number;
  safeArea: Margins;
  arrangement: MaskArrangement;
  fitMode: FitMode;
  autoCreatePages: boolean;
  imageDeleteBehavior: MaskImageDeleteBehavior;
  dragDropBehavior: MaskDragDropBehavior;
  smartCropEnabled: boolean;
  linkedGroupId?: ID;
  textOverlayRuleIds: ID[];
  metadata: Metadata;
}

export interface MaskFrameMetadata extends Record<string, JsonValue> {
  maskId: ID;
  maskPageIndex: number;
  maskIndexGlobal: number;
  maskIndexOnPage: number;
  row: number;
  column: number;
  isMaskFrame: true;
  layoutManaged: true;
  maskShape: MaskShape;
}

export interface MaskImageAssignment extends VersionedEntity {
  id: ID;
  maskId: ID;
  assetId: ID;
  frameId: ID;
  globalIndex: number;
  pageIndex: number;
  maskIndexOnPage: number;
  manualCrop?: CropRect;
  manualContentTransform?: ContentTransform;
  manualFitModeOverride?: FitMode;
  hasManualCropOverride?: boolean;
  hasManualRotationOverride?: boolean;
}

export interface MaskTextOverlayRule extends VersionedEntity {
  id: ID;
  maskId: ID;
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
  applyToExistingMasks: boolean;
  applyToNewMasks: boolean;
  overridable: boolean;
  textLayerIdsByFrameId: Record<ID, ID>;
  perFrameOverrides: Record<ID, GridTextOverlayOverride>;
  metadata: Metadata;
}

export interface MaskCreateOptions {
  name?: string;
  maskShape: MaskShape;
  maskWidth: number;
  maskHeight: number;
  keepProportions?: boolean;
  margins: Margins;
  spacingX: number;
  spacingY: number;
  fitMode?: FitMode;
  smartCropEnabled?: boolean;
  autoCreatePages?: boolean;
}

export interface MaskFrameRect extends Rect {
  row: number;
  column: number;
  maskIndexOnPage: number;
}

export interface MaskImageInput {
  asset: Asset;
  manualContentTransform?: ContentTransform;
  manualFitModeOverride?: FitMode;
}

export type MaskFrameLayer = FrameLayer & {
  metadata: FrameLayer["metadata"] & {
    maskFrame: MaskFrameMetadata;
  };
};

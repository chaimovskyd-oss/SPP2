import type { Asset } from "./document";
import type { ContentTransform, FrameLayer } from "./layers";
import type { CropRect, FitMode, ID, Margins, Metadata, Rect, Size, Unit, VersionedEntity } from "./primitives";
import type { GridTextAnchor, GridTextOverlayOverride, GridTextSource } from "./grid";
import type { TextAlignment, TextDirection, TextStylePatch } from "./text";

export interface MaskStyleBorder {
  enabled: boolean;
  color: string;
  widthMm: number;
}

export interface MaskStyleShadow {
  enabled: boolean;
  color: string;
  blur: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
}

export interface MaskStyle {
  border: MaskStyleBorder;
  shadow: MaskStyleShadow;
}

export const DEFAULT_MASK_STYLE: MaskStyle = {
  border: { enabled: false, color: "#1f2937", widthMm: 1 },
  shadow: { enabled: false, color: "#000000", blur: 12, opacity: 0.35, offsetX: 0, offsetY: 4 }
};

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
  /** @deprecated Use spacingMM (canonical) with mmToPx conversion. Kept for backward compatibility. */
  spacingX: number;
  /** @deprecated Use spacingMM (canonical) with mmToPx conversion. */
  spacingY: number;
  /** Canonical spacing in millimeters. Both X and Y use the same value. Falls back to spacingX/Y when undefined. */
  spacingMM?: number;
  /** Last user-selected display unit for spacing. Defaults to mm. */
  spacingUnit?: Unit;
  safeArea: Margins;
  arrangement: MaskArrangement;
  fitMode: FitMode;
  autoCreatePages: boolean;
  imageDeleteBehavior: MaskImageDeleteBehavior;
  dragDropBehavior: MaskDragDropBehavior;
  smartCropEnabled: boolean;
  linkedGroupId?: ID;
  textOverlayRuleIds: ID[];
  /** Mask-wide visual style applied uniformly to every cell as decoration (non-destructive). */
  maskStyle?: MaskStyle;
  metadata: Metadata;
}

export interface MaskFrameMetadata {
  maskId: ID;
  maskPageIndex: number;
  maskIndexGlobal: number;
  maskIndexOnPage: number;
  row: number;
  column: number;
  isMaskFrame: true;
  layoutManaged: true;
  maskShape: MaskShape;
  /** Snapshot of the mask-wide style at last layout build; used by the renderer. */
  maskStyle?: MaskStyle;
  /** Pre-computed px border width (since renderer doesn't have DPI). */
  maskStyleBorderPx?: number;
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

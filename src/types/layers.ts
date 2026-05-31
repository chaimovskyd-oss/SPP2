import type {
  CropRect,
  FillStyle,
  FitMode,
  GradientStyle,
  ID,
  Metadata,
  ShadowStyle,
  StrokeStyle,
  Transform,
  VersionedEntity
} from "./primitives";
import type {
  AnchorPoint,
  AutoContrastConfig,
  OverflowPolicy,
  TextAlignment,
  TextDirection,
  TextEffect,
  WarpType
} from "./text";
import type { VisualEffectStack } from "./visualEffects";
import type { ImageAdjustmentStack } from "./imageAdjustments";

export type LayerType =
  | "image"
  | "text"
  | "shape"
  | "adjustment-layer"
  | "group"
  | "mask"
  | "background"
  | "frame"
  | "guide";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten";

export interface BaseLayer extends VersionedEntity {
  id: ID;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  selected: boolean;
  parentId?: ID;
  metadata: Metadata;
  /** Opt this layer out of Smart Arrange. Additive/optional — unset = participates. */
  smartArrangeLocked?: boolean;
  /** Manually-pinned Smart Arrange role (Phase 3). Unset = inferred per run. */
  smartArrangeRole?: SmartArrangeRole;
}

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

export type FrameBehaviorMode = "layoutLocked" | "semiFlexible" | "freeform";

export interface ContentTransform extends VersionedEntity {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
}

export interface FaceAnchorData extends VersionedEntity {
  faceBox: CropRect;
  leftEye?: { x: number; y: number };
  rightEye?: { x: number; y: number };
  confidence: number;
}

export interface FrameMaskSource extends VersionedEntity {
  type: "alphaAsset";
  assetId: ID;
  width: number;
  height: number;
}

export interface FrameLayer extends BaseLayer {
  type: "frame";
  behaviorMode: FrameBehaviorMode;
  shape: "rect" | "circle" | "ellipse" | "polygon" | "svgPath" | "customMask" | "puzzle";
  contentType: "image" | "text" | "mixed" | "empty";
  imageAssetId?: ID;
  textLayerId?: ID;
  fitMode: FitMode;
  contentTransform: ContentTransform;
  crop: CropRect;
  padding: number;
  cornerRadius?: number;
  stroke?: StrokeStyle;
  fill?: FillStyle;
  maskId?: ID;
  maskSource?: FrameMaskSource;
  linkedGroup?: ID;
  batchIndex?: number;
  smartCropMode?: "none" | "face" | "center" | "ruleOfThirds" | "custom";
  faceAnchor?: FaceAnchorData;
  lockedContent?: boolean;
  lockedFrame?: boolean;
  visualEffects?: VisualEffectStack;
  imageAdjustments?: ImageAdjustmentStack;
}

export interface ArcSettings extends VersionedEntity {
  enabled: boolean;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface WarpSettings extends VersionedEntity {
  enabled: boolean;
  type: WarpType;
  intensity: number;
  amount: number;
  horizontalDistortion: number;
  verticalDistortion: number;
  bend: number;
}

export interface TextLayer extends BaseLayer {
  type: "text";
  layerType: "text";
  parentFrameId: ID | null;
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  fillOpacity: number;
  stroke?: StrokeStyle;
  shadow?: ShadowStyle;
  gradient?: GradientStyle;
  alignment: TextAlignment;
  direction: TextDirection;
  overflowPolicy: OverflowPolicy;
  anchorPoint: AnchorPoint;
  anchorOffsetX: number;
  anchorOffsetY: number;
  arcSettings?: ArcSettings;
  warpSettings: WarpSettings;
  effects: TextEffect[];
  textEffects?: TextEffect[];
  autoContrast: AutoContrastConfig;
  autoContrastOverridden: boolean;
  isDynamic: boolean;
  dynamicTemplate?: string;
  linkedGroup?: ID;
  linkedSlotId?: ID;
}

export interface Filter extends VersionedEntity {
  id: ID;
  type: "brightness" | "contrast" | "saturation" | "temperature" | "custom";
  value: number;
}

export interface ColorAdjustments extends VersionedEntity {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
}

export interface PerspectiveCorrection extends VersionedEntity {
  corners: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
}

export interface ImageLayerShadow {
  enabled: boolean;
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  opacity: number;
}

export interface ImageLayerOutline {
  enabled: boolean;
  color: string;
  width: number;
}

export interface ImageLayerEffects extends VersionedEntity {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  hue: number;
  grayscale: boolean;
  blur: number;
  shadow: ImageLayerShadow | null;
  outline: ImageLayerOutline | null;
  // Quick effects (optional — undefined = off). UI keys in EditorScreen.tsx.
  luminance?: number;          // -25..25, decimals allowed for fine control
  sepia?: boolean;
  invert?: boolean;
  threshold?: number;          // 0..100, 0 = off
  posterize?: number;          // 0..6, 0 = off
  remove_white?: boolean;
  remove_white_tolerance?: number;     // 5..55, decimals allowed for fine control
  color_pop?: boolean;
  color_pop_color?: string;            // hex
  color_pop_tolerance?: number;        // 5..85, decimals allowed for fine control
  color_pop_background?: number;       // 50..100
}

export const DEFAULT_IMAGE_LAYER_EFFECTS: ImageLayerEffects = {
  version: 1,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  hue: 0,
  grayscale: false,
  blur: 0,
  shadow: null,
  outline: null,
  luminance: 0,
  sepia: false,
  invert: false,
  threshold: 0,
  posterize: 0,
  remove_white: false,
  remove_white_tolerance: 22,
  color_pop: false,
  color_pop_color: "#ff0000",
  color_pop_tolerance: 28,
  color_pop_background: 100
};

export interface PixelMask extends VersionedEntity {
  assetId: ID;
  width: number;
  height: number;
}

export interface ImageLayer extends BaseLayer {
  type: "image";
  assetId: ID;
  crop: CropRect;
  fitMode: FitMode;
  transform: Transform;
  filters: Filter[];
  colorAdjustments: ColorAdjustments;
  effects: ImageLayerEffects;
  perspective?: PerspectiveCorrection;
  mask?: ID;
  pixelMask?: PixelMask;
  visualEffects?: VisualEffectStack;
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageScale?: number;
  /** Non-destructive Smart-Preset adjustment stack (Phase 2+). */
  imageAdjustments?: ImageAdjustmentStack;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shape: "rect" | "circle" | "ellipse" | "line" | "polygon" | "svgPath";
  fill?: FillStyle;
  stroke?: StrokeStyle;
  pathData?: string;
  visualEffects?: VisualEffectStack;
}

export type AdjustmentTargetMode = "below" | "clipped-to-layer" | "group-only" | "page-global";

export type AdjustmentOperation =
  | { type: "brightnessContrast"; brightness: number; contrast: number }
  | { type: "exposure"; exposure: number; gamma: number; offset: number }
  | { type: "hueSaturation"; hue: number; saturation: number; lightness: number }
  | { type: "blackWhite"; enabled: boolean }
  | { type: "invert"; enabled: boolean }
  | { type: "levels"; black: number; mid: number; white: number }
  | { type: "sepia"; intensity: number; warmth: number };

export interface AdjustmentLayer extends BaseLayer {
  type: "adjustment-layer";
  targetMode: AdjustmentTargetMode;
  targetLayerId?: ID;
  groupId?: ID;
  adjustments: AdjustmentOperation[];
}

export interface GroupLayer extends BaseLayer {
  type: "group";
  childIds: ID[];
  collapsed: boolean;
}

export interface MaskLayer extends BaseLayer {
  type: "mask";
  source: "shape" | "svg" | "png";
  pathData?: string;
  assetId?: ID;
  visualEffects?: VisualEffectStack;
}

export interface BackgroundLayer extends BaseLayer {
  type: "background";
  fill: FillStyle;
}

export interface GuideLayer extends BaseLayer {
  type: "guide";
  axis: "x" | "y";
  position: number;
}

export type VisualLayer =
  | FrameLayer
  | TextLayer
  | ImageLayer
  | ShapeLayer
  | AdjustmentLayer
  | GroupLayer
  | MaskLayer
  | BackgroundLayer
  | GuideLayer;

export interface LinkedGroup extends VersionedEntity {
  id: ID;
  name: string;
  type: "size" | "style" | "spacing" | "fitMode" | "textStyle" | "all";
  memberIds: ID[];
  masterFrameId?: ID;
  overridable: boolean;
  perMemberOverrides: Record<ID, Partial<FrameLayer | TextLayer>>;
}

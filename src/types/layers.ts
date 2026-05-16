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

export type LayerType =
  | "image"
  | "text"
  | "shape"
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
}

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
  linkedGroup?: ID;
  batchIndex?: number;
  smartCropMode?: "none" | "face" | "center" | "ruleOfThirds" | "custom";
  faceAnchor?: FaceAnchorData;
  lockedContent?: boolean;
  lockedFrame?: boolean;
  visualEffects?: VisualEffectStack;
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
  outline: null
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
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shape: "rect" | "circle" | "ellipse" | "line" | "polygon" | "svgPath";
  fill?: FillStyle;
  stroke?: StrokeStyle;
  pathData?: string;
  visualEffects?: VisualEffectStack;
}

export interface GroupLayer extends BaseLayer {
  type: "group";
  childIds: ID[];
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

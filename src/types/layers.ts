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

export interface FaceAnchorData extends VersionedEntity {
  faceBox: CropRect;
  leftEye?: { x: number; y: number };
  rightEye?: { x: number; y: number };
  confidence: number;
}

export interface FrameLayer extends BaseLayer {
  type: "frame";
  shape: "rect" | "circle" | "ellipse" | "polygon" | "svgPath" | "customMask";
  contentType: "image" | "text" | "mixed" | "empty";
  imageAssetId?: ID;
  textLayerId?: ID;
  fitMode: FitMode;
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

export interface ImageLayer extends BaseLayer {
  type: "image";
  assetId: ID;
  crop: CropRect;
  fitMode: FitMode;
  transform: Transform;
  filters: Filter[];
  colorAdjustments: ColorAdjustments;
  perspective?: PerspectiveCorrection;
  mask?: ID;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shape: "rect" | "circle" | "ellipse" | "line" | "polygon" | "svgPath";
  fill?: FillStyle;
  stroke?: StrokeStyle;
  pathData?: string;
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

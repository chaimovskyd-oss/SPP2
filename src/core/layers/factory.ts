import { createId } from "../ids";
import type {
  AdjustmentLayer,
  AdjustmentTargetMode,
  BaseLayer,
  ContentTransform,
  FrameBehaviorMode,
  FrameLayer,
  ImageLayer,
  LinkedGroup,
  ShapeLayer,
  TextLayer
} from "@/types/layers";
import { DEFAULT_IMAGE_LAYER_EFFECTS } from "@/types/layers";
import type { CropRect, FitMode, Metadata, Rect } from "@/types/primitives";
import { createDefaultTextModelFields } from "../text/defaults";

const defaultCrop: CropRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1
};

export const defaultContentTransform: ContentTransform = {
  version: 1,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0
};

function baseLayer(input: {
  id?: string;
  type: BaseLayer["type"];
  name: string;
  rect: Rect;
  zIndex?: number;
  locked?: boolean;
  metadata?: Metadata;
}): BaseLayer {
  return {
    version: 1,
    id: input.id ?? createId(input.type),
    type: input.type,
    name: input.name,
    visible: true,
    locked: input.locked ?? false,
    opacity: 1,
    blendMode: "normal",
    x: input.rect.x,
    y: input.rect.y,
    width: input.rect.width,
    height: input.rect.height,
    rotation: 0,
    zIndex: input.zIndex ?? 0,
    selected: false,
    metadata: input.metadata ?? {}
  };
}

export interface CreateFrameLayerOptions {
  id?: string;
  name?: string;
  rect: Rect;
  behaviorMode?: FrameBehaviorMode;
  shape?: FrameLayer["shape"];
  contentType?: FrameLayer["contentType"];
  imageAssetId?: string;
  textLayerId?: string;
  fitMode?: FitMode;
  contentTransform?: Partial<ContentTransform>;
  padding?: number;
  cornerRadius?: number;
  maskSource?: FrameLayer["maskSource"];
  linkedGroup?: string;
  batchIndex?: number;
  smartCropMode?: FrameLayer["smartCropMode"];
  lockedContent?: boolean;
  lockedFrame?: boolean;
  zIndex?: number;
  metadata?: Metadata;
}

export function createFrameLayer(options: CreateFrameLayerOptions): FrameLayer {
  return {
    ...baseLayer({
      id: options.id,
      type: "frame",
      name: options.name ?? "פריים",
      rect: options.rect,
      zIndex: options.zIndex,
      locked: options.lockedFrame,
      metadata: options.metadata
    }),
    type: "frame",
    behaviorMode: options.behaviorMode ?? "freeform",
    shape: options.shape ?? "rect",
    contentType: options.contentType ?? (options.imageAssetId ? "image" : "empty"),
    imageAssetId: options.imageAssetId,
    textLayerId: options.textLayerId,
    fitMode: options.fitMode ?? "fill",
    contentTransform: { ...defaultContentTransform, ...options.contentTransform },
    crop: { ...defaultCrop },
    padding: options.padding ?? 0,
    cornerRadius: options.cornerRadius,
    maskSource: options.maskSource,
    linkedGroup: options.linkedGroup,
    batchIndex: options.batchIndex,
    smartCropMode: options.smartCropMode ?? "none",
    lockedContent: options.lockedContent ?? false,
    lockedFrame: options.lockedFrame ?? false
  };
}

export interface CreateTextLayerOptions {
  id?: string;
  name?: string;
  rect: Rect;
  text: string;
  linkedGroup?: string;
  linkedSlotId?: string;
  zIndex?: number;
  metadata?: Metadata;
}

export function createTextLayer(options: CreateTextLayerOptions): TextLayer {
  return {
    ...baseLayer({
      id: options.id,
      type: "text",
      name: options.name ?? "Text",
      rect: options.rect,
      zIndex: options.zIndex,
      metadata: options.metadata
    }),
    type: "text",
    ...createDefaultTextModelFields(),
    text: options.text,
    fontFamily: "DM Sans",
    fontWeight: 600,
    fontStyle: "normal",
    fontSize: 90,
    lineHeight: 1.2,
    letterSpacing: 0,
    color: "#111111",
    alignment: "center",
    direction: "auto",
    linkedGroup: options.linkedGroup,
    linkedSlotId: options.linkedSlotId
  };
}

export function createImageLayer(options: {
  id?: string;
  name?: string;
  rect: Rect;
  assetId: string;
  fitMode?: FitMode;
  zIndex?: number;
  metadata?: Metadata;
}): ImageLayer {
  return {
    ...baseLayer({
      id: options.id,
      type: "image",
      name: options.name ?? "Image",
      rect: options.rect,
      zIndex: options.zIndex,
      metadata: options.metadata
    }),
    type: "image",
    assetId: options.assetId,
    crop: { ...defaultCrop },
    fitMode: options.fitMode ?? "fit",
    transform: {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    },
    filters: [],
    colorAdjustments: {
      version: 1,
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      tint: 0
    },
    effects: { ...DEFAULT_IMAGE_LAYER_EFFECTS }
  };
}

export function createShapeLayer(options: {
  id?: string;
  name?: string;
  rect: Rect;
  shape: ShapeLayer["shape"];
  locked?: boolean;
  zIndex?: number;
  metadata?: Metadata;
}): ShapeLayer {
  return {
    ...baseLayer({
      id: options.id,
      type: "shape",
      name: options.name ?? "Shape",
      rect: options.rect,
      zIndex: options.zIndex,
      locked: options.locked,
      metadata: options.metadata
    }),
    type: "shape",
    shape: options.shape
  };
}

export function createAdjustmentLayer(options: {
  id?: string;
  name?: string;
  rect?: Rect;
  zIndex?: number;
  targetMode?: AdjustmentTargetMode;
  targetLayerId?: string;
  groupId?: string;
  brightness?: number;
  contrast?: number;
  metadata?: Metadata;
} = {}): AdjustmentLayer {
  return {
    ...baseLayer({
      id: options.id,
      type: "adjustment-layer",
      name: options.name ?? "בהירות/ניגודיות 1",
      rect: options.rect ?? { x: 0, y: 0, width: 1, height: 1 },
      zIndex: options.zIndex,
      metadata: options.metadata
    }),
    type: "adjustment-layer",
    targetMode: options.targetMode ?? "below",
    targetLayerId: options.targetLayerId,
    groupId: options.groupId,
    adjustments: [
      {
        type: "brightnessContrast",
        brightness: options.brightness ?? 0,
        contrast: options.contrast ?? 0
      }
    ]
  };
}

export function createLinkedGroup(options: {
  id?: string;
  name: string;
  type: LinkedGroup["type"];
  memberIds: string[];
  masterFrameId?: string;
  overridable?: boolean;
}): LinkedGroup {
  return {
    version: 1,
    id: options.id ?? createId("linked"),
    name: options.name,
    type: options.type,
    memberIds: options.memberIds,
    masterFrameId: options.masterFrameId,
    overridable: options.overridable ?? true,
    perMemberOverrides: {}
  };
}

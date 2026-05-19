import type { Document, Page } from "@/types/document";
import type { FrameLayer, ImageLayer, VisualLayer } from "@/types/layers";
import { defaultContentTransform } from "./factory";

export type FrameMaskLayer = FrameLayer & {
  maskSource: NonNullable<FrameLayer["maskSource"]>;
};

export function isFrameMaskLayer(layer: VisualLayer | null | undefined): layer is FrameMaskLayer {
  if (layer === null || layer === undefined) return false;
  if (layer.type !== "frame") return false;
  const frame = layer as FrameLayer;
  if (frame.maskSource !== undefined) return true;
  const meta = frame.metadata["frameMask"] as { source?: string } | undefined;
  return meta !== undefined;
}

export function isEmptyFrame(layer: VisualLayer | null | undefined): boolean {
  if (layer === null || layer === undefined) return false;
  if (layer.type !== "frame") return false;
  const frame = layer as FrameLayer;
  return frame.contentType === "empty" || frame.imageAssetId === undefined;
}

function mapPage(doc: Document, pageId: string, mapLayers: (layers: VisualLayer[]) => VisualLayer[]): Document {
  return {
    ...doc,
    pages: doc.pages.map((page): Page => page.id === pageId ? { ...page, layers: mapLayers(page.layers) } : page)
  };
}

export type InsertMode = "insert" | "replace";

export function insertImageIntoFrame(
  doc: Document,
  pageId: string,
  frameId: string,
  assetId: string,
  _mode: InsertMode = "insert"
): Document {
  return mapPage(doc, pageId, (layers) => layers.map((layer): VisualLayer => {
    if (layer.id !== frameId || layer.type !== "frame") return layer;
    const frame = layer as FrameLayer;
    return {
      ...frame,
      imageAssetId: assetId,
      contentType: "image",
      contentTransform: { ...defaultContentTransform }
    };
  }));
}

export function clearFrameImage(doc: Document, pageId: string, frameId: string): Document {
  return mapPage(doc, pageId, (layers) => layers.map((layer): VisualLayer => {
    if (layer.id !== frameId || layer.type !== "frame") return layer;
    const frame = layer as FrameLayer;
    return {
      ...frame,
      imageAssetId: undefined,
      contentType: "empty",
      contentTransform: { ...defaultContentTransform }
    };
  }));
}

/**
 * Moves a standalone ImageLayer into a Frame/Mask: the image's asset becomes
 * the frame's content and the original ImageLayer is removed. The frame's
 * geometry is unchanged; the image's transform/effects are dropped (only the
 * asset is carried), matching Canva semantics.
 */
export function moveImageLayerIntoFrame(
  doc: Document,
  pageId: string,
  imageLayerId: string,
  frameId: string
): Document {
  return mapPage(doc, pageId, (layers) => {
    const image = layers.find((l): l is ImageLayer => l.id === imageLayerId && l.type === "image");
    if (image === undefined) return layers;
    return layers
      .filter((l) => l.id !== imageLayerId)
      .map((layer): VisualLayer => {
        if (layer.id !== frameId || layer.type !== "frame") return layer;
        const frame = layer as FrameLayer;
        return {
          ...frame,
          imageAssetId: image.assetId,
          contentType: "image",
          contentTransform: { ...defaultContentTransform }
        };
      });
  });
}

/**
 * Reverts a Frame/Mask back to a normal ImageLayer using its current
 * `imageAssetId` as the asset. The Frame's mask shape is dropped. No-op if the
 * frame has no image content.
 */
export function convertFrameMaskBackToImage(
  doc: Document,
  pageId: string,
  frameId: string,
  createImageLayer: (args: {
    id: string;
    name: string;
    rect: { x: number; y: number; width: number; height: number };
    assetId: string;
    zIndex: number;
  }) => ImageLayer
): Document {
  return mapPage(doc, pageId, (layers) => layers.map((layer): VisualLayer => {
    if (layer.id !== frameId || layer.type !== "frame") return layer;
    const frame = layer as FrameLayer;
    if (frame.imageAssetId === undefined) return layer;
    const image = createImageLayer({
      id: frame.id,
      name: frame.name,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      assetId: frame.imageAssetId,
      zIndex: frame.zIndex
    });
    return {
      ...image,
      rotation: frame.rotation,
      opacity: frame.opacity,
      blendMode: frame.blendMode,
      visible: frame.visible,
      locked: frame.locked,
      parentId: frame.parentId
    };
  }));
}

export function findFrameMaskLayers(layers: VisualLayer[]): FrameMaskLayer[] {
  return layers.filter(isFrameMaskLayer);
}

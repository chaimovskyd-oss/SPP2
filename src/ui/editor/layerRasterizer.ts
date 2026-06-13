import type Konva from "konva";

import type { Page } from "@/types/document";
import type { Rect } from "@/types/primitives";

import { SCREEN_HELPER_NODE_NAME } from "./canvasNodeNames";

export interface RasterizedLayers {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Rasterizes a subset of a page's layers from the live Konva stage to a PNG
 * data URL, cropped to `bounds` (page coordinates). Used by Merge Layers and
 * Flatten. Rendering through the live stage preserves effects, filters, masks
 * and blend modes exactly as displayed — unlike offscreenPageRenderer which
 * only handles image layers.
 *
 * The stage is mutated imperatively (visibility, scale, size, layer offsets)
 * and restored synchronously in a finally block — the same pattern used by
 * renderPrintableStage in projectActions.ts.
 */
export function rasterizeLayers(
  stage: Konva.Stage,
  page: Page,
  targetLayerIds: Set<string>,
  bounds: Rect,
  pixelRatio: number,
): RasterizedLayers {
  // Hide on-screen-only chrome: grid/margins/guides (screen-helper nodes) and
  // the selection Transformer, which lives outside the clip group.
  const chromeNodes = [...stage.find(`.${SCREEN_HELPER_NODE_NAME}`), ...stage.find("Transformer")];

  // Hide every layer node that is NOT part of the merge target set.
  const hiddenLayerNodes: Konva.Node[] = [];
  for (const layer of page.layers) {
    if (targetLayerIds.has(layer.id)) continue;
    const node = stage.findOne(`#${layer.id}`);
    if (node !== undefined) hiddenLayerNodes.push(node);
  }

  const nodesToHide = [...chromeNodes, ...hiddenLayerNodes];
  const savedVisibility = nodesToHide.map((node) => ({ node, visible: node.visible() }));

  const original = {
    width: stage.width(),
    height: stage.height(),
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY(),
  };
  // The display stage shifts all Layers by OVERFLOW_PAD/scale so Transformer
  // handles render outside the canvas boundary; reset to (0,0) so page content
  // maps to stage pixel (0,0) during the crop.
  const layers = stage.getLayers();
  const layerOffsets = layers.map((l) => ({ layer: l, x: l.x(), y: l.y() }));
  layers.forEach((l) => { l.x(0); l.y(0); });

  savedVisibility.forEach(({ node }) => node.visible(false));
  stage.width(page.width);
  stage.height(page.height);
  stage.scale({ x: 1, y: 1 });
  stage.batchDraw();

  try {
    const dataUrl = stage.toDataURL({
      mimeType: "image/png",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      pixelRatio,
    });
    return { dataUrl, width: Math.round(bounds.width), height: Math.round(bounds.height) };
  } finally {
    stage.width(original.width);
    stage.height(original.height);
    stage.scale({ x: original.scaleX, y: original.scaleY });
    layerOffsets.forEach(({ layer, x, y }) => { layer.x(x); layer.y(y); });
    savedVisibility.forEach(({ node, visible }) => node.visible(visible));
    stage.batchDraw();
  }
}

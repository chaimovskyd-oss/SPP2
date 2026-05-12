import { resolveCanvasAssetPath, resolveExportAssetPath } from "@/core/assets/assetManager";
import type { Asset, Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";

export type RenderTarget = "screen" | "export";

export interface RenderAssetRef {
  assetId: string;
  src?: string;
  missing: boolean;
}

export interface RenderLayer {
  layer: VisualLayer;
  asset?: RenderAssetRef;
}

export interface RenderModel {
  pageId: string;
  width: number;
  height: number;
  layers: RenderLayer[];
  target: RenderTarget;
}

export function buildRenderModel(page: Page, assets: Asset[], target: RenderTarget = "screen"): RenderModel {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    pageId: page.id,
    width: page.width,
    height: page.height,
    target,
    layers: [...page.layers]
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((layer) => ({
        layer,
        asset: getLayerAssetRef(layer, assetById, target)
      }))
  };
}

function getLayerAssetRef(layer: VisualLayer, assetById: Map<string, Asset>, target: RenderTarget): RenderAssetRef | undefined {
  const assetId = layer.type === "frame" ? layer.imageAssetId : layer.type === "image" ? layer.assetId : undefined;
  if (assetId === undefined) {
    return undefined;
  }
  const asset = assetById.get(assetId);
  const src = target === "export" ? resolveExportAssetPath(asset) : resolveCanvasAssetPath(asset);
  return {
    assetId,
    src,
    missing: asset === undefined || asset.status === "missing" || src === undefined
  };
}

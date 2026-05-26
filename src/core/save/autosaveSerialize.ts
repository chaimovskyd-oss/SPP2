import type { ProjectEnvelope } from "@/types/project";
import type { Asset } from "@/types/document";
import { serializeProject } from "./projectFormat";

export function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

function stripAssetForAutosave(asset: Asset): { asset: Asset; stripped: boolean } {
  let stripped = false;
  const next: Asset = { ...asset };

  if (isDataUrl(next.originalPath)) {
    delete next.originalPath;
    stripped = true;
  }
  if (isDataUrl(next.previewPath)) {
    delete next.previewPath;
    stripped = true;
  }
  if (isDataUrl(next.thumbnailPath)) {
    delete next.thumbnailPath;
    stripped = true;
  }

  if (stripped) {
    next.status = "missing";
  }
  return { asset: next, stripped };
}

function stripLayerInlineBytes(layer: unknown): unknown {
  if (!layer || typeof layer !== "object") return layer;
  const record = layer as Record<string, unknown>;
  let mutated: Record<string, unknown> | null = null;

  for (const key of ["dataUrl", "src", "imageData", "previewDataUrl"]) {
    if (isDataUrl(record[key])) {
      if (!mutated) mutated = { ...record };
      delete mutated[key];
    }
  }
  return mutated ?? layer;
}

export interface AutosaveSafeResult {
  safe: ProjectEnvelope;
  strippedAssetIds: string[];
}

export function createAutosaveSafeProject(envelope: ProjectEnvelope): AutosaveSafeResult {
  const cloned: ProjectEnvelope =
    typeof structuredClone === "function"
      ? structuredClone(envelope)
      : (JSON.parse(JSON.stringify(envelope)) as ProjectEnvelope);

  const strippedAssetIds: string[] = [];
  cloned.document.assets = cloned.document.assets.map((asset) => {
    const { asset: nextAsset, stripped } = stripAssetForAutosave(asset);
    if (stripped) strippedAssetIds.push(nextAsset.id);
    return nextAsset;
  });

  cloned.document.pages = cloned.document.pages.map((page) => ({
    ...page,
    layers: page.layers.map((layer) => stripLayerInlineBytes(layer) as typeof layer)
  }));

  return { safe: cloned, strippedAssetIds };
}

export interface AutosaveWeightEstimate {
  bytes: number;
  pages: number;
  assets: number;
  strippedAssets: number;
}

export function estimateAutosaveWeight(envelope: ProjectEnvelope): AutosaveWeightEstimate {
  const { safe, strippedAssetIds } = createAutosaveSafeProject(envelope);
  const payload = serializeProject(safe);
  const bytes = typeof Blob !== "undefined" ? new Blob([payload]).size : payload.length * 2;
  return {
    bytes,
    pages: safe.document.pages.length,
    assets: safe.document.assets.length,
    strippedAssets: strippedAssetIds.length
  };
}

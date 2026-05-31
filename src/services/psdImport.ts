import { createDocument, createPage } from "@/core/document/factory";
import { createAdjustmentLayer, createImageLayer } from "@/core/layers/factory";
import { createProjectEnvelope, withProjectMetadata } from "@/core";
import type { Asset, Document } from "@/types/document";
import type { ProjectEnvelope } from "@/types/project";
import type { JsonValue } from "@/types/primitives";
import type { AdjustmentOperation, BlendMode, VisualLayer } from "@/types/layers";

export interface PsdAdjustmentManifest {
  kind: "adjustment";
  psdAdjustmentType: string;
  supported: boolean;
  operation: AdjustmentOperation | null;
  raw?: JsonValue;
  warnings: string[];
}

export interface PsdImportLayerManifest {
  id: string;
  name: string;
  groupPath: string[];
  pngPath?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
  blendMode?: BlendMode;
  clipping?: boolean;
  warnings: string[];
  adjustment?: PsdAdjustmentManifest;
  text?: {
    kind: "text";
    text: string;
    fontNames: string[];
    fontSize: number | null;
    color: string | null;
    transform?: JsonValue;
    warnings: string[];
  };
}

export interface PsdImportManifest {
  type: "psd-import";
  canvas: {
    width: number;
    height: number;
  };
  layers: PsdImportLayerManifest[];
  warnings: string[];
  error?: string;
  sourcePath?: string;
  outputDir?: string;
  fileSize?: number;
}

export interface PsdImportSummary {
  importedLayers: number;
  skippedLayers: number;
  warnings: string[];
}

export async function buildDocumentFromPsdManifest(manifest: PsdImportManifest, readFileBase64: (filePath: string) => Promise<string>): Promise<{ document: Document; summary: PsdImportSummary }> {
  const width = Math.max(1, Math.round(manifest.canvas.width || 1));
  const height = Math.max(1, Math.round(manifest.canvas.height || 1));
  const sourceName = manifest.sourcePath?.split(/[\\/]/).pop() ?? "PSD Import";
  const now = new Date().toISOString();
  const page = createPage({
    name: "PSD",
    setup: {
      units: "px",
      dpi: 300,
      orientation: width >= height ? "landscape" : "portrait",
      size: { width, height },
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      bleed: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundTransparent: true
    },
    metadata: {
      name: sourceName,
      source: "psd-import",
      ...(manifest.sourcePath === undefined ? {} : { sourcePath: manifest.sourcePath })
    }
  });

  const assets: Asset[] = [];
  const layers: VisualLayer[] = [];
  const sorted = [...manifest.layers];
  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    if (item === undefined) continue;
    if (item.adjustment !== undefined) {
      const operation = normalizePsdAdjustmentOperation(item.adjustment.operation);
      if (operation === null) {
        layers.push(createUnsupportedAdjustmentPlaceholder(item, index));
        continue;
      }
      const layer = createAdjustmentLayer({
        name: item.groupPath.length > 0 ? `${item.groupPath.join(" / ")} / ${item.name}` : item.name,
        rect: {
          x: Math.round(item.x),
          y: Math.round(item.y),
          width: Math.max(1, Math.round(item.width)),
          height: Math.max(1, Math.round(item.height))
        },
        zIndex: index,
        operation,
        targetMode: item.clipping === true ? "clipped-to-layer" : "below",
        metadata: {
          source: "psd-import",
          psdLayerId: item.id,
          groupPath: item.groupPath,
          psdAdjustmentType: item.adjustment.psdAdjustmentType,
          warnings: [...item.warnings, ...item.adjustment.warnings],
          ...(item.adjustment.raw === undefined ? {} : { rawPsdAdjustment: item.adjustment.raw })
        }
      });
      layers.push({
        ...layer,
        opacity: clamp01(item.opacity),
        visible: item.visible,
        blendMode: normalizeBlendMode(item.blendMode)
      });
      continue;
    }
    if (item.pngPath === undefined) {
      continue;
    }
    const base64 = await readFileBase64(item.pngPath);
    const dataUrl = `data:image/png;base64,${base64}`;
    const asset: Asset = {
      version: 1,
      id: crypto.randomUUID(),
      name: item.name || `PSD Layer ${index + 1}`,
      kind: "image",
      status: "ready",
      originalPath: dataUrl,
      previewPath: dataUrl,
      thumbnailPath: dataUrl,
      mimeType: "image/png",
      width: Math.max(1, Math.round(item.width)),
      height: Math.max(1, Math.round(item.height)),
      fileSize: Math.round(base64.length * 0.75),
      metadata: {
        source: "psd-import",
        originalFileName: `${item.name || "layer"}.png`,
        importedAt: now,
        psdLayerId: item.id,
        ...(manifest.sourcePath === undefined ? {} : { psdSourcePath: manifest.sourcePath }),
        groupPath: item.groupPath,
        warnings: item.warnings,
        ...(item.text === undefined ? {} : { psdText: item.text })
      }
    };
    assets.push(asset);
    const layer = createImageLayer({
      name: item.groupPath.length > 0 ? `${item.groupPath.join(" / ")} / ${item.name}` : item.name,
      assetId: asset.id,
      rect: {
        x: Math.round(item.x),
        y: Math.round(item.y),
        width: Math.max(1, Math.round(item.width)),
        height: Math.max(1, Math.round(item.height))
      },
      fitMode: "fit",
      zIndex: index,
      metadata: {
        source: "psd-import",
        psdLayerId: item.id,
        groupPath: item.groupPath,
        warnings: item.warnings,
        ...(item.text === undefined ? {} : { psdText: item.text })
      }
    });
    layers.push({
      ...layer,
      opacity: clamp01(item.opacity),
      visible: item.visible,
      blendMode: normalizeBlendMode(item.blendMode)
    });
  }

  const document = withProjectMetadata({
    ...createDocument({
      name: sourceName.replace(/\.(psd|psb)$/i, "") || "PSD Import",
      dpi: 300,
      metadata: {
        mode: "free",
        source: "psd-import",
        ...(manifest.sourcePath === undefined ? {} : { sourcePath: manifest.sourcePath })
      }
    }),
    pages: [{ ...page, layers }],
    assets
  }, { projectType: "PSD Import" });

  return {
    document,
    summary: {
      importedLayers: layers.length,
      skippedLayers: (manifest.warnings ?? []).filter((warning) => /^Skipped\b/i.test(warning)).length,
      warnings: [
        ...(manifest.warnings ?? []),
        ...manifest.layers.flatMap((layer) => layer.warnings.map((warning) => `${layer.name}: ${warning}`))
      ]
    }
  };
}

function normalizePsdAdjustmentOperation(operation: AdjustmentOperation | null | undefined): AdjustmentOperation | null {
  if (operation === null || operation === undefined) return null;
  if (operation.type === "brightnessContrast") {
    return {
      type: "brightnessContrast",
      brightness: clampRange(operation.brightness, -100, 100, 0),
      contrast: clampRange(operation.contrast, -100, 100, 0)
    };
  }
  if (operation.type === "exposure") {
    return {
      type: "exposure",
      exposure: clampRange(operation.exposure, -10, 10, 0),
      gamma: clampRange(operation.gamma, 0.1, 10, 1),
      offset: clampRange(operation.offset, -1, 1, 0)
    };
  }
  if (operation.type === "hueSaturation") {
    return {
      type: "hueSaturation",
      hue: clampRange(operation.hue, -180, 180, 0),
      saturation: clampRange(operation.saturation, -100, 100, 0),
      lightness: clampRange(operation.lightness, -100, 100, 0)
    };
  }
  if (operation.type === "blackWhite") return { type: "blackWhite", enabled: operation.enabled };
  if (operation.type === "invert") return { type: "invert", enabled: operation.enabled };
  if (operation.type === "levels") {
    return {
      type: "levels",
      black: clampRange(operation.black, 0, 254, 0),
      mid: clampRange(operation.mid, 0.1, 10, 1),
      white: clampRange(operation.white, 1, 255, 255)
    };
  }
  return null;
}

function createUnsupportedAdjustmentPlaceholder(item: PsdImportLayerManifest, zIndex: number): VisualLayer {
  const warning = item.adjustment === undefined
    ? "Unsupported PSD adjustment layer."
    : `Unsupported PSD adjustment layer: ${item.adjustment.psdAdjustmentType}.`;
  return createAdjustmentLayer({
    name: item.groupPath.length > 0 ? `${item.groupPath.join(" / ")} / ${item.name}` : item.name,
    rect: {
      x: Math.round(item.x),
      y: Math.round(item.y),
      width: Math.max(1, Math.round(item.width)),
      height: Math.max(1, Math.round(item.height))
    },
    zIndex,
    operation: { type: "brightnessContrast", brightness: 0, contrast: 0 },
    metadata: {
      source: "psd-import",
      psdLayerId: item.id,
      groupPath: item.groupPath,
      warnings: [...item.warnings, warning],
      unsupportedPsdAdjustment: jsonSafeAdjustmentManifest(item.adjustment)
    }
  });
}

function jsonSafeAdjustmentManifest(adjustment: PsdAdjustmentManifest | undefined): JsonValue {
  if (adjustment === undefined) return {};
  return {
    kind: adjustment.kind,
    psdAdjustmentType: adjustment.psdAdjustmentType,
    supported: adjustment.supported,
    operation: adjustment.operation ?? null,
    warnings: adjustment.warnings,
    ...(adjustment.raw === undefined ? {} : { raw: adjustment.raw })
  };
}

function normalizeBlendMode(value: BlendMode | undefined): BlendMode {
  if (value === "multiply" || value === "screen" || value === "overlay" || value === "darken" || value === "lighten") return value;
  return "normal";
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function createPsdProjectEnvelope(document: Document): ProjectEnvelope {
  return createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

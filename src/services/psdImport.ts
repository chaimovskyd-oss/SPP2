import { createDocument, createPage } from "@/core/document/factory";
import { createImageLayer } from "@/core/layers/factory";
import { createProjectEnvelope, withProjectMetadata } from "@/core";
import type { Asset, Document } from "@/types/document";
import type { ProjectEnvelope } from "@/types/project";
import type { JsonValue } from "@/types/primitives";

export interface PsdImportLayerManifest {
  id: string;
  name: string;
  groupPath: string[];
  pngPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
  warnings: string[];
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
  const layers = [];
  const sorted = [...manifest.layers];
  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    if (item === undefined) continue;
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
      visible: item.visible
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

export function createPsdProjectEnvelope(document: Document): ProjectEnvelope {
  return createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

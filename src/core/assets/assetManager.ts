import { createAppError } from "@/core/errors/errors";
import { analyzeScreenshotCrop } from "@/core/image/screenshotCropDetector";
import { writeLog } from "@/core/logging/logger";
import type { Asset } from "@/types/document";
import type { JsonValue } from "@/types/primitives";

export interface AssetImportOptions {
  createPreview?: boolean;
  previewMaxSize?: number;
  thumbnailMaxSize?: number;
  originalPath?: string;
}

export interface AssetImportResult {
  asset: Asset;
  duplicateOf?: string;
}

export interface AssetCacheEntry {
  assetId: string;
  url: string;
  bytes: number;
  lastUsedAt: number;
  revoke?: () => void;
}

export class AssetMemoryCache {
  private entries = new Map<string, AssetCacheEntry>();

  constructor(private readonly maxBytes = 128 * 1024 * 1024) {}

  get(assetId: string): string | undefined {
    const entry = this.entries.get(assetId);
    if (entry === undefined) {
      return undefined;
    }
    entry.lastUsedAt = Date.now();
    return entry.url;
  }

  set(entry: AssetCacheEntry): void {
    this.entries.set(entry.assetId, entry);
    this.prune();
  }

  release(assetId: string): void {
    const entry = this.entries.get(assetId);
    entry?.revoke?.();
    this.entries.delete(assetId);
  }

  clear(): void {
    this.entries.forEach((entry) => entry.revoke?.());
    this.entries.clear();
  }

  get totalBytes(): number {
    return [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  }

  private prune(): void {
    while (this.totalBytes > this.maxBytes && this.entries.size > 0) {
      const oldest = [...this.entries.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
      if (oldest === undefined) {
        return;
      }
      this.release(oldest.assetId);
    }
  }
}

export const assetPreviewCache = new AssetMemoryCache();

export async function importImageAsset(file: File, existingAssets: Asset[] = [], options: AssetImportOptions = {}): Promise<AssetImportResult> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = await hashBytes(bytes);
    const duplicate = existingAssets.find((asset) => asset.hash === hash || asset.checksum === hash);
    const dataUrl = await blobToDataUrl(file);
    const dimensions = await readImageDimensions(dataUrl);
    const previewMaxSize = options.previewMaxSize ?? 1600;
    const thumbnailMaxSize = options.thumbnailMaxSize ?? 280;
    const previews = options.createPreview === false
      ? { previewPath: dataUrl, thumbnailPath: dataUrl }
      : await createAssetPreviews(dataUrl, previewMaxSize, thumbnailMaxSize);
    const screenshotCropSuggestion = await detectScreenshotCropSuggestion(dataUrl, dimensions.width, dimensions.height, file.name);

    const asset: Asset = {
      version: 1,
      id: crypto.randomUUID(),
      name: file.name,
      kind: "image",
      status: "ready",
      originalPath: options.originalPath ?? dataUrl,
      previewPath: previews.previewPath,
      thumbnailPath: previews.thumbnailPath,
      mimeType: file.type || "application/octet-stream",
      width: dimensions.width,
      height: dimensions.height,
      fileSize: file.size,
      hash,
      checksum: hash,
      metadata: {
        importedAt: new Date().toISOString(),
        originalFileName: file.name,
        previewMaxSize,
        thumbnailMaxSize,
        ...(screenshotCropSuggestion === null ? {} : { screenshotCropSuggestion: screenshotCropSuggestion as unknown as JsonValue }),
        ...(duplicate === undefined ? {} : { duplicateOf: duplicate.id })
      }
    };
    writeLog("import", "info", "נכס תמונה יובא", { assetId: asset.id, name: asset.name, duplicateOf: duplicate?.id });
    return { asset, duplicateOf: duplicate?.id };
  } catch (error) {
    throw createAppError({
      code: "ASSET_IMPORT_FAILED",
      channel: "import",
      message: "ייבוא התמונה נכשל",
      recoverable: true,
      cause: error,
      context: { fileName: file.name }
    });
  }
}

async function detectScreenshotCropSuggestion(
  dataUrl: string,
  originalWidth: number,
  originalHeight: number,
  name: string
): Promise<import("@/core/image/screenshotCropMetadata").ScreenshotCropSuggestionMetadata | null> {
  if (typeof document === "undefined") return null;
  try {
    const image = await loadImage(dataUrl);
    const analysis = await analyzeScreenshotCrop(image);
    writeLog("import", analysis.isSuspicious ? "info" : "debug", "Smart screenshot crop analysis", {
      name,
      confidence: analysis.confidence,
      cropRect: analysis.cropRect,
      removedPixels: analysis.removedPixels,
      reasons: analysis.reasons
    });
    return analysis.isSuspicious && analysis.cropRect !== null
      ? {
          ...analysis,
          originalWidth,
          originalHeight
        }
      : null;
  } catch (error) {
    writeLog("import", "debug", "Smart screenshot crop analysis skipped", {
      name,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function createAssetPreviews(source: string, previewMaxSize = 1600, thumbnailMaxSize = 280): Promise<{ previewPath: string; thumbnailPath: string }> {
  if (typeof document === "undefined") {
    return {
      previewPath: source,
      thumbnailPath: source
    };
  }
  const previewPath = await resizeImageDataUrl(source, previewMaxSize);
  const thumbnailPath = await resizeImageDataUrl(source, thumbnailMaxSize);
  return { previewPath, thumbnailPath };
}

export function markMissingAsset(asset: Asset): Asset {
  return {
    ...asset,
    status: "missing",
    previewPath: asset.previewPath,
    thumbnailPath: asset.thumbnailPath,
    metadata: {
      ...asset.metadata,
      missingDetectedAt: new Date().toISOString()
    }
  };
}

export function createMaskAsset(dataUrl: string, width: number, height: number, layerId: string): Asset {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: `mask_${layerId}`,
    kind: "image",
    status: "ready",
    originalPath: dataUrl,
    previewPath: dataUrl,
    thumbnailPath: dataUrl,
    mimeType: "image/png",
    width,
    height,
    fileSize: Math.round(dataUrl.length * 0.75),
    metadata: { isMask: true, layerId }
  };
}

export function resolveCanvasAssetPath(asset: Asset | undefined): string | undefined {
  if (asset === undefined || asset.status === "missing") {
    return undefined;
  }
  return asset.previewPath ?? asset.thumbnailPath ?? asset.originalPath;
}

export function resolveExportAssetPath(asset: Asset | undefined): string | undefined {
  if (asset === undefined || asset.status === "missing") {
    return undefined;
  }
  return asset.originalPath ?? asset.previewPath ?? asset.thumbnailPath;
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle !== undefined) {
    const copy = new Uint8Array(bytes);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function readImageDimensions(src: string): Promise<{ width: number; height: number }> {
  if (typeof Image === "undefined") {
    return { width: 0, height: 0 };
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error("Cannot decode image"));
    image.src = src;
  });
}

async function resizeImageDataUrl(src: string, maxSize: number): Promise<string> {
  const isPng = src.startsWith("data:image/png") || src.startsWith("data:image/gif") || src.startsWith("data:image/webp") || src.startsWith("data:image/svg");
  const image = await loadImage(src);
  const ratio = image.width === 0 || image.height === 0 ? 1 : Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  const context = canvas.getContext("2d");
  if (context === null) {
    return src;
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return isPng ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.86);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load image"));
    image.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === "undefined") {
    return blob.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Cannot read file"));
    reader.readAsDataURL(blob);
  });
}

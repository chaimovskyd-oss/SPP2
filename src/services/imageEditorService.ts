import { createAssetPreviews } from "@/core/assets/assetManager";
import type { Asset } from "@/types/document";

/** True when running inside Electron with the image editor IPC available. */
export function isImageEditorAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.spp?.openImageEditor === "function";
}

/** True when headless Python image processing is available. */
export function isHeadlessProcessingAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.spp?.applyImageParams === "function";
}

/**
 * Apply edit params to an asset's image via the Python pipeline.
 *
 * Important:
 * This uses metadata.editBaseUrl when available, so quick sliders are always
 * applied from the current clean edit base, not repeatedly on top of previous
 * slider output.
 */
export async function applyImageParams(
  asset: Asset,
  editParams: Record<string, number | boolean | string>
): Promise<Asset | null> {
  if (!isHeadlessProcessingAvailable()) return null;

  const sourceDataUrl =
    (asset.metadata["editBaseUrl"] as string | undefined) ??
    asset.originalPath ??
    asset.previewPath ??
    asset.thumbnailPath;

  if (!sourceDataUrl) return null;

  const ext = extFromMimeOrDataUrl(asset.mimeType, sourceDataUrl);

  const inputPath = await window.spp.writeTempImage(sourceDataUrl, ext);
  const outputPath = inputPath.replace(new RegExp(`\\.${ext}$`), `_processed.${ext}`);

  const pythonParams: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(editParams)) {
    if (key === "exposure" && typeof value === "number") {
      pythonParams[key] = value / 100.0;
    } else {
      pythonParams[key] = value;
    }
  }

  const result = await window.spp.applyImageParams(
    inputPath,
    outputPath,
    JSON.stringify(pythonParams)
  );

  if (!result.success) return null;

  let base64: string;

  try {
    base64 = await window.spp.readFileBase64(outputPath);
  } catch {
    return null;
  }

  const mimeType = mimeFromExt(ext);
  const processedDataUrl = `data:${mimeType};base64,${base64}`;

  const { previewPath, thumbnailPath } = await createAssetPreviews(
    processedDataUrl,
    1600,
    280
  );

  return {
    ...asset,
    originalPath: processedDataUrl,
    previewPath,
    thumbnailPath,
    metadata: {
      ...asset.metadata,

      // Keep the current edit base stable.
      // Slider output should not become the next base, otherwise edits stack destructively.
      editBaseUrl: sourceDataUrl,

      imageEditParams: editParams as unknown as import("@/types/primitives").JsonValue,
      lastQuickEditedAt: new Date().toISOString()
    }
  };
}

/**
 * Open the Smart Image Editor for the given asset.
 *
 * Flow:
 *  1. Write the asset image data to a temp input file.
 *  2. Spawn the Python editor and wait for Apply/close result.
 *  3. Read the saved output file back as a data URL.
 *  4. Generate canvas-ready preview + thumbnail.
 *  5. Return an updated Asset.
 */
export async function openImageEditorForAsset(asset: Asset): Promise<Asset | null> {
  if (!isImageEditorAvailable()) return null;

  const sourceDataUrl =
    asset.originalPath ??
    asset.previewPath ??
    asset.thumbnailPath;

  if (!sourceDataUrl) return null;

  const ext = extFromMimeOrDataUrl(asset.mimeType, sourceDataUrl);

  const inputPath = await window.spp.writeTempImage(sourceDataUrl, ext);
  const outputPath = inputPath.replace(new RegExp(`\\.${ext}$`), `_edited.${ext}`);

  const result = await window.spp.openImageEditor(inputPath, outputPath);
  if (!result.success) return null;

  let base64: string;

  try {
    base64 = await window.spp.readFileBase64(outputPath);
  } catch {
    return null;
  }

  const mimeType = mimeFromExt(ext);
  const editedDataUrl = `data:${mimeType};base64,${base64}`;

  const { previewPath, thumbnailPath } = await createAssetPreviews(
    editedDataUrl,
    1600,
    280
  );

  return {
    ...asset,
    originalPath: editedDataUrl,
    previewPath,
    thumbnailPath,
    metadata: {
      ...asset.metadata,

      // Critical fix:
      // After using the full Python editor, the edited pixels become the new
      // clean base for future quick sliders. Without this, quick sliders may
      // use the older editBaseUrl and erase the full-editor changes.
      editBaseUrl: editedDataUrl,

      // Reset quick slider params because the full-editor result is already baked.
      imageEditParams: {} as import("@/types/primitives").JsonValue,

      lastEditedAt: new Date().toISOString()
    }
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extFromMimeOrDataUrl(mimeType: string | undefined, dataUrl: string): string {
  if (mimeType?.includes("png")) return "png";
  if (mimeType?.includes("webp")) return "webp";
  if (mimeType?.includes("tiff") || mimeType?.includes("tif")) return "tiff";

  if (dataUrl.startsWith("data:image/png")) return "png";
  if (dataUrl.startsWith("data:image/webp")) return "webp";
  if (dataUrl.startsWith("data:image/tiff")) return "tiff";

  return "jpg";
}

function mimeFromExt(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "tiff" || ext === "tif") return "image/tiff";
  return "image/jpeg";
}
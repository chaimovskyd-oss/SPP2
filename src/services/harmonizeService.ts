import { createAssetPreviews } from "@/core/assets/assetManager";
import type { Asset } from "@/types/document";
import type Konva from "konva";

export interface HarmonizeOptions {
  strength: number;
  matchBrightness: boolean;
  matchContrast: boolean;
  matchSaturation: boolean;
  matchTemperature: boolean;
  mode: "algorithm" | "neural";
  // Contact shadow
  addShadow: boolean;
  shadowStrength: number;
  shadowSoftness: number;
  shadowDistance: number;
  shadowDirection: number;
  localSampleMargin?: number;
  maxBrightnessShift?: number;
  maxContrastShift?: number;
  maxSaturationShift?: number;
  maxTemperatureShift?: number;
}

export interface HarmonizePreviewResult {
  previewDataUrl: string;
  diagnostics: {
    brightnessAdj: number;
    saturationAdj: number;
    tempAdj: number;
    contrastAdj: number;
  };
  mode?: "algorithm" | "neural" | "passthrough";
  shadowDataUrl?: string;
}

export function isHarmonizeAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.spp?.harmonizeLayer === "function";
}

/**
 * Capture the canvas content without the target layer (hide it temporarily,
 * export the stage, then restore visibility).
 */
export async function buildBackgroundDataUrl(
  stage: Konva.Stage,
  hiddenLayerId: string
): Promise<string> {
  const targetNodes = stage.find(`#${hiddenLayerId}`);
  const previousVisibility: boolean[] = targetNodes.map((n) => n.visible());

  targetNodes.forEach((n) => n.visible(false));
  const dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
  targetNodes.forEach((n, i) => n.visible(previousVisibility[i]));

  return dataUrl;
}

/**
 * Run harmonize preview: exports layer + background PNGs to temp files,
 * calls Python (which optionally generates a contact shadow PNG too),
 * returns preview data URL + diagnostics + optional shadow data URL.
 */
export async function runHarmonizePreview(
  asset: Asset,
  bbox: { x: number; y: number; w: number; h: number },
  stage: Konva.Stage,
  hiddenLayerId: string,
  options: HarmonizeOptions
): Promise<HarmonizePreviewResult | null> {
  if (!isHarmonizeAvailable()) return null;

  const sourceDataUrl =
    asset.originalPath ?? asset.previewPath ?? asset.thumbnailPath;
  if (!sourceDataUrl) return null;

  const layerPath = await window.spp.writeTempImage(sourceDataUrl, "png");
  const outputPath = layerPath.replace(/\.png$/, "_harmonized.png");

  const bgDataUrl = await buildBackgroundDataUrl(stage, hiddenLayerId);
  const bgPath = await window.spp.writeTempImage(bgDataUrl, "png");

  // Derive shadow output path – included only when shadow is requested
  const shadowOutputPath = options.addShadow
    ? layerPath.replace(/\.png$/, `_shadow_${Date.now()}.png`)
    : undefined;

  // Build Python options (shadow path is a runtime detail, not a user option)
  const pythonOptions = {
    maxBrightnessShift: 0.14,
    maxContrastShift: 0.12,
    maxSaturationShift: 0.18,
    maxTemperatureShift: 0.08,
    localSampleMargin: Math.round(Math.max(40, Math.min(140, Math.max(bbox.w, bbox.h) * 0.18))),
    ...options,
    strength: Math.max(0, Math.min(options.strength, 0.7)),
    ...(shadowOutputPath !== undefined ? { shadowOutputPath } : {}),
  };

  const result = await window.spp.harmonizeLayer!(
    layerPath,
    bgPath,
    JSON.stringify(bbox),
    JSON.stringify(pythonOptions),
    outputPath
  );

  if (!result.ok) return null;

  const base64 = await window.spp.readFileBase64(outputPath);
  const previewDataUrl = `data:image/png;base64,${base64}`;

  // Read shadow result if it was generated successfully
  let shadowDataUrl: string | undefined;
  if (options.addShadow && shadowOutputPath && result.shadow?.ok) {
    try {
      const shadowBase64 = await window.spp.readFileBase64(shadowOutputPath);
      shadowDataUrl = `data:image/png;base64,${shadowBase64}`;
    } catch {
      // Shadow generation failed silently – harmonize result still usable
    }
  }

  return {
    previewDataUrl,
    diagnostics: result.diagnostics ?? {
      brightnessAdj: 0,
      saturationAdj: 0,
      tempAdj: 0,
      contrastAdj: 1.0,
    },
    mode: result.mode,
    shadowDataUrl,
  };
}

/**
 * Apply harmonized image to asset: create new asset with updated previews.
 */
export async function applyHarmonize(
  previewDataUrl: string,
  originalAsset: Asset
): Promise<Asset> {
  const { previewPath, thumbnailPath } = await createAssetPreviews(
    previewDataUrl,
    1600,
    280
  );

  return {
    ...originalAsset,
    originalPath: previewDataUrl,
    previewPath,
    thumbnailPath,
    metadata: {
      ...originalAsset.metadata,
      editBaseUrl: previewDataUrl,
      lastEditedAt: new Date().toISOString(),
    },
  };
}

/**
 * Build a shadow Asset from a shadow data URL.
 * The shadow is a semi-transparent black PNG the same size as the source layer.
 */
export function buildShadowAsset(shadowDataUrl: string, layerName: string): Asset {
  return {
    id: crypto.randomUUID(),
    version: 1,
    name: `Contact Shadow - ${layerName}`,
    kind: "image",
    mimeType: "image/png",
    originalPath: shadowDataUrl,
    previewPath: shadowDataUrl,
    metadata: { createdAt: new Date().toISOString() },
  };
}

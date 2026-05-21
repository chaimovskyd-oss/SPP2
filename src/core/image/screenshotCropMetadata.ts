import type { Asset } from "@/types/document";
import type { CropRect, JsonValue } from "@/types/primitives";
import type { ScreenshotCropAnalysis } from "./screenshotCropDetector";

export interface AppliedScreenshotCropMetadata {
  applied: true;
  originalWidth: number;
  originalHeight: number;
  cropRect: CropRect;
  confidence: number;
  reasons: string[];
  createdAt: string;
}

export interface ScreenshotCropSuggestionMetadata extends ScreenshotCropAnalysis {
  originalWidth: number;
  originalHeight: number;
}

export function isScreenshotCropSuggestion(value: unknown): value is ScreenshotCropSuggestionMetadata {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ScreenshotCropSuggestionMetadata>;
  return candidate.isSuspicious === true && isCropRect(candidate.cropRect);
}

export function getScreenshotCropSuggestion(asset: Asset | undefined): ScreenshotCropSuggestionMetadata | null {
  const value = asset?.metadata["screenshotCropSuggestion"];
  return isScreenshotCropSuggestion(value) ? value : null;
}

export function getAppliedScreenshotCrop(asset: Asset | undefined): AppliedScreenshotCropMetadata | null {
  const value = asset?.metadata["screenshotCrop"];
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<AppliedScreenshotCropMetadata>;
  if (candidate.applied !== true || !isCropRect(candidate.cropRect)) return null;
  return candidate as AppliedScreenshotCropMetadata;
}

export function getEffectiveAssetCrop(asset: Asset | undefined): CropRect | null {
  const applied = getAppliedScreenshotCrop(asset);
  if (applied === null) return null;
  return applied.cropRect;
}

export function getEffectiveSourceSize(asset: Asset | undefined, fallbackWidth: number, fallbackHeight: number): { width: number; height: number } {
  const crop = getEffectiveAssetCrop(asset);
  if (crop === null) return { width: fallbackWidth, height: fallbackHeight };
  return { width: Math.max(1, crop.width), height: Math.max(1, crop.height) };
}

export function combineAssetAndLayerCrop(assetCrop: CropRect | null, layerCrop: CropRect, sourceWidth: number, sourceHeight: number): CropRect {
  const base = assetCrop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  return {
    x: base.x + layerCrop.x * base.width,
    y: base.y + layerCrop.y * base.height,
    width: layerCrop.width * base.width,
    height: layerCrop.height * base.height
  };
}

export function applyScreenshotCropToAsset(asset: Asset, analysis: ScreenshotCropAnalysis | ScreenshotCropSuggestionMetadata): Asset {
  if (analysis.cropRect === null) return asset;
  const originalWidth = asset.width ?? ("originalWidth" in analysis ? analysis.originalWidth : analysis.cropRect.width);
  const originalHeight = asset.height ?? ("originalHeight" in analysis ? analysis.originalHeight : analysis.cropRect.height);
  return {
    ...asset,
    metadata: {
      ...asset.metadata,
      screenshotCrop: {
        applied: true,
        originalWidth,
        originalHeight,
        cropRect: analysis.cropRect,
        confidence: analysis.confidence,
        reasons: analysis.reasons,
        createdAt: new Date().toISOString()
      } as unknown as JsonValue,
      screenshotCropSuggestion: analysis as unknown as JsonValue
    }
  };
}

export function ignoreScreenshotCropForAsset(asset: Asset): Asset {
  return {
    ...asset,
    metadata: {
      ...asset.metadata,
      screenshotCropIgnoredAt: new Date().toISOString()
    }
  };
}

export function resetScreenshotCropForAsset(asset: Asset): Asset {
  const metadata = { ...asset.metadata };
  delete metadata["screenshotCrop"];
  delete metadata["screenshotCropIgnoredAt"];
  return { ...asset, metadata };
}

function isCropRect(value: unknown): value is CropRect {
  if (typeof value !== "object" || value === null) return false;
  const rect = value as Partial<CropRect>;
  return Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.width) && Number.isFinite(rect.height);
}

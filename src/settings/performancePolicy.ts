import type { Page } from "@/types/document";
import type { PerformanceSettings } from "./types";

export interface EffectivePerformanceSettings extends PerformanceSettings {
  effectivePreviewQuality: PerformanceSettings["previewQuality"];
  effectiveMaxPreviewSizePx: number;
  reduceEffectsDuringInteraction: boolean;
}

export interface ExportRenderOptions {
  renderQuality: PerformanceSettings["renderQuality"];
  jpgQuality?: number;
  /** Optional cap on the exported long-side in pixels (used by the "compact" PDF preset). */
  maxLongSidePx?: number;
}

export type PdfQualityPreset = "high" | "balanced" | "compact";

export interface PdfExportProfile {
  mimeType: "image/jpeg";
  /** 0..1 JPEG quality passed to canvas/offscreen export. */
  jpgQuality: number;
  /** Optional long-side cap to downscale heavy pages. */
  maxLongSidePx?: number;
}

/**
 * Map a user-facing PDF quality preset to concrete render settings.
 * All presets embed JPEG (instead of uncompressed PNG) which is the main
 * file-size win; lower presets additionally trade quality / resolution.
 */
export function resolvePdfExportProfile(preset: PdfQualityPreset): PdfExportProfile {
  switch (preset) {
    case "high":
      return { mimeType: "image/jpeg", jpgQuality: 0.95 };
    case "compact":
      return { mimeType: "image/jpeg", jpgQuality: 0.75, maxLongSidePx: 1654 };
    case "balanced":
    default:
      return { mimeType: "image/jpeg", jpgQuality: 0.85 };
  }
}

const PREVIEW_MAX_SIDE_BY_QUALITY: Record<PerformanceSettings["previewQuality"], number> = {
  low: 1024,
  medium: 2048,
  high: 4096
};

const MAX_EXPORT_PIXELS = 48_000_000;

export function resolveEffectivePerformanceSettings(settings: PerformanceSettings): EffectivePerformanceSettings {
  if (!settings.performanceMode) {
    return {
      ...settings,
      effectivePreviewQuality: settings.previewQuality,
      effectiveMaxPreviewSizePx: getPreviewMaxSide(settings),
      reduceEffectsDuringInteraction: settings.lowResWhileDragging
    };
  }

  return {
    ...settings,
    effectivePreviewQuality: settings.previewQuality === "high" ? "medium" : settings.previewQuality,
    effectiveMaxPreviewSizePx: Math.min(getPreviewMaxSide(settings), 2048),
    lowResWhileDragging: true,
    reduceEffectsDuringInteraction: true
  };
}

export function getPreviewMaxSide(settings: PerformanceSettings): number {
  const qualityLimit = PREVIEW_MAX_SIDE_BY_QUALITY[settings.previewQuality];
  const explicitLimit = Number.isFinite(settings.maxPreviewSizePx) ? settings.maxPreviewSizePx : qualityLimit;
  return Math.max(256, Math.min(qualityLimit, explicitLimit));
}

export function getImportPreviewMaxSide(settings: PerformanceSettings): number {
  return resolveEffectivePerformanceSettings(settings).effectiveMaxPreviewSizePx;
}

export function getExportPixelRatio(page: Page, settings: PerformanceSettings, maxLongSidePx?: number): number {
  const baseRatio =
    settings.renderQuality === "standard" ? 1 :
    settings.renderQuality === "high" ? 2 :
    1;
  const pixelsAtRatio = page.width * page.height * baseRatio * baseRatio;
  const ratio = pixelsAtRatio <= MAX_EXPORT_PIXELS
    ? baseRatio
    : Math.max(1, Math.sqrt(MAX_EXPORT_PIXELS / Math.max(1, page.width * page.height)));
  // Optional downscale: keep the exported long side within maxLongSidePx (compact PDF).
  if (maxLongSidePx !== undefined && maxLongSidePx > 0) {
    const longSide = Math.max(page.width, page.height);
    if (longSide * ratio > maxLongSidePx) {
      return Math.max(0.1, maxLongSidePx / longSide);
    }
  }
  return ratio;
}

export function getJpegQuality(jpgQualityPercent: number | undefined): number {
  if (jpgQualityPercent === undefined || !Number.isFinite(jpgQualityPercent)) {
    return 0.9;
  }
  return Math.min(1, Math.max(0.1, jpgQualityPercent / 100));
}

export function createExportRenderOptions(
  performance: PerformanceSettings,
  jpgQualityPercent?: number
): ExportRenderOptions {
  return {
    renderQuality: performance.renderQuality,
    jpgQuality: getJpegQuality(jpgQualityPercent)
  };
}

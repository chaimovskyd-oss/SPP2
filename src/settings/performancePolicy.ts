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

export function getExportPixelRatio(page: Page, settings: PerformanceSettings): number {
  const baseRatio =
    settings.renderQuality === "standard" ? 1 :
    settings.renderQuality === "high" ? 2 :
    1;
  const pixelsAtRatio = page.width * page.height * baseRatio * baseRatio;
  if (pixelsAtRatio <= MAX_EXPORT_PIXELS) {
    return baseRatio;
  }
  return Math.max(1, Math.sqrt(MAX_EXPORT_PIXELS / Math.max(1, page.width * page.height)));
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

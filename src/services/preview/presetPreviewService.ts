/**
 * Preset preview service.
 *
 * Provides a FAST, low-resolution before/after simulation for the Preset
 * Library — without ever touching document state, the real ImageLayer, undo
 * history, or the Konva canvas. The flow:
 *   1. `loadPreviewBitmap(src, maxSize)` decodes the image once and downscales
 *      it to a small ImageData (cached while the library stays open).
 *   2. `renderPresetPreviewData(base, adjustments)` clones that small buffer and
 *      runs the SAME pure pixel pipeline used for live + export
 *      (`applyImageAdjustmentStack`), so the preview matches the real result.
 *
 * The core is DOM-free and unit-testable; the bitmap loader is browser-only and
 * fails soft (returns null) so callers degrade to "no preview" gracefully.
 */

import { applyImageAdjustmentStack } from "@/core/rendering/imageAdjustmentPipeline";
import { instantiatePresetAdjustments, getPreset } from "@/core/presets/smartPresets";
import { fineTuneTemplates, type PresetFineTune } from "@/core/presets/customPresets";
import { createImageAdjustment, type ImageAdjustment } from "@/types/imageAdjustments";

/** Minimal ImageData shape the pipeline reads — keeps the core DOM-free. */
export interface PreviewBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Default long-edge size for preview bitmaps — small enough to stay snappy. */
export const DEFAULT_PREVIEW_MAX_SIZE = 640;

// ─── Pure core (testable in node) ─────────────────────────────────────────────

/**
 * Apply a preset's recipe to a copy of the base preview buffer. Pure: never
 * mutates `base`. Returns a fresh buffer with the adjustments baked in.
 */
export function renderPresetPreviewData(base: PreviewBuffer, adjustments: ImageAdjustment[]): PreviewBuffer {
  const data = new Uint8ClampedArray(base.data);
  const out: PreviewBuffer = { data, width: base.width, height: base.height };
  // applyImageAdjustmentStack only reads .data/.width/.height.
  applyImageAdjustmentStack(out as unknown as ImageData, adjustments);
  return out;
}

/** Resolve the concrete (strength-scaled) adjustments a preset would apply. */
export function presetPreviewAdjustments(presetId: string, strength: number): ImageAdjustment[] {
  const def = getPreset(presetId);
  if (def === undefined) return [];
  return instantiatePresetAdjustments(def, strength);
}

/**
 * Resolve the adjustments a preset would apply at `strength`, plus the live
 * fine-tune offsets layered on top (previewed as extra adjustments, exactly as
 * they'll be appended to the stack on Apply).
 */
export function combinedPreviewAdjustments(
  presetId: string,
  strength: number,
  fineTune: PresetFineTune
): ImageAdjustment[] {
  const base = presetPreviewAdjustments(presetId, strength);
  const extras = fineTuneTemplates(fineTune).map((template) => createImageAdjustment(template));
  return [...base, ...extras];
}

/** Compute the fitted preview dimensions for a source of size w×h. */
export function fitPreviewSize(width: number, height: number, maxSize: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const longEdge = Math.max(width, height);
  if (longEdge <= maxSize) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSize / longEdge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Stable cache key for a loaded preview bitmap. */
export function previewCacheKey(src: string, maxSize: number): string {
  return `${src}|${maxSize}`;
}

// ─── Browser bitmap loader + cache ────────────────────────────────────────────

const BITMAP_CACHE_LIMIT = 16;
const bitmapCache = new Map<string, PreviewBuffer>();

function remember(key: string, value: PreviewBuffer): PreviewBuffer {
  if (bitmapCache.size >= BITMAP_CACHE_LIMIT) {
    const first = bitmapCache.keys().next().value;
    if (first !== undefined) bitmapCache.delete(first);
  }
  bitmapCache.set(key, value);
  return value;
}

/** Drop all cached preview bitmaps (call when the library closes). */
export function clearPreviewBitmapCache(): void {
  bitmapCache.clear();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Decode + downscale `src` into a small ImageData buffer, cached by src+size.
 * Returns null when there is no DOM, the image can't load, or the canvas is
 * tainted (CORS) — callers should then simply show no preview.
 */
export async function loadPreviewBitmap(
  src: string | undefined,
  maxSize: number = DEFAULT_PREVIEW_MAX_SIZE
): Promise<PreviewBuffer | null> {
  if (src === undefined || src.length === 0) return null;
  if (typeof document === "undefined") return null;

  const key = previewCacheKey(src, maxSize);
  const cached = bitmapCache.get(key);
  if (cached !== undefined) return cached;

  const img = await loadImage(src);
  if (img === null) return null;

  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  const { width, height } = fitPreviewSize(natW, natH, maxSize);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return null;

  try {
    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return remember(key, { data: imageData.data, width, height });
  } catch {
    return null; // tainted canvas / draw failure
  }
}

/** Paint a PreviewBuffer into a canvas element (browser only). */
export function paintPreviewBuffer(canvas: HTMLCanvasElement, buffer: PreviewBuffer): void {
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  const imageData = ctx.createImageData(buffer.width, buffer.height);
  imageData.data.set(buffer.data);
  ctx.putImageData(imageData, 0, 0);
}

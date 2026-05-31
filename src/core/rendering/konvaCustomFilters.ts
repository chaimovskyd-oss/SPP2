/**
 * Konva-side adapter for the ImageAdjustment pipeline.
 *
 * A Konva filter has the signature (imageData: ImageData) => void — exactly what
 * the pixel pipeline already provides. Rather than reimplement per-tool math in
 * Konva (which would risk live ≠ export drift), we wrap the SAME pipeline. The
 * heavy spatial tools (sharpness/clarity/noiseReduction) are skipped when the
 * caller requests reduced effects (during drag/zoom) for responsiveness.
 *
 * Per the architecture: NO full-page Group cache. Filters run per-image on the
 * node's own cache (see KonvaLayerNode), so memory stays bounded.
 */

import type { ImageAdjustment } from "@/types/imageAdjustments";
import { applyImageAdjustmentStack, isActiveImageAdjustment } from "@/core/rendering/imageAdjustmentPipeline";

/** Konva filter signature: mutate the supplied ImageData in place. */
export type KonvaImageFilter = (imageData: ImageData) => void;

const HEAVY_TYPES = new Set<ImageAdjustment["type"]>(["detail"]);

export interface AdjustmentFilterOptions {
  /** Master strength multiplier (1 = full). */
  strength?: number;
  /** Drop heavy spatial filters (detail) for responsive drag/zoom. */
  reduceEffects?: boolean;
}

/**
 * Build the Konva filter list for an adjustment stack. Returns a single combined
 * filter so ordering and spatial tools behave identically to export. Returns an
 * empty array when nothing is active (caller can then skip caching the node).
 */
export function buildAdjustmentFilters(
  stack: ImageAdjustment[] | undefined,
  options: AdjustmentFilterOptions = {}
): KonvaImageFilter[] {
  if (stack === undefined || stack.length === 0) return [];
  const strength = options.strength ?? 1;
  const effective = stack.filter((adj) => {
    if (!isActiveImageAdjustment(adj)) return false;
    if (options.reduceEffects === true && HEAVY_TYPES.has(adj.type)) return false;
    return true;
  });
  if (effective.length === 0) return [];
  const filter: KonvaImageFilter = (imageData: ImageData): void => {
    try {
      applyImageAdjustmentStack(imageData, effective, strength);
    } catch {
      // Never blank the image: on failure leave the original pixels untouched.
    }
  };
  return [filter];
}

/** Whether an adjustment stack needs node.cache()/filters at all. */
export function stackNeedsFilters(stack: ImageAdjustment[] | undefined, reduceEffects = false): boolean {
  if (stack === undefined) return false;
  return stack.some((adj) => isActiveImageAdjustment(adj) && !(reduceEffects && HEAVY_TYPES.has(adj.type)));
}

/**
 * Global smart-AI enhancement service (browser glue).
 *
 * Reuses the existing image analysis (`analyzeImageForFixes` — face detection +
 * skin/exposure/white-balance sampling) and turns it into a concrete, GLOBAL
 * adjustment recipe via the pure `buildAutoEnhanceAdjustments`. Fallback-safe:
 * returns an empty recipe when analysis can't run (no DOM, unloadable/tainted
 * image), so the caller simply shows "no suggestion".
 */

import { analyzeImageForFixes } from "@/services/ai/suggestedFixesService";
import { buildAutoEnhanceAdjustments, type AiToolVariant } from "@/core/analysis/autoEnhance";
import type { ImageAdjustmentTemplate } from "@/types/imageAdjustments";

export interface AutoEnhanceResult {
  templates: ImageAdjustmentTemplate[];
  /** true when a real face drove the analysis (vs. saliency/center fallback). */
  hasFace: boolean;
}

/**
 * Analyse the image at `src` and build a tailored global recipe for `variant`.
 * Returns null when analysis couldn't run at all.
 */
export async function analyzeAndBuildEnhance(
  src: string | undefined,
  variant: AiToolVariant
): Promise<AutoEnhanceResult | null> {
  const analysis = await analyzeImageForFixes(src);
  if (analysis === null) return null;
  const templates = buildAutoEnhanceAdjustments(analysis, variant);
  // whiteBalance.source === "skin" only when a face region was sampled.
  const hasFace = analysis.whiteBalance.source === "skin";
  return { templates, hasFace };
}

/**
 * Global "smart AI" enhancement recipes (light pass, builds on שלב 6 analysis).
 *
 * PURE & DOM-free. Given an `ImageAutoAnalysis` (face-aware skin stats + exposure
 * + white balance, produced by analyzeImageForFixes), these builders synthesize a
 * tailored recipe of concrete ImageAdjustment templates applied GLOBALLY to the
 * image. They never fabricate localized masks — that is a separate, larger
 * engine. The output is plain adjustments, so the user can fine-tune or remove
 * each one afterward exactly like any manual tool.
 */

import type { ImageAdjustmentTemplate } from "@/types/imageAdjustments";
import type { ImageAutoAnalysis, WhiteBalanceCast } from "@/core/analysis/imageAutoAnalysis";

export type AiToolVariant = "autoEnhance" | "faceBrighten" | "autoColor";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Temperature/tint correction (−100..100 each) that counteracts a detected cast. */
function whiteBalanceCorrection(cast: WhiteBalanceCast, magnitude: number): { temperature: number; tint: number } {
  // magnitude ~0..0.25; scale to a gentle correction strength.
  const amt = clamp(magnitude * 320, 0, 60);
  switch (cast) {
    case "yellow": // warm light → cool it down
      return { temperature: -amt, tint: 0 };
    case "red": // reddish/pink skin → cool + push toward green
      return { temperature: -amt * 0.6, tint: -amt * 0.6 };
    case "blue": // cold cast → warm it up
      return { temperature: amt, tint: 0 };
    case "green": // fluorescent/foliage → push toward magenta
      return { temperature: 0, tint: amt };
    default:
      return { temperature: 0, tint: 0 };
  }
}

/**
 * Build a global enhancement recipe from the analysis. Only emits templates that
 * actually do something (skips neutral ones), so an already-balanced image yields
 * a short, gentle recipe.
 */
export function buildAutoEnhanceAdjustments(
  analysis: ImageAutoAnalysis,
  variant: AiToolVariant
): ImageAdjustmentTemplate[] {
  const templates: ImageAdjustmentTemplate[] = [];
  const { exposure, whiteBalance } = analysis;

  // ── Exposure / tone ──
  const tone: Partial<{ brightness: number; contrast: number }> = {};
  const hs: Partial<{ highlights: number; shadows: number; whites: number; blacks: number }> = {};

  // Only brighten when exposure analysis actually found underexposure/backlight.
  // Flat but well-exposed images should get contrast/detail suggestions instead.
  const shouldLiftExposure = exposure.verdict === "dark" || exposure.verdict === "backlit" || exposure.meanLuma < 0.3;
  const lumaDeficit = shouldLiftExposure ? clamp(0.5 - exposure.meanLuma, 0, 0.4) : 0;

  if (variant === "faceBrighten") {
    // Prioritise lifting the subject: stronger brightness + shadow lift, gentle on the rest.
    if (lumaDeficit > 0.02) tone.brightness = round(clamp(lumaDeficit * 130, 0, 45));
    if (exposure.shadowClip > 0.04 || lumaDeficit > 0.05) hs.shadows = round(clamp(lumaDeficit * 150 + exposure.shadowClip * 80, 0, 55));
    if (exposure.highlightClip > 0.14) hs.highlights = round(-clamp(exposure.highlightClip * 120, 0, 40));
  } else {
    // autoEnhance / autoColor: balanced correction.
    if (lumaDeficit > 0.06) tone.brightness = round(clamp(lumaDeficit * 75, 0, 26));
    else if (exposure.meanLuma > 0.74 && exposure.highlightClip > 0.12) tone.brightness = round(-clamp((exposure.meanLuma - 0.74) * 120, 0, 22));

    if (variant === "autoEnhance") {
      if (exposure.contrast < 0.13) tone.contrast = round(clamp((0.13 - exposure.contrast) * 220, 0, 28));
      if (shouldLiftExposure && exposure.shadowClip > 0.08) hs.shadows = round(clamp(exposure.shadowClip * 90, 0, 40));
      if (exposure.highlightClip > 0.12) hs.highlights = round(-clamp(exposure.highlightClip * 110, 0, 38));
    }
  }

  if (Object.keys(tone).length > 0) templates.push({ type: "basicTone", ...tone });
  if (variant !== "autoColor" && Object.keys(hs).length > 0) templates.push({ type: "highlightsShadows", ...hs });

  // ── Colour: white-balance correction + gentle vibrance ──
  const color: Partial<{ vibrance: number; saturation: number; temperature: number; tint: number }> = {};
  const wb = whiteBalanceCorrection(whiteBalance.cast, whiteBalance.magnitude);
  if (Math.abs(wb.temperature) >= 1) color.temperature = round(wb.temperature);
  if (Math.abs(wb.tint) >= 1) color.tint = round(wb.tint);

  if (variant !== "autoColor") {
    // Add vibrance when the image is a little flat in saturation.
    if (whiteBalance.source !== undefined && analysis.exposure.contrast >= 0) {
      const vib = variant === "faceBrighten" ? 10 : 14;
      color.vibrance = vib;
    }
  } else {
    color.vibrance = 10;
  }

  if (Object.keys(color).length > 0) templates.push({ type: "color", ...color });

  // ── Detail: a touch of clarity for autoEnhance (not for face-only brighten) ──
  if (variant === "autoEnhance" && exposure.contrast < 0.16) {
    templates.push({ type: "detail", clarity: 12, sharpness: 8 });
  }

  return templates;
}

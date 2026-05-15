/**
 * Unified color-adjustment → Konva-filter conversion.
 *
 * All rendering paths (free ImageLayer, FrameLayer in collage/grid/mask)
 * use these utilities so the visual result is identical regardless of mode.
 */
import type { ColorAdjustments } from "@/types/layers";

// ─── Shared output format ─────────────────────────────────────────────────────

export interface KonvaColorParams {
  /** Whether node.cache() is required (true when any filter is active). */
  needsCache: boolean;
  /** Konva.Filters.Brighten: -1..1 (0 = neutral) */
  brightness: number;
  /** Konva.Filters.Contrast: roughly -50..50 (0 = neutral) */
  contrast: number;
  /** Konva.Filters.HSL saturation: 0..2 (1 = neutral, 0 = gray) */
  saturation: number;
  /** Konva.Filters.HSL hue: degrees (-180..180) */
  hue: number;
  /** Konva.Filters.Grayscale: true = apply full desaturation */
  grayscale: boolean;
  /** Whether any non-identity filter is active */
  hasAny: boolean;
}

const NEUTRAL: KonvaColorParams = {
  needsCache: false,
  brightness: 0,
  contrast: 0,
  saturation: 1,
  hue: 0,
  grayscale: false,
  hasAny: false,
};

// ─── Free ImageLayer format → Konva ──────────────────────────────────────────
// Storage: ColorAdjustments { brightness, contrast, saturation, temperature, tint } (delta, -100..100)
// Extended metadata["imageEditParams"]: { exposure, highlights, shadows, vibrance, clarity, sharpen, blur, … }

export function imageLayerAdjToKonva(
  adj: ColorAdjustments,
  extras?: Record<string, number>
): KonvaColorParams {
  const exposure = extras?.["exposure"] ?? 0;

  // ×0.5 sensitivity: slider ±100 → Konva ±0.5 (feels natural, not over-aggressive)
  const brightness = (adj.brightness + exposure) / 200;
  const contrast = adj.contrast / 2;
  // saturation: 1 = neutral, slider 0 → 1.0, slider ±100 → 0.75/1.25
  const saturation = 1 + adj.saturation / 200;
  // temperature (warm/cool) and tint approximated via small hue rotation
  const hue = adj.temperature * 0.075 + adj.tint * -0.05;

  const hasAny =
    adj.brightness !== 0 || exposure !== 0 ||
    adj.contrast !== 0 ||
    adj.saturation !== 0 ||
    adj.temperature !== 0 || adj.tint !== 0;

  return { needsCache: hasAny, brightness, contrast, saturation, hue, grayscale: false, hasAny };
}

// ─── Collage ImageAssignment format → Konva ───────────────────────────────────
// Storage: CollageImageAssignment.colorAdjustments (multiplier, 1=neutral)
//   brightness:  0.2..2
//   contrast:    0.2..2
//   saturation:  0..2
//   exposureEV:  -3..3 (stops)
//   isBlackAndWhite: boolean

export interface CollageColorAdj {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  isBlackAndWhite: boolean;
  exposureEV: number;
  vignette: number;
}

export function collageAdjToKonva(adj: CollageColorAdj, extras?: Record<string, number>): KonvaColorParams {
  // Base: convert multiplier to Konva additive values
  const brightnessBase = (adj.brightness - 1) * 0.7;
  const brightnessEV = adj.exposureEV * 0.12;
  // extras.exposure is a delta (-100..100), same scale as ImageStudio
  const extrasExposure = (extras?.["exposure"] ?? 0) / 200;
  const brightness = brightnessBase + brightnessEV + extrasExposure;

  const contrast = (adj.contrast - 1) * 40 + (extras?.["contrast"] ?? 0) / 2;
  const saturation = adj.isBlackAndWhite ? 0 : (adj.saturation + (extras?.["saturation"] ?? 0) / 200);

  const isNeutral =
    adj.brightness === 1 && adj.contrast === 1 && adj.saturation === 1 &&
    adj.exposureEV === 0 && !adj.isBlackAndWhite &&
    (!extras || Object.values(extras).every((v) => v === 0));

  return {
    needsCache: !isNeutral,
    brightness,
    contrast,
    saturation,
    hue: 0,
    grayscale: adj.isBlackAndWhite,
    hasAny: !isNeutral,
  };
}

export { NEUTRAL as KONVA_COLOR_NEUTRAL };

/**
 * Unified color-adjustment → Konva-filter conversion.
 *
 * All rendering paths (free ImageLayer, FrameLayer in collage/grid/mask)
 * use these utilities so the visual result is identical regardless of mode.
 */
import type { ColorAdjustments, ImageLayerEffects } from "@/types/layers";

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

// ─── ImageLayerEffects → Konva ────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface KonvaEffectsShadow {
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  shadowOpacity: number;
  shadowEnabled: boolean;
}

export interface KonvaEffectsOutline {
  stroke: string;
  strokeWidth: number;
  strokeEnabled: boolean;
}

// ─── Extra quick effects (sepia, invert, threshold, posterize, luminance,
//     remove_white, color_pop) — used by both ImageLayer.effects and
//     FrameLayer metadata.imageEditParams. ────────────────────────────────────

export interface ExtraQuickEffects {
  sepia: boolean;
  invert: boolean;
  /** Konva.Filters.Threshold attribute — 0..1, 0 = off */
  threshold: number;
  /** Konva.Filters.Posterize "levels" attribute — 0..1, 0 = off, lower = stronger */
  posterize: number;
  /** Konva.Filters.HSL "luminance" attribute — -1..1, 0 = neutral */
  luminance: number;
  /** Remove near-white pixels (alpha = 0). null = off. */
  removeWhite: { tolerance: number } | null;
  /** Desaturate everything except a target colour. null = off. */
  colorPop: {
    color: [number, number, number];
    tolerance: number;
    /** 0..1 — how strongly to desaturate non-matching pixels */
    background: number;
  } | null;
  hasAny: boolean;
}

const EMPTY_EXTRAS: ExtraQuickEffects = {
  sepia: false,
  invert: false,
  threshold: 0,
  posterize: 0,
  luminance: 0,
  removeWhite: null,
  colorPop: null,
  hasAny: false
};

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [255, 0, 0];
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function extractExtraQuickEffects(
  src: Record<string, unknown> | null | undefined
): ExtraQuickEffects {
  if (src === null || src === undefined) return EMPTY_EXTRAS;

  const num = (k: string, d = 0): number => {
    const v = src[k];
    return typeof v === "number" && Number.isFinite(v) ? v : d;
  };
  const bool = (k: string): boolean => src[k] === true;
  const str = (k: string, d: string): string => {
    const v = src[k];
    return typeof v === "string" ? v : d;
  };

  const sepia = bool("sepia");
  const invert = bool("invert");

  const thresholdRaw = num("threshold");
  const threshold = thresholdRaw > 0 ? clamp(thresholdRaw / 100, 0, 1) : 0;

  const posterizeRaw = num("posterize");
  // UI 1 (subtle) → 0.86 levels, UI 6 (strong) → 0.14 levels
  const posterize = posterizeRaw > 0 ? clamp((7 - posterizeRaw) / 7, 0.05, 1) : 0;

  const luminanceRaw = num("luminance");
  const luminance = clamp(luminanceRaw / 50, -0.6, 0.6);

  const removeWhite = bool("remove_white")
    ? { tolerance: clamp(num("remove_white_tolerance", 22) * 2.55, 5, 200) }
    : null;

  const colorPop = bool("color_pop")
    ? {
        color: hexToRgb(str("color_pop_color", "#ff0000")),
        tolerance: clamp(num("color_pop_tolerance", 28) * 2.55, 5, 255),
        background: clamp(num("color_pop_background", 100) / 100, 0, 1)
      }
    : null;

  const hasAny =
    sepia ||
    invert ||
    threshold > 0 ||
    posterize > 0 ||
    Math.abs(luminance) > 0.001 ||
    removeWhite !== null ||
    colorPop !== null;

  return { sepia, invert, threshold, posterize, luminance, removeWhite, colorPop, hasAny };
}

export { EMPTY_EXTRAS as EMPTY_EXTRA_QUICK_EFFECTS };

export interface ImageEffectsKonva extends KonvaColorParams {
  blurRadius: number;
  shadow: KonvaEffectsShadow | null;
  outline: KonvaEffectsOutline | null;
  extras: ExtraQuickEffects;
}

export function imageEffectsToKonva(effects: ImageLayerEffects): ImageEffectsKonva {
  const brightness = clamp(effects.exposure / 175 + effects.brightness / 220, -0.55, 0.55);
  const contrast = clamp(effects.contrast, -55, 55);
  const saturation = clamp(1 + effects.saturation / 200, 0.6, 1.6);
  const hue = clamp(effects.hue, -60, 60);
  const grayscale = effects.grayscale;
  const blurRadius = clamp(effects.blur, 0, 8);

  const extras = extractExtraQuickEffects(effects as unknown as Record<string, unknown>);

  const hasAny =
    Math.abs(brightness) > 0.001 ||
    Math.abs(contrast) > 0.001 ||
    Math.abs(saturation - 1) > 0.001 ||
    Math.abs(hue) > 0.001 ||
    grayscale ||
    blurRadius > 0 ||
    extras.hasAny;

  const shadow =
    effects.shadow !== null && effects.shadow.enabled
      ? {
          shadowColor: effects.shadow.color,
          shadowOffsetX: effects.shadow.offsetX,
          shadowOffsetY: effects.shadow.offsetY,
          shadowBlur: effects.shadow.blur,
          shadowOpacity: effects.shadow.opacity,
          shadowEnabled: true
        }
      : null;

  const outline =
    effects.outline !== null && effects.outline.enabled
      ? {
          stroke: effects.outline.color,
          strokeWidth: effects.outline.width,
          strokeEnabled: true
        }
      : null;

  return { needsCache: hasAny, brightness, contrast, saturation, hue, grayscale, hasAny, blurRadius, shadow, outline, extras };
}

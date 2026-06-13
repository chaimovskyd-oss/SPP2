/**
 * Auto Fix engine — Photoshop-style Auto / Curves, NO generative AI.
 *
 * Pure & DOM-free. Given a downsampled RGBA buffer (and an optional skin region
 * from face detection) it:
 *   1. Builds a luma histogram and finds safe black/white points via PERCENTILE
 *      clipping (never absolute min/max), plus per-channel gray-world means.
 *   2. Derives a conservative full-strength correction (exposure, contrast,
 *      highlights, shadows, temperature, tint, vibrance, saturation, sharpen),
 *      each clamped to a natural, print-friendly range.
 *   3. Blends that correction against the original by an intensity slider and a
 *      set of feature toggles, emitting plain ImageAdjustmentTemplates so the
 *      result is non-destructive and individually editable afterwards.
 *
 * The browser/service layer (autoFixService) samples pixels and calls these.
 */

import type { ImageAdjustmentTemplate } from "@/types/imageAdjustments";
import type { NormRect } from "@/core/analysis/imageAutoAnalysis";

/** Current algorithm version — bump when the math changes meaningfully. */
export const AUTO_FIX_VERSION = 1;

const REC709 = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

/** Percentile clip points (fractions of total pixels). */
const BLACK_CLIP = 0.004; // 0.4% — inside the requested 0.2–0.5% range
const WHITE_CLIP = 0.996; // 99.6% — inside the requested 99.5–99.8% range

/** A natural midtone target the auto-exposure pass nudges the median toward. */
const MIDTONE_TARGET = 0.46;

/** Safe natural output ranges (matches the spec; values in adjustment-param units). */
export const AUTO_FIX_LIMITS = {
  exposure: { min: -0.25, max: 0.35 }, // stops
  contrast: { min: -5, max: 18 },
  highlights: { min: -20, max: 10 },
  shadows: { min: -5, max: 20 },
  temperature: { min: -18, max: 18 },
  tint: { min: -12, max: 12 },
  vibrance: { min: 0, max: 12 },
  saturation: { min: -4, max: 6 },
  sharpen: { min: 0, max: 8 }
} as const;

export interface AutoFixToggles {
  lighting: boolean;
  color: boolean;
  contrast: boolean;
  skinProtection: boolean;
  sharpen: boolean;
}

export const DEFAULT_AUTO_FIX_TOGGLES: AutoFixToggles = {
  lighting: true,
  color: true,
  contrast: true,
  skinProtection: true,
  sharpen: true
};

export interface AutoFixStats {
  /** percentile black point luma (0..1). */
  blackPoint: number;
  /** percentile white point luma (0..1). */
  whitePoint: number;
  medianLuma: number;
  meanLuma: number;
  /** whitePoint − blackPoint; small = flat/low-contrast. */
  spread: number;
  meanR: number;
  meanG: number;
  meanB: number;
  /** mean HSV saturation 0..1. */
  saturation: number;
  /** fraction of pixels with luma < 0.06. */
  shadowClip: number;
  /** fraction of pixels with luma > 0.94. */
  highlightClip: number;
  /** skin-region stats when a face was sampled (drives white balance & protection). */
  skin: {
    meanR: number;
    meanG: number;
    meanB: number;
    meanLuma: number;
    saturation: number;
  } | null;
  hasFace: boolean;
  /** true for screenshots / line-art / text — suppresses sharpen & saturation. */
  isLikelyGraphic: boolean;
  sampleCount: number;
}

/** Full-strength (intensity = 1) correction, already clamped to safe limits. */
export interface AutoFixCorrection {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  sharpen: number;
  /** Skin guard factors, applied at blend time only when skinProtection is on. */
  skinGuard: { colorScale: number; vibranceScale: number; saturationCap: number };
}

export interface AutoFixResult {
  stats: AutoFixStats;
  correction: AutoFixCorrection;
  /** false when nothing meaningful can be improved (toast "could not improve"). */
  improved: boolean;
}

export interface AutoFixBlendOptions {
  /** 0..1 — 0 = original, 1 = full calculated correction. */
  intensity: number;
  toggles: AutoFixToggles;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── Histogram / stats ────────────────────────────────────────────────────────

/**
 * Compute Auto Fix statistics over an RGBA buffer. Pure. `skinRegion` is in
 * normalized 0..1 coords (from face detection); when present its pixels are
 * aggregated separately for white-balance and skin protection.
 */
export function computeAutoFixStats(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: { skinRegion?: NormRect | null; hasFace?: boolean }
): AutoFixStats {
  const hist = new Float64Array(256);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLuma = 0;
  let sumSat = 0;
  let shadow = 0;
  let highlight = 0;
  let count = 0;

  const skinRegion = options?.skinRegion ?? null;
  const sx0 = skinRegion ? Math.max(0, Math.floor(skinRegion.x * width)) : 0;
  const sy0 = skinRegion ? Math.max(0, Math.floor(skinRegion.y * height)) : 0;
  const sx1 = skinRegion ? Math.min(width, Math.ceil((skinRegion.x + skinRegion.width) * width)) : 0;
  const sy1 = skinRegion ? Math.min(height, Math.ceil((skinRegion.y + skinRegion.height) * height)) : 0;
  let skR = 0;
  let skG = 0;
  let skB = 0;
  let skL = 0;
  let skS = 0;
  let skCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] ?? 255;
      if (a < 8) continue; // ignore (near-)transparent pixels
      const r = (rgba[i] ?? 0) / 255;
      const g = (rgba[i + 1] ?? 0) / 255;
      const b = (rgba[i + 2] ?? 0) / 255;
      const luma = r * REC709.r + g * REC709.g + b * REC709.b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;

      hist[Math.min(255, Math.round(luma * 255))] += 1;
      sumR += r;
      sumG += g;
      sumB += b;
      sumLuma += luma;
      sumSat += sat;
      if (luma < 0.06) shadow++;
      if (luma > 0.94) highlight++;
      count++;

      if (skinRegion !== null && x >= sx0 && x < sx1 && y >= sy0 && y < sy1) {
        skR += r;
        skG += g;
        skB += b;
        skL += luma;
        skS += sat;
        skCount++;
      }
    }
  }

  if (count === 0) {
    return {
      blackPoint: 0,
      whitePoint: 1,
      medianLuma: 0,
      meanLuma: 0,
      spread: 1,
      meanR: 0,
      meanG: 0,
      meanB: 0,
      saturation: 0,
      shadowClip: 0,
      highlightClip: 0,
      skin: null,
      hasFace: false,
      isLikelyGraphic: false,
      sampleCount: 0
    };
  }

  const blackPoint = percentile(hist, count, BLACK_CLIP);
  const whitePoint = percentile(hist, count, WHITE_CLIP);
  const medianLuma = percentile(hist, count, 0.5);
  const meanLuma = sumLuma / count;
  const saturation = sumSat / count;
  const shadowClip = shadow / count;
  const highlightClip = highlight / count;
  const spread = Math.max(0, whitePoint - blackPoint);

  const skin =
    skCount > 16
      ? { meanR: skR / skCount, meanG: skG / skCount, meanB: skB / skCount, meanLuma: skL / skCount, saturation: skS / skCount }
      : null;

  // Screenshot / line-art / text heuristic: heavily bimodal (lots of pure black
  // AND white), high spread, and low colourfulness.
  const isLikelyGraphic = spread > 0.9 && saturation < 0.16 && shadowClip + highlightClip > 0.22;

  return {
    blackPoint,
    whitePoint,
    medianLuma,
    meanLuma,
    spread,
    meanR: sumR / count,
    meanG: sumG / count,
    meanB: sumB / count,
    saturation,
    shadowClip,
    highlightClip,
    skin,
    hasFace: options?.hasFace ?? false,
    isLikelyGraphic,
    sampleCount: count
  };
}

/** Luma (0..1) at the given cumulative fraction of a 256-bin histogram. */
function percentile(hist: Float64Array, total: number, fraction: number): number {
  const target = total * fraction;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i] ?? 0;
    if (acc >= target) return i / 255;
  }
  return 1;
}

// ─── Correction (full strength) ───────────────────────────────────────────────

/**
 * Derive the conservative full-strength correction from stats. Every field is
 * clamped to AUTO_FIX_LIMITS so even at intensity 1 the result stays natural.
 */
export function computeAutoFixCorrection(stats: AutoFixStats): AutoFixCorrection {
  // ── Exposure: nudge the median toward a natural midtone, but never over-
  //    brighten an already-bright frame. ──
  let exposure = 0;
  const deficit = MIDTONE_TARGET - stats.medianLuma;
  if (deficit > 0.02) {
    exposure = clamp(deficit * 1.25, 0, AUTO_FIX_LIMITS.exposure.max);
  } else if (stats.medianLuma > 0.62 && stats.highlightClip > 0.1) {
    // very bright with blown highlights → pull back gently
    exposure = clamp(-(stats.medianLuma - 0.62) * 0.9, AUTO_FIX_LIMITS.exposure.min, 0);
  }

  // ── Shadows / highlights recovery ──
  const shadows = clamp(stats.shadowClip * 110 + Math.max(0, deficit) * 55, AUTO_FIX_LIMITS.shadows.min, AUTO_FIX_LIMITS.shadows.max);
  const highlights = clamp(-stats.highlightClip * 130, AUTO_FIX_LIMITS.highlights.min, AUTO_FIX_LIMITS.highlights.max);

  // ── Contrast from histogram spread: only boost flat images; trim only when
  //    extremely contrasty AND clipping both ends. ──
  let contrast = 0;
  if (stats.spread < 0.75) {
    contrast = clamp((0.75 - stats.spread) * 42, 0, AUTO_FIX_LIMITS.contrast.max);
  } else if (stats.spread > 0.97 && stats.shadowClip > 0.08 && stats.highlightClip > 0.08) {
    contrast = clamp(-(stats.spread - 0.97) * 120, AUTO_FIX_LIMITS.contrast.min, 0);
  }

  // ── White balance (gray-world; skin-weighted when a face was sampled) ──
  const wbR = stats.skin?.meanR ?? stats.meanR;
  const wbG = stats.skin?.meanG ?? stats.meanG;
  const wbB = stats.skin?.meanB ?? stats.meanB;
  // Warm (R>B) → cool down (negative temperature); cool (B>R) → warm up.
  let temperature = clamp(-(wbR - wbB) * 110, AUTO_FIX_LIMITS.temperature.min, AUTO_FIX_LIMITS.temperature.max);
  // Green excess → push toward magenta (negative tint).
  let tint = clamp(-(wbG - (wbR + wbB) / 2) * 130, AUTO_FIX_LIMITS.tint.min, AUTO_FIX_LIMITS.tint.max);
  // Deaden tiny casts so balanced images are left alone.
  if (Math.abs(temperature) < 1.2) temperature = 0;
  if (Math.abs(tint) < 1.2) tint = 0;

  // ── Vibrance: only lift genuinely flat (but still colourful) images; never on
  //    graphics or near-grayscale frames (where there is no colour to enrich). ──
  let vibrance = 0;
  if (!stats.isLikelyGraphic && stats.saturation > 0.04 && stats.saturation < 0.34) {
    vibrance = clamp((0.34 - stats.saturation) * 55, 0, AUTO_FIX_LIMITS.vibrance.max);
  }

  // ── Saturation: tiny nudge only at the extremes (and only when colour exists). ──
  let saturation = 0;
  if (stats.isLikelyGraphic) {
    saturation = 0;
  } else if (stats.saturation > 0.62) {
    saturation = clamp(-(stats.saturation - 0.62) * 30, AUTO_FIX_LIMITS.saturation.min, 0);
  } else if (stats.saturation > 0.04 && stats.saturation < 0.16) {
    saturation = clamp((0.16 - stats.saturation) * 40, 0, AUTO_FIX_LIMITS.saturation.max);
  }

  // ── Sharpen: mild, and never on graphics or already-crisp/contrasty frames. ──
  let sharpen = 0;
  if (!stats.isLikelyGraphic) {
    const crispness = clamp((stats.spread - 0.55) / 0.4, 0, 1); // 0 soft … 1 already crisp
    sharpen = clamp(7 * (1 - crispness * 0.6), 0, AUTO_FIX_LIMITS.sharpen.max);
  }

  // ── Skin guard factors (applied later when the toggle is on) ──
  const skinGuard = computeSkinGuard(stats);

  return {
    exposure: round(exposure),
    contrast: round(contrast),
    highlights: round(highlights),
    shadows: round(shadows),
    temperature: round(temperature),
    tint: round(tint),
    vibrance: round(vibrance),
    saturation: round(saturation),
    sharpen: round(sharpen),
    skinGuard
  };
}

function computeSkinGuard(stats: AutoFixStats): AutoFixCorrection["skinGuard"] {
  if (stats.skin === null) return { colorScale: 1, vibranceScale: 1, saturationCap: AUTO_FIX_LIMITS.saturation.max };
  const skinSat = stats.skin.saturation;
  // Already-saturated skin → strongly damp colour pushes so faces stay natural.
  if (skinSat > 0.5) return { colorScale: 0.55, vibranceScale: 0.2, saturationCap: 0 };
  if (skinSat > 0.4) return { colorScale: 0.75, vibranceScale: 0.5, saturationCap: 2 };
  // Greyish skin → don't desaturate further, allow gentle lift.
  if (skinSat < 0.12) return { colorScale: 0.85, vibranceScale: 1, saturationCap: AUTO_FIX_LIMITS.saturation.max };
  return { colorScale: 0.9, vibranceScale: 0.85, saturationCap: 4 };
}

/**
 * True when the correction does something worthwhile. Mild sharpen is a cosmetic
 * finishing touch applied to almost every photo, so it does NOT count on its own
 * — "could not improve" should fire when tone, colour and contrast are all flat.
 */
export function isMeaningfulCorrection(c: AutoFixCorrection): boolean {
  return (
    Math.abs(c.exposure) >= 0.03 ||
    Math.abs(c.contrast) >= 1 ||
    Math.abs(c.highlights) >= 1 ||
    Math.abs(c.shadows) >= 1 ||
    Math.abs(c.temperature) >= 1 ||
    Math.abs(c.tint) >= 1 ||
    c.vibrance >= 1 ||
    Math.abs(c.saturation) >= 1
  );
}

// ─── Blend → adjustment templates ─────────────────────────────────────────────

export interface AutoFixBlendedValues {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  sharpen: number;
}

/**
 * Blend the correction toward the original by `intensity` and the feature
 * toggles, returning the resulting scalar values (each clamped to a safe range).
 * intensity 0 → all zero; intensity 1 → full correction. Skin protection (when
 * on) reduces colour pushes so skin tones stay natural even at full strength.
 */
export function blendAutoFixToValues(c: AutoFixCorrection, opts: AutoFixBlendOptions): AutoFixBlendedValues {
  const I = clamp(opts.intensity, 0, 1);
  const t = opts.toggles;
  if (I <= 0) {
    return { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 0, sharpen: 0 };
  }

  let exposure = t.lighting ? c.exposure : 0;
  let highlights = t.lighting ? c.highlights : 0;
  let shadows = t.lighting ? c.shadows : 0;
  let contrast = t.contrast ? c.contrast : 0;
  let temperature = t.color ? c.temperature : 0;
  let tint = t.color ? c.tint : 0;
  let vibrance = t.color ? c.vibrance : 0;
  let saturation = t.color ? c.saturation : 0;
  let sharpen = t.sharpen ? c.sharpen : 0;

  if (t.skinProtection) {
    temperature *= c.skinGuard.colorScale;
    tint *= c.skinGuard.colorScale;
    vibrance *= c.skinGuard.vibranceScale;
    saturation = Math.min(saturation, c.skinGuard.saturationCap);
  }

  // Scale by intensity, then re-clamp (scaling down keeps us in range).
  return {
    exposure: round(clamp(exposure * I, AUTO_FIX_LIMITS.exposure.min, AUTO_FIX_LIMITS.exposure.max)),
    contrast: round(clamp(contrast * I, AUTO_FIX_LIMITS.contrast.min, AUTO_FIX_LIMITS.contrast.max)),
    highlights: round(clamp(highlights * I, AUTO_FIX_LIMITS.highlights.min, AUTO_FIX_LIMITS.highlights.max)),
    shadows: round(clamp(shadows * I, AUTO_FIX_LIMITS.shadows.min, AUTO_FIX_LIMITS.shadows.max)),
    temperature: round(clamp(temperature * I, AUTO_FIX_LIMITS.temperature.min, AUTO_FIX_LIMITS.temperature.max)),
    tint: round(clamp(tint * I, AUTO_FIX_LIMITS.tint.min, AUTO_FIX_LIMITS.tint.max)),
    vibrance: round(clamp(vibrance * I, AUTO_FIX_LIMITS.vibrance.min, AUTO_FIX_LIMITS.vibrance.max)),
    saturation: round(clamp(saturation * I, AUTO_FIX_LIMITS.saturation.min, AUTO_FIX_LIMITS.saturation.max)),
    sharpen: round(clamp(sharpen * I, AUTO_FIX_LIMITS.sharpen.min, AUTO_FIX_LIMITS.sharpen.max))
  };
}

/**
 * Blend the correction and convert it to concrete adjustment templates (only
 * non-neutral ones). intensity 0 → []; intensity 1 → full correction.
 */
export function blendAutoFixToTemplates(c: AutoFixCorrection, opts: AutoFixBlendOptions): ImageAdjustmentTemplate[] {
  const { exposure, contrast, highlights, shadows, temperature, tint, vibrance, saturation, sharpen } =
    blendAutoFixToValues(c, opts);

  const templates: ImageAdjustmentTemplate[] = [];

  const tone: Partial<{ exposure: number; contrast: number }> = {};
  if (exposure !== 0) tone.exposure = exposure;
  if (contrast !== 0) tone.contrast = contrast;
  if (Object.keys(tone).length > 0) templates.push({ type: "basicTone", ...tone });

  const hs: Partial<{ highlights: number; shadows: number }> = {};
  if (highlights !== 0) hs.highlights = highlights;
  if (shadows !== 0) hs.shadows = shadows;
  if (Object.keys(hs).length > 0) templates.push({ type: "highlightsShadows", ...hs });

  const color: Partial<{ temperature: number; tint: number; vibrance: number; saturation: number }> = {};
  if (temperature !== 0) color.temperature = temperature;
  if (tint !== 0) color.tint = tint;
  if (vibrance !== 0) color.vibrance = vibrance;
  if (saturation !== 0) color.saturation = saturation;
  if (Object.keys(color).length > 0) templates.push({ type: "color", ...color });

  if (sharpen !== 0) templates.push({ type: "detail", sharpness: sharpen });

  return templates;
}

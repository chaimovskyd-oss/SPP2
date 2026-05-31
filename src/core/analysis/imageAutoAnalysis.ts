/**
 * Image auto-analysis engine (שלב 6 — Smart / AI, light pass).
 *
 * Per the plan, this phase does NOT add heavy ML models or a new rendering
 * engine. Instead it prepares small, fallback-safe analysis interfaces
 * (faceDetection, exposureAnalysis, whiteBalanceAnalysis) and a "Suggested
 * Fixes" recommender that points the user at EXISTING Smart Presets — it never
 * fabricates a new recipe. Skin-aware white balance reuses the existing face
 * detection (see `detectFocalPoint`); when no face is found it falls back to a
 * whole-image gray-world estimate.
 *
 * Everything here is pure (no DOM, no store). The browser/service layer samples
 * pixels into `RegionStats` and calls `analyzeImageStats`.
 */

import { getPreset } from "@/core/presets/smartPresets";

// ─── Interfaces the plan asks us to prepare ───────────────────────────────────

/** Normalized rectangle, all fields 0..1 relative to image size. */
export interface NormRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Face detection result, mapped from the existing focal-point/sidecar mechanism. */
export interface FaceDetectionResult {
  faces: NormRect[];
  primary?: NormRect;
  backend: "sidecar" | "webapi" | "saliency" | "none";
}

/** Aggregate pixel statistics for a region (or the whole image). All 0..1. */
export interface RegionStats {
  meanR: number;
  meanG: number;
  meanB: number;
  meanLuma: number;
  /** standard deviation of luma — a rough global-contrast proxy (~0..0.5). */
  contrast: number;
  /** fraction of pixels with luma < 0.06 (crushed shadows). */
  shadowClip: number;
  /** fraction of pixels with luma > 0.94 (blown highlights). */
  highlightClip: number;
  /** mean HSV saturation. */
  saturation: number;
  sampleCount: number;
}

export type ExposureVerdict = "dark" | "bright" | "lowContrast" | "backlit" | "ok";

export interface ExposureAnalysis {
  meanLuma: number;
  contrast: number;
  shadowClip: number;
  highlightClip: number;
  verdict: ExposureVerdict;
}

export type WhiteBalanceCast = "red" | "yellow" | "blue" | "green" | "neutral";

export interface WhiteBalanceAnalysis {
  /** which sample drove the estimate. */
  source: "skin" | "image";
  meanR: number;
  meanG: number;
  meanB: number;
  cast: WhiteBalanceCast;
  /** 0..1 how far the dominant channel deviates from gray. */
  magnitude: number;
}

export interface SuggestedFix {
  presetId: string;
  presetName: string;
  /** Hebrew, user-facing explanation of why this preset is suggested. */
  reason: string;
  /** 0..1 ranking weight. */
  confidence: number;
  /** suggested master strength to apply at. */
  recommendedStrength: number;
}

export interface ImageAutoAnalysis {
  exposure: ExposureAnalysis;
  whiteBalance: WhiteBalanceAnalysis;
  suggestions: SuggestedFix[];
  issues?: Array<{ type: string; confidence: number }>;
  recommendedPrimaryPreset?: string;
}

export interface AutoAnalysisInput {
  /** whole-image stats — always required. */
  whole: RegionStats;
  /** skin-region stats (from a detected face) — drives white balance when present. */
  skin?: RegionStats | null;
  /** true when a real face was detected (vs. saliency/center fallback). */
  hasFace?: boolean;
}

// ─── Pure pixel-stats computation ─────────────────────────────────────────────

const REC709 = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

/**
 * Compute aggregate statistics for a region of an RGBA buffer. `region` is in
 * normalized 0..1 coordinates; omitted means the whole buffer. Pure & DOM-free
 * so it can be unit-tested directly.
 */
export function computeRegionStats(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  region?: NormRect
): RegionStats {
  const x0 = clampIndex(region ? Math.floor(region.x * width) : 0, width);
  const y0 = clampIndex(region ? Math.floor(region.y * height) : 0, height);
  const x1 = clampIndex(region ? Math.ceil((region.x + region.width) * width) : width, width);
  const y1 = clampIndex(region ? Math.ceil((region.y + region.height) * height) : height, height);

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLuma = 0;
  let sumLumaSq = 0;
  let sumSat = 0;
  let shadow = 0;
  let highlight = 0;
  let count = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
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

      sumR += r;
      sumG += g;
      sumB += b;
      sumLuma += luma;
      sumLumaSq += luma * luma;
      sumSat += sat;
      if (luma < 0.06) shadow++;
      if (luma > 0.94) highlight++;
      count++;
    }
  }

  if (count === 0) {
    return { meanR: 0, meanG: 0, meanB: 0, meanLuma: 0, contrast: 0, shadowClip: 0, highlightClip: 0, saturation: 0, sampleCount: 0 };
  }

  const meanLuma = sumLuma / count;
  const variance = Math.max(0, sumLumaSq / count - meanLuma * meanLuma);
  return {
    meanR: sumR / count,
    meanG: sumG / count,
    meanB: sumB / count,
    meanLuma,
    contrast: Math.sqrt(variance),
    shadowClip: shadow / count,
    highlightClip: highlight / count,
    saturation: sumSat / count,
    sampleCount: count
  };
}

function clampIndex(value: number, size: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(size, Math.round(value)));
}

// ─── White-balance analysis ───────────────────────────────────────────────────

const CAST_NEUTRAL_THRESHOLD = 0.035; // below this deviation we call it neutral
const CAST_STRONG_THRESHOLD = 0.09; // strong cast → dedicated rescue preset

export function analyzeWhiteBalance(input: AutoAnalysisInput): WhiteBalanceAnalysis {
  const useSkin = input.skin !== undefined && input.skin !== null && input.skin.sampleCount > 0;
  const sample = useSkin ? input.skin! : input.whole;
  const { meanR, meanG, meanB } = sample;
  const mean = (meanR + meanG + meanB) / 3;
  const dR = meanR - mean;
  const dG = meanG - mean;
  const dB = meanB - mean;

  const magnitude = Math.max(Math.abs(dR), Math.abs(dG), Math.abs(dB));
  let cast: WhiteBalanceCast = "neutral";
  if (magnitude >= CAST_NEUTRAL_THRESHOLD) {
    if (dB > 0 && dB >= dR && dB >= dG) {
      cast = "blue";
    } else if (dG > 0 && dR <= 0 && dB <= 0) {
      cast = "green";
    } else if (dR > 0 && dG > 0 && dB < 0) {
      // both warm channels lifted, blue suppressed → yellow/orange
      cast = "yellow";
    } else if (dR > 0 && dR >= dG && dB <= 0) {
      cast = "red";
    } else if (dG > 0 && dB < 0) {
      cast = "yellow";
    }
  }

  return {
    source: useSkin ? "skin" : "image",
    meanR,
    meanG,
    meanB,
    cast,
    magnitude
  };
}

// ─── Exposure analysis ────────────────────────────────────────────────────────

export function analyzeExposure(input: AutoAnalysisInput): ExposureAnalysis {
  const w = input.whole;
  const skin = input.skin;
  let verdict: ExposureVerdict = "ok";

  const subjectDark = skin !== undefined && skin !== null && skin.sampleCount > 0 && skin.meanLuma < 0.32;
  const backlit = (subjectDark && w.highlightClip > 0.12) || (w.shadowClip > 0.2 && w.highlightClip > 0.12);

  if (backlit) {
    verdict = "backlit";
  } else if (w.meanLuma < 0.3) {
    verdict = "dark";
  } else if (w.meanLuma > 0.72 && w.highlightClip > 0.12) {
    verdict = "bright";
  } else if (w.contrast < 0.11) {
    verdict = "lowContrast";
  }

  return {
    meanLuma: w.meanLuma,
    contrast: w.contrast,
    shadowClip: w.shadowClip,
    highlightClip: w.highlightClip,
    verdict
  };
}

// ─── Suggested fixes (recommend EXISTING presets only) ────────────────────────

const CAST_TO_PRESET: Record<Exclude<WhiteBalanceCast, "neutral">, { strong: string; reason: string }> = {
  red: { strong: "red_cast_rescue", reason: "זוהתה נטייה אדומה/ורודה חזקה בגוון העור." },
  yellow: { strong: "yellow_cast_rescue", reason: "זוהתה תאורה צהובה/כתומה חמה." },
  blue: { strong: "blue_cast_rescue", reason: "זוהתה נטייה כחולה/קרה." },
  green: { strong: "green_cast_rescue", reason: "זוהתה נטייה ירקרקה (פלורסנט/צמחייה)." }
};

function pushSuggestion(
  out: SuggestedFix[],
  presetId: string,
  reason: string,
  confidence: number,
  recommendedStrength: number
): void {
  if (out.some((s) => s.presetId === presetId)) return;
  const def = getPreset(presetId);
  if (def === undefined) return; // never recommend a preset that isn't in the catalog
  out.push({
    presetId,
    presetName: def.name,
    reason,
    confidence: clamp01(confidence),
    recommendedStrength: clamp01(recommendedStrength > 0 ? recommendedStrength : def.defaultStrength)
  });
}

/**
 * Produce a ranked list of EXISTING presets to suggest for this image. White
 * balance (skin-aware) is prioritised per the user's emphasis, then exposure.
 */
export function suggestFixes(
  wb: WhiteBalanceAnalysis,
  exposure: ExposureAnalysis,
  input: AutoAnalysisInput
): SuggestedFix[] {
  const out: SuggestedFix[] = [];

  // 1. Colour cast (skin-aware when a face was sampled).
  if (wb.cast !== "neutral") {
    const map = CAST_TO_PRESET[wb.cast];
    const skinBoost = wb.source === "skin" ? 0.1 : 0;
    const confidence = clamp01((wb.magnitude - CAST_NEUTRAL_THRESHOLD) / 0.15 + 0.35 + skinBoost);
    const strength = clamp(0.55 + wb.magnitude * 2.2, 0.55, 1);
    if (wb.cast === "yellow" && wb.magnitude < CAST_STRONG_THRESHOLD) {
      // mild warm light → the gentler indoor-light fix reads more natural
      pushSuggestion(out, "indoor_light_fix", "תאורת פנים חמה קלה — מאזן עדין.", confidence * 0.85, strength * 0.85);
    } else {
      pushSuggestion(out, map.strong, map.reason, confidence, strength);
    }
  }

  // 2. Exposure.
  switch (exposure.verdict) {
    case "backlit":
      pushSuggestion(out, "backlight_rescue", "הנושא חשוך מול רקע מואר — מאיר את הנושא.", 0.82, 0.8);
      break;
    case "dark":
      pushSuggestion(out, "dark_photo_fix", "התמונה כהה מדי — מאיר וחושף פרטים בצללים.", 0.78, 0.8);
      break;
    case "bright":
      pushSuggestion(out, "sun_rescue", "אורות שרופים/שמש חזקה — מרכך אורות ומאזן.", 0.7, 0.75);
      break;
    case "lowContrast":
      pushSuggestion(out, "soft_hdr", "The image looks flat or low contrast; a mild HDR/detail preset should restore depth without over-brightening.", 0.66, 0.7);
      pushSuggestion(out, "hdr_pop", "A punchier contrast/detail option is available if the mild version is not enough.", 0.52, 0.65);
      if (exposure.meanLuma < 0.4) {
        pushSuggestion(out, "whatsapp_recovery", "The image is also a bit dull or soft, so a general recovery preset may be useful.", 0.5, 0.65);
      }
      break;
    default:
      break;
  }

  // 3. Mixed extreme: strong cast AND deep shadows → the combined tunnel rescue.
  if (wb.cast !== "neutral" && wb.magnitude >= CAST_STRONG_THRESHOLD && input.whole.shadowClip > 0.18) {
    pushSuggestion(out, "mixed_tunnel_rescue", "צבע חזק יחד עם פנים חשוכות — תיקון משולב.", 0.6, 0.8);
  }

  // 4. Dull / washed-out images get gentle recovery suggestions, not blind brightening.
  if (input.whole.saturation < 0.12 && exposure.meanLuma >= 0.32) {
    pushSuggestion(out, "whatsapp_recovery", "The image appears washed out or compressed; restore color and a little detail.", 0.54, 0.65);
  }
  if (out.length === 0 && exposure.meanLuma < 0.4 && exposure.contrast < 0.13) {
    pushSuggestion(out, "whatsapp_recovery", "The image is dull and soft; a gentle recovery preset is safer than a brightness boost.", 0.5, 0.65);
  }

  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Run the full analysis pipeline over pre-sampled stats. Pure. */
export function analyzeImageStats(input: AutoAnalysisInput): ImageAutoAnalysis {
  const whiteBalance = analyzeWhiteBalance(input);
  const exposure = analyzeExposure(input);
  const suggestions = suggestFixes(whiteBalance, exposure, input);
  const issues = buildIssues(whiteBalance, exposure, input);
  return { exposure, whiteBalance, suggestions, issues, recommendedPrimaryPreset: suggestions[0]?.presetId };
}

function buildIssues(
  wb: WhiteBalanceAnalysis,
  exposure: ExposureAnalysis,
  input: AutoAnalysisInput
): Array<{ type: string; confidence: number }> {
  const issues: Array<{ type: string; confidence: number }> = [];
  if (exposure.verdict === "dark") issues.push({ type: "underexposed", confidence: 0.78 });
  if (exposure.verdict === "bright") issues.push({ type: "overexposed", confidence: 0.7 });
  if (exposure.verdict === "backlit") issues.push({ type: "backlight", confidence: 0.82 });
  if (exposure.verdict === "lowContrast") issues.push({ type: "low_contrast", confidence: 0.66 });
  if (wb.cast !== "neutral") issues.push({ type: `${wb.cast}_cast`, confidence: clamp01(0.35 + wb.magnitude * 3) });
  if (input.whole.saturation < 0.12) issues.push({ type: "washed_out", confidence: 0.56 });
  if (input.whole.contrast < 0.09 && input.whole.saturation > 0.15) issues.push({ type: "soft_or_compressed", confidence: 0.5 });
  return issues.sort((a, b) => b.confidence - a.confidence);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

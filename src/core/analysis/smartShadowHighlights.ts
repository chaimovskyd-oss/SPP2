/**
 * Smart Shadow/Highlights V2 — pure scene-analysis helpers.
 *
 * These are deterministic, DOM-free functions shared by TWO callers:
 *  1. The render pipeline (imageAdjustmentPipeline.applyShadowHighlights) — runs
 *     per-pixel at draw/export time to MODULATE the V1 result with scene knowledge.
 *  2. The analysis service (services/ai/smartShadowHighlightsService) — runs once
 *     on a downscaled copy to estimate the noise score + per-face exposure.
 *
 * Keeping the math here (not in the service) is what guarantees live == export:
 * the pipeline reproduces the same modulation from the small set of cached inputs
 * (face boxes + noise score) without any async detection.
 *
 * No generative AI, no cloud — only luminance/colour heuristics and the existing
 * face boxes from the SCRFD/MediaPipe detector.
 */

import type { SmartFaceRegion } from "@/types/imageAdjustments";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Rec.709 luminance, 0..1, from 0..255 channels. */
export function luma01(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Hue in degrees 0..360 from 0..255 channels (0 if achromatic). */
function hueDeg(r: number, g: number, b: number): number {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d <= 1e-6) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** HSV-style saturation 0..1. */
function satHsv(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  if (max <= 0) return 0;
  return (max - Math.min(r, g, b)) / max;
}

// ─── Skin ──────────────────────────────────────────────────────────────────────

/**
 * Skin confidence 0..1 from a single pixel. Heuristic across skin tones: warm
 * orange-red hue, channel ordering r ≥ g ≥ b, moderate saturation, not too dark.
 * Used to CLAMP saturation/hue drift on skin during strong shadow lifting — it
 * does not need to be perfect, only to bias protection toward likely-skin pixels.
 */
export function skinConfidence(r: number, g: number, b: number): number {
  if (r < 40 || r < g) return 0; // too dark, or not warm → not skin
  const h = hueDeg(r, g, b);
  const s = satHsv(r, g, b);
  if (h > 55 || g < b) return 0; // outside warm orange-red band
  // Peak confidence around hue ≈ 22°, saturation 0.15..0.6.
  const hueScore = 1 - Math.min(1, Math.abs(h - 22) / 33);
  const satScore = s < 0.1 ? s / 0.1 : s > 0.6 ? clamp01(1 - (s - 0.6) / 0.3) : 1;
  return clamp01(hueScore * satScore);
}

// ─── Sky ────────────────────────────────────────────────────────────────────────

/**
 * Sky confidence 0..1 from a pixel plus context. Sky = blue-dominant hue, bright,
 * low local texture, biased toward the top of the frame. `textureLow` is 1 for a
 * smooth neighbourhood (e.g. 1 − local detail) and `yFrac` is the row 0(top)..1.
 */
export function skyConfidence(yFrac: number, r: number, g: number, b: number, textureLow: number): number {
  if (b <= g || b <= r) return 0; // sky is blue-dominant
  const h = hueDeg(r, g, b);
  const l = luma01(r, g, b);
  const hueScore = h >= 185 && h <= 260 ? 1 - Math.min(1, Math.abs(h - 215) / 45) : 0;
  if (hueScore <= 0) return 0;
  const brightScore = smoothstep(0.3, 0.55, l); // skies are not dark
  const posScore = 0.4 + 0.6 * (1 - smoothstep(0, 0.7, yFrac)); // stronger up top, never zero
  return clamp01(hueScore * brightScore * clamp01(textureLow) * posScore);
}

// ─── Noise ───────────────────────────────────────────────────────────────────────

/**
 * Convert a 0..100 noise score into a shadow-recovery scale, per the V2 spec:
 * 0–30 → 100%, 30–60 → 85%, 60–80 → 70%, 80+ → 50%. Interpolated between tiers
 * so there is no visible banding as the score changes.
 */
export function noiseScaleFromScore(score: number): number {
  const s = score < 0 ? 0 : score > 100 ? 100 : score;
  if (s <= 30) return 1;
  if (s <= 60) return 1 - ((s - 30) / 30) * 0.15; // 1.00 → 0.85
  if (s <= 80) return 0.85 - ((s - 60) / 20) * 0.15; // 0.85 → 0.70
  return 0.7 - ((s - 80) / 20) * 0.2; // 0.70 → 0.50
}

/**
 * Estimate a 0..100 sensor-noise score from a downscaled luminance map. Noise is
 * most visible (and most damaging when shadows are lifted) in DARK, low-detail
 * regions, so we measure the RMS of the high-frequency residual (pixel − 3×3 mean)
 * over shadow pixels only. Edges are largely excluded by the dark-region gate.
 */
export function estimateNoiseScore(luma: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const c = luma[i]!;
      if (c > 0.42) continue; // only judge noise where shadows would be lifted
      const mean =
        (luma[i - 1]! + luma[i + 1]! + luma[i - width]! + luma[i + width]! +
          luma[i - width - 1]! + luma[i - width + 1]! + luma[i + width - 1]! + luma[i + width + 1]! + c) / 9;
      const d = c - mean;
      sumSq += d * d;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const rms = Math.sqrt(sumSq / count);
  // rms ≈ 0.06 (≈15/255) is heavy shadow noise → ~100; ≈0.012 → ~20.
  return clamp01(rms / 0.06) * 100;
}

/**
 * Fraction of the image that reads as sky and as skin, using the SAME per-pixel
 * detectors the renderer applies. Lets the UI tell the user, honestly, whether
 * "Protect Sky" / "Protect Skin" have anything to act on in this photo (e.g. an
 * indoor portrait has 0% sky, so toggling it changes nothing — by design).
 */
export function estimateSceneCoverage(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): { sky: number; skin: number } {
  const n = width * height;
  if (n === 0) return { sky: 0, skin: 0 };
  const luma = lumaMapFromRgba(rgba, width, height);
  let sky = 0;
  let skin = 0;
  for (let y = 0; y < height; y += 1) {
    const yFrac = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const i = p * 4;
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      if (skinConfidence(r, g, b) > 0.4) skin += 1;
      const right = x + 1 < width ? luma[p + 1]! : luma[p]!;
      const down = y + 1 < height ? luma[p + width]! : luma[p]!;
      const detail = (Math.abs(luma[p]! - right) + Math.abs(luma[p]! - down)) / 2;
      const textureLow = clamp01(1 - detail / 0.06);
      if (skyConfidence(yFrac, r, g, b, textureLow) > 0.3) sky += 1;
    }
  }
  return { sky: sky / n, skin: skin / n };
}

export interface GlobalTone {
  /** fraction of pixels crushed to black (luma < 0.06). */
  shadowClip: number;
  /** fraction of pixels blown to white (luma > 0.94). */
  highlightClip: number;
  /** overall median luminance 0..1. */
  medianLuma: number;
  /** fraction of distinctly dark pixels (luma < 0.25) — a clothing/shadow proxy. */
  darkFraction: number;
}

/** Whole-image tonal summary from a luma map (for Auto Smart Shadows). */
export function estimateGlobalTone(luma: Float32Array): GlobalTone {
  const n = luma.length;
  if (n === 0) return { shadowClip: 0, highlightClip: 0, medianLuma: 0.5, darkFraction: 0 };
  let shadow = 0, high = 0, dark = 0;
  // 64-bin histogram → median without sorting the whole (possibly huge) array.
  const bins = new Uint32Array(64);
  for (let i = 0; i < n; i += 1) {
    const v = luma[i]!;
    if (v < 0.06) shadow += 1;
    if (v > 0.94) high += 1;
    if (v < 0.25) dark += 1;
    bins[Math.min(63, (v * 64) | 0)]! += 1;
  }
  let acc = 0;
  let medianLuma = 0.5;
  for (let b = 0; b < 64; b += 1) {
    acc += bins[b]!;
    if (acc >= n / 2) { medianLuma = (b + 0.5) / 64; break; }
  }
  return { shadowClip: shadow / n, highlightClip: high / n, medianLuma, darkFraction: dark / n };
}

/** Auto Smart Shadows: derive a conservative, natural set of controls from scene analysis. */
export function suggestAutoShadowHighlights(input: {
  faces: SmartFaceRegion[];
  coverage: { sky: number; skin: number };
  tone: GlobalTone;
}): {
  shadows: number;
  faceShadows: number;
  highlights: number;
  protectBrightFaces: number;
  protectHighlights: number;
  preserveSkinTones: number;
  shadowSaturation: number;
  clothingProtection: number;
} {
  const { faces, coverage, tone } = input;
  const maxUnder = faces.reduce((m, f) => Math.max(m, f.underexposureScore ?? 0), 0);
  const anyBrightFace = faces.some((f) => (f.medianLuma ?? 0) > 0.62);
  const round = (v: number, lo: number, hi: number): number => Math.round(v < lo ? lo : v > hi ? hi : v);
  return {
    // Global stays weak; a darker overall image earns a little more.
    shadows: round(10 + tone.darkFraction * 25, 10, 28),
    // Face lift scales with how under-exposed the worst face is — never aggressive.
    faceShadows: faces.length > 0 ? round(20 + maxUnder * 0.45, 0, 60) : 0,
    // Pull bright areas back when there's real clipping.
    highlights: round(15 + tone.highlightClip * 140, 15, 45),
    protectBrightFaces: anyBrightFace ? 90 : 78,
    protectHighlights: round(70 + coverage.sky * 30 + tone.highlightClip * 80, 70, 95),
    preserveSkinTones: coverage.skin > 0.02 ? 65 : 55,
    shadowSaturation: -10,
    clothingProtection: round(72 + tone.darkFraction * 35, 72, 92)
  };
}

/** Build a luminance map (0..1) from an RGBA buffer. */
export function lumaMapFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let p = 0, i = 0; p < out.length; p += 1, i += 4) {
    out[p] = luma01(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
  }
  return out;
}

// ─── Faces ───────────────────────────────────────────────────────────────────────

/**
 * FaceExposureScore 0..100 from a face region's luminance stats. Interpretation
 * (per spec): 0–30 very dark, 30–50 under-exposed, 50–75 acceptable, 75–100 well
 * exposed. Median drives it (robust to a bright background bleeding into the box);
 * crushed-shadow fraction pulls it down.
 */
export function faceExposureScore(medianLuma: number, shadowPct: number): number {
  const base = clamp01(medianLuma / 0.6) * 100; // median ≈0.6 ⇒ well exposed
  return Math.max(0, Math.min(100, base - shadowPct * 35));
}

// Anchor distances (in face-radius units) and their influence weights. Spec:
// face 100%, immediate surround 70%, head & shoulders 40%, extended area 20% → 0.
const INFLUENCE_ANCHORS: Array<[d: number, w: number]> = [
  [1.0, 1.0],
  [1.5, 0.7],
  [2.4, 0.4],
  [3.4, 0.2],
  [4.3, 0.0]
];
/** Downward stretch so the influence reaches over the head & shoulders, not the chest symmetrically. */
const SHOULDER_STRETCH = 1.8;

/** Continuous (no-step) interpolation through the influence anchors. */
function influenceFalloff(d: number): number {
  if (d <= 1) return 1;
  for (let k = 0; k < INFLUENCE_ANCHORS.length - 1; k += 1) {
    const [d0, w0] = INFLUENCE_ANCHORS[k]!;
    const [d1, w1] = INFLUENCE_ANCHORS[k + 1]!;
    if (d <= d1) return w0 + ((d - d0) / (d1 - d0)) * (w1 - w0);
  }
  return 0;
}

/**
 * Rasterise a feathered face-influence map (0..1): 100% inside the face, ~70% in
 * the immediate surround, ~40% over head & shoulders, ~20% extended, smoothly to
 * 0 — NO hard mask, NO visible seam. Influence is biased DOWNWARD (shoulders) and
 * is resolution-relative (normalised boxes) so live preview and export agree.
 */
export function buildFaceInfluence(regions: SmartFaceRegion[], width: number, height: number): Float32Array {
  const map = new Float32Array(width * height);
  if (regions.length === 0) return map;
  const maxD = INFLUENCE_ANCHORS[INFLUENCE_ANCHORS.length - 1]![0];
  for (const f of regions) {
    const cx = (f.x + f.width / 2) * width;
    const cy = (f.y + f.height / 2) * height;
    const rx = Math.max(1, (f.width * width) / 2);
    const ry = Math.max(1, (f.height * height) / 2);
    const x0 = Math.max(0, Math.floor(cx - rx * maxD));
    const x1 = Math.min(width - 1, Math.ceil(cx + rx * maxD));
    const y0 = Math.max(0, Math.floor(cy - ry * maxD));
    const y1 = Math.min(height - 1, Math.ceil(cy + ry * maxD * SHOULDER_STRETCH));
    for (let y = y0; y <= y1; y += 1) {
      const dyRaw = (y - cy) / ry;
      const dy = dyRaw > 0 ? dyRaw / SHOULDER_STRETCH : dyRaw; // reach further down
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x - cx) / rx;
        const v = influenceFalloff(Math.sqrt(dx * dx + dy * dy));
        if (v <= 0) continue;
        const i = y * width + x;
        if (v > map[i]!) map[i] = v; // union of overlapping faces (take the max)
      }
    }
  }
  return map;
}

/**
 * Eye-safety / specular factor 0..1 for a pixel: high where it is BRIGHT and
 * LOW-saturation (eye whites, teeth, specular catch-lights). The renderer scales
 * the face boost down by this so those regions are never pushed unnaturally bright.
 */
export function specularFactor(r: number, g: number, b: number): number {
  const l = luma01(r, g, b);
  const bright = smoothstep(0.7, 0.92, l);
  const lowSat = 1 - clamp01(satHsv(r, g, b) / 0.22);
  return clamp01(bright * lowSat);
}

// ─── Per-face underexposure analysis (skin-tone INDEPENDENT) ─────────────────────

export interface FaceRecoveryAnalysis {
  averageLuminance: number;
  medianLuminance: number;
  p10: number;
  p90: number;
  /** fraction of face pixels in the darkest band. */
  shadowDensity: number;
  /** P90 − P10; small ⇒ compressed facial detail. */
  dynamicRange: number;
  /** 1 − fraction of pixels in the midtone band. */
  midtoneDeficiency: number;
  /** 1 − presence of genuine (absolute-bright) facial highlights. */
  lackOfHighlights: number;
  /** how much darker the face is than its immediate surround (0..1). */
  localContextDifference: number;
  /** P90 − P10 again, exposed as a contrast figure for diagnostics. */
  faceContrast: number;
  /** 0..100 weighted FaceUnderexposureScore. */
  underexposureScore: number;
  /** 0..1 recovery amount from the score's tier. */
  recoveryStrength: number;
  /** 0..100 noise estimated within the face. */
  noiseScore: number;
  /** fraction of face pixels already very bright (≥ 0.8), 0..1. */
  highlightRatio: number;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx]!;
}

/** Median luma over a normalised box (used for the local-context comparison). */
function regionMedian(luma: Float32Array, width: number, height: number, box: { x: number; y: number; width: number; height: number }): number {
  const x0 = Math.max(0, Math.floor(box.x * width));
  const y0 = Math.max(0, Math.floor(box.y * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.width) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.height) * height));
  const vals: number[] = [];
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) vals.push(luma[y * width + x]!);
  if (vals.length === 0) return 0.5;
  vals.sort((a, b) => a - b);
  return percentile(vals, 0.5);
}

/** Noise score (0..100) restricted to dark pixels inside a normalised box. */
function regionNoiseScore(luma: Float32Array, width: number, height: number, box: { x: number; y: number; width: number; height: number }): number {
  const x0 = Math.max(1, Math.floor(box.x * width));
  const y0 = Math.max(1, Math.floor(box.y * height));
  const x1 = Math.min(width - 1, Math.ceil((box.x + box.width) * width));
  const y1 = Math.min(height - 1, Math.ceil((box.y + box.height) * height));
  let sumSq = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      const c = luma[i]!;
      if (c > 0.5) continue;
      const mean = (luma[i - 1]! + luma[i + 1]! + luma[i - width]! + luma[i + width]! + c) / 5;
      const d = c - mean;
      sumSq += d * d;
      count += 1;
    }
  }
  if (count === 0) return 0;
  return clamp01(Math.sqrt(sumSq / count) / 0.06) * 100;
}

/**
 * FaceUnderexposureScore 0..100, evaluated from a face's OWN luminance structure
 * plus a comparison to its immediate surround only. Skin-tone independent: the
 * heaviest weights are on range-compression and lack-of-highlights (a well-lit
 * dark-skin face still has range + specular highlights, so it scores low), while
 * the absolute-darkness signals carry light weight.
 */
export function faceUnderexposureScore(a: {
  shadowDensity: number;
  dynamicRange: number;
  midtoneDeficiency: number;
  p90: number;
  localContextDifference: number;
}): number {
  const compression = clamp01(1 - a.dynamicRange / 0.5);
  const lackOfHighlights = 1 - clamp01(a.p90 / 0.6);
  const score =
    0.18 * a.shadowDensity +
    0.3 * compression +
    0.12 * a.midtoneDeficiency +
    0.25 * lackOfHighlights +
    0.15 * a.localContextDifference;
  return clamp01(score) * 100;
}

/**
 * Map a FaceUnderexposureScore to a conservative recovery amount 0..1 (the spec's
 * tiers): <30 none, 30–60 mild, 60–80 moderate, 80–100 strong. Continuous so the
 * recovery never jumps as the score changes.
 */
export function recoveryStrengthFromScore(score: number): number {
  const s = score < 0 ? 0 : score > 100 ? 100 : score;
  if (s < 30) return 0;
  if (s < 60) return 0.15 + ((s - 30) / 30) * 0.3; // 0.15 → 0.45
  if (s < 80) return 0.45 + ((s - 60) / 20) * 0.3; // 0.45 → 0.75
  return 0.75 + ((s - 80) / 20) * 0.25; // 0.75 → 1.0
}

/** Analyse one face box against a downscaled luma map. Pure & batch-friendly. */
export function analyzeFaceLuma(
  luma: Float32Array,
  width: number,
  height: number,
  box: { x: number; y: number; width: number; height: number }
): FaceRecoveryAnalysis {
  const x0 = Math.max(0, Math.floor(box.x * width));
  const y0 = Math.max(0, Math.floor(box.y * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.width) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.height) * height));
  const vals: number[] = [];
  let sum = 0;
  let dark = 0;
  let mid = 0;
  let bright = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const v = luma[y * width + x]!;
      vals.push(v);
      sum += v;
      if (v < 0.22) dark += 1;
      if (v >= 0.3 && v <= 0.7) mid += 1;
      if (v >= 0.8) bright += 1;
    }
  }
  if (vals.length === 0) {
    return {
      averageLuminance: 0.5, medianLuminance: 0.5, p10: 0.5, p90: 0.5,
      shadowDensity: 0, dynamicRange: 0.5, midtoneDeficiency: 0, lackOfHighlights: 0,
      localContextDifference: 0, faceContrast: 0.5, underexposureScore: 0, recoveryStrength: 0,
      noiseScore: 0, highlightRatio: 0
    };
  }
  vals.sort((a, b) => a - b);
  const p10 = percentile(vals, 0.1);
  const p50 = percentile(vals, 0.5);
  const p90 = percentile(vals, 0.9);
  const shadowDensity = dark / vals.length;
  const midtoneDeficiency = 1 - mid / vals.length;
  const dynamicRange = Math.max(0, p90 - p10);

  // Local context: a head-&-shoulders box around the face (≈2× size), centred,
  // clamped to the image. Compared to the FACE median only — never to other faces.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const ctxBox = {
    x: cx - box.width,
    y: cy - box.height * 0.8,
    width: box.width * 2,
    height: box.height * 2.2
  };
  const ctxMedian = regionMedian(luma, width, height, ctxBox);
  const localContextDifference = clamp01((ctxMedian - p50) / 0.3);

  const underexposureScore = faceUnderexposureScore({ shadowDensity, dynamicRange, midtoneDeficiency, p90, localContextDifference });
  const recoveryStrength = recoveryStrengthFromScore(underexposureScore);
  const noiseScore = regionNoiseScore(luma, width, height, box);

  return {
    averageLuminance: sum / vals.length,
    medianLuminance: p50,
    p10,
    p90,
    shadowDensity,
    dynamicRange,
    midtoneDeficiency,
    lackOfHighlights: 1 - clamp01(p90 / 0.6),
    localContextDifference,
    faceContrast: dynamicRange,
    underexposureScore,
    recoveryStrength,
    noiseScore,
    highlightRatio: bright / vals.length
  };
}

/**
 * Batch entry point: analyse every face box against a luma map and return ready
 * SmartFaceRegions (normalised box + recovery diagnostics). Reusable headless by
 * Photo Prints / kindergarten / school / collage preprocessing — no DOM, no UI.
 */
export function analyzeFaceRecovery(
  luma: Float32Array,
  width: number,
  height: number,
  boxes: Array<{ x: number; y: number; width: number; height: number }>
): SmartFaceRegion[] {
  return boxes.map((b) => {
    const a = analyzeFaceLuma(luma, width, height, b);
    return {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      underexposureScore: a.underexposureScore,
      recoveryStrength: a.recoveryStrength,
      noiseScore: a.noiseScore,
      medianLuma: a.medianLuminance,
      highlightRatio: a.highlightRatio
    };
  });
}

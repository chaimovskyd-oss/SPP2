/**
 * Core pixel pipeline for the non-destructive ImageAdjustment stack.
 *
 * This is the single source of truth for adjustment math. The export path calls
 * it directly on a canvas ImageData; the live Konva path wraps it as a filter
 * (see konvaCustomFilters.ts). Because both paths run THIS code, live preview
 * and final export are guaranteed identical.
 *
 * Adjustments are applied in stack order. Pointwise tools mutate the buffer in a
 * single pass; spatial tools (sharpness/clarity/noiseReduction) read a blurred
 * copy. All value-range conventions are documented in types/imageAdjustments.ts.
 */

import type {
  BasicToneAdjustment,
  BlackWhiteAdjustment,
  ColorAdjustment,
  CurvesAdjustment,
  DetailAdjustment,
  GradientMapAdjustment,
  HighlightsShadowsAdjustment,
  ImageAdjustment,
  InvertAdjustment,
  SepiaAdjustment,
  ShadowHighlightsAdjustment,
  ThresholdAdjustment
} from "@/types/imageAdjustments";
import { applyCurveLUT, buildCurveLUT } from "@/core/rendering/curveUtils";
import { isIdentityCurveChannels } from "@/types/imageAdjustments";
import {
  buildFaceInfluence,
  noiseScaleFromScore,
  skinConfidence,
  skyConfidence,
  specularFactor
} from "@/core/analysis/smartShadowHighlights";

export function isActiveImageAdjustment(adj: ImageAdjustment): boolean {
  if (adj.enabled === false) return false;
  switch (adj.type) {
    case "basicTone":
      return adj.brightness !== 0 || adj.contrast !== 0 || adj.exposure !== 0 || Math.abs(adj.gamma - 1) > 1e-4 || adj.offset !== 0;
    case "highlightsShadows":
      return adj.highlights !== 0 || adj.shadows !== 0 || adj.whites !== 0 || adj.blacks !== 0;
    case "shadowHighlights":
      return (
        adj.shadows !== 0 || adj.highlights !== 0 || adj.localContrast !== 0 ||
        adj.colorCorrection !== 0 || adj.midtoneContrast !== 0 ||
        // Smart region-aware lift: face shadows or per-face manual keep it active
        // even when the global sliders are neutral.
        (adj.smart === true && (
          (adj.faceShadows ?? 0) !== 0 ||
          (adj.faceRegions?.some((f) => (f.shadows ?? 0) !== 0 || (f.highlights ?? 0) !== 0) ?? false)
        ))
      );
    case "color":
      return adj.saturation !== 0 || adj.vibrance !== 0 || adj.temperature !== 0 || adj.tint !== 0 || adj.hue !== 0;
    case "detail":
      return adj.sharpness !== 0 || adj.clarity !== 0 || adj.noiseReduction !== 0;
    case "blackWhite":
      return adj.strength !== 0;
    case "curves":
      if (adj.channels !== undefined) return !isIdentityCurveChannels(adj.channels);
      return (adj.points !== undefined && adj.points.length >= 2) || (adj.preset !== undefined && adj.preset !== "linear");
    case "threshold":
      return true;
    case "gradientMap":
      return adj.stops.length >= 2;
    case "sepia":
      return adj.intensity > 0;
    case "invert":
      return adj.strength > 0;
    default:
      return false;
  }
}

export function hasActiveImageAdjustments(stack: ImageAdjustment[] | undefined): boolean {
  return stack !== undefined && stack.some(isActiveImageAdjustment);
}

/**
 * Tools whose output for a channel depends ONLY on that channel's own input
 * (a pure 1-D function v→f(v)). A consecutive run of these can be collapsed into
 * a single fused lookup table per channel and applied in ONE pixel pass instead
 * of one pass per tool — the key win when several filters are stacked.
 *
 * NOT fusible (cross-channel or luminance-dependent): color (HSL/temp/tint),
 * highlightsShadows (luma mask), blackWhite (channel mix), threshold (luma),
 * gradientMap (luma), sepia (channel mix), detail (spatial).
 */
const PER_CHANNEL_FUSIBLE = new Set<ImageAdjustment["type"]>(["basicTone", "curves", "invert"]);

/** Apply the full stack onto an ImageData in place. strength scales every tool. */
export function applyImageAdjustmentStack(imageData: ImageData, stack: ImageAdjustment[], strength = 1): void {
  if (strength <= 0) return;
  const active = stack.filter(isActiveImageAdjustment);
  let run: ImageAdjustment[] = [];
  const flushRun = (): void => {
    if (run.length === 0) return;
    // A single op isn't worth a LUT build + extra pass — run it directly.
    if (run.length === 1) applyOne(imageData, run[0]!, strength);
    else applyFusedPerChannel(imageData.data, run, strength);
    run = [];
  };
  for (const adj of active) {
    if (PER_CHANNEL_FUSIBLE.has(adj.type)) {
      run.push(adj);
      continue;
    }
    flushRun();
    applyOne(imageData, adj, strength);
  }
  flushRun();
}

/** Dispatch a single adjustment through its dedicated full-buffer routine. */
function applyOne(imageData: ImageData, adj: ImageAdjustment, strength: number): void {
  switch (adj.type) {
    case "basicTone": applyBasicTone(imageData.data, adj, strength); break;
    case "highlightsShadows": applyHighlightsShadows(imageData.data, adj, strength); break;
    case "shadowHighlights": applyShadowHighlights(imageData, adj, strength); break;
    case "color": applyColor(imageData.data, adj, strength); break;
    case "blackWhite": applyBlackWhite(imageData.data, adj, strength); break;
    case "curves": applyCurves(imageData.data, adj, strength); break;
    case "threshold": applyThreshold(imageData.data, adj, strength); break;
    case "gradientMap": applyGradientMap(imageData.data, adj, strength); break;
    case "sepia": applySepia(imageData.data, adj, strength); break;
    case "invert": applyInvert(imageData.data, adj, strength); break;
    case "detail": applyDetail(imageData, adj, strength); break;
    default: break;
  }
}

/**
 * Collapse a run of per-channel point-ops into three 256-entry LUTs (R/G/B) by
 * composing each op's scalar transform, then resolve every pixel in one pass.
 * Mathematically identical to applying the ops sequentially over the buffer —
 * each op is a per-channel function, and function composition preserves order —
 * but it touches the (large) pixel buffer once instead of once per op.
 */
function applyFusedPerChannel(data: Uint8ClampedArray, run: ImageAdjustment[], strength: number): void {
  const lutR = new Uint8ClampedArray(256);
  const lutG = new Uint8ClampedArray(256);
  const lutB = new Uint8ClampedArray(256);
  for (let x = 0; x < 256; x += 1) { lutR[x] = x; lutG[x] = x; lutB[x] = x; }

  for (const adj of run) {
    if (adj.type === "basicTone") {
      const f = basicToneScalar(adj, strength);
      for (let x = 0; x < 256; x += 1) { lutR[x] = f(lutR[x]!); lutG[x] = f(lutG[x]!); lutB[x] = f(lutB[x]!); }
    } else if (adj.type === "invert") {
      const mix = clamp01((adj.strength / 100) * strength);
      for (let x = 0; x < 256; x += 1) {
        lutR[x] = invertScalar(lutR[x]!, mix);
        lutG[x] = invertScalar(lutG[x]!, mix);
        lutB[x] = invertScalar(lutB[x]!, mix);
      }
    } else if (adj.type === "curves") {
      const blend = clamp01(strength);
      if (adj.channels !== undefined) {
        // Multi-channel: compose rgb→channel into one byte→byte map per channel.
        const { r, g, b } = buildChannelCurveLUTs(adj.channels);
        for (let x = 0; x < 256; x += 1) {
          lutR[x] = blendByte(lutR[x]!, r[lutR[x]!]!, blend);
          lutG[x] = blendByte(lutG[x]!, g[lutG[x]!]!, blend);
          lutB[x] = blendByte(lutB[x]!, b[lutB[x]!]!, blend);
        }
      } else {
        const curve = buildCurveLUT({ preset: adj.preset, points: adj.points });
        const channel = adj.channel ?? "rgb";
        const f = (v: number): number => blendByte(v, applyCurveLUT(v, curve), blend);
        if (channel === "rgb" || channel === "r") for (let x = 0; x < 256; x += 1) lutR[x] = f(lutR[x]!);
        if (channel === "rgb" || channel === "g") for (let x = 0; x < 256; x += 1) lutG[x] = f(lutG[x]!);
        if (channel === "rgb" || channel === "b") for (let x = 0; x < 256; x += 1) lutB[x] = f(lutB[x]!);
      }
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lutR[data[i]!]!;
    data[i + 1] = lutG[data[i + 1]!]!;
    data[i + 2] = lutB[data[i + 2]!]!;
  }
}

/** Scalar form of applyBasicTone's per-channel math (exposure→offset→gamma→contrast→brightness). */
function basicToneScalar(adj: BasicToneAdjustment, strength: number): (v: number) => number {
  const brightnessAdd = adj.brightness * strength * 2.55;
  const contrastValue = clamp(adj.contrast * strength * 2.55, -254, 254);
  const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const expFactor = 2 ** (adj.exposure * strength);
  const offset = adj.offset * strength;
  const gamma = Math.max(0.1, lerp(1, adj.gamma, strength));
  const invGamma = 1 / gamma;
  return (input: number): number => {
    let v = clamp01((input / 255) * expFactor + offset) ** invGamma * 255;
    v = contrastFactor * (v - 128) + 128 + brightnessAdd;
    return clampByte(v);
  };
}

/** Scalar form of applyInvert's per-channel math. */
function invertScalar(v: number, mix: number): number {
  return clampByte(v + (255 - 2 * v) * mix);
}

export function createImageAdjustmentStackFilter(stack: ImageAdjustment[], strength = 1): (imageData: ImageData) => void {
  return (imageData: ImageData): void => applyImageAdjustmentStack(imageData, stack, strength);
}

// ─── Pointwise tools ──────────────────────────────────────────────────────────

function applyBasicTone(data: Uint8ClampedArray, adj: BasicToneAdjustment, strength: number): void {
  const brightnessAdd = adj.brightness * strength * 2.55;
  const contrastValue = clamp(adj.contrast * strength * 2.55, -254, 254);
  const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const expFactor = 2 ** (adj.exposure * strength);
  const offset = adj.offset * strength;
  const gamma = Math.max(0.1, lerp(1, adj.gamma, strength));
  const invGamma = 1 / gamma;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      let v = data[i + c]!;
      v = clamp01((v / 255) * expFactor + offset) ** invGamma * 255;
      v = contrastFactor * (v - 128) + 128 + brightnessAdd;
      data[i + c] = clampByte(v);
    }
  }
}

function applyHighlightsShadows(data: Uint8ClampedArray, adj: HighlightsShadowsAdjustment, strength: number): void {
  const h = (adj.highlights / 100) * strength;
  const s = (adj.shadows / 100) * strength;
  const w = (adj.whites / 100) * strength;
  const bl = (adj.blacks / 100) * strength;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const ln = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    // Luminance masks: each tonal range falls off smoothly toward the others.
    const maskHi = smoothstep(0.45, 1, ln);
    const maskSh = smoothstep(0.55, 0, ln);
    const maskWh = smoothstep(0.7, 1, ln);
    const maskBk = smoothstep(0.3, 0, ln);
    const add = (h * maskHi + s * maskSh + w * maskWh + bl * maskBk) * 127.5;
    data[i] = clampByte(r + add);
    data[i + 1] = clampByte(g + add);
    data[i + 2] = clampByte(b + add);
  }
}

/**
 * Photoshop-style LOCAL Shadow/Highlights recovery.
 *
 * Unlike the pointwise HighlightsShadows tool, this analyses each pixel's local
 * surround (a blurred luminance map) to decide how much to lift/pull it. The
 * surround mask is what protects edges from halos and keeps already-correct
 * regions untouched: a dark pixel in a bright surround is barely lifted, a bright
 * pixel in a dark surround is barely pulled.
 *
 * Pipeline per pixel (all in normalised luminance 0..1):
 *   1. l   = pixel luminance, lb = blurred surround luminance.
 *   2. Shadows: gamma-lift l, gated by a "dark surround" mask from lb. Gamma
 *      preserves 0 and 1, so true blacks/whites never wash out to grey.
 *   3. Highlights: inverse gamma-pull, gated by a "bright surround" mask.
 *   4. Local contrast: re-add the high-frequency detail (l − lb) lost to the
 *      tone compression, so recovered shadows don't look flat.
 *   5. Midtone contrast: linear contrast around mid-grey for "punch".
 *   6. Re-apply the luminance change to RGB as a multiplicative gain (preserves
 *      hue), then adjust saturation in corrected regions by Color Correction.
 *
 * The blur radius is derived from min(width,height) so the result is
 * resolution-relative: the live Konva cache (display-sized) and the full-res
 * export produce the same look. Pixel-for-pixel identical, what you see prints.
 *
 * Smart V2 (adj.smart): scene-aware modulation layered on the SAME math. Faces
 * (cached normalised boxes) get a feathered shadow BOOST; sky and skin pixels are
 * protected from over-lifting / over-saturation; a cached noise score scales the
 * whole shadow recovery down. All inputs are cached scalars/boxes so this stays
 * deterministic — live preview, export and print remain identical.
 */
function applyShadowHighlights(imageData: ImageData, adj: ShadowHighlightsAdjustment, strength: number): void {
  const { width, height, data } = imageData;
  const n = width * height;
  if (n === 0) return;

  const globalShadows = clamp01((adj.shadows / 100) * strength);
  const hAmt = clamp01((adj.highlights / 100) * strength);
  const lcAmt = (adj.localContrast / 100) * strength;
  const ccAmt = (adj.colorCorrection / 50) * strength;
  const mcAmt = (adj.midtoneContrast / 50) * strength;

  // ── Region-aware smart controls (all no-ops when adj.smart !== true) ──
  const smartOn = adj.smart === true;
  const faceShadowsAmt = smartOn ? clamp01(((adj.faceShadows ?? 0) / 100) * strength) : 0;
  const protectBrightFaces = smartOn ? clamp01((adj.protectBrightFaces ?? 80) / 100) : 0;
  const protectHighlights = smartOn ? clamp01((adj.protectHighlights ?? 75) / 100) : 0;
  const preserveSkin = smartOn ? clamp01((adj.preserveSkinTones ?? 60) / 100) : 0;
  const clothingProtection = smartOn ? clamp01((adj.clothingProtection ?? 80) / 100) : 0;
  const shadowSatReduce = smartOn ? clamp01(-(adj.shadowSaturation ?? -10) / 100) : 0; // 0..0.5
  const protectSky = smartOn && adj.protectSky !== false;
  const noiseScale = smartOn && adj.noiseProtection !== false ? noiseScaleFromScore(adj.noiseScore ?? 0) : 1;

  // ── Per-face maps: feathered mask (region membership), face shadow lift and face
  // highlight recovery. Face shadow strength is per-face AUTO (faceShadows × the
  // face's own under-exposure, cut for already-bright faces) OR a MANUAL override
  // from the numbered-face tool. Overlaps: the closest (highest-influence) face wins.
  let faceMaskRaw: Float32Array | null = null;
  let faceShadowMap: Float32Array | null = null;
  let faceHighlightMap: Float32Array | null = null;
  if (smartOn && adj.prioritizeFaces !== false && adj.faceRegions !== undefined && adj.faceRegions.length > 0) {
    const mask = new Float32Array(n);
    const sMap = new Float32Array(n);
    const hMap = new Float32Array(n);
    const best = new Float32Array(n);
    for (const f of adj.faceRegions) {
      const infl = buildFaceInfluence([f], width, height);
      const recovery = f.recoveryStrength ?? (f.exposureScore !== undefined ? clamp01((50 - f.exposureScore) / 50) : 1);
      // Protect Bright Faces: cut auto lift as the face's median luminance rises.
      const brightFactor = 1 - protectBrightFaces * smoothstep(0.55, 0.78, f.medianLuma ?? 0.5);
      let autoShadow = faceShadowsAmt * recovery * Math.max(0, brightFactor);
      if (adj.noiseProtection !== false && f.noiseScore !== undefined) autoShadow *= noiseScaleFromScore(f.noiseScore);
      const manualShadow = (f.shadows ?? 0) !== 0 ? clamp01(((f.shadows ?? 0) / 100) * strength) : 0;
      const faceShadowStrength = manualShadow > 0 ? manualShadow : autoShadow;
      // Bright faces with sun-spots get a touch of highlight recovery automatically.
      const manualHi = (f.highlights ?? 0) !== 0 ? clamp01(((f.highlights ?? 0) / 100) * strength) : 0;
      const autoHi = (f.highlightRatio ?? 0) > 0.12 ? hAmt * 0.5 * smoothstep(0.12, 0.4, f.highlightRatio ?? 0) : 0;
      const faceHiStrength = manualHi > autoHi ? manualHi : autoHi;
      for (let p = 0; p < n; p += 1) {
        const v = infl[p]!;
        if (v > best[p]!) {
          best[p] = v;
          sMap[p] = v * faceShadowStrength;
          hMap[p] = v * faceHiStrength;
        }
        if (v > mask[p]!) mask[p] = v;
      }
    }
    faceMaskRaw = mask;
    faceShadowMap = sMap;
    faceHighlightMap = hMap;
  }

  // Per-pixel luminance (0..1) and its blurred surround.
  const luma = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p += 1, i += 4) {
    luma[p] = (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255;
  }
  // radius 0..200 → resolution-relative blur radius (≈3%..30% of the short side).
  const radiusFrac = clamp01(adj.radius / 200) * 0.27 + 0.03;
  const blurRadius = Math.max(1, Math.round(radiusFrac * Math.min(width, height)));
  const surround = boxBlurLuma(luma, width, height, blurRadius);

  // Tone-curve strength: how aggressively the gamma lift/pull bends midtones.
  const SHADOW_GAMMA = 2.2;
  const HIGHLIGHT_GAMMA = 2.2;

  for (let p = 0, i = 0; p < n; p += 1, i += 4) {
    const l = luma[p]!;
    const lb = surround[p]!;
    const r0 = data[i]!;
    const g0 = data[i + 1]!;
    const b0 = data[i + 2]!;
    let out = l;

    const sc = smartOn ? skinConfidence(r0, g0, b0) : 0;

    // ── Compose the shadow lift from region layers: Face > Visible-skin > Global >
    // Clothing, then protect highlights / sky and scale by noise. ──
    let sEff: number;
    if (smartOn) {
      const faceM = faceMaskRaw !== null ? faceMaskRaw[p]! : 0;
      const darkness = smoothstep(0.28, 0.05, l);
      // Clothing protection: keep dark, NON-face, NON-skin areas (clothes/hair/bg) dark.
      const cloth = clothingProtection * darkness * (1 - faceM) * (1 - sc);
      let globalSh = globalShadows * (1 - cloth);
      // Visible body skin outside faces gets a middle lift (Face > Skin > Global).
      if (sc > 0 && faceM < 1 && faceShadowsAmt > 0) {
        const skinTarget = faceShadowsAmt * 0.55;
        if (skinTarget > globalSh) globalSh += (skinTarget - globalSh) * sc * (1 - faceM);
      }
      // Face shadow lift (auto bright-protected or manual), eye-safe.
      let faceSh = faceShadowMap !== null ? faceShadowMap[p]! : 0;
      if (faceSh > 0) faceSh *= 1 - 0.9 * specularFactor(r0, g0, b0);
      sEff = (globalSh + faceSh) * noiseScale;
      if (protectSky) {
        const textureLow = clamp01(1 - Math.abs(l - lb) / 0.06);
        const yFrac = (p / width | 0) / Math.max(1, height - 1);
        const sky = skyConfidence(yFrac, r0, g0, b0, textureLow);
        if (sky > 0) sEff *= 1 - 0.85 * sky;
      }
      // Protect Highlights: don't lift near-clipping pixels (white shirts/sky/faces).
      sEff *= 1 - protectHighlights * smoothstep(0.68, 0.92, l);
      sEff = clamp01(sEff);
    } else {
      sEff = globalShadows;
    }

    // Effective highlight recovery: global + per-face (manual / bright-face auto).
    const hEff = faceHighlightMap !== null ? clamp01(hAmt + faceHighlightMap[p]!) : hAmt;

    // ── Shadows: lift, gated by a dark-surround mask (1 at black → 0 by midtones).
    let shadowMask = 0;
    if (sEff > 0) {
      shadowMask = 1 - smoothstep(0, 0.6, lb);
      if (shadowMask > 0) {
        const g = 1 + sEff * shadowMask * SHADOW_GAMMA;
        out = out ** (1 / g); // gamma < input ⇒ brighten; endpoints fixed.
      }
    }
    // ── Highlights: pull, gated by a bright-surround mask (0 until midtones → 1 at white).
    let highlightMask = 0;
    if (hEff > 0) {
      highlightMask = smoothstep(0.4, 1, lb);
      if (highlightMask > 0) {
        const g = 1 + hEff * highlightMask * HIGHLIGHT_GAMMA;
        out = 1 - (1 - out) ** (1 / g); // mirror of the shadow lift; recovers clipping.
      }
    }
    // ── Local contrast: re-inject detail lost to the tone compression.
    if (lcAmt !== 0) out += lcAmt * (l - lb);
    // ── Midtone contrast around mid-grey.
    if (mcAmt !== 0) out = 0.5 + (out - 0.5) * (1 + mcAmt);

    out = clamp01(out);

    // Luminance change → RGB gain (preserves hue/ratios). Capped near black.
    const gain = l > 1e-4 ? Math.min(out / l, 8) : 0;
    const nl = out * 255;
    const corr = clamp01(sEff * shadowMask + hEff * highlightMask);
    let satFactor = 1 + ccAmt * corr;

    // ── Colour safety on lifted shadows (no blue/magenta cast). ──
    const lifted = out - l;
    if (lifted > 0.01) {
      // Deep-shadow desat: a near-black pixel lifted by a big gain turns its tiny
      // (bluish sensor-noise) cast into a visible tint — pull chroma down hard.
      const darkOrigin = 1 - smoothstep(0.04, 0.22, l);
      const deepDesat = clamp01(darkOrigin * smoothstep(0.02, 0.18, lifted));
      satFactor *= 1 - 0.75 * deepDesat;
      // Shadow Saturation control: a gentler global desat across everything lifted.
      if (shadowSatReduce > 0) satFactor *= 1 - shadowSatReduce * clamp01(lifted / 0.5);
    }

    // ── Skin-tone guard (Preserve Skin Tones). Hold lifted skin in a natural band:
    // gentle vibrance to avoid grey/dead skin, tight ceiling to avoid orange/magenta.
    // Never targets one skin brightness — it only constrains the saturation CHANGE.
    if (preserveSkin > 0 && sc > 0 && corr > 0) {
      const ceil = 1 + 0.12 * (1 - preserveSkin * 0.5);
      const floor = 1 - 0.05 * (1 - preserveSkin);
      const vibr = 1 + 0.08 * corr;
      let s = satFactor < vibr ? vibr : satFactor;
      s = s < floor ? floor : s > ceil ? ceil : s;
      satFactor = satFactor + (s - satFactor) * sc;
    }

    for (let c = 0; c < 3; c += 1) {
      let v = l > 1e-4 ? data[i + c]! * gain : nl;
      if (satFactor !== 1) v = nl + (v - nl) * satFactor;
      data[i + c] = clampByte(v);
    }
  }
}

/** Separable sliding-window box blur over a single-channel luminance map. O(n). */
function boxBlurLuma(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  boxBlurLumaPass(src, tmp, width, height, radius, true);
  boxBlurLumaPass(tmp, out, width, height, radius, false);
  return out;
}

function boxBlurLumaPass(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number, horizontal: boolean): void {
  const window = radius * 2 + 1;
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  for (let o = 0; o < outer; o += 1) {
    const at = (k: number): number => (horizontal ? o * width + k : k * width + o);
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += src[at(clampInt(k, 0, inner - 1))]!;
    for (let k = 0; k < inner; k += 1) {
      dst[at(k)] = sum / window;
      sum += src[at(clampInt(k + radius + 1, 0, inner - 1))]! - src[at(clampInt(k - radius, 0, inner - 1))]!;
    }
  }
}

function applyColor(data: Uint8ClampedArray, adj: ColorAdjustment, strength: number): void {
  const tempAdd = (adj.temperature / 100) * strength * 50;
  const tintAdd = (adj.tint / 100) * strength * 50;
  const hueDeg = adj.hue * strength;
  const satMul = 1 + (adj.saturation / 100) * strength;
  const vib = (adj.vibrance / 100) * strength;
  const doHsl = hueDeg !== 0 || adj.saturation !== 0 || adj.vibrance !== 0;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;
    // Temperature: warm = +R / -B. Tint: + = magenta (-G), - = green (+G).
    if (tempAdd !== 0) { r += tempAdd; b -= tempAdd; }
    if (tintAdd !== 0) { g -= tintAdd; }
    if (doHsl) {
      const [hh, ss, ll] = rgbToHsl(clampByte(r), clampByte(g), clampByte(b));
      // Vibrance boosts low-saturation pixels more than already-saturated ones.
      let s2 = ss + vib * (1 - ss) * ss * 2;
      s2 = clamp01(s2 * satMul);
      const [nr, ng, nb] = hslToRgb(hh + hueDeg, s2, ll);
      r = nr; g = ng; b = nb;
    }
    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }
}

function applyBlackWhite(data: Uint8ClampedArray, adj: BlackWhiteAdjustment, strength: number): void {
  // Channel mixer → grayscale weights (kept normalized to avoid brightness drift).
  let wr = 0.2126 + ((adj.red + adj.yellow + adj.magenta) / 100) * 0.25;
  let wg = 0.7152 + ((adj.green + adj.yellow + adj.cyan) / 100) * 0.25;
  let wb = 0.0722 + ((adj.blue + adj.cyan + adj.magenta) / 100) * 0.25;
  wr = Math.max(0, wr); wg = Math.max(0, wg); wb = Math.max(0, wb);
  const sum = wr + wg + wb || 1;
  wr /= sum; wg /= sum; wb /= sum;
  const mix = clamp01((adj.strength / 100) * strength);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const gray = wr * r + wg * g + wb * b;
    data[i] = clampByte(r + (gray - r) * mix);
    data[i + 1] = clampByte(g + (gray - g) * mix);
    data[i + 2] = clampByte(b + (gray - b) * mix);
  }
}

function applyCurves(data: Uint8ClampedArray, adj: CurvesAdjustment, strength: number): void {
  const blend = clamp01(strength);
  if (adj.channels !== undefined) {
    // RGB (composite) curve applied first, then the per-channel R/G/B curves —
    // collapsed into one byte→byte LUT per channel so it's a single pixel pass.
    const { r, g, b } = buildChannelCurveLUTs(adj.channels);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = blendByte(data[i]!, r[data[i]!]!, blend);
      data[i + 1] = blendByte(data[i + 1]!, g[data[i + 1]!]!, blend);
      data[i + 2] = blendByte(data[i + 2]!, b[data[i + 2]!]!, blend);
    }
    return;
  }
  const lut = buildCurveLUT({ preset: adj.preset, points: adj.points });
  const channel = adj.channel ?? "rgb";
  for (let i = 0; i < data.length; i += 4) {
    if (channel === "rgb" || channel === "r") data[i] = blendByte(data[i]!, applyCurveLUT(data[i]!, lut), blend);
    if (channel === "rgb" || channel === "g") data[i + 1] = blendByte(data[i + 1]!, applyCurveLUT(data[i + 1]!, lut), blend);
    if (channel === "rgb" || channel === "b") data[i + 2] = blendByte(data[i + 2]!, applyCurveLUT(data[i + 2]!, lut), blend);
  }
}

/**
 * Compose the composite (rgb) curve with each per-channel curve into a single
 * 256-entry byte→byte map per channel: out_c[x] = curve_c(curve_rgb(x)). Applying
 * these is mathematically identical to running the rgb curve over every channel
 * and then the channel-specific curve, but it's resolved once up front.
 */
function buildChannelCurveLUTs(channels: NonNullable<CurvesAdjustment["channels"]>): {
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
} {
  const rgb = buildCurveLUT({ points: channels.rgb });
  const rC = buildCurveLUT({ points: channels.r });
  const gC = buildCurveLUT({ points: channels.g });
  const bC = buildCurveLUT({ points: channels.b });
  const r = new Uint8Array(256);
  const g = new Uint8Array(256);
  const b = new Uint8Array(256);
  for (let x = 0; x < 256; x += 1) {
    const base = rgb[x]!;
    r[x] = rC[base]!;
    g[x] = gC[base]!;
    b[x] = bC[base]!;
  }
  return { r, g, b };
}

function applyThreshold(data: Uint8ClampedArray, adj: ThresholdAdjustment, strength: number): void {
  const level = clamp(adj.level, 0, 255);
  const width = (clamp(adj.smoothing, 0, 100) / 100) * 128;
  const blend = clamp01(strength);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    const out = width <= 0 ? (lum >= level ? 255 : 0) : smoothstep(level - width, level + width, lum) * 255;
    data[i] = blendByte(data[i]!, out, blend);
    data[i + 1] = blendByte(data[i + 1]!, out, blend);
    data[i + 2] = blendByte(data[i + 2]!, out, blend);
  }
}

function applyGradientMap(data: Uint8ClampedArray, adj: GradientMapAdjustment, strength: number): void {
  const lut = buildGradientLUT(adj.stops);
  const blend = clamp01(strength);
  for (let i = 0; i < data.length; i += 4) {
    const lum = clampByte(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) | 0;
    const base = lum * 3;
    data[i] = blendByte(data[i]!, lut[base]!, blend);
    data[i + 1] = blendByte(data[i + 1]!, lut[base + 1]!, blend);
    data[i + 2] = blendByte(data[i + 2]!, lut[base + 2]!, blend);
  }
}

function applySepia(data: Uint8ClampedArray, adj: SepiaAdjustment, strength: number): void {
  const warmBlend = clamp01(adj.warmth / 100);
  const intensityBlend = clamp01(adj.intensity / 100) * strength;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sr = r * 0.393 + g * 0.769 + b * 0.189;
    const sg = r * 0.349 + g * 0.686 + b * 0.168;
    const sb = r * 0.272 + g * 0.534 + b * 0.131;
    const tr = gray + (sr - gray) * warmBlend;
    const tg = gray + (sg - gray) * warmBlend;
    const tb = gray + (sb - gray) * warmBlend;
    data[i] = clampByte(r + (tr - r) * intensityBlend);
    data[i + 1] = clampByte(g + (tg - g) * intensityBlend);
    data[i + 2] = clampByte(b + (tb - b) * intensityBlend);
  }
}

function applyInvert(data: Uint8ClampedArray, adj: InvertAdjustment, strength: number): void {
  const mix = clamp01((adj.strength / 100) * strength);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampByte(data[i]! + (255 - 2 * data[i]!) * mix);
    data[i + 1] = clampByte(data[i + 1]! + (255 - 2 * data[i + 1]!) * mix);
    data[i + 2] = clampByte(data[i + 2]! + (255 - 2 * data[i + 2]!) * mix);
  }
}

// ─── Spatial tools (detail) ───────────────────────────────────────────────────

function applyDetail(imageData: ImageData, adj: DetailAdjustment, strength: number): void {
  const { width, height, data } = imageData;
  if (adj.noiseReduction !== 0) {
    const amount = clamp01((adj.noiseReduction / 100) * strength);
    const blurred = boxBlurRGB(data, width, height, 1);
    for (let p = 0, i = 0; i < data.length; i += 4, p += 3) {
      data[i] = clampByte(lerp(data[i]!, blurred[p]!, amount));
      data[i + 1] = clampByte(lerp(data[i + 1]!, blurred[p + 1]!, amount));
      data[i + 2] = clampByte(lerp(data[i + 2]!, blurred[p + 2]!, amount));
    }
  }
  if (adj.sharpness !== 0) {
    const amount = (adj.sharpness / 100) * strength;
    const radius = Math.max(1, Math.round(adj.sharpnessRadius));
    const blurred = boxBlurRGB(data, width, height, radius);
    for (let p = 0, i = 0; i < data.length; i += 4, p += 3) {
      data[i] = clampByte(data[i]! + amount * (data[i]! - blurred[p]!));
      data[i + 1] = clampByte(data[i + 1]! + amount * (data[i + 1]! - blurred[p + 1]!));
      data[i + 2] = clampByte(data[i + 2]! + amount * (data[i + 2]! - blurred[p + 2]!));
    }
  }
  if (adj.clarity !== 0) {
    // Local contrast = unsharp mask with a large radius.
    const amount = (adj.clarity / 100) * strength * 0.8;
    const radius = Math.max(4, Math.round(Math.min(width, height) / 40));
    const blurred = boxBlurRGB(data, width, height, radius);
    for (let p = 0, i = 0; i < data.length; i += 4, p += 3) {
      data[i] = clampByte(data[i]! + amount * (data[i]! - blurred[p]!));
      data[i + 1] = clampByte(data[i + 1]! + amount * (data[i + 1]! - blurred[p + 1]!));
      data[i + 2] = clampByte(data[i + 2]! + amount * (data[i + 2]! - blurred[p + 2]!));
    }
  }
}

/** Separable sliding-window box blur over RGB. O(n) regardless of radius. */
function boxBlurRGB(data: Uint8ClampedArray, width: number, height: number, radius: number): Float32Array {
  const n = width * height;
  const src = new Float32Array(n * 3);
  for (let p = 0, i = 0; i < data.length; i += 4, p += 3) {
    src[p] = data[i]!;
    src[p + 1] = data[i + 1]!;
    src[p + 2] = data[i + 2]!;
  }
  const tmp = new Float32Array(n * 3);
  boxBlurPass(src, tmp, width, height, radius, true);
  boxBlurPass(tmp, src, width, height, radius, false);
  return src;
}

function boxBlurPass(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number, horizontal: boolean): void {
  const window = radius * 2 + 1;
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  for (let o = 0; o < outer; o += 1) {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      const at = (k: number): number => (horizontal ? (o * width + k) : (k * width + o)) * 3 + c;
      // Prime the window with clamped edge samples.
      for (let k = -radius; k <= radius; k += 1) sum += src[at(clampInt(k, 0, inner - 1))]!;
      for (let k = 0; k < inner; k += 1) {
        dst[at(k)] = sum / window;
        const add = src[at(clampInt(k + radius + 1, 0, inner - 1))]!;
        const sub = src[at(clampInt(k - radius, 0, inner - 1))]!;
        sum += add - sub;
      }
    }
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildGradientLUT(stops: { position: number; color: string }[]): Uint8Array {
  const sorted = [...stops].map((s) => ({ position: clamp01(s.position), rgb: hexToRgb(s.color) })).sort((a, b) => a.position - b.position);
  if (sorted.length === 0) sorted.push({ position: 0, rgb: [0, 0, 0] }, { position: 1, rgb: [255, 255, 255] });
  if (sorted.length === 1) sorted.push({ position: 1, rgb: sorted[0]!.rgb });
  const lut = new Uint8Array(256 * 3);
  let seg = 0;
  for (let l = 0; l < 256; l += 1) {
    const t = l / 255;
    while (seg < sorted.length - 2 && t > sorted[seg + 1]!.position) seg += 1;
    const a = sorted[seg]!;
    const b = sorted[seg + 1]!;
    const span = b.position - a.position || 1;
    const f = clamp01((t - a.position) / span);
    lut[l * 3] = clampByte(lerp(a.rgb[0], b.rgb[0], f));
    lut[l * 3 + 1] = clampByte(lerp(a.rgb[1], b.rgb[1], f));
    lut[l * 3 + 2] = clampByte(lerp(a.rgb[2], b.rgb[2], f));
  }
  return lut;
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return [0, 0, 0];
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function blendByte(orig: number, target: number, t: number): number {
  return clampByte(orig + (target - orig) * t);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hueToRgb(p: number, q: number, tInput: number): number {
  let t = tInput;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s <= 0) {
    const gray = l * 255;
    return [gray, gray, gray];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, hn + 1 / 3) * 255, hueToRgb(p, q, hn) * 255, hueToRgb(p, q, hn - 1 / 3) * 255];
}

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
  ThresholdAdjustment
} from "@/types/imageAdjustments";
import { applyCurveLUT, buildCurveLUT } from "@/core/rendering/curveUtils";

export function isActiveImageAdjustment(adj: ImageAdjustment): boolean {
  if (adj.enabled === false) return false;
  switch (adj.type) {
    case "basicTone":
      return adj.brightness !== 0 || adj.contrast !== 0 || adj.exposure !== 0 || Math.abs(adj.gamma - 1) > 1e-4 || adj.offset !== 0;
    case "highlightsShadows":
      return adj.highlights !== 0 || adj.shadows !== 0 || adj.whites !== 0 || adj.blacks !== 0;
    case "color":
      return adj.saturation !== 0 || adj.vibrance !== 0 || adj.temperature !== 0 || adj.tint !== 0 || adj.hue !== 0;
    case "detail":
      return adj.sharpness !== 0 || adj.clarity !== 0 || adj.noiseReduction !== 0;
    case "blackWhite":
      return adj.strength !== 0;
    case "curves":
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
      const curve = buildCurveLUT({ preset: adj.preset, points: adj.points });
      const channel = adj.channel ?? "rgb";
      const blend = clamp01(strength);
      const f = (v: number): number => blendByte(v, applyCurveLUT(v, curve), blend);
      if (channel === "rgb" || channel === "r") for (let x = 0; x < 256; x += 1) lutR[x] = f(lutR[x]!);
      if (channel === "rgb" || channel === "g") for (let x = 0; x < 256; x += 1) lutG[x] = f(lutG[x]!);
      if (channel === "rgb" || channel === "b") for (let x = 0; x < 256; x += 1) lutB[x] = f(lutB[x]!);
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
  const lut = buildCurveLUT({ preset: adj.preset, points: adj.points });
  const channel = adj.channel ?? "rgb";
  const blend = clamp01(strength);
  for (let i = 0; i < data.length; i += 4) {
    if (channel === "rgb" || channel === "r") data[i] = blendByte(data[i]!, applyCurveLUT(data[i]!, lut), blend);
    if (channel === "rgb" || channel === "g") data[i + 1] = blendByte(data[i + 1]!, applyCurveLUT(data[i + 1]!, lut), blend);
    if (channel === "rgb" || channel === "b") data[i + 2] = blendByte(data[i + 2]!, applyCurveLUT(data[i + 2]!, lut), blend);
  }
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

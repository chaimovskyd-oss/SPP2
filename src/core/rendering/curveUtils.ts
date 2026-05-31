/**
 * Tone-curve lookup tables shared by the live (Konva) and export (pixel) paths.
 *
 * A LUT is a Uint8Array(256) mapping input intensity 0..255 → output 0..255.
 * Presets are defined as control points and interpolated with a monotone cubic
 * spline so curves never overshoot (no haloing/banding). Both render paths call
 * buildCurveLUT() / applyCurveLUT() so live preview matches export exactly.
 */

import type { CurvePoint, CurvePresetId } from "@/types/imageAdjustments";

const PRESET_POINTS: Record<CurvePresetId, CurvePoint[]> = {
  linear: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  sCurve: [{ x: 0, y: 0 }, { x: 64, y: 48 }, { x: 128, y: 128 }, { x: 192, y: 208 }, { x: 255, y: 255 }],
  softSCurve: [{ x: 0, y: 0 }, { x: 64, y: 56 }, { x: 128, y: 128 }, { x: 192, y: 200 }, { x: 255, y: 255 }],
  strongSCurve: [{ x: 0, y: 0 }, { x: 64, y: 38 }, { x: 128, y: 128 }, { x: 192, y: 218 }, { x: 255, y: 255 }],
  liftBlacks: [{ x: 0, y: 26 }, { x: 64, y: 78 }, { x: 128, y: 140 }, { x: 255, y: 255 }],
  compress: [{ x: 0, y: 14 }, { x: 128, y: 128 }, { x: 255, y: 240 }],
  // Pull highlights down softly while leaving mids/shadows intact (sun rescue).
  softHighlightCompression: [{ x: 0, y: 0 }, { x: 128, y: 128 }, { x: 192, y: 184 }, { x: 255, y: 236 }],
  // Approximates a default levels remap with slight contrast.
  levelsApprox: [{ x: 0, y: 0 }, { x: 32, y: 24 }, { x: 224, y: 232 }, { x: 255, y: 255 }],
  // Faded film: lifted blacks + rolled-off whites.
  fadeFilm: [{ x: 0, y: 32 }, { x: 128, y: 130 }, { x: 255, y: 228 }],
  matte: [{ x: 0, y: 40 }, { x: 64, y: 84 }, { x: 192, y: 198 }, { x: 255, y: 244 }]
};

const lutCache = new Map<string, Uint8Array>();

/** Build (and cache) a 256-entry LUT from explicit points or a named preset. */
export function buildCurveLUT(input: { preset?: CurvePresetId; points?: CurvePoint[] }): Uint8Array {
  const points = normalizePoints(input.points ?? PRESET_POINTS[input.preset ?? "linear"] ?? PRESET_POINTS.linear);
  const key = (input.points ? "pts:" : "preset:") + JSON.stringify(points);
  const cached = lutCache.get(key);
  if (cached !== undefined) return cached;

  const lut = new Uint8Array(256);
  if (points.length === 1) {
    const y = clampByte(points[0]!.y);
    lut.fill(y);
    lutCache.set(key, lut);
    return lut;
  }

  const slopes = monotoneSlopes(points);
  let segment = 0;
  for (let x = 0; x < 256; x += 1) {
    while (segment < points.length - 2 && x > points[segment + 1]!.x) segment += 1;
    const p0 = points[segment]!;
    const p1 = points[segment + 1]!;
    lut[x] = clampByte(hermite(x, p0, p1, slopes[segment]!, slopes[segment + 1]!));
  }
  lutCache.set(key, lut);
  return lut;
}

/** Apply a LUT to a single 0..255 value (clamps the index). */
export function applyCurveLUT(value: number, lut: Uint8Array): number {
  const index = value < 0 ? 0 : value > 255 ? 255 : value | 0;
  return lut[index]!;
}

// ─── internals ────────────────────────────────────────────────────────────────

function normalizePoints(points: CurvePoint[]): CurvePoint[] {
  const sorted = [...points]
    .map((p) => ({ x: clampByte(p.x), y: clampByte(p.y) }))
    .sort((a, b) => a.x - b.x);
  // Drop duplicate x (keep first); ensure domain endpoints exist.
  const out: CurvePoint[] = [];
  for (const p of sorted) {
    if (out.length > 0 && out[out.length - 1]!.x === p.x) continue;
    out.push(p);
  }
  if (out.length === 0) return [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  if (out[0]!.x > 0) out.unshift({ x: 0, y: out[0]!.y });
  if (out[out.length - 1]!.x < 255) out.push({ x: 255, y: out[out.length - 1]!.y });
  return out;
}

/** Fritsch–Carlson monotone tangents to prevent overshoot. */
function monotoneSlopes(points: CurvePoint[]): number[] {
  const n = points.length;
  const secant = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i += 1) {
    const dx = points[i + 1]!.x - points[i]!.x;
    secant[i] = dx === 0 ? 0 : (points[i + 1]!.y - points[i]!.y) / dx;
  }
  const slopes = new Array<number>(n);
  slopes[0] = secant[0]!;
  slopes[n - 1] = secant[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    const s0 = secant[i - 1]!;
    const s1 = secant[i]!;
    slopes[i] = s0 * s1 <= 0 ? 0 : (s0 + s1) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (secant[i] === 0) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      continue;
    }
    const a = slopes[i]! / secant[i]!;
    const b = slopes[i + 1]! / secant[i]!;
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      slopes[i] = t * a * secant[i]!;
      slopes[i + 1] = t * b * secant[i]!;
    }
  }
  return slopes;
}

function hermite(x: number, p0: CurvePoint, p1: CurvePoint, m0: number, m1: number): number {
  const h = p1.x - p0.x;
  if (h === 0) return p0.y;
  const t = (x - p0.x) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0.y + h10 * h * m0 + h01 * p1.y + h11 * h * m1;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

/** Clear the LUT cache — test helper. */
export function clearCurveLUTCacheForTests(): void {
  lutCache.clear();
}

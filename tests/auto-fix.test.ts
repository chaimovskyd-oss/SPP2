import { describe, it, expect } from "vitest";
import {
  computeAutoFixStats,
  computeAutoFixCorrection,
  blendAutoFixToTemplates,
  blendAutoFixToValues,
  isMeaningfulCorrection,
  AUTO_FIX_LIMITS,
  DEFAULT_AUTO_FIX_TOGGLES
} from "@/core/analysis/autoFix";
import type { ImageAdjustmentTemplate } from "@/types/imageAdjustments";

/** Build a W×H RGBA buffer from a per-pixel colour function (values 0..255). */
function makeBuffer(
  w: number,
  h: number,
  fn: (x: number, y: number) => [number, number, number]
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = fn(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

function correctionFor(buf: Uint8ClampedArray, w: number, h: number) {
  return computeAutoFixCorrection(computeAutoFixStats(buf, w, h));
}

function find<T extends ImageAdjustmentTemplate["type"]>(
  templates: ImageAdjustmentTemplate[],
  type: T
): Extract<ImageAdjustmentTemplate, { type: T }> | undefined {
  return templates.find((t) => t.type === type) as Extract<ImageAdjustmentTemplate, { type: T }> | undefined;
}

const W = 64;
const H = 64;

describe("computeAutoFixCorrection", () => {
  it("brightens a dark image (positive exposure, within safe limit)", () => {
    // mostly dark grey
    const c = correctionFor(makeBuffer(W, H, () => [40, 40, 40]), W, H);
    expect(c.exposure).toBeGreaterThan(0);
    expect(c.exposure).toBeLessThanOrEqual(AUTO_FIX_LIMITS.exposure.max);
  });

  it("does not over-brighten an already-bright image", () => {
    const c = correctionFor(makeBuffer(W, H, () => [225, 225, 225]), W, H);
    expect(c.exposure).toBeLessThanOrEqual(0);
  });

  it("cools a yellow/warm image (negative temperature)", () => {
    const c = correctionFor(makeBuffer(W, H, () => [200, 190, 110]), W, H);
    expect(c.temperature).toBeLessThan(0);
    expect(c.temperature).toBeGreaterThanOrEqual(AUTO_FIX_LIMITS.temperature.min);
  });

  it("warms a blue/cold image (positive temperature)", () => {
    const c = correctionFor(makeBuffer(W, H, () => [110, 150, 210]), W, H);
    expect(c.temperature).toBeGreaterThan(0);
    expect(c.temperature).toBeLessThanOrEqual(AUTO_FIX_LIMITS.temperature.max);
  });

  it("boosts contrast on a flat/low-spread image", () => {
    // all mid-grey around 120..135 → tiny spread
    const c = correctionFor(makeBuffer(W, H, (x) => {
      const v = 120 + (x % 16);
      return [v, v, v];
    }), W, H);
    expect(c.contrast).toBeGreaterThan(0);
    expect(c.contrast).toBeLessThanOrEqual(AUTO_FIX_LIMITS.contrast.max);
  });

  it("does not over-sharpen / over-saturate a screenshot-like graphic", () => {
    // hard black/white checkerboard → bimodal, high spread, no colour
    const c = correctionFor(makeBuffer(W, H, (x, y) => {
      const on = (x + y) % 2 === 0;
      const v = on ? 255 : 0;
      return [v, v, v];
    }), W, H);
    expect(c.sharpen).toBe(0);
    expect(c.vibrance).toBe(0);
    expect(c.saturation).toBe(0);
  });

  it("keeps all outputs within the documented safe ranges", () => {
    const c = correctionFor(makeBuffer(W, H, () => [30, 60, 20]), W, H);
    for (const key of Object.keys(AUTO_FIX_LIMITS) as Array<keyof typeof AUTO_FIX_LIMITS>) {
      expect(c[key]).toBeGreaterThanOrEqual(AUTO_FIX_LIMITS[key].min);
      expect(c[key]).toBeLessThanOrEqual(AUTO_FIX_LIMITS[key].max);
    }
  });
});

describe("blendAutoFixToTemplates / intensity", () => {
  const correction = correctionFor(makeBuffer(W, H, () => [40, 50, 35]), W, H);

  it("intensity 0 yields no adjustments", () => {
    expect(blendAutoFixToTemplates(correction, { intensity: 0, toggles: DEFAULT_AUTO_FIX_TOGGLES })).toHaveLength(0);
  });

  it("intensity scales the result monotonically (60% < 100%)", () => {
    const mid = blendAutoFixToValues(correction, { intensity: 0.6, toggles: DEFAULT_AUTO_FIX_TOGGLES });
    const full = blendAutoFixToValues(correction, { intensity: 1, toggles: DEFAULT_AUTO_FIX_TOGGLES });
    expect(Math.abs(mid.exposure)).toBeLessThanOrEqual(Math.abs(full.exposure));
    expect(mid.exposure).toBeCloseTo(full.exposure * 0.6, 1);
  });

  it("toggles gate their adjustment groups", () => {
    const noColor = blendAutoFixToTemplates(correction, {
      intensity: 1,
      toggles: { ...DEFAULT_AUTO_FIX_TOGGLES, color: false }
    });
    expect(find(noColor, "color")).toBeUndefined();
    const noLight = blendAutoFixToTemplates(correction, {
      intensity: 1,
      toggles: { ...DEFAULT_AUTO_FIX_TOGGLES, lighting: false }
    });
    const tone = find(noLight, "basicTone");
    expect(tone?.exposure ?? 0).toBe(0);
  });

  it("never exceeds safe limits even at full intensity", () => {
    const v = blendAutoFixToValues(correction, { intensity: 1, toggles: DEFAULT_AUTO_FIX_TOGGLES });
    expect(v.contrast).toBeLessThanOrEqual(AUTO_FIX_LIMITS.contrast.max);
    expect(v.shadows).toBeLessThanOrEqual(AUTO_FIX_LIMITS.shadows.max);
  });
});

describe("isMeaningfulCorrection", () => {
  it("is false for an already-balanced image (good midtone, wide unclipped spread, neutral)", () => {
    // smooth neutral gradient 25..230 → median ~0.5, spread ~0.8, no clipping.
    const c = correctionFor(makeBuffer(W, H, (x, y) => {
      const v = Math.round(25 + ((x + y) / (W + H - 2)) * 205);
      return [v, v, v];
    }), W, H);
    expect(isMeaningfulCorrection(c)).toBe(false);
  });

  it("is true for a strongly cast / dark image", () => {
    const c = correctionFor(makeBuffer(W, H, () => [30, 30, 30]), W, H);
    expect(isMeaningfulCorrection(c)).toBe(true);
  });
});

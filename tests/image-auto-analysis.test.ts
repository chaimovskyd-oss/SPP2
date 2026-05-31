import { describe, expect, it } from "vitest";
import {
  analyzeExposure,
  analyzeImageStats,
  analyzeWhiteBalance,
  computeRegionStats,
  suggestFixes,
  type RegionStats
} from "@/core/analysis/imageAutoAnalysis";
import { getPreset } from "@/core/presets/smartPresets";

/** Build a flat RGBA buffer of a solid colour for stats tests. */
function solid(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function stats(over: Partial<RegionStats>): RegionStats {
  return {
    meanR: 0.5,
    meanG: 0.5,
    meanB: 0.5,
    meanLuma: 0.5,
    contrast: 0.2,
    shadowClip: 0,
    highlightClip: 0,
    saturation: 0.2,
    sampleCount: 1000,
    ...over
  };
}

describe("computeRegionStats", () => {
  it("computes channel means for a solid image", () => {
    const s = computeRegionStats(solid(8, 8, 200, 100, 50), 8, 8);
    expect(s.meanR).toBeCloseTo(200 / 255, 3);
    expect(s.meanG).toBeCloseTo(100 / 255, 3);
    expect(s.meanB).toBeCloseTo(50 / 255, 3);
    expect(s.sampleCount).toBe(64);
  });

  it("restricts to a normalized region", () => {
    // left half red, right half blue
    const w = 8;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const left = x < w / 2;
        data[i] = left ? 255 : 0;
        data[i + 2] = left ? 0 : 255;
        data[i + 3] = 255;
      }
    }
    const leftStats = computeRegionStats(data, w, h, { x: 0, y: 0, width: 0.5, height: 1 });
    expect(leftStats.meanR).toBeCloseTo(1, 2);
    expect(leftStats.meanB).toBeCloseTo(0, 2);
  });

  it("ignores fully transparent pixels", () => {
    const data = solid(4, 4, 255, 0, 0);
    for (let i = 0; i < 8; i++) data[i * 4 + 3] = 0; // zero out half the alpha
    const s = computeRegionStats(data, 4, 4);
    expect(s.sampleCount).toBe(8);
    expect(s.meanR).toBeCloseTo(1, 2);
  });
});

describe("analyzeWhiteBalance", () => {
  it("flags a red cast from skin sample", () => {
    const wb = analyzeWhiteBalance({ whole: stats({}), skin: stats({ meanR: 0.7, meanG: 0.45, meanB: 0.42 }) });
    expect(wb.source).toBe("skin");
    expect(wb.cast).toBe("red");
    expect(wb.magnitude).toBeGreaterThan(0.05);
  });

  it("flags a yellow cast when blue is suppressed and warm channels lifted", () => {
    const wb = analyzeWhiteBalance({ whole: stats({ meanR: 0.65, meanG: 0.6, meanB: 0.3 }) });
    expect(wb.cast).toBe("yellow");
  });

  it("flags a blue cast", () => {
    const wb = analyzeWhiteBalance({ whole: stats({ meanR: 0.4, meanG: 0.45, meanB: 0.72 }) });
    expect(wb.cast).toBe("blue");
  });

  it("flags a green cast", () => {
    const wb = analyzeWhiteBalance({ whole: stats({ meanR: 0.42, meanG: 0.7, meanB: 0.44 }) });
    expect(wb.cast).toBe("green");
  });

  it("returns neutral for a balanced sample", () => {
    const wb = analyzeWhiteBalance({ whole: stats({ meanR: 0.5, meanG: 0.5, meanB: 0.49 }) });
    expect(wb.cast).toBe("neutral");
  });

  it("prefers the skin sample over the whole image when present", () => {
    const wb = analyzeWhiteBalance({
      whole: stats({ meanR: 0.5, meanG: 0.5, meanB: 0.5 }),
      skin: stats({ meanR: 0.4, meanG: 0.45, meanB: 0.72 })
    });
    expect(wb.source).toBe("skin");
    expect(wb.cast).toBe("blue");
  });
});

describe("analyzeExposure", () => {
  it("calls a dark image dark", () => {
    const e = analyzeExposure({ whole: stats({ meanLuma: 0.18, contrast: 0.15 }) });
    expect(e.verdict).toBe("dark");
  });

  it("detects backlit when subject is dark and background blown", () => {
    const e = analyzeExposure({
      whole: stats({ meanLuma: 0.55, highlightClip: 0.2 }),
      skin: stats({ meanLuma: 0.2 })
    });
    expect(e.verdict).toBe("backlit");
  });

  it("flags low contrast", () => {
    const e = analyzeExposure({ whole: stats({ meanLuma: 0.5, contrast: 0.05 }) });
    expect(e.verdict).toBe("lowContrast");
  });

  it("returns ok for a well-exposed image", () => {
    const e = analyzeExposure({ whole: stats({ meanLuma: 0.5, contrast: 0.2 }) });
    expect(e.verdict).toBe("ok");
  });
});

describe("suggestFixes recommends existing presets only", () => {
  it("maps a strong red cast to red_cast_rescue", () => {
    const result = analyzeImageStats({ whole: stats({}), skin: stats({ meanR: 0.78, meanG: 0.45, meanB: 0.4 }) });
    const top = result.suggestions[0];
    expect(top?.presetId).toBe("red_cast_rescue");
    expect(getPreset(top!.presetId)).toBeDefined();
    expect(top!.recommendedStrength).toBeGreaterThan(0);
    expect(top!.recommendedStrength).toBeLessThanOrEqual(1);
  });

  it("never suggests a preset id absent from the catalog", () => {
    const result = analyzeImageStats({
      whole: stats({ meanLuma: 0.15, contrast: 0.04, shadowClip: 0.3 }),
      skin: stats({ meanR: 0.8, meanG: 0.42, meanB: 0.38, meanLuma: 0.2 })
    });
    for (const fix of result.suggestions) {
      expect(getPreset(fix.presetId), fix.presetId).toBeDefined();
    }
  });

  it("recommends a general recovery when the image is dull but nothing strong stands out", () => {
    const wb = analyzeWhiteBalance({ whole: stats({ meanR: 0.3, meanG: 0.3, meanB: 0.3 }) });
    const exposure = analyzeExposure({ whole: stats({ meanLuma: 0.32, contrast: 0.1 }) });
    const fixes = suggestFixes(wb, exposure, { whole: stats({ meanLuma: 0.32, contrast: 0.1 }) });
    expect(fixes.some((f) => f.presetId === "whatsapp_recovery" || f.presetId === "haze_removal")).toBe(true);
  });

  it("orders suggestions by descending confidence", () => {
    const result = analyzeImageStats({
      whole: stats({ meanLuma: 0.5, shadowClip: 0.25, contrast: 0.18 }),
      skin: stats({ meanR: 0.82, meanG: 0.42, meanB: 0.38 })
    });
    for (let i = 1; i < result.suggestions.length; i++) {
      expect(result.suggestions[i - 1]!.confidence).toBeGreaterThanOrEqual(result.suggestions[i]!.confidence);
    }
  });
});

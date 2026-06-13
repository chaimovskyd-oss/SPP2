import { describe, expect, it } from "vitest";

import { computeCoverCrop, computePrintPixelSize } from "@/core/printHub/printRender";
import type { PrintPreset } from "@/types/printHub";

const preset10x15: PrintPreset = {
  id: "p", name: "10x15", widthMm: 100, heightMm: 150, dpi: 300, bleedMm: 0,
  finish: "glossy", borderMode: "borderless", copies: 1
};

describe("computePrintPixelSize", () => {
  it("computes exact pixel dims at 300dpi for 10x15cm (gap G5)", () => {
    // 150mm @300dpi = 1772px, 100mm = 1181px
    const portraitSource = computePrintPixelSize(preset10x15, 3000, 4000);
    expect(portraitSource.width).toBe(1181);
    expect(portraitSource.height).toBe(1772);
    expect(portraitSource.rotated).toBe(false); // preset is portrait, source portrait
  });

  it("auto-rotates the target to match a landscape source (gap G6)", () => {
    const landscapeSource = computePrintPixelSize(preset10x15, 4000, 3000);
    expect(landscapeSource.width).toBe(1772);
    expect(landscapeSource.height).toBe(1181);
    expect(landscapeSource.rotated).toBe(true);
  });

  it("adds bleed on every edge", () => {
    const withBleed = computePrintPixelSize({ ...preset10x15, bleedMm: 3 }, 3000, 4000);
    // 156mm @300dpi = 1843px, 106mm = 1252px
    expect(withBleed.height).toBe(1843);
    expect(withBleed.width).toBe(1252);
  });
});

describe("computeCoverCrop", () => {
  it("crops the source to the target aspect, centred", () => {
    const crop = computeCoverCrop(4000, 3000, 1772, 1181);
    // target aspect ~1.5 > source aspect ~1.333 -> crop height
    expect(crop.width).toBe(4000);
    expect(crop.height).toBeLessThan(3000);
    expect(crop.y).toBeGreaterThan(0);
    expect(crop.x).toBe(0);
  });
});

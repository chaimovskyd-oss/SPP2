import { describe, expect, it } from "vitest";
import {
  autoImageContinuityOverscanMm,
  cellFeatherBlurPx,
  maxCellFeatherMm,
  normalizeCellFeather
} from "@/core/rendering/cellFeather";

describe("cell feather rendering helpers", () => {
  it("clamps feather amount to the cell-relative maximum", () => {
    expect(maxCellFeatherMm(100)).toBe(20);
    expect(maxCellFeatherMm(20)).toBe(7);
    expect(normalizeCellFeather({ enabled: true, amountMm: 50, softness: 2 }, 20)).toEqual({
      enabled: true,
      amountMm: 7,
      softness: 1
    });
  });

  it("keeps old or missing projects disabled by default", () => {
    expect(normalizeCellFeather(undefined, 100)).toEqual({
      enabled: false,
      amountMm: 3,
      softness: 0.7
    });
  });

  it("computes bounded auto image continuity overscan from millimeters", () => {
    expect(autoImageContinuityOverscanMm(3, 100)).toBe(3.75);
    expect(autoImageContinuityOverscanMm(20, 40)).toBe(4.8);
  });

  it("lets softness change the blur curve without changing the stored amount", () => {
    expect(cellFeatherBlurPx(10, 0)).toBeCloseTo(3.5);
    expect(cellFeatherBlurPx(10, 1)).toBeCloseTo(12.5);
  });
});

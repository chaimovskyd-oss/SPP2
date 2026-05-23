import { describe, expect, it } from "vitest";
import { analyzeMaskAlpha, buildMaskAwareSlotsFromAnalysis } from "@/core/collage/collageMaskShape";

describe("collage mask shape engine", () => {
  it("analyzes active alpha bounds and usable area", () => {
    const width = 10;
    const height = 8;
    const alpha = new Uint8Array(width * height);
    for (let y = 1; y <= 6; y++) {
      for (let x = 2; x <= 8; x++) alpha[y * width + x] = 255;
    }

    const analysis = analyzeMaskAlpha(alpha, width, height);

    expect(analysis.bounds).toEqual({ x: 2, y: 1, width: 7, height: 6 });
    expect(analysis.activePixels).toBe(42);
    expect(analysis.disconnectedComponents).toBe(1);
    expect(analysis.warnings).not.toContain("Mask has no active pixels.");
  });

  it("creates readable mask-aware slots and falls back for empty masks", () => {
    const slots = buildMaskAwareSlotsFromAnalysis(
      {
        version: 1,
        width: 100,
        height: 100,
        activePixels: 5200,
        activeRatio: 0.52,
        bounds: { x: 15, y: 12, width: 70, height: 76 },
        disconnectedComponents: 1,
        thinness: 0.92,
        warnings: []
      },
      12,
      1000,
      800,
      8,
      20
    );
    const fallback = buildMaskAwareSlotsFromAnalysis(undefined, 6, 1000, 800, 8, 20);

    expect(slots).toHaveLength(12);
    expect(fallback).toHaveLength(6);
    expect(slots.every((slot) => slot.w > 0.03 && slot.h > 0.03)).toBe(true);
  });

  it("covers a wide word-like mask bounds even with a modest image count", () => {
    const slots = buildMaskAwareSlotsFromAnalysis(
      {
        version: 1,
        width: 1000,
        height: 260,
        activePixels: 120000,
        activeRatio: 0.46,
        bounds: { x: 80, y: 50, width: 840, height: 150 },
        disconnectedComponents: 4,
        thinness: 0.18,
        warnings: []
      },
      10,
      1200,
      800,
      0,
      20
    );

    const minX = Math.min(...slots.map((slot) => slot.x));
    const maxX = Math.max(...slots.map((slot) => slot.x + slot.w));
    const minY = Math.min(...slots.map((slot) => slot.y));
    const maxY = Math.max(...slots.map((slot) => slot.y + slot.h));

    expect(slots).toHaveLength(10);
    expect(maxX - minX).toBeGreaterThan(0.65);
    expect(maxY - minY).toBeGreaterThan(0.14);
  });
});

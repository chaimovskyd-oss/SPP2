import { describe, it, expect } from "vitest";
import {
  fitPreviewSize,
  previewCacheKey,
  renderPresetPreviewData,
  presetPreviewAdjustments,
  type PreviewBuffer
} from "@/services/preview/presetPreviewService";
import type { ImageAdjustment } from "@/types/imageAdjustments";

/** Build a tiny solid-color preview buffer (w*h pixels of rgba). */
function solid(width: number, height: number, r: number, g: number, b: number, a = 255): PreviewBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { data, width, height };
}

describe("fitPreviewSize", () => {
  it("returns original size when long edge is within max", () => {
    expect(fitPreviewSize(400, 300, 640)).toEqual({ width: 400, height: 300 });
  });

  it("scales down preserving aspect ratio when long edge exceeds max", () => {
    expect(fitPreviewSize(1280, 640, 640)).toEqual({ width: 640, height: 320 });
  });

  it("scales by the longer edge (portrait)", () => {
    expect(fitPreviewSize(640, 1280, 640)).toEqual({ width: 320, height: 640 });
  });

  it("never goes below 1px", () => {
    const { width, height } = fitPreviewSize(2000, 1, 640);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("guards against zero/negative dimensions", () => {
    expect(fitPreviewSize(0, 0, 640)).toEqual({ width: 1, height: 1 });
    expect(fitPreviewSize(-5, 100, 640)).toEqual({ width: 1, height: 1 });
  });
});

describe("previewCacheKey", () => {
  it("combines src and size into a stable key", () => {
    expect(previewCacheKey("blob:abc", 640)).toBe("blob:abc|640");
  });

  it("differs by size", () => {
    expect(previewCacheKey("x", 512)).not.toBe(previewCacheKey("x", 768));
  });
});

describe("renderPresetPreviewData", () => {
  it("does not mutate the base buffer", () => {
    const base = solid(2, 2, 128, 128, 128);
    const snapshot = Array.from(base.data);
    const adjustments: ImageAdjustment[] = [
      { id: "a1", type: "basicTone", enabled: true, brightness: 50, contrast: 0, exposure: 0, gamma: 1, offset: 0 } as unknown as ImageAdjustment
    ];
    renderPresetPreviewData(base, adjustments);
    expect(Array.from(base.data)).toEqual(snapshot);
  });

  it("returns a buffer with the same dimensions", () => {
    const base = solid(3, 4, 10, 20, 30);
    const out = renderPresetPreviewData(base, []);
    expect(out.width).toBe(3);
    expect(out.height).toBe(4);
    expect(out.data.length).toBe(3 * 4 * 4);
  });

  it("applies a brightening adjustment (output differs from input)", () => {
    const base = solid(2, 2, 100, 100, 100);
    const adjustments: ImageAdjustment[] = [
      { id: "b1", type: "basicTone", enabled: true, brightness: 60, contrast: 0, exposure: 0, gamma: 1, offset: 0 } as unknown as ImageAdjustment
    ];
    const out = renderPresetPreviewData(base, adjustments);
    expect(out.data[0]).toBeGreaterThan(100);
  });

  it("with an empty stack returns identical pixels", () => {
    const base = solid(2, 2, 77, 88, 99);
    const out = renderPresetPreviewData(base, []);
    expect(Array.from(out.data)).toEqual(Array.from(base.data));
  });
});

describe("presetPreviewAdjustments", () => {
  it("returns [] for an unknown preset id", () => {
    expect(presetPreviewAdjustments("__does_not_exist__", 1)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  rotatedAabbSize,
  originForVisualCenter,
  isCenterPivotLayer,
  visualCenterToOrigin
} from "@/core/bounds/bounds";
import { centerToCanvas } from "@/core/transform/alignmentEngine";
import type { Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";

// The visible center of a corner-pivot layer (rect/image/text/frame) is
// origin + R(θ)·(w/2, h/2) — the same convention Konva renders with.
function renderedVisualCenter(x: number, y: number, w: number, h: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const hw = w / 2;
  const hh = h / 2;
  return {
    x: x + hw * Math.cos(rad) - hh * Math.sin(rad),
    y: y + hw * Math.sin(rad) + hh * Math.cos(rad)
  };
}

describe("rotatedAabbSize", () => {
  it("is unchanged at 0°", () => {
    expect(rotatedAabbSize(80, 40, 0)).toEqual({ width: 80, height: 40 });
  });
  it("swaps width/height at 90°", () => {
    const r = rotatedAabbSize(80, 40, 90);
    expect(r.width).toBeCloseTo(40, 6);
    expect(r.height).toBeCloseTo(80, 6);
  });
  it("grows for a 45° square", () => {
    const r = rotatedAabbSize(100, 100, 45);
    expect(r.width).toBeCloseTo(Math.SQRT2 * 100, 6);
  });
});

describe("originForVisualCenter", () => {
  it("reduces to top-left placement at 0°", () => {
    expect(originForVisualCenter(500, 300, 100, 60, 0)).toEqual({ x: 450, y: 270 });
  });
  it("places the rendered visual center exactly at the target for any rotation", () => {
    for (const deg of [15, 37, 90, 180, 270, 333]) {
      const o = originForVisualCenter(500, 300, 120, 80, deg);
      const c = renderedVisualCenter(o.x, o.y, 120, 80, deg);
      expect(c.x).toBeCloseTo(500, 6);
      expect(c.y).toBeCloseTo(300, 6);
    }
  });
});

function image(over: { id: string; x: number; y: number; width: number; height: number; rotation?: number }): VisualLayer {
  return {
    id: over.id,
    type: "image",
    x: over.x,
    y: over.y,
    width: over.width,
    height: over.height,
    rotation: over.rotation ?? 0,
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    metadata: {}
  } as unknown as VisualLayer;
}

function circle(over: { id: string; x: number; y: number; width: number; height: number; rotation?: number }): VisualLayer {
  return { ...image(over), type: "shape", shape: "circle" } as unknown as VisualLayer;
}

describe("isCenterPivotLayer", () => {
  it("is true for circle/ellipse, false otherwise", () => {
    expect(isCenterPivotLayer(circle({ id: "c", x: 0, y: 0, width: 50, height: 50 }))).toBe(true);
    expect(isCenterPivotLayer(image({ id: "i", x: 0, y: 0, width: 50, height: 50 }))).toBe(false);
  });
});

describe("visualCenterToOrigin", () => {
  it("centers a rotated image so its rendered visual center is the page center", () => {
    const layer = image({ id: "i", x: 0, y: 0, width: 200, height: 100, rotation: 90 });
    const o = visualCenterToOrigin(layer, 500, 300);
    const c = renderedVisualCenter(o.x, o.y, 200, 100, 90);
    expect(c.x).toBeCloseTo(500, 6);
    expect(c.y).toBeCloseTo(300, 6);
  });
  it("uses simple center placement for a rotated circle (center pivot)", () => {
    const layer = circle({ id: "c", x: 0, y: 0, width: 80, height: 80, rotation: 90 });
    const o = visualCenterToOrigin(layer, 500, 300);
    expect(o).toEqual({ x: 460, y: 260 });
  });
});

describe("centerToCanvas keeps rotated layers on-canvas", () => {
  const page = { width: 1000, height: 600, layers: [] as VisualLayer[] } as unknown as Page;

  it("centers a rotated image's visual center on the page (regression for off-canvas bug)", () => {
    const layer = image({ id: "bg", x: -300, y: 800, width: 400, height: 200, rotation: 90 });
    const result = centerToCanvas({ page: { ...page, layers: [layer] } as Page, layers: [layer], selectedLayerIds: ["bg"], axis: "both" });
    const out = result.find((l) => l.id === "bg")!;
    const c = renderedVisualCenter(out.x, out.y, 400, 200, 90);
    expect(c.x).toBeCloseTo(500, 6);
    expect(c.y).toBeCloseTo(300, 6);
  });
});

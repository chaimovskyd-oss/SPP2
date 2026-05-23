import { describe, expect, it } from "vitest";
import {
  clipPolyToRect,
  insetPolygon,
  isReadablePolygon,
  polygonArea,
  polygonBBox,
  polygonCentroid,
  polygonToCollageSlot,
} from "@/core/collage/collageGeometryUtils";
import { buildDiagonalBands } from "@/core/collage/collageDiagonal";
import { LAYOUT_REGISTRY, computeSlots } from "@/core/collage/collageLayoutEngine";
import type { CollageSlot } from "@/types/collage";

describe("collage geometry utils", () => {
  it("computes bbox, area, and centroid for a polygon", () => {
    const polygon = [
      { x: 10, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 60 },
      { x: 10, y: 60 },
    ];

    expect(polygonBBox(polygon)).toEqual({ x: 10, y: 20, w: 40, h: 40 });
    expect(polygonArea(polygon)).toBe(1600);
    expect(polygonCentroid(polygon)).toEqual({ x: 30, y: 40 });
  });

  it("clips convex polygons to a rectangular canvas", () => {
    const clipped = clipPolyToRect(
      [
        { x: -20, y: 10 },
        { x: 80, y: 10 },
        { x: 120, y: 90 },
        { x: 10, y: 90 },
      ],
      { x: 0, y: 0, w: 100, h: 100 }
    );

    expect(clipped.length).toBeGreaterThanOrEqual(4);
    expect(clipped.every((p) => p.x >= -0.001 && p.x <= 100.001 && p.y >= -0.001 && p.y <= 100.001)).toBe(true);
  });

  it("insets a polygon toward its centroid", () => {
    const original = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const inset = insetPolygon(original, 10);

    expect(polygonArea(inset)).toBeLessThan(polygonArea(original));
    expect(inset.every((p) => p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100)).toBe(true);
  });

  it("rejects unreadable slivers and converts readable polygons to normalized collage slots", () => {
    expect(isReadablePolygon([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 2 }, { x: 0, y: 2 }])).toBe(false);

    const slot = polygonToCollageSlot(
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 260, y: 300 },
        { x: 80, y: 280 },
      ],
      500,
      400,
      { shape: "diagonalPolygon" }
    );

    expect(slot).not.toBeNull();
    expect(slot?.shape).toBe("diagonalPolygon");
    expect(slot?.x).toBeCloseTo(0.16);
    expect(slot?.shapeParams.vertices?.every((v) => v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1)).toBe(true);
  });

  it("builds diagonal bands with readable clipped polygons", () => {
    const slots = buildDiagonalBands(4, 15, 1200, 800, 18);

    expect(slots).toHaveLength(4);
    expect(slots.every((slot) => slot.shape === "diagonalPolygon")).toBe(true);
    expect(slots.every((slot) => (slot.shapeParams.vertices?.length ?? 0) >= 3)).toBe(true);
    expect(slots.every((slot) => slot.x >= 0 && slot.y >= 0 && slot.x + slot.w <= 1.001 && slot.y + slot.h <= 1.001)).toBe(true);
  });

  it("keeps V6 geometric layout suggestions in conservative image-count ranges", () => {
    const ranges = new Map(LAYOUT_REGISTRY.map((def) => [def.family, { min: def.minImages, max: def.maxImages }]));

    expect(ranges.get("diagonal")).toEqual({ min: 2, max: 8 });
    expect(ranges.get("diamondCenter")).toEqual({ min: 3, max: 30 });
    expect(ranges.get("frameCollage")).toEqual({ min: 5, max: 12 });
    expect(ranges.get("plusCross")).toEqual({ min: 5, max: 9 });
    expect(ranges.get("trapezoidSplit")).toEqual({ min: 3, max: 8 });
    expect(ranges.get("steppedMosaic")).toEqual({ min: 4, max: 16 });
    expect(ranges.get("waveSplit")).toEqual({ min: 2, max: 30 });
  });

  it("builds a frame collage with a large center image and non-overlapping border cells", () => {
    const slots = computeSlots("frameCollage", {
      imageCount: 8,
      canvasW: 1200,
      canvasH: 800,
      spacingPx: 18,
      marginPx: 32,
    });

    expect(slots).toHaveLength(8);
    expect(slots[0].role).toBe("hero");
    expect(slots[0].w * slots[0].h).toBeGreaterThan(0.2);
    expect(hasOverlaps(slots)).toBe(false);
  });

  it("builds diamond as a true polygon composition around a meaningful center", () => {
    const params = { canvasW: 1200, canvasH: 800, spacingPx: 18, marginPx: 32 };
    const diamond5 = computeSlots("diamondCenter", { ...params, imageCount: 5 });
    const diamond9 = computeSlots("diamondCenter", { ...params, imageCount: 9 });

    expect(diamond5).toHaveLength(5);
    expect(diamond9).toHaveLength(9);
    expect([...diamond5, ...diamond9].every((slot) => slot.shape === "polygon")).toBe(true);
    expect([...diamond5, ...diamond9].every(hasNormalizedVertices)).toBe(true);
    expect(diamond5[0].w).toBeGreaterThanOrEqual(0.30);
    expect(diamond5[0].w).toBeLessThanOrEqual(0.46);
    expect(diamond5[0].h).toBeGreaterThanOrEqual(0.25);
    expect(diamond5[0].h).toBeLessThanOrEqual(0.41);
    expect(diamond5[0].shapeParams.vertices).toEqual([
      { x: 0.5, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0, y: 0.5 },
    ]);
    expect([...diamond5, ...diamond9].every(isInsideCanvas)).toBe(true);
  });

  it("supports small and hybrid diamond counts without falling back to rectangles", () => {
    const params = { canvasW: 2480, canvasH: 3508, spacingPx: 6, marginPx: 0 };
    const diamond3 = computeSlots("diamondCenter", { ...params, imageCount: 3 });
    const diamond12 = computeSlots("diamondCenter", { ...params, imageCount: 12 });
    const plus = computeSlots("plusCross", { canvasW: 1200, canvasH: 800, spacingPx: 18, marginPx: 32, imageCount: 9 });

    expect(diamond3).toHaveLength(3);
    expect(diamond12).toHaveLength(12);
    expect(diamond3.every((slot) => slot.shape === "polygon")).toBe(true);
    expect(diamond12.every((slot) => slot.shape === "polygon")).toBe(true);
    expect(diamond12.every(hasNormalizedVertices)).toBe(true);
    expect(diamond12[0].role).toBe("hero");
    expect(diamond12[0].w).toBeGreaterThanOrEqual(0.30);
    expect(diamond12[0].h).toBeGreaterThanOrEqual(0.25);
    expect(diamond12.every(isInsideCanvas)).toBe(true);
    expect(plus).toHaveLength(9);
    expect(hasOverlaps(plus)).toBe(false);
    expect(plus.every(isInsideCanvas)).toBe(true);
  });

  it("builds the V6C trapezoid split with normalized polygon vertices", () => {
    const slots = computeSlots("trapezoidSplit", {
      imageCount: 6,
      canvasW: 1200,
      canvasH: 800,
      spacingPx: 18,
      marginPx: 32,
    });

    expect(slots).toHaveLength(6);
    expect(slots.every((slot) => slot.shape === "diagonalPolygon")).toBe(true);
    expect(slots.every(hasNormalizedVertices)).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });

  it("builds the V6C stepped mosaic as non-overlapping orthogonal slots", () => {
    const slots = computeSlots("steppedMosaic", {
      imageCount: 12,
      canvasW: 1200,
      canvasH: 800,
      spacingPx: 18,
      marginPx: 32,
    });

    expect(slots).toHaveLength(12);
    expect(slots[0].role).toBe("hero");
    expect(slots.every(isInsideCanvas)).toBe(true);
    expect(hasOverlaps(slots)).toBe(false);
  });

  it("builds the V6D wave split as a small-count polygon layout", () => {
    const slots = computeSlots("waveSplit", {
      imageCount: 5,
      canvasW: 1200,
      canvasH: 800,
      spacingPx: 18,
      marginPx: 32,
    });

    expect(slots).toHaveLength(5);
    expect(slots.slice(0, 2).every((slot) => slot.shape === "polygon")).toBe(true);
    expect(slots.slice(0, 2).every(hasNormalizedVertices)).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });

  it("builds wave split as repeated wave blocks for larger image counts", () => {
    const slots = computeSlots("waveSplit", {
      imageCount: 14,
      canvasW: 1200,
      canvasH: 800,
      spacingPx: 18,
      marginPx: 32,
    });

    expect(slots).toHaveLength(14);
    expect(slots.every((slot) => slot.shape === "polygon")).toBe(true);
    expect(slots.every(hasNormalizedVertices)).toBe(true);
    expect(slots.every((slot) => slot.w > 0.08 && slot.h > 0.16)).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });

  it("falls back to a safe grid when a V6 creative family is used outside its range", () => {
    const slots = computeSlots("waveSplit", {
      imageCount: 31,
      canvasW: 1200,
      canvasH: 800,
      spacingPx: 18,
      marginPx: 32,
    });

    expect(slots).toHaveLength(31);
    expect(slots.every((slot) => slot.shape === "rect")).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });

  it("registers the first dynamic collage generator families without a new wizard", () => {
    const ranges = new Map(LAYOUT_REGISTRY.map((def) => [def.family, { min: def.minImages, max: def.maxImages, mode: def.mode }]));

    expect(ranges.get("modularIrregular")).toEqual({ min: 2, max: 80, mode: "creative" });
    expect(ranges.get("heroSupport")).toEqual({ min: 3, max: 40, mode: "creative" });
    expect(ranges.get("organicFlow")).toEqual({ min: 4, max: 24, mode: "creative" });
    expect(ranges.get("waveRibbons")).toEqual({ min: 4, max: 30, mode: "creative" });
    expect(ranges.get("dynamicStrips")).toEqual({ min: 3, max: 40, mode: "creative" });
    expect(ranges.get("softPolygons")).toEqual({ min: 5, max: 24, mode: "creative" });
    expect(ranges.get("amoebaPack")).toEqual({ min: 4, max: 18, mode: "creative" });
    expect(ranges.get("radialHero")).toEqual({ min: 4, max: 20, mode: "creative" });
    expect(ranges.get("freeformClusters")).toEqual({ min: 8, max: 60, mode: "creative" });
    expect(ranges.get("softVoronoi")).toEqual({ min: 5, max: 28, mode: "creative" });
  });

  it("builds modular irregular grid for large image counts with at least one hero cell", () => {
    const slots = computeSlots("modularIrregular", {
      imageCount: 40,
      canvasW: 2480,
      canvasH: 3508,
      spacingPx: 6,
      marginPx: 0,
    });

    expect(slots).toHaveLength(40);
    expect(slots.some((slot) => slot.role === "hero")).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
    expect(slots.every((slot) => slot.w > 0.03 && slot.h > 0.03)).toBe(true);
  });

  it("builds hero support as editable frame cells that preserve a large hero", () => {
    const slots = computeSlots("heroSupport", {
      imageCount: 12,
      canvasW: 1600,
      canvasH: 1000,
      spacingPx: 10,
      marginPx: 20,
    });

    expect(slots).toHaveLength(12);
    expect(slots[0].role).toBe("hero");
    expect(slots[0].w * slots[0].h).toBeGreaterThan(0.25);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });

  it("builds organic flow with polygon masks and normalized vertices", () => {
    const slots = computeSlots("organicFlow", {
      imageCount: 14,
      canvasW: 1600,
      canvasH: 1000,
      spacingPx: 10,
      marginPx: 20,
    });

    expect(slots).toHaveLength(14);
    expect(slots.every((slot) => slot.shape === "polygon")).toBe(true);
    expect(slots.every(hasNormalizedVertices)).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });

  it("builds wave ribbons as distinct polygon slots without using wave split limits", () => {
    const slots = computeSlots("waveRibbons", {
      imageCount: 20,
      canvasW: 1600,
      canvasH: 1000,
      spacingPx: 8,
      marginPx: 24,
    });

    expect(slots).toHaveLength(20);
    expect(slots.every((slot) => slot.shape === "polygon")).toBe(true);
    expect(slots.every(hasNormalizedVertices)).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });

  it("builds dynamic strips for large counts while keeping readable cells", () => {
    const slots = computeSlots("dynamicStrips", {
      imageCount: 32,
      canvasW: 2480,
      canvasH: 3508,
      spacingPx: 6,
      marginPx: 0,
    });

    expect(slots).toHaveLength(32);
    expect(slots.every(isInsideCanvas)).toBe(true);
    expect(slots.every((slot) => slot.w > 0.03 && slot.h > 0.03)).toBe(true);
  });

  it("builds soft polygon packing with normalized polygon vertices", () => {
    const slots = computeSlots("softPolygons", {
      imageCount: 16,
      canvasW: 1600,
      canvasH: 1000,
      spacingPx: 10,
      marginPx: 20,
    });

    expect(slots).toHaveLength(16);
    expect(slots.every((slot) => slot.shape === "polygon")).toBe(true);
    expect(slots.every(hasNormalizedVertices)).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });

  it("builds amoeba pack with bounded editable polygon masks", () => {
    const slots = computeSlots("amoebaPack", {
      imageCount: 10,
      canvasW: 1000,
      canvasH: 1000,
      spacingPx: 12,
      marginPx: 20,
    });

    expect(slots).toHaveLength(10);
    expect(slots.every((slot) => slot.shape === "polygon")).toBe(true);
    expect(slots.every(hasNormalizedVertices)).toBe(true);
    expect(slots.every((slot) => (slot.shapeParams.vertices ?? []).length <= 10)).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });

  it("builds radial hero with a meaningful center and polygon ring supports", () => {
    const slots = computeSlots("radialHero", {
      imageCount: 12,
      canvasW: 1600,
      canvasH: 1000,
      spacingPx: 8,
      marginPx: 20,
    });

    expect(slots).toHaveLength(12);
    expect(slots[0].role).toBe("hero");
    expect(slots[0].w * slots[0].h).toBeGreaterThan(0.08);
    expect(slots.every((slot) => slot.shape === "polygon")).toBe(true);
    expect(slots.every(hasNormalizedVertices)).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });

  it("builds freeform clusters for larger image sets without tiny cells", () => {
    const slots = computeSlots("freeformClusters", {
      imageCount: 36,
      canvasW: 2480,
      canvasH: 3508,
      spacingPx: 6,
      marginPx: 0,
    });

    expect(slots).toHaveLength(36);
    expect(slots.some((slot) => slot.role === "hero")).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
    expect(slots.every((slot) => slot.w > 0.03 && slot.h > 0.03)).toBe(true);
  });

  it("builds soft voronoi as clipped readable polygon cells", () => {
    const slots = computeSlots("softVoronoi", {
      imageCount: 18,
      canvasW: 1600,
      canvasH: 1000,
      spacingPx: 8,
      marginPx: 20,
    });

    expect(slots).toHaveLength(18);
    expect(slots.every((slot) => slot.shape === "polygon")).toBe(true);
    expect(slots.every(hasNormalizedVertices)).toBe(true);
    expect(slots.every((slot) => (slot.shapeParams.vertices ?? []).length <= 12)).toBe(true);
    expect(slots.every(isInsideCanvas)).toBe(true);
  });
});

function hasOverlaps(slots: CollageSlot[]): boolean {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (rectsOverlap(slots[i], slots[j])) return true;
    }
  }
  return false;
}

function rectsOverlap(a: CollageSlot, b: CollageSlot): boolean {
  const epsilon = 0.0001;
  return (
    a.x < b.x + b.w - epsilon &&
    a.x + a.w > b.x + epsilon &&
    a.y < b.y + b.h - epsilon &&
    a.y + a.h > b.y + epsilon
  );
}

function hasNormalizedVertices(slot: CollageSlot): boolean {
  const vertices = slot.shapeParams.vertices ?? [];
  return vertices.length >= 3 && vertices.every((v) => v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1);
}

function isInsideCanvas(slot: CollageSlot): boolean {
  return slot.x >= -0.001 && slot.y >= -0.001 && slot.x + slot.w <= 1.001 && slot.y + slot.h <= 1.001;
}

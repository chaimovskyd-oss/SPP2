import { describe, expect, it } from "vitest";
import { alignLayers, centerToCanvas } from "@/core/transform/alignmentEngine";
import type { Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";

// Minimal synthetic factories — the alignment engine only reads geometry and the
// visible/locked flags, so partial casts are sufficient.
function shape(over: { id: string; x: number; y: number; width: number; height: number; locked?: boolean; visible?: boolean }): VisualLayer {
  return {
    id: over.id,
    type: "shape",
    shape: "rect",
    x: over.x,
    y: over.y,
    width: over.width,
    height: over.height,
    rotation: 0,
    zIndex: 0,
    visible: over.visible ?? true,
    locked: over.locked ?? false,
    opacity: 1
  } as unknown as VisualLayer;
}

function makePage(layers: VisualLayer[]): Page {
  return { width: 1000, height: 600, layers } as unknown as Page;
}

describe("centerToCanvas", () => {
  it("centers a single layer on both axes of the page", () => {
    const a = shape({ id: "a", x: 0, y: 0, width: 100, height: 60 });
    const page = makePage([a]);
    const result = centerToCanvas({ page, layers: page.layers, selectedLayerIds: ["a"], axis: "both" });
    const out = result.find((l) => l.id === "a")!;
    expect(out.x).toBeCloseTo(450, 6); // (1000 - 100) / 2
    expect(out.y).toBeCloseTo(270, 6); // (600 - 60) / 2
  });

  it("centers only the requested axis", () => {
    const a = shape({ id: "a", x: 10, y: 20, width: 100, height: 60 });
    const page = makePage([a]);
    const x = centerToCanvas({ page, layers: page.layers, selectedLayerIds: ["a"], axis: "x" }).find((l) => l.id === "a")!;
    expect(x.x).toBeCloseTo(450, 6);
    expect(x.y).toBe(20); // untouched
  });

  it("does not move locked layers", () => {
    const a = shape({ id: "a", x: 0, y: 0, width: 100, height: 60, locked: true });
    const page = makePage([a]);
    const out = centerToCanvas({ page, layers: page.layers, selectedLayerIds: ["a"], axis: "both" }).find((l) => l.id === "a")!;
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});

describe("alignLayers (multi-selection → selection bounds)", () => {
  it("aligns all selected to the left edge of the selection box", () => {
    const a = shape({ id: "a", x: 100, y: 0, width: 50, height: 50 });
    const b = shape({ id: "b", x: 300, y: 0, width: 50, height: 50 });
    const page = makePage([a, b]);
    const result = alignLayers({ page, layers: page.layers, selectedLayerIds: ["a", "b"], command: "left" });
    expect(result.find((l) => l.id === "a")!.x).toBe(100);
    expect(result.find((l) => l.id === "b")!.x).toBe(100);
  });

  it("distributeX keeps the first and last layers in place", () => {
    const a = shape({ id: "a", x: 0, y: 0, width: 40, height: 40 });
    const b = shape({ id: "b", x: 70, y: 0, width: 40, height: 40 });
    const c = shape({ id: "c", x: 400, y: 0, width: 40, height: 40 });
    const page = makePage([a, b, c]);
    const result = alignLayers({ page, layers: page.layers, selectedLayerIds: ["a", "b", "c"], command: "distributeX" });
    expect(result.find((l) => l.id === "a")!.x).toBe(0);
    expect(result.find((l) => l.id === "c")!.x).toBe(400);
    // middle re-spaced to equalize gaps: span 440, total width 120 → gap 160; b.x = 40 + 160 = 200
    expect(result.find((l) => l.id === "b")!.x).toBeCloseTo(200, 6);
  });
});

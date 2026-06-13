import { describe, expect, it } from "vitest";
import { createPage } from "@/core/document/factory";
import { createDocument } from "@/core/document/factory";
import { createImageLayer, createTextLayer } from "@/core/layers/factory";
import { getPagePreset, pageSetupFromPreset } from "@/core/pageSetup/presets";
import { mmToPx } from "@/core/units/conversion";
import {
  applyRepeatToDocument,
  buildRepeatResult,
  captureDesignUnit,
  emitUnitInstance,
  type RepeatOptions
} from "@/features/smartLayout";
import type { Document, Page } from "@/types/document";
import type { ImageLayer, VisualLayer } from "@/types/layers";

const A4 = pageSetupFromPreset(getPagePreset("a4"), "portrait"); // 2480×3508 @ 300dpi

function baseOptions(overrides: Partial<RepeatOptions> = {}): RepeatOptions {
  return {
    calcMode: "copiesPerPage",
    marginsMm: 0,
    gapMm: 0,
    allowRotate: false,
    cutLines: "none",
    dpi: A4.dpi,
    replaceOriginal: true,
    ...overrides
  };
}

function pageWithImage(rect = { x: 800, y: 1000, width: 600, height: 600 }): { page: Page; layerId: string } {
  const layer = createImageLayer({ rect, assetId: "asset-1", fitMode: "fit" });
  const page = createPage({ name: "Test", setup: A4, layers: [layer] });
  return { page, layerId: layer.id };
}

function noOverlap(items: { xPx: number; yPx: number; widthPx: number; heightPx: number }[]): boolean {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      const overlapX = a.xPx < b.xPx + b.widthPx - 0.5 && b.xPx < a.xPx + a.widthPx - 0.5;
      const overlapY = a.yPx < b.yPx + b.heightPx - 0.5 && b.yPx < a.yPx + a.heightPx - 0.5;
      if (overlapX && overlapY) return false;
    }
  }
  return true;
}

describe("Smart Repeat — repeatGridSolver", () => {
  it("copiesPerPage 24 on A4 gap 0 → grid that holds ≥24 cells with no overlap", () => {
    const { page, layerId } = pageWithImage();
    const unit = captureDesignUnit(page, [layerId]);
    expect(unit).not.toBeNull();
    const { plan, result } = buildRepeatResult(unit!, baseOptions({ copiesPerPage: 24 }), page.width, page.height);

    expect(plan.cols * plan.rows).toBeGreaterThanOrEqual(24);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].items.length).toBe(24);
    expect(noOverlap(result.pages[0].items)).toBe(true);
    expect(plan.warnings).toHaveLength(0);
  });

  it("unitSizeMm 50×50 on A4 margins 0 → 4 cols × 5 rows = 20 per page", () => {
    const { page, layerId } = pageWithImage();
    const unit = captureDesignUnit(page, [layerId])!;
    const solved = buildRepeatResult(
      unit,
      baseOptions({ calcMode: "unitSizeMm", unitWidthMm: 50, unitHeightMm: 50 }),
      page.width,
      page.height
    ).plan;

    expect(solved.cols).toBe(4);
    expect(solved.rows).toBe(5);
    expect(solved.perPage).toBe(20);
    expect(solved.totalPages).toBe(1);
  });

  it("totalCopies 180 at 50×50 on A4 → 9 pages of 20, full last page", () => {
    const { page, layerId } = pageWithImage();
    const unit = captureDesignUnit(page, [layerId])!;
    const { plan, result } = buildRepeatResult(
      unit,
      baseOptions({ calcMode: "totalCopies", unitWidthMm: 50, unitHeightMm: 50, totalCopies: 180 }),
      page.width,
      page.height
    );
    expect(plan.perPage).toBe(20);
    expect(plan.totalPages).toBe(9);
    expect(plan.lastPageCount).toBe(20);
    expect(result.pages).toHaveLength(9);
    expect(result.pages.at(-1)!.items.length).toBe(20);
  });

  it("totalCopies 186 at 50×50 → 10 pages, partial last page of 6", () => {
    const { page, layerId } = pageWithImage();
    const unit = captureDesignUnit(page, [layerId])!;
    const { plan, result } = buildRepeatResult(
      unit,
      baseOptions({ calcMode: "totalCopies", unitWidthMm: 50, unitHeightMm: 50, totalCopies: 186 }),
      page.width,
      page.height
    );
    expect(plan.totalPages).toBe(10);
    expect(plan.lastPageCount).toBe(6);
    expect(result.pages.at(-1)!.items.length).toBe(6);
    expect(result.pages.at(-1)!.isPartial).toBe(true);
  });

  it("warns when the unit is larger than the usable page", () => {
    const { page, layerId } = pageWithImage();
    const unit = captureDesignUnit(page, [layerId])!;
    const { plan } = buildRepeatResult(
      unit,
      baseOptions({ calcMode: "unitSizeMm", unitWidthMm: 500, unitHeightMm: 500 }),
      page.width,
      page.height
    );
    expect(plan.perPage).toBe(0);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});

describe("Smart Repeat — emitUnitInstance", () => {
  it("scales a single image into the cell, preserving aspect (letterbox centred)", () => {
    const { page, layerId } = pageWithImage({ x: 0, y: 0, width: 600, height: 300 });
    const unit = captureDesignUnit(page, [layerId])!;
    const cell = { x: 100, y: 200, width: 300, height: 300 };
    const [layer] = emitUnitInstance(unit, cell, false, 10, 0) as ImageLayer[];
    // aspect 2:1 unit into 300×300 cell → scale 0.5 → 300×150, centred vertically.
    expect(layer.width).toBeCloseTo(300, 1);
    expect(layer.height).toBeCloseTo(150, 1);
    expect(layer.x).toBeCloseTo(100, 1);
    expect(layer.y).toBeCloseTo(275, 1);
    expect(layer.assetId).toBe("asset-1");
  });

  it("preserves internal relative positions for a 2-layer unit (golden)", () => {
    const a = createImageLayer({ rect: { x: 100, y: 100, width: 400, height: 400 }, assetId: "a", fitMode: "fit" });
    const b = createImageLayer({ rect: { x: 150, y: 520, width: 300, height: 80 }, assetId: "b", fitMode: "fit" });
    const page = createPage({ name: "T", setup: A4, layers: [a, b] });
    const unit = captureDesignUnit(page, [a.id, b.id])!;
    // unit bbox: x100..500 width400, y100..600 height500 → aspect 0.8
    expect(unit.bboxPx.width).toBeCloseTo(400, 1);
    expect(unit.bboxPx.height).toBeCloseTo(500, 1);

    const cell = { x: 0, y: 0, width: 200, height: 250 }; // same aspect → scale 0.5
    const layers = emitUnitInstance(unit, cell, false, 0, 0);
    const outA = layers.find((l) => (l as ImageLayer).assetId === "a")!;
    const outB = layers.find((l) => (l as ImageLayer).assetId === "b")!;

    // a rel (0,0) size 400 → (0,0) size 200
    expect(outA.x).toBeCloseTo(0, 1);
    expect(outA.y).toBeCloseTo(0, 1);
    expect(outA.width).toBeCloseTo(200, 1);
    // b rel (50,420) size (300,80) → (25,210) size (150,40)
    expect(outB.x).toBeCloseTo(25, 1);
    expect(outB.y).toBeCloseTo(210, 1);
    expect(outB.width).toBeCloseTo(150, 1);
    expect(outB.height).toBeCloseTo(40, 1);
  });

  it("scales text fontSize by the same uniform factor as the cell", () => {
    const txt = createTextLayer({ rect: { x: 0, y: 0, width: 400, height: 200 }, text: "Hi" });
    txt.fontSize = 40;
    const page = createPage({ name: "T", setup: A4, layers: [txt] });
    const unit = captureDesignUnit(page, [txt.id])!;
    // Build a cell at exactly half the captured footprint → scale 0.5.
    const cell = { x: 0, y: 0, width: unit.bboxPx.width * 0.5, height: unit.bboxPx.height * 0.5 };
    const [out] = emitUnitInstance(unit, cell, false, 0, 0) as (VisualLayer & { fontSize: number })[];
    expect(out.fontSize).toBeCloseTo(20, 1);
  });

  it("gives every emitted copy fresh ids", () => {
    const { page, layerId } = pageWithImage();
    const unit = captureDesignUnit(page, [layerId])!;
    const a = emitUnitInstance(unit, { x: 0, y: 0, width: 100, height: 100 }, false, 0, 0);
    const b = emitUnitInstance(unit, { x: 0, y: 0, width: 100, height: 100 }, false, 1, 1);
    expect(a[0].id).not.toBe(b[0].id);
    expect(a[0].id).not.toBe(layerId);
  });
});

describe("Smart Repeat — applyRepeatToDocument", () => {
  function docWith(page: Page): Document {
    return createDocument({ name: "Doc", dpi: A4.dpi, pages: [page] });
  }

  it("replaceOriginal removes the source and fills one page with copies + reuses one asset", () => {
    const { page, layerId } = pageWithImage();
    const doc = docWith(page);
    const next = applyRepeatToDocument(doc, {
      pageId: page.id,
      selectedLayerIds: [layerId],
      options: baseOptions({ copiesPerPage: 24 })
    });
    expect(next.pages).toHaveLength(1);
    const layers = next.pages[0].layers;
    // original removed; 24 image copies present
    expect(layers.find((l) => l.id === layerId)).toBeUndefined();
    const images = layers.filter((l) => l.type === "image");
    expect(images).toHaveLength(24);
    // all copies reference the single original asset
    expect(new Set((images as ImageLayer[]).map((l) => l.assetId))).toEqual(new Set(["asset-1"]));
  });

  it("keepOriginal leaves the source layer in place", () => {
    const { page, layerId } = pageWithImage();
    const next = applyRepeatToDocument(docWith(page), {
      pageId: page.id,
      selectedLayerIds: [layerId],
      options: baseOptions({ copiesPerPage: 6, replaceOriginal: false })
    });
    expect(next.pages[0].layers.find((l) => l.id === layerId)).toBeDefined();
  });

  it("totalCopies creates the right number of pages spliced after the source page", () => {
    const { page, layerId } = pageWithImage();
    const next = applyRepeatToDocument(docWith(page), {
      pageId: page.id,
      selectedLayerIds: [layerId],
      options: baseOptions({ calcMode: "totalCopies", unitWidthMm: 50, unitHeightMm: 50, totalCopies: 50 })
    });
    // 20 per page → 3 pages (20,20,10)
    expect(next.pages).toHaveLength(3);
    expect(next.pages[2].layers.filter((l) => l.type === "image")).toHaveLength(10);
  });

  it("adds exactly one shared cut-line overlay per page when enabled", () => {
    const { page, layerId } = pageWithImage();
    const next = applyRepeatToDocument(docWith(page), {
      pageId: page.id,
      selectedLayerIds: [layerId],
      options: baseOptions({ copiesPerPage: 9, cutLines: "hairlineGrid" })
    });
    const overlays = next.pages[0].layers.filter(
      (l) => l.type === "shape" && l.metadata["smartLayoutCutLines"] === true
    );
    expect(overlays).toHaveLength(1);
    const overlay = overlays[0] as VisualLayer & { pathData?: string };
    expect(typeof overlay.pathData).toBe("string");
    expect(overlay.pathData!.length).toBeGreaterThan(0);
  });
});

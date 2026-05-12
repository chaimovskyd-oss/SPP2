import { describe, expect, it } from "vitest";
import {
  PAGE_PRESETS,
  alignLayers,
  buildSnapTargets,
  createDocument,
  createFrameLayer,
  createPage,
  getPagePreset,
  mmToPx,
  pageSetupFromPreset,
  pxToMm,
  snapLayerPosition
} from "@/core";

describe("Phase 1A document environment foundation", () => {
  it("converts units through one shared DPI-aware engine", () => {
    expect(mmToPx(25.4, 300)).toBeCloseTo(300, 4);
    expect(pxToMm(300, 300)).toBeCloseTo(25.4, 4);
  });

  it("creates print-aware page setup from presets in internal px at document DPI", () => {
    const setup = pageSetupFromPreset(getPagePreset("a4"));
    const page = createPage({ setup });
    const document = createDocument({ name: "A4", dpi: setup.dpi, pages: [page] });

    expect(PAGE_PRESETS.length).toBeGreaterThanOrEqual(15);
    expect(page.width).toBeCloseTo(2480, 0);
    expect(page.height).toBeCloseTo(3508, 0);
    expect(document.viewport.fitMode).toBe("fitPage");
    expect(page.setup.units).toBe("mm");
  });

  it("builds snap targets and snaps layer movement to page center", () => {
    const page = createPage({ setup: pageSetupFromPreset(getPagePreset("a4")) });
    const layer = createFrameLayer({
      rect: {
        x: 100,
        y: 100,
        width: 200,
        height: 100
      }
    });
    const targets = buildSnapTargets(page, [], page.setup.snapSettings);
    const result = snapLayerPosition({
      layer,
      page,
      layers: [layer],
      x: page.width / 2 - 100 + 3,
      y: 100,
      settings: page.setup.snapSettings
    });

    expect(targets.some((target) => target.label === "page-center-x")).toBe(true);
    expect(result.x).toBeCloseTo(page.width / 2 - 100, 4);
    expect(result.lines.some((line) => line.label === "page-center-x")).toBe(true);
  });

  it("magnetically snaps a layer into equal horizontal spacing", () => {
    const page = createPage({ setup: pageSetupFromPreset(getPagePreset("letter")) });
    const left = createFrameLayer({ rect: { x: 100, y: 100, width: 100, height: 100 } });
    const moving = createFrameLayer({ rect: { x: 280, y: 100, width: 100, height: 100 } });
    const right = createFrameLayer({ rect: { x: 500, y: 100, width: 100, height: 100 } });
    const result = snapLayerPosition({
      layer: moving,
      page,
      layers: [left, moving, right],
      x: 298,
      y: 100,
      settings: { ...page.setup.snapSettings, snapTolerance: 12 }
    });

    expect(result.x).toBe(300);
    expect(result.lines.some((line) => line.label === "spacing-x")).toBe(true);
  });

  it("aligns selected layers through the shared transform alignment engine", () => {
    const page = createPage({ setup: pageSetupFromPreset(getPagePreset("letter")) });
    const a = createFrameLayer({ rect: { x: 100, y: 120, width: 100, height: 100 } });
    const b = createFrameLayer({ rect: { x: 260, y: 200, width: 120, height: 80 } });
    const layers = alignLayers({
      page: { ...page, layers: [a, b] },
      layers: [a, b],
      selectedLayerIds: [a.id, b.id],
      command: "top"
    });

    expect(layers.find((layer) => layer.id === b.id)?.y).toBe(120);
  });
});

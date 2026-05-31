import { describe, expect, it } from "vitest";
import {
  buildRenderModel,
  createAdjustmentLayer,
  createImageLayer,
  createProjectEnvelope,
  normalizeProjectEnvelope,
  parseProject,
  serializeProject
} from "@/core";
import { canRenderPageOffscreen, getOffscreenRenderWarnings } from "@/core/rendering/offscreenPageRenderer";
import { createFreeModeDocument } from "@/ui/projectActions";
import { PROJECT_SCHEMA_VERSION } from "@/types/project";
import {
  ENABLE_CLASSIC_ADJUSTMENT_LAYER_RENDERING,
  ENABLE_FULL_PAGE_ADJUSTMENT_CACHE
} from "@/core/features/adjustmentFlags";

describe("adjustment layers", () => {
  it("creates a non-destructive brightness/contrast adjustment layer", () => {
    const layer = createAdjustmentLayer({ brightness: 20, contrast: -10, zIndex: 3 });

    expect(layer.type).toBe("adjustment-layer");
    expect(layer.zIndex).toBe(3);
    expect(layer.targetMode).toBe("below");
    expect(layer.blendMode).toBe("normal");
    expect(layer.adjustments).toEqual([
      { type: "brightnessContrast", brightness: 20, contrast: -10 }
    ]);
  });

  it("creates each supported adjustment operation without baking it into image effects", () => {
    const operations = [
      { type: "exposure" as const, exposure: 1, gamma: 1, offset: 0 },
      { type: "hueSaturation" as const, hue: 30, saturation: 20, lightness: -10 },
      { type: "blackWhite" as const, enabled: true },
      { type: "invert" as const, enabled: true },
      { type: "levels" as const, black: 8, mid: 1.1, white: 240 }
    ];

    for (const operation of operations) {
      const layer = createAdjustmentLayer({ operation });
      expect(layer.type).toBe("adjustment-layer");
      expect(layer.adjustments).toEqual([operation]);
      expect(layer.name).not.toBe("");
    }
  });

  it("round-trips adjustment layers through project serialization", () => {
    const document = createFreeModeDocument("Adjustment");
    const page = document.pages[0];
    if (page === undefined) throw new Error("missing page");
    const adjustment = createAdjustmentLayer({ zIndex: 0, brightness: 12, contrast: 30 });
    const envelope = createProjectEnvelope({
      document: { ...document, pages: [{ ...page, layers: [adjustment] }] },
      linkedGroups: [],
      batchJobs: []
    });

    const parsed = parseProject(serializeProject(envelope));
    const layer = parsed.document.pages[0]?.layers[0];

    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(layer?.type).toBe("adjustment-layer");
    if (layer?.type !== "adjustment-layer") throw new Error("wrong layer type");
    expect(layer.adjustments[0]).toMatchObject({ brightness: 12, contrast: 30 });
  });

  it("normalizes legacy adjustment-like layers without touching existing projects", () => {
    const document = createFreeModeDocument("Legacy");
    const page = document.pages[0];
    if (page === undefined) throw new Error("missing page");
    const legacy = {
      ...createAdjustmentLayer({ zIndex: 0 }),
      targetMode: undefined,
      adjustments: []
    } as unknown as ReturnType<typeof createAdjustmentLayer>;
    const envelope = createProjectEnvelope({
      document: { ...document, pages: [{ ...page, layers: [legacy] }] },
      linkedGroups: [],
      batchJobs: []
    });

    const normalized = normalizeProjectEnvelope({ ...envelope, schemaVersion: 12 });
    const layer = normalized.document.pages[0]?.layers[0];

    expect(layer?.type).toBe("adjustment-layer");
    if (layer?.type !== "adjustment-layer") throw new Error("wrong layer type");
    expect(layer.targetMode).toBe("below");
    expect(layer.adjustments).toHaveLength(1);
  });

  it("includes adjustment layers in render models without requiring assets", () => {
    const document = createFreeModeDocument("Render");
    const page = document.pages[0];
    if (page === undefined) throw new Error("missing page");
    const adjustment = createAdjustmentLayer({ zIndex: 0 });
    const model = buildRenderModel({ ...page, layers: [adjustment] }, [], "export");

    expect(model.layers).toHaveLength(1);
    expect(model.layers[0]?.asset).toBeUndefined();
  });

  it("keeps classic adjustment rendering disabled in Safe Mode", () => {
    // Phase 0: legacy full-page-cache rendering must stay off until a proper
    // CompositeRenderer replaces it. These flags guard the unstable path.
    expect(ENABLE_CLASSIC_ADJUSTMENT_LAYER_RENDERING).toBe(false);
    expect(ENABLE_FULL_PAGE_ADJUSTMENT_CACHE).toBe(false);
  });

  it("marks image plus adjustment pages as eligible for offscreen export", () => {
    const document = createFreeModeDocument("Offscreen");
    const page = document.pages[0];
    if (page === undefined) throw new Error("missing page");
    const image = createImageLayer({
      assetId: "asset-1",
      rect: { x: 0, y: 0, width: 100, height: 80 },
      zIndex: 0
    });
    const adjustment = createAdjustmentLayer({
      zIndex: 1,
      operation: { type: "invert", enabled: true }
    });
    const testPage = { ...page, layers: [image, adjustment] };

    expect(getOffscreenRenderWarnings(testPage)).toEqual([]);
    expect(canRenderPageOffscreen(testPage)).toBe(true);
  });
});

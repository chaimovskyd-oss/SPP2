import { describe, expect, it } from "vitest";
import {
  buildRenderModel,
  createAdjustmentLayer,
  createProjectEnvelope,
  normalizeProjectEnvelope,
  parseProject,
  serializeProject
} from "@/core";
import { createFreeModeDocument } from "@/ui/projectActions";
import { PROJECT_SCHEMA_VERSION } from "@/types/project";

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
});

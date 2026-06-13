import { describe, expect, it } from "vitest";
import { createImageLayer } from "@/core/layers/factory";
import { collectLayerEdits, countLayerEdits, hasDisabledLayerEdits } from "@/core/layerEdits/collectLayerEdits";
import { getLayerEditAdapter } from "@/core/layerEdits/registry";
import { resolveEffectiveLayer } from "@/core/layerEdits/resolveEffectiveLayer";
import { setAllLayerEditsEnabled, resetAllLayerEdits } from "@/core/layerEdits/bulkOps";
import { createImageAdjustment, type ImageAdjustmentStack } from "@/types/imageAdjustments";
import type { ImageLayer } from "@/types/layers";
import type { VisualEffectStack } from "@/types/visualEffects";

function imageLayer(): ImageLayer {
  return createImageLayer({ rect: { x: 0, y: 0, width: 100, height: 100 }, assetId: "asset_1" });
}

const visualEffects: VisualEffectStack = {
  version: 1,
  enabled: true,
  effects: [
    { version: 1, id: "vfx_1", enabled: true, params: { type: "dropShadow", color: "#000", opacity: 0.3, offsetX: 0, offsetY: 8, blur: 16, spread: 0 } }
  ]
};

/** Image layer carrying: a manual contrast adjustment, a legacy sepia, and a drop shadow. */
function mixedLayer(): ImageLayer {
  const contrast = createImageAdjustment({ type: "basicTone", contrast: 20 });
  const stack: ImageAdjustmentStack = { enabled: true, stack: [contrast] };
  return {
    ...imageLayer(),
    imageAdjustments: stack,
    visualEffects,
    effects: { ...imageLayer().effects, sepia: true }
  };
}

describe("collectLayerEdits", () => {
  it("aggregates edits from every source into one flat list", () => {
    const edits = collectLayerEdits(mixedLayer());
    const sources = edits.map((e) => e.source).sort();
    expect(sources).toEqual(["imageAdjustment", "legacyEffect", "visualEffect"]);
    expect(countLayerEdits(mixedLayer())).toBe(3);
  });

  it("summarizes a manual adjustment", () => {
    const edit = collectLayerEdits(mixedLayer()).find((e) => e.source === "imageAdjustment");
    expect(edit?.summary).toContain("+20");
    expect(edit?.enabled).toBe(true);
  });

  it("groups generated adjustments under one preset row", () => {
    const generated = createImageAdjustment({ type: "color", saturation: 30 });
    const layer: ImageLayer = {
      ...imageLayer(),
      imageAdjustments: {
        enabled: true,
        stack: [generated],
        presetInstances: [
          { id: "preset_1", presetId: "vintage", name: "וינטג'", appliedAt: 0, strength: 1, targetMode: "singleImage", editable: true, generatedAdjustments: [generated.id] }
        ]
      }
    };
    const edits = collectLayerEdits(layer);
    // One preset row, and the generated adjustment is NOT listed separately.
    expect(edits).toHaveLength(1);
    expect(edits[0]?.source).toBe("preset");
    expect(edits[0]?.summary).toBe("וינטג'");
  });

  it("reports an empty list for a clean layer", () => {
    expect(countLayerEdits(imageLayer())).toBe(0);
    expect(collectLayerEdits(imageLayer())).toEqual([]);
  });
});

describe("adapter setEnabled (persisted, non-destructive)", () => {
  it("disables a legacy effect via editState without losing its value", () => {
    const layer = mixedLayer();
    const sepia = collectLayerEdits(layer).find((e) => e.source === "legacyEffect")!;
    const adapter = getLayerEditAdapter("legacyEffect")!;
    const next = adapter.setEnabled(layer, sepia.id, false) as ImageLayer;
    expect(next.editState?.disabled).toContain("legacy:sepia");
    expect(next.effects.sepia).toBe(true); // value preserved
    expect(hasDisabledLayerEdits(next)).toBe(true);
    // collect still lists it, now marked disabled.
    const after = collectLayerEdits(next).find((e) => e.id === "legacy:sepia");
    expect(after?.enabled).toBe(false);
  });

  it("toggles a modern adjustment's own enabled flag", () => {
    const layer = mixedLayer();
    const adj = collectLayerEdits(layer).find((e) => e.source === "imageAdjustment")!;
    const adapter = getLayerEditAdapter("imageAdjustment")!;
    const next = adapter.setEnabled(layer, adj.id, false) as ImageLayer;
    expect(next.imageAdjustments?.stack[0]?.enabled).toBe(false);
  });
});

describe("resolveEffectiveLayer (render-only muting)", () => {
  it("returns the same reference when nothing is muted", () => {
    const layer = mixedLayer();
    expect(resolveEffectiveLayer(layer, new Set())).toBe(layer);
  });

  it("neutralizes muted edits on a clone, leaving the original untouched", () => {
    const layer = mixedLayer();
    const muted = new Set(["legacy:sepia", "vfx_1", layer.imageAdjustments!.stack[0]!.id]);
    const eff = resolveEffectiveLayer(layer, muted);
    expect(eff).not.toBe(layer);
    // clone neutralized
    expect(eff.effects.sepia).toBe(false);
    expect(eff.visualEffects?.effects[0]?.enabled).toBe(false);
    expect(eff.imageAdjustments?.stack[0]?.enabled).toBe(false);
    // original preserved
    expect(layer.effects.sepia).toBe(true);
    expect(layer.visualEffects?.effects[0]?.enabled).toBe(true);
    expect(layer.imageAdjustments?.stack[0]?.enabled).toBe(true);
  });

  it("muting a preset id disables all its generated adjustments", () => {
    const generated = createImageAdjustment({ type: "color", saturation: 30 });
    const layer: ImageLayer = {
      ...imageLayer(),
      imageAdjustments: {
        enabled: true,
        stack: [generated],
        presetInstances: [
          { id: "preset_1", presetId: "p", name: "P", appliedAt: 0, strength: 1, targetMode: "singleImage", editable: true, generatedAdjustments: [generated.id] }
        ]
      }
    };
    const eff = resolveEffectiveLayer(layer, new Set(["preset_1"]));
    expect(eff.imageAdjustments?.stack[0]?.enabled).toBe(false);
  });
});

describe("bulk ops", () => {
  it("disables then re-enables every edit", () => {
    const layer = mixedLayer();
    const off = setAllLayerEditsEnabled(layer, false);
    expect(collectLayerEdits(off).every((e) => !e.enabled)).toBe(true);
    const on = setAllLayerEditsEnabled(off, true);
    expect(collectLayerEdits(on).every((e) => e.enabled)).toBe(true);
  });

  it("reset all removes/neutralizes every edit", () => {
    const cleared = resetAllLayerEdits(mixedLayer()) as ImageLayer;
    expect(countLayerEdits(cleared)).toBe(0);
    expect(cleared.effects.sepia).toBe(false);
    expect(cleared.imageAdjustments?.stack ?? []).toHaveLength(0);
    expect(cleared.visualEffects?.effects ?? []).toHaveLength(0);
  });
});

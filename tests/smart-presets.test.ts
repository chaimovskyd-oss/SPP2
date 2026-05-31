import { beforeEach, describe, expect, it } from "vitest";
import {
  SMART_PRESET_CATALOG,
  getPreset,
  instantiatePresetAdjustments,
  listPresetsByCategory,
  scaleTemplate
} from "@/core/presets/smartPresets";
import { useDocumentStore } from "@/state/documentStore";
import { createImageLayer } from "@/core";
import { createFreeModeDocument } from "@/ui/projectActions";
import type { ImageLayer } from "@/types/layers";
import type { BasicToneAdjustment, ColorAdjustment } from "@/types/imageAdjustments";

function seedDocumentWithImages(count: number): { pageId: string; layerIds: string[] } {
  const document = createFreeModeDocument("Presets");
  const page = document.pages[0];
  if (page === undefined) throw new Error("missing page");
  const layers = Array.from({ length: count }, (_, i) =>
    createImageLayer({ assetId: `asset-${i}`, rect: { x: 0, y: 0, width: 100, height: 80 }, zIndex: i })
  );
  useDocumentStore.getState().setDocument({ ...document, pages: [{ ...page, layers }] });
  return { pageId: page.id, layerIds: layers.map((l) => l.id) };
}

function readLayer(pageId: string, layerId: string): ImageLayer {
  const layer = useDocumentStore
    .getState()
    .document?.pages.find((p) => p.id === pageId)
    ?.layers.find((l) => l.id === layerId);
  if (layer?.type !== "image") throw new Error("expected image layer");
  return layer;
}

describe("smart preset engine (pure)", () => {
  it("every catalog entry has a usable recipe and valid apply modes", () => {
    expect(SMART_PRESET_CATALOG.length).toBeGreaterThan(0);
    for (const preset of SMART_PRESET_CATALOG) {
      // either an image recipe or a page-look recipe (page-look presets carry no image adjustments)
      const hasImageRecipe = preset.imageAdjustments.length > 0;
      const hasPageLookRecipe = preset.pageLookEffect !== undefined;
      expect(hasImageRecipe || hasPageLookRecipe).toBe(true);
      expect(preset.allowedApplyModes).toContain(preset.recommendedApplyMode);
      expect(preset.defaultStrength).toBeGreaterThan(0);
      expect(preset.defaultStrength).toBeLessThanOrEqual(1);
    }
  });

  it("preset ids are unique", () => {
    const ids = SMART_PRESET_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("scaleTemplate at strength 1 keeps authored values; at 0 returns neutral", () => {
    const full = scaleTemplate({ type: "basicTone", contrast: 20, gamma: 1.04 }, 1);
    expect(full).toMatchObject({ contrast: 20, gamma: 1.04 });

    const none = scaleTemplate({ type: "basicTone", contrast: 20, gamma: 1.04 }, 0);
    // contrast neutral 0, gamma neutral 1
    expect(none).toMatchObject({ contrast: 0, gamma: 1 });
  });

  it("scaleTemplate interpolates around the per-key neutral", () => {
    const half = scaleTemplate({ type: "color", saturation: 8, temperature: -18 }, 0.5);
    expect(half).toMatchObject({ saturation: 4, temperature: -9 });
  });

  it("scaleTemplate passes through non-scaled keys and selectors", () => {
    const curve = scaleTemplate({ type: "curves", preset: "fadeFilm" }, 0.3);
    expect(curve).toMatchObject({ type: "curves", preset: "fadeFilm" });

    const detail = scaleTemplate({ type: "detail", sharpness: 10, sharpnessRadius: 2 }, 0.5);
    // sharpness scales (neutral 0 -> 5), radius is structural and passes through
    expect(detail).toMatchObject({ sharpness: 5, sharpnessRadius: 2 });
  });

  it("instantiatePresetAdjustments yields fresh ids and enabled entries", () => {
    const def = getPreset("sun_rescue");
    expect(def).toBeDefined();
    const adjustments = instantiatePresetAdjustments(def!, 1);
    expect(adjustments).toHaveLength(def!.imageAdjustments.length);
    expect(new Set(adjustments.map((a) => a.id)).size).toBe(adjustments.length);
    for (const adj of adjustments) expect(adj.enabled).toBe(true);
  });

  it("listPresetsByCategory filters", () => {
    const rescue = listPresetsByCategory("Photo Rescue");
    expect(rescue.length).toBeGreaterThan(0);
    expect(rescue.every((p) => p.category === "Photo Rescue")).toBe(true);
  });

  it("ships the Color Cast Rescue family in Photo Rescue", () => {
    const castIds = [
      "red_cast_rescue",
      "yellow_cast_rescue",
      "blue_cast_rescue",
      "green_cast_rescue",
      "mixed_tunnel_rescue"
    ];
    for (const id of castIds) {
      const def = getPreset(id);
      expect(def, id).toBeDefined();
      expect(def!.category).toBe("Photo Rescue");
      expect(def!.imageAdjustments.length).toBeGreaterThan(0);
      // color-cast corrections are per-image, never page looks
      expect(def!.notRecommendedAsPageLook).toBe(true);
      expect(def!.pageLookEffect).toBeUndefined();
    }
  });

  it("ships the missing HDR/detail/product and duotone preset families", () => {
    const hdrIds = ["hdr_pop", "soft_hdr", "hyper_detail", "product_punch", "landscape_boost"];
    const duotoneIds = ["gold_noir", "neon_duo", "sunset_duo", "ice_duo", "blue_poster"];

    for (const id of hdrIds) {
      const def = getPreset(id);
      expect(def, id).toBeDefined();
      expect(def!.category).toBe("HDR / Detail / Product");
      expect(def!.imageAdjustments.length).toBeGreaterThan(0);
      expect(def!.notRecommendedAsPageLook).toBe(true);
    }

    for (const id of duotoneIds) {
      const def = getPreset(id);
      expect(def, id).toBeDefined();
      expect(def!.category).toBe("Duotone");
      expect(def!.imageAdjustments.some((a) => a.type === "blackWhite")).toBe(true);
      expect(def!.imageAdjustments.some((a) => a.type === "gradientMap")).toBe(true);
    }
  });

  it("red cast rescue cools the image (negative temperature) while restoring vibrance", () => {
    const def = getPreset("red_cast_rescue");
    const color = def!.imageAdjustments.find((a) => a.type === "color") as { temperature: number; vibrance: number };
    expect(color.temperature).toBeLessThan(0);
    expect(color.vibrance).toBeGreaterThan(0);
  });
});

describe("smart preset store actions", () => {
  beforeEach(() => {
    useDocumentStore.getState().clearDocument();
  });

  it("applyPresetToImage appends scaled adjustments and records an instance", () => {
    const { pageId, layerIds } = seedDocumentWithImages(1);
    const a = layerIds[0]!;
    useDocumentStore.getState().applyPresetToImage(pageId, a, "sun_rescue", 1);

    const stack = readLayer(pageId, a).imageAdjustments!;
    const def = getPreset("sun_rescue")!;
    expect(stack.stack).toHaveLength(def.imageAdjustments.length);
    expect(stack.presetInstances).toHaveLength(1);
    const instance = stack.presetInstances![0]!;
    expect(instance.presetId).toBe("sun_rescue");
    expect(instance.strength).toBe(1);
    expect(instance.generatedAdjustments).toHaveLength(def.imageAdjustments.length);
    // generated ids must match real stack entries
    const stackIds = new Set(stack.stack.map((adj) => adj.id));
    expect(instance.generatedAdjustments.every((id) => stackIds.has(id))).toBe(true);
  });

  it("applyPresetToAllImagesOnPage is a single undo across all images", () => {
    const { pageId, layerIds } = seedDocumentWithImages(3);
    const before = useDocumentStore.getState().meaningfulActionCount;
    useDocumentStore.getState().applyPresetToAllImagesOnPage(pageId, "whatsapp_recovery");

    for (const id of layerIds) {
      expect(readLayer(pageId, id).imageAdjustments!.presetInstances).toHaveLength(1);
    }
    expect(useDocumentStore.getState().meaningfulActionCount).toBe(before + 1);

    useDocumentStore.getState().undo();
    for (const id of layerIds) {
      expect(readLayer(pageId, id).imageAdjustments).toBeUndefined();
    }
  });

  it("applyPresetToImages targets only listed layers and defaults to preset strength", () => {
    const { pageId, layerIds } = seedDocumentWithImages(3);
    const [a, , c] = layerIds as [string, string, string];
    useDocumentStore.getState().applyPresetToImages(pageId, [a, c], "dark_photo_fix");

    const def = getPreset("dark_photo_fix")!;
    expect(readLayer(pageId, a).imageAdjustments!.presetInstances![0]!.strength).toBe(def.defaultStrength);
    expect(readLayer(pageId, layerIds[1]!).imageAdjustments).toBeUndefined();
    expect(readLayer(pageId, c).imageAdjustments!.presetInstances).toHaveLength(1);
  });

  it("updateAppliedPresetStrength rescales generated adjustments in place (same ids)", () => {
    const { pageId, layerIds } = seedDocumentWithImages(1);
    const a = layerIds[0]!;
    useDocumentStore.getState().applyPresetToImage(pageId, a, "sublimation_boost", 1);

    const before = readLayer(pageId, a).imageAdjustments!;
    const instanceId = before.presetInstances![0]!.id;
    const idsBefore = [...before.presetInstances![0]!.generatedAdjustments];
    const colorBefore = before.stack.find((adj): adj is ColorAdjustment => adj.type === "color")!;
    expect(colorBefore.vibrance).toBe(18);

    useDocumentStore.getState().updateAppliedPresetStrength(pageId, a, instanceId, 0.5);

    const after = readLayer(pageId, a).imageAdjustments!;
    expect(after.presetInstances![0]!.strength).toBe(0.5);
    expect(after.presetInstances![0]!.generatedAdjustments).toEqual(idsBefore);
    const colorAfter = after.stack.find((adj): adj is ColorAdjustment => adj.type === "color")!;
    expect(colorAfter.vibrance).toBe(9);
    expect(colorAfter.id).toBe(colorBefore.id);
  });

  it("removeAppliedPreset deletes its generated adjustments and the instance", () => {
    const { pageId, layerIds } = seedDocumentWithImages(1);
    const a = layerIds[0]!;
    useDocumentStore.getState().applyPresetToImage(pageId, a, "sun_rescue", 1);
    // add an unrelated manual adjustment that must survive the removal
    useDocumentStore.getState().addImageAdjustment(pageId, a, { type: "invert", strength: 100 });

    const withPreset = readLayer(pageId, a).imageAdjustments!;
    const instanceId = withPreset.presetInstances![0]!.id;
    const presetCount = getPreset("sun_rescue")!.imageAdjustments.length;
    expect(withPreset.stack).toHaveLength(presetCount + 1);

    useDocumentStore.getState().removeAppliedPreset(pageId, a, instanceId);
    const after = readLayer(pageId, a).imageAdjustments!;
    expect(after.presetInstances ?? []).toHaveLength(0);
    expect(after.stack).toHaveLength(1);
    expect(after.stack[0]!.type).toBe("invert");
  });

  it("applyPresetToDuplicatedImage clones the source above it and applies only to the copy", () => {
    const { pageId, layerIds } = seedDocumentWithImages(2);
    const [a, b] = layerIds as [string, string];
    const sourceZ = readLayer(pageId, a).zIndex;
    const topZBefore = readLayer(pageId, b).zIndex;

    const before = useDocumentStore.getState().meaningfulActionCount;
    useDocumentStore.getState().applyPresetToDuplicatedImage(pageId, a, "sun_rescue", 1);

    // one undo entry
    expect(useDocumentStore.getState().meaningfulActionCount).toBe(before + 1);

    const page = useDocumentStore.getState().document!.pages.find((p) => p.id === pageId)!;
    expect(page.layers).toHaveLength(3);

    // source is untouched
    expect(readLayer(pageId, a).imageAdjustments).toBeUndefined();

    // the clone carries the preset and sits directly above the source
    const clone = page.layers.find((l) => l.id !== a && l.id !== b && l.type === "image")!;
    expect(clone.type).toBe("image");
    expect(clone.zIndex).toBe(sourceZ + 1);
    const cloneAdj = (clone as ImageLayer).imageAdjustments!;
    expect(cloneAdj.presetInstances).toHaveLength(1);

    // layers that were above the source were bumped to preserve order
    expect(readLayer(pageId, b).zIndex).toBe(topZBefore + 1);

    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().document!.pages.find((p) => p.id === pageId)!.layers).toHaveLength(2);
  });

  it("applyPresetToImage appends fine-tune `extra` as MANUAL adjustments (not in the instance)", () => {
    const { pageId, layerIds } = seedDocumentWithImages(1);
    const a = layerIds[0]!;
    const def = getPreset("sun_rescue")!;

    useDocumentStore
      .getState()
      .applyPresetToImage(pageId, a, "sun_rescue", 1, [{ type: "basicTone", brightness: 15 }]);

    const stack = readLayer(pageId, a).imageAdjustments!;
    // preset adjustments + 1 manual fine-tune adjustment
    expect(stack.stack).toHaveLength(def.imageAdjustments.length + 1);

    // the instance only owns the generated preset adjustments — NOT the fine-tune
    const instance = stack.presetInstances![0]!;
    expect(instance.generatedAdjustments).toHaveLength(def.imageAdjustments.length);

    const generated = new Set(instance.generatedAdjustments);
    const manual = stack.stack.filter((adj) => !generated.has(adj.id));
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ type: "basicTone", brightness: 15 });
  });

  it("applying two presets to one image keeps independent instances", () => {
    const { pageId, layerIds } = seedDocumentWithImages(1);
    const a = layerIds[0]!;
    useDocumentStore.getState().applyPresetToImage(pageId, a, "sun_rescue", 0.8);
    useDocumentStore.getState().applyPresetToImage(pageId, a, "haze_removal", 0.6);

    const stack = readLayer(pageId, a).imageAdjustments!;
    expect(stack.presetInstances).toHaveLength(2);
    const total =
      getPreset("sun_rescue")!.imageAdjustments.length + getPreset("haze_removal")!.imageAdjustments.length;
    expect(stack.stack).toHaveLength(total);
  });
});

// referenced to keep the BasicToneAdjustment import meaningful for type-narrowing readers
const _typecheck: BasicToneAdjustment["type"] = "basicTone";
void _typecheck;

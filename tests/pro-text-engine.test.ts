import { beforeEach, describe, expect, it } from "vitest";
import { BUILTIN_TEXT_PRESETS, createDocument, createPage, createProjectEnvelope, createTextLayer, createTextPresetFromLayer, parseProject, serializeProject } from "@/core";
import { useDocumentStore } from "@/state/documentStore";
import type { TextLayer } from "@/types/layers";

function resetStore(): void {
  useDocumentStore.getState().clearDocument();
}

describe("Pro text engine foundation", () => {
  beforeEach(() => {
    resetStore();
  });

  it("creates text layers with the extended pro text model fields", () => {
    const layer = createTextLayer({
      text: "שלום SPP",
      rect: {
        x: 10,
        y: 20,
        width: 320,
        height: 90
      }
    });

    expect(layer.layerType).toBe("text");
    expect(layer.parentFrameId).toBeNull();
    expect(layer.fillOpacity).toBe(1);
    expect(layer.warpSettings.type).toBe("none");
    expect(layer.effects).toEqual([]);
    expect(layer.autoContrast.enabled).toBe(false);
  });

  it("migrates older text layers on project load while preserving explicit project version fields", () => {
    const currentLayer = createTextLayer({
      text: "Legacy",
      rect: {
        x: 0,
        y: 0,
        width: 200,
        height: 80
      }
    });
    const legacyLayer = { ...currentLayer } as Partial<TextLayer>;
    delete legacyLayer.layerType;
    delete legacyLayer.parentFrameId;
    delete legacyLayer.effects;
    delete legacyLayer.warpSettings;
    delete legacyLayer.autoContrast;

    const envelope = createProjectEnvelope({
      document: {
        ...createDocument({
          name: "Legacy text"
        }),
        pages: [
          createPage({
            name: "Page 1",
            layers: [legacyLayer as TextLayer]
          })
        ]
      },
      linkedGroups: [],
      batchJobs: []
    });

    const parsed = parseProject(serializeProject(envelope));
    const migrated = parsed.document.pages[0]?.layers[0] as TextLayer | undefined;

    expect(Object.keys(parsed)).toEqual(["format", "version", "projectVersion", "appVersion", "schemaVersion", "metadata", "document", "linkedGroups", "batchJobs"]);
    expect(parsed.metadata.internalUuid).toBe(parsed.document.id);
    expect(migrated?.layerType).toBe("text");
    expect(migrated?.effects).toEqual([]);
    expect(migrated?.warpSettings.type).toBe("none");
  });

  it("supports drag-style layer reorder with undo integration", () => {
    const back = createTextLayer({ name: "Back", text: "Back", rect: { x: 0, y: 0, width: 100, height: 50 }, zIndex: 0 });
    const middle = createTextLayer({ name: "Middle", text: "Middle", rect: { x: 0, y: 60, width: 100, height: 50 }, zIndex: 1 });
    const front = createTextLayer({ name: "Front", text: "Front", rect: { x: 0, y: 120, width: 100, height: 50 }, zIndex: 2 });
    const page = createPage({
      name: "Layers",
      layers: [back, middle, front]
    });
    const document = { ...createDocument({ name: "Layer reorder" }), pages: [page] };

    useDocumentStore.getState().setDocument(document);
    useDocumentStore.getState().reorderLayers(page.id, [back.id, front.id, middle.id]);

    const order = useDocumentStore
      .getState()
      .document?.pages[0]?.layers.slice().sort((a, b) => b.zIndex - a.zIndex)
      .map((layer) => layer.name);

    expect(order).toEqual(["Back", "Front", "Middle"]);
    expect(useDocumentStore.getState().canUndo).toBe(true);

    useDocumentStore.getState().undo();
    const restored = useDocumentStore
      .getState()
      .document?.pages[0]?.layers.slice().sort((a, b) => b.zIndex - a.zIndex)
      .map((layer) => layer.name);
    expect(restored).toEqual(["Front", "Middle", "Back"]);
  });

  it("applies built-in text presets through the document store", () => {
    const layer = createTextLayer({ text: "זהב", rect: { x: 0, y: 0, width: 180, height: 80 } });
    const page = createPage({ name: "Preset", layers: [layer] });
    const document = { ...createDocument({ name: "Preset test" }), pages: [page] };

    useDocumentStore.getState().setDocument(document);
    useDocumentStore.getState().applyTextPreset(page.id, layer.id, BUILTIN_TEXT_PRESETS[0]);
    const updated = useDocumentStore.getState().document?.pages[0]?.layers[0] as TextLayer | undefined;

    expect(BUILTIN_TEXT_PRESETS).toHaveLength(24);
    expect(updated?.effects.length).toBeGreaterThan(0);
    expect(updated?.gradient).toBeDefined();
    expect(updated?.stroke).toBeDefined();
  });

  it("includes advanced printable text presets with complex effect params", () => {
    const silver = BUILTIN_TEXT_PRESETS.find((preset) => preset.presetId === "true_silver_sparkle");
    const balloon = BUILTIN_TEXT_PRESETS.find((preset) => preset.presetId === "balloon_burnt_inside");
    const gold3d = BUILTIN_TEXT_PRESETS.find((preset) => preset.presetId === "real_3d_gold");

    expect(silver?.category).toBe("sparkle");
    expect(silver?.effects.some((effect) => effect.effectType === "pattern_overlay")).toBe(true);
    expect(silver?.effects.some((effect) => effect.effectType === "sparkle")).toBe(true);
    expect(balloon?.effects.some((effect) => effect.effectType === "outer_glow")).toBe(true);
    expect(gold3d?.effects.some((effect) => effect.effectType === "extrude_3d")).toBe(true);
  });

  it("deep-clones complex preset effect params when applying presets", () => {
    const layer = createTextLayer({ text: "Silver", rect: { x: 0, y: 0, width: 180, height: 80 } });
    const page = createPage({ name: "Preset clone", layers: [layer] });
    const document = { ...createDocument({ name: "Preset clone test" }), pages: [page] };
    const preset = BUILTIN_TEXT_PRESETS.find((item) => item.presetId === "true_silver_sparkle");
    expect(preset).toBeDefined();

    useDocumentStore.getState().setDocument(document);
    useDocumentStore.getState().applyTextPreset(page.id, layer.id, preset!);
    const updated = useDocumentStore.getState().document?.pages[0]?.layers[0] as TextLayer | undefined;
    const presetPattern = preset!.effects.find((effect) => effect.effectType === "pattern_overlay");
    const layerPattern = updated?.effects.find((effect) => effect.effectType === "pattern_overlay");

    expect(layerPattern).toBeDefined();
    expect(layerPattern).not.toBe(presetPattern);
    expect(layerPattern?.params).not.toBe(presetPattern?.params);
    expect(layerPattern?.params).toEqual(presetPattern?.params);
  });

  it("captures complete user text presets from the current layer state", () => {
    const layer = createTextLayer({ text: "Spark", rect: { x: 0, y: 0, width: 220, height: 90 } });
    const styled: TextLayer = {
      ...layer,
      fontFamily: "Missing Fancy Font",
      fontWeight: 900,
      letterSpacing: 6,
      effects: [
        {
          version: 1,
          id: "sparkle_user",
          effectId: "sparkle_user",
          effectType: "sparkle",
          enabled: true,
          opacity: 1,
          blendMode: "normal",
          params: { density: 0.4, size: 9, color: "#ffffff", seed: 12, opacity: 0.9, glint: 0.8, halo: 0.7 }
        },
        {
          version: 1,
          id: "pattern_user",
          effectId: "pattern_user",
          effectType: "pattern_overlay",
          enabled: true,
          opacity: 1,
          blendMode: "normal",
          params: { patternType: "uploaded_image", foreground: "#ffffff", opacity: 0.65, scale: 1, rotation: 0, spacing: 22, imageDataUrl: "data:image/png;base64,abc", imageName: "fabric.png" }
        }
      ]
    };

    const preset = createTextPresetFromLayer(styled, "Saved sparkle");

    expect(preset.isBuiltin).toBe(false);
    expect(preset.includesTypography).toBe(true);
    expect(preset.style.fontFamily).toBe("Missing Fancy Font");
    expect(preset.style.letterSpacing).toBe(6);
    expect(preset.effects).toHaveLength(2);
    expect(preset.effects[1]?.params).toEqual(styled.effects[1]?.params);
    expect(preset.effects[1]?.params).not.toBe(styled.effects[1]?.params);
  });
});

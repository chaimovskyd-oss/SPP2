import { beforeEach, describe, expect, it } from "vitest";
import { BUILTIN_TEXT_PRESETS, createDocument, createPage, createProjectEnvelope, createTextLayer, parseProject, serializeProject } from "@/core";
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

  it("migrates older text layers on project load without adding a new top-level envelope key", () => {
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

    expect(Object.keys(parsed)).toEqual(["format", "version", "document", "linkedGroups", "batchJobs"]);
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

    expect(BUILTIN_TEXT_PRESETS).toHaveLength(12);
    expect(updated?.effects.length).toBeGreaterThan(0);
    expect(updated?.gradient).toBeDefined();
    expect(updated?.stroke).toBeDefined();
  });
});

import { describe, expect, it, beforeEach } from "vitest";
import { createProjectEnvelope, parseProject, serializeProject } from "@/core";
import { useDocumentStore } from "@/state/documentStore";
import { createFreeModeDocument, createFreeImageLayer, createImageFrameLayer, createStarterTextLayer } from "@/ui/projectActions";
import type { Asset } from "@/types/document";

function resetStore(): void {
  useDocumentStore.getState().clearDocument();
}

function imageAsset(): Asset {
  return {
    version: 1,
    id: "asset_portrait",
    name: "portrait.png",
    kind: "image",
    mimeType: "image/png",
    width: 400,
    height: 900,
    previewPath: "data:image/png;base64,test",
    metadata: {
      source: "test"
    }
  };
}

describe("Phase 1 free mode core", () => {
  beforeEach(() => {
    resetStore();
  });

  it("supports undo and redo for document layer changes", () => {
    const store = useDocumentStore.getState();
    const document = createFreeModeDocument("Undo test");
    const page = document.pages[0];
    if (page === undefined) {
      throw new Error("Expected starter page");
    }

    store.setDocument(document);
    const layer = createStarterTextLayer(page.width, page.height);
    useDocumentStore.getState().addLayer(page.id, layer);

    expect(useDocumentStore.getState().document?.pages[0]?.layers).toHaveLength(1);
    expect(useDocumentStore.getState().canUndo).toBe(true);

    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().document?.pages[0]?.layers).toHaveLength(0);
    expect(useDocumentStore.getState().canRedo).toBe(true);

    useDocumentStore.getState().redo();
    expect(useDocumentStore.getState().document?.pages[0]?.layers[0]?.id).toBe(layer.id);
  });

  it("round-trips a free mode project with text and free image (ImageLayer)", () => {
    const document = createFreeModeDocument("Round trip");
    const page = document.pages[0];
    if (page === undefined) throw new Error("Expected starter page");

    const textLayer = createStarterTextLayer(page.width, page.height);
    const asset = imageAsset();
    const imageLayer = createFreeImageLayer(asset, page.width, page.height);

    const project = {
      ...document,
      assets: [asset],
      pages: [{ ...page, layers: [textLayer, imageLayer] }]
    };

    const envelope = createProjectEnvelope({ document: project, linkedGroups: [], batchJobs: [] });
    const parsed = parseProject(serializeProject(envelope));

    expect(parsed.document.assets[0]?.width).toBe(400);
    expect(parsed.document.pages[0]?.layers.map((l) => l.type)).toEqual(["text", "image"]);
  });

  it("createFreeImageLayer יוצר ImageLayer ולא FrameLayer", () => {
    const asset = imageAsset();
    const layer = createFreeImageLayer(asset, 1240, 1748);

    expect(layer.type).toBe("image");
    expect("assetId" in layer).toBe(true);
    expect("behaviorMode" in layer).toBe(false);
    expect("contentTransform" in layer).toBe(false);
  });

  it("createImageFrameLayer יוצר FrameLayer לתהליכי פריסה", () => {
    const asset = imageAsset();
    const layer = createImageFrameLayer(asset, 1240, 1748);

    expect(layer.type).toBe("frame");
    expect(layer.behaviorMode).toBeDefined();
    expect(layer.contentTransform).toBeDefined();
    expect(layer.imageAssetId).toBe(asset.id);
  });

  it("ImageLayer שומר ונטען נכון — x,y,width,height נשמרים", () => {
    const document = createFreeModeDocument("Persist test");
    const page = document.pages[0];
    if (page === undefined) throw new Error("Expected starter page");

    const asset = imageAsset();
    const layer = createFreeImageLayer(asset, page.width, page.height);
    const movedLayer = { ...layer, x: 100, y: 200, width: 300, height: 400, rotation: 45 };

    const project = { ...document, assets: [asset], pages: [{ ...page, layers: [movedLayer] }] };
    const envelope = createProjectEnvelope({ document: project, linkedGroups: [], batchJobs: [] });
    const parsed = parseProject(serializeProject(envelope));

    const restored = parsed.document.pages[0]?.layers[0];
    expect(restored?.type).toBe("image");
    expect(restored?.x).toBe(100);
    expect(restored?.y).toBe(200);
    expect(restored?.width).toBe(300);
    expect(restored?.height).toBe(400);
    expect(restored?.rotation).toBe(45);
  });
});

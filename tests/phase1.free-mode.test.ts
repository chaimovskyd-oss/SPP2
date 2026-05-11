import { describe, expect, it, beforeEach } from "vitest";
import { createProjectEnvelope, parseProject, serializeProject } from "@/core";
import { useDocumentStore } from "@/state/documentStore";
import { createFreeModeDocument, createImageFrameLayer, createStarterTextLayer } from "@/ui/projectActions";
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

  it("round-trips a free mode project with text, image asset, and image frame", () => {
    const document = createFreeModeDocument("Round trip");
    const page = document.pages[0];
    if (page === undefined) {
      throw new Error("Expected starter page");
    }
    const textLayer = createStarterTextLayer(page.width, page.height);
    const asset = imageAsset();
    const imageLayer = createImageFrameLayer(asset, page.width, page.height);
    const project = {
      ...document,
      assets: [asset],
      pages: [
        {
          ...page,
          layers: [textLayer, imageLayer]
        }
      ]
    };

    const envelope = createProjectEnvelope({
      document: project,
      linkedGroups: [],
      batchJobs: []
    });
    const parsed = parseProject(serializeProject(envelope));

    expect(parsed.document).toEqual(project);
    expect(parsed.document.assets[0]?.width).toBe(400);
    expect(parsed.document.pages[0]?.layers.map((layer) => layer.type)).toEqual(["text", "frame"]);
  });
});

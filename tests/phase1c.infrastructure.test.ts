import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  JobQueue,
  buildRenderModel,
  createExportJobPlan,
  createPortableSppPackage,
  createProjectEnvelope,
  findMissingAssets,
  getLogs,
  marqueeSelect,
  parseProject,
  readPortableSppPackage,
  relinkFolder,
  restoreRecoveryRecord,
  saveRecoveryRecord,
  serializeProject,
  validatePortableAssetCoverage
} from "@/core";
import { useDocumentStore } from "@/state/documentStore";
import { createFreeModeDocument, createImageFrameLayer, createStarterTextLayer } from "@/ui/projectActions";
import type { Asset } from "@/types/document";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  useDocumentStore.getState().clearDocument();
});

function asset(index: number, overrides: Partial<Asset> = {}): Asset {
  return {
    version: 1,
    id: `asset_${index}`,
    name: `image_${index}.jpg`,
    kind: "image",
    status: "ready",
    originalPath: `original-${index}`,
    previewPath: `preview-${index}`,
    thumbnailPath: `thumb-${index}`,
    mimeType: "image/jpeg",
    width: 1200,
    height: 800,
    fileSize: 1000 + index,
    hash: `hash_${index}`,
    checksum: `hash_${index}`,
    metadata: {},
    ...overrides
  };
}

describe("Phase 1C core infrastructure", () => {
  it("keeps one document model while supporting 100 assets, previews, thumbnails, render model, and export validation", () => {
    const document = createFreeModeDocument("Phase 1C 100 assets");
    const page = document.pages[0];
    if (page === undefined) throw new Error("missing page");
    const assets = Array.from({ length: 100 }, (_, index) => asset(index));
    const layers = assets.map((item, index) => ({
      ...createImageFrameLayer(item, page.width, page.height),
      id: `layer_${index}`,
      x: index,
      y: index,
      zIndex: index
    }));
    const project = { ...document, assets, pages: [{ ...page, layers }] };

    const screenModel = buildRenderModel(project.pages[0], project.assets, "screen");
    const exportModel = buildRenderModel(project.pages[0], project.assets, "export");

    expect(screenModel.layers).toHaveLength(100);
    expect(screenModel.layers[0]?.asset?.src).toBe("preview-0");
    expect(exportModel.layers[0]?.asset?.src).toBe("original-0");
    expect(createExportJobPlan(project, "png").issues).toHaveLength(0);
  });

  it("round-trips lightweight JSON with explicit version fields and migrations", () => {
    const document = createFreeModeDocument("JSON");
    const envelope = createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] });
    const parsed = parseProject(serializeProject(envelope));

    expect(parsed.projectVersion).toBeDefined();
    expect(parsed.appVersion).toBeDefined();
    expect(parsed.schemaVersion).toBeGreaterThanOrEqual(2);
    expect(parsed.document.pages[0]?.setup.dpi).toBe(document.pages[0]?.setup.dpi);
  });

  it("creates a portable .spp package with originals, previews, thumbnails and reopens it elsewhere", async () => {
    const document = { ...createFreeModeDocument("Portable"), assets: [asset(1)] };
    const envelope = createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] });
    const bytes = await createPortableSppPackage({
      project: envelope,
      metadata: { portable: true },
      assets: [{ assetId: "asset_1", original: new Uint8Array([1]), preview: new Uint8Array([2]), thumbnail: new Uint8Array([3]) }]
    });
    const reopened = readPortableSppPackage(bytes);

    expect(reopened.project.document.name).toBe("Portable");
    expect(reopened.assets[0]?.original?.[0]).toBe(1);
    expect(validatePortableAssetCoverage(envelope, reopened.assets).missingOriginals).toHaveLength(0);
  });

  it("autosaves and restores recovery records without blocking the document store", async () => {
    const document = createFreeModeDocument("Recovery");
    const envelope = createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] });
    const record = await saveRecoveryRecord(envelope, "unsaved", { storageKey: "test.recovery" });
    const restored = restoreRecoveryRecord(record);

    expect(restored.document.id).toBe(document.id);
    expect(storage.get("test.recovery")).toContain("Recovery");
  });

  it("uses action-based undo/redo for add, move, resize and delete without full document stacks", () => {
    const document = createFreeModeDocument("History");
    const page = document.pages[0];
    if (page === undefined) throw new Error("missing page");
    const layer = createStarterTextLayer(page.width, page.height);
    const store = useDocumentStore.getState();

    store.setDocument(document);
    useDocumentStore.getState().addLayer(page.id, layer);
    expect(useDocumentStore.getState().history.undoStack.at(-1)?.type).toBe("AddLayerAction");

    useDocumentStore.getState().updateLayer(page.id, { ...layer, x: layer.x + 10 });
    expect(useDocumentStore.getState().history.undoStack.at(-1)?.type).toBe("ChangeLayerPropertyAction");

    useDocumentStore.getState().updateLayer(page.id, { ...layer, width: layer.width + 20 });
    useDocumentStore.getState().removeLayer(page.id, layer.id);
    expect(useDocumentStore.getState().history.undoStack.at(-1)?.type).toBe("DeleteLayerAction");

    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().document?.pages[0]?.layers).toHaveLength(1);
    useDocumentStore.getState().redo();
    expect(useDocumentStore.getState().document?.pages[0]?.layers).toHaveLength(0);
  });

  it("selects multiple layers with central marquee selection and respects locked layers", () => {
    const document = createFreeModeDocument("Selection");
    const page = document.pages[0];
    if (page === undefined) throw new Error("missing page");
    const layers = [
      { ...createStarterTextLayer(page.width, page.height), id: "a", x: 10, y: 10, locked: false },
      { ...createStarterTextLayer(page.width, page.height), id: "b", x: 40, y: 40, locked: true }
    ];
    const result = marqueeSelect({ ...page, layers }, { x: 0, y: 0, width: 500, height: 500 });

    expect(result.selectedLayerIds).toEqual(["a"]);
  });

  it("marks missing JSON assets and relinks by filename/hash/size", () => {
    const missing = asset(2, { status: "missing", originalPath: undefined });
    expect(findMissingAssets([missing])).toHaveLength(1);
    const result = relinkFolder([missing], [{ path: "new/path/image_2.jpg", fileName: "image_2.jpg", fileSize: missing.fileSize, hash: missing.hash }]);

    expect(result.matched).toEqual(["asset_2"]);
    expect(result.assets[0]?.status).toBe("ready");
  });

  it("runs background jobs with progress, cancellation-ready state and logs", async () => {
    const queue = new JobQueue(1);
    const job = queue.enqueue("preview-generation", { count: 3 }, async (_payload, context) => {
      context.updateProgress(0.5);
    });
    await vi.waitFor(() => expect(queue.list().find((item) => item.id === job.id)?.status).toBe("completed"));

    expect(queue.list().find((item) => item.id === job.id)?.progress).toBe(1);
    expect(getLogs("job").some((entry) => entry.context?.jobId === job.id)).toBe(true);
  });
});

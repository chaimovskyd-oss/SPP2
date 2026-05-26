import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  JobQueue,
  buildRenderModel,
  createExportJobPlan,
  createPortableSppPackage,
  cloneProjectForSaveAs,
  createDefaultProjectFilename,
  createProjectEnvelope,
  createProjectIndexEntry,
  discardRecoveryRecord,
  findMissingAssets,
  getProjectIndexEntries,
  getLogs,
  getRecoveryEntries,
  marqueeSelect,
  parseProject,
  recordProjectOpened,
  recordProjectSaved,
  readPortableSppPackage,
  relinkFolder,
  restoreRecoveryRecord,
  saveRecoveryRecord,
  serializeProject,
  upsertProjectIndexEntry,
  validateProjectEnvelope,
  validateSerializedProject,
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
    const result = await saveRecoveryRecord(envelope, "unsaved", { storageKey: "test.recovery" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    const record = result.record;
    const restored = restoreRecoveryRecord(record);

    expect(restored.envelope.document.id).toBe(document.id);
    expect(restored.envelope.metadata.internalUuid).toBe(envelope.metadata.internalUuid);
    expect(restored.status).toBe("full");
    expect(record.metadata?.internalUuid).toBe(envelope.metadata.internalUuid);
    expect(storage.get("test.recovery")).toContain("Recovery");
  });

  it("stores project lifecycle identity, aliases, timestamps, and index metadata", () => {
    const document = createFreeModeDocument("Lifecycle", undefined, {
      customerName: "Leah",
      customerPhone: "050-000-1111",
      customerEmail: "leah@example.com",
      projectType: "Collage"
    });
    const envelope = recordProjectOpened(createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] }), "nas/share/lifecycle.spp2");
    const saved = recordProjectSaved(envelope, "nas/share/lifecycle.spp2", "thumb:data");
    const entries = getProjectIndexEntries();

    expect(saved.metadata.projectUuid).toBe(envelope.metadata.projectUuid);
    expect(saved.metadata.internalUuid).toBe(saved.metadata.projectUuid);
    expect(saved.metadata.customerPhone).toBe("050-000-1111");
    expect(saved.metadata.phoneNumber).toBe("050-000-1111");
    expect(entries[0]?.projectUuid).toBe(saved.metadata.projectUuid);
    expect(entries[0]?.filePath).toBe("nas/share/lifecycle.spp2");
    expect(entries[0]?.thumbnailPath).toBe("thumb:data");
    expect(entries[0]?.projectState).toBe("clean");
  });

  it("treats Save As as a new project identity for index isolation", () => {
    const original = createProjectEnvelope({ document: createFreeModeDocument("Original"), linkedGroups: [], batchJobs: [] });
    const copy = cloneProjectForSaveAs(original, "copy.spp2");

    upsertProjectIndexEntry(createProjectIndexEntry(original, { filePath: "original.spp2" }));
    upsertProjectIndexEntry(createProjectIndexEntry(copy, { filePath: "copy.spp2" }));

    expect(copy.metadata.projectUuid).not.toBe(original.metadata.projectUuid);
    expect(copy.metadata.internalUuid).toBe(copy.metadata.projectUuid);
    expect(getProjectIndexEntries()).toHaveLength(2);
  });

  it("exposes recovery entries and only discards them by explicit request", async () => {
    const document = createFreeModeDocument("Recoverable", undefined, {
      customerName: "Recover Me",
      projectType: "Grid"
    });
    const envelope = createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] });
    const result = await saveRecoveryRecord(envelope, "unsaved", { storageKey: "test.recovery" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    const record = result.record;
    const entries = getRecoveryEntries("test.recovery");

    expect(entries[0]?.projectUuid).toBe(envelope.metadata.projectUuid);
    expect(entries[0]?.customerName).toBe("Recover Me");
    expect(entries[0]?.lastAutosavedAt).toBe(record.savedAt);

    discardRecoveryRecord(record.id, "test.recovery");
    expect(getRecoveryEntries("test.recovery")).toHaveLength(0);
  });

  it("validates corrupted payloads and missing assets without crashing", () => {
    const missingAsset = asset(9, { status: "missing", originalPath: undefined, previewPath: undefined });
    const document = { ...createFreeModeDocument("Missing assets"), assets: [missingAsset] };
    const validation = validateProjectEnvelope(createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] }));
    const corrupted = validateSerializedProject("{not json");

    expect(validation.ok).toBe(true);
    expect(validation.projectState).toBe("missing_assets");
    expect(validation.missingAssets).toHaveLength(1);
    expect(corrupted.project).toBeNull();
    expect(corrupted.validation.projectState).toBe("corrupted");
  });

  it("stores project-level customer metadata without adding canvas layers", () => {
    const document = createFreeModeDocument("Customer Project", undefined, {
      customerName: "Moshe Cohen",
      phoneNumber: "050-123-4582",
      email: "moshe@example.com",
      projectType: "Collage",
      createdAt: "2026-05-12T10:00:00.000Z"
    });
    const envelope = createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] });
    const parsed = parseProject(serializeProject(envelope));

    expect(parsed.metadata.customerName).toBe("Moshe Cohen");
    expect(parsed.metadata.phoneNumber).toBe("050-123-4582");
    expect(parsed.metadata.projectType).toBe("Collage");
    expect(parsed.document.pages[0]?.layers).toHaveLength(0);
  });

  it("generates safe default project filenames for indexing and duplicate avoidance", () => {
    const metadata = createProjectEnvelope({
      document: createFreeModeDocument("Filename", undefined, {
        customerName: "Moshe Cohen",
        phoneNumber: "050-123-4582",
        projectType: "Collage",
        createdAt: "2026-05-12T10:00:00.000Z"
      }),
      linkedGroups: [],
      batchJobs: []
    }).metadata;

    expect(createDefaultProjectFilename(metadata, { reserve: false })).toBe("MosheCohen_4582_Collage_2026-05-12.spp2");
    expect(createDefaultProjectFilename(metadata, { existingNames: ["MosheCohen_4582_Collage_2026-05-12.spp2"], reserve: false })).toBe("MosheCohen_4582_Collage_2026-05-12(2).spp2");
    expect(createDefaultProjectFilename({ ...metadata, customerName: "", phoneNumber: "" }, { reserve: false })).toBe("Unknown_Collage_2026-05-12.spp2");
  });

  it("uses action-based undo/redo for add, move, resize and delete without full document stacks", () => {
    const document = createFreeModeDocument("History");
    const page = document.pages[0];
    if (page === undefined) throw new Error("missing page");
    const layer = createStarterTextLayer(page.width, page.height);
    const store = useDocumentStore.getState();

    store.setDocument(document);
    expect(useDocumentStore.getState().revision).toBe(0);
    useDocumentStore.getState().addLayer(page.id, layer);
    expect(useDocumentStore.getState().revision).toBe(1);
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

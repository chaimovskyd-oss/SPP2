import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAutosaveSafeProject,
  createDocument,
  createPage,
  createProjectEnvelope,
  estimateAutosaveWeight,
  isDataUrl,
  restoreRecoveryRecord,
  saveRecoveryRecord
} from "@/core";
import type { Asset } from "@/types/document";

const STORAGE_KEY = "spp.test.autosave-serialize";
const DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";

function makeAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    version: 1,
    name: `asset-${id}`,
    kind: "image",
    mimeType: "image/png",
    width: 100,
    height: 100,
    fileSize: 1024,
    hash: `hash-${id}`,
    originalPath: DATA_URL,
    previewPath: DATA_URL,
    thumbnailPath: DATA_URL,
    metadata: {},
    ...overrides
  };
}

function makeProject(assets: Asset[] = []) {
  const document = createDocument({
    name: "Autosave serialize",
    pages: [createPage({ name: "Page 1" })],
    metadata: { mode: "free" }
  });
  document.assets = assets;
  return createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] });
}

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value))
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isDataUrl", () => {
  it("recognises data URLs", () => {
    expect(isDataUrl("data:image/png;base64,xxx")).toBe(true);
    expect(isDataUrl("file:///C:/foo.jpg")).toBe(false);
    expect(isDataUrl("C:\\foo.jpg")).toBe(false);
    expect(isDataUrl(undefined)).toBe(false);
    expect(isDataUrl(123)).toBe(false);
  });
});

describe("createAutosaveSafeProject", () => {
  it("strips embedded data URLs and marks assets missing", () => {
    const project = makeProject([makeAsset("a"), makeAsset("b")]);
    const { safe, strippedAssetIds } = createAutosaveSafeProject(project);

    expect(strippedAssetIds).toEqual(["a", "b"]);
    for (const asset of safe.document.assets) {
      expect(asset.originalPath).toBeUndefined();
      expect(asset.previewPath).toBeUndefined();
      expect(asset.thumbnailPath).toBeUndefined();
      expect(asset.status).toBe("missing");
      expect(asset.hash).toMatch(/^hash-/);
      expect(asset.width).toBe(100);
      expect(asset.mimeType).toBe("image/png");
    }
  });

  it("preserves file paths and does not mark missing", () => {
    const fileAsset = makeAsset("c", {
      originalPath: "C:\\photos\\one.jpg",
      previewPath: undefined,
      thumbnailPath: undefined,
      status: "ready"
    });
    const { safe, strippedAssetIds } = createAutosaveSafeProject(makeProject([fileAsset]));
    expect(strippedAssetIds).toEqual([]);
    expect(safe.document.assets[0].originalPath).toBe("C:\\photos\\one.jpg");
    expect(safe.document.assets[0].status).toBe("ready");
  });

  it("does not mutate the input envelope", () => {
    const project = makeProject([makeAsset("a")]);
    const before = JSON.stringify(project);
    createAutosaveSafeProject(project);
    expect(JSON.stringify(project)).toBe(before);
  });

  it("preserves the document skeleton (pages, layers, metadata)", () => {
    const project = makeProject([makeAsset("a")]);
    project.document.pages[0].guides = [{ id: "g1", version: 1, axis: "x", position: 100, locked: false }];
    const { safe } = createAutosaveSafeProject(project);
    expect(safe.document.pages.length).toBe(project.document.pages.length);
    expect(safe.document.pages[0].guides).toEqual(project.document.pages[0].guides);
    expect(safe.document.name).toBe(project.document.name);
    expect(safe.metadata.internalUuid).toBe(project.metadata.internalUuid);
  });
});

describe("estimateAutosaveWeight", () => {
  it("reports a small payload for a heavy project (data URLs stripped)", () => {
    const bigDataUrl = "data:image/png;base64," + "A".repeat(2_000_000);
    const heavyAssets = Array.from({ length: 30 }, (_, i) =>
      makeAsset(`big-${i}`, { originalPath: bigDataUrl, previewPath: bigDataUrl, thumbnailPath: bigDataUrl })
    );
    const project = makeProject(heavyAssets);
    const weight = estimateAutosaveWeight(project);
    expect(weight.assets).toBe(30);
    expect(weight.strippedAssets).toBe(30);
    expect(weight.bytes).toBeLessThan(500_000);
  });
});

describe("saveRecoveryRecord + restoreRecoveryRecord (skinny round trip)", () => {
  it("saves a heavy project successfully and reports missing assets on restore", async () => {
    const bigDataUrl = "data:image/png;base64," + "A".repeat(500_000);
    const assets = Array.from({ length: 5 }, (_, i) =>
      makeAsset(`x-${i}`, { originalPath: bigDataUrl, previewPath: bigDataUrl, thumbnailPath: bigDataUrl })
    );
    const project = makeProject(assets);

    const result = await saveRecoveryRecord(project, "unsaved", { storageKey: STORAGE_KEY });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    expect(result.estimatedSizeBytes).toBeLessThan(200_000);

    const restored = restoreRecoveryRecord(result.record);
    expect(restored.status).toBe("assetsMissing");
    expect(restored.missingAssetIds).toHaveLength(5);
    expect(restored.envelope.document.pages.length).toBe(project.document.pages.length);
  });

  it("returns status: full when all assets reference real file paths", async () => {
    const fileAssets = [
      makeAsset("p1", {
        originalPath: "C:\\photos\\one.jpg",
        previewPath: undefined,
        thumbnailPath: undefined,
        status: "ready"
      })
    ];
    const project = makeProject(fileAssets);
    const result = await saveRecoveryRecord(project, "unsaved", { storageKey: STORAGE_KEY });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    const restored = restoreRecoveryRecord(result.record);
    expect(restored.status).toBe("full");
    expect(restored.missingAssetIds).toEqual([]);
    expect(restored.envelope.document.assets[0].originalPath).toBe("C:\\photos\\one.jpg");
  });
});

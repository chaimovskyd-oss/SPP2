import { create } from "zustand";
import type { GraphicAsset, GlibFilters, FileScanResult } from "./types";
import { DEFAULT_GLIB_FILTERS, SUPPORTED_EXTENSIONS } from "./types";
import {
  analyzeImageDataUrl,
  generateThumbnailDataUrl,
  extractTags,
  stableAssetId,
  getFileType,
} from "./analyzer";

// ─── In-memory thumbnail cache (dataUrl by asset id) ─────────────────────────

export const thumbnailCache = new Map<string, string>();

function glib() {
  const g = window.spp.glib;
  if (!g) throw new Error("glib IPC not available");
  return g;
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface GraphicsLibraryState {
  assets: GraphicAsset[];
  isScanning: boolean;
  scanProgress: { done: number; total: number };
  selectedAssetId: string | null;
  filters: GlibFilters;
  viewMode: "grid" | "list";
  baseDir: string;
  lastScanAt: number;

  loadIndex: () => Promise<void>;
  scan: () => Promise<void>;
  refreshIndex: () => void;
  setFilter: <K extends keyof GlibFilters>(key: K, value: GlibFilters[K]) => void;
  resetFilters: () => void;
  setSelectedAsset: (id: string | null) => void;
  setViewMode: (mode: "grid" | "list") => void;
  toggleFavorite: (id: string) => Promise<void>;
  updateAssetTags: (id: string, tags: string[]) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  moveAsset: (id: string, toCategory: string) => Promise<void>;
  addFileToIndex: (result: { filePath: string; fileName: string; mtimeMs: number; size: number }) => Promise<void>;
}

// ─── File processor ───────────────────────────────────────────────────────────

async function processFile(
  file: FileScanResult,
  baseDir: string
): Promise<GraphicAsset | null> {
  try {
    const result = await glib().readFileB64(file.filePath);
    if (!result.success || !result.dataUrl) return null;

    const ext = getFileType(file.fileName);
    const isSvg = ext === "svg";

    const [analysis, thumbDataUrl] = await Promise.all([
      analyzeImageDataUrl(result.dataUrl, isSvg),
      generateThumbnailDataUrl(result.dataUrl, isSvg),
    ]);

    const relPath = file.filePath.startsWith(baseDir + "\\")
      ? file.filePath.slice(baseDir.length + 1)
      : file.filePath.startsWith(baseDir + "/")
      ? file.filePath.slice(baseDir.length + 1)
      : file.filePath;

    const segments = relPath.split(/[\\/]/);
    const category = segments[0] ?? "Other";
    const folders = segments.slice(0, -1);

    // Save thumbnail
    const id = stableAssetId(relPath);
    thumbnailCache.delete(id); // invalidate old cache

    let thumbnailPath: string | undefined;
    if (thumbDataUrl) {
      const b64 = thumbDataUrl.split(",")[1] ?? "";
      const saveRes = await glib().saveThumbnail({ id, base64: b64, ext: "jpg" });
      if (saveRes.success) thumbnailPath = saveRes.thumbnailPath;
    }

    const meta = file.companionMeta ?? {};

    return {
      id,
      filePath: file.filePath,
      relativePath: relPath,
      fileName: file.fileName,
      category,
      folders,
      type: ext as GraphicAsset["type"],
      width: analysis.width,
      height: analysis.height,
      orientation: analysis.orientation,
      hasTransparency: analysis.hasTransparency,
      dominantColors: analysis.dominantColors,
      colorNames: analysis.colorNames,
      tags: extractTags(file.fileName, folders, meta.tags),
      favorite: meta.favorite ?? false,
      source: meta.source ?? "local",
      sourceUrl: meta.sourceUrl,
      createdAt: meta.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnailPath,
      fileSize: file.size,
      mtimeMs: file.mtimeMs,
    };
  } catch {
    return null;
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGraphicsLibraryStore = create<GraphicsLibraryState>()((set, get) => ({
  assets: [],
  isScanning: false,
  scanProgress: { done: 0, total: 0 },
  selectedAssetId: null,
  filters: { ...DEFAULT_GLIB_FILTERS },
  viewMode: "grid",
  baseDir: "",
  lastScanAt: 0,

  loadIndex: async () => {
    try {
      const { baseDir } = await glib().ensureDirs();
      set({ baseDir });
      const res = await glib().readIndex();
      set({ assets: res.index ?? [] });
    } catch { /* no-op — first launch */ }
  },

  scan: async () => {
    if (get().isScanning) return;
    set({ isScanning: true, scanProgress: { done: 0, total: 0 } });

    try {
      const { baseDir } = await glib().ensureDirs();
      set({ baseDir });

      const { files } = await glib().scanDir();
      const { index: existing } = await glib().readIndex();
      const byPath = new Map<string, GraphicAsset>(
        (existing ?? []).map((a: GraphicAsset) => [a.filePath, a])
      );
      const currentPaths = new Set<string>(files.map((f: FileScanResult) => f.filePath));

      const toProcess = files.filter((f: FileScanResult) => {
        const ex = byPath.get(f.filePath);
        return !ex || ex.mtimeMs !== f.mtimeMs || ex.fileSize !== f.size;
      });

      const unchangedPaths = new Set(toProcess.map((f: FileScanResult) => f.filePath));
      const unchanged = (existing ?? []).filter(
        (a: GraphicAsset) => currentPaths.has(a.filePath) && !unchangedPaths.has(a.filePath)
      );

      set({ scanProgress: { done: 0, total: toProcess.length } });

      const BATCH = 6;
      const processed: GraphicAsset[] = [...unchanged];

      for (let i = 0; i < toProcess.length; i += BATCH) {
        const batch = toProcess.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map((f: FileScanResult) => processFile(f, baseDir).catch(() => null))
        );
        results.forEach((r) => { if (r) processed.push(r); });
        set({
          assets: [...processed],
          scanProgress: { done: Math.min(i + BATCH, toProcess.length), total: toProcess.length },
        });
      }

      await glib().writeIndex(processed);
      set({ assets: processed, isScanning: false, lastScanAt: Date.now() });
    } catch (err) {
      console.error("[glib] Scan failed:", err);
      set({ isScanning: false });
    }
  },

  refreshIndex: () => {
    void get().loadIndex();
  },

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  resetFilters: () => set({ filters: { ...DEFAULT_GLIB_FILTERS } }),

  setSelectedAsset: (id) => set({ selectedAssetId: id }),

  setViewMode: (mode) => set({ viewMode: mode }),

  toggleFavorite: async (id) => {
    const assets = get().assets.map((a) =>
      a.id === id ? { ...a, favorite: !a.favorite, updatedAt: new Date().toISOString() } : a
    );
    set({ assets });
    await glib().writeIndex(assets);
  },

  updateAssetTags: async (id, tags) => {
    const assets = get().assets.map((a) =>
      a.id === id ? { ...a, tags, updatedAt: new Date().toISOString() } : a
    );
    set({ assets });
    await glib().writeIndex(assets);
  },

  deleteAsset: async (id) => {
    const asset = get().assets.find((a) => a.id === id);
    if (!asset) return;
    await glib().deleteFile(asset.filePath);
    if (asset.thumbnailPath) await glib().deleteFile(asset.thumbnailPath).catch(() => undefined);
    thumbnailCache.delete(id);
    const assets = get().assets.filter((a) => a.id !== id);
    set({ assets, selectedAssetId: get().selectedAssetId === id ? null : get().selectedAssetId });
    await glib().writeIndex(assets);
  },

  moveAsset: async (id, toCategory) => {
    const asset = get().assets.find((a) => a.id === id);
    if (!asset) return;
    const { baseDir } = get();
    const toDir = baseDir ? `${baseDir}/${toCategory}` : toCategory;
    const res = await glib().moveFile({ fromPath: asset.filePath, toDir, newName: asset.fileName });
    if (!res.success || !res.newPath) return;
    const newPath = res.newPath;
    const relPath = newPath.startsWith(baseDir)
      ? newPath.slice(baseDir.length + 1)
      : newPath;
    const updated: GraphicAsset = {
      ...asset,
      filePath: newPath,
      relativePath: relPath,
      category: toCategory,
      folders: [toCategory],
      updatedAt: new Date().toISOString(),
    };
    const assets = get().assets.map((a) => (a.id === id ? updated : a));
    set({ assets });
    await glib().writeIndex(assets);
  },

  addFileToIndex: async ({ filePath, fileName, mtimeMs, size }) => {
    // Resolve baseDir lazily — may be empty if the panel was never opened this session
    let { baseDir } = get();
    if (!baseDir) {
      try {
        const res = await glib().ensureDirs();
        baseDir = res.baseDir;
        set({ baseDir });
      } catch { return; }
    }
    const asset = await processFile({ filePath, fileName, mtimeMs, size }, baseDir);
    if (!asset) return;
    const assets = [...get().assets.filter((a) => a.filePath !== filePath), asset];
    set({ assets });
    await glib().writeIndex(assets);
  },
}));

// ─── Derived selectors ────────────────────────────────────────────────────────

export function selectFilteredAssets(state: GraphicsLibraryState): GraphicAsset[] {
  const { assets, filters } = state;
  const q = filters.query.toLowerCase().trim();

  return assets.filter((a) => {
    if (filters.category !== "all" && a.category !== filters.category) return false;
    if (filters.orientation && a.orientation !== filters.orientation) return false;
    if (filters.colorName && !a.colorNames.includes(filters.colorName as GraphicAsset["colorNames"][number])) return false;
    if (filters.fileType && a.type !== filters.fileType) return false;
    if (filters.favoritesOnly && !a.favorite) return false;
    if (filters.transparentOnly && !a.hasTransparency) return false;
    if (q) {
      const haystack = `${a.fileName} ${a.tags.join(" ")} ${a.category} ${a.folders.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function selectCategories(state: GraphicsLibraryState): string[] {
  const cats = new Set(state.assets.map((a) => a.category));
  return ["all", ...cats];
}

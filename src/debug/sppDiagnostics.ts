import type Konva from "konva";
import type { Document, Page } from "@/types/document";

type MountKind = "EditorScreen" | "CanvasStage" | "KonvaLayerNode" | "PageThumb" | "LayerThumbnail";

type MemorySnapshot = {
  source: "electron" | "chromium" | "unavailable";
  heapUsed?: number;
  heapTotal?: number;
  rss?: number;
  external?: number;
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
};

type PageSwitchSummary = {
  documentPageCount: number;
  activePageLayerCount: number;
  totalLayerCount: number;
  assetCount: number;
  historyUndoCount: number;
  historyRedoCount: number;
};

type DebugImageRecord = {
  src: string;
  status: "loading" | "loaded" | "error" | "cleanup";
  createdAt: number;
  updatedAt: number;
};

type DebugEvent = {
  label: string;
  data?: unknown;
  at: string;
};

export type AutosaveDebugStatus = {
  ok: boolean;
  reason?: string;
  pagesCount: number;
  assetsCount: number;
  estimatedSizeBytes: number;
  estimatedSizeMb: number;
  storageTarget: string;
  message?: string;
  savedAt: string;
};

type StageRecord = {
  id: string;
  getStage: () => Konva.Stage | null;
  pageId?: string;
};

export type SppDebugReport = {
  enabled: boolean;
  mounts: Record<MountKind, number>;
  peakMounts: Record<MountKind, number>;
  images: {
    active: number;
    loaded: number;
    errors: number;
    uniqueSources: number;
    sourceRefs: Array<{ src: string; refs: number }>;
  };
  konva: ReturnType<typeof getKonvaDiagnostics>;
  autosave: AutosaveDebugStatus | null;
  events: DebugEvent[];
  pageSwitches: DebugEvent[];
  findings: Array<{ severity: "info" | "medium" | "high"; location: string; estimatedImpact: string; note: string }>;
};

interface SppDebugApi {
  getReport: () => SppDebugReport;
  logPageSwitch: (fromPageId: string | null, toPageId: string, summary?: PageSwitchSummary) => void;
  runStressTest: (options?: { pages?: number; images?: number; switches?: number }) => Promise<SppDebugReport>;
  reset: () => void;
  mark: (label: string, data?: unknown) => void;
  getKonvaDiagnostics: () => ReturnType<typeof getKonvaDiagnostics>;
}

// Temporary audit instrumentation: keep this available in built Electron
// renderer bundles too, because SPP2's `npm run electron` rebuilds and loads
// `dist` where `import.meta.env.DEV` is false.
const DIAGNOSTICS_AVAILABLE = true;
let diagnosticsActive = true;
const mounts = new Map<MountKind, number>();
const peakMounts = new Map<MountKind, number>();
const events: DebugEvent[] = [];
const pageSwitches: DebugEvent[] = [];
const stageRecords = new Map<string, StageRecord>();
const imageRecords = new Map<string, DebugImageRecord>();
const imageSourceRefs = new Map<string, number>();
let autosaveStatus: AutosaveDebugStatus | null = null;

let stageSeq = 0;
let imageSeq = 0;

function emptyMounts(): Record<MountKind, number> {
  return {
    EditorScreen: 0,
    CanvasStage: 0,
    KonvaLayerNode: 0,
    PageThumb: 0,
    LayerThumbnail: 0
  };
}

function mountSnapshot(source: Map<MountKind, number>): Record<MountKind, number> {
  return {
    ...emptyMounts(),
    ...Object.fromEntries(source)
  } as Record<MountKind, number>;
}

function pushEvent(target: DebugEvent[], label: string, data?: unknown): void {
  if (!DIAGNOSTICS_AVAILABLE || !diagnosticsActive) return;
  target.push({ label, data, at: new Date().toISOString() });
  if (target.length > 250) target.splice(0, target.length - 250);
}

function mark(label: string, data?: unknown): void {
  pushEvent(events, label, data);
  if (DIAGNOSTICS_AVAILABLE && diagnosticsActive) {
    console.debug(`[SPP diagnostics] ${label}`, data ?? "");
  }
}

export const markDebugEvent = mark;

export function setAutosaveDebugStatus(status: AutosaveDebugStatus): void {
  autosaveStatus = status;
  mark("autosave:status", status);
}

export function trackDebugMount(kind: MountKind, detail?: unknown): () => void {
  if (!DIAGNOSTICS_AVAILABLE || !diagnosticsActive) return () => {};
  const next = (mounts.get(kind) ?? 0) + 1;
  mounts.set(kind, next);
  peakMounts.set(kind, Math.max(peakMounts.get(kind) ?? 0, next));
  pushEvent(events, `${kind}:mount`, detail);
  return () => {
    mounts.set(kind, Math.max(0, (mounts.get(kind) ?? 0) - 1));
    pushEvent(events, `${kind}:unmount`, detail);
  };
}

export function registerKonvaStage(getStage: () => Konva.Stage | null, pageId?: string): () => void {
  if (!DIAGNOSTICS_AVAILABLE || !diagnosticsActive) return () => {};
  const id = `stage-${++stageSeq}`;
  stageRecords.set(id, { id, getStage, pageId });
  mark("konva-stage:register", { id, pageId });
  return () => {
    stageRecords.delete(id);
    mark("konva-stage:unregister", { id, pageId });
  };
}

export function registerDebugImageLoad(src: string | undefined): { id: string; cleanup: () => void } | null {
  if (!DIAGNOSTICS_AVAILABLE || !diagnosticsActive || src === undefined || src.length === 0) return null;
  const id = `image-${++imageSeq}`;
  imageRecords.set(id, { src, status: "loading", createdAt: Date.now(), updatedAt: Date.now() });
  imageSourceRefs.set(src, (imageSourceRefs.get(src) ?? 0) + 1);
  mark("image:load-start", { id, src: src.slice(0, 120), refs: imageSourceRefs.get(src) });
  return {
    id,
    cleanup: () => {
      const record = imageRecords.get(id);
      if (record !== undefined) {
        record.status = "cleanup";
        record.updatedAt = Date.now();
      }
      const refs = Math.max(0, (imageSourceRefs.get(src) ?? 1) - 1);
      if (refs === 0) imageSourceRefs.delete(src);
      else imageSourceRefs.set(src, refs);
      imageRecords.delete(id);
      mark("image:cleanup", { id, src: src.slice(0, 120), refs });
    }
  };
}

export function markDebugImageLoaded(id: string): void {
  const record = imageRecords.get(id);
  if (record === undefined) return;
  record.status = "loaded";
  record.updatedAt = Date.now();
  mark("image:load-success", { id, src: record.src.slice(0, 120) });
}

export function markDebugImageError(id: string): void {
  const record = imageRecords.get(id);
  if (record === undefined) return;
  record.status = "error";
  record.updatedAt = Date.now();
  mark("image:load-error", { id, src: record.src.slice(0, 120) });
}

function getPerformanceMemory(): MemorySnapshot {
  const perf = performance as Performance & {
    memory?: { jsHeapSizeLimit: number; totalJSHeapSize: number; usedJSHeapSize: number };
  };
  if (perf.memory !== undefined) {
    return {
      source: "chromium",
      jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
      totalJSHeapSize: perf.memory.totalJSHeapSize,
      usedJSHeapSize: perf.memory.usedJSHeapSize
    };
  }
  return { source: "unavailable" };
}

async function getMemorySnapshot(): Promise<MemorySnapshot> {
  if (!DIAGNOSTICS_AVAILABLE || !diagnosticsActive) return { source: "unavailable" };
  try {
    const electronMemory = await window.spp?.getMemoryUsage?.();
    if (electronMemory !== undefined) {
      return { source: "electron", ...electronMemory };
    }
  } catch {
    // Fall back to Chromium below.
  }
  return getPerformanceMemory();
}

function countDocumentLayers(document: Document | null): number {
  return document?.pages.reduce((sum, page) => sum + page.layers.length, 0) ?? 0;
}

export function getDocumentDebugSummary(document: Document | null, activePage: Page | null, history?: { undoStack: unknown[]; redoStack: unknown[] }): PageSwitchSummary {
  return {
    documentPageCount: document?.pages.length ?? 0,
    activePageLayerCount: activePage?.layers.length ?? 0,
    totalLayerCount: countDocumentLayers(document),
    assetCount: document?.assets.length ?? 0,
    historyUndoCount: history?.undoStack.length ?? 0,
    historyRedoCount: history?.redoStack.length ?? 0
  };
}

function getKonvaDiagnostics() {
  let totalStages = 0;
  let totalLayers = 0;
  let totalNodes = 0;
  let totalImageNodes = 0;
  let totalCachedNodes = 0;
  let totalNodesWithCacheCanvas = 0;
  const stageErrors: Array<{ id: string; pageId?: string; message: string }> = [];

  for (const record of stageRecords.values()) {
    try {
      const stage = record.getStage();
      if (stage === null) continue;
      totalStages += 1;
      totalLayers += stage.getLayers().length;
      const nodes = stage.find(() => true);
      totalNodes += nodes.length;
      nodes.forEach((node) => {
        if (node.getClassName?.() === "Image") totalImageNodes += 1;
        const maybeCached = node as Konva.Node & { isCached?: () => boolean; _cache?: { canvas?: unknown } };
        if (maybeCached.isCached?.() === true) totalCachedNodes += 1;
        if (maybeCached._cache?.canvas !== undefined) totalNodesWithCacheCanvas += 1;
      });
    } catch (error) {
      stageErrors.push({
        id: record.id,
        pageId: record.pageId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    totalStages,
    totalLayers,
    totalNodes,
    totalImageNodes,
    totalCachedNodes,
    totalNodesWithCacheCanvas,
    stageErrors
  };
}

function getImageDiagnostics() {
  const records = [...imageRecords.values()];
  return {
    active: records.length,
    loaded: records.filter((record) => record.status === "loaded").length,
    errors: records.filter((record) => record.status === "error").length,
    uniqueSources: imageSourceRefs.size,
    sourceRefs: [...imageSourceRefs.entries()].map(([src, refs]) => ({ src: src.slice(0, 160), refs }))
  };
}

function buildFindings(): SppDebugReport["findings"] {
  const konva = getKonvaDiagnostics();
  const imageDiag = getImageDiagnostics();
  const currentMounts = mountSnapshot(mounts);
  const findings: SppDebugReport["findings"] = [
    {
      severity: currentMounts.CanvasStage > 1 ? "high" : "info",
      location: "src/ui/editor/CanvasStage.tsx",
      estimatedImpact: currentMounts.CanvasStage > 1 ? "Multiple live canvases can multiply Konva memory per page." : "Normal path appears to keep one active page canvas mounted.",
      note: `Mounted CanvasStage count: ${currentMounts.CanvasStage}.`
    },
    {
      severity: konva.totalCachedNodes > 0 ? "medium" : "info",
      location: "src/ui/editor/KonvaLayerNode.tsx",
      estimatedImpact: "Cached Konva nodes allocate backing canvases and can grow with image/effect-heavy pages.",
      note: `Cached nodes: ${konva.totalCachedNodes}; nodes with cache canvas: ${konva.totalNodesWithCacheCanvas}.`
    },
    {
      severity: imageDiag.active > 75 ? "medium" : "info",
      location: "src/ui/editor/useKonvaImage.ts",
      estimatedImpact: "Each loaded image keeps decoded bitmap memory in Chromium in addition to document data URLs.",
      note: `Active image elements tracked: ${imageDiag.active}; unique sources: ${imageDiag.uniqueSources}.`
    }
  ];
  return findings;
}

function getReport(): SppDebugReport {
  return {
    enabled: DIAGNOSTICS_AVAILABLE,
    mounts: mountSnapshot(mounts),
    peakMounts: mountSnapshot(peakMounts),
    images: getImageDiagnostics(),
    konva: getKonvaDiagnostics(),
    autosave: autosaveStatus,
    events: [...events],
    pageSwitches: [...pageSwitches],
    findings: buildFindings()
  };
}

export function resetDiagnostics(): void {
  diagnosticsActive = true;
  mounts.clear();
  peakMounts.clear();
  events.length = 0;
  pageSwitches.length = 0;
  stageRecords.clear();
  imageRecords.clear();
  imageSourceRefs.clear();
  autosaveStatus = null;
  mark("diagnostics:reset");
}

export function logPageSwitch(fromPageId: string | null, toPageId: string, summary?: PageSwitchSummary): void {
  if (!DIAGNOSTICS_AVAILABLE || !diagnosticsActive) return;
  void (async () => {
    const beforeMemory = await getMemorySnapshot();
    const beforeKonva = getKonvaDiagnostics();
    const beforeImages = getImageDiagnostics();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const afterMemory = await getMemorySnapshot();
    const payload = {
      from: fromPageId,
      to: toPageId,
      mounted: mountSnapshot(mounts),
      konvaBefore: beforeKonva,
      konvaAfter: getKonvaDiagnostics(),
      imagesBefore: beforeImages,
      imagesAfter: getImageDiagnostics(),
      memoryBefore: beforeMemory,
      memoryAfter: afterMemory,
      summary
    };
    pushEvent(pageSwitches, "PAGE SWITCH", payload);
    console.groupCollapsed("[SPP diagnostics] PAGE SWITCH");
    console.log(payload);
    console.groupEnd();
  })();
}

function makeTinyDataUrl(index: number): string {
  const hue = (index * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="hsl(${hue},70%,58%)"/><text x="80" y="66" text-anchor="middle" font-size="24" font-family="Arial" fill="white">${index + 1}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

async function runStressTest(options: { pages?: number; images?: number; switches?: number } = {}): Promise<SppDebugReport> {
  if (!DIAGNOSTICS_AVAILABLE) return getReport();
  diagnosticsActive = true;
  const pageCount = Math.max(1, options.pages ?? 50);
  const imageCount = Math.max(1, options.images ?? pageCount);
  const switchCount = Math.max(0, options.switches ?? pageCount * 3);

  mark("stress:start", { pageCount, imageCount, switchCount });

  const [{ useDocumentStore }, core] = await Promise.all([
    import("@/state/documentStore"),
    import("@/core")
  ]);

  const assets = Array.from({ length: imageCount }, (_, index) => {
    const dataUrl = makeTinyDataUrl(index);
    return {
      version: 1 as const,
      id: `debug-asset-${index + 1}`,
      name: `Debug asset ${index + 1}`,
      kind: "image" as const,
      status: "ready" as const,
      originalPath: dataUrl,
      previewPath: dataUrl,
      thumbnailPath: dataUrl,
      mimeType: "image/svg+xml",
      width: 160,
      height: 120,
      fileSize: dataUrl.length,
      metadata: { debug: true }
    };
  });

  const pages = Array.from({ length: pageCount }, (_, index) => {
    const asset = assets[index % assets.length]!;
    const page = core.createPage({ name: `Debug Page ${index + 1}` });
    const layer = core.createImageLayer({
      name: `Debug image ${index + 1}`,
      assetId: asset.id,
      rect: {
        x: 120 + (index % 5) * 12,
        y: 120 + (index % 7) * 10,
        width: 520,
        height: 390
      },
      fitMode: "fit",
      zIndex: 1
    });
    return { ...page, layers: [layer] };
  });

  const document = {
    ...core.createDocument({
      name: `SPP2 Debug Stress ${pageCount} pages`,
      dpi: pages[0]?.setup.dpi,
      metadata: { mode: "free", debugStressTest: true }
    }),
    pages,
    assets
  };

  const store = useDocumentStore.getState();
  store.setDocument(document);
  window.dispatchEvent(new CustomEvent("spp2:debug-open-editor"));
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  for (let i = 0; i < switchCount; i++) {
    const page = pages[i % pages.length]!;
    useDocumentStore.getState().setActivePage(page.id);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  const report = getReport();
  console.group("[SPP diagnostics] Stress test report");
  console.log(report);
  console.table(report.findings);
  console.groupEnd();
  mark("stress:end", { pageCount, imageCount, switchCount, report });
  return report;
}

function installDebugApi(): void {
  if (!DIAGNOSTICS_AVAILABLE || typeof window === "undefined") return;
  const api: SppDebugApi = {
    getReport,
    logPageSwitch,
    runStressTest,
    reset: resetDiagnostics,
    mark,
    getKonvaDiagnostics
  };
  window.sppDebug = api;
  window.addEventListener("error", (event) => {
    mark("window:error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error instanceof Error ? { name: event.error.name, message: event.error.message, stack: event.error.stack } : String(event.error)
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    mark("window:unhandledrejection", reason instanceof Error
      ? { name: reason.name, message: reason.message, stack: reason.stack }
      : { reason: String(reason) });
  });
  console.info("[SPP diagnostics] active. Use window.sppDebug.getReport() after a crash/repro.");
}

installDebugApi();

declare global {
  interface Window {
    sppDebug?: SppDebugApi;
  }
}

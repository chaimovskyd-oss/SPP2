// Renderer-side orchestrator for the Advanced Print Engine. The UI calls this; it ties together
// the geometry (computePrintLayout), color pass, engine-selection ladder, the native worker, and
// the PDF path, and writes the per-job JSONL log. It owns no geometry decisions of its own — the
// PrintLayout from computePrintLayout() is the single source of truth.

import type {
  AdvancedPrinterProfile,
  AdvancedPrintJobLog,
  DriverState,
  OutputPreset,
  PreflightReport,
  PrinterCapabilities,
  PrintLayout
} from "@/types/advancedPrint";
import { computePrintLayout, type RenderedOutput } from "@/core/advancedPrint/pageGeometry";
import { runPreflight } from "@/core/advancedPrint/preflight";
import { resolveColor } from "@/core/advancedPrint/colorManagement";
import { selectEngine, stepToEngine, type ResolvedEngineStep } from "@/core/advancedPrint/engineSelect";
import { renderLayoutsToPdf, pdfBytesToDataUrl } from "@/core/advancedPrint/renderToPdf";

/** A single rendered page plus the data URL the print path consumes. */
export interface RenderedPage {
  rendered: RenderedOutput;
  dataUrl: string;
}

/**
 * Lazily renders a page on demand. `preview: true` may return a lighter/proxy render; `false`
 * must return the full-resolution print image. Returning null means the page could not render.
 * Rendering one page at a time (just-in-time) keeps dozens-of-pages jobs memory-efficient.
 */
export type RenderPageFn = (index: number, opts: { preview: boolean }) => Promise<RenderedPage | null>;

/** Cheap per-page metadata (from page setup, no render) — used for cross-page validation. */
export interface PageMeta {
  index: number;
  name: string;
  widthMm: number;
  heightMm: number;
  orientation: "portrait" | "landscape";
}

export interface AdvancedPrintRequest {
  pageIndices: number[];
  renderPage: RenderPageFn;
  profile: AdvancedPrinterProfile;
  outputPreset?: OutputPreset;
  iccProfilePath?: string;
  copies: number;
  /** Real printer capabilities (printable area) so the job's layout matches the preview exactly. */
  caps?: PrinterCapabilities;
}

/** Per-page device diagnostics returned by the native worker (real paper/printable/margins). */
/** One page of a native multi-page print job (image + paper + placement, all in mm). */
interface NativePrintPage {
  imagePath: string;
  paperWidthMm: number;
  paperHeightMm: number;
  placementXmm: number;
  placementYmm: number;
  placementWidthMm: number;
  placementHeightMm: number;
}

export interface NativePrintDiagnostics {
  devicePaperWidthMm: number;
  devicePaperHeightMm: number;
  devicePrintableWidthMm: number;
  devicePrintableHeightMm: number;
  hardMarginLeftMm: number;
  hardMarginTopMm: number;
  jobPaperWidthMm: number;
  jobPaperHeightMm: number;
  paperMismatch: boolean;
  recentered: boolean;
  drawXmm: number;
  drawYmm: number;
  drawWidthMm: number;
  drawHeightMm: number;
  originAtMargins: boolean;
}

export interface AdvancedPrintOutcome {
  status: "success" | "failed" | "canceled" | "blocked";
  engineUsed: ResolvedEngineStep | "none";
  fallbacksTried: ResolvedEngineStep[];
  preflight: PreflightReport;
  error?: string;
  /** For the export path. */
  pdfDataUrl?: string;
  /** Device diagnostics from the last printed page (native path only). */
  diagnostics?: NativePrintDiagnostics;
}

/** Reads worker health to know whether the native path is viable. */
async function probeWorker(): Promise<{ available: boolean; isWindows: boolean }> {
  const api = window.spp?.advancedPrint;
  if (!api) return { available: false, isWindows: false };
  try {
    const h = await api.health();
    return { available: h.available, isWindows: h.isWindows };
  } catch {
    return { available: false, isWindows: false };
  }
}

/** Renders a page (via the provider) and computes its authoritative layout. */
async function renderAndLayout(
  req: AdvancedPrintRequest,
  index: number,
  preview: boolean
): Promise<{ page: RenderedPage; layout: PrintLayout } | null> {
  const page = await req.renderPage(index, { preview });
  if (!page) return null;
  return { page, layout: computePrintLayout(page.rendered, req.profile, req.caps) };
}

/**
 * Detects whether all pages share the same physical size. Mixed sizes are valid but worth a
 * warning, since one paper/scale setting may not suit every page.
 */
export function detectMixedSizes(metas: PageMeta[]): boolean {
  if (metas.length < 2) return false;
  const first = metas[0];
  return metas.some(
    (m) => Math.abs(m.widthMm - first.widthMm) > 0.5 || Math.abs(m.heightMm - first.heightMm) > 0.5
  );
}

async function applyColorPass(
  inputPath: string,
  profile: AdvancedPrinterProfile,
  preset: OutputPreset | undefined,
  iccProfilePath: string | undefined
): Promise<string> {
  const api = window.spp?.advancedPrint;
  if (!api) return inputPath;
  const color = resolveColor(profile, preset);
  if (!color.needsColorPass) return inputPath;
  try {
    const result = await api.applyColor({
      input_path: inputPath,
      preset: preset ?? null,
      color_mode: color.mode,
      apply_icc: color.applyIcc,
      icc_profile_path: iccProfilePath ?? "",
      rendering_intent: color.renderingIntent,
      black_point_compensation: color.blackPointCompensation
    });
    const out = (result as { outputPath?: string })?.outputPath;
    return out || inputPath;
  } catch {
    return inputPath; // color pass is best-effort; never block printing on it
  }
}

/** Writes a log entry (best-effort). */
function writeLog(entry: AdvancedPrintJobLog): void {
  void window.spp?.advancedPrint?.writeLog(entry).catch(() => undefined);
}

function baseLog(req: AdvancedPrintRequest, layout: PrintLayout, preflight: PreflightReport): AdvancedPrintJobLog {
  const color = resolveColor(req.profile, req.outputPreset);
  return {
    timestamp: new Date().toISOString(),
    printerName: req.profile.windowsPrinterName,
    profileName: req.profile.name,
    engine: req.profile.engine,
    engineFallbacks: [],
    renderedFilePath: "",
    renderedWidthPx: layout.renderedPx.width,
    renderedHeightPx: layout.renderedPx.height,
    physicalWidthMm: layout.printSizeMm.widthMm,
    physicalHeightMm: layout.printSizeMm.heightMm,
    dpi: layout.dpi,
    orientation: layout.resolvedOrientation,
    scalePercent: layout.scalePercent,
    marginsPolicy: req.profile.marginsPolicy,
    trayLabel: req.profile.traySource.label,
    colorMode: color.mode,
    iccProfileId: color.iccProfileId,
    outputPresetId: req.outputPreset?.id,
    warnings: preflight.warnings,
    status: "failed"
  };
}

/** Executes the print job through the engine-selection ladder, rendering pages just-in-time. */
export async function executeAdvancedPrint(
  req: AdvancedPrintRequest,
  driver: DriverState,
  options?: { allowBlockers?: boolean; onProgress?: (done: number, total: number) => void }
): Promise<AdvancedPrintOutcome> {
  // Render the first page (preview res) to derive a representative layout for preflight + logging.
  const first = await renderAndLayout(req, req.pageIndices[0], true);
  if (!first) {
    const empty: PreflightReport = { warnings: [], hasBlocker: false, clean: true };
    return { status: "failed", engineUsed: "none", fallbacksTried: [], preflight: empty, error: "render failed" };
  }
  const layout0 = first.layout;
  const preflight = runPreflight({ layout: layout0, profile: req.profile, driver, outputPreset: req.outputPreset });

  if (preflight.hasBlocker && !options?.allowBlockers) {
    return { status: "blocked", engineUsed: "none", fallbacksTried: [], preflight };
  }

  const { available, isWindows } = await probeWorker();
  const selection = selectEngine({ profile: req.profile, driver, isWindows, workerAvailable: available });
  const ladder: ResolvedEngineStep[] = [selection.primary, ...selection.fallbacks];

  const log = baseLog(req, layout0, preflight);
  const tried: ResolvedEngineStep[] = [];
  const api = window.spp?.advancedPrint;
  const total = req.pageIndices.length;

  // Native print: render + color-manage every page first, then submit them as ONE
  // spooler document (multi-page job) instead of one job per page.
  let lastDiagnostics: NativePrintDiagnostics | undefined;
  const printNative = async (devmodeBase64: string | null): Promise<void> => {
    if (!api) throw new Error("worker bridge unavailable");
    let done = 0;
    const pages: NativePrintPage[] = [];
    for (const index of req.pageIndices) {
      const rl = await renderAndLayout(req, index, false);
      if (!rl) throw new Error(`render failed for page ${index + 1}`);
      const tmp = await api.writeTempImage(rl.page.dataUrl, "png");
      const printSrc = await applyColorPass(tmp.path, req.profile, req.outputPreset, req.iccProfilePath);
      pages.push({
        imagePath: printSrc,
        paperWidthMm: rl.layout.printerPaperMm.widthMm,
        paperHeightMm: rl.layout.printerPaperMm.heightMm,
        placementXmm: rl.layout.placementRectMm.xMm,
        placementYmm: rl.layout.placementRectMm.yMm,
        placementWidthMm: rl.layout.placementRectMm.widthMm,
        placementHeightMm: rl.layout.placementRectMm.heightMm
      });
      options?.onProgress?.(++done, total);
    }
    if (pages.length === 0) throw new Error("no pages rendered for native print");
    const head = pages[0];
    // `pages` drives the multi-page job; the flat fields mirror page 1 so an older
    // worker that ignores `pages` still prints (at least) the first page.
    const result = await api.print({
      printerName: req.profile.windowsPrinterName,
      devmodeBase64,
      copies: req.copies,
      imagePath: head.imagePath,
      paperWidthMm: head.paperWidthMm,
      paperHeightMm: head.paperHeightMm,
      placementXmm: head.placementXmm,
      placementYmm: head.placementYmm,
      placementWidthMm: head.placementWidthMm,
      placementHeightMm: head.placementHeightMm,
      pages
    });
    if (result.diagnostics) lastDiagnostics = result.diagnostics as NativePrintDiagnostics;
    if (!result.success) throw new Error(result.error || "native print failed");
  };

  for (const step of ladder) {
    tried.push(step);
    try {
      if (step === "windows-native-devmode" || step === "windows-native-default") {
        await printNative(step === "windows-native-devmode" ? req.profile.devmode.base64 ?? null : null);
        writeLog({ ...log, engine: "windows-native", engineFallbacks: tried.slice(0, -1).map(stepToEngine), status: "success" });
        return { status: "success", engineUsed: step, fallbacksTried: tried.slice(0, -1), preflight, diagnostics: lastDiagnostics };
      }

      if (step === "driver-dialog-first") {
        if (!api) throw new Error("worker bridge unavailable");
        const dlg = await api.openDriverDialog(req.profile.windowsPrinterName);
        if (dlg.cancelled) {
          writeLog({ ...log, engineFallbacks: tried.slice(0, -1).map(stepToEngine), status: "canceled" });
          return { status: "canceled", engineUsed: step, fallbacksTried: tried.slice(0, -1), preflight };
        }
        await printNative(dlg.devmodeBase64 ?? null);
        writeLog({ ...log, engine: "windows-native", engineFallbacks: tried.slice(0, -1).map(stepToEngine), status: "success" });
        return { status: "success", engineUsed: step, fallbacksTried: tried.slice(0, -1), preflight, diagnostics: lastDiagnostics };
      }

      if (step === "pdf") {
        const pdfPages: Array<{ dataUrl: string; layout: PrintLayout }> = [];
        let done = 0;
        for (const index of req.pageIndices) {
          const rl = await renderAndLayout(req, index, false);
          if (rl) pdfPages.push({ dataUrl: rl.page.dataUrl, layout: rl.layout });
          options?.onProgress?.(++done, total);
        }
        const pdfBytes = await renderLayoutsToPdf(pdfPages);
        const pdfDataUrl = pdfBytesToDataUrl(pdfBytes);
        writeLog({ ...log, engine: "pdf", engineFallbacks: tried.slice(0, -1).map(stepToEngine), status: "success" });
        return { status: "success", engineUsed: step, fallbacksTried: tried.slice(0, -1), preflight, pdfDataUrl };
      }

      // electron / export-only are owned by the existing path / caller; report and stop.
      if (step === "electron" || step === "export-only") {
        writeLog({ ...log, engine: "electron", engineFallbacks: tried.slice(0, -1).map(stepToEngine), status: "success" });
        return { status: "success", engineUsed: step, fallbacksTried: tried.slice(0, -1), preflight };
      }
    } catch (err) {
      // Try the next rung of the ladder.
      log.errorMessage = String(err instanceof Error ? err.message : err);
      continue;
    }
  }

  writeLog({ ...log, engineFallbacks: tried.map(stepToEngine), status: "failed" });
  return { status: "failed", engineUsed: "none", fallbacksTried: tried, preflight, error: log.errorMessage };
}

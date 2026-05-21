import type { PrintableStageImage } from "@/ui/projectActions";
import { markDebugEvent } from "@/debug/sppDiagnostics";

export interface PrintPreviewOpenRequest extends PrintableStageImage {
  documentName: string;
  pageName?: string;
}

export interface PrintPreviewPageEntry {
  filePath: string;
  pageName?: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  orientation?: "portrait" | "landscape";
}

export interface PrintPreviewResult {
  success: boolean;
  error?: string;
}

interface SppPrintApi {
  writeTempImage: (dataUrl: string, ext: string) => Promise<string>;
  openPrintPreview?: (payload: {
    filePath?: string;
    documentName?: string;
    pageName?: string;
    widthPx?: number;
    heightPx?: number;
    widthMm?: number;
    heightMm?: number;
    dpi?: number;
    mimeType?: string;
    orientation?: "portrait" | "landscape";
    pages?: PrintPreviewPageEntry[];
  }) => Promise<PrintPreviewResult>;
  openPath?: (filePath: string) => Promise<{ error?: string }>;
}

function getSppApi(): SppPrintApi | undefined {
  return (window as unknown as { spp?: SppPrintApi }).spp;
}

export function isPrintPreviewAvailable(): boolean {
  const spp = getSppApi();
  return typeof spp?.writeTempImage === "function" && typeof spp.openPrintPreview === "function";
}

/** Open the Python print preview for a single rendered page. */
export async function openPrintPreviewForRenderedPage(request: PrintPreviewOpenRequest): Promise<PrintPreviewResult> {
  const spp = getSppApi();
  if (typeof spp?.writeTempImage !== "function" || typeof spp.openPrintPreview !== "function") {
    return { success: false, error: "Print Preview IPC is not available. Run SPP2 inside Electron." };
  }

  const ext = request.mimeType === "image/jpeg" ? "jpg" : "png";
  markDebugEvent("print-preview:write-temp-single-start", { pageName: request.pageName, dataUrlLength: request.dataUrl.length, ext });
  const filePath = await spp.writeTempImage(request.dataUrl, ext);
  markDebugEvent("print-preview:write-temp-single-end", { pageName: request.pageName, filePath });

  markDebugEvent("print-preview:open-single", { pageName: request.pageName, filePath });
  return spp.openPrintPreview({
    filePath,
    documentName: request.documentName,
    pageName: request.pageName,
    widthPx: request.widthPx,
    heightPx: request.heightPx,
    widthMm: request.widthMm,
    heightMm: request.heightMm,
    dpi: request.dpi,
    mimeType: request.mimeType,
    orientation: request.orientation
  });
}

/**
 * Open the Python print preview for multiple rendered pages.
 * Each page image is written to a temp file; a JSON manifest is then passed
 * to the Python launcher via --manifest, which opens all pages in one window.
 *
 * Falls back to shell.openPath on the first page image if the print preview
 * IPC is unavailable.
 */
export async function openPrintPreviewForPages(
  pages: PrintableStageImage[],
  documentName: string,
  pageNames?: string[]
): Promise<PrintPreviewResult> {
  const spp = getSppApi();
  if (typeof spp?.writeTempImage !== "function" || typeof spp.openPrintPreview !== "function") {
    return { success: false, error: "Print Preview IPC is not available. Run SPP2 inside Electron." };
  }

  if (pages.length === 0) {
    return { success: false, error: "לא נמצאו עמודים להדפסה." };
  }

  // Write each page image to a temp file.
  // Use bounded concurrency to avoid freezing the renderer on large jobs
  // (e.g. 50-page class photo / photo development), while preserving page order.
  markDebugEvent("print-preview:write-temp-pages-start", { pageCount: pages.length });
  const entries: PrintPreviewPageEntry[] = new Array(pages.length);
  const CONCURRENCY = 4;
  let nextIndex = 0;
  const writeOne = async (i: number): Promise<void> => {
    const page = pages[i];
    const ext = page.mimeType === "image/jpeg" ? "jpg" : "png";
    markDebugEvent("print-preview:write-temp-page-start", { index: i, dataUrlLength: page.dataUrl.length, ext });
    const filePath = await spp.writeTempImage(page.dataUrl, ext);
    markDebugEvent("print-preview:write-temp-page-end", { index: i, filePath });
    entries[i] = {
      filePath,
      pageName: pageNames?.[i] ?? `עמוד ${i + 1}`,
      widthMm: page.widthMm,
      heightMm: page.heightMm,
      dpi: page.dpi,
      orientation: page.orientation
    };
  };
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(CONCURRENCY, pages.length); w++) {
    workers.push((async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= pages.length) return;
        await writeOne(i);
      }
    })());
  }
  await Promise.all(workers);

  markDebugEvent("print-preview:open-pages", { pageCount: entries.length });
  return spp.openPrintPreview({ documentName, pages: entries });
}

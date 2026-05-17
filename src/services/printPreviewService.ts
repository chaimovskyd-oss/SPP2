import type { PrintableStageImage } from "@/ui/projectActions";

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
  const filePath = await spp.writeTempImage(request.dataUrl, ext);

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

  // Write each page image to a temp file
  const entries: PrintPreviewPageEntry[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const ext = page.mimeType === "image/jpeg" ? "jpg" : "png";
    const filePath = await spp.writeTempImage(page.dataUrl, ext);
    entries.push({
      filePath,
      pageName: pageNames?.[i] ?? `עמוד ${i + 1}`,
      widthMm: page.widthMm,
      heightMm: page.heightMm,
      dpi: page.dpi,
      orientation: page.orientation
    });
  }

  return spp.openPrintPreview({ documentName, pages: entries });
}

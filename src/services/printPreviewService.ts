import type { PrintableStageImage } from "@/ui/projectActions";

export interface PrintPreviewOpenRequest extends PrintableStageImage {
  documentName: string;
  pageName?: string;
}

export interface PrintPreviewResult {
  success: boolean;
  error?: string;
}

interface SppPrintApi {
  writeTempImage: (dataUrl: string, ext: string) => Promise<string>;
  openPrintPreview?: (payload: {
    filePath: string;
    documentName: string;
    pageName?: string;
    widthPx: number;
    heightPx: number;
    widthMm: number;
    heightMm: number;
    dpi: number;
    mimeType: string;
    orientation?: "portrait" | "landscape";
  }) => Promise<PrintPreviewResult>;
}

function getSppApi(): SppPrintApi | undefined {
  return (window as unknown as { spp?: SppPrintApi }).spp;
}

export function isPrintPreviewAvailable(): boolean {
  const spp = getSppApi();
  return typeof spp?.writeTempImage === "function" && typeof spp.openPrintPreview === "function";
}

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

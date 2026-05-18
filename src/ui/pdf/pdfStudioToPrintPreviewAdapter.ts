import { PDFDocument } from "pdf-lib";
import { openPrintPreviewForPages, type PrintPreviewResult } from "@/services/printPreviewService";
import type { PrintableStageImage } from "@/ui/projectActions";
import { renderPdfBytesPage } from "./pdfRenderService";
import { buildPdfStudioPdf } from "./pdfStudioExportService";
import type { PdfStudioDocument } from "./pdfStudioTypes";
import { PT_TO_MM } from "./pdfStudioTypes";

export async function openPdfStudioPrintPreview(document: PdfStudioDocument): Promise<PrintPreviewResult> {
  if (document.pages.length === 0) {
    return { success: false, error: "אין עמודים להדפסה." };
  }

  const pdfBytes = await buildPdfStudioPdf(document);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const renderedPages: PrintableStageImage[] = [];
  const pageNames: string[] = [];
  const dpi = 300;

  for (let i = 0; i < pdfDoc.getPageCount(); i += 1) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    const rendered = await renderPdfBytesPage(pdfBytes, i, dpi / 72, 0);
    renderedPages.push({
      dataUrl: rendered.dataUrl,
      mimeType: "image/png",
      widthPx: rendered.widthPx,
      heightPx: rendered.heightPx,
      widthMm: width * PT_TO_MM,
      heightMm: height * PT_TO_MM,
      dpi,
      orientation: width >= height ? "landscape" : "portrait"
    });
    pageNames.push(`עמוד ${i + 1}`);
  }

  return openPrintPreviewForPages(renderedPages, document.title || "PDF Studio", pageNames);
}

// Render-to-PDF output path for Advanced Print.
//
// A first-class reliability/troubleshooting/multi-page path: emits a PDF at the EXACT physical
// page size from a PrintLayout, placing each rendered page bitmap at its placement rectangle.
// Used both as an export ("Export PDF for print") and as a fallback engine on the ladder.
//
// V1 is bitmap-per-page. The structure leaves room for vector/text pages later.

import { PDFDocument } from "pdf-lib";
import type { PrintLayout } from "@/types/advancedPrint";

const MM_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;

function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * POINTS_PER_INCH;
}

export interface PdfPageInput {
  /** PNG or JPEG data URL of the rendered, color-managed page. */
  dataUrl: string;
  layout: PrintLayout;
}

/** Builds a multi-page PDF (Uint8Array) sized to each page's printer paper, content placed by layout. */
export async function renderLayoutsToPdf(pages: PdfPageInput[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  for (const { dataUrl, layout } of pages) {
    const pageWpt = mmToPt(layout.printerPaperMm.widthMm);
    const pageHpt = mmToPt(layout.printerPaperMm.heightMm);
    const page = doc.addPage([pageWpt, pageHpt]);

    const isPng = dataUrl.startsWith("data:image/png");
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
    const bytes = base64ToBytes(base64);
    const embedded = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

    const rect = layout.placementRectMm;
    const xPt = mmToPt(rect.xMm);
    const wPt = mmToPt(rect.widthMm);
    const hPt = mmToPt(rect.heightMm);
    // PDF origin is bottom-left; layout origin is top-left → flip Y.
    const yPt = pageHpt - mmToPt(rect.yMm) - hPt;

    page.drawImage(embedded, { x: xPt, y: yPt, width: wPt, height: hPt });
  }

  return doc.save();
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Converts a PDF byte array to a data URL (for writing via the Electron temp-file bridge). */
export function pdfBytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:application/pdf;base64," + btoa(binary);
}

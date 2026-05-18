import { degrees, PDFDocument } from "pdf-lib";
import { renderPdfPage } from "./pdfRenderService";
import type {
  PdfOverlayObject,
  PdfPageAdjustments,
  PdfResizeBehavior,
  PdfStudioDocument,
  PdfStudioPage,
  PdfStudioSourceFile
} from "./pdfStudioTypes";

export async function buildPdfStudioPdf(document: PdfStudioDocument): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const loadedSources = new Map<string, PDFDocument>();

  for (const pageEntry of document.pages) {
    const source = pageEntry.sourceFileId !== undefined ? document.files[pageEntry.sourceFileId] : undefined;
    const overlayDataUrl = pageEntry.overlayObjects.length > 0 ? await renderOverlayObjects(pageEntry) : undefined;
    const shouldFlatten = pageEntry.flattened || hasAdjustments(pageEntry.adjustments);

    if ((pageEntry.sourceType === "pdf" || pageEntry.sourceType === "office-converted") && source !== undefined && pageEntry.sourcePageIndex !== undefined && !shouldFlatten) {
      const copiedPage = await copySourcePage(pdfDoc, loadedSources, source, pageEntry);
      if (copiedPage !== undefined) {
        applyPageTransform(copiedPage, pageEntry, pageEntry.resizeBehavior);
        if (overlayDataUrl !== undefined) await drawOverlayImage(pdfDoc, copiedPage, overlayDataUrl, pageEntry);
        pdfDoc.addPage(copiedPage);
      }
      continue;
    }

    const page = pdfDoc.addPage([pageEntry.widthPt, pageEntry.heightPt]);
    if (pageEntry.sourceType === "image" && pageEntry.imageBytes !== undefined) {
      const imageDataUrl = await imageBytesToDataUrl(pageEntry.imageBytes, pageEntry.imageMime ?? "image/jpeg");
      const adjustedDataUrl = await applyAdjustmentsToDataUrl(imageDataUrl, pageEntry.adjustments);
      await drawPageImage(pdfDoc, page, adjustedDataUrl, pageEntry);
    } else if ((pageEntry.sourceType === "pdf" || pageEntry.sourceType === "office-converted") && source !== undefined) {
      const rendered = await renderPdfPage({ page: pageEntry, source, scale: 2, rotation: pageEntry.rotation });
      const adjustedDataUrl = await applyAdjustmentsToDataUrl(rendered.dataUrl, pageEntry.adjustments);
      await drawPageImage(pdfDoc, page, adjustedDataUrl, { ...pageEntry, rotation: 0 });
    }
    if (overlayDataUrl !== undefined) await drawOverlayImage(pdfDoc, page, overlayDataUrl, pageEntry);
  }

  return pdfDoc.save();
}

async function copySourcePage(
  targetDoc: PDFDocument,
  loadedSources: Map<string, PDFDocument>,
  source: PdfStudioSourceFile,
  pageEntry: PdfStudioPage
) {
  let sourceDoc = loadedSources.get(source.id);
  if (sourceDoc === undefined) {
    sourceDoc = await PDFDocument.load(source.bytes, { ignoreEncryption: true });
    loadedSources.set(source.id, sourceDoc);
  }
  const [copiedPage] = await targetDoc.copyPages(sourceDoc, [pageEntry.sourcePageIndex ?? 0]);
  return copiedPage;
}

function applyPageTransform(page: import("pdf-lib").PDFPage, entry: PdfStudioPage, behavior: PdfResizeBehavior): void {
  const originalWidth = page.getWidth();
  const originalHeight = page.getHeight();
  const targetWidth = entry.widthPt;
  const targetHeight = entry.heightPt;
  const changed = Math.abs(originalWidth - targetWidth) > 0.01 || Math.abs(originalHeight - targetHeight) > 0.01;

  if (changed) {
    page.setSize(targetWidth, targetHeight);
    const scaleX = targetWidth / originalWidth;
    const scaleY = targetHeight / originalHeight;
    if (behavior === "stretch") {
      page.scaleContent(scaleX, scaleY);
    } else if (behavior === "center") {
      page.translateContent((targetWidth - originalWidth) / 2, (targetHeight - originalHeight) / 2);
    } else {
      const scale = behavior === "fill"
        ? Math.max(scaleX, scaleY)
        : behavior === "fit-width"
          ? scaleX
          : behavior === "fit-height"
            ? scaleY
            : Math.min(scaleX, scaleY);
      page.scaleContent(scale, scale);
      page.translateContent((targetWidth - originalWidth * scale) / 2, (targetHeight - originalHeight * scale) / 2);
    }
  }

  if (entry.rotation !== 0) {
    page.setRotation(degrees(entry.rotation));
  }
}

async function drawPageImage(pdfDoc: PDFDocument, page: import("pdf-lib").PDFPage, dataUrl: string, entry: PdfStudioPage): Promise<void> {
  const imageBytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
  const image = dataUrl.startsWith("data:image/png")
    ? await pdfDoc.embedPng(imageBytes)
    : await pdfDoc.embedJpg(imageBytes);
  const fit = image.scaleToFit(entry.widthPt, entry.heightPt);
  page.drawImage(image, {
    x: (entry.widthPt - fit.width) / 2,
    y: (entry.heightPt - fit.height) / 2,
    width: fit.width,
    height: fit.height,
    rotate: degrees(entry.rotation)
  });
}

async function drawOverlayImage(pdfDoc: PDFDocument, page: import("pdf-lib").PDFPage, dataUrl: string, entry: PdfStudioPage): Promise<void> {
  const imageBytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
  const image = await pdfDoc.embedPng(imageBytes);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: entry.widthPt,
    height: entry.heightPt
  });
}

async function renderOverlayObjects(page: PdfStudioPage): Promise<string> {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(page.widthPt * scale));
  canvas.height = Math.max(1, Math.round(page.heightPt * scale));
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("לא ניתן ליצור שכבת overlay.");
  ctx.scale(scale, scale);

  for (const object of page.overlayObjects) {
    ctx.save();
    if (object.type === "text") drawTextObject(ctx, object);
    if (object.type === "rect") drawRectObject(ctx, object);
    if (object.type === "line") drawLineObject(ctx, object);
    if (object.type === "image") await drawImageObject(ctx, object);
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}

function drawTextObject(ctx: CanvasRenderingContext2D, object: Extract<PdfOverlayObject, { type: "text" }>): void {
  ctx.translate(object.x, object.y);
  ctx.rotate(((object.rotation ?? 0) * Math.PI) / 180);
  ctx.fillStyle = object.color;
  ctx.font = `${object.fontSize}px "${object.fontFamily ?? "Arial"}", Arial, sans-serif`;
  ctx.textBaseline = "top";
  wrapText(ctx, object.text, 0, 0, object.width, object.fontSize * 1.25);
}

function drawRectObject(ctx: CanvasRenderingContext2D, object: Extract<PdfOverlayObject, { type: "rect" }>): void {
  ctx.translate(object.x, object.y);
  ctx.rotate(((object.rotation ?? 0) * Math.PI) / 180);
  if (object.fill !== undefined) {
    ctx.fillStyle = object.fill;
    ctx.fillRect(0, 0, object.width, object.height);
  }
  ctx.strokeStyle = object.stroke;
  ctx.lineWidth = object.strokeWidth;
  ctx.strokeRect(0, 0, object.width, object.height);
}

function drawLineObject(ctx: CanvasRenderingContext2D, object: Extract<PdfOverlayObject, { type: "line" }>): void {
  ctx.strokeStyle = object.stroke;
  ctx.lineWidth = object.strokeWidth;
  ctx.beginPath();
  ctx.moveTo(object.x, object.y);
  ctx.lineTo(object.x + object.width, object.y + object.height);
  ctx.stroke();
}

async function drawImageObject(ctx: CanvasRenderingContext2D, object: Extract<PdfOverlayObject, { type: "image" }>): Promise<void> {
  const image = await loadImage(object.dataUrl);
  ctx.translate(object.x, object.y);
  ctx.rotate(((object.rotation ?? 0) * Math.PI) / 180);
  ctx.drawImage(image, 0, 0, object.width, object.height);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;
  for (const word of words) {
    const testLine = line.length > 0 ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.length > 0) ctx.fillText(line, x, currentY);
}

async function applyAdjustmentsToDataUrl(dataUrl: string, adjustments: PdfPageAdjustments): Promise<string> {
  if (!hasAdjustments(adjustments)) return dataUrl;
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return dataUrl;
  ctx.filter = `brightness(${100 + adjustments.brightness}%) contrast(${100 + adjustments.contrast}%) saturate(${100 + adjustments.saturation}%) grayscale(${adjustments.grayscale ? 1 : 0})`;
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function hasAdjustments(adjustments: PdfPageAdjustments): boolean {
  return adjustments.brightness !== 0 || adjustments.contrast !== 0 || adjustments.saturation !== 0 || adjustments.grayscale;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("לא ניתן לטעון תמונה."));
    image.src = src;
  });
}

async function imageBytesToDataUrl(bytes: Uint8Array, mime: string): Promise<string> {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("לא ניתן לקרוא תמונה."));
    reader.readAsDataURL(blob);
  });
}

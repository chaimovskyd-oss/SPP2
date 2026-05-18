import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import type { PdfPageRenderInput, PdfRenderedPage, PdfStudioPage, PdfStudioSourceFile } from "./pdfStudioTypes";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const documentCache = new Map<string, Promise<PDFDocumentProxy>>();
const renderCache = new Map<string, Promise<PdfRenderedPage>>();

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

export async function loadPdfDocument(source: PdfStudioSourceFile): Promise<PDFDocumentProxy> {
  const existing = documentCache.get(source.id);
  if (existing !== undefined) return existing;

  const loadingTask = pdfjsLib.getDocument({
    data: cloneBytes(source.bytes),
    useWorkerFetch: false
  }).promise;
  documentCache.set(source.id, loadingTask);
  return loadingTask;
}

export async function renderPdfPage(input: PdfPageRenderInput): Promise<PdfRenderedPage> {
  if (input.page.sourceType === "image" && input.page.imageDataUrl !== undefined) {
    const size = await readImageSize(input.page.imageDataUrl);
    return {
      dataUrl: input.page.imageDataUrl,
      widthPx: size.width,
      heightPx: size.height
    };
  }

  if (input.page.sourceType === "blank") {
    return renderBlankPage(input.page, input.scale);
  }

  if (input.source === undefined || input.page.sourcePageIndex === undefined) {
    throw new Error("מקור ה-PDF של העמוד לא נמצא.");
  }

  const rotation = input.rotation ?? input.page.rotation;
  const cacheKey = [
    input.source.id,
    input.page.sourcePageIndex,
    Math.round(input.scale * 1000),
    rotation,
    Math.round(input.page.widthPt),
    Math.round(input.page.heightPt)
  ].join(":");

  const existing = renderCache.get(cacheKey);
  if (existing !== undefined) return existing;

  const promise = renderPdfSourcePage(input.source, input.page.sourcePageIndex, input.scale, rotation);
  renderCache.set(cacheKey, promise);
  return promise;
}

export async function renderPdfBytesPage(
  bytes: Uint8Array,
  pageIndex: number,
  scale: number,
  rotation = 0
): Promise<PdfRenderedPage> {
  const loadingTask = pdfjsLib.getDocument({
    data: cloneBytes(bytes),
    useWorkerFetch: false
  });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale, rotation });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("לא ניתן ליצור canvas לתצוגת PDF.");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: context, viewport }).promise;
    return {
      dataUrl: canvas.toDataURL("image/png"),
      widthPx: canvas.width,
      heightPx: canvas.height
    };
  } finally {
    await doc.destroy();
  }
}

async function renderPdfSourcePage(
  source: PdfStudioSourceFile,
  pageIndex: number,
  scale: number,
  rotation: number
): Promise<PdfRenderedPage> {
  const doc = await loadPdfDocument(source);
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("לא ניתן ליצור canvas לתצוגת PDF.");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await page.render({ canvasContext: context, viewport }).promise;
  return {
    dataUrl: canvas.toDataURL("image/png"),
    widthPx: canvas.width,
    heightPx: canvas.height
  };
}

function renderBlankPage(page: PdfStudioPage, scale: number): PdfRenderedPage {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(page.widthPt * scale));
  canvas.height = Math.max(1, Math.round(page.heightPt * scale));
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return {
    dataUrl: canvas.toDataURL("image/png"),
    widthPx: canvas.width,
    heightPx: canvas.height
  };
}

function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error("לא ניתן לקרוא את התמונה."));
    image.src = dataUrl;
  });
}

import type Konva from "konva";
import {
  createDocument,
  createFrameLayer,
  createImageLayer,
  createPage,
  createProjectEnvelope,
  cloneProjectForSaveAs,
  createTextLayer,
  createPortableSppPackage,
  parseProject,
  recordProjectSaved,
  readPortableSppPackage,
  serializeProject,
  createDefaultProjectFilename,
  safeFilename,
  validateProjectEnvelope,
  withProjectMetadata
} from "@/core";
import type { Asset, Document, Page } from "@/types/document";
import type { PageSetup } from "@/types/primitives";
import type { ProjectEnvelope, ProjectMetadataInput } from "@/types/project";
import { measureTextLayerSize } from "@/core/text/measurement";
import { SCREEN_HELPER_NODE_NAME } from "./editor/canvasNodeNames";
import { downloadBytes, downloadDataUrl, downloadTextFile } from "./file";
import { markDebugEvent } from "@/debug/sppDiagnostics";

export interface ProjectSaveOptions {
  filename?: string;
  filePath?: string;
  thumbnailPath?: string;
}

export function createFreeModeDocument(name: string, setup?: PageSetup, projectMetadata: ProjectMetadataInput = {}): Document {
  const page = createPage({
    name: "עמוד 1",
    setup:
      setup ?? {
        size: {
          width: 1240,
          height: 1748
        },
        units: "px",
        dpi: 300,
        orientation: "portrait",
        margins: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        },
        safeArea: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        },
        bleed: {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        }
      }
  });

  return withProjectMetadata({
    ...createDocument({
      name,
      dpi: page.setup.dpi,
      metadata: {
        mode: "free"
      }
    }),
    pages: [page]
  }, { ...projectMetadata, projectType: projectMetadata.projectType ?? "Collage" });
}

export function createStarterTextLayer(pageWidth: number, pageHeight: number) {
  const layer = createTextLayer({
    name: "טקסט חדש",
    text: "טקסט חדש",
    rect: {
      x: pageWidth / 2 - 190,
      y: pageHeight / 2 - 30,
      width: 380,
      height: 72
    },
    zIndex: Date.now()
  });
  const size = measureTextLayerSize(layer);
  return {
    ...layer,
    width: size.width,
    height: size.height,
    x: Math.round(pageWidth / 2 - size.width / 2),
    y: Math.round(pageHeight / 2 - size.height / 2)
  };
}

export function createImageAsset(file: File, dataUrl: string, dimensions?: { width: number; height: number }): Asset {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: file.name,
    kind: "image",
    status: "ready",
    mimeType: file.type || "image/*",
    width: dimensions?.width,
    height: dimensions?.height,
    fileSize: file.size,
    previewPath: dataUrl,
    thumbnailPath: dataUrl,
    originalPath: dataUrl,
    metadata: {
      source: "browser-file",
      originalFileName: file.name
    }
  };
}

/**
 * יוצר ImageLayer חופשי למצב עיצוב חופשי.
 * התמונה עצמה היא האובייקט — גרירה מזיזה את כל התמונה.
 * אין פריים, אין תא, אין הגבלת פריסה.
 */
export function createFreeImageLayer(asset: Asset, pageWidth: number, pageHeight: number) {
  const sourceWidth = asset.width ?? 440;
  const sourceHeight = asset.height ?? 320;
  const maxWidth = Math.min(520, pageWidth * 0.55);
  const maxHeight = Math.min(620, pageHeight * 0.55);
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  const width = Math.max(8, Math.round(sourceWidth * scale));
  const height = Math.max(8, Math.round(sourceHeight * scale));

  return createImageLayer({
    name: asset.name,
    assetId: asset.id,
    rect: {
      x: Math.round(pageWidth / 2 - width / 2),
      y: Math.round(pageHeight / 2 - height / 2),
      width,
      height
    },
    fitMode: "fit",
    zIndex: Date.now()
  });
}

/**
 * יוצר FrameLayer לשימוש בתהליכי עבודה מבוססי פריסה (גריד, מסכה, תמונות מחלקה).
 * לא לשימוש במצב עיצוב חופשי.
 */
export function createImageFrameLayer(asset: Asset, pageWidth: number, pageHeight: number) {
  const sourceWidth = asset.width ?? 440;
  const sourceHeight = asset.height ?? 320;
  const maxWidth = Math.min(520, pageWidth * 0.55);
  const maxHeight = Math.min(620, pageHeight * 0.55);
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  const width = Math.max(24, Math.round(sourceWidth * scale));
  const height = Math.max(24, Math.round(sourceHeight * scale));

  return createFrameLayer({
    name: asset.name,
    rect: {
      x: Math.round(pageWidth / 2 - width / 2),
      y: Math.round(pageHeight / 2 - height / 2),
      width,
      height
    },
    contentType: "image",
    imageAssetId: asset.id,
    fitMode: "fill",
    zIndex: Date.now()
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read file as data URL"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export function readImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not read image dimensions"));
    image.src = dataUrl;
  });
}

export function saveProject(document: Document, options: ProjectSaveOptions = {}): ProjectEnvelope {
  const envelope = createProjectEnvelope({
    document,
    linkedGroups: [],
    batchJobs: []
  });
  const saved = recordProjectSaved(envelope, options.filePath ?? options.filename, options.thumbnailPath);
  downloadTextFile(options.filename ?? createDefaultProjectFilename(saved.metadata, { extension: ".spp2" }), serializeProject(saved), "application/json");
  return saved;
}

export function saveProjectAs(document: Document, options: ProjectSaveOptions = {}): ProjectEnvelope {
  const envelope = cloneProjectForSaveAs(createProjectEnvelope({
    document,
    linkedGroups: [],
    batchJobs: []
  }), options.filePath ?? options.filename);
  const saved = recordProjectSaved(envelope, options.filePath ?? options.filename, options.thumbnailPath);
  downloadTextFile(options.filename ?? createDefaultProjectFilename(saved.metadata, { extension: ".spp2" }), serializeProject(saved), "application/json");
  return saved;
}

export async function savePortableProject(document: Document, options: ProjectSaveOptions = {}): Promise<ProjectEnvelope> {
  const envelope = createProjectEnvelope({
    document,
    linkedGroups: [],
    batchJobs: []
  });
  const saved = recordProjectSaved(envelope, options.filePath ?? options.filename, options.thumbnailPath);
  const bytes = await createPortableSppPackage({
    project: saved,
    metadata: {
      savedAt: new Date().toISOString(),
      portable: true,
      projectMetadata: saved.metadata
    },
    assets: document.assets.map((asset) => ({
      assetId: asset.id,
      original: dataUrlToBytes(asset.originalPath),
      preview: dataUrlToBytes(asset.previewPath),
      thumbnail: dataUrlToBytes(asset.thumbnailPath)
    }))
  });
  downloadBytes(options.filename ?? createDefaultProjectFilename(saved.metadata, { extension: ".spp" }), bytes, "application/octet-stream");
  return saved;
}

export async function loadProject(file: File): Promise<ProjectEnvelope> {
  const envelope = file.name.toLowerCase().endsWith(".spp")
    ? readPortableSppPackage(new Uint8Array(await file.arrayBuffer())).project
    : parseProject(await file.text());
  const validation = validateProjectEnvelope(envelope);
  if (!validation.ok) {
    throw new Error(validation.errors.join(", "));
  }
  return envelope;
}

export function exportStagePng(stage: Konva.Stage, documentName: string, page: Page): void {
  const dataUrl = renderPrintableStage(stage, "image/png", page);
  downloadDataUrl(`${safeFilename(documentName)}.png`, dataUrl);
}

export function exportStageJpg(stage: Konva.Stage, documentName: string, page: Page): void {
  const dataUrl = renderPrintableStage(stage, "image/jpeg", page);
  downloadDataUrl(`${safeFilename(documentName)}.jpg`, dataUrl);
}

export interface PrintableStageImage {
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg";
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  dpi: number;
  orientation: "portrait" | "landscape";
}

/**
 * Render the current Konva stage as a clean print image without helper nodes.
 * Unlike exportStagePng/exportStageJpg, this does not download anything.
 * It returns a data URL that Electron can write to a temp file and pass to
 * the Python Print Preview module.
 */
export function exportStagePrintImage(
  stage: Konva.Stage,
  page: Page,
  mimeType: "image/png" | "image/jpeg" = "image/png"
): PrintableStageImage {
  markDebugEvent("export:print-image-start", { pageId: page.id, width: page.width, height: page.height, mimeType });
  const dataUrl = renderPrintableStage(stage, mimeType, page);
  const dpi = page.setup.dpi || 300;
  markDebugEvent("export:print-image-end", { pageId: page.id, dataUrlLength: dataUrl.length });
  return {
    dataUrl,
    mimeType,
    widthPx: page.width,
    heightPx: page.height,
    widthMm: (page.width / dpi) * 25.4,
    heightMm: (page.height / dpi) * 25.4,
    dpi,
    orientation: page.orientation ?? (page.width >= page.height ? "landscape" : "portrait")
  };
}

/**
 * Render a sequence of pages to PrintableStageImage objects.
 * For each page index, the caller must have already switched the active page
 * and allowed Konva to re-render before calling this function.
 * This function renders the CURRENT stage state for the given page.
 */
export function renderCurrentPageAsPrintImage(
  stage: Konva.Stage,
  page: Page,
  mimeType: "image/png" | "image/jpeg" = "image/png"
): PrintableStageImage {
  return exportStagePrintImage(stage, page, mimeType);
}

/**
 * Build a multi-page PDF from an array of rendered page images.
 * Returns the raw PDF bytes.
 */
export async function buildMultiPagePdf(pages: PrintableStageImage[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();

  for (const page of pages) {
    const imageBytes = await fetch(page.dataUrl).then((r) => r.arrayBuffer());
    const image = page.mimeType === "image/jpeg"
      ? await pdf.embedJpg(imageBytes)
      : await pdf.embedPng(imageBytes);
    const widthPoints = (page.widthPx / page.dpi) * 72;
    const heightPoints = (page.heightPx / page.dpi) * 72;
    const pdfPage = pdf.addPage([widthPoints, heightPoints]);
    pdfPage.drawImage(image, { x: 0, y: 0, width: widthPoints, height: heightPoints });
  }

  return pdf.save();
}

export function downloadRenderedPagesAsImages(
  pages: PrintableStageImage[],
  documentName: string
): void {
  const base = safeFilename(documentName);
  const pad = String(pages.length).length;
  pages.forEach((page, index) => {
    const ext = page.mimeType === "image/jpeg" ? "jpg" : "png";
    const num = String(index + 1).padStart(pad, "0");
    downloadDataUrl(`${base}-page-${num}.${ext}`, page.dataUrl);
  });
}

export async function exportRenderedPagesAsPdf(
  pages: PrintableStageImage[],
  documentName: string
): Promise<void> {
  const bytes = await buildMultiPagePdf(pages);
  downloadBytes(`${safeFilename(documentName)}.pdf`, bytes, "application/pdf");
}

export async function exportStagePdf(stage: Konva.Stage, documentName: string, sourcePage: Page): Promise<void> {
  const { PDFDocument } = await import("pdf-lib");
  const dataUrl = renderPrintableStage(stage, "image/png", sourcePage);
  const imageBytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(imageBytes);
  const widthPoints = (sourcePage.width / sourcePage.setup.dpi) * 72;
  const heightPoints = (sourcePage.height / sourcePage.setup.dpi) * 72;
  const pdfPage = pdf.addPage([widthPoints, heightPoints]);
  pdfPage.drawImage(image, {
    x: 0,
    y: 0,
    width: widthPoints,
    height: heightPoints
  });
  const bytes = await pdf.save();
  downloadBytes(`${safeFilename(documentName)}.pdf`, bytes, "application/pdf");
}

function renderPrintableStage(stage: Konva.Stage, mimeType: "image/png" | "image/jpeg", page: Page): string {
  const helperNodes = stage.find(`.${SCREEN_HELPER_NODE_NAME}`);
  const visibility = helperNodes.map((node) => ({
    node,
    visible: node.visible()
  }));
  const original = {
    width: stage.width(),
    height: stage.height(),
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY()
  };
  // Save and reset every Layer's x/y offset.  The display Stage shifts all
  // Layers by OVERFLOW_PAD/scale so Transformer handles render outside the
  // canvas boundary; during export we need content to start at (0,0).
  const layers = stage.getLayers();
  const layerOffsets = layers.map((l) => ({ layer: l, x: l.x(), y: l.y() }));
  layers.forEach((l) => { l.x(0); l.y(0); });

  helperNodes.forEach((node) => node.visible(false));
  stage.width(page.width);
  stage.height(page.height);
  stage.scale({ x: 1, y: 1 });
  stage.batchDraw();

  try {
    return stage.toDataURL({
      mimeType,
      pixelRatio: 1
    });
  } finally {
    stage.width(original.width);
    stage.height(original.height);
    stage.scale({ x: original.scaleX, y: original.scaleY });
    layerOffsets.forEach(({ layer, x, y }) => { layer.x(x); layer.y(y); });
    visibility.forEach(({ node, visible }) => node.visible(visible));
    stage.batchDraw();
  }
}

export function exportStagePreviewPng(stage: Konva.Stage, documentName: string): void {
  // Crop to the canvas content area, skipping the OVERFLOW_PAD buffer that
  // the display Stage adds on every side for Transformer handle overflow.
  const layers = stage.getLayers();
  const firstLayer = layers[0];
  const offsetX = firstLayer !== undefined ? firstLayer.x() * stage.scaleX() : 0;
  const offsetY = firstLayer !== undefined ? firstLayer.y() * stage.scaleY() : 0;
  const canvasW = stage.width() - 2 * offsetX;
  const canvasH = stage.height() - 2 * offsetY;
  const dataUrl = stage.toDataURL({
    mimeType: "image/png",
    pixelRatio: 2,
    x: offsetX,
    y: offsetY,
    width: Math.max(1, canvasW),
    height: Math.max(1, canvasH)
  });
  downloadDataUrl(`${safeFilename(documentName)}.preview.png`, dataUrl);
}

export function captureProjectThumbnail(stage: Konva.Stage, page: Page): string {
  markDebugEvent("thumbnail:capture-start", { pageId: page.id, width: page.width, height: page.height });
  const original = {
    width: stage.width(),
    height: stage.height(),
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY()
  };
  const layers = stage.getLayers();
  const layerOffsets = layers.map((l) => ({ layer: l, x: l.x(), y: l.y() }));
  layers.forEach((l) => { l.x(0); l.y(0); });

  const maxSide = 320;
  const ratio = Math.min(maxSide / page.width, maxSide / page.height, 1);
  stage.width(page.width);
  stage.height(page.height);
  stage.scale({ x: 1, y: 1 });
  stage.batchDraw();
  try {
    const dataUrl = stage.toDataURL({
      mimeType: "image/png",
      pixelRatio: ratio
    });
    markDebugEvent("thumbnail:capture-end", { pageId: page.id, dataUrlLength: dataUrl.length, ratio });
    return dataUrl;
  } finally {
    stage.width(original.width);
    stage.height(original.height);
    stage.scale({ x: original.scaleX, y: original.scaleY });
    layerOffsets.forEach(({ layer, x, y }) => { layer.x(x); layer.y(y); });
    stage.batchDraw();
  }
}

function dataUrlToBytes(value: string | undefined): Uint8Array | undefined {
  if (value === undefined || !value.startsWith("data:")) {
    return undefined;
  }
  const base64 = value.slice(value.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

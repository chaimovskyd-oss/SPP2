import type Konva from "konva";
import {
  createDocument,
  createFrameLayer,
  createImageLayer,
  createPage,
  createProjectEnvelope,
  createTextLayer,
  createPortableSppPackage,
  parseProject,
  readPortableSppPackage,
  serializeProject,
  createDefaultProjectFilename,
  safeFilename,
  withProjectMetadata
} from "@/core";
import type { Asset, Document, Page } from "@/types/document";
import type { PageSetup } from "@/types/primitives";
import type { ProjectEnvelope, ProjectMetadataInput } from "@/types/project";
import { measureTextLayerSize } from "@/core/text/measurement";
import { SCREEN_HELPER_NODE_NAME } from "./editor/canvasNodeNames";
import { downloadBytes, downloadDataUrl, downloadTextFile } from "./file";

export interface ProjectSaveOptions {
  filename?: string;
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

export function saveProject(document: Document, options: ProjectSaveOptions = {}): void {
  const envelope = createProjectEnvelope({
    document,
    linkedGroups: [],
    batchJobs: []
  });
  downloadTextFile(options.filename ?? createDefaultProjectFilename(envelope.metadata, { extension: ".spp2" }), serializeProject(envelope), "application/json");
}

export async function savePortableProject(document: Document, options: ProjectSaveOptions = {}): Promise<void> {
  const envelope = createProjectEnvelope({
    document,
    linkedGroups: [],
    batchJobs: []
  });
  const bytes = await createPortableSppPackage({
    project: envelope,
    metadata: {
      savedAt: new Date().toISOString(),
      portable: true,
      projectMetadata: envelope.metadata
    },
    assets: document.assets.map((asset) => ({
      assetId: asset.id,
      original: dataUrlToBytes(asset.originalPath),
      preview: dataUrlToBytes(asset.previewPath),
      thumbnail: dataUrlToBytes(asset.thumbnailPath)
    }))
  });
  downloadBytes(options.filename ?? createDefaultProjectFilename(envelope.metadata, { extension: ".spp" }), bytes, "application/octet-stream");
}

export async function loadProject(file: File): Promise<ProjectEnvelope> {
  if (file.name.toLowerCase().endsWith(".spp")) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return readPortableSppPackage(bytes).project;
  }
  const text = await file.text();
  return parseProject(text);
}

export function exportStagePng(stage: Konva.Stage, documentName: string, page: Page): void {
  const dataUrl = renderPrintableStage(stage, "image/png", page);
  downloadDataUrl(`${safeFilename(documentName)}.png`, dataUrl);
}

export function exportStageJpg(stage: Konva.Stage, documentName: string, page: Page): void {
  const dataUrl = renderPrintableStage(stage, "image/jpeg", page);
  downloadDataUrl(`${safeFilename(documentName)}.jpg`, dataUrl);
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
    visibility.forEach(({ node, visible }) => node.visible(visible));
    stage.batchDraw();
  }
}

export function exportStagePreviewPng(stage: Konva.Stage, documentName: string): void {
  const dataUrl = stage.toDataURL({
    mimeType: "image/png",
    pixelRatio: 2
  });
  downloadDataUrl(`${safeFilename(documentName)}.preview.png`, dataUrl);
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

import type Konva from "konva";
import {
  createDocument,
  createFrameLayer,
  createPage,
  createProjectEnvelope,
  createTextLayer,
  parseProject,
  serializeProject
} from "@/core";
import type { Asset, Document, Page } from "@/types/document";
import type { ProjectEnvelope } from "@/types/project";
import { measureTextLayerSize } from "@/core/text/measurement";
import { SCREEN_HELPER_NODE_NAME } from "./editor/canvasNodeNames";
import { downloadBytes, downloadDataUrl, downloadTextFile } from "./file";

export function createFreeModeDocument(name: string): Document {
  const page = createPage({
    name: "עמוד 1",
    setup: {
      size: {
        width: 1240,
        height: 1748
      },
      margins: {
        top: 80,
        right: 80,
        bottom: 80,
        left: 80
      },
      bleed: {
        top: 24,
        right: 24,
        bottom: 24,
        left: 24
      }
    }
  });

  return {
    ...createDocument({
      name,
      metadata: {
        mode: "free"
      }
    }),
    pages: [page]
  };
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
    mimeType: file.type || "image/*",
    width: dimensions?.width,
    height: dimensions?.height,
    previewPath: dataUrl,
    originalPath: file.name,
    metadata: {
      source: "browser-file"
    }
  };
}

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
    fitMode: "fit",
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

export function saveProject(document: Document): void {
  const envelope = createProjectEnvelope({
    document,
    linkedGroups: [],
    batchJobs: []
  });
  downloadTextFile(`${safeFilename(document.name)}.spp.json`, serializeProject(envelope), "application/json");
}

export async function loadProject(file: File): Promise<ProjectEnvelope> {
  const text = await file.text();
  return parseProject(text);
}

export function exportStagePng(stage: Konva.Stage, documentName: string, page: Page): void {
  const dataUrl = renderPrintableStage(stage, "image/png", page);
  downloadDataUrl(`${safeFilename(documentName)}.png`, dataUrl);
}

export async function exportStagePdf(stage: Konva.Stage, documentName: string, sourcePage: Page): Promise<void> {
  const { PDFDocument } = await import("pdf-lib");
  const dataUrl = renderPrintableStage(stage, "image/png", sourcePage);
  const imageBytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(imageBytes);
  const pdfPage = pdf.addPage([image.width, image.height]);
  pdfPage.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height
  });
  const bytes = await pdf.save();
  downloadBytes(`${safeFilename(documentName)}.pdf`, bytes, "application/pdf");
}

function renderPrintableStage(stage: Konva.Stage, mimeType: "image/png", page: Page): string {
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

function safeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "spp-project";
}

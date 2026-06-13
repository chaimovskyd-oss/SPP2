import { createImageLayer, createPage } from "@/core";
import { createImageAssetFromDataUrl } from "@/core/assets/assetManager";
import type { Asset, Document, Page } from "@/types/document";
import type { ImageLayer } from "@/types/layers";
import type { PageSetup } from "@/types/primitives";
import type { PdfImageRenderResult } from "./pdfRenderService";

/** Where the rendered PDF pages land in the project. */
export type PdfImportMode = "currentCanvas" | "separatePages";

/** Render DPI for V1 (no quality selector). */
export const PDF_IMPORT_DPI = 300;

/** A PDF page rendered and ready to be embedded as an SPP asset/layer. */
export interface PdfImportRenderedPage extends PdfImageRenderResult {
  /** 1-based PDF page number (for naming + metadata). */
  pageNumber: number;
}

const LAST_MODE_KEY = "spp-pdf-import-mode";

export function loadLastPdfImportMode(): PdfImportMode {
  try {
    const value = localStorage.getItem(LAST_MODE_KEY);
    return value === "separatePages" ? "separatePages" : "currentCanvas";
  } catch {
    return "currentCanvas";
  }
}

export function saveLastPdfImportMode(mode: PdfImportMode): void {
  try {
    localStorage.setItem(LAST_MODE_KEY, mode);
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

/** Suggested layer/asset name per the spec: `PDF: file.pdf - page N`. */
function pdfLayerName(fileName: string, pageNumber: number): string {
  return `PDF: ${fileName} - page ${pageNumber}`;
}

/**
 * Build an embedded image Asset from a rendered PDF page. Reuses
 * createImageAssetFromDataUrl, then stamps the correct mime type and the
 * PDF-source metadata the spec asks for.
 */
export function buildPdfImageAsset(rendered: PdfImportRenderedPage, fileName: string): Asset {
  const name = pdfLayerName(fileName, rendered.pageNumber);
  const base = createImageAssetFromDataUrl(rendered.dataUrl, rendered.widthPx, rendered.heightPx, name);
  return {
    ...base,
    mimeType: rendered.mimeType,
    metadata: {
      sourceType: "pdf",
      sourceFileName: fileName,
      sourcePageNumber: rendered.pageNumber,
      renderDpi: PDF_IMPORT_DPI,
      originalPdfWidthPt: rendered.widthPt,
      originalPdfHeightPt: rendered.heightPt
    }
  };
}

/**
 * Create an ImageLayer that fits the rendered page inside the canvas while
 * preserving aspect ratio, centered. Unlike createFreeImageLayer (which caps at
 * ~55% of the page) this fills the page up to a small margin so an imported PDF
 * page reads at its intended size.
 */
export function buildFitCenteredImageLayer(
  asset: Asset,
  pageWidth: number,
  pageHeight: number,
  zIndex: number
): ImageLayer {
  const sourceWidth = asset.width ?? pageWidth;
  const sourceHeight = asset.height ?? pageHeight;
  const margin = 0.96;
  const scale = Math.min((pageWidth * margin) / sourceWidth, (pageHeight * margin) / sourceHeight, 1);
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
    zIndex
  });
}

export interface CanvasImportBuild {
  assets: Asset[];
  layers: ImageLayer[];
}

/**
 * Mode A — build assets + fit/centered layers for the current canvas. Layers are
 * z-ordered so the first selected PDF page sits lowest and the last highest.
 */
export function buildCanvasImports(
  pages: PdfImportRenderedPage[],
  fileName: string,
  pageWidth: number,
  pageHeight: number,
  baseZIndex: number
): CanvasImportBuild {
  const assets: Asset[] = [];
  const layers: ImageLayer[] = [];
  pages.forEach((rendered, index) => {
    const asset = buildPdfImageAsset(rendered, fileName);
    assets.push(asset);
    layers.push(buildFitCenteredImageLayer(asset, pageWidth, pageHeight, baseZIndex + index));
  });
  return { assets, layers };
}

export interface SeparatePagesBuild {
  assets: Asset[];
  pages: Page[];
}

/**
 * Mode B — build assets + one SPP Page per rendered PDF page. Each new page uses
 * the current canvas page setup (size), with the rendered page fit & centered.
 */
export function buildSeparatePageImports(
  pages: PdfImportRenderedPage[],
  fileName: string,
  baseSetup: PageSetup,
  pageWidth: number,
  pageHeight: number
): SeparatePagesBuild {
  const assets: Asset[] = [];
  const builtPages: Page[] = [];
  pages.forEach((rendered) => {
    const asset = buildPdfImageAsset(rendered, fileName);
    const layer = buildFitCenteredImageLayer(asset, pageWidth, pageHeight, Date.now());
    assets.push(asset);
    builtPages.push(
      createPage({
        name: `PDF page ${rendered.pageNumber}`,
        setup: baseSetup,
        layers: [layer]
      })
    );
  });
  return { assets, pages: builtPages };
}

/** Document updater for Mode A — appends assets + layers to the active page. */
export function applyImportToCurrentCanvas(
  doc: Document,
  pageId: string,
  build: CanvasImportBuild
): Document {
  return {
    ...doc,
    modifiedAt: new Date().toISOString(),
    assets: [...doc.assets, ...build.assets],
    pages: doc.pages.map((page) =>
      page.id === pageId ? { ...page, layers: [...page.layers, ...build.layers] } : page
    )
  };
}

/** Document updater for Mode B — appends assets + new pages to the document. */
export function applyImportAsSeparatePages(doc: Document, build: SeparatePagesBuild): Document {
  return {
    ...doc,
    modifiedAt: new Date().toISOString(),
    assets: [...doc.assets, ...build.assets],
    pages: [...doc.pages, ...build.pages]
  };
}

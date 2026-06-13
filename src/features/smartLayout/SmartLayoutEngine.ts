import { createDocument, createPage } from "@/core/document/factory";
import { createImageLayer, createShapeLayer } from "@/core/layers/factory";
import { mmToPx } from "@/core/units/conversion";
import type { Asset, Document, Page } from "@/types/document";
import type { ImageLayer, ShapeLayer, VisualLayer } from "@/types/layers";
import type { PageSetup } from "@/types/primitives";
import { buildCutLinePath, buildItemRectsPath } from "./cutLines";
import { captureDesignUnit, emitUnitInstance, type DesignUnit } from "./designUnit";
import { buildGridCells, computeUsableArea } from "./pageGeometry";
import { solvePhotoPack } from "./photoPackingSolver";
import { solveRepeat } from "./repeatGridSolver";
import type {
  LayoutPageResult,
  PackImageInput,
  PhotoPackOptions,
  PlacedItem,
  RepeatOptions,
  RepeatPlan,
  SmartLayoutResult
} from "./types";

/**
 * Pure geometry pass for Smart Repeat. Used by BOTH the live preview and the
 * commit, so what the user previews is exactly what gets created.
 */
export function buildRepeatResult(
  unit: DesignUnit,
  opts: RepeatOptions,
  pageWidthPx: number,
  pageHeightPx: number
): { result: SmartLayoutResult; plan: RepeatPlan } {
  const plan = solveRepeat(unit, opts, pageWidthPx, pageHeightPx);
  const usable = computeUsableArea(pageWidthPx, pageHeightPx, opts.marginsMm, opts.dpi);
  const gapPx = Math.max(0, mmToPx(Math.max(0, opts.gapMm), opts.dpi));

  const pages: LayoutPageResult[] = [];
  if (plan.perPage > 0) {
    for (let pageIndex = 0; pageIndex < plan.totalPages; pageIndex += 1) {
      const isLast = pageIndex === plan.totalPages - 1;
      const count = isLast ? plan.lastPageCount : plan.perPage;
      const cells = buildGridCells(usable, plan.cols, plan.rows, plan.cellWPx, plan.cellHPx, gapPx, count);
      pages.push({
        items: cells.map((cell) => ({
          xPx: cell.x,
          yPx: cell.y,
          widthPx: cell.width,
          heightPx: cell.height,
          rotated: plan.rotated,
          sourceRef: unit.id
        })),
        cols: plan.cols,
        rows: plan.rows,
        isPartial: isLast && count < plan.perPage
      });
    }
  }

  const result: SmartLayoutResult = {
    kind: "repeat",
    pages,
    pageWidthPx,
    pageHeightPx,
    usablePx: usable,
    cutLineStyle: opts.cutLines,
    warnings: plan.warnings
  };
  return { result, plan };
}

export interface ApplyRepeatParams {
  pageId: string;
  selectedLayerIds: string[];
  options: RepeatOptions;
}

/**
 * Apply Smart Repeat to a document and return the new document. Designed to run
 * inside a single `applyDocumentChange` updater so the whole operation (remove
 * originals + add N pages + emit all copies + cut overlays) is ONE undo step.
 *
 * Returns the document unchanged if the selection can't form a unit or the plan
 * yields nothing.
 */
export function applyRepeatToDocument(document: Document, params: ApplyRepeatParams): Document {
  const basePage = document.pages.find((page) => page.id === params.pageId);
  if (basePage === undefined) return document;

  const unit = captureDesignUnit(basePage, params.selectedLayerIds);
  if (unit === null) return document;

  const { result, plan } = buildRepeatResult(unit, params.options, basePage.width, basePage.height);
  if (result.pages.length === 0) return document;

  const childrenPerUnit = Math.max(1, unit.layers.length);
  const sourceIds = new Set(params.selectedLayerIds);
  const newPages: Page[] = [];

  result.pages.forEach((pageResult, pageIndex) => {
    const target =
      pageIndex === 0
        ? basePage
        : createPage({ name: `דף ${document.pages.length + pageIndex + 1}`, setup: basePage.setup });

    // Base layers: page 0 keeps existing (optionally minus originals); later
    // pages start empty.
    const keptLayers =
      pageIndex === 0
        ? params.options.replaceOriginal
          ? target.layers.filter((layer) => !sourceIds.has(layer.id))
          : [...target.layers]
        : [];

    const maxZ = keptLayers.reduce((acc, layer) => Math.max(acc, layer.zIndex), 0);
    const instanceLayers: VisualLayer[] = [];
    pageResult.items.forEach((item, instanceIndex) => {
      const zBase = maxZ + 1 + instanceIndex * childrenPerUnit;
      const cell = { x: item.xPx, y: item.yPx, width: item.widthPx, height: item.heightPx };
      instanceLayers.push(...emitUnitInstance(unit, cell, item.rotated, zBase, instanceIndex));
    });

    const layers: VisualLayer[] = [...keptLayers, ...instanceLayers];
    const overlay = buildCutOverlay(pageResult, result, plan, params.options, target.id);
    if (overlay !== null) {
      overlay.zIndex = layers.reduce((acc, layer) => Math.max(acc, layer.zIndex), 0) + 1;
      layers.push(overlay);
    }

    newPages.push({ ...target, layers });
  });

  // Splice: replace base page in place, append the rest right after it.
  const pages: Page[] = [];
  for (const page of document.pages) {
    if (page.id === basePage.id) {
      pages.push(...newPages);
    } else {
      pages.push(page);
    }
  }

  return { ...document, pages };
}

function buildCutOverlay(
  pageResult: LayoutPageResult,
  result: SmartLayoutResult,
  plan: RepeatPlan,
  options: RepeatOptions,
  pageId: string
): ShapeLayer | null {
  if (options.cutLines !== "hairlineGrid") return null;
  const gapPx = Math.max(0, mmToPx(Math.max(0, options.gapMm), options.dpi));
  const pathData = buildCutLinePath(pageResult, result.usablePx, options.cutLines, plan.cellWPx, plan.cellHPx, gapPx);
  if (pathData === "") return null;

  const overlay = createShapeLayer({
    name: "קווי חיתוך",
    rect: { x: 0, y: 0, width: result.pageWidthPx, height: result.pageHeightPx },
    shape: "svgPath",
    locked: true,
    metadata: { smartLayoutCutLines: true, smartLayoutPageId: pageId }
  });
  overlay.pathData = pathData;
  overlay.stroke = { version: 1, color: "#000000", width: 1, opacity: 1, position: "center" };
  overlay.fill = undefined;
  return overlay;
}

// ─── Smart Photo Packing (V2) ───────────────────────────────────────────────

/** Pure packing pass — used by both wizard preview and document creation. */
export function buildPhotoPackResult(
  images: PackImageInput[],
  opts: PhotoPackOptions,
  pageWidthPx: number,
  pageHeightPx: number
): SmartLayoutResult {
  return solvePhotoPack(images, opts, pageWidthPx, pageHeightPx);
}

/** Derive a packing input (id + intrinsic aspect) from an asset. */
export function assetToPackInput(asset: Asset): PackImageInput {
  const w = typeof asset.width === "number" && asset.width > 0 ? asset.width : 1;
  const h = typeof asset.height === "number" && asset.height > 0 ? asset.height : 1;
  return { id: asset.id, aspect: w / h };
}

/**
 * Build a brand-new document from a set of images packed across pages. The
 * given assets are attached to the document; every page holds plain, editable
 * image layers (no cropping) plus an optional cut-line overlay.
 */
export function createSmartPhotoPackDocument(
  name: string,
  setup: PageSetup,
  assets: Asset[],
  opts: PhotoPackOptions
): { document: Document; result: SmartLayoutResult } {
  const pageWidthPx = setup.size.width;
  const pageHeightPx = setup.size.height;
  const inputs = assets.map(assetToPackInput);
  const result = buildPhotoPackResult(inputs, opts, pageWidthPx, pageHeightPx);

  const pages: Page[] = result.pages.map((pageResult, pageIndex) => {
    const page = createPage({ name: `עמוד ${pageIndex + 1}`, setup });
    const layers: VisualLayer[] = pageResult.items.map((item, i) => mapPackItemToLayer(item, i));
    if (opts.cutLines === "hairlineGrid" && pageResult.items.length > 0) {
      const overlay = createShapeLayer({
        name: "קווי חיתוך",
        rect: { x: 0, y: 0, width: pageWidthPx, height: pageHeightPx },
        shape: "svgPath",
        locked: true,
        metadata: { smartLayoutCutLines: true }
      });
      overlay.pathData = buildItemRectsPath(pageResult.items);
      overlay.stroke = { version: 1, color: "#000000", width: 1, opacity: 1, position: "center" };
      overlay.fill = undefined;
      overlay.zIndex = layers.length;
      layers.push(overlay);
    }
    return { ...page, layers };
  });

  const document: Document = {
    ...createDocument({ name, dpi: setup.dpi, pages }),
    assets
  };
  return { document, result };
}

/**
 * Map a packed item to a plain image layer. Rotated items become a 90°-rotated
 * layer positioned so the rotated image exactly covers the placed bounding box
 * (same rigid-rotation convention as the design-unit emitter).
 */
function mapPackItemToLayer(item: PlacedItem, zIndex: number): ImageLayer {
  if (!item.rotated) {
    return createImageLayer({
      rect: { x: item.xPx, y: item.yPx, width: item.widthPx, height: item.heightPx },
      assetId: item.sourceRef,
      fitMode: "fit",
      zIndex
    });
  }
  // Rotated 90° clockwise about the layer's top-left: a layer of
  // (width=heightPx, height=widthPx) at (xPx+widthPx, yPx) covers the bbox.
  const layer = createImageLayer({
    rect: { x: item.xPx + item.widthPx, y: item.yPx, width: item.heightPx, height: item.widthPx },
    assetId: item.sourceRef,
    fitMode: "fit",
    zIndex
  });
  layer.rotation = 90;
  return layer;
}

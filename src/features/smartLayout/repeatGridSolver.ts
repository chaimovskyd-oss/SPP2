import { computeBestGridForCount } from "@/core/photoPrint/photoPrintModeEngine";
import { mmToPx, pxToMm } from "@/core/units/conversion";
import { computeUsableArea, countAlongAxis } from "./pageGeometry";
import { unitSupportsRotation, type DesignUnit } from "./designUnit";
import type { RepeatOptions, RepeatPlan } from "./types";

/**
 * Smart Repeat grid solver. Given a captured design unit and the user's
 * options, resolves a grid (cols/rows/cell size), pagination and rotation.
 *
 * Three calc modes:
 *  - copiesPerPage: best arrangement for N copies on one page
 *    (reuses photo-print `computeBestGridForCount`).
 *  - unitSizeMm: fixed cell size → how many fit on one page.
 *  - totalCopies: fixed cell size (defaults to the unit's natural size) →
 *    paginate across the needed number of pages, partial last page.
 */
export function solveRepeat(
  unit: DesignUnit,
  opts: RepeatOptions,
  pageWidthPx: number,
  pageHeightPx: number
): RepeatPlan {
  const usable = computeUsableArea(pageWidthPx, pageHeightPx, opts.marginsMm, opts.dpi);
  const gapPx = Math.max(0, mmToPx(Math.max(0, opts.gapMm), opts.dpi));
  const canRotate = opts.allowRotate && unitSupportsRotation(unit);
  const warnings: string[] = [];

  if (usable.width <= 0 || usable.height <= 0) {
    warnings.push("השוליים גדולים מדי לדף.");
    return emptyPlan(warnings);
  }

  if (opts.calcMode === "copiesPerPage") {
    const count = Math.max(1, Math.floor(opts.copiesPerPage ?? 1));
    const { rows, cols } = computeBestGridForCount(usable.width, usable.height, gapPx, count, "auto");
    const cellWPx = (usable.width - (cols - 1) * gapPx) / cols;
    const cellHPx = (usable.height - (rows - 1) * gapPx) / rows;
    if (cellWPx <= 0 || cellHPx <= 0) {
      warnings.push("לא ניתן לסדר כמות כזו בדף עם השוליים והמרווח הנוכחיים.");
      return emptyPlan(warnings);
    }
    const perPage = rows * cols;
    return {
      cols,
      rows,
      cellWPx,
      cellHPx,
      rotated: false,
      perPage,
      totalPages: 1,
      lastPageCount: Math.min(count, perPage),
      warnings
    };
  }

  // unitSizeMm + totalCopies: both lay a fixed-size cell. Default the size to
  // the unit's own natural footprint when the user didn't specify one.
  const defWmm = pxToMm(unit.bboxPx.width, opts.dpi);
  const defHmm = pxToMm(unit.bboxPx.height, opts.dpi);
  const wMm = opts.unitWidthMm && opts.unitWidthMm > 0 ? opts.unitWidthMm : defWmm;
  const hMm = opts.unitHeightMm && opts.unitHeightMm > 0 ? opts.unitHeightMm : defHmm;
  const cellW = mmToPx(wMm, opts.dpi);
  const cellH = mmToPx(hMm, opts.dpi);

  const normal = gridForCell(usable, cellW, cellH, gapPx);
  let best = { ...normal, rotated: false, cellWPx: cellW, cellHPx: cellH };
  if (canRotate) {
    const swapped = gridForCell(usable, cellH, cellW, gapPx);
    if (swapped.cols * swapped.rows > best.cols * best.rows) {
      best = { ...swapped, rotated: true, cellWPx: cellH, cellHPx: cellW };
    }
  }

  const perPage = best.cols * best.rows;
  if (perPage <= 0) {
    warnings.push("היחידה גדולה מהשטח השמיש של הדף.");
    return emptyPlan(warnings);
  }

  if (opts.calcMode === "unitSizeMm") {
    return {
      cols: best.cols,
      rows: best.rows,
      cellWPx: best.cellWPx,
      cellHPx: best.cellHPx,
      rotated: best.rotated,
      perPage,
      totalPages: 1,
      lastPageCount: perPage,
      warnings
    };
  }

  // totalCopies → paginate, partial last page.
  const total = Math.max(1, Math.floor(opts.totalCopies ?? perPage));
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const lastPageCount = total - (totalPages - 1) * perPage;
  return {
    cols: best.cols,
    rows: best.rows,
    cellWPx: best.cellWPx,
    cellHPx: best.cellHPx,
    rotated: best.rotated,
    perPage,
    totalPages,
    lastPageCount,
    warnings
  };
}

function gridForCell(
  usable: { width: number; height: number },
  cellW: number,
  cellH: number,
  gapPx: number
): { cols: number; rows: number } {
  return {
    cols: countAlongAxis(usable.width, cellW, gapPx),
    rows: countAlongAxis(usable.height, cellH, gapPx)
  };
}

function emptyPlan(warnings: string[]): RepeatPlan {
  return {
    cols: 0,
    rows: 0,
    cellWPx: 0,
    cellHPx: 0,
    rotated: false,
    perPage: 0,
    totalPages: 0,
    lastPageCount: 0,
    warnings
  };
}

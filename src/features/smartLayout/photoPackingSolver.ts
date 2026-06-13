import { computeBestGridForCount } from "@/core/photoPrint/photoPrintModeEngine";
import { mmToPx } from "@/core/units/conversion";
import type { Rect } from "@/types/primitives";
import { computeUsableArea } from "./pageGeometry";
import { scorePackedPage } from "./layoutScoring";
import type { LayoutPageResult, PackImageInput, PhotoPackOptions, PlacedItem, SmartLayoutResult } from "./types";

/**
 * Smart Photo Packing solver (V2). Packs mixed-aspect images onto pages WITHOUT
 * cropping (every cell is sized to the image's intrinsic aspect). For each page
 * group it generates several candidate layouts (justified rows, justified
 * columns, grid-contain), scores them, and keeps the best.
 */
export function solvePhotoPack(
  images: PackImageInput[],
  opts: PhotoPackOptions,
  pageWidthPx: number,
  pageHeightPx: number
): SmartLayoutResult {
  const usable = computeUsableArea(pageWidthPx, pageHeightPx, opts.marginsMm, opts.dpi);
  const gapPx = Math.max(0, mmToPx(Math.max(0, opts.gapMm), opts.dpi));
  const warnings: string[] = [];

  const perPage = Math.max(1, Math.floor(opts.photosPerPage));
  const pages: LayoutPageResult[] = [];
  let scoreSum = 0;

  if (usable.width <= 0 || usable.height <= 0) {
    return { kind: "photoPack", pages: [], pageWidthPx, pageHeightPx, usablePx: usable, cutLineStyle: opts.cutLines, warnings: ["השוליים גדולים מדי לדף."] };
  }

  for (let start = 0; start < images.length; start += perPage) {
    const chunk = images.slice(start, start + perPage);
    const { items, score } = bestCandidate(chunk, usable, gapPx, opts);
    scoreSum += score;
    pages.push({
      items,
      isPartial: chunk.length < perPage
    });
  }

  // Aggregate min/max warnings once.
  const minPx = opts.minSizeMm > 0 ? mmToPx(opts.minSizeMm, opts.dpi) : 0;
  const maxPx = opts.maxSizeMm > 0 ? mmToPx(opts.maxSizeMm, opts.dpi) : Infinity;
  const allItems = pages.flatMap((p) => p.items);
  if (minPx > 0 && allItems.some((it) => Math.min(it.widthPx, it.heightPx) < minPx - 0.5)) {
    warnings.push("חלק מהתמונות קטנות מהגודל המינימלי שנקבע — נסה פחות תמונות בעמוד.");
  }
  if (maxPx < Infinity && allItems.some((it) => Math.max(it.widthPx, it.heightPx) > maxPx + 0.5)) {
    warnings.push("חלק מהתמונות גדולות מהגודל המקסימלי שנקבע — נסה יותר תמונות בעמוד או שוליים גדולים יותר.");
  }

  return {
    kind: "photoPack",
    pages,
    pageWidthPx,
    pageHeightPx,
    usablePx: usable,
    cutLineStyle: opts.cutLines,
    warnings,
    score: pages.length > 0 ? scoreSum / pages.length : 0
  };
}

function bestCandidate(
  chunk: PackImageInput[],
  usable: Rect,
  gapPx: number,
  opts: PhotoPackOptions
): { items: PlacedItem[]; score: number } {
  const candidates: PlacedItem[][] = [];
  const maxLines = Math.min(chunk.length, 12);
  for (let rows = 1; rows <= maxLines; rows += 1) {
    const c = justifiedRows(chunk, usable, gapPx, rows);
    if (c !== null) candidates.push(c);
  }
  for (let cols = 1; cols <= maxLines; cols += 1) {
    const c = justifiedColumns(chunk, usable, gapPx, cols);
    if (c !== null) candidates.push(c);
  }
  const grid = gridContain(chunk, usable, gapPx, opts.allowRotate);
  if (grid !== null) candidates.push(grid);

  let best: PlacedItem[] = candidates[0] ?? [];
  let bestScore = -Infinity;
  for (const cand of candidates) {
    const score = scorePackedPage(cand, usable, opts);
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return { items: best, score: bestScore };
}

/** Split `n` items into `rows` contiguous groups with balanced counts. */
function distribute(n: number, rows: number): number[] {
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Justified rows: each row's height is chosen so its images (at preserved
 * aspect) exactly fill the usable width. If the stacked rows overflow the page
 * height, the whole block is scaled down uniformly (leaving side whitespace).
 * The block is centred both axes.
 */
function justifiedRows(images: PackImageInput[], usable: Rect, gapPx: number, rows: number): PlacedItem[] | null {
  if (rows < 1 || rows > images.length) return null;
  const counts = distribute(images.length, rows);
  let idx = 0;
  const rowData = counts.map((count) => {
    const group = images.slice(idx, idx + count);
    idx += count;
    const aspectSum = group.reduce((s, im) => s + im.aspect, 0);
    const availW = usable.width - (count - 1) * gapPx;
    const h = availW / aspectSum;
    return { group, h };
  });
  // Gaps are fixed (not scaled), so reserve them before scaling the cells.
  const sumH = rowData.reduce((s, r) => s + r.h, 0);
  const gapsH = (rows - 1) * gapPx;
  const contentAvail = usable.height - gapsH;
  const scale = sumH > contentAvail ? contentAvail / sumH : 1;
  const blockH = sumH * scale + gapsH;
  let y = usable.y + (usable.height - blockH) / 2;

  const items: PlacedItem[] = [];
  for (const r of rowData) {
    const h = r.h * scale;
    const rowW = r.group.reduce((s, im) => s + im.aspect * h, 0) + (r.group.length - 1) * gapPx;
    let x = usable.x + (usable.width - rowW) / 2;
    for (const im of r.group) {
      const w = im.aspect * h;
      items.push({ xPx: x, yPx: y, widthPx: w, heightPx: h, rotated: false, sourceRef: im.id, aspect: im.aspect });
      x += w + gapPx;
    }
    y += h + gapPx;
  }
  return items;
}

/** Justified columns: transpose of justified rows. Good for portrait-heavy sets. */
function justifiedColumns(images: PackImageInput[], usable: Rect, gapPx: number, cols: number): PlacedItem[] | null {
  if (cols < 1 || cols > images.length) return null;
  const counts = distribute(images.length, cols);
  let idx = 0;
  const colData = counts.map((count) => {
    const group = images.slice(idx, idx + count);
    idx += count;
    const invAspectSum = group.reduce((s, im) => s + 1 / im.aspect, 0);
    const availH = usable.height - (count - 1) * gapPx;
    const w = availH / invAspectSum;
    return { group, w };
  });
  // Gaps are fixed (not scaled), so reserve them before scaling the columns.
  const sumW = colData.reduce((s, c) => s + c.w, 0);
  const gapsW = (cols - 1) * gapPx;
  const contentAvail = usable.width - gapsW;
  const scale = sumW > contentAvail ? contentAvail / sumW : 1;
  const blockW = sumW * scale + gapsW;
  let x = usable.x + (usable.width - blockW) / 2;

  const items: PlacedItem[] = [];
  for (const c of colData) {
    const w = c.w * scale;
    const colH = c.group.reduce((s, im) => s + w / im.aspect, 0) + (c.group.length - 1) * gapPx;
    let y = usable.y + (usable.height - colH) / 2;
    for (const im of c.group) {
      const h = w / im.aspect;
      items.push({ xPx: x, yPx: y, widthPx: w, heightPx: h, rotated: false, sourceRef: im.id, aspect: im.aspect });
      y += h + gapPx;
    }
    x += w + gapPx;
  }
  return items;
}

/**
 * Equal-cell grid with aspect-preserving contain (letterboxed, centred per
 * cell). When `allowRotate`, an image may be turned 90° to better match its
 * cell's orientation, reducing letterbox.
 */
function gridContain(images: PackImageInput[], usable: Rect, gapPx: number, allowRotate: boolean): PlacedItem[] | null {
  if (images.length === 0) return null;
  const { rows, cols } = computeBestGridForCount(usable.width, usable.height, gapPx, images.length, "auto");
  const cellW = (usable.width - (cols - 1) * gapPx) / cols;
  const cellH = (usable.height - (rows - 1) * gapPx) / rows;
  if (cellW <= 0 || cellH <= 0) return null;

  const items: PlacedItem[] = [];
  images.forEach((im, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cellX = usable.x + c * (cellW + gapPx);
    const cellY = usable.y + r * (cellH + gapPx);
    let a = im.aspect;
    let rotated = false;
    if (allowRotate && a >= 1 !== cellW >= cellH) {
      a = 1 / a;
      rotated = true;
    }
    let w: number;
    let h: number;
    if (a > cellW / cellH) {
      w = cellW;
      h = cellW / a;
    } else {
      h = cellH;
      w = cellH * a;
    }
    items.push({
      xPx: cellX + (cellW - w) / 2,
      yPx: cellY + (cellH - h) / 2,
      widthPx: w,
      heightPx: h,
      rotated,
      sourceRef: im.id,
      aspect: im.aspect
    });
  });
  return items;
}

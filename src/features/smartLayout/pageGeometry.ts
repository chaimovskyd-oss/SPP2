import { mmToPx } from "@/core/units/conversion";
import type { Rect } from "@/types/primitives";

/**
 * Page geometry helpers for Smart Sheet Layout. Pure functions over page
 * dimensions in px + options in mm.
 */

/** The printable rectangle inside the symmetric outer margin (page px). */
export function computeUsableArea(pageWidthPx: number, pageHeightPx: number, marginsMm: number, dpi: number): Rect {
  const marginPx = Math.max(0, mmToPx(Math.max(0, marginsMm), dpi));
  const width = Math.max(0, pageWidthPx - 2 * marginPx);
  const height = Math.max(0, pageHeightPx - 2 * marginPx);
  return { x: marginPx, y: marginPx, width, height };
}

/**
 * Row-major cell rects for a `cols × rows` grid inside `usable`, with `gapPx`
 * between cells. Optionally truncated to `limit` items (partial last page).
 */
export function buildGridCells(
  usable: Rect,
  cols: number,
  rows: number,
  cellWPx: number,
  cellHPx: number,
  gapPx: number,
  limit?: number
): Rect[] {
  const cells: Rect[] = [];
  const max = limit ?? cols * rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (cells.length >= max) return cells;
      cells.push({
        x: usable.x + col * (cellWPx + gapPx),
        y: usable.y + row * (cellHPx + gapPx),
        width: cellWPx,
        height: cellHPx
      });
    }
  }
  return cells;
}

/** Largest count of `size`-wide cells that fit across `available` with `gap`. */
export function countAlongAxis(available: number, size: number, gap: number): number {
  if (size <= 0) return 0;
  return Math.max(0, Math.floor((available + gap) / (size + gap)));
}

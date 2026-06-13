import type { Rect } from "@/types/primitives";
import type { CutLineStyle, LayoutPageResult } from "./types";

/**
 * Build an SVG path for the cut-line overlay of one page.
 *
 * Critically, each interior boundary is drawn EXACTLY ONCE — shared by both
 * adjacent cells — so touching copies never get doubled/thick internal lines
 * (the weakness of per-frame strokes). The whole grid + outer frame becomes a
 * single editable overlay shape.
 *
 * Coordinates are page px. Returns "" when there is nothing to draw.
 */
export function buildCutLinePath(
  page: LayoutPageResult,
  usable: Rect,
  style: CutLineStyle,
  cellWPx: number,
  cellHPx: number,
  gapPx: number
): string {
  if (style !== "hairlineGrid") return "";
  const cols = page.cols ?? 0;
  const rows = page.rows ?? 0;
  if (cols <= 0 || rows <= 0) return "";

  const gridW = cols * cellWPx + (cols - 1) * gapPx;
  const gridH = rows * cellHPx + (rows - 1) * gapPx;
  const left = usable.x;
  const top = usable.y;
  const right = left + gridW;
  const bottom = top + gridH;

  const segs: string[] = [];
  const v = (x: number) => segs.push(`M${round(x)},${round(top)} L${round(x)},${round(bottom)}`);
  const h = (y: number) => segs.push(`M${round(left)},${round(y)} L${round(right)},${round(y)}`);

  // Outer frame.
  v(left);
  v(right);
  h(top);
  h(bottom);

  // Interior column boundaries (each drawn once).
  for (let col = 1; col < cols; col += 1) {
    const x0 = left + col * cellWPx + (col - 1) * gapPx;
    if (gapPx > 0) {
      v(x0);
      v(x0 + gapPx);
    } else {
      v(x0);
    }
  }
  // Interior row boundaries.
  for (let row = 1; row < rows; row += 1) {
    const y0 = top + row * cellHPx + (row - 1) * gapPx;
    if (gapPx > 0) {
      h(y0);
      h(y0 + gapPx);
    } else {
      h(y0);
    }
  }

  return segs.join(" ");
}

/**
 * Cut path for free packing: one rectangle outline per placed item. Items don't
 * share edges (there are gaps), so no de-duplication is needed.
 */
export function buildItemRectsPath(items: { xPx: number; yPx: number; widthPx: number; heightPx: number }[]): string {
  return items
    .map((it) => {
      const x = round(it.xPx);
      const y = round(it.yPx);
      const r = round(it.xPx + it.widthPx);
      const b = round(it.yPx + it.heightPx);
      return `M${x},${y} L${r},${y} L${r},${b} L${x},${b} Z`;
    })
    .join(" ");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

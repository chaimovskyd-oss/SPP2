/**
 * Puzzle collage layout engine.
 *
 * Generates interlocking jigsaw-puzzle cells. Each internal edge is either a
 * knob (outward tab) or a socket (inward notch), matched deterministically so
 * adjacent cells interlock perfectly. Outer edges are always flat.
 *
 * Design principles:
 * - Deterministic: same (imageCount, canvas, seed) → same puzzle every time
 * - Dynamic: recalculates from scratch on any canvas/spacing/count change
 * - Clean grid: optimal rows×cols chosen by scoring aspect ratio + cell quality
 * - No empty placeholders: last row stretches to fill when rows*cols > imageCount
 */

import { createCollageSlot } from "./collageFactory";
import type { CollageLayoutParams, CollageSlot, PuzzleTabs, PuzzleTabType } from "@/types/collage";

// ─── Seeded RNG (LCG, same as collageTornPaper) ───────────────────────────────

function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ─── Grid scoring ─────────────────────────────────────────────────────────────

/**
 * Score a (rows, cols) grid for a given imageCount and canvas aspect ratio.
 * Higher = better. Penalizes aspect ratio mismatch, excess cells, and extreme
 * cell proportions (too skinny or too tall).
 */
function scoreGrid(rows: number, cols: number, imageCount: number, canvasAR: number): number {
  if (rows * cols < imageCount) return -Infinity;
  const excess = rows * cols - imageCount;
  if (excess > Math.max(cols - 1, 2)) return -Infinity; // more than one partial row = reject
  const gridAR = cols / rows;
  const arPenalty = Math.abs(Math.log(canvasAR) - Math.log(gridAR)) * 2;
  const cellAR = canvasAR * rows / cols;
  const cellPenalty = Math.abs(Math.log(Math.max(cellAR, 1 / cellAR))) * 0.4;
  const excessPenalty = excess * 1.2;
  return -(arPenalty + excessPenalty + cellPenalty);
}

/**
 * Pick the best (rows, cols) for a given imageCount and canvas dimensions.
 * Tries all reasonable combinations within bounds.
 */
export function selectPuzzleGrid(
  imageCount: number,
  canvasW: number,
  canvasH: number,
): { rows: number; cols: number } {
  if (imageCount <= 1) return { rows: 1, cols: 1 };

  const canvasAR = canvasW / canvasH;
  let best = { rows: 1, cols: imageCount };
  let bestScore = -Infinity;

  const maxRows = Math.min(imageCount, 10);
  for (let r = 1; r <= maxRows; r++) {
    for (let c = r; c <= imageCount; c++) {
      if (r * c < imageCount) continue;

      const s1 = scoreGrid(r, c, imageCount, canvasAR);
      if (s1 > bestScore) { bestScore = s1; best = { rows: r, cols: c }; }

      if (r !== c) {
        const s2 = scoreGrid(c, r, imageCount, canvasAR);
        if (s2 > bestScore) { bestScore = s2; best = { rows: c, cols: r }; }
      }
    }
  }
  return best;
}

// ─── Tab grid ─────────────────────────────────────────────────────────────────

type TabDirection = "knob" | "socket";

interface TabGrid {
  /** hTabs[r][c]: bottom edge of cell (r,c) = top edge of cell (r+1,c). "knob" = going DOWN. */
  hTabs: TabDirection[][];
  /** vTabs[r][c]: right edge of cell (r,c) = left edge of cell (r,c+1). "knob" = going RIGHT. */
  vTabs: TabDirection[][];
}

function buildTabGrid(rows: number, cols: number, seed: number): TabGrid {
  const rng = lcg(seed);
  const hTabs: TabDirection[][] = Array.from({ length: Math.max(0, rows - 1) }, () =>
    Array.from({ length: cols }, () => (rng() > 0.5 ? "knob" : "socket"))
  );
  const vTabs: TabDirection[][] = Array.from({ length: rows }, () =>
    Array.from({ length: Math.max(0, cols - 1) }, () => (rng() > 0.5 ? "knob" : "socket"))
  );
  return { hTabs, vTabs };
}

/** Get the 4 tab directions for cell (r, c) in a grid. */
function getCellTabs(
  r: number, c: number,
  rows: number, cols: number,
  lastRowCount: number,
  tabGrid: TabGrid,
): PuzzleTabs {
  const { hTabs, vTabs } = tabGrid;
  const isLastRow = r === rows - 1;
  const isLastRowIncomplete = lastRowCount < cols;

  // Top edge
  const top: PuzzleTabType =
    r === 0 ? "flat"
    : isLastRow && isLastRowIncomplete ? "flat"           // incomplete last row: flat to avoid mismatch
    : hTabs[r - 1]?.[c] === "knob" ? "socket" : "knob"; // opposite of row above

  // Bottom edge — flat if this is the last row OR the row above an incomplete last row
  const bottomIsFlat =
    isLastRow ||
    (r === rows - 2 && isLastRowIncomplete); // row above incomplete last row: also flat
  const bottom: PuzzleTabType = bottomIsFlat ? "flat" : (hTabs[r]?.[c] ?? "knob");

  // Right edge
  const colsInRow = isLastRow ? lastRowCount : cols;
  const right: PuzzleTabType = c === colsInRow - 1 ? "flat" : (vTabs[r]?.[c] ?? "knob");

  // Left edge
  const left: PuzzleTabType =
    c === 0 ? "flat"
    : vTabs[r]?.[c - 1] === "knob" ? "socket" : "knob";

  return { top, right, bottom, left };
}

// ─── Slot builder ─────────────────────────────────────────────────────────────

export function buildPuzzleSlots(params: CollageLayoutParams & { seed?: number }): CollageSlot[] {
  const { imageCount, canvasW, canvasH, spacingPx, marginPx, seed = 42 } = params;
  if (imageCount === 0) return [];

  const { rows, cols } = selectPuzzleGrid(imageCount, canvasW, canvasH);
  const tabGrid = buildTabGrid(rows, cols, seed);

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const cellH = (usableH - spacingPx * (rows - 1)) / rows;
  const cellW = (usableW - spacingPx * (cols - 1)) / cols; // used for full rows

  const lastRowIndex = rows - 1;
  const lastRowCount = imageCount - lastRowIndex * cols; // cells in the last row

  const slots: CollageSlot[] = [];

  for (let idx = 0; idx < imageCount; idx++) {
    const r = Math.floor(idx / cols);
    const rowStart = r * cols;
    const c = idx - rowStart;
    const isLastRow = r === lastRowIndex;
    const colsInRow = isLastRow ? lastRowCount : cols;

    // Last-row-stretch: fewer cells fill the full width
    const w = isLastRow && lastRowCount < cols
      ? (usableW - spacingPx * (lastRowCount - 1)) / lastRowCount
      : cellW;

    const cellX = marginPx + c * (w + spacingPx);
    const cellY = marginPx + r * (cellH + spacingPx);

    const tabs = getCellTabs(r, c, rows, cols, lastRowCount, tabGrid);

    slots.push(createCollageSlot({
      type: "image",
      shape: "puzzle",
      x: cellX / canvasW,
      y: cellY / canvasH,
      w: w / canvasW,
      h: cellH / canvasH,
      label: `פאזל ${idx + 1}`,
      shapeParams: {
        puzzleTabs: tabs,
        puzzleRows: rows,
        puzzleCols: cols,
        puzzleSeed: seed,
      },
    }));
  }

  return slots;
}

// ─── Puzzle clip path (Konva-compatible clipFunc body) ────────────────────────

/**
 * Draws the puzzle-piece clip path for a given cell.
 * Call inside a Konva clipFunc — ctx is the 2D canvas context.
 *
 * Tab geometry:
 *   tabWidth = min(w, h) * TAB_W_FRAC
 *   tabDepth = tabWidth * TAB_D_FRAC
 *
 * Each tab is drawn with two cubic bezier curves for smooth, professional shape.
 * Socket = same bezier, opposite depth sign.
 */
const TAB_W_FRAC = 0.28;  // tab width = 28% of shorter cell dimension
const TAB_D_FRAC = 0.52;  // tab depth = 52% of tab width

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawPuzzlePath(ctx: any, x: number, y: number, w: number, h: number, tabs: PuzzleTabs): void {
  const tw = Math.min(w, h) * TAB_W_FRAC;
  const td = tw * TAB_D_FRAC;

  ctx.beginPath();
  ctx.moveTo(x, y); // top-left corner, go clockwise

  // ── TOP edge: left → right ──────────────────────────────────────────────
  // outward = up (negative y)
  if (tabs.top === "flat") {
    ctx.lineTo(x + w, y);
  } else {
    const cx = x + w / 2;
    const dir = tabs.top === "knob" ? -1 : 1; // -1=up(out), +1=down(in)
    ctx.lineTo(cx - tw / 2, y);
    ctx.bezierCurveTo(cx - tw / 2, y + dir * td * 0.4, cx - tw / 4, y + dir * td, cx, y + dir * td);
    ctx.bezierCurveTo(cx + tw / 4, y + dir * td, cx + tw / 2, y + dir * td * 0.4, cx + tw / 2, y);
    ctx.lineTo(x + w, y);
  }

  // ── RIGHT edge: top → bottom ─────────────────────────────────────────────
  // outward = right (positive x)
  if (tabs.right === "flat") {
    ctx.lineTo(x + w, y + h);
  } else {
    const cy = y + h / 2;
    const ex = x + w;
    const dir = tabs.right === "knob" ? 1 : -1; // +1=right(out), -1=left(in)
    ctx.lineTo(ex, cy - tw / 2);
    ctx.bezierCurveTo(ex + dir * td * 0.4, cy - tw / 2, ex + dir * td, cy - tw / 4, ex + dir * td, cy);
    ctx.bezierCurveTo(ex + dir * td, cy + tw / 4, ex + dir * td * 0.4, cy + tw / 2, ex, cy + tw / 2);
    ctx.lineTo(ex, y + h);
  }

  // ── BOTTOM edge: right → left ─────────────────────────────────────────────
  // outward = down (positive y) — draw in REVERSE order (right→left)
  if (tabs.bottom === "flat") {
    ctx.lineTo(x, y + h);
  } else {
    const cx = x + w / 2;
    const ey = y + h;
    const dir = tabs.bottom === "knob" ? 1 : -1; // +1=down(out), -1=up(in)
    ctx.lineTo(cx + tw / 2, ey);                 // approach from right
    ctx.bezierCurveTo(cx + tw / 2, ey + dir * td * 0.4, cx + tw / 4, ey + dir * td, cx, ey + dir * td);
    ctx.bezierCurveTo(cx - tw / 4, ey + dir * td, cx - tw / 2, ey + dir * td * 0.4, cx - tw / 2, ey);
    ctx.lineTo(x, ey);
  }

  // ── LEFT edge: bottom → top ───────────────────────────────────────────────
  // outward = left (negative x) — draw in REVERSE order (bottom→top)
  if (tabs.left === "flat") {
    ctx.lineTo(x, y);
  } else {
    const cy = y + h / 2;
    const ex = x;
    const dir = tabs.left === "knob" ? -1 : 1; // -1=left(out), +1=right(in)
    ctx.lineTo(ex, cy + tw / 2);               // approach from bottom
    ctx.bezierCurveTo(ex + dir * td * 0.4, cy + tw / 2, ex + dir * td, cy + tw / 4, ex + dir * td, cy);
    ctx.bezierCurveTo(ex + dir * td, cy - tw / 4, ex + dir * td * 0.4, cy - tw / 2, ex, cy - tw / 2);
    ctx.lineTo(ex, y);
  }

  ctx.closePath();
}

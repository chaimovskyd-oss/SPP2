/**
 * SPP Geometric Collage Engines V1
 * ---------------------------------
 * A new generation of collage layout generators that feel visually unique and
 * premium compared to the traditional grid families. Each engine:
 *   - adapts to any page size / orientation / image count / spacing / margin
 *   - always fills the usable area and stays visually centered
 *   - returns EXACTLY `imageCount` readable image slots (no fallback to grid)
 *   - promotes the most central cell to the "hero" role so that the image
 *     selection mechanism places the most important/central image there
 *
 * These are ADDITIVE — they do not replace the existing collage families.
 *
 * Engines:
 *   1. hexFlow        — honeycomb of regular hexagons
 *   2. diamondGrid    — rectangular grid with diamond (rotated-square) masks
 *   3. interlocking   — squares split into interlocking triangles (▲▼)
 *   4. ribbonFlow     — snaking rows of parallelogram "ribbon" cells
 *   5. organicPolygon — Voronoi diagram + Lloyd relaxation (mosaic glass)
 */

import { createCollageSlot } from "./collageFactory";
import {
  polygonBBox,
  polygonCentroid,
  insetPolygon,
  polygonToCollageSlot,
  type Pt,
} from "./collageGeometryUtils";
import type { CollageLayoutParams, CollageSlot } from "@/types/collage";

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Build a polygon slot, falling back to its bounding rectangle if the polygon
 * is rejected as unreadable. Guarantees a slot is always produced so the engine
 * never under-delivers on `imageCount` (which would trigger the grid fallback).
 */
function polySlot(
  points: Pt[],
  canvasW: number,
  canvasH: number,
  overrides: Partial<CollageSlot> = {},
): CollageSlot {
  const slot = polygonToCollageSlot(points, canvasW, canvasH, { shape: "polygon", ...overrides });
  if (slot) return slot;
  const b = polygonBBox(points);
  return createCollageSlot({
    ...overrides,
    type: "image",
    shape: "rect",
    shapeParams: {},
    x: Math.max(0, Math.min(1, b.x / canvasW)),
    y: Math.max(0, Math.min(1, b.y / canvasH)),
    w: Math.max(0.001, Math.min(1, b.w / canvasW)),
    h: Math.max(0.001, Math.min(1, b.h / canvasH)),
  });
}

/** Slot centre in normalized [0..1] coordinates. */
function slotCenter(slot: CollageSlot): Pt {
  if (slot.shape === "polygon" || slot.shape === "diagonalPolygon") {
    const verts = slot.shapeParams.vertices;
    if (verts && verts.length >= 3) {
      const c = polygonCentroid(verts);
      return { x: slot.x + c.x * slot.w, y: slot.y + c.y * slot.h };
    }
  }
  return { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 };
}

/**
 * Promote the image slot whose centre is closest to the page centre to the
 * "hero" role. The assignment engine then routes the most important / most
 * central image into it. Equal-size layouts (hex, diamond, voronoi) keep the
 * same geometry — only the role changes, so there are still no overlaps.
 */
function markCentralHero(slots: CollageSlot[]): CollageSlot[] {
  const imageIdx = slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.type === "image");
  if (imageIdx.length === 0) return slots;
  if (imageIdx.some(({ s }) => s.role === "hero")) return slots;

  let bestIdx = imageIdx[0]!.i;
  let bestDist = Infinity;
  for (const { s, i } of imageIdx) {
    const c = slotCenter(s);
    const d = Math.hypot(c.x - 0.5, c.y - 0.5);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return slots.map((s, i) => (i === bestIdx ? { ...s, role: "hero" as const } : s));
}

/** Pick a column count for `n` items inside a `w × h` area, ~square cells. */
function balancedCols(n: number, w: number, h: number): number {
  if (n <= 1) return 1;
  const cols = Math.round(Math.sqrt(n * (w / Math.max(1, h))));
  return Math.max(1, Math.min(n, cols));
}

/** Distribute `total` across `buckets` rows as evenly as possible (front-loaded). */
function distributeRows(total: number, buckets: number): number[] {
  const safe = Math.max(1, Math.min(buckets, total));
  const counts = Array.from({ length: safe }, () => Math.floor(total / safe));
  for (let i = 0; i < total % safe; i++) counts[i]++;
  return counts.filter((c) => c > 0);
}

// ─── Engine 1: HEX FLOW (honeycomb) ─────────────────────────────────────────────

export function generateHexFlowSlots(p: CollageLayoutParams): CollageSlot[] {
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n <= 0) return [];
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  if (usableW <= 0 || usableH <= 0) return [];

  // Pointy-top hexagons. R = circumradius (centre→vertex).
  //   width  W = √3·R   (flat-to-flat)
  //   height H = 2·R    (point-to-point)
  //   row pitch = 1.5·R, odd rows shifted by W/2.
  const SQRT3 = Math.sqrt(3);
  const cols = Math.max(1, balancedCols(n, usableW * SQRT3, usableH * 2));
  const rows = Math.ceil(n / cols);

  // Fit R to both axes. Cluster extents:
  //   width  = (cols + (rows > 1 ? 0.5 : 0))·W
  //   height = (1.5·rows + 0.5)·R
  const widthCols = cols + (rows > 1 ? 0.5 : 0);
  const rW = usableW / (widthCols * SQRT3);
  const rH = usableH / (1.5 * rows + 0.5);
  const R = Math.max(1, Math.min(rW, rH));
  const W = SQRT3 * R;

  const clusterW = widthCols * W;
  const clusterH = (1.5 * rows + 0.5) * R;
  const offsetX = marginPx + (usableW - clusterW) / 2;
  const offsetY = marginPx + (usableH - clusterH) / 2;
  const inset = Math.min(spacingPx / 2, R * 0.45);

  const slots: CollageSlot[] = [];
  let placed = 0;
  for (let row = 0; row < rows && placed < n; row++) {
    const rowStart = row * cols;
    const rowCount = Math.min(cols, n - rowStart);
    const shifted = row % 2 === 1;
    // Centre the (possibly partial) row across the usable width.
    const rowW = (rowCount - 1) * W;
    const baseCx = marginPx + (usableW - rowW) / 2;
    for (let col = 0; col < rowCount; col++) {
      const cx = rowCount < cols
        ? baseCx + col * W
        : offsetX + W / 2 + col * W + (shifted ? W / 2 : 0);
      const cy = offsetY + R + row * 1.5 * R;
      const hex: Pt[] = Array.from({ length: 6 }, (_, i) => {
        const a = (-90 + i * 60) * (Math.PI / 180);
        return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
      });
      slots.push(
        polySlot(insetPolygon(hex, inset), canvasW, canvasH, {
          label: `משושה ${placed + 1}`,
          zIndex: placed,
        }),
      );
      placed++;
    }
  }

  return markCentralHero(slots);
}

// ─── Engine 2: DIAMOND GRID (rotated-square masks over a grid) ───────────────────

export function generateDiamondGridSlots(p: CollageLayoutParams): CollageSlot[] {
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n <= 0) return [];
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  if (usableW <= 0 || usableH <= 0) return [];

  const cols = balancedCols(n, usableW, usableH);
  const rows = Math.ceil(n / cols);
  const cellH = (usableH - spacingPx * (rows - 1)) / rows;

  const slots: CollageSlot[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, n - rowStart);
    const cellW = (usableW - spacingPx * (rowCount - 1)) / rowCount;
    const x = marginPx + (i - rowStart) * (cellW + spacingPx);
    const y = marginPx + row * (cellH + spacingPx);
    // Diamond inscribed in the cell: top / right / bottom / left mid-points.
    const diamond: Pt[] = [
      { x: x + cellW / 2, y },
      { x: x + cellW, y: y + cellH / 2 },
      { x: x + cellW / 2, y: y + cellH },
      { x, y: y + cellH / 2 },
    ];
    slots.push(
      polySlot(diamond, canvasW, canvasH, { label: `יהלום ${i + 1}`, zIndex: i }),
    );
  }

  return markCentralHero(slots);
}

// ─── Engine 3: INTERLOCKING GEOMETRY (triangles ▲▼) ──────────────────────────────

export function generateInterlockingSlots(p: CollageLayoutParams): CollageSlot[] {
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n <= 0) return [];
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  if (usableW <= 0 || usableH <= 0) return [];

  // Each square holds 2 triangles, or 1 full image (hero). With S squares,
  // making `full` squares whole and the rest split gives: full + 2·(S-full) = n
  //   → full = 2·S − n. Choose S = ceil(n/2) ⇒ full ∈ {0, 1}.
  const S = Math.ceil(n / 2);
  const full = 2 * S - n; // 0 when n even, 1 when n odd
  const cols = balancedCols(S, usableW, usableH);
  const rows = Math.ceil(S / cols);
  const cellH = (usableH - spacingPx * (rows - 1)) / rows;
  const inset = spacingPx / 2;

  // Geometry of every square (so we can choose the most central as the hero).
  const squares = Array.from({ length: S }, (_, s) => {
    const row = Math.floor(s / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, S - rowStart);
    const cellW = (usableW - spacingPx * (rowCount - 1)) / rowCount;
    const x = marginPx + (s - rowStart) * (cellW + spacingPx);
    const y = marginPx + row * (cellH + spacingPx);
    return { x, y, w: cellW, h: cellH };
  });
  const pageCx = marginPx + usableW / 2;
  const pageCy = marginPx + usableH / 2;
  const heroSquare = full === 1
    ? squares.reduce(
        (best, sq, i) => {
          const d = Math.hypot(sq.x + sq.w / 2 - pageCx, sq.y + sq.h / 2 - pageCy);
          return d < best.d ? { i, d } : best;
        },
        { i: 0, d: Infinity },
      ).i
    : -1;

  const slots: CollageSlot[] = [];
  for (let s = 0; s < S; s++) {
    const { x, y, w: cellW } = squares[s]!;

    if (s === heroSquare) {
      const square: Pt[] = [
        { x, y },
        { x: x + cellW, y },
        { x: x + cellW, y: y + cellH },
        { x, y: y + cellH },
      ];
      slots.push(
        polySlot(insetPolygon(square, inset), canvasW, canvasH, {
          role: "hero",
          label: "תא מרכזי",
          zIndex: slots.length,
        }),
      );
      continue;
    }

    // Alternate diagonal direction in a checkerboard for the interlocking look.
    const forward = (Math.floor(s / cols) + (s % cols)) % 2 === 0;
    const triA: Pt[] = forward
      ? [{ x, y }, { x: x + cellW, y }, { x, y: y + cellH }]
      : [{ x, y }, { x: x + cellW, y }, { x: x + cellW, y: y + cellH }];
    const triB: Pt[] = forward
      ? [{ x: x + cellW, y }, { x: x + cellW, y: y + cellH }, { x, y: y + cellH }]
      : [{ x, y }, { x: x + cellW, y: y + cellH }, { x, y: y + cellH }];

    slots.push(
      polySlot(insetPolygon(triA, inset), canvasW, canvasH, {
        shape: "diagonalPolygon",
        label: `משולש ${slots.length + 1}`,
        zIndex: slots.length,
      }),
    );
    slots.push(
      polySlot(insetPolygon(triB, inset), canvasW, canvasH, {
        shape: "diagonalPolygon",
        label: `משולש ${slots.length + 1}`,
        zIndex: slots.length,
      }),
    );
  }

  const trimmed = slots.slice(0, n);
  return markCentralHero(trimmed);
}

// ─── Engine 4: RIBBON FLOW (snaking parallelogram rows) ──────────────────────────

export function generateRibbonFlowSlots(p: CollageLayoutParams): CollageSlot[] {
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n <= 0) return [];
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  if (usableW <= 0 || usableH <= 0) return [];

  const rows = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * (usableH / Math.max(1, usableW))))));
  const rowCounts = distributeRows(n, rows);
  const actualRows = rowCounts.length;
  const rowH = (usableH - spacingPx * (actualRows - 1)) / actualRows;
  const inset = Math.min(spacingPx / 2, rowH * 0.2);

  const slots: CollageSlot[] = [];
  rowCounts.forEach((count, row) => {
    const y = marginPx + row * (rowH + spacingPx);
    const cellW = (usableW - spacingPx * (count - 1)) / count;
    // Slant alternates per row → the ribbon "snakes" down the page.
    const slant = Math.min(cellW * 0.32, rowH * 0.5) * (row % 2 === 0 ? 1 : -1);
    for (let col = 0; col < count; col++) {
      const bx0 = marginPx + col * (cellW + spacingPx);
      const bx1 = bx0 + cellW;
      const isFirst = col === 0;
      const isLast = col === count - 1;
      // Slanted interior edges; vertical edges at the two ends fill the row rect.
      const topLeft = { x: isFirst ? bx0 : bx0 + slant, y };
      const topRight = { x: isLast ? bx1 : bx1 + slant, y };
      const botRight = { x: bx1, y: y + rowH };
      const botLeft = { x: bx0, y: y + rowH };
      const poly: Pt[] = [topLeft, topRight, botRight, botLeft];
      slots.push(
        polySlot(insetPolygon(poly, inset), canvasW, canvasH, {
          shape: "diagonalPolygon",
          label: `סרט ${slots.length + 1}`,
          zIndex: slots.length,
        }),
      );
    }
  });

  return markCentralHero(slots);
}

// ─── Engine 5: ORGANIC POLYGON (Voronoi + Lloyd relaxation) ──────────────────────

/** Clip a convex polygon to the half-plane closer to `a` than to `b`. */
function clipCloserHalfPlane(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const normal = { x: b.x - a.x, y: b.y - a.y };
  const side = (pt: Pt) => (pt.x - mid.x) * normal.x + (pt.y - mid.y) * normal.y;
  const intersect = (p1: Pt, p2: Pt): Pt => {
    const d1 = side(p1);
    const d2 = side(p2);
    const t = d1 / (d1 - d2 || 1);
    return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
  };
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i]!;
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const currIn = side(curr) <= 0;
    const prevIn = side(prev) <= 0;
    if (currIn) {
      if (!prevIn) out.push(intersect(prev, curr));
      out.push(curr);
    } else if (prevIn) {
      out.push(intersect(prev, curr));
    }
  }
  return out;
}

function lloydSeededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += h << 13; h ^= h >>> 7;
    h += h << 3; h ^= h >>> 17;
    h += h << 5;
    return ((h >>> 0) % 1000000) / 1000000;
  };
}

/** Round the corners of a polygon slightly for a soft mosaic-glass look. */
function softenPolygon(poly: Pt[], amount: number): Pt[] {
  if (poly.length < 3) return poly;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const curr = poly[i]!;
    const next = poly[(i + 1) % poly.length]!;
    out.push({ x: curr.x * (1 - amount) + prev.x * amount, y: curr.y * (1 - amount) + prev.y * amount });
    out.push({ x: curr.x * (1 - amount) + next.x * amount, y: curr.y * (1 - amount) + next.y * amount });
  }
  return out;
}

export function generateOrganicPolygonSlots(p: CollageLayoutParams): CollageSlot[] {
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n <= 0) return [];
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  if (usableW <= 0 || usableH <= 0) return [];

  const bounds: Pt[] = [
    { x: marginPx, y: marginPx },
    { x: marginPx + usableW, y: marginPx },
    { x: marginPx + usableW, y: marginPx + usableH },
    { x: marginPx, y: marginPx + usableH },
  ];

  // Seed points on a jittered grid (deterministic per page/count).
  const rand = lloydSeededRandom(`organic-${n}-${Math.round(canvasW)}x${Math.round(canvasH)}`);
  const cols = balancedCols(n, usableW, usableH);
  const rows = Math.ceil(n / cols);
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  let points: Pt[] = Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const jx = (rand() - 0.5) * cellW * 0.5;
    const jy = (rand() - 0.5) * cellH * 0.5;
    return {
      x: marginPx + (col + 0.5) * cellW + jx,
      y: marginPx + (row + 0.5) * cellH + jy,
    };
  });

  const voronoiCell = (idx: number, pts: Pt[]): Pt[] => {
    let poly = bounds;
    for (let j = 0; j < pts.length && poly.length >= 3; j++) {
      if (j === idx) continue;
      poly = clipCloserHalfPlane(poly, pts[idx]!, pts[j]!);
    }
    return poly;
  };

  // Lloyd relaxation → evenly-sized, rounded cells (no needles / strips).
  for (let iter = 0; iter < 4; iter++) {
    points = points.map((_, idx) => {
      const cell = voronoiCell(idx, points);
      if (cell.length < 3) return points[idx]!;
      const c = polygonCentroid(cell);
      return {
        x: Math.min(marginPx + usableW, Math.max(marginPx, c.x)),
        y: Math.min(marginPx + usableH, Math.max(marginPx, c.y)),
      };
    });
  }

  const slots: CollageSlot[] = points.map((_, idx) => {
    const cell = voronoiCell(idx, points);
    const softened = cell.length >= 3 ? softenPolygon(cell, 0.16) : cell;
    const inset = insetPolygon(softened, spacingPx / 2);
    return polySlot(inset, canvasW, canvasH, { label: `אריח ${idx + 1}`, zIndex: idx });
  });

  return markCentralHero(slots);
}

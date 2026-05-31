import type { Rect } from "@/types/primitives";

export function cloneRect(r: Rect): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export function rectRight(r: Rect): number {
  return r.x + r.width;
}

export function rectBottom(r: Rect): number {
  return r.y + r.height;
}

export function rectCenterX(r: Rect): number {
  return r.x + r.width / 2;
}

export function rectCenterY(r: Rect): number {
  return r.y + r.height / 2;
}

export function rectArea(r: Rect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

/** Smallest rect containing all inputs. Returns null for an empty list. */
export function getUnionBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, rectRight(r));
    maxY = Math.max(maxY, rectBottom(r));
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function inflateRect(r: Rect, amount: number): Rect {
  return { x: r.x - amount, y: r.y - amount, width: r.width + amount * 2, height: r.height + amount * 2 };
}

export function deflateRect(r: Rect, amount: number): Rect {
  return inflateRect(r, -amount);
}

/** Deflate a rect by per-side margins (page px). Never collapses below 1px. */
export function deflateByMargins(r: Rect, m: { top: number; right: number; bottom: number; left: number }): Rect {
  const width = Math.max(1, r.width - m.left - m.right);
  const height = Math.max(1, r.height - m.top - m.bottom);
  return { x: r.x + m.left, y: r.y + m.top, width, height };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < rectRight(b) && rectRight(a) > b.x && a.y < rectBottom(b) && rectBottom(a) > b.y;
}

/** Overlap area between two rects (0 if disjoint). */
export function intersectionArea(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y));
  return x * y;
}

/** True if `child` is fully inside `container` (with small epsilon). */
export function containsRect(container: Rect, child: Rect, epsilon = 0.5): boolean {
  return (
    child.x >= container.x - epsilon &&
    child.y >= container.y - epsilon &&
    rectRight(child) <= rectRight(container) + epsilon &&
    rectBottom(child) <= rectBottom(container) + epsilon
  );
}

/**
 * Translate `rect` minimally so it sits inside `bounds`. If the rect is larger
 * than bounds on an axis, it is aligned to that axis's start (no resize here).
 */
export function moveRectIntoBounds(rect: Rect, bounds: Rect): Rect {
  let { x, y } = rect;
  if (rect.width <= bounds.width) {
    if (x < bounds.x) x = bounds.x;
    else if (rectRight({ ...rect, x }) > rectRight(bounds)) x = rectRight(bounds) - rect.width;
  } else {
    x = bounds.x;
  }
  if (rect.height <= bounds.height) {
    if (y < bounds.y) y = bounds.y;
    else if (rectBottom({ ...rect, y }) > rectBottom(bounds)) y = rectBottom(bounds) - rect.height;
  } else {
    y = bounds.y;
  }
  return { ...rect, x, y };
}

export type Axis = "vertical" | "horizontal";

/** Euclidean move distance of a rect's top-left corner. */
export function moveDistance(a: Rect, b: Rect): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Even out gaps in a stack while preserving the group's center on the stack axis.
 * Mutates copies; returns new rects in the same order as input (sorted internally
 * by position, then mapped back). Sizes are preserved.
 */
export function distributeAlong(rects: Rect[], axis: Axis, gap: number): Rect[] {
  if (rects.length < 2) return rects.map(cloneRect);
  const vertical = axis === "vertical";
  const order = rects
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (vertical ? a.r.y - b.r.y : a.r.x - b.r.x));

  const totalSize = order.reduce((sum, o) => sum + (vertical ? o.r.height : o.r.width), 0);
  const span = totalSize + gap * (order.length - 1);

  // Preserve the group's center along the axis.
  const minStart = Math.min(...order.map((o) => (vertical ? o.r.y : o.r.x)));
  const maxEnd = Math.max(...order.map((o) => (vertical ? rectBottom(o.r) : rectRight(o.r))));
  const center = (minStart + maxEnd) / 2;
  let cursor = center - span / 2;

  const out: Rect[] = rects.map(cloneRect);
  for (const o of order) {
    const next = cloneRect(o.r);
    if (vertical) next.y = cursor;
    else next.x = cursor;
    out[o.i] = next;
    cursor += (vertical ? next.height : next.width) + gap;
  }
  return out;
}

export function averageGap(rects: Rect[], axis: Axis): number {
  if (rects.length < 2) return 0;
  const vertical = axis === "vertical";
  const sorted = [...rects].sort((a, b) => (vertical ? a.y - b.y : a.x - b.x));
  let total = 0;
  let count = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const prevEnd = vertical ? rectBottom(sorted[i - 1]) : rectRight(sorted[i - 1]);
    const curStart = vertical ? sorted[i].y : sorted[i].x;
    total += curStart - prevEnd;
    count += 1;
  }
  return count === 0 ? 0 : total / count;
}

/**
 * Detect whether a set of rects reads as a vertical or horizontal stack by
 * comparing the spread of centers on each axis. Vertical stacks spread more on Y.
 */
export function detectStackAxis(rects: Rect[]): Axis {
  if (rects.length < 2) return "vertical";
  const xs = rects.map(rectCenterX);
  const ys = rects.map(rectCenterY);
  const spread = (vals: number[]): number => Math.max(...vals) - Math.min(...vals);
  return spread(ys) >= spread(xs) ? "vertical" : "horizontal";
}

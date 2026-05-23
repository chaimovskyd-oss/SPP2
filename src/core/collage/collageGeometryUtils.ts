import { createCollageSlot } from "./collageFactory";
import type { CollageSlot } from "@/types/collage";

export type Pt = { x: number; y: number };

export interface RectPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PolygonReadabilityOptions {
  minAreaPx?: number;
  minSidePx?: number;
  maxAspectRatio?: number;
  minFillRatio?: number;
}

const EPSILON = 1e-6;

export function polygonBBox(points: Pt[]): RectPx {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
}

export function polygonArea(points: Pt[]): number {
  if (points.length < 3) return 0;

  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum) / 2;
}

export function polygonCentroid(points: Pt[]): Pt {
  if (points.length === 0) return { x: 0, y: 0 };

  let areaSum = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    areaSum += cross;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }

  const signedArea = areaSum / 2;
  if (Math.abs(signedArea) < EPSILON) {
    return points.reduce(
      (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
      { x: 0, y: 0 }
    );
  }

  return { x: cx / (6 * signedArea), y: cy / (6 * signedArea) };
}

export function insetPolygon(points: Pt[], insetPx: number): Pt[] {
  if (points.length < 3 || insetPx <= 0) return points.map((p) => ({ ...p }));

  const center = polygonCentroid(points);
  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= EPSILON) return { ...point };

    const scale = Math.max(0.05, (distance - insetPx) / distance);
    return {
      x: center.x + dx * scale,
      y: center.y + dy * scale,
    };
  });
}

export function clipPolyToRect(points: Pt[], rect: RectPx): Pt[] {
  if (points.length < 3 || rect.w <= 0 || rect.h <= 0) return [];

  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;

  let output = points.map((p) => ({ ...p }));
  output = clipAgainstEdge(output, (p) => p.x >= left, (a, b) => intersectVertical(a, b, left));
  output = clipAgainstEdge(output, (p) => p.x <= right, (a, b) => intersectVertical(a, b, right));
  output = clipAgainstEdge(output, (p) => p.y >= top, (a, b) => intersectHorizontal(a, b, top));
  output = clipAgainstEdge(output, (p) => p.y <= bottom, (a, b) => intersectHorizontal(a, b, bottom));

  return output.filter((point, index, arr) => {
    const prev = arr[(index - 1 + arr.length) % arr.length];
    return !prev || Math.hypot(point.x - prev.x, point.y - prev.y) > EPSILON;
  });
}

export function isReadablePolygon(points: Pt[], options: PolygonReadabilityOptions = {}): boolean {
  if (points.length < 3) return false;

  const bbox = polygonBBox(points);
  if (bbox.w <= EPSILON || bbox.h <= EPSILON) return false;

  const area = polygonArea(points);
  const minAreaPx = options.minAreaPx ?? 600;
  const minSidePx = options.minSidePx ?? 12;
  const maxAspectRatio = options.maxAspectRatio ?? 8;
  const minFillRatio = options.minFillRatio ?? 0.18;

  if (area < minAreaPx) return false;
  if (bbox.w < minSidePx || bbox.h < minSidePx) return false;
  if (Math.max(bbox.w / bbox.h, bbox.h / bbox.w) > maxAspectRatio) return false;
  if (area / Math.max(EPSILON, bbox.w * bbox.h) < minFillRatio) return false;

  return true;
}

export function polygonToCollageSlot(
  points: Pt[],
  canvasW: number,
  canvasH: number,
  overrides: Partial<CollageSlot> = {}
): CollageSlot | null {
  if (canvasW <= 0 || canvasH <= 0 || !isReadablePolygon(points)) return null;

  const bbox = polygonBBox(points);
  if (bbox.w <= EPSILON || bbox.h <= EPSILON) return null;

  const vertices = points.map((point) => ({
    x: clamp01((point.x - bbox.x) / bbox.w),
    y: clamp01((point.y - bbox.y) / bbox.h),
  }));

  return createCollageSlot({
    type: "image",
    shape: "polygon",
    x: clamp01(bbox.x / canvasW),
    y: clamp01(bbox.y / canvasH),
    w: Math.max(0.001, Math.min(1, bbox.w / canvasW)),
    h: Math.max(0.001, Math.min(1, bbox.h / canvasH)),
    shapeParams: { vertices },
    ...overrides,
  });
}

function clipAgainstEdge(
  points: Pt[],
  isInside: (point: Pt) => boolean,
  intersection: (from: Pt, to: Pt) => Pt
): Pt[] {
  if (points.length === 0) return [];

  const clipped: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const previous = points[(i - 1 + points.length) % points.length];
    const currentInside = isInside(current);
    const previousInside = isInside(previous);

    if (currentInside) {
      if (!previousInside) clipped.push(intersection(previous, current));
      clipped.push(current);
    } else if (previousInside) {
      clipped.push(intersection(previous, current));
    }
  }

  return clipped;
}

function intersectVertical(from: Pt, to: Pt, x: number): Pt {
  const t = (x - from.x) / (to.x - from.x || EPSILON);
  return { x, y: from.y + (to.y - from.y) * t };
}

function intersectHorizontal(from: Pt, to: Pt, y: number): Pt {
  const t = (y - from.y) / (to.y - from.y || EPSILON);
  return { x: from.x + (to.x - from.x) * t, y };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

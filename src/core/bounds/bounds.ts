import { measureTextLayerSize } from "@/core/text/measurement";
import type { Page } from "@/types/document";
import type { GroupLayer, VisualLayer } from "@/types/layers";
import type { Rect } from "@/types/primitives";

export interface Point {
  x: number;
  y: number;
}

export interface RotatedBounds {
  points: [Point, Point, Point, Point];
  aabb: Rect;
}

export function getLayerBounds(layer: VisualLayer): Rect {
  const size = layer.type === "text" ? measureTextLayerSize(layer) : { width: layer.width, height: layer.height };
  return {
    x: layer.x,
    y: layer.y,
    width: size.width,
    height: size.height
  };
}

export function getRotatedLayerBounds(layer: VisualLayer): RotatedBounds {
  const rect = getLayerBounds(layer);
  const points = rotateRect(rect, layer.rotation);
  return {
    points,
    aabb: boundsFromPoints(points)
  };
}

export function getTransformedBounds(layer: VisualLayer): Rect {
  return getRotatedLayerBounds(layer).aabb;
}

/**
 * Size of the axis-aligned bounding box that a `width × height` rectangle occupies
 * once rotated by `rotationDeg` (independent of pivot/position).
 */
export function rotatedAabbSize(width: number, height: number, rotationDeg: number): { width: number; height: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos
  };
}

/**
 * Konva renders rect/image/text/frame layers rotating around their node origin
 * (the unrotated top-left = `x, y`). The visible center therefore sits at
 * `origin + R(θ) · (w/2, h/2)`. Given a desired visible center `(cx, cy)`, returns
 * the `x, y` (node origin) that places the layer's visual center there.
 *
 * For rotation 0 this reduces to `(cx - w/2, cy - h/2)` — identical to the naive
 * top-left placement, so unrotated layers are unaffected.
 */
export function originForVisualCenter(
  cx: number,
  cy: number,
  width: number,
  height: number,
  rotationDeg: number
): Point {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = width / 2;
  const hh = height / 2;
  return {
    x: cx - (hw * cos - hh * sin),
    y: cy - (hw * sin + hh * cos)
  };
}

/** Circle/ellipse shapes rotate around their own center; everything else rotates around its top-left origin. */
export function isCenterPivotLayer(layer: VisualLayer): boolean {
  const shapeKind = layer.type === "shape" ? (layer as unknown as { shape?: string }).shape : undefined;
  return shapeKind === "circle" || shapeKind === "ellipse";
}

/**
 * Returns the node origin (`x, y`) that places a layer's visual center at `(cx, cy)`,
 * accounting for rotation and the layer's pivot convention. Pass `sizeOverride` when
 * the layer is being resized in the same operation (e.g. fit-to-canvas); otherwise the
 * layer's measured bounds are used (handles auto-sized text).
 */
export function visualCenterToOrigin(
  layer: VisualLayer,
  cx: number,
  cy: number,
  sizeOverride?: { width: number; height: number }
): Point {
  const size = sizeOverride ?? getLayerBounds(layer);
  const rotation = layer.rotation ?? 0;
  if (isCenterPivotLayer(layer) || rotation === 0) {
    return { x: cx - size.width / 2, y: cy - size.height / 2 };
  }
  return originForVisualCenter(cx, cy, size.width, size.height, rotation);
}

export function getGroupBounds(group: GroupLayer, layers: VisualLayer[]): Rect {
  const children = layers.filter((layer) => group.childIds.includes(layer.id));
  return unionRects(children.map(getTransformedBounds));
}

export function getPageBounds(page: Page): Rect {
  return { x: 0, y: 0, width: page.width, height: page.height };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function normalizeRect(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

export function getSelectionHandleBounds(bounds: Rect, handleSize: number): Rect[] {
  const half = handleSize / 2;
  return [
    { x: bounds.x - half, y: bounds.y - half, width: handleSize, height: handleSize },
    { x: bounds.x + bounds.width - half, y: bounds.y - half, width: handleSize, height: handleSize },
    { x: bounds.x - half, y: bounds.y + bounds.height - half, width: handleSize, height: handleSize },
    { x: bounds.x + bounds.width - half, y: bounds.y + bounds.height - half, width: handleSize, height: handleSize }
  ];
}

export function hitTestLayers(point: Point, layers: VisualLayer[], options: { includeLocked?: boolean; includeHidden?: boolean } = {}): VisualLayer | null {
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  return ordered.find((layer) => {
    if (!options.includeHidden && !layer.visible) return false;
    if (!options.includeLocked && layer.locked) return false;
    return pointInRect(point, getTransformedBounds(layer));
  }) ?? null;
}

export function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rotateRect(rect: Rect, rotation: number): [Point, Point, Point, Point] {
  const radians = (rotation * Math.PI) / 180;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const points: [Point, Point, Point, Point] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ];
  return points.map((point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return {
      x: cx + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: cy + dx * Math.sin(radians) + dy * Math.cos(radians)
    };
  }) as [Point, Point, Point, Point];
}

function boundsFromPoints(points: Point[]): Rect {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

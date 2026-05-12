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

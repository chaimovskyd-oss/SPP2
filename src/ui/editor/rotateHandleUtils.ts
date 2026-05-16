import type Konva from "konva";

export interface RotateHandlePosition {
  x: number;          // canvas units — handle center X
  y: number;          // canvas units — handle center Y
  lineStartY: number; // canvas units — AABB edge where connector line starts
  placement: "above" | "below";
}

// Distance from the selection AABB edge to the handle center, in canvas units.
const HANDLE_OFFSET = 30;

/**
 * Returns the axis-aligned bounding box of a Konva node in canvas units,
 * computed from the node's declared width/height via its absolute transform.
 * Using width/height (not getClientRect) avoids inflating the box with child overflow.
 */
export function nodeAABBInCanvasUnits(
  node: Konva.Node,
  scale: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const w = node.width();
  const h = node.height();
  const t = node.getAbsoluteTransform();
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ].map(lc => {
    const sp = t.point(lc);
    return { x: sp.x / scale, y: sp.y / scale };
  });
  return {
    minX: Math.min(...corners.map(p => p.x)),
    minY: Math.min(...corners.map(p => p.y)),
    maxX: Math.max(...corners.map(p => p.x)),
    maxY: Math.max(...corners.map(p => p.y)),
  };
}

/**
 * Computes the optimal position for the custom rotate handle.
 *
 * Placement rules:
 * - Selection midpoint in the **top half** of the canvas → handle goes **below**
 *   (prevents clipping at the top and keeps it away from the canvas edge).
 * - Selection midpoint in the **bottom half** → handle goes **above**.
 *
 * The position is clamped to stay within canvas bounds.
 *
 * Correctly handles: zoom (via absoluteTransform), scroll/pan (CSS transform on
 * container, transparent to Konva), multi-selection, rotated objects, scaled objects.
 *
 * Returns null when no transformable nodes are selected.
 */
export function calculateRotateHandlePosition(
  transformer: Konva.Transformer,
  pageHeight: number
): RotateHandlePosition | null {
  const nodes = transformer.nodes();
  if (nodes.length === 0) return null;

  const stage = transformer.getStage();
  if (stage === null) return null;

  const scale = stage.scaleX();
  if (scale === 0) return null;

  // Merge axis-aligned bounding boxes of all selected nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    const bb = nodeAABBInCanvasUnits(node, scale);
    minX = Math.min(minX, bb.minX);
    minY = Math.min(minY, bb.minY);
    maxX = Math.max(maxX, bb.maxX);
    maxY = Math.max(maxY, bb.maxY);
  }

  const topY    = minY;
  const bottomY = maxY;
  const centerX = (minX + maxX) / 2;
  const midSelY = (topY + bottomY) / 2;

  if (midSelY < pageHeight / 2) {
    return {
      x: centerX,
      y: Math.min(bottomY + HANDLE_OFFSET, pageHeight - 5),
      lineStartY: bottomY,
      placement: "below",
    };
  }
  return {
    x: centerX,
    y: Math.max(topY - HANDLE_OFFSET, 5),
    lineStartY: topY,
    placement: "above",
  };
}

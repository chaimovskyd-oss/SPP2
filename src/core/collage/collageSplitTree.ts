import { createId } from "@/core/ids";
import { createCollageSlot } from "./collageFactory";
import type { CollageSplitNode, CollageSlot } from "@/types/collage";
import type { ID } from "@/types/primitives";

// ─── Tree builder ─────────────────────────────────────────────────────────────

export function buildSplitTree(n: number): CollageSplitNode {
  if (n <= 1) return { type: "leaf", slotId: createId("stleaf") };
  return buildSplitNode(n, "H");
}

function buildSplitNode(n: number, direction: "H" | "V"): CollageSplitNode {
  if (n === 1) return { type: "leaf", slotId: createId("stleaf") };
  const half = Math.floor(n / 2);
  const nextDir: "H" | "V" = direction === "H" ? "V" : "H";
  return {
    type: "split",
    direction,
    ratio: 0.5,
    first: buildSplitNode(half, nextDir),
    second: buildSplitNode(n - half, nextDir)
  };
}

// ─── Rect computation ─────────────────────────────────────────────────────────

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeSplitTreeSlots(
  tree: CollageSplitNode,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  const mX = marginPx / canvasW;
  const mY = marginPx / canvasH;
  const sX = spacingPx / canvasW;
  const sY = spacingPx / canvasH;
  const slots: CollageSlot[] = [];
  fillSlots(tree, { x: mX, y: mY, w: 1 - 2 * mX, h: 1 - 2 * mY }, sX, sY, slots);
  return slots;
}

function fillSlots(
  node: CollageSplitNode,
  rect: Rect,
  sX: number,
  sY: number,
  out: CollageSlot[]
): void {
  if (node.type === "leaf") {
    const slot = createCollageSlot({ ...rect, id: node.slotId });
    out.push(slot);
    return;
  }
  if (node.direction === "H") {
    const wFirst = rect.w * node.ratio - sX / 2;
    const wSecond = rect.w * (1 - node.ratio) - sX / 2;
    fillSlots(node.first, { x: rect.x, y: rect.y, w: wFirst, h: rect.h }, sX, sY, out);
    fillSlots(node.second, { x: rect.x + wFirst + sX, y: rect.y, w: wSecond, h: rect.h }, sX, sY, out);
  } else {
    const hFirst = rect.h * node.ratio - sY / 2;
    const hSecond = rect.h * (1 - node.ratio) - sY / 2;
    fillSlots(node.first, { x: rect.x, y: rect.y, w: rect.w, h: hFirst }, sX, sY, out);
    fillSlots(node.second, { x: rect.x, y: rect.y + hFirst + sY, w: rect.w, h: hSecond }, sX, sY, out);
  }
}

// ─── Collect dividers for interactive dragging ────────────────────────────────

export interface CollageDivider {
  nodeId: string;
  direction: "H" | "V";
  /** Absolute position fraction in canvas [0..1] */
  position: number;
  /** Extent of the divider in the perpendicular axis */
  start: number;
  end: number;
}

export function collectDividers(
  tree: CollageSplitNode,
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 },
  nodeId = "root"
): CollageDivider[] {
  if (tree.type === "leaf") return [];
  const dividers: CollageDivider[] = [];

  if (tree.direction === "H") {
    dividers.push({
      nodeId,
      direction: "H",
      position: rect.x + rect.w * tree.ratio,
      start: rect.y,
      end: rect.y + rect.h
    });
    const wFirst = rect.w * tree.ratio;
    dividers.push(...collectDividers(tree.first, { ...rect, w: wFirst }, `${nodeId}.first`));
    dividers.push(...collectDividers(tree.second, { x: rect.x + wFirst, y: rect.y, w: rect.w - wFirst, h: rect.h }, `${nodeId}.second`));
  } else {
    dividers.push({
      nodeId,
      direction: "V",
      position: rect.y + rect.h * tree.ratio,
      start: rect.x,
      end: rect.x + rect.w
    });
    const hFirst = rect.h * tree.ratio;
    dividers.push(...collectDividers(tree.first, { ...rect, h: hFirst }, `${nodeId}.first`));
    dividers.push(...collectDividers(tree.second, { x: rect.x, y: rect.y + hFirst, w: rect.w, h: rect.h - hFirst }, `${nodeId}.second`));
  }
  return dividers;
}

export function updateSplitRatio(tree: CollageSplitNode, targetNodeId: string, newRatio: number, nodeId = "root"): CollageSplitNode {
  if (tree.type === "leaf") return tree;
  if (nodeId === targetNodeId) {
    return { ...tree, ratio: Math.max(0.05, Math.min(0.95, newRatio)) };
  }
  return {
    ...tree,
    first: updateSplitRatio(tree.first, targetNodeId, newRatio, `${nodeId}.first`),
    second: updateSplitRatio(tree.second, targetNodeId, newRatio, `${nodeId}.second`)
  };
}

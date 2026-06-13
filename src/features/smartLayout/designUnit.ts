import { createId } from "@/core/ids";
import { getSelectionBounds } from "@/core/selection/selectionEngine";
import type { Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import type { Rect } from "@/types/primitives";

/**
 * A captured "design unit" — one or more selected layers treated as a single
 * tileable design. Children are stored as deep clones with their geometry
 * relative to the unit's axis-aligned bounding box, so an instance can be
 * re-emitted anywhere at any uniform scale while preserving internal layout.
 *
 * Assets are referenced by id only — never duplicated. Every emitted copy
 * points at the same `assetId`, so N copies of an image add N layers but 0
 * assets.
 */
export interface DesignUnit {
  id: string;
  /** Deep-cloned source layers (ids preserved here; re-id happens on emit). */
  layers: VisualLayer[];
  /** AABB of the selection in page px. */
  bboxPx: Rect;
  /** Per-layer geometry relative to bbox origin. */
  rel: DesignUnitChild[];
  /** Asset ids referenced by the unit (reused, never cloned). */
  assetIds: string[];
}

interface DesignUnitChild {
  /** Index into `DesignUnit.layers`. */
  index: number;
  relX: number;
  relY: number;
  width: number;
  height: number;
  rotation: number;
}

/** Fields whose value is another layer id and must be remapped on clone. */
type IdRefField = "parentId" | "textLayerId" | "maskId" | "targetLayerId";

function collectAssetIds(layer: VisualLayer): string[] {
  if (layer.type === "image") return [layer.assetId];
  if (layer.type === "frame" && layer.imageAssetId !== undefined) return [layer.imageAssetId];
  if (layer.type === "mask" && layer.assetId !== undefined) return [layer.assetId];
  return [];
}

/**
 * Snapshot the selected layers into a reusable design unit. Selection order
 * is irrelevant; layers keep their relative z-order via `zIndex`.
 */
export function captureDesignUnit(page: Page, selectedLayerIds: string[]): DesignUnit | null {
  const idSet = new Set(selectedLayerIds);
  const source = page.layers.filter((layer) => idSet.has(layer.id));
  if (source.length === 0) return null;

  const bboxPx = getSelectionBounds(page, selectedLayerIds);
  if (bboxPx.width <= 0 || bboxPx.height <= 0) return null;

  const layers = source.map((layer) => structuredClone(layer));
  const rel: DesignUnitChild[] = layers.map((layer, index) => ({
    index,
    relX: layer.x - bboxPx.x,
    relY: layer.y - bboxPx.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation
  }));
  const assetIds = [...new Set(layers.flatMap(collectAssetIds))];

  return { id: createId("sl_unit"), layers, bboxPx, rel, assetIds };
}

/** Whether this unit may be rotated 90° during layout (V1: single-layer only). */
export function unitSupportsRotation(unit: DesignUnit): boolean {
  return unit.layers.length === 1;
}

function scaleLayerProps(layer: VisualLayer, s: number): void {
  if (layer.type === "text") {
    layer.fontSize *= s;
    layer.letterSpacing *= s;
  }
  if (layer.type === "frame") {
    layer.padding *= s;
    if (typeof layer.cornerRadius === "number") layer.cornerRadius *= s;
    layer.contentTransform = {
      ...layer.contentTransform,
      offsetX: layer.contentTransform.offsetX * s,
      offsetY: layer.contentTransform.offsetY * s
    };
  }
  // Stroke width lives on several layer kinds.
  const withStroke = layer as { stroke?: { width: number } };
  if (withStroke.stroke && typeof withStroke.stroke.width === "number") {
    withStroke.stroke = { ...withStroke.stroke, width: withStroke.stroke.width * s };
  }
}

/**
 * Emit one instance of the unit, scaled uniformly to fit `cell` (letterboxed
 * + centred). When `rotated` is true the whole unit is turned 90° clockwise;
 * V1 only rotates single-layer units (guarded by `unitSupportsRotation`).
 *
 * Returns fresh, re-id'd layers ready to drop onto a page. `instanceIndex` and
 * `zBase` keep copies ordered and tagged for later cleanup/regeneration.
 */
export function emitUnitInstance(
  unit: DesignUnit,
  cell: Rect,
  rotated: boolean,
  zBase: number,
  instanceIndex: number
): VisualLayer[] {
  const unitW = unit.bboxPx.width;
  const unitH = unit.bboxPx.height;
  // Visual footprint after optional 90° turn.
  const footW = rotated ? unitH : unitW;
  const footH = rotated ? unitW : unitH;
  const s = Math.min(cell.width / footW, cell.height / footH);
  const offX = (cell.width - footW * s) / 2;
  const offY = (cell.height - footH * s) / 2;

  // Remap ids so internal references stay consistent within this instance.
  const idMap = new Map<string, string>();
  for (const layer of unit.layers) idMap.set(layer.id, createId(layer.type));

  const refFields: IdRefField[] = ["parentId", "textLayerId", "maskId", "targetLayerId"];

  return unit.rel.map((child, i) => {
    const clone = structuredClone(unit.layers[child.index]) as VisualLayer;
    clone.id = idMap.get(unit.layers[child.index].id) as string;
    clone.selected = false;

    // Remap any id references that point inside the unit.
    const refs = clone as unknown as Record<string, unknown>;
    for (const field of refFields) {
      const current = refs[field];
      if (typeof current === "string" && idMap.has(current)) {
        refs[field] = idMap.get(current);
      }
    }
    if (clone.type === "group") {
      clone.childIds = clone.childIds.map((cid) => idMap.get(cid) ?? cid);
    }

    scaleLayerProps(clone, s);
    clone.width = child.width * s;
    clone.height = child.height * s;

    if (!rotated) {
      clone.x = cell.x + offX + child.relX * s;
      clone.y = cell.y + offY + child.relY * s;
      clone.rotation = child.rotation;
    } else {
      // 90° clockwise turn of the unit about the cell. For single-layer units
      // the child top-left maps so the rotated rect lands inside the cell.
      // A rect at (x,y) rotated 90° cw about (x,y) spans [x-h, x] × [y, y+w].
      const ws = child.width * s;
      const hs = child.height * s;
      clone.x = cell.x + offX + hs;
      clone.y = cell.y + offY;
      clone.rotation = child.rotation + 90;
      // keep ws referenced for clarity; footprint already accounts for it
      void ws;
    }

    clone.zIndex = zBase + i;
    clone.metadata = {
      ...clone.metadata,
      smartLayoutUnitId: unit.id,
      smartLayoutInstance: instanceIndex
    };
    return clone;
  });
}

import { getTransformedBounds, hitTestLayers, rectsIntersect } from "@/core/bounds/bounds";
import type { Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import type { Rect } from "@/types/primitives";

export interface SelectionEngineState {
  selectedLayerIds: string[];
  focusedLayerId: string | null;
}

export interface SelectionOptions {
  includeLocked?: boolean;
  includeHidden?: boolean;
  additive?: boolean;
}

export function createSelectionState(ids: string[] = []): SelectionEngineState {
  return {
    selectedLayerIds: unique(ids),
    focusedLayerId: ids[0] ?? null
  };
}

export function selectSingle(page: Page, layerId: string | null, options: SelectionOptions = {}): SelectionEngineState {
  if (layerId === null) {
    return createSelectionState();
  }
  const layer = page.layers.find((item) => item.id === layerId);
  if (layer === undefined || !isSelectable(layer, options)) {
    return createSelectionState();
  }
  return {
    selectedLayerIds: [layer.id],
    focusedLayerId: layer.id
  };
}

export function selectMany(page: Page, layerIds: string[], options: SelectionOptions = {}): SelectionEngineState {
  const allowed = new Set(page.layers.filter((layer) => isSelectable(layer, options)).map((layer) => layer.id));
  const selectedLayerIds = unique(layerIds.filter((id) => allowed.has(id)));
  return {
    selectedLayerIds,
    focusedLayerId: selectedLayerIds[0] ?? null
  };
}

export function toggleSelection(page: Page, state: SelectionEngineState, layerId: string, options: SelectionOptions = {}): SelectionEngineState {
  const layer = page.layers.find((item) => item.id === layerId);
  if (layer === undefined || !isSelectable(layer, options)) {
    return state;
  }
  const set = new Set(state.selectedLayerIds);
  if (set.has(layerId)) {
    set.delete(layerId);
  } else {
    set.add(layerId);
  }
  return createSelectionState([...set]);
}

export function marqueeSelect(page: Page, rect: Rect, options: SelectionOptions = {}): SelectionEngineState {
  const ids = page.layers
    .filter((layer) => isSelectable(layer, options) && rectsIntersect(getTransformedBounds(layer), rect))
    .sort((a, b) => b.zIndex - a.zIndex)
    .map((layer) => layer.id);
  return createSelectionState(ids);
}

export function selectAtPoint(page: Page, point: { x: number; y: number }, options: SelectionOptions = {}): SelectionEngineState {
  const layer = hitTestLayers(point, page.layers, options);
  return selectSingle(page, layer?.id ?? null, options);
}

export function getSelectionBounds(page: Page, selectedLayerIds: string[]): Rect {
  const idSet = new Set(selectedLayerIds);
  const rects = page.layers.filter((layer) => idSet.has(layer.id)).map(getTransformedBounds);
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function isSelectable(layer: VisualLayer, options: SelectionOptions): boolean {
  if (!options.includeHidden && !layer.visible) return false;
  if (!options.includeLocked && layer.locked) return false;
  return true;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

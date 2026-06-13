/**
 * The unified projection: every edit affecting a layer, from every registered
 * source, as one flat ordered list. This is what the Layer Edits panel renders
 * and what the layer-row indicator counts.
 */

import { getLayerEditAdapters } from "@/core/layerEdits/registry";
import type { VisualLayer } from "@/types/layers";
import type { LayerEditDescriptor } from "@/core/layerEdits/types";

export function collectLayerEdits(layer: VisualLayer): LayerEditDescriptor[] {
  const out: LayerEditDescriptor[] = [];
  for (const adapter of getLayerEditAdapters()) {
    out.push(...adapter.collect(layer));
  }
  return out;
}

/** Number of edits affecting a layer (for the compact layer-row indicator). */
export function countLayerEdits(layer: VisualLayer): number {
  return collectLayerEdits(layer).length;
}

/** Whether any listed edit is currently disabled (panel "before/after-ish" hint). */
export function hasDisabledLayerEdits(layer: VisualLayer): boolean {
  return collectLayerEdits(layer).some((edit) => !edit.enabled);
}

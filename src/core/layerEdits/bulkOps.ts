/**
 * Bulk operations over all edits of a layer, composed from the per-edit adapter
 * transforms so they stay generic and produce a single next-layer (one undo
 * record when committed via updateLayer). Shared by the panel footer and the
 * layer context menu.
 */

import { collectLayerEdits } from "@/core/layerEdits/collectLayerEdits";
import { getLayerEditAdapter } from "@/core/layerEdits/registry";
import type { VisualLayer } from "@/types/layers";

/** Disable every edit on the layer (or re-enable all when all are already off). */
export function setAllLayerEditsEnabled<T extends VisualLayer>(layer: T, enabled: boolean): T {
  let next: VisualLayer = layer;
  for (const edit of collectLayerEdits(layer)) {
    if (!edit.capabilities.toggle) continue;
    const adapter = getLayerEditAdapter(edit.source);
    if (adapter !== undefined) next = adapter.setEnabled(next, edit.id, enabled);
  }
  return next as T;
}

/** Reset/remove every edit on the layer back to neutral. */
export function resetAllLayerEdits<T extends VisualLayer>(layer: T): T {
  let next: VisualLayer = layer;
  for (const edit of collectLayerEdits(layer)) {
    const adapter = getLayerEditAdapter(edit.source);
    if (adapter !== undefined) next = adapter.reset(next, edit.id);
  }
  return next as T;
}

import { useMemo } from "react";
import { collectLayerEdits, resolveEffectiveLayer } from "@/core/layerEdits";
import { useLayerEditsPreviewStore } from "@/state/layerEditsPreviewStore";
import type { VisualLayer } from "@/types/layers";

/**
 * The render-only projection of a layer with its muted edits neutralized.
 * Muted = persisted `editState.disabled` ∪ the transient before/after preview.
 *
 * IMPORTANT: use the returned layer ONLY for deriving visual output (Konva
 * filters / effect props). NEVER feed it into onChange / persistence — that
 * would write the neutralized (hidden) values back into the document. Returns the
 * SAME reference when nothing is muted, so render identity stays stable.
 */
export function useEffectiveRenderLayer<T extends VisualLayer>(layer: T): T {
  const previewLayerId = useLayerEditsPreviewStore((s) => s.previewLayerId);
  const mode = useLayerEditsPreviewStore((s) => s.mode);
  const mutedEditIds = useLayerEditsPreviewStore((s) => s.mutedEditIds);

  return useMemo(() => {
    const muted = new Set<string>(layer.editState?.disabled ?? []);
    if (previewLayerId === layer.id) {
      if (mode === "all-off") for (const edit of collectLayerEdits(layer)) muted.add(edit.id);
      for (const id of mutedEditIds) muted.add(id);
    }
    return resolveEffectiveLayer(layer, muted);
  }, [layer, previewLayerId, mode, mutedEditIds]);
}

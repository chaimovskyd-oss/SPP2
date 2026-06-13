/**
 * Adapter for the legacy flat `effects: ImageLayerEffects` object on image
 * layers (brightness, contrast, sepia, invert, shadow, outline, …). These have
 * no native per-edit `enabled` flag, so hide/show is persisted in
 * `layer.editState.disabled` and applied at render time by `resolveEffectiveLayer`
 * (the stored value is preserved, so re-enabling restores the exact result).
 *
 * Descriptor id = `legacy:<effectsKey>` (see legacyEditKeys.ts).
 */

import { LEGACY_EDIT_DEFS, getLegacyEditDef } from "@/core/layerEdits/legacyEditKeys";
import { isEditDisabled, withEditDisabled } from "@/core/layerEdits/editState";
import type { ImageLayer, VisualLayer } from "@/types/layers";
import type { LayerEditAdapter, LayerEditDescriptor } from "@/core/layerEdits/types";

function asImageLayer(layer: VisualLayer): ImageLayer | undefined {
  return layer.type === "image" ? (layer as ImageLayer) : undefined;
}

export const legacyEffectAdapter: LayerEditAdapter = {
  source: "legacyEffect",

  collect(layer: VisualLayer): LayerEditDescriptor[] {
    const image = asImageLayer(layer);
    if (image === undefined) return [];
    const fx = image.effects;
    const out: LayerEditDescriptor[] = [];
    for (const def of LEGACY_EDIT_DEFS) {
      if (!def.isActive(fx)) continue;
      out.push({
        id: def.id,
        source: "legacyEffect",
        label: def.label,
        summary: def.summary(fx),
        enabled: !isEditDisabled(layer, def.id),
        capabilities: { toggle: true, reset: true, remove: false, reorder: false }
      });
    }
    return out;
  },

  setEnabled(layer: VisualLayer, editId: string, enabled: boolean): VisualLayer {
    return withEditDisabled(layer, editId, !enabled);
  },

  reset(layer: VisualLayer, editId: string): VisualLayer {
    const image = asImageLayer(layer);
    const def = getLegacyEditDef(editId);
    if (image === undefined || def === undefined) return layer;
    // Neutralize the stored value AND clear any persisted "disabled" entry.
    const next = withEditDisabled(image, editId, false);
    return { ...next, effects: { ...next.effects, ...def.neutralPatch() } };
  }
};

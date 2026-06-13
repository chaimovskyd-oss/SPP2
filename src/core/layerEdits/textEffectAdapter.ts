/**
 * Adapter for text-layer visual edits: drop shadow, stroke, gradient fill, warp
 * and arc. Like legacy effects these have no native `enabled` flag, so hide/show
 * is persisted in `layer.editState.disabled` and applied by `resolveEffectiveLayer`.
 *
 * Descriptor id = `text:<field>`.
 */

import { isEditDisabled, withEditDisabled } from "@/core/layerEdits/editState";
import type { TextLayer, VisualLayer } from "@/types/layers";
import type { LayerEditAdapter, LayerEditDescriptor } from "@/core/layerEdits/types";

export const TEXT_EDIT_PREFIX = "text:";

interface TextEditDef {
  id: string;
  label: string;
  isActive: (layer: TextLayer) => boolean;
  /** Patch that resets ONLY this edit back to neutral. */
  neutralPatch: (layer: TextLayer) => Partial<TextLayer>;
}

export const TEXT_EDIT_DEFS: TextEditDef[] = [
  {
    id: `${TEXT_EDIT_PREFIX}shadow`,
    label: "צל טקסט",
    isActive: (l) => l.shadow !== undefined,
    neutralPatch: () => ({ shadow: undefined })
  },
  {
    id: `${TEXT_EDIT_PREFIX}stroke`,
    label: "מתאר טקסט",
    isActive: (l) => l.stroke !== undefined && l.stroke.width > 0,
    neutralPatch: () => ({ stroke: undefined })
  },
  {
    id: `${TEXT_EDIT_PREFIX}gradient`,
    label: "מילוי גרדיאנט",
    isActive: (l) => l.gradient !== undefined,
    neutralPatch: () => ({ gradient: undefined })
  },
  {
    id: `${TEXT_EDIT_PREFIX}warp`,
    label: "עיוות (Warp)",
    isActive: (l) => l.warpSettings?.enabled === true,
    neutralPatch: (l) => ({ warpSettings: { ...l.warpSettings, enabled: false } })
  },
  {
    id: `${TEXT_EDIT_PREFIX}arc`,
    label: "קשת (Arc)",
    isActive: (l) => l.arcSettings?.enabled === true,
    neutralPatch: (l) => (l.arcSettings === undefined ? {} : { arcSettings: { ...l.arcSettings, enabled: false } })
  }
];

const DEF_BY_ID = new Map(TEXT_EDIT_DEFS.map((def) => [def.id, def]));

export function getTextEditDef(id: string): TextEditDef | undefined {
  return DEF_BY_ID.get(id);
}

function asTextLayer(layer: VisualLayer): TextLayer | undefined {
  return layer.type === "text" ? (layer as TextLayer) : undefined;
}

export const textEffectAdapter: LayerEditAdapter = {
  source: "textEffect",

  collect(layer: VisualLayer): LayerEditDescriptor[] {
    const text = asTextLayer(layer);
    if (text === undefined) return [];
    const out: LayerEditDescriptor[] = [];
    for (const def of TEXT_EDIT_DEFS) {
      if (!def.isActive(text)) continue;
      out.push({
        id: def.id,
        source: "textEffect",
        label: def.label,
        summary: "",
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
    const text = asTextLayer(layer);
    const def = getTextEditDef(editId);
    if (text === undefined || def === undefined) return layer;
    const next = withEditDisabled(text, editId, false);
    return { ...next, ...def.neutralPatch(next) } as VisualLayer;
  }
};

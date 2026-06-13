/**
 * Adapter for the `visualEffects` stack (stroke / drop shadow / glow / overlay /
 * gradient / soft edge). Present on image, frame, shape and mask layers.
 *
 * Descriptor id = the VisualEffect's own `id`.
 */

import { VISUAL_EFFECT_LABELS, type VisualEffectStack } from "@/types/visualEffects";
import type { VisualLayer } from "@/types/layers";
import type { LayerEditAdapter, LayerEditDescriptor } from "@/core/layerEdits/types";

interface WithVisualEffects {
  visualEffects?: VisualEffectStack;
}

function getStack(layer: VisualLayer): VisualEffectStack | undefined {
  return (layer as VisualLayer & WithVisualEffects).visualEffects;
}

function setStack<T extends VisualLayer>(layer: T, stack: VisualEffectStack): T {
  return { ...layer, visualEffects: stack } as T;
}

export const visualEffectAdapter: LayerEditAdapter = {
  source: "visualEffect",

  collect(layer: VisualLayer): LayerEditDescriptor[] {
    const stack = getStack(layer);
    if (stack === undefined) return [];
    return stack.effects.map((effect) => ({
      id: effect.id,
      source: "visualEffect" as const,
      label: VISUAL_EFFECT_LABELS[effect.params.type] ?? effect.params.type,
      summary: "",
      enabled: effect.enabled,
      capabilities: { toggle: true, reset: true, remove: true, reorder: true }
    }));
  },

  setEnabled(layer: VisualLayer, editId: string, enabled: boolean): VisualLayer {
    const stack = getStack(layer);
    if (stack === undefined) return layer;
    return setStack(layer, {
      ...stack,
      effects: stack.effects.map((effect) => (effect.id === editId ? { ...effect, enabled } : effect))
    });
  },

  reset(layer: VisualLayer, editId: string): VisualLayer {
    return this.remove?.(layer, editId) ?? layer;
  },

  remove(layer: VisualLayer, editId: string): VisualLayer {
    const stack = getStack(layer);
    if (stack === undefined) return layer;
    return setStack(layer, { ...stack, effects: stack.effects.filter((effect) => effect.id !== editId) });
  }
};

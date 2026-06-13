/**
 * Adapter for the modern non-destructive `imageAdjustments` stack (basicTone,
 * color, curves, sepia, …) and the applied-preset groups that live alongside it.
 *
 * Descriptor ids:
 *  - manual adjustment → the adjustment's own `id`.
 *  - applied preset    → the AppliedPresetInstance `id`.
 */

import { ADJUSTMENT_LABELS, PARAM_CONFIG } from "@/ui/editor/adjustmentParamConfig";
import { IMAGE_ADJUSTMENT_DEFAULTS, type ImageAdjustment, type ImageAdjustmentStack } from "@/types/imageAdjustments";
import type { FrameLayer, ImageLayer, VisualLayer } from "@/types/layers";
import type { LayerEditAdapter, LayerEditDescriptor } from "@/core/layerEdits/types";

type AdjustableLayer = ImageLayer | FrameLayer;

function getStack(layer: VisualLayer): ImageAdjustmentStack | undefined {
  if (layer.type === "image" || layer.type === "frame") {
    return (layer as AdjustableLayer).imageAdjustments;
  }
  return undefined;
}

function setStack<T extends VisualLayer>(layer: T, stack: ImageAdjustmentStack): T {
  return { ...layer, imageAdjustments: stack } as T;
}

/** Concise human summary of an adjustment's non-neutral params, e.g. "קונטרסט +20". */
function summarize(adj: ImageAdjustment): string {
  const config = PARAM_CONFIG[adj.type];
  const defaults = IMAGE_ADJUSTMENT_DEFAULTS[adj.type] as unknown as Record<string, number> | undefined;
  if (config === undefined || config.length === 0 || defaults === undefined) return "";
  const parts: string[] = [];
  for (const slider of config) {
    const value = (adj as unknown as Record<string, number>)[slider.key];
    if (typeof value !== "number") continue;
    const neutral = defaults[slider.key] ?? 0;
    if (Math.abs(value - neutral) < 1e-6) continue;
    const shown = Number.isInteger(value) ? value : Number(value.toFixed(2));
    parts.push(`${slider.label} ${shown > neutral ? "+" : ""}${shown}`);
  }
  return parts.slice(0, 2).join(" · ");
}

export const imageAdjustmentAdapter: LayerEditAdapter = {
  source: "imageAdjustment",

  collect(layer: VisualLayer): LayerEditDescriptor[] {
    const stack = getStack(layer);
    if (stack === undefined) return [];
    const presets = stack.presetInstances ?? [];
    const generatedIds = new Set(presets.flatMap((p) => p.generatedAdjustments));
    const byId = new Map(stack.stack.map((adj) => [adj.id, adj]));
    const out: LayerEditDescriptor[] = [];

    // One row per applied preset (group header). enabled = any generated adj on.
    for (const preset of presets) {
      const anyEnabled = preset.generatedAdjustments.some((id) => byId.get(id)?.enabled === true);
      out.push({
        id: preset.id,
        source: "preset",
        label: "פריסט",
        summary: preset.name,
        enabled: anyEnabled,
        groupId: preset.id,
        groupLabel: preset.name,
        capabilities: { toggle: true, reset: false, remove: true, reorder: false }
      });
    }

    // Manual (non-preset) adjustments.
    for (const adj of stack.stack) {
      if (generatedIds.has(adj.id)) continue;
      out.push({
        id: adj.id,
        source: "imageAdjustment",
        label: ADJUSTMENT_LABELS[adj.type] ?? adj.type,
        summary: summarize(adj),
        enabled: adj.enabled,
        capabilities: { toggle: true, reset: true, remove: true, reorder: true }
      });
    }
    return out;
  },

  setEnabled(layer: VisualLayer, editId: string, enabled: boolean): VisualLayer {
    const stack = getStack(layer);
    if (stack === undefined) return layer;
    const preset = (stack.presetInstances ?? []).find((p) => p.id === editId);
    if (preset !== undefined) {
      const ids = new Set(preset.generatedAdjustments);
      return setStack(layer, {
        ...stack,
        stack: stack.stack.map((adj) => (ids.has(adj.id) ? ({ ...adj, enabled } as ImageAdjustment) : adj))
      });
    }
    return setStack(layer, {
      ...stack,
      stack: stack.stack.map((adj) => (adj.id === editId ? ({ ...adj, enabled } as ImageAdjustment) : adj))
    });
  },

  reset(layer: VisualLayer, editId: string): VisualLayer {
    return this.remove?.(layer, editId) ?? layer;
  },

  remove(layer: VisualLayer, editId: string): VisualLayer {
    const stack = getStack(layer);
    if (stack === undefined) return layer;
    const preset = (stack.presetInstances ?? []).find((p) => p.id === editId);
    if (preset !== undefined) {
      const generated = new Set(preset.generatedAdjustments);
      return setStack(layer, {
        ...stack,
        stack: stack.stack.filter((adj) => !generated.has(adj.id)),
        presetInstances: (stack.presetInstances ?? []).filter((p) => p.id !== editId)
      });
    }
    return setStack(layer, {
      ...stack,
      stack: stack.stack.filter((adj) => adj.id !== editId),
      presetInstances: (stack.presetInstances ?? []).map((p) => ({
        ...p,
        generatedAdjustments: p.generatedAdjustments.filter((id) => id !== editId)
      }))
    });
  }
};

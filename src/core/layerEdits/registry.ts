/**
 * Registry of Layer Edit adapters. Built-in adapters are registered at module
 * load; future tools (AI, autofix, new effect families) call
 * `registerLayerEditAdapter` to appear in the Layer Edits panel with no panel
 * changes — this is the genericity requirement.
 *
 * Order here is the display order in the panel (presets/adjustments first, then
 * effects, then text).
 */

import { imageAdjustmentAdapter } from "@/core/layerEdits/imageAdjustmentAdapter";
import { visualEffectAdapter } from "@/core/layerEdits/visualEffectAdapter";
import { legacyEffectAdapter } from "@/core/layerEdits/legacyEffectAdapter";
import { textEffectAdapter } from "@/core/layerEdits/textEffectAdapter";
import type { LayerEditAdapter, LayerEditSource } from "@/core/layerEdits/types";

const adapters: LayerEditAdapter[] = [
  imageAdjustmentAdapter,
  visualEffectAdapter,
  legacyEffectAdapter,
  textEffectAdapter
];

/** Register a new edit-source adapter (idempotent by `source`). */
export function registerLayerEditAdapter(adapter: LayerEditAdapter): void {
  const idx = adapters.findIndex((a) => a.source === adapter.source);
  if (idx >= 0) adapters[idx] = adapter;
  else adapters.push(adapter);
}

export function getLayerEditAdapters(): readonly LayerEditAdapter[] {
  return adapters;
}

export function getLayerEditAdapter(source: LayerEditSource): LayerEditAdapter | undefined {
  return adapters.find((a) => a.source === source);
}

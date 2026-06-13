/**
 * Unified "Layer Edits" model.
 *
 * SPP2 stores the visual edits that affect a layer across several unrelated
 * fields (`imageAdjustments`, `visualEffects`, legacy `effects`, text
 * shadow/stroke/…). The Layer Edits panel presents ALL of them as one flat,
 * uniform list without knowing about any specific field. Each edit-source is
 * described by a {@link LayerEditAdapter}; {@link collectLayerEdits} concatenates
 * every registered adapter's projection.
 *
 * Design rules:
 *  - Adapters are PURE. `collect` projects read-only descriptors; the mutators
 *    return the NEXT layer object (never touch the store) so the panel can commit
 *    any change through the single generic `updateLayer` action — reusing the
 *    existing undo/redo + save pipeline with zero duplicate state.
 *  - Each descriptor has a stable, source-defined `id` (see ID conventions in the
 *    individual adapters). The same id is what the user mutes and what
 *    `resolveEffectiveLayer` consults, so the panel, persistence and rendering
 *    all agree.
 */

import type { VisualLayer } from "@/types/layers";

export type LayerEditSource =
  | "preset"
  | "imageAdjustment"
  | "visualEffect"
  | "legacyEffect"
  | "textEffect";

export interface LayerEditCapabilities {
  /** Can be hidden/shown (persisted, undoable). */
  toggle: boolean;
  /** Can be reset to neutral (single edit). */
  reset: boolean;
  /** Can be removed entirely. */
  remove: boolean;
  /** Participates in drag-reorder (Phase 3). */
  reorder: boolean;
}

export interface LayerEditDescriptor {
  /** Stable id, unique within a layer. Persisted/muted/resolved by this id. */
  id: string;
  source: LayerEditSource;
  /** Localized (Hebrew-first) display name. */
  label: string;
  /** Short value summary, e.g. "ניגודיות +20". Empty string if not meaningful. */
  summary: string;
  /** Current effective on/off (persisted). */
  enabled: boolean;
  /** Preset instance id when this edit belongs to an applied preset group. */
  groupId?: string;
  /** Localized preset name, present on the preset's own header descriptor. */
  groupLabel?: string;
  capabilities: LayerEditCapabilities;
}

/**
 * A pure description of one edit-source. Mutators return the next layer; they
 * MUST NOT mutate `layer` in place and MUST NOT call the store.
 */
export interface LayerEditAdapter {
  source: LayerEditSource;
  /** Project this layer's edits from this source. Return [] when none. */
  collect(layer: VisualLayer): LayerEditDescriptor[];
  /** Return the layer with `editId` persisted-enabled set to `enabled`. */
  setEnabled(layer: VisualLayer, editId: string, enabled: boolean): VisualLayer;
  /** Return the layer with `editId` reset to neutral (kept in list if applicable). */
  reset(layer: VisualLayer, editId: string): VisualLayer;
  /** Return the layer with `editId` removed entirely. Optional. */
  remove?(layer: VisualLayer, editId: string): VisualLayer;
}

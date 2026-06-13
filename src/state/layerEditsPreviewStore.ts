import { create } from "zustand";

/**
 * TRANSIENT before/after preview for the Layer Edits panel. Deliberately lives
 * OUTSIDE the document store and history: it only ever HIDES edits for live
 * preview, never changes stored values, so it touches neither undo/redo, save,
 * nor export. Clearing it restores the exact prior result.
 *
 * Two independent mechanisms, scoped to a single layer at a time:
 *  - `mode: "all-off"` — whole-layer before/after (mute every edit on the layer).
 *  - `mutedEditIds`    — momentary per-edit "press to peek" hides (optional).
 *
 * The live render path (KonvaLayerNode → resolveEffectiveLayer) unions the active
 * preview ids with the layer's persisted `editState.disabled`.
 */
interface LayerEditsPreviewState {
  /** Layer the preview currently applies to (null = no preview active). */
  previewLayerId: string | null;
  /** "all-off" hides every edit on previewLayerId; null = per-edit only. */
  mode: "all-off" | null;
  /** Specific edit ids momentarily hidden (peek). */
  mutedEditIds: ReadonlySet<string>;
  /** Toggle whole-layer before/after for a layer. */
  toggleBeforeAfter: (layerId: string) => void;
  /** Momentarily hide / show one edit id for a layer. */
  setEditMuted: (layerId: string, editId: string, muted: boolean) => void;
  /** Clear all preview state (e.g. on selection change / panel close). */
  clear: () => void;
}

const EMPTY: ReadonlySet<string> = new Set();

export const useLayerEditsPreviewStore = create<LayerEditsPreviewState>((set, get) => ({
  previewLayerId: null,
  mode: null,
  mutedEditIds: EMPTY,
  toggleBeforeAfter: (layerId) =>
    set((state) => {
      const active = state.previewLayerId === layerId && state.mode === "all-off";
      if (active) return { previewLayerId: state.mutedEditIds.size > 0 ? layerId : null, mode: null };
      return { previewLayerId: layerId, mode: "all-off" };
    }),
  setEditMuted: (layerId, editId, muted) =>
    set((state) => {
      const sameLayer = state.previewLayerId === layerId;
      const base = sameLayer ? new Set(state.mutedEditIds) : new Set<string>();
      if (muted) base.add(editId);
      else base.delete(editId);
      const mode = sameLayer ? state.mode : null;
      if (base.size === 0 && mode === null) return { previewLayerId: null, mode: null, mutedEditIds: EMPTY };
      return { previewLayerId: layerId, mode, mutedEditIds: base };
    }),
  clear: () => {
    if (get().previewLayerId === null && get().mutedEditIds.size === 0) return;
    set({ previewLayerId: null, mode: null, mutedEditIds: EMPTY });
  }
}));

/**
 * The transient muted-id set to apply to `layerId` right now. Combine with the
 * layer's persisted `editState.disabled` in the render path. When `mode` is
 * "all-off" the caller should additionally mute every edit id (it has the layer
 * and can call collectLayerEdits); this helper returns only the explicit peeks.
 */
export function transientMutedIds(state: LayerEditsPreviewState, layerId: string): ReadonlySet<string> {
  return state.previewLayerId === layerId ? state.mutedEditIds : EMPTY;
}

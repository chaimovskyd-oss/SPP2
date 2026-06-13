/**
 * Auto Fix modal coordinator.
 *
 * A tiny global store (mirrors useAiToolsStore / useAiStyleStore) so the context
 * menu and the properties-panel button can open one shared Auto Fix modal
 * without prop-threading. `open` resolves the effective target layers: if the
 * clicked layer is part of a multi-selection, every selected image-bearing layer
 * is included so Auto Fix can be applied to all of them at once.
 */

import { create } from "zustand";
import { useDocumentStore } from "@/state/documentStore";
import { useSelectionStore } from "@/state/selectionStore";
import type { VisualLayer } from "@/types/layers";

export interface AutoFixTarget {
  pageId: string;
  layerIds: string[];
}

interface AutoFixStoreState {
  target: AutoFixTarget | null;
  open: (clickedLayerId: string) => void;
  close: () => void;
}

/** Layers Auto Fix can act on: image layers and frame cells holding an image. */
function isAutoFixable(layer: VisualLayer | undefined): boolean {
  if (layer === undefined) return false;
  return layer.type === "image" || (layer.type === "frame" && layer.imageAssetId !== undefined);
}

export const useAutoFixStore = create<AutoFixStoreState>((set) => ({
  target: null,
  open: (clickedLayerId) => {
    const { document, activePageId } = useDocumentStore.getState();
    if (document === null || activePageId === null) return;
    const page = document.pages.find((p) => p.id === activePageId);
    if (page === undefined) return;

    const byId = new Map(page.layers.map((l) => [l.id, l]));
    const selected = useSelectionStore.getState().selectedLayerIds;

    // When the clicked layer is part of the active selection, target every
    // auto-fixable layer in that selection; otherwise just the clicked one.
    const candidateIds =
      selected.includes(clickedLayerId) && selected.length > 1 ? selected : [clickedLayerId];
    const layerIds = candidateIds.filter((id) => isAutoFixable(byId.get(id)));
    if (layerIds.length === 0) return;

    set({ target: { pageId: activePageId, layerIds } });
  },
  close: () => set({ target: null })
}));

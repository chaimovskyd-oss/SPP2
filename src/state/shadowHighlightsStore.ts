/**
 * Shadow/Highlights editor coordinator.
 *
 * A tiny global store (mirrors useCurvesStore / useAutoFixStore) so the canvas
 * context menu and the inspector quick-controls can open one shared Shadow/
 * Highlights modal without prop threading. Targets a single image-bearing layer.
 */

import { create } from "zustand";
import { useDocumentStore } from "@/state/documentStore";
import type { VisualLayer } from "@/types/layers";

export interface ShadowHighlightsTarget {
  pageId: string;
  layerId: string;
}

interface ShadowHighlightsStoreState {
  target: ShadowHighlightsTarget | null;
  open: (layerId: string) => void;
  close: () => void;
}

/** Layers the editor can act on: image layers and image-bearing frames. */
function isAdjustable(layer: VisualLayer | undefined): boolean {
  if (layer === undefined) return false;
  return layer.type === "image" || (layer.type === "frame" && layer.imageAssetId !== undefined);
}

export const useShadowHighlightsStore = create<ShadowHighlightsStoreState>((set) => ({
  target: null,
  open: (layerId) => {
    const { document, activePageId } = useDocumentStore.getState();
    if (document === null || activePageId === null) return;
    const page = document.pages.find((p) => p.id === activePageId);
    if (page === undefined) return;
    const layer = page.layers.find((l) => l.id === layerId);
    if (!isAdjustable(layer)) return;
    set({ target: { pageId: activePageId, layerId } });
  },
  close: () => set({ target: null })
}));

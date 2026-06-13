/**
 * Curves editor coordinator.
 *
 * A tiny global store (mirrors useAutoFixStore) so the canvas context menu and
 * the Image Adjustments panel can open one shared Curves modal without prop
 * threading. The Curves editor targets a single image-bearing layer at a time.
 */

import { create } from "zustand";
import { useDocumentStore } from "@/state/documentStore";
import type { VisualLayer } from "@/types/layers";

export interface CurvesTarget {
  pageId: string;
  layerId: string;
}

interface CurvesStoreState {
  target: CurvesTarget | null;
  open: (layerId: string) => void;
  close: () => void;
}

/** Layers the Curves editor can act on: image layers and image-bearing frames. */
function isCurvable(layer: VisualLayer | undefined): boolean {
  if (layer === undefined) return false;
  return layer.type === "image" || (layer.type === "frame" && layer.imageAssetId !== undefined);
}

export const useCurvesStore = create<CurvesStoreState>((set) => ({
  target: null,
  open: (layerId) => {
    const { document, activePageId } = useDocumentStore.getState();
    if (document === null || activePageId === null) return;
    const page = document.pages.find((p) => p.id === activePageId);
    if (page === undefined) return;
    const layer = page.layers.find((l) => l.id === layerId);
    if (!isCurvable(layer)) return;
    set({ target: { pageId: activePageId, layerId } });
  },
  close: () => set({ target: null })
}));

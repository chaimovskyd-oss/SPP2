import { create } from "zustand";
import { defaultViewportState } from "@/core/defaults";
import type { ViewportState } from "@/types/primitives";

export interface ViewportStore extends ViewportState {
  setViewport: (patch: Partial<ViewportState>) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (zoom: number) => void;
  panBy: (dx: number, dy: number) => void;
  resetViewport: () => void;
  fitPage: () => void;
  fitWidth: () => void;
  actualSize: () => void;
  toggleRulers: () => void;
  toggleGrid: () => void;
  toggleGuides: () => void;
  toggleSnap: () => void;
}

export const useViewportStore = create<ViewportStore>((set) => ({
  ...defaultViewportState,
  setViewport: (patch) => set((state) => ({ ...state, ...patch })),
  zoomIn: () => set((state) => ({ zoom: clampZoom(state.zoom * 1.15), fitMode: "custom" })),
  zoomOut: () => set((state) => ({ zoom: clampZoom(state.zoom / 1.15), fitMode: "custom" })),
  setZoom: (zoom) => set({ zoom: clampZoom(zoom), fitMode: "custom" }),
  panBy: (dx, dy) => set((state) => ({ panX: state.panX + dx, panY: state.panY + dy, fitMode: "custom" })),
  resetViewport: () => set({ ...defaultViewportState }),
  fitPage: () => set({ zoom: 1, panX: 0, panY: 0, fitMode: "fitPage" }),
  fitWidth: () => set({ zoom: 1, panX: 0, panY: 0, fitMode: "fitWidth" }),
  actualSize: () => set({ zoom: 1, panX: 0, panY: 0, fitMode: "actualSize" }),
  toggleRulers: () => set((state) => ({ showRulers: !state.showRulers })),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleGuides: () => set((state) => ({ showGuides: !state.showGuides })),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled }))
}));

function clampZoom(zoom: number): number {
  return Math.max(0.05, Math.min(8, zoom));
}

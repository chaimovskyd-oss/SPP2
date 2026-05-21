import { create } from "zustand";
import { createSelectionState } from "@/core/selection/selectionEngine";

export interface SelectionState {
  selectedLayerIds: string[];
  layoutEditMode: boolean;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  resetSelection: () => void;
  enterLayoutEditMode: () => void;
  exitLayoutEditMode: () => void;
  toggleLayoutEditMode: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedLayerIds: [],
  layoutEditMode: false,
  setSelection: (ids) => set({ selectedLayerIds: createSelectionState(ids).selectedLayerIds }),
  clearSelection: () => set({ selectedLayerIds: createSelectionState().selectedLayerIds }),
  resetSelection: () => set({ selectedLayerIds: createSelectionState().selectedLayerIds, layoutEditMode: false }),
  enterLayoutEditMode: () => set({ layoutEditMode: true }),
  exitLayoutEditMode: () => set({ layoutEditMode: false }),
  toggleLayoutEditMode: () => set((state) => ({ layoutEditMode: !state.layoutEditMode }))
}));

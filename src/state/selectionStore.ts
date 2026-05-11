import { create } from "zustand";

export interface SelectionState {
  selectedLayerIds: string[];
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedLayerIds: [],
  setSelection: (ids) => set({ selectedLayerIds: [...new Set(ids)] }),
  clearSelection: () => set({ selectedLayerIds: [] })
}));

import { create } from "zustand";

interface MaskContentEditState {
  active: boolean;
  editingLayerId: string | null;
  enter: (layerId: string) => void;
  exit: () => void;
}

export const useMaskContentEditStore = create<MaskContentEditState>((set) => ({
  active: false,
  editingLayerId: null,
  enter: (layerId) => set({ active: true, editingLayerId: layerId }),
  exit: () => set({ active: false, editingLayerId: null })
}));

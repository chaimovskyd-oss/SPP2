import { create } from "zustand";

export interface AiStyleTarget {
  pageId: string;
  layerId: string;
}

interface AiStyleState {
  activeTarget: AiStyleTarget | null;
  processing: boolean;
  message: string | null;
  open: (target: AiStyleTarget) => void;
  close: () => void;
  setProcessing: (processing: boolean, message?: string | null) => void;
}

export const useAiStyleStore = create<AiStyleState>((set) => ({
  activeTarget: null,
  processing: false,
  message: null,
  open: (target) => set({ activeTarget: target, processing: false, message: null }),
  close: () => set({ activeTarget: null, processing: false, message: null }),
  setProcessing: (processing, message = null) => set({ processing, message }),
}));

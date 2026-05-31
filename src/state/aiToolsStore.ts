import { create } from "zustand";

export type AiTool = "expand" | "remove" | "upscale" | "restore";

export interface AiToolTarget {
  tool: AiTool;
  layerId: string;
  pageId: string;
}

interface AiToolsState {
  activeTarget: AiToolTarget | null;
  processing: boolean;
  progress: number;
  cancelController: AbortController | null;

  openTool: (target: AiToolTarget) => void;
  close: () => void;
  setProcessing: (processing: boolean, progress?: number) => void;
  setProgress: (pct: number) => void;
  setCancelController: (ctrl: AbortController | null) => void;
  cancel: () => void;
}

export const useAiToolsStore = create<AiToolsState>((set, get) => ({
  activeTarget: null,
  processing: false,
  progress: 0,
  cancelController: null,

  openTool: (target) =>
    set({ activeTarget: target, processing: false, progress: 0, cancelController: null }),

  close: () => {
    const { cancelController, processing } = get();
    if (processing && cancelController) cancelController.abort();
    set({ activeTarget: null, processing: false, progress: 0, cancelController: null });
  },

  setProcessing: (processing, progress = 0) => set({ processing, progress }),
  setProgress: (pct) => set({ progress: pct }),
  setCancelController: (ctrl) => set({ cancelController: ctrl }),

  cancel: () => {
    const { cancelController } = get();
    cancelController?.abort();
    set({ processing: false, progress: 0, cancelController: null });
  },
}));

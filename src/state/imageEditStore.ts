import { create } from "zustand";

export type ImageEditTool = "crop" | "eraser" | "white-bg" | "wand" | "rect-select";

export interface CropPreview {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionMask {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface ImageEditState {
  imageEditMode: boolean;
  editingLayerId: string | null;
  activeTool: ImageEditTool | null;

  cropLockRatio: boolean;
  cropPreview: CropPreview | null;

  eraserMode: "erase" | "restore";
  eraserSize: number;
  eraserFeather: number;
  eraserStrength: number;
  showMask: boolean;
  whiteBackgroundThreshold: number;

  wandTolerance: number;
  wandContiguous: boolean;
  selectionMask: SelectionMask | null;
  rectSelectPreview: { x: number; y: number; width: number; height: number } | null;

  enterImageEditMode: (layerId: string, initialCrop?: CropPreview) => void;
  exitImageEditMode: () => void;
  setActiveTool: (tool: ImageEditTool | null) => void;
  setCropLockRatio: (v: boolean) => void;
  setCropPreview: (crop: CropPreview | null) => void;
  setEraserMode: (mode: "erase" | "restore") => void;
  setEraserSize: (v: number) => void;
  setEraserFeather: (v: number) => void;
  setEraserStrength: (v: number) => void;
  setShowMask: (v: boolean) => void;
  setWhiteBackgroundThreshold: (v: number) => void;
  setWandTolerance: (v: number) => void;
  setWandContiguous: (v: boolean) => void;
  setSelectionMask: (mask: SelectionMask | null) => void;
  invertSelection: () => void;
  clearSelection: () => void;
  setRectSelectPreview: (rect: { x: number; y: number; width: number; height: number } | null) => void;
}

export const useImageEditStore = create<ImageEditState>((set) => ({
  imageEditMode: false,
  editingLayerId: null,
  activeTool: null,

  cropLockRatio: false,
  cropPreview: null,

  eraserMode: "erase",
  eraserSize: 30,
  eraserFeather: 0.3,
  eraserStrength: 1,
  showMask: false,
  whiteBackgroundThreshold: 22,

  wandTolerance: 30,
  wandContiguous: true,
  selectionMask: null,
  rectSelectPreview: null,

  enterImageEditMode: (layerId, initialCrop) =>
    set({
      imageEditMode: true,
      editingLayerId: layerId,
      activeTool: "crop",
      cropPreview: initialCrop ?? null,
      selectionMask: null
    }),
  exitImageEditMode: () =>
    set({
      imageEditMode: false,
      editingLayerId: null,
      activeTool: null,
      cropPreview: null,
      selectionMask: null
    }),
  setActiveTool: (tool) => set({ activeTool: tool, selectionMask: null }),
  setCropLockRatio: (v) => set({ cropLockRatio: v }),
  setCropPreview: (crop) => set({ cropPreview: crop }),
  setEraserMode: (mode) => set({ eraserMode: mode }),
  setEraserSize: (v) => set({ eraserSize: v }),
  setEraserFeather: (v) => set({ eraserFeather: v }),
  setEraserStrength: (v) => set({ eraserStrength: v }),
  setShowMask: (v) => set({ showMask: v }),
  setWhiteBackgroundThreshold: (v) => set({ whiteBackgroundThreshold: v }),
  setWandTolerance: (v) => set({ wandTolerance: v }),
  setWandContiguous: (v) => set({ wandContiguous: v }),
  setSelectionMask: (mask) => set({ selectionMask: mask }),
  invertSelection: () =>
    set((state) => {
      if (state.selectionMask === null) return {};
      const inv = new Uint8Array(state.selectionMask.data.length);
      for (let i = 0; i < inv.length; i++) {
        inv[i] = state.selectionMask.data[i] > 128 ? 0 : 255;
      }
      return { selectionMask: { ...state.selectionMask, data: inv } };
    }),
  clearSelection: () => set({ selectionMask: null, rectSelectPreview: null }),
  setRectSelectPreview: (rect) => set({ rectSelectPreview: rect })
}));

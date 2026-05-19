import { create } from "zustand";

export type ImageEditTool = "crop" | "eraser" | "white-bg" | "wand" | "rect-select" | "smart-select" | "brush-select";

export type SelectionBrushMode = "add" | "subtract";

export type SmartSelectionMode = "add" | "remove";
export type SmartSelectionSoftness = "sharp" | "natural" | "soft";
export type SmartSelectionStatus = "idle" | "preparing" | "ready" | "working" | "fallback" | "error";
export type SmartSelectionProgressPhase = "idle" | "download" | "prepare" | "encode" | "predict" | "refine" | "verify" | "ready" | string;

export interface SmartSelectionProgress {
  phase: SmartSelectionProgressPhase;
  message: string;
  percent?: number | null;
  modelId?: string;
  fileName?: string;
  bytesDone?: number | null;
  bytesTotal?: number | null;
  operation?: string;
}

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
  metadata?: {
    sourceImageHash?: string;
    modelId?: string;
    modelVersion?: string;
    profile?: SmartSelectionProfileLike;
    createdAt?: string;
    sourceWidth?: number;
    sourceHeight?: number;
  };
}

type SmartSelectionProfileLike = "quality" | "balanced" | "performance" | string;

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
  selectionHistory: SelectionMask[];
  rectSelectPreview: { x: number; y: number; width: number; height: number } | null;
  smartSelectionMode: SmartSelectionMode;
  smartSelectionSoftness: SmartSelectionSoftness;
  smartSelectionStatus: SmartSelectionStatus;
  smartSelectionMessage: string | null;
  smartSelectionProgress: SmartSelectionProgress | null;
  smartSelectionPrompts: SmartSelectionPrompt[];
  aiFillStatus: SmartSelectionStatus;
  aiFillMessage: string | null;
  aiFillProgress: SmartSelectionProgress | null;

  selectionBrushSize: number;
  selectionBrushMode: SelectionBrushMode;

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
  addToSelectionMask: (mask: SelectionMask) => void;
  undoSelectionStep: () => boolean;
  invertSelection: () => void;
  clearSelection: () => void;
  setRectSelectPreview: (rect: { x: number; y: number; width: number; height: number } | null) => void;
  setSmartSelectionMode: (mode: SmartSelectionMode) => void;
  setSmartSelectionSoftness: (softness: SmartSelectionSoftness) => void;
  setSmartSelectionStatus: (status: SmartSelectionStatus, message?: string | null) => void;
  setSmartSelectionProgress: (progress: SmartSelectionProgress | null) => void;
  addSmartSelectionPrompt: (prompt: SmartSelectionPrompt) => void;
  clearSmartSelectionPrompts: () => void;
  setAiFillStatus: (status: SmartSelectionStatus, message?: string | null) => void;
  setAiFillProgress: (progress: SmartSelectionProgress | null) => void;

  setSelectionBrushSize: (v: number) => void;
  setSelectionBrushMode: (mode: SelectionBrushMode) => void;
  subtractFromSelectionMask: (mask: SelectionMask) => void;
}

export type SmartSelectionPrompt =
  | { type: "point"; x: number; y: number; label: "positive" | "negative" }
  | { type: "box"; x: number; y: number; width: number; height: number };

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
  selectionHistory: [],
  rectSelectPreview: null,
  smartSelectionMode: "add",
  smartSelectionSoftness: "natural",
  smartSelectionStatus: "idle",
  smartSelectionMessage: null,
  smartSelectionProgress: null,
  smartSelectionPrompts: [],
  aiFillStatus: "idle",
  aiFillMessage: null,
  aiFillProgress: null,
  selectionBrushSize: 40,
  selectionBrushMode: "add",

  enterImageEditMode: (layerId, initialCrop) =>
    set({
      imageEditMode: true,
      editingLayerId: layerId,
      activeTool: "crop",
      cropPreview: initialCrop ?? null,
      selectionMask: null,
      selectionHistory: [],
      smartSelectionStatus: "idle",
      smartSelectionMessage: null,
      smartSelectionProgress: null,
      smartSelectionPrompts: [],
      aiFillStatus: "idle",
      aiFillMessage: null,
      aiFillProgress: null
    }),
  exitImageEditMode: () =>
    set({
      imageEditMode: false,
      editingLayerId: null,
      activeTool: null,
      cropPreview: null,
      selectionMask: null,
      selectionHistory: [],
      smartSelectionStatus: "idle",
      smartSelectionMessage: null,
      smartSelectionProgress: null,
      smartSelectionPrompts: [],
      aiFillStatus: "idle",
      aiFillMessage: null,
      aiFillProgress: null
    }),
  setActiveTool: (tool) => set({ activeTool: tool, selectionMask: null, selectionHistory: [], rectSelectPreview: null, smartSelectionProgress: null, smartSelectionPrompts: [], aiFillStatus: "idle", aiFillMessage: null, aiFillProgress: null }),
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
  setSelectionMask: (mask) =>
    set((state) => ({
      selectionMask: mask,
      selectionHistory: mask === null ? [] : [...state.selectionHistory, mask]
    })),
  addToSelectionMask: (mask) =>
    set((state) => {
      if (state.selectionMask === null || state.selectionMask.width !== mask.width || state.selectionMask.height !== mask.height) {
        return { selectionMask: mask, selectionHistory: [...state.selectionHistory, mask] };
      }
      const merged = new Uint8Array(mask.data.length);
      for (let i = 0; i < merged.length; i++) {
        merged[i] = state.selectionMask.data[i] > 128 || mask.data[i] > 128 ? 255 : 0;
      }
      const next = { ...mask, data: merged };
      return { selectionMask: next, selectionHistory: [...state.selectionHistory, next] };
    }),
  undoSelectionStep: () => {
    let didUndo = false;
    set((state) => {
      if (state.selectionHistory.length === 0) return {};
      didUndo = true;
      const nextHistory = state.selectionHistory.slice(0, -1);
      return {
        selectionHistory: nextHistory,
        selectionMask: nextHistory[nextHistory.length - 1] ?? null,
        smartSelectionPrompts: state.activeTool === "smart-select"
          ? state.smartSelectionPrompts.slice(0, -1)
          : state.smartSelectionPrompts
      };
    });
    return didUndo;
  },
  invertSelection: () =>
    set((state) => {
      if (state.selectionMask === null) return {};
      const inv = new Uint8Array(state.selectionMask.data.length);
      for (let i = 0; i < inv.length; i++) {
        inv[i] = state.selectionMask.data[i] > 128 ? 0 : 255;
      }
      const next = { ...state.selectionMask, data: inv };
      return { selectionMask: next, selectionHistory: [...state.selectionHistory, next] };
    }),
  clearSelection: () => set({ selectionMask: null, selectionHistory: [], rectSelectPreview: null, smartSelectionProgress: null, smartSelectionPrompts: [] }),
  setRectSelectPreview: (rect) => set({ rectSelectPreview: rect }),
  setSmartSelectionMode: (mode) => set({ smartSelectionMode: mode }),
  setSmartSelectionSoftness: (softness) => set({ smartSelectionSoftness: softness }),
  setSmartSelectionStatus: (status, message = null) => set({ smartSelectionStatus: status, smartSelectionMessage: message }),
  setSmartSelectionProgress: (progress) => set({ smartSelectionProgress: progress }),
  addSmartSelectionPrompt: (prompt) => set((state) => ({ smartSelectionPrompts: [...state.smartSelectionPrompts, prompt] })),
  clearSmartSelectionPrompts: () => set({ smartSelectionPrompts: [] }),
  setAiFillStatus: (status, message = null) => set({ aiFillStatus: status, aiFillMessage: message }),
  setAiFillProgress: (progress) => set({ aiFillProgress: progress }),
  setSelectionBrushSize: (v) => set({ selectionBrushSize: Math.max(2, Math.min(400, Math.round(v))) }),
  setSelectionBrushMode: (mode) => set({ selectionBrushMode: mode }),
  subtractFromSelectionMask: (mask) =>
    set((state) => {
      if (state.selectionMask === null || state.selectionMask.width !== mask.width || state.selectionMask.height !== mask.height) {
        return {};
      }
      const next = new Uint8Array(state.selectionMask.data.length);
      for (let i = 0; i < next.length; i++) {
        next[i] = state.selectionMask.data[i] > 128 && mask.data[i] <= 128 ? 255 : 0;
      }
      const merged = { ...state.selectionMask, data: next };
      return { selectionMask: merged, selectionHistory: [...state.selectionHistory, merged] };
    })
}));

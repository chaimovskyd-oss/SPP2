import { create } from "zustand";

export type DrawingTool =
  | "eyedropper"
  | "brush"
  | "bucket"
  | "shape"
  | "marquee"
  | "lasso"
  | "line"
  | "arrow";

export type BucketMode = "fill" | "contiguous";
export type ShapeKind = "rect" | "circle" | "ellipse" | "heart" | "line" | "arrow";

export interface DrawingToolsState {
  activeTool: DrawingTool | null;

  brushSize: number;
  brushHardness: number;
  brushOpacity: number;

  bucketMode: BucketMode;
  bucketTolerance: number;

  shapeKind: ShapeKind;

  setActiveTool: (tool: DrawingTool | null) => void;
  setBrushSize: (v: number) => void;
  setBrushHardness: (v: number) => void;
  setBrushOpacity: (v: number) => void;
  setBucketMode: (mode: BucketMode) => void;
  setBucketTolerance: (v: number) => void;
  setShapeKind: (kind: ShapeKind) => void;
  resetTools: () => void;
}

export const useDrawingToolsStore = create<DrawingToolsState>((set) => ({
  activeTool: null,
  brushSize: 24,
  brushHardness: 80,
  brushOpacity: 100,
  bucketMode: "contiguous",
  bucketTolerance: 32,
  shapeKind: "rect",

  setActiveTool: (tool) => set({ activeTool: tool }),
  setBrushSize: (v) => set({ brushSize: Math.max(1, Math.min(200, Math.round(v))) }),
  setBrushHardness: (v) => set({ brushHardness: Math.max(0, Math.min(100, Math.round(v))) }),
  setBrushOpacity: (v) => set({ brushOpacity: Math.max(0, Math.min(100, Math.round(v))) }),
  setBucketMode: (mode) => set({ bucketMode: mode }),
  setBucketTolerance: (v) => set({ bucketTolerance: Math.max(0, Math.min(255, Math.round(v))) }),
  setShapeKind: (kind) => set({ shapeKind: kind }),
  resetTools: () => set({ activeTool: null })
}));

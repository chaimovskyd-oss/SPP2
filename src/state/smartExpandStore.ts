import { create } from "zustand";

/** Outpaint the empty canvas area around a free-floating image layer. */
export interface SmartExpandCanvasTarget {
  kind: "canvas";
  layerId: string;
}

/** Expand a collage cell's image (content-aware fill) until its aspect matches
 *  the cell, so the whole image fits the cell with no cropping. */
export interface SmartExpandCellTarget {
  kind: "cell";
  layerId: string;
  ruleId: string;
  slotId: string;
  assetId: string;
  /** Target aspect ratio (cell width / cell height, in canvas px). */
  cellAspect: number;
}

export type SmartExpandTarget = SmartExpandCanvasTarget | SmartExpandCellTarget;

interface SmartExpandState {
  target: SmartExpandTarget | null;
  /** Page-sized tinted PNG marking the fill region, drawn on the canvas while the popup is open. */
  highlightDataUrl: string | null;
  open: (target: SmartExpandTarget) => void;
  setHighlight: (dataUrl: string | null) => void;
  close: () => void;
}

/**
 * Open/close coordinator for the Smart Canvas Fill ("הרחבה חכמה") popup, plus
 * the on-canvas highlight shared with CanvasStage. The popup owns the rest of
 * its transient state (model, progress, advanced options). Kept separate from
 * useAiToolsStore so the legacy "הרחבת תמונה" tool is untouched.
 */
export const useSmartExpandStore = create<SmartExpandState>((set) => ({
  target: null,
  highlightDataUrl: null,
  open: (target) => set({ target, highlightDataUrl: null }),
  setHighlight: (dataUrl) => set({ highlightDataUrl: dataUrl }),
  close: () => set({ target: null, highlightDataUrl: null }),
}));

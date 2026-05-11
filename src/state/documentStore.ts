import { create } from "zustand";
import { applyTextPresetToLayer, applyTextStylePatch, extractTextStylePatch } from "@/core/text/presets";
import { measureTextLayerSize } from "@/core/text/measurement";
import type { Asset, Document, Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import type { TextPreset, TextStylePatch } from "@/types/text";

export interface DocumentState {
  document: Document | null;
  activePageId: string | null;
  undoStack: Document[];
  redoStack: Document[];
  canUndo: boolean;
  canRedo: boolean;
  textStyleClipboard: TextStylePatch | null;
  setDocument: (document: Document) => void;
  clearDocument: () => void;
  setActivePage: (pageId: string) => void;
  addPage: (page: Page) => void;
  addAsset: (asset: Asset) => void;
  addLayer: (pageId: string, layer: VisualLayer) => void;
  addAssetAndLayer: (pageId: string, asset: Asset, layer: VisualLayer) => void;
  updateLayer: (pageId: string, layer: VisualLayer) => void;
  removeLayer: (pageId: string, layerId: string) => void;
  moveLayer: (pageId: string, layerId: string, direction: "forward" | "backward" | "front" | "back") => void;
  reorderLayers: (pageId: string, layerIdsTopToBottom: string[]) => void;
  updateTextLayer: (pageId: string, layerId: string, patch: Partial<Extract<VisualLayer, { type: "text" }>>) => void;
  applyTextPreset: (pageId: string, layerId: string, preset: TextPreset) => void;
  copyTextStyle: (pageId: string, layerId: string) => void;
  pasteTextStyle: (pageId: string, layerIds: string[]) => void;
  undo: () => void;
  redo: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  document: null,
  activePageId: null,
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,
  textStyleClipboard: null,
  setDocument: (document) =>
    set({
      document,
      activePageId: document.pages[0]?.id ?? null,
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      textStyleClipboard: null
    }),
  clearDocument: () =>
    set({
      document: null,
      activePageId: null,
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      textStyleClipboard: null
    }),
  setActivePage: (pageId) => set({ activePageId: pageId }),
  addPage: (page) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        pages: [...state.document.pages, page]
      }, page.id);
    }),
  addAsset: (asset) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        assets: [...state.document.assets, asset]
      });
    }),
  addLayer: (pageId, layer) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        pages: state.document.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                layers: [...page.layers, layer]
              }
            : page
        )
      });
    }),
  addAssetAndLayer: (pageId, asset, layer) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        assets: [...state.document.assets, asset],
        pages: state.document.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                layers: [...page.layers, layer]
              }
            : page
        )
      });
    }),
  updateLayer: (pageId, layer) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        pages: state.document.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                layers: page.layers.map((existing) => (existing.id === layer.id ? layer : existing))
              }
            : page
        )
      });
    }),
  removeLayer: (pageId, layerId) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        pages: state.document.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                layers: page.layers.filter((layer) => layer.id !== layerId)
              }
            : page
        )
      });
    }),
  moveLayer: (pageId, layerId, direction) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        pages: state.document.pages.map((page) => {
          if (page.id !== pageId) {
            return page;
          }
          return {
            ...page,
            layers: moveLayerByDirection(page.layers, layerId, direction)
          };
        })
      });
    }),
  reorderLayers: (pageId, layerIdsTopToBottom) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        pages: state.document.pages.map((page) => {
          if (page.id !== pageId) {
            return page;
          }
          return {
            ...page,
            layers: reorderLayersByVisualOrder(page.layers, layerIdsTopToBottom)
          };
        })
      });
    }),
  updateTextLayer: (pageId, layerId, patch) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        pages: state.document.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                layers: page.layers.map((layer) =>
                  layer.id === layerId && layer.type === "text" ? { ...layer, ...patch } : layer
                )
              }
            : page
        )
      });
    }),
  applyTextPreset: (pageId, layerId, preset) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        pages: state.document.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                layers: page.layers.map((layer) =>
                  layer.id === layerId && layer.type === "text" ? withMeasuredTextLayerSize(applyTextPresetToLayer(layer, preset)) : layer
                )
              }
            : page
        )
      });
    }),
  copyTextStyle: (pageId, layerId) =>
    set((state) => {
      const layer = state.document?.pages
        .find((page) => page.id === pageId)
        ?.layers.find((item) => item.id === layerId);
      if (layer?.type !== "text") {
        return state;
      }
      return {
        textStyleClipboard: extractTextStylePatch(layer)
      };
    }),
  pasteTextStyle: (pageId, layerIds) =>
    set((state) => {
      if (state.document === null || state.textStyleClipboard === null) {
        return state;
      }
      const targetIds = new Set(layerIds);
      return commitDocumentChange(state, {
        ...state.document,
        modifiedAt: new Date().toISOString(),
        pages: state.document.pages.map((page) =>
          page.id === pageId
            ? {
                ...page,
                layers: page.layers.map((layer) =>
                  targetIds.has(layer.id) && layer.type === "text"
                    ? withMeasuredTextLayerSize(applyTextStylePatch(layer, state.textStyleClipboard as TextStylePatch))
                    : layer
                )
              }
            : page
        )
      });
    }),
  undo: () =>
    set((state) => {
      const previous = state.undoStack.at(-1);
      if (previous === undefined || state.document === null) {
        return state;
      }
      const undoStack = state.undoStack.slice(0, -1);
      const redoStack = [...state.redoStack, state.document];
      return {
        document: previous,
        activePageId: previous.pages[0]?.id ?? null,
        undoStack,
        redoStack,
        canUndo: undoStack.length > 0,
        canRedo: true
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.redoStack.at(-1);
      if (next === undefined || state.document === null) {
        return state;
      }
      const redoStack = state.redoStack.slice(0, -1);
      const undoStack = [...state.undoStack, state.document];
      return {
        document: next,
        activePageId: next.pages[0]?.id ?? null,
        undoStack,
        redoStack,
        canUndo: true,
        canRedo: redoStack.length > 0
      };
    })
}));

function commitDocumentChange(
  state: DocumentState,
  document: Document,
  activePageId = state.activePageId
): Partial<DocumentState> {
  if (state.document === null) {
    return state;
  }
  const undoStack = [...state.undoStack, state.document].slice(-100);
  return {
    document,
    activePageId,
    undoStack,
    redoStack: [],
    canUndo: undoStack.length > 0,
    canRedo: false
  };
}

function withMeasuredTextLayerSize<T extends Extract<VisualLayer, { type: "text" }>>(layer: T): T {
  const size = measureTextLayerSize(layer);
  return {
    ...layer,
    width: size.width,
    height: size.height
  };
}

function moveLayerByDirection(
  layers: VisualLayer[],
  layerId: string,
  direction: "forward" | "backward" | "front" | "back"
): VisualLayer[] {
  const ordered = [...layers].sort((a, b) => a.zIndex - b.zIndex);
  const index = ordered.findIndex((layer) => layer.id === layerId);
  if (index < 0) {
    return layers;
  }

  const [layer] = ordered.splice(index, 1);
  if (layer === undefined) {
    return layers;
  }

  if (direction === "front") {
    ordered.push(layer);
  } else if (direction === "back") {
    ordered.unshift(layer);
  } else if (direction === "forward") {
    ordered.splice(Math.min(index + 1, ordered.length), 0, layer);
  } else {
    ordered.splice(Math.max(index - 1, 0), 0, layer);
  }

  return ordered.map((item, nextIndex) => ({
    ...item,
    zIndex: nextIndex
  }));
}

function reorderLayersByVisualOrder(layers: VisualLayer[], layerIdsTopToBottom: string[]): VisualLayer[] {
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const knownIds = new Set(layerIdsTopToBottom);
  const missingLayers = layers
    .filter((layer) => !knownIds.has(layer.id))
    .sort((a, b) => b.zIndex - a.zIndex);
  const topToBottom = [
    ...layerIdsTopToBottom.flatMap((layerId) => {
      const layer = layerById.get(layerId);
      return layer === undefined ? [] : [layer];
    }),
    ...missingLayers
  ];
  return topToBottom
    .reverse()
    .map((layer, nextIndex) => ({
      ...layer,
      zIndex: nextIndex
    }));
}

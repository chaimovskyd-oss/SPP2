import { create } from "zustand";
import {
  addAssetAction,
  addAssetAndLayerAction,
  addLayerAction,
  addPageAction,
  applyDocumentAction,
  changeLayerAction,
  changePageAction,
  createHistoryState,
  deleteLayerAction,
  deletePageAction,
  redoDocumentAction,
  reorderLayersAction,
  setFrameImageAction,
  undoDocumentAction,
  updateFrameContentAction,
  type DocumentAction,
  type HistoryState
} from "@/core/history/actions";
import { applyLinkedGroupPatch, withMemberOverride, removeLinkedGroupMember } from "@/core/layers/linkedGroups";
import { touchProjectMetadata } from "@/core/projectMetadata";
import { applyTextPresetToLayer, applyTextStylePatch, extractTextStylePatch } from "@/core/text/presets";
import { measureTextLayerSize } from "@/core/text/measurement";
import type { Asset, Document, Page } from "@/types/document";
import type { LinkedGroupPatch } from "@/core/layers/linkedGroups";
import type { ContentTransform, FrameLayer, LinkedGroup, VisualLayer } from "@/types/layers";
import type { TextPreset, TextStylePatch } from "@/types/text";

export interface DocumentState {
  document: Document | null;
  activePageId: string | null;
  history: HistoryState;
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
  meaningfulActionCount: number;
  lastMeaningfulActionType: string | null;
  textStyleClipboard: TextStylePatch | null;
  linkedGroups: LinkedGroup[];
  setDocument: (document: Document) => void;
  clearDocument: () => void;
  setActivePage: (pageId: string) => void;
  addPage: (page: Page) => void;
  duplicatePage: (pageId: string) => void;
  removePage: (pageId: string) => void;
  reorderPages: (pageIds: string[]) => void;
  updatePage: (page: Page) => void;
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
  updateFrameContent: (pageId: string, frameId: string, contentTransform: ContentTransform) => void;
  setFrameImage: (pageId: string, frameId: string, assetId: string) => void;
  setLinkedGroups: (groups: LinkedGroup[]) => void;
  applyLinkedGroupPatch: (pageId: string, groupId: string, patch: LinkedGroupPatch) => void;
  setGroupMemberOverride: (groupId: string, memberId: string, override: Partial<FrameLayer>) => void;
  removeGroupMember: (groupId: string, memberId: string) => void;
  addLinkedGroup: (group: LinkedGroup) => void;
  applyDocumentChange: (type: string, updater: (document: Document) => Document, activePageId?: string | null) => void;
  undo: () => void;
  redo: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  document: null,
  activePageId: null,
  history: createHistoryState(),
  canUndo: false,
  canRedo: false,
  revision: 0,
  meaningfulActionCount: 0,
  lastMeaningfulActionType: null,
  textStyleClipboard: null,
  linkedGroups: [],
  setDocument: (document) =>
    set({
      document,
      activePageId: document.pages[0]?.id ?? null,
      history: createHistoryState(),
      canUndo: false,
      canRedo: false,
      revision: 0,
      meaningfulActionCount: 0,
      lastMeaningfulActionType: null,
      textStyleClipboard: null
    }),
  clearDocument: () =>
    set({
      document: null,
      activePageId: null,
      history: createHistoryState(),
      canUndo: false,
      canRedo: false,
      revision: 0,
      meaningfulActionCount: 0,
      lastMeaningfulActionType: null,
      textStyleClipboard: null,
      linkedGroups: []
    }),
  setActivePage: (pageId) => set({ activePageId: pageId }),
  addPage: (page) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentAction(state, addPageAction(page), page.id);
    }),
  duplicatePage: (pageId) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const sourcePage = state.document.pages.find((page) => page.id === pageId);
      if (sourcePage === undefined) {
        return state;
      }
      const nextPage = {
        ...sourcePage,
        id: crypto.randomUUID(),
        metadata: {
          ...sourcePage.metadata,
          name: `${String(sourcePage.metadata.name ?? "Page")} copy`
        },
        layers: sourcePage.layers.map((layer) => ({
          ...layer,
          id: crypto.randomUUID()
        }))
      };
      return commitDocumentAction(state, addPageAction(nextPage), nextPage.id);
    }),
  removePage: (pageId) =>
    set((state) => {
      if (state.document === null || state.document.pages.length <= 1) {
        return state;
      }
      const sourcePage = state.document.pages.find((page) => page.id === pageId);
      if (sourcePage === undefined) {
        return state;
      }
      const nextActivePageId = state.document.pages.find((page) => page.id !== pageId)?.id ?? null;
      return commitDocumentAction(state, deletePageAction(sourcePage), nextActivePageId);
    }),
  reorderPages: (pageIds) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const pageById = new Map(state.document.pages.map((page) => [page.id, page]));
      const pages = pageIds.flatMap((pageId) => {
        const page = pageById.get(pageId);
        return page === undefined ? [] : [page];
      });
      if (pages.length !== state.document.pages.length) {
        return state;
      }
      return commitDocumentAction(state, createInlineAction("ReorderPagesAction", (document) => ({ ...document, pages }), (document) => ({ ...document, pages: state.document?.pages ?? document.pages })));
    }),
  updatePage: (page) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const previous = state.document.pages.find((existing) => existing.id === page.id);
      return previous === undefined ? state : commitDocumentAction(state, changePageAction(previous, page), page.id);
    }),
  addAsset: (asset) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentAction(state, addAssetAction(asset));
    }),
  addLayer: (pageId, layer) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentAction(state, addLayerAction(pageId, layer));
    }),
  addAssetAndLayer: (pageId, asset, layer) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentAction(state, addAssetAndLayerAction(pageId, asset, layer));
    }),
  updateLayer: (pageId, layer) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const previous = findLayer(state.document, pageId, layer.id);
      return previous === undefined ? state : commitDocumentAction(state, changeLayerAction(pageId, previous, layer, "ChangeLayerPropertyAction"));
    }),
  removeLayer: (pageId, layerId) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const previous = findLayer(state.document, pageId, layerId);
      return previous === undefined ? state : commitDocumentAction(state, deleteLayerAction(pageId, previous));
    }),
  moveLayer: (pageId, layerId, direction) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const page = state.document.pages.find((item) => item.id === pageId);
      if (page === undefined) {
        return state;
      }
      return commitDocumentAction(state, reorderLayersAction(pageId, page.layers, moveLayerByDirection(page.layers, layerId, direction)));
    }),
  reorderLayers: (pageId, layerIdsTopToBottom) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const page = state.document.pages.find((item) => item.id === pageId);
      if (page === undefined) {
        return state;
      }
      return commitDocumentAction(state, reorderLayersAction(pageId, page.layers, reorderLayersByVisualOrder(page.layers, layerIdsTopToBottom)));
    }),
  updateTextLayer: (pageId, layerId, patch) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const previous = findLayer(state.document, pageId, layerId);
      if (previous?.type !== "text") {
        return state;
      }
      return commitDocumentAction(state, changeLayerAction(pageId, previous, { ...previous, ...patch }, "ChangeTextLayerAction"));
    }),
  applyTextPreset: (pageId, layerId, preset) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const previous = findLayer(state.document, pageId, layerId);
      if (previous?.type !== "text") {
        return state;
      }
      return commitDocumentAction(state, changeLayerAction(pageId, previous, withMeasuredTextLayerSize(applyTextPresetToLayer(previous, preset)), "ApplyTextPresetAction"));
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
      const page = state.document.pages.find((item) => item.id === pageId);
      if (page === undefined) {
        return state;
      }
      const nextLayers = page.layers.map((layer) =>
        targetIds.has(layer.id) && layer.type === "text"
          ? withMeasuredTextLayerSize(applyTextStylePatch(layer, state.textStyleClipboard as TextStylePatch))
          : layer
      );
      return commitDocumentAction(state, reorderLayersAction(pageId, page.layers, nextLayers));
    }),
  updateFrameContent: (pageId, frameId, contentTransform) =>
    set((state) => {
      if (state.document === null) return state;
      const previous = findLayer(state.document, pageId, frameId);
      if (previous?.type !== "frame") return state;
      return commitDocumentAction(state, updateFrameContentAction(pageId, previous, contentTransform));
    }),
  setFrameImage: (pageId, frameId, assetId) =>
    set((state) => {
      if (state.document === null) return state;
      const previous = findLayer(state.document, pageId, frameId);
      if (previous?.type !== "frame") return state;
      const contentTransform = { version: 1 as const, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
      return commitDocumentAction(state, setFrameImageAction(pageId, previous, assetId, contentTransform));
    }),
  setLinkedGroups: (groups) => set({ linkedGroups: groups }),
  addLinkedGroup: (group) => set((state) => ({ linkedGroups: [...state.linkedGroups, group] })),
  applyDocumentChange: (type, updater, activePageId) =>
    set((state) => {
      if (state.document === null) return state;
      const before = state.document;
      const action = createInlineAction(type, updater, () => before);
      return commitDocumentAction(state, action, activePageId ?? state.activePageId);
    }),
  applyLinkedGroupPatch: (pageId, groupId, patch) =>
    set((state) => {
      if (state.document === null) return state;
      const group = state.linkedGroups.find((g) => g.id === groupId);
      if (group === undefined) return state;
      const page = state.document.pages.find((p) => p.id === pageId);
      if (page === undefined) return state;
      const nextLayers = applyLinkedGroupPatch(page.layers, group, patch);
      const before = page.layers;
      return commitDocumentAction(state, reorderLayersAction(pageId, before, nextLayers));
    }),
  setGroupMemberOverride: (groupId, memberId, override) =>
    set((state) => {
      const group = state.linkedGroups.find((g) => g.id === groupId);
      if (group === undefined) return state;
      const updated = withMemberOverride(group, memberId, override);
      return { linkedGroups: state.linkedGroups.map((g) => (g.id === groupId ? updated : g)) };
    }),
  removeGroupMember: (groupId, memberId) =>
    set((state) => {
      const group = state.linkedGroups.find((g) => g.id === groupId);
      if (group === undefined) return state;
      const updated = removeLinkedGroupMember(group, memberId);
      return { linkedGroups: state.linkedGroups.map((g) => (g.id === groupId ? updated : g)) };
    }),
  undo: () =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const result = undoDocumentAction(state.document, state.history);
      if (result === null) {
        return state;
      }
      return {
        document: result.document,
        activePageId: result.document.pages[0]?.id ?? null,
        history: result.history,
        canUndo: result.history.undoStack.length > 0,
        canRedo: result.history.redoStack.length > 0,
        revision: state.revision + 1,
        meaningfulActionCount: state.meaningfulActionCount + 1,
        lastMeaningfulActionType: "UndoAction"
      };
    }),
  redo: () =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      const result = redoDocumentAction(state.document, state.history);
      if (result === null) {
        return state;
      }
      return {
        document: result.document,
        activePageId: result.document.pages[0]?.id ?? null,
        history: result.history,
        canUndo: result.history.undoStack.length > 0,
        canRedo: result.history.redoStack.length > 0,
        revision: state.revision + 1,
        meaningfulActionCount: state.meaningfulActionCount + 1,
        lastMeaningfulActionType: "RedoAction"
      };
    })
}));

function commitDocumentAction(
  state: DocumentState,
  action: DocumentAction,
  activePageId = state.activePageId
): Partial<DocumentState> {
  if (state.document === null) {
    return state;
  }
  const result = applyDocumentAction(state.document, state.history, action);
  return {
    document: touchProjectMetadata(result.document),
    activePageId,
    history: result.history,
    canUndo: result.history.undoStack.length > 0,
    canRedo: result.history.redoStack.length > 0,
    revision: state.revision + 1,
    meaningfulActionCount: state.meaningfulActionCount + 1,
    lastMeaningfulActionType: action.type
  };
}

function createInlineAction(type: string, apply: DocumentAction["apply"], undo: DocumentAction["undo"]): DocumentAction {
  return {
    id: crypto.randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    apply: (document) => ({ ...apply(document), modifiedAt: new Date().toISOString() }),
    undo: (document) => ({ ...undo(document), modifiedAt: new Date().toISOString() })
  };
}

function findLayer(document: Document, pageId: string, layerId: string): VisualLayer | undefined {
  return document.pages.find((page) => page.id === pageId)?.layers.find((layer) => layer.id === layerId);
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

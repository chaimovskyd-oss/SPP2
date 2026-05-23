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
  resizeHistoryLimit,
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
import { createCollageImageAssignment, createCollageRule as collageRuleFactory } from "@/core/collage/collageFactory";
import { applyLayoutFamily, applyNewImagePool, mergeLiveFrameEditsIntoCollageRule, syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import { drainOverflow, pushOverflow, readOverflow, writeOverflow } from "@/core/reconcile";
import { syncClassPhotoToPage } from "@/core/classPhoto/classPhotoLayoutEngine";
import type { ClassPhotoPersonRecord, ClassPhotoFrameStyle, ClassPhotoLayoutSettings, ClassPhotoVisualBalanceSettings } from "@/types/classPhoto";
import type { TextStyle } from "@/types/template";
import { clampContentTransformToFillBounds } from "@/core/rendering/frameFitEngine";
import type { Asset, Document, Page } from "@/types/document";
import type { LinkedGroupPatch } from "@/core/layers/linkedGroups";
import type { ContentTransform, FrameLayer, LinkedGroup, VisualLayer } from "@/types/layers";
import type { TextPreset, TextStylePatch } from "@/types/text";
import type {
  CollageCanvasSettings,
  CollageEdgeConfig,
  CollageImageAssignment,
  CollageImageInput,
  CollageLayout,
  CollageLayoutFamily,
  CollageRule
} from "@/types/collage";
import type { ID } from "@/types/primitives";
import type { VisualEffectStack } from "@/types/visualEffects";
import { getDocumentDebugSummary, logPageSwitch } from "@/debug/sppDiagnostics";

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
  updateAsset: (asset: Asset) => void;
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
  setHistoryLimit: (limit: number) => void;
  undo: () => void;
  redo: () => void;
  // ─── Collage actions ─────────────────────────────────────────────────────
  /** Apply a new layout family AND remap assignments by index AND sync FrameLayers — one undoable op */
  applyCollageLayoutFamily: (ruleId: ID, family: CollageLayoutFamily, canvasW: number, canvasH: number) => void;
  createCollageRule: (pageId: ID, firstLayout: CollageLayout, assetIds: ID[]) => void;
  deleteCollageRule: (ruleId: ID) => void;
  setActiveCollageLayout: (ruleId: ID, layoutId: ID) => void;
  setCollageLayouts: (ruleId: ID, layouts: CollageLayout[]) => void;
  addImagesToCollage: (ruleId: ID, assetIds: ID[]) => void;
  removeImageFromCollage: (ruleId: ID, assetId: ID) => void;
  assignImageToSlot: (ruleId: ID, slotId: ID, assetId: ID) => void;
  removeImageFromSlot: (ruleId: ID, slotId: ID) => void;
  swapCollageImages: (ruleId: ID, slotIdA: ID, slotIdB: ID) => void;
  replaceCollageImage: (ruleId: ID, slotId: ID, newAssetId: ID) => void;
  updateCollageImageTransform: (ruleId: ID, slotId: ID, transform: ContentTransform) => void;
  updateCollageImageAdjustments: (ruleId: ID, slotId: ID, adjustments: Partial<CollageImageAssignment["colorAdjustments"]>) => void;
  updateCollageImageEditParams: (ruleId: ID, slotId: ID, params: Record<string, number>) => void;
  updateCollageImageEffects: (ruleId: ID, slotId: ID, effects: VisualEffectStack) => void;
  updateCollageEdgeConfig: (ruleId: ID, slotId: ID, edgeConfig: CollageEdgeConfig) => void;
  applyCollageEdgeConfigToAll: (ruleId: ID, edgeConfig: CollageEdgeConfig) => void;
  updateCollageCanvasSettings: (ruleId: ID, settings: Partial<CollageCanvasSettings>) => void;
  updateCollageCachedSlots: (ruleId: ID, newSlots: import("@/types/collage").CollageSlot[]) => void;
  // ─── Class Photo actions ──────────────────────────────────────────────────
  /** Regenerate the full layout from current rule settings — one undoable op */
  regenerateClassPhoto: (ruleId: ID) => void;
  /** Add person records (child or staff) and reflow */
  addPeopleToClassPhoto: (ruleId: ID, records: ClassPhotoPersonRecord[], assets: import("@/types/document").Asset[]) => void;
  /** Remove a person and compact the layout */
  removePersonFromClassPhoto: (ruleId: ID, personId: ID) => void;
  /** Update a person record (name, role, faceData, etc.) */
  updateClassPhotoPerson: (ruleId: ID, personId: ID, patch: Partial<ClassPhotoPersonRecord>) => void;
  /** Apply frame style changes to children or staff and reflow */
  updateClassPhotoFrameStyle: (ruleId: ID, target: "child" | "staff", style: ClassPhotoFrameStyle) => void;
  /** Update layout settings and reflow */
  updateClassPhotoLayoutSettings: (ruleId: ID, settings: Partial<ClassPhotoLayoutSettings>) => void;
  /** Update visual balance settings and reflow */
  updateClassPhotoVisualBalance: (ruleId: ID, settings: Partial<ClassPhotoVisualBalanceSettings>) => void;
  /** Update name text style for a group and push to text layers */
  updateClassPhotoNameTextStyle: (ruleId: ID, target: "child" | "staff", style: Partial<TextStyle>) => void;
  /** Update title or footer text */
  updateClassPhotoText: (ruleId: ID, field: "titleText" | "footerText", text: string) => void;
  /** Reorder person records (drag-reorder) */
  reorderClassPhotoPersons: (ruleId: ID, orderedIds: ID[]) => void;
  /**
   * Copy the text style from a selected text layer and apply it to an entire
   * group of class-photo text layers, then reflow.
   * target: "child" | "staff" | "all_names" | "title" | "footer" | "all"
   */
  applyClassPhotoTextStyleToGroup: (
    ruleId: ID,
    sourceLayerId: ID,
    pageId: ID,
    target: "child" | "staff" | "all_names" | "title" | "footer" | "all"
  ) => void;
}

function collageImageInputsFromAssets(assets: Asset[], assetIds: ID[]): CollageImageInput[] {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return assetIds.flatMap((assetId) => {
    const asset = byId.get(assetId);
    if (!asset) return [];
    const faceRegions = Array.isArray(asset.metadata.faceRegions)
      ? asset.metadata.faceRegions as CollageImageInput["faceRegions"]
      : undefined;
    const analysisScore = typeof asset.metadata.analysisScore === "number" ? asset.metadata.analysisScore : undefined;
    return [{
      assetId,
      width: asset.width ?? 800,
      height: asset.height ?? 600,
      faceRegions,
      analysisScore,
    }];
  });
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
  setActivePage: (pageId) =>
    set((state) => {
      if (state.activePageId !== pageId) {
        const activePage = state.document?.pages.find((page) => page.id === pageId) ?? null;
        logPageSwitch(state.activePageId, pageId, getDocumentDebugSummary(state.document, activePage, state.history));
      }
      return { activePageId: pageId };
    }),
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
      if (previous === undefined) return state;

      // If page geometry changed, re-sync any mode rules attached to this page
      // so collage/class-photo frames adapt to the new canvas size (instead of
      // staying stranded at the old absolute positions).
      const sizeChanged = previous.width !== page.width || previous.height !== page.height;
      let resolvedPage = page;
      let extraDocChange: ((doc: Document) => Document) | null = null;

      if (sizeChanged) {
        const collageRule = state.document.collageRules.find(r => r.pageId === page.id);
        if (collageRule) {
          const { page: synced } = syncFrameLayersToPage(page, collageRule, page.width, page.height);
          resolvedPage = synced;
        }
        const classPhotoRule = state.document.classPhotoRules?.find(r => r.pageId === page.id);
        if (classPhotoRule) {
          const synced = syncClassPhotoToPage(resolvedPage, classPhotoRule);
          resolvedPage = synced.page;
          const updatedRule = synced.rule;
          extraDocChange = (doc) => ({
            ...doc,
            classPhotoRules: (doc.classPhotoRules ?? []).map(r =>
              r.id === updatedRule.id ? updatedRule : r,
            ),
          });
        }
      }

      const baseAction = changePageAction(previous, resolvedPage);
      const composed = extraDocChange;
      const action = composed
        ? createInlineAction(
            "UpdatePageWithReflowAction",
            (doc) => composed(baseAction.apply(doc)),
            (doc) => baseAction.undo(doc),
          )
        : baseAction;
      return commitDocumentAction(state, action, page.id);
    }),
  addAsset: (asset) =>
    set((state) => {
      if (state.document === null) {
        return state;
      }
      return commitDocumentAction(state, addAssetAction(asset));
    }),
  updateAsset: (asset) =>
    get().applyDocumentChange("UPDATE_ASSET", (doc) => ({
      ...doc,
      assets: doc.assets.map((a) => (a.id === asset.id ? asset : a))
    })),
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
  setHistoryLimit: (limit) =>
    set((state) => {
      const history = resizeHistoryLimit(state.history, limit);
      return {
        history,
        canUndo: history.undoStack.length > 0,
        canRedo: history.redoStack.length > 0
      };
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
  // ─── Collage actions ─────────────────────────────────────────────────────
  applyCollageLayoutFamily: (ruleId, family, canvasW, canvasH) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.collageRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;

      const dpi = page.setup?.dpi ?? 300;

      // If the new family supports more images than the old, drain any
      // hidden overflow back into the pool before computing the layout.
      const baseRule = mergeLiveFrameEditsIntoCollageRule(rule, page);
      const prevOverflow = readOverflow(baseRule.metadata);
      let workingRule = baseRule;
      let nextOverflow = prevOverflow;
      if (prevOverflow.hidden.length > 0) {
        const probe = applyLayoutFamily(baseRule, family, canvasW, canvasH, dpi, collageImageInputsFromAssets(state.document.assets, baseRule.imagePool));
        const capacity = probe.cachedSlots.filter(s => s.type === "image").length;
        const drained = drainOverflow(baseRule.imagePool, prevOverflow, capacity);
        if (drained.drained.length > 0) {
          workingRule = { ...baseRule, imagePool: drained.pool };
          nextOverflow = drained.newOverflow;
        }
      }

      const computed = applyLayoutFamily(workingRule, family, canvasW, canvasH, dpi, collageImageInputsFromAssets(state.document.assets, workingRule.imagePool));
      const newRule = nextOverflow !== prevOverflow
        ? { ...computed, metadata: writeOverflow(computed.metadata, nextOverflow) }
        : computed;
      const { page: newPage, frameIds } = syncFrameLayersToPage(page, newRule, canvasW, canvasH);
      const finalRule = { ...newRule, frameIds };

      return commitDocumentAction(
        state,
        createInlineAction(
          "ApplyCollageLayoutFamilyAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p),
          }),
          (doc) => {
            // undo: restore original rule and re-sync frames
            const { page: origPage } = syncFrameLayersToPage(
              doc.pages.find((p) => p.id === rule.pageId) ?? page,
              baseRule,
              canvasW,
              canvasH
            );
            return {
              ...doc,
              collageRules: doc.collageRules.map((r) => r.id === ruleId ? baseRule : r),
              pages: doc.pages.map((p) => p.id === rule.pageId ? origPage : p),
            };
          }
        )
      );
    }),

  createCollageRule: (pageId, firstLayout, assetIds) =>
    set((state) => {
      if (state.document === null) return state;
      if (state.document.collageRules.some((r) => r.pageId === pageId)) {
        console.warn("createCollageRule: page already has a CollageRule");
        return state;
      }
      const rule = collageRuleFactory(pageId, firstLayout.family, firstLayout.slots, assetIds);
      return commitDocumentAction(
        state,
        createInlineAction(
          "CreateCollageRuleAction",
          (doc) => ({ ...doc, collageRules: [...doc.collageRules, rule] }),
          (doc) => ({ ...doc, collageRules: doc.collageRules.filter((r) => r.id !== rule.id) })
        )
      );
    }),

  deleteCollageRule: (ruleId) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.collageRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      return commitDocumentAction(
        state,
        createInlineAction(
          "DeleteCollageRuleAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.filter((r) => r.id !== ruleId),
            pages: doc.pages.map((p) =>
              p.id === rule.pageId
                ? { ...p, layers: p.layers.filter((l) => !rule.frameIds.includes(l.id)) }
                : p
            )
          }),
          (doc) => ({ ...doc, collageRules: [...doc.collageRules, rule] })
        )
      );
    }),

  setActiveCollageLayout: (_ruleId, _layoutId) => {
    // Deprecated: use applyCollageLayoutFamily instead
    console.warn("setActiveCollageLayout is deprecated — use applyCollageLayoutFamily");
  },

  setCollageLayouts: (_ruleId, _layouts) => {
    // Deprecated: use applyCollageLayoutFamily instead
    console.warn("setCollageLayouts is deprecated — use applyCollageLayoutFamily");
  },

  addImagesToCollage: (ruleId, assetIds) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.collageRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;

      const dpi = page.setup?.dpi ?? 300;
      const baseRule = mergeLiveFrameEditsIntoCollageRule(rule, page);
      const newPool = [...baseRule.imagePool, ...assetIds.filter((id) => !baseRule.imagePool.includes(id))];
      const newRule = applyNewImagePool(baseRule, newPool, page.width, page.height, dpi, collageImageInputsFromAssets(state.document.assets, newPool));
      const { page: newPage, frameIds } = syncFrameLayersToPage(page, newRule, page.width, page.height);
      const finalRule = { ...newRule, frameIds };

      return commitDocumentAction(
        state,
        createInlineAction(
          "AddImagesToCollageAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p),
          }),
          (doc) => {
            const { page: origPage } = syncFrameLayersToPage(
              doc.pages.find((p) => p.id === rule.pageId) ?? page,
              baseRule, page.width, page.height
            );
            return {
              ...doc,
              collageRules: doc.collageRules.map((r) => r.id === ruleId ? baseRule : r),
              pages: doc.pages.map((p) => p.id === rule.pageId ? origPage : p),
            };
          }
        )
      );
    }),

  removeImageFromCollage: (ruleId, assetId) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.collageRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;

      const dpi = page.setup?.dpi ?? 300;
      const baseRule = mergeLiveFrameEditsIntoCollageRule(rule, page);
      const newPool = baseRule.imagePool.filter((id) => id !== assetId);
      // Push the removed assetId to the rule's overflow pool. The asset isn't
      // deleted from the document — it stays available for re-drain when the
      // pool grows (e.g. layout family switch to a larger grid).
      const prevOverflow = readOverflow(baseRule.metadata);
      const { newOverflow } = pushOverflow(baseRule.imagePool, newPool, prevOverflow);
      const newRule = applyNewImagePool(baseRule, newPool, page.width, page.height, dpi, collageImageInputsFromAssets(state.document.assets, newPool));
      const { page: newPage, frameIds } = syncFrameLayersToPage(page, newRule, page.width, page.height);
      const finalRule = { ...newRule, frameIds, metadata: writeOverflow(newRule.metadata, newOverflow) };

      return commitDocumentAction(
        state,
        createInlineAction(
          "RemoveImageFromCollageAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p),
          }),
          (doc) => {
            const { page: origPage } = syncFrameLayersToPage(
              doc.pages.find((p) => p.id === rule.pageId) ?? page,
              baseRule, page.width, page.height
            );
            return {
              ...doc,
              collageRules: doc.collageRules.map((r) => r.id === ruleId ? baseRule : r),
              pages: doc.pages.map((p) => p.id === rule.pageId ? origPage : p),
            };
          }
        )
      );
    }),

  assignImageToSlot: (ruleId, slotId, assetId) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.collageRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const newAssignment = createCollageImageAssignment(ruleId, assetId, slotId);
      return commitDocumentAction(
        state,
        createInlineAction(
          "AssignImageToSlotAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) =>
              r.id === ruleId
                ? {
                    ...r,
                    imageAssignments: [
                      ...r.imageAssignments.filter((a) => a.slotId !== slotId),
                      newAssignment
                    ]
                  }
                : r
            )
          }),
          (doc) => {
            const prev = state.document!.collageRules.find((r) => r.id === ruleId);
            return {
              ...doc,
              collageRules: doc.collageRules.map((r) =>
                r.id === ruleId ? { ...r, imageAssignments: prev?.imageAssignments ?? r.imageAssignments } : r
              )
            };
          }
        )
      );
    }),

  removeImageFromSlot: (ruleId, slotId) =>
    set((state) => {
      if (state.document === null) return state;
      return commitDocumentAction(
        state,
        createInlineAction(
          "RemoveImageFromSlotAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) =>
              r.id === ruleId
                ? { ...r, imageAssignments: r.imageAssignments.filter((a) => a.slotId !== slotId) }
                : r
            )
          }),
          (doc) => {
            const prev = state.document!.collageRules.find((r) => r.id === ruleId);
            return {
              ...doc,
              collageRules: doc.collageRules.map((r) =>
                r.id === ruleId ? { ...r, imageAssignments: prev?.imageAssignments ?? r.imageAssignments } : r
              )
            };
          }
        )
      );
    }),

  swapCollageImages: (ruleId, slotIdA, slotIdB) =>
    set((state) => {
      if (state.document === null || slotIdA === slotIdB) return state;
      const rule = state.document.collageRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const assignA = rule.imageAssignments.find((a) => a.slotId === slotIdA);
      const assignB = rule.imageAssignments.find((a) => a.slotId === slotIdB);
      if (assignA === undefined || assignB === undefined) return state;

      // Keep non-null aliases for nested helper functions.
      // TypeScript does not reliably preserve narrowing for variables captured by closures.
      const swapA = assignA;
      const swapB = assignB;
      const resetContentTransform: ContentTransform = { version: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };

      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;

      // Swap assetIds in imagePool so that any layout rebuild (assignByPoolOrder) produces
      // the same slot→image mapping as the swap. Without this, re-flowing or changing the
      // layout type would undo the swap by re-mapping pool[i]→slot[i] in the original order.
      const newPool = [...rule.imagePool];
      const idxA = newPool.indexOf(swapA.assetId);
      const idxB = newPool.indexOf(swapB.assetId);
      if (idxA !== -1 && idxB !== -1) {
        newPool[idxA] = swapB.assetId;
        newPool[idxB] = swapA.assetId;
      }

      function swapAssignment(a: CollageImageAssignment): CollageImageAssignment {
        if (a.slotId === slotIdA) {
          return {
            ...a,
            assetId: swapB.assetId,
            contentTransform: resetContentTransform,
            fitMode: swapB.fitMode,
            colorAdjustments: swapB.colorAdjustments,
            visualEffects: swapB.visualEffects,
            edgeConfig: swapB.edgeConfig,
            hasManualCrop: swapB.hasManualCrop,
            hasManualTransform: false,
            imageEditParams: swapB.imageEditParams
          } as CollageImageAssignment;
        }
        if (a.slotId === slotIdB) {
          return {
            ...a,
            assetId: swapA.assetId,
            contentTransform: resetContentTransform,
            fitMode: swapA.fitMode,
            colorAdjustments: swapA.colorAdjustments,
            visualEffects: swapA.visualEffects,
            edgeConfig: swapA.edgeConfig,
            hasManualCrop: swapA.hasManualCrop,
            hasManualTransform: false,
            imageEditParams: swapA.imageEditParams
          } as CollageImageAssignment;
        }
        return a;
      }

      function syncLayerForSwap(layer: VisualLayer): VisualLayer {
        if (layer.type !== "frame") return layer;
        const meta = layer.metadata["collageFrame"] as { collageRuleId?: string; slotId?: string } | undefined;
        if (meta?.collageRuleId !== ruleId) return layer;
        if (meta.slotId === slotIdA) {
          return {
            ...layer,
            imageAssetId: swapB.assetId,
            contentTransform: resetContentTransform,
            fitMode: swapB.fitMode,
            visualEffects: swapB.visualEffects ?? layer.visualEffects,
            metadata: {
              ...layer.metadata,
              collageColorAdj: swapB.colorAdjustments as unknown as import("@/types/primitives").JsonValue,
              collageImageEditParams: swapB.imageEditParams as unknown as import("@/types/primitives").JsonValue,
              collageEdgeConfig: swapB.edgeConfig as unknown as import("@/types/primitives").JsonValue
            }
          } as VisualLayer;
        }
        if (meta.slotId === slotIdB) {
          return {
            ...layer,
            imageAssetId: swapA.assetId,
            contentTransform: resetContentTransform,
            fitMode: swapA.fitMode,
            visualEffects: swapA.visualEffects ?? layer.visualEffects,
            metadata: {
              ...layer.metadata,
              collageColorAdj: swapA.colorAdjustments as unknown as import("@/types/primitives").JsonValue,
              collageImageEditParams: swapA.imageEditParams as unknown as import("@/types/primitives").JsonValue,
              collageEdgeConfig: swapA.edgeConfig as unknown as import("@/types/primitives").JsonValue
            }
          } as VisualLayer;
        }
        return layer;
      }

      return commitDocumentAction(
        state,
        createInlineAction(
          "SwapCollageImagesAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) =>
              r.id === ruleId
                ? { ...r, imagePool: newPool, imageAssignments: r.imageAssignments.map(swapAssignment) }
                : r
            ),
            pages: doc.pages.map((p) =>
              p.id === rule.pageId ? { ...p, layers: p.layers.map(syncLayerForSwap) } : p
            )
          }),
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) =>
              r.id === ruleId
                ? { ...r, imagePool: rule.imagePool, imageAssignments: rule.imageAssignments }
                : r
            ),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  replaceCollageImage: (ruleId, slotId, newAssetId) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.collageRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const assignment = rule.imageAssignments.find((a) => a.slotId === slotId);
      if (!assignment) return state;
      const oldAssetId = assignment.assetId;
      const resetTransform: ContentTransform = { version: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };

      // Update imagePool so any future layout rebuild assigns the new asset to this slot's position
      const newPool = rule.imagePool.map((id) => id === oldAssetId ? newAssetId : id);

      return commitDocumentAction(
        state,
        createInlineAction(
          "ReplaceCollageImageAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) =>
              r.id === ruleId ? {
                ...r,
                imagePool: newPool,
                imageAssignments: r.imageAssignments.map((a) =>
                  a.slotId === slotId
                    ? { ...a, assetId: newAssetId, contentTransform: resetTransform, hasManualTransform: false }
                    : a
                )
              } : r
            ),
            pages: doc.pages.map((p) =>
              p.id === rule.pageId ? {
                ...p,
                layers: p.layers.map((layer) => {
                  if (layer.type !== "frame") return layer;
                  const meta = layer.metadata["collageFrame"] as { collageRuleId?: string; slotId?: string } | undefined;
                  if (meta?.collageRuleId !== ruleId || meta.slotId !== slotId) return layer;
                  return { ...layer, imageAssetId: newAssetId, contentTransform: resetTransform };
                })
              } : p
            )
          }),
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) =>
              r.id === ruleId
                ? { ...r, imagePool: rule.imagePool, imageAssignments: rule.imageAssignments }
                : r
            ),
            pages: doc.pages.map((p) =>
              p.id === rule.pageId ? {
                ...p,
                layers: p.layers.map((layer) => {
                  if (layer.type !== "frame") return layer;
                  const meta = layer.metadata["collageFrame"] as { collageRuleId?: string; slotId?: string } | undefined;
                  if (meta?.collageRuleId !== ruleId || meta.slotId !== slotId) return layer;
                  return { ...layer, imageAssetId: oldAssetId };
                })
              } : p
            )
          })
        )
      );
    }),

  updateCollageImageTransform: (ruleId, slotId, transform) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.collageRules.find((r) => r.id === ruleId);
      const previousTransform = rule?.imageAssignments.find((a) => a.slotId === slotId)?.contentTransform;
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateCollageImageTransformAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) =>
              r.id === ruleId
                ? {
                    ...r,
                    imageAssignments: r.imageAssignments.map((a) =>
                      a.slotId === slotId ? { ...a, contentTransform: transform, hasManualTransform: true } : a
                    )
                  }
                : r
            ),
            pages: doc.pages.map((p) => ({
              ...p,
              layers: p.layers.map((layer) => {
                if (layer.type !== "frame") return layer;
                const meta = layer.metadata["collageFrame"] as { collageRuleId?: string; slotId?: string } | undefined;
                if (meta?.collageRuleId !== ruleId || meta.slotId !== slotId) return layer;
                return { ...layer, contentTransform: transform };
              })
            }))
          }),
          (doc) => {
            const prev = state.document!.collageRules.find((r) => r.id === ruleId);
            return {
              ...doc,
              collageRules: doc.collageRules.map((r) =>
                r.id === ruleId ? { ...r, imageAssignments: prev?.imageAssignments ?? r.imageAssignments } : r
              ),
              pages: doc.pages.map((p) => ({
                ...p,
                layers: p.layers.map((layer) => {
                  if (layer.type !== "frame" || previousTransform === undefined) return layer;
                  const meta = layer.metadata["collageFrame"] as { collageRuleId?: string; slotId?: string } | undefined;
                  if (meta?.collageRuleId !== ruleId || meta.slotId !== slotId) return layer;
                  return { ...layer, contentTransform: previousTransform };
                })
              }))
            };
          }
        )
      );
    }),

  updateCollageImageAdjustments: (ruleId, slotId, adjustments) =>
    set((state) => {
      if (state.document === null) return state;
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateCollageImageAdjustmentsAction",
          (doc) => {
            // 1. Update the CollageRule assignment
            const updatedRules = doc.collageRules.map((r) =>
              r.id === ruleId
                ? {
                    ...r,
                    imageAssignments: r.imageAssignments.map((a) =>
                      a.slotId === slotId
                        ? { ...a, colorAdjustments: { ...a.colorAdjustments, ...adjustments } }
                        : a
                    )
                  }
                : r
            );
            // Resolve the merged adj so we can mirror it into FrameLayer metadata
            const updatedAdj = updatedRules
              .find((r) => r.id === ruleId)
              ?.imageAssignments.find((a) => a.slotId === slotId)
              ?.colorAdjustments;

            // 2. Mirror adj → FrameLayer.metadata.collageColorAdj so FrameNode can
            //    apply Konva filters without a separate store lookup at render time.
            const updatedPages = updatedAdj != null
              ? doc.pages.map((p) => ({
                  ...p,
                  layers: p.layers.map((l) => {
                    const cf = (l.metadata as Record<string, unknown>)["collageFrame"] as
                      | { slotId?: string }
                      | undefined;
                    if (l.type !== "frame" || cf?.slotId !== slotId) return l;
                    return {
                      ...l,
                      metadata: { ...l.metadata, collageColorAdj: updatedAdj as unknown as import("@/types/primitives").JsonValue }
                    };
                  })
                }))
              : doc.pages;

            return { ...doc, collageRules: updatedRules, pages: updatedPages };
          },
          (doc) => {
            const prev = state.document!.collageRules.find((r) => r.id === ruleId);
            const prevAdj = prev?.imageAssignments.find((a) => a.slotId === slotId)?.colorAdjustments;
            return {
              ...doc,
              collageRules: doc.collageRules.map((r) =>
                r.id === ruleId ? { ...r, imageAssignments: prev?.imageAssignments ?? r.imageAssignments } : r
              ),
              pages: prevAdj != null
                ? doc.pages.map((p) => ({
                    ...p,
                    layers: p.layers.map((l) => {
                      const cf = (l.metadata as Record<string, unknown>)["collageFrame"] as
                        | { slotId?: string }
                        | undefined;
                      if (l.type !== "frame" || cf?.slotId !== slotId) return l;
                      return { ...l, metadata: { ...l.metadata, collageColorAdj: prevAdj as unknown as import("@/types/primitives").JsonValue } };
                    })
                  }))
                : doc.pages
            };
          }
        )
      );
    }),

  updateCollageImageEditParams: (ruleId, slotId, params) =>
    set((state) => {
      if (state.document === null) return state;
      const updatedRules = state.document.collageRules.map((r) =>
        r.id === ruleId
          ? { ...r, imageAssignments: r.imageAssignments.map((a) => a.slotId === slotId ? { ...a, imageEditParams: params } : a) }
          : r
      );
      // Mirror to frame metadata so FrameNode can read without store lookup
      const updatedPages = state.document.pages.map((p) => ({
        ...p,
        layers: p.layers.map((l) => {
          if (l.type !== "frame") return l;
          const cf = l.metadata["collageFrame"] as { slotId?: string; collageRuleId?: string } | undefined;
          if (cf?.collageRuleId !== ruleId || cf?.slotId !== slotId) return l;
          return { ...l, metadata: { ...l.metadata, collageImageEditParams: params as unknown as import("@/types/primitives").JsonValue } };
        })
      }));
      return {
        ...state,
        document: { ...state.document, collageRules: updatedRules, pages: updatedPages },
        revision: state.revision + 1,
      };
    }),

  updateCollageImageEffects: (ruleId, slotId, effects) =>
    set((state) => {
      if (state.document === null) return state;
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateCollageImageEffectsAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) =>
              r.id === ruleId
                ? {
                    ...r,
                    imageAssignments: r.imageAssignments.map((a) =>
                      a.slotId === slotId ? { ...a, visualEffects: effects } : a
                    )
                  }
                : r
            )
          }),
          (doc) => {
            const prev = state.document!.collageRules.find((r) => r.id === ruleId);
            return {
              ...doc,
              collageRules: doc.collageRules.map((r) =>
                r.id === ruleId ? { ...r, imageAssignments: prev?.imageAssignments ?? r.imageAssignments } : r
              )
            };
          }
        )
      );
    }),

  updateCollageEdgeConfig: (ruleId, slotId, edgeConfig) =>
    set((state) => {
      if (state.document === null) return state;
      const prevEdgeConfig = state.document.collageRules
        .find((r) => r.id === ruleId)
        ?.imageAssignments.find((a) => a.slotId === slotId)
        ?.edgeConfig;
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateCollageEdgeConfigAction",
          (doc) => {
            const updatedRules = doc.collageRules.map((r) =>
              r.id === ruleId
                ? { ...r, imageAssignments: r.imageAssignments.map((a) => a.slotId === slotId ? { ...a, edgeConfig } : a) }
                : r
            );
            // Mirror edgeConfig → FrameLayer.metadata.collageEdgeConfig so FrameNode can render it
            const updatedPages = doc.pages.map((p) => ({
              ...p,
              layers: p.layers.map((l) => {
                if (l.type !== "frame") return l;
                const cf = l.metadata["collageFrame"] as { slotId?: string; collageRuleId?: string } | undefined;
                if (cf?.collageRuleId !== ruleId || cf?.slotId !== slotId) return l;
                return { ...l, metadata: { ...l.metadata, collageEdgeConfig: edgeConfig as unknown as import("@/types/primitives").JsonValue } };
              })
            }));
            return { ...doc, collageRules: updatedRules, pages: updatedPages };
          },
          (doc) => {
            const prev = state.document!.collageRules.find((r) => r.id === ruleId);
            const revertedPages = doc.pages.map((p) => ({
              ...p,
              layers: p.layers.map((l) => {
                if (l.type !== "frame") return l;
                const cf = l.metadata["collageFrame"] as { slotId?: string; collageRuleId?: string } | undefined;
                if (cf?.collageRuleId !== ruleId || cf?.slotId !== slotId) return l;
                return { ...l, metadata: { ...l.metadata, collageEdgeConfig: (prevEdgeConfig ?? null) as unknown as import("@/types/primitives").JsonValue } };
              })
            }));
            return {
              ...doc,
              collageRules: doc.collageRules.map((r) =>
                r.id === ruleId ? { ...r, imageAssignments: prev?.imageAssignments ?? r.imageAssignments } : r
              ),
              pages: revertedPages
            };
          }
        )
      );
    }),

  applyCollageEdgeConfigToAll: (ruleId, edgeConfig) =>
    set((state) => {
      if (state.document === null) return state;
      // Update all assignments' edgeConfig and mirror to frame layers
      const updatedRules = state.document.collageRules.map((r) =>
        r.id === ruleId
          ? { ...r, imageAssignments: r.imageAssignments.map((a) => ({ ...a, edgeConfig })) }
          : r
      );
      const updatedPages = state.document.pages.map((p) => ({
        ...p,
        layers: p.layers.map((l) => {
          if (l.type !== "frame") return l;
          const cf = l.metadata["collageFrame"] as { collageRuleId?: string } | undefined;
          if (cf?.collageRuleId !== ruleId) return l;
          return { ...l, metadata: { ...l.metadata, collageEdgeConfig: edgeConfig as unknown as import("@/types/primitives").JsonValue } };
        })
      }));
      return {
        ...state,
        document: { ...state.document, collageRules: updatedRules, pages: updatedPages },
        revision: state.revision + 1,
      };
    }),

  updateCollageCanvasSettings: (ruleId, settings) =>
    set((state) => {
      if (state.document === null) return state;
      const prev = state.document.collageRules.find((r) => r.id === ruleId);
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateCollageCanvasSettingsAction",
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) =>
              r.id === ruleId ? { ...r, canvasSettings: { ...r.canvasSettings, ...settings } } : r
            )
          }),
          (doc) => ({
            ...doc,
            collageRules: doc.collageRules.map((r) =>
              r.id === ruleId ? { ...r, canvasSettings: prev?.canvasSettings ?? r.canvasSettings } : r
            )
          })
        )
      );
    }),

  updateCollageCachedSlots: (ruleId, newSlots) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.collageRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;

      // Re-clamp every assignment's contentTransform so images still fill their new cell size
      const reclampedAssignments = rule.imageAssignments.map((assignment) => {
        const slot = newSlots.find((s) => s.id === assignment.slotId);
        if (!slot) return assignment;
        const asset = state.document!.assets.find((a) => a.id === assignment.assetId);
        if (!asset?.width || !asset?.height) return assignment;
        const slotW = slot.w * page.width;
        const slotH = slot.h * page.height;
        const clamped = clampContentTransformToFillBounds(
          assignment.contentTransform,
          slotW, slotH,
          asset.width, asset.height,
          assignment.fitMode, 0
        );
        return { ...assignment, contentTransform: clamped };
      });

      const updatedRule = { ...rule, cachedSlots: newSlots, imageAssignments: reclampedAssignments };
      const { page: updatedPage, frameIds } = syncFrameLayersToPage(page, updatedRule, page.width, page.height);
      const finalRule = { ...updatedRule, frameIds };
      return {
        ...state,
        document: {
          ...state.document,
          collageRules: state.document.collageRules.map((r) => r.id === ruleId ? finalRule : r),
          pages: state.document.pages.map((p) => p.id === rule.pageId ? updatedPage : p),
        },
        revision: state.revision + 1,
      };
    }),

  // ─── Class Photo actions ─────────────────────────────────────────────────
  regenerateClassPhoto: (ruleId) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;
      const { page: newPage, rule: newRule } = syncClassPhotoToPage(page, rule);
      return commitDocumentAction(
        state,
        createInlineAction(
          "RegenerateClassPhotoAction",
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? newRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  addPeopleToClassPhoto: (ruleId, newRecords, assets) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;
      const maxOrder = rule.personRecords.reduce((m, r) => Math.max(m, r.orderIndex), -1);
      const merged = [...rule.personRecords, ...newRecords.map((r, i) => ({ ...r, orderIndex: maxOrder + 1 + i }))];
      const updatedRule = { ...rule, personRecords: merged };
      const { page: newPage, rule: finalRule } = syncClassPhotoToPage(page, updatedRule);
      const newAssets = assets.filter((a) => !state.document!.assets.some((ex) => ex.id === a.id));
      return commitDocumentAction(
        state,
        createInlineAction(
          "AddPeopleToClassPhotoAction",
          (doc) => ({
            ...doc,
            assets: [...doc.assets, ...newAssets],
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            assets: doc.assets.filter((a) => !newAssets.some((na) => na.id === a.id)),
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  removePersonFromClassPhoto: (ruleId, personId) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;
      const filtered = rule.personRecords.filter((r) => r.id !== personId).map((r, i) => ({ ...r, orderIndex: i }));
      const updatedRule = { ...rule, personRecords: filtered };
      const { page: newPage, rule: finalRule } = syncClassPhotoToPage(page, updatedRule);
      return commitDocumentAction(
        state,
        createInlineAction(
          "RemovePersonFromClassPhotoAction",
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  updateClassPhotoPerson: (ruleId, personId, patch) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;
      const updatedRecords = rule.personRecords.map((r) => r.id === personId ? { ...r, ...patch } : r);
      const updatedRule = { ...rule, personRecords: updatedRecords };
      const { page: newPage, rule: finalRule } = syncClassPhotoToPage(page, updatedRule);
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateClassPhotoPersonAction",
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  updateClassPhotoFrameStyle: (ruleId, target, style) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;
      const updatedRule = target === "child"
        ? { ...rule, childFrameStyle: style }
        : { ...rule, staffFrameStyle: style };
      const { page: newPage, rule: finalRule } = syncClassPhotoToPage(page, updatedRule);
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateClassPhotoFrameStyleAction",
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  updateClassPhotoLayoutSettings: (ruleId, settingsPatch) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;
      const updatedRule = { ...rule, layoutSettings: { ...rule.layoutSettings, ...settingsPatch } };
      const { page: newPage, rule: finalRule } = syncClassPhotoToPage(page, updatedRule);
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateClassPhotoLayoutSettingsAction",
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  updateClassPhotoVisualBalance: (ruleId, balancePatch) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;
      const updatedRule = { ...rule, visualBalanceSettings: { ...rule.visualBalanceSettings, ...balancePatch } };
      const { page: newPage, rule: finalRule } = syncClassPhotoToPage(page, updatedRule);
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateClassPhotoVisualBalanceAction",
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  updateClassPhotoNameTextStyle: (ruleId, target, stylePatch) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;
      const updatedRule = target === "child"
        ? { ...rule, childNameTextStyle: { ...rule.childNameTextStyle, ...stylePatch } }
        : { ...rule, staffNameTextStyle: { ...rule.staffNameTextStyle, ...stylePatch } };
      const { page: newPage, rule: finalRule } = syncClassPhotoToPage(page, updatedRule);
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateClassPhotoNameTextStyleAction",
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  updateClassPhotoText: (ruleId, field, text) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;
      const updatedRule = { ...rule, [field]: text };
      const { page: newPage, rule: finalRule } = syncClassPhotoToPage(page, updatedRule);
      return commitDocumentAction(
        state,
        createInlineAction(
          "UpdateClassPhotoTextAction",
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  reorderClassPhotoPersons: (ruleId, orderedIds) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === rule.pageId);
      if (!page) return state;
      const byId = new Map(rule.personRecords.map((r) => [r.id, r]));
      const reordered = orderedIds.flatMap((id, i) => {
        const rec = byId.get(id);
        return rec ? [{ ...rec, orderIndex: i }] : [];
      });
      const updatedRule = { ...rule, personRecords: reordered };
      const { page: newPage, rule: finalRule } = syncClassPhotoToPage(page, updatedRule);
      return commitDocumentAction(
        state,
        createInlineAction(
          "ReorderClassPhotoPersonsAction",
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === rule.pageId ? page : p)
          })
        )
      );
    }),

  applyClassPhotoTextStyleToGroup: (ruleId, sourceLayerId, pageId, target) =>
    set((state) => {
      if (state.document === null) return state;
      const rule = state.document.classPhotoRules.find((r) => r.id === ruleId);
      if (!rule) return state;
      const page = state.document.pages.find((p) => p.id === pageId);
      if (!page) return state;
      const sourceLayer = page.layers.find((l) => l.id === sourceLayerId);
      if (!sourceLayer || sourceLayer.type !== "text") return state;

      const patch: Partial<TextStyle> = {
        fontFamily: sourceLayer.fontFamily,
        fontWeight: sourceLayer.fontWeight,
        fontSize: sourceLayer.fontSize,
        lineHeight: sourceLayer.lineHeight,
        letterSpacing: sourceLayer.letterSpacing,
        color: sourceLayer.color,
        alignment: sourceLayer.alignment,
        direction: sourceLayer.direction
      };

      let updatedRule = rule;
      if (target === "child" || target === "all_names" || target === "all") {
        updatedRule = { ...updatedRule, childNameTextStyle: { ...updatedRule.childNameTextStyle, ...patch } };
      }
      if (target === "staff" || target === "all_names" || target === "all") {
        updatedRule = { ...updatedRule, staffNameTextStyle: { ...updatedRule.staffNameTextStyle, ...patch } };
      }
      if (target === "title" || target === "all") {
        updatedRule = { ...updatedRule, titleTextStyle: { ...updatedRule.titleTextStyle, ...patch } };
      }
      if (target === "footer" || target === "all") {
        updatedRule = { ...updatedRule, footerTextStyle: { ...updatedRule.footerTextStyle, ...patch } };
      }

      const { page: newPage, rule: finalRule } = syncClassPhotoToPage(page, updatedRule);
      return commitDocumentAction(
        state,
        createInlineAction(
          "ApplyClassPhotoTextStyleToGroupAction",
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? finalRule : r),
            pages: doc.pages.map((p) => p.id === pageId ? newPage : p)
          }),
          (doc) => ({
            ...doc,
            classPhotoRules: doc.classPhotoRules.map((r) => r.id === ruleId ? rule : r),
            pages: doc.pages.map((p) => p.id === pageId ? page : p)
          })
        )
      );
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

import type { Asset, Document, Page } from "@/types/document";
import type { PageLookLayer } from "@/types/imageAdjustments";
import type { ContentTransform, FrameLayer, VisualLayer } from "@/types/layers";
import type { Margins, Rect } from "@/types/primitives";
import type { ProductGuideVisibility, ProductInstructionSet, ProductPageContext, ProductPrintZone } from "@/types/product";

export interface DocumentAction {
  id: string;
  type: string;
  createdAt: string;
  mergeKey?: string;
  /**
   * When true and this action shares a mergeKey with the top undo entry within a
   * short time window, the two collapse into a single undo step. Used for
   * continuous gestures (slider drags) so one drag = one undo instead of dozens.
   */
  coalesce?: boolean;
  apply: (document: Document) => Document;
  undo: (document: Document) => Document;
}

/** Consecutive coalescing actions merge only if they land within this window. */
const COALESCE_WINDOW_MS = 1000;

function withinCoalesceWindow(previousIso: string, nextIso: string): boolean {
  const prev = Date.parse(previousIso);
  const next = Date.parse(nextIso);
  if (Number.isNaN(prev) || Number.isNaN(next)) return false;
  return next - prev <= COALESCE_WINDOW_MS && next - prev >= 0;
}

export interface HistoryState {
  undoStack: DocumentAction[];
  redoStack: DocumentAction[];
  transaction: DocumentAction[] | null;
  limit: number;
}

export function createHistoryState(limit = 100): HistoryState {
  return {
    undoStack: [],
    redoStack: [],
    transaction: null,
    limit
  };
}

export function resizeHistoryLimit(history: HistoryState, limit: number): HistoryState {
  const resolvedLimit = Math.max(1, Math.floor(limit));
  return {
    ...history,
    limit: resolvedLimit,
    undoStack: compressStack(history.undoStack, resolvedLimit),
    redoStack: compressStack(history.redoStack, resolvedLimit),
    transaction: history.transaction === null ? null : compressStack(history.transaction, resolvedLimit)
  };
}

export function applyDocumentAction(document: Document, history: HistoryState, action: DocumentAction): { document: Document; history: HistoryState } {
  const nextDocument = action.apply(document);
  if (history.transaction !== null) {
    return {
      document: nextDocument,
      history: {
        ...history,
        transaction: [...history.transaction, action]
      }
    };
  }
  // Coalesce continuous gestures: replace the top undo entry in place, keeping the
  // ORIGINAL undo (pre-gesture state) so one drag undoes to where it started.
  const previous = history.undoStack.at(-1);
  if (
    action.coalesce === true &&
    previous !== undefined &&
    previous.mergeKey !== undefined &&
    previous.mergeKey === action.mergeKey &&
    withinCoalesceWindow(previous.createdAt, action.createdAt)
  ) {
    const merged: DocumentAction = { ...action, undo: previous.undo };
    return {
      document: nextDocument,
      history: {
        ...history,
        undoStack: [...history.undoStack.slice(0, -1), merged],
        redoStack: []
      }
    };
  }
  return {
    document: nextDocument,
    history: {
      ...history,
      undoStack: compressStack([...history.undoStack, action], history.limit),
      redoStack: []
    }
  };
}

export function undoDocumentAction(document: Document, history: HistoryState): { document: Document; history: HistoryState } | null {
  const action = history.undoStack.at(-1);
  if (action === undefined) {
    return null;
  }
  return {
    document: action.undo(document),
    history: {
      ...history,
      undoStack: history.undoStack.slice(0, -1),
      redoStack: [...history.redoStack, action]
    }
  };
}

export function redoDocumentAction(document: Document, history: HistoryState): { document: Document; history: HistoryState } | null {
  const action = history.redoStack.at(-1);
  if (action === undefined) {
    return null;
  }
  return {
    document: action.apply(document),
    history: {
      ...history,
      undoStack: compressStack([...history.undoStack, action], history.limit),
      redoStack: history.redoStack.slice(0, -1)
    }
  };
}

export function beginTransaction(history: HistoryState): HistoryState {
  return { ...history, transaction: [] };
}

export function commitTransaction(history: HistoryState, label = "BatchAction"): HistoryState {
  if (history.transaction === null || history.transaction.length === 0) {
    return { ...history, transaction: null };
  }
  const action = createBatchAction(label, history.transaction);
  return {
    ...history,
    transaction: null,
    undoStack: compressStack([...history.undoStack, action], history.limit),
    redoStack: []
  };
}

export function rollbackTransaction(document: Document, history: HistoryState): { document: Document; history: HistoryState } {
  if (history.transaction === null) {
    return { document, history };
  }
  const restored = [...history.transaction].reverse().reduce((current, action) => action.undo(current), document);
  return {
    document: restored,
    history: { ...history, transaction: null }
  };
}

export function createBatchAction(type: string, actions: DocumentAction[]): DocumentAction {
  return {
    id: crypto.randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    apply: (document) => actions.reduce((current, action) => action.apply(current), document),
    undo: (document) => [...actions].reverse().reduce((current, action) => action.undo(current), document)
  };
}

export function addLayerAction(pageId: string, layer: VisualLayer): DocumentAction {
  return createAction("AddLayerAction", (document) => updatePageById(document, pageId, (page) => ({ ...page, layers: [...page.layers, layer] })), (document) =>
    updatePageById(document, pageId, (page) => ({ ...page, layers: page.layers.filter((item) => item.id !== layer.id) }))
  );
}

export function deleteLayerAction(pageId: string, layer: VisualLayer): DocumentAction {
  return createAction("DeleteLayerAction", (document) => updatePageById(document, pageId, (page) => ({ ...page, layers: page.layers.filter((item) => item.id !== layer.id) })), (document) =>
    updatePageById(document, pageId, (page) => ({ ...page, layers: [...page.layers, layer].sort((a, b) => a.zIndex - b.zIndex) }))
  );
}

export function changeLayerAction(pageId: string, before: VisualLayer, after: VisualLayer, type = "ChangeLayerPropertyAction"): DocumentAction {
  return createAction(
    type,
    (document) => updateLayerById(document, pageId, after),
    (document) => updateLayerById(document, pageId, before),
    before.id
  );
}

/**
 * Like changeLayerAction but marks the action as coalescing under the supplied
 * key, so a rapid sequence (e.g. a slider drag) collapses into one undo step.
 */
export function changeLayerActionCoalesced(
  pageId: string,
  before: VisualLayer,
  after: VisualLayer,
  coalesceKey: string,
  type = "ChangeLayerPropertyAction"
): DocumentAction {
  return createAction(
    type,
    (document) => updateLayerById(document, pageId, after),
    (document) => updateLayerById(document, pageId, before),
    coalesceKey,
    true
  );
}

export function reorderLayersAction(pageId: string, before: VisualLayer[], after: VisualLayer[]): DocumentAction {
  return createAction("ReorderLayersAction", (document) => updatePageById(document, pageId, (page) => ({ ...page, layers: after })), (document) =>
    updatePageById(document, pageId, (page) => ({ ...page, layers: before }))
  );
}

/** Full before/after page-layer swap with a caller-supplied action type. One undo record. */
export function changeLayersAction(pageId: string, before: VisualLayer[], after: VisualLayer[], type = "ChangeLayersAction"): DocumentAction {
  return createAction(type, (document) => updatePageById(document, pageId, (page) => ({ ...page, layers: after })), (document) =>
    updatePageById(document, pageId, (page) => ({ ...page, layers: before }))
  );
}

export function changePageLooksAction(
  pageId: string,
  before: PageLookLayer[] | undefined,
  after: PageLookLayer[] | undefined,
  type = "ChangePageLooksAction",
  coalesceKey?: string
): DocumentAction {
  return createAction(
    type,
    (document) => updatePageById(document, pageId, (page) => ({ ...page, pageLooks: after })),
    (document) => updatePageById(document, pageId, (page) => ({ ...page, pageLooks: before })),
    coalesceKey,
    coalesceKey !== undefined
  );
}

export function addAssetAction(asset: Asset): DocumentAction {
  return createAction("AddAssetAction", (document) => ({ ...document, assets: [...document.assets, asset] }), (document) => ({
    ...document,
    assets: document.assets.filter((item) => item.id !== asset.id)
  }));
}

export function addAssetAndLayerAction(pageId: string, asset: Asset, layer: VisualLayer): DocumentAction {
  return createBatchAction("ImportImageAction", [addAssetAction(asset), addLayerAction(pageId, layer)]);
}

export function addPageAction(page: Page): DocumentAction {
  return createAction("AddPageAction", (document) => ({ ...document, pages: [...document.pages, page] }), (document) => ({
    ...document,
    pages: document.pages.filter((item) => item.id !== page.id)
  }));
}

export function deletePageAction(page: Page): DocumentAction {
  return createAction("DeletePageAction", (document) => ({ ...document, pages: document.pages.filter((item) => item.id !== page.id) }), (document) => ({
    ...document,
    pages: [...document.pages, page]
  }));
}

export function changePageAction(before: Page, after: Page, type = "ChangePageSetupAction"): DocumentAction {
  return createAction(
    type,
    (document) => ({ ...document, pages: document.pages.map((page) => (page.id === after.id ? after : page)) }),
    (document) => ({ ...document, pages: document.pages.map((page) => (page.id === before.id ? before : page)) }),
    after.id
  );
}

export function updateFrameContentAction(pageId: string, before: FrameLayer, contentTransform: ContentTransform): DocumentAction {
  const after: FrameLayer = { ...before, contentTransform };
  return createAction("UpdateFrameContentAction", (doc) => updateLayerById(doc, pageId, after), (doc) => updateLayerById(doc, pageId, before), before.id);
}

export function setFrameImageAction(pageId: string, before: FrameLayer, imageAssetId: string, contentTransform: ContentTransform): DocumentAction {
  const after: FrameLayer = { ...before, imageAssetId, contentType: "image", contentTransform };
  return createAction("SetFrameImageAction", (doc) => updateLayerById(doc, pageId, after), (doc) => updateLayerById(doc, pageId, before), before.id);
}


function createAction(
  type: string,
  apply: DocumentAction["apply"],
  undo: DocumentAction["undo"],
  mergeKey?: string,
  coalesce = false
): DocumentAction {
  return {
    id: crypto.randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    mergeKey,
    coalesce,
    apply: (document) => touch(apply(document)),
    undo: (document) => touch(undo(document))
  };
}

function touch(document: Document): Document {
  return {
    ...document,
    modifiedAt: new Date().toISOString()
  };
}

function updateLayerById(document: Document, pageId: string, layer: VisualLayer): Document {
  return updatePageById(document, pageId, (page) => ({
    ...page,
    layers: page.layers.map((item) => (item.id === layer.id ? layer : item))
  }));
}

function updatePageById(document: Document, pageId: string, updater: (page: Page) => Page): Document {
  return {
    ...document,
    pages: document.pages.map((page) => (page.id === pageId ? updater(page) : page))
  };
}

function compressStack(actions: DocumentAction[], limit: number): DocumentAction[] {
  return actions.slice(-limit);
}

// ── Product Mode history actions ──────────────────────────────────────────────

function patchProductContext(page: Page, patch: Partial<ProductPageContext>): Page {
  const current = (page.metadata.productContext ?? {}) as unknown as ProductPageContext;
  return {
    ...page,
    metadata: {
      ...page.metadata,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      productContext: { ...current, ...patch } as any
    }
  };
}

export function updateProductBleedAction(page: Page, bleed: Margins): DocumentAction {
  const before = page;
  const after = patchProductContext(page, { bleed });
  return changePageAction(before, after, "UpdateProductBleedAction");
}

export function updateProductSafeAreaAction(page: Page, safeArea: Rect): DocumentAction {
  const before = page;
  const after = patchProductContext(page, { safeArea });
  return changePageAction(before, after, "UpdateProductSafeAreaAction");
}

export function updateProductInstructionsAction(page: Page, instructions: ProductInstructionSet): DocumentAction {
  const ctx = (page.metadata.productContext ?? {}) as unknown as ProductPageContext;
  const before = page;
  const after = patchProductContext(page, { ...ctx, ...({ instructions } as unknown as Partial<ProductPageContext>) });
  return changePageAction(before, after, "UpdateProductInstructionsAction");
}

export function toggleProductGuideVisibilityAction(
  page: Page,
  key: keyof ProductGuideVisibility,
  value: boolean
): DocumentAction {
  const ctx = (page.metadata.productContext ?? {}) as unknown as ProductPageContext;
  const newVisibility = { ...ctx.guideVisibility, [key]: value };
  const before = page;
  const after = patchProductContext(page, { guideVisibility: newVisibility });
  return changePageAction(before, after, "ToggleProductGuideVisibilityAction");
}

export function addProductPrintZoneAction(page: Page, zone: ProductPrintZone): DocumentAction {
  const ctx = (page.metadata.productContext ?? {}) as unknown as ProductPageContext;
  const before = page;
  const after = patchProductContext(page, { printZones: [...(ctx.printZones ?? []), zone] });
  return changePageAction(before, after, "AddProductPrintZoneAction");
}

export function updateProductPrintZoneAction(
  page: Page,
  zoneId: string,
  patch: Partial<ProductPrintZone>
): DocumentAction {
  const ctx = (page.metadata.productContext ?? {}) as unknown as ProductPageContext;
  const updatedZones = (ctx.printZones ?? []).map((z) => (z.id === zoneId ? { ...z, ...patch } : z));
  const before = page;
  const after = patchProductContext(page, { printZones: updatedZones });
  return changePageAction(before, after, "UpdateProductPrintZoneAction");
}

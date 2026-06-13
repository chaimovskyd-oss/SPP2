import { createDocument, createPage } from "@/core/document/factory";
import { createId } from "@/core/ids";
import { createFrameLayer, defaultContentTransform } from "@/core/layers/factory";
import { withProjectMetadata } from "@/core/projectMetadata";
import { mmToPx } from "@/core/units/conversion";
import { detectFocalPoint, type FocalPoint } from "@/core/collage/collageFaceDetect";
import { clampContentTransformToFillBounds, computeContentRect } from "@/core/rendering/frameFitEngine";
import type { Asset, Document, Page } from "@/types/document";
import type { ContentTransform, FrameLayer, VisualLayer } from "@/types/layers";
import type { FitMode, FillStyle, PageSetup } from "@/types/primitives";
import type { VisualEffectStack } from "@/types/visualEffects";
import type {
  PhotoPrintCreateOptions,
  PhotoPrintFrameLayer,
  PhotoPrintFrameMetadata,
  PhotoPrintImageAssignment,
  PhotoPrintImageInput,
  PhotoPrintLayoutResult,
  PhotoPrintRule
} from "@/types/photoPrint";
import type { ProjectMetadataInput } from "@/types/project";

const DEFAULT_SHEET_MARGIN_MM = 0;
const DEFAULT_GAP_MM = 0;
const DEFAULT_BORDER_MM = 5;
const DEFAULT_COPIES = 1;

export function computeBestGridForCount(
  usableWPx: number,
  usableHPx: number,
  gapPx: number,
  count: number,
  orientationPolicy: "auto" | "portrait" | "landscape" = "auto"
): { rows: number; cols: number } {
  const safeCount = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const safeUsableW = Number.isFinite(usableWPx) ? usableWPx : 0;
  const safeUsableH = Number.isFinite(usableHPx) ? usableHPx : 0;
  const safeGap = Math.max(0, Number.isFinite(gapPx) ? gapPx : 0);

  if (safeUsableW <= 0 || safeUsableH <= 0) {
    return { rows: 1, cols: safeCount };
  }

  const TARGET_RATIO = 1.5;
  const SQUARE_PENALTY_THRESHOLD = 1.2;
  let bestScore = -Infinity;
  let bestRows = 1;
  let bestCols = safeCount;

  for (let rows = 1; rows <= safeCount; rows += 1) {
    const cols = Math.ceil(safeCount / rows);
    const slotW = (safeUsableW - (cols - 1) * safeGap) / cols;
    const slotH = (safeUsableH - (rows - 1) * safeGap) / rows;
    if (slotW <= 0 || slotH <= 0) continue;

    const slotIsPortrait = slotH >= slotW;
    if (orientationPolicy === "portrait" && !slotIsPortrait) continue;
    if (orientationPolicy === "landscape" && slotIsPortrait) continue;

    const ratio = Math.max(slotW, slotH) / Math.min(slotW, slotH);
    const dist = Math.abs(ratio - TARGET_RATIO);
    const ratioScore = ratio < SQUARE_PENALTY_THRESHOLD ? -(dist * 3) : -dist;
    const score = ratioScore * 10000 + slotW * slotH;

    if (score > bestScore) {
      bestScore = score;
      bestRows = rows;
      bestCols = cols;
    }
  }

  if (bestScore === -Infinity && orientationPolicy !== "auto") {
    return computeBestGridForCount(safeUsableW, safeUsableH, safeGap, safeCount, "auto");
  }
  if (bestScore === -Infinity) {
    return { rows: 1, cols: safeCount };
  }
  return { rows: bestRows, cols: bestCols };
}

export function computePhotoPrintLayout(
  pageWidthPx: number,
  pageHeightPx: number,
  printWidthMm: number,
  printHeightMm: number,
  dpi: number,
  sheetMarginsMm: number,
  gapBetweenPrintsMm: number,
  autoRotateOnSheet: boolean,
  globalCopies: number,
  totalSourceImages: number,
  targetsPerPage = 0,
  orientationPolicy: "auto" | "portrait" | "landscape" = "auto"
): PhotoPrintLayoutResult {
  const marginPx = mmToPx(sheetMarginsMm, dpi);
  const gapPx = mmToPx(gapBetweenPrintsMm, dpi);
  const usableW = Math.max(1, pageWidthPx - 2 * marginPx);
  const usableH = Math.max(1, pageHeightPx - 2 * marginPx);
  const totalPrintItems = Math.max(1, totalSourceImages) * Math.max(1, globalCopies);
  const printDims = orientPrintDimensions(printWidthMm, printHeightMm, orientationPolicy);

  // Smart grid: fixed count per page
  if (targetsPerPage > 0) {
    const { rows, cols } = computeBestGridForCount(usableW, usableH, gapPx, targetsPerPage, orientationPolicy);
    const slotWPx = (usableW - (cols - 1) * gapPx) / cols;
    const slotHPx = (usableH - (rows - 1) * gapPx) / rows;
    const slotsPerPage = rows * cols;
    return {
      slotsPerRow: cols,
      slotsPerColumn: rows,
      rotatedOnSheet: false,
      slotsPerPage,
      totalPages: Math.max(1, Math.ceil(totalPrintItems / slotsPerPage)),
      slotWidthPx: slotWPx,
      slotHeightPx: slotHPx,
      fits: slotWPx > 0 && slotHPx > 0
    };
  }

  const printWPx = mmToPx(printDims.widthMm, dpi);
  const printHPx = mmToPx(printDims.heightMm, dpi);

  const colsNormal = Math.max(0, Math.floor((usableW + gapPx) / (printWPx + gapPx)));
  const rowsNormal = Math.max(0, Math.floor((usableH + gapPx) / (printHPx + gapPx)));
  const totalNormal = colsNormal * rowsNormal;

  if (autoRotateOnSheet && orientationPolicy === "auto") {
    const colsRotated = Math.max(0, Math.floor((usableW + gapPx) / (printHPx + gapPx)));
    const rowsRotated = Math.max(0, Math.floor((usableH + gapPx) / (printWPx + gapPx)));
    const totalRotated = colsRotated * rowsRotated;
    if (totalRotated > totalNormal) {
      const slotsPerPage = Math.max(1, colsRotated * rowsRotated);
      return {
        slotsPerRow: colsRotated,
        slotsPerColumn: rowsRotated,
        rotatedOnSheet: true,
        slotsPerPage,
        totalPages: Math.max(1, Math.ceil(totalPrintItems / slotsPerPage)),
        slotWidthPx: printHPx,
        slotHeightPx: printWPx,
        fits: slotsPerPage > 0
      };
    }
  }

  const slotsPerPage = Math.max(1, totalNormal);
  return {
    slotsPerRow: Math.max(1, colsNormal),
    slotsPerColumn: Math.max(1, rowsNormal),
    rotatedOnSheet: false,
    slotsPerPage: totalNormal > 0 ? slotsPerPage : 0,
    totalPages: totalNormal > 0 ? Math.max(1, Math.ceil(totalPrintItems / slotsPerPage)) : 1,
    slotWidthPx: printWPx,
    slotHeightPx: printHPx,
    fits: totalNormal > 0
  };
}

export function createPhotoPrintModeDocument(
  name: string,
  setup: PageSetup,
  inputs: PhotoPrintImageInput[],
  options: PhotoPrintCreateOptions,
  projectMetadata: ProjectMetadataInput = {}
): Document {
  const ruleId = createId("pp");
  const rule = createPhotoPrintRule(ruleId, setup, options);
  const basePage = createPage({ name: "הדפסה 1", setup });
  const layout = computePhotoPrintLayout(
    basePage.width,
    basePage.height,
    rule.printWidthMm,
    rule.printHeightMm,
    setup.dpi,
    rule.sheetMarginsMm,
    rule.gapBetweenPrintsMm,
    rule.autoRotateOnSheet,
    rule.globalCopies,
    inputs.length,
    rule.targetsPerPage,
    rule.orientationPolicy
  );

  const updatedRule: PhotoPrintRule = {
    ...rule,
    slotsPerRow: layout.slotsPerRow,
    slotsPerColumn: layout.slotsPerColumn,
    slotsRotatedOnSheet: layout.rotatedOnSheet
  };

  const expandedInputs = expandInputsWithCopies(inputs, updatedRule);
  const { pages, finalRule } = buildPhotoPrintPages(basePage, updatedRule, expandedInputs, setup, layout);
  const allAssets = inputs.map((inp) => inp.asset);
  const assignments = buildAssignments(pages, finalRule, expandedInputs);

  const doc = createDocument({
    name,
    dpi: setup.dpi,
    pages,
    metadata: {
      mode: "photo_print",
      activePhotoPrintId: ruleId
    }
  });

  return withProjectMetadata({
    ...doc,
    assets: mergeAssets(doc.assets, allAssets),
    photoPrintRules: [finalRule],
    photoPrintImageAssignments: assignments
  }, { ...projectMetadata, projectType: projectMetadata.projectType ?? "PhotoPrint" });
}

export function fillPhotoPrintWithImages(document: Document, ruleId: string, inputs: PhotoPrintImageInput[]): Document {
  const rawRule = getRule(document, ruleId);
  if (rawRule === undefined) return document;
  const rule = normalizePhotoPrintRule(rawRule);
  const firstPage = document.pages.find((page) => page.id === rule.pageIds[0]) ?? document.pages[0];
  if (firstPage === undefined) return document;

  const layout = computePhotoPrintLayout(
    firstPage.width,
    firstPage.height,
    rule.printWidthMm,
    rule.printHeightMm,
    firstPage.setup.dpi,
    rule.sheetMarginsMm,
    rule.gapBetweenPrintsMm,
    rule.autoRotateOnSheet,
    rule.globalCopies,
    inputs.length,
    rule.targetsPerPage,
    rule.orientationPolicy
  );
  const updatedRule: PhotoPrintRule = {
    ...rule,
    slotsPerRow: layout.slotsPerRow,
    slotsPerColumn: layout.slotsPerColumn,
    slotsRotatedOnSheet: layout.rotatedOnSheet
  };
  const expandedInputs = expandInputsWithCopies(inputs, updatedRule);
  const cleared = removePhotoPrintSlots(document, ruleId);
  const { pages, finalRule } = buildPhotoPrintPages(firstPage, updatedRule, expandedInputs, firstPage.setup, layout);
  const allAssets = inputs.map((inp) => inp.asset);
  const assignments = buildAssignments(pages, finalRule, expandedInputs);

  return {
    ...cleared,
    assets: mergeAssets(cleared.assets, allAssets),
    pages,
    photoPrintRules: cleared.photoPrintRules.map((r) => r.id === ruleId ? finalRule : r),
    photoPrintImageAssignments: [
      ...cleared.photoPrintImageAssignments.filter((a) => a.photoPrintId !== ruleId),
      ...assignments
    ]
  };
}

export function regeneratePhotoPrint(document: Document, ruleId: string, patch: Partial<PhotoPrintRule>): Document {
  const rule = getRule(document, ruleId);
  if (rule === undefined) return document;
  const nextRule = normalizePhotoPrintRule({ ...rule, ...patch });
  const existing = document.photoPrintImageAssignments
    .filter((a) => a.photoPrintId === ruleId)
    .sort((a, b) => a.globalIndex - b.globalIndex);
  const inputs: PhotoPrintImageInput[] = existing.flatMap((a): PhotoPrintImageInput[] => {
    const asset = document.assets.find((asset) => asset.id === a.assetId);
    return asset === undefined ? [] : [{
      asset,
      manualContentTransform: a.manualContentTransform,
      manualFitModeOverride: a.manualFitModeOverride,
      imageEditParams: a.imageEditParams,
      visualEffects: a.visualEffects
    }];
  });
  const uniqueInputs = deduplicateByAssetId(inputs);
  return fillPhotoPrintWithImages({ ...document, photoPrintRules: document.photoPrintRules.map((r) => r.id === ruleId ? nextRule : r) }, ruleId, uniqueInputs);
}

export function isPhotoPrintSlotLayer(layer: VisualLayer): layer is PhotoPrintFrameLayer {
  return layer.type === "frame" && layer.metadata["photoPrintSlot"] !== undefined;
}

export function getActivePhotoPrintRule(document: Document): PhotoPrintRule | undefined {
  const ruleId = document.metadata["activePhotoPrintId"];
  if (typeof ruleId !== "string") return undefined;
  return document.photoPrintRules.find((r) => r.id === ruleId);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function createPhotoPrintRule(ruleId: string, setup: PageSetup, options: PhotoPrintCreateOptions): PhotoPrintRule {
  const orientationPolicy = options.orientationPolicy ?? "auto";
  const printDims = orientPrintDimensions(options.printWidthMm, options.printHeightMm, orientationPolicy);
  return normalizePhotoPrintRule({
    version: 1,
    id: ruleId,
    name: options.name ?? "פיתוח תמונות",
    pageIds: [],
    frameIds: [],
    printWidthMm: printDims.widthMm,
    printHeightMm: printDims.heightMm,
    frameBorderEnabled: options.frameBorderEnabled ?? true,
    frameBorderMm: options.frameBorderMm ?? DEFAULT_BORDER_MM,
    frameBorderColor: options.frameBorderColor ?? "#ffffff",
    cutLineEnabled: options.cutLineEnabled ?? true,
    cutLineWidthPx: 1,
    cutLineColor: "#000000",
    fitMode: options.fitMode ?? "fill",
    autoRotatePolicy: options.autoRotatePolicy ?? "rotateToSlotOrientation",
    autoRotateOnSheet: options.autoRotateOnSheet ?? true,
    sheetMarginsMm: options.sheetMarginsMm ?? DEFAULT_SHEET_MARGIN_MM,
    gapBetweenPrintsMm: options.gapBetweenPrintsMm ?? DEFAULT_GAP_MM,
    slotsPerRow: 1,
    slotsPerColumn: 1,
    slotsRotatedOnSheet: false,
    targetsPerPage: options.targetsPerPage ?? 0,
    orientationPolicy,
    faceDetectionEnabled: options.faceDetectionEnabled ?? false,
    globalCopies: options.globalCopies ?? DEFAULT_COPIES,
    perImageCopies: {},
    smartFillEnabled: options.smartFillEnabled ?? false,
    passportPresetId: options.passportPresetId ?? options.printPresetId,
    passportRequirementId: options.passportRequirementId,
    passportSizeMm: options.passportSizeMm,
    showPassportGuidelines: options.showPassportGuidelines,
    metadata: { dpi: setup.dpi, printPresetId: options.printPresetId ?? "" }
  });
}

function normalizePhotoPrintRule(rule: PhotoPrintRule): PhotoPrintRule {
  const printDims = orientPrintDimensions(rule.printWidthMm, rule.printHeightMm, rule.orientationPolicy);
  return {
    ...rule,
    printWidthMm: printDims.widthMm,
    printHeightMm: printDims.heightMm
  };
}

function orientPrintDimensions(
  widthMm: number,
  heightMm: number,
  orientationPolicy: "auto" | "portrait" | "landscape"
): { widthMm: number; heightMm: number } {
  if (orientationPolicy === "auto") return { widthMm, heightMm };
  const min = Math.min(widthMm, heightMm);
  const max = Math.max(widthMm, heightMm);
  return orientationPolicy === "portrait"
    ? { widthMm: min, heightMm: max }
    : { widthMm: max, heightMm: min };
}

interface ExpandedInput {
  asset: Asset;
  sourceImageIndex: number;
  copyIndex: number;
  manualContentTransform?: PhotoPrintImageInput["manualContentTransform"];
  manualFitModeOverride?: FitMode;
  imageEditParams?: PhotoPrintImageInput["imageEditParams"];
  visualEffects?: VisualEffectStack;
}

function expandInputsWithCopies(inputs: PhotoPrintImageInput[], rule: PhotoPrintRule): ExpandedInput[] {
  const result: ExpandedInput[] = [];
  inputs.forEach((inp, sourceIndex) => {
    const copies = inp.copies ?? rule.perImageCopies[sourceIndex] ?? rule.globalCopies;
    for (let copy = 0; copy < copies; copy += 1) {
      result.push({
        asset: inp.asset,
        sourceImageIndex: sourceIndex,
        copyIndex: copy,
        manualContentTransform: inp.manualContentTransform,
        manualFitModeOverride: inp.manualFitModeOverride,
        imageEditParams: inp.imageEditParams,
        visualEffects: inp.visualEffects
      });
    }
  });
  return result;
}

function mergePhotoPrintVisualEffects(userEffects: VisualEffectStack | undefined, cutLineEffects: VisualEffectStack | undefined): VisualEffectStack | undefined {
  if (userEffects === undefined) return cutLineEffects;
  if (cutLineEffects === undefined) return userEffects;
  const hasStroke = userEffects.effects.some((effect) => effect.params.type === "stroke");
  return {
    ...userEffects,
    enabled: userEffects.enabled || cutLineEffects.enabled,
    effects: hasStroke ? userEffects.effects : [...userEffects.effects, ...cutLineEffects.effects]
  };
}

function buildPhotoPrintPages(
  basePage: Page,
  rule: PhotoPrintRule,
  expandedInputs: ExpandedInput[],
  setup: PageSetup,
  layout: PhotoPrintLayoutResult
): { pages: Page[]; finalRule: PhotoPrintRule } {
  const slotsPerPage = Math.max(1, layout.slotsPerRow * layout.slotsPerColumn);
  const totalPages = expandedInputs.length === 0 ? 1 : Math.max(1, Math.ceil(expandedInputs.length / slotsPerPage));

  const pages: Page[] = [];
  let finalRule = { ...rule, pageIds: [] as string[], frameIds: [] as string[] };
  const marginPx = mmToPx(rule.sheetMarginsMm, setup.dpi);
  const gapPx = mmToPx(rule.gapBetweenPrintsMm, setup.dpi);
  const borderPx = rule.frameBorderEnabled ? mmToPx(rule.frameBorderMm, setup.dpi) : 0;

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const isFirstPage = pageIndex === 0;
    const page = isFirstPage
      ? { ...basePage, layers: [] as VisualLayer[] }
      : createPage({ name: `הדפסה ${pageIndex + 1}`, setup });

    const pageInputsStart = pageIndex * slotsPerPage;
    const frames: FrameLayer[] = [];

    for (let slotOnPage = 0; slotOnPage < slotsPerPage; slotOnPage += 1) {
      const globalIndex = pageInputsStart + slotOnPage;
      const input = expandedInputs[globalIndex];
      const row = Math.floor(slotOnPage / layout.slotsPerRow);
      const col = slotOnPage % layout.slotsPerRow;

      const x = marginPx + col * (layout.slotWidthPx + gapPx);
      const y = marginPx + row * (layout.slotHeightPx + gapPx);

      const metadata: PhotoPrintFrameMetadata = {
        photoPrintId: rule.id,
        photoPrintPageIndex: pageIndex,
        slotIndexGlobal: globalIndex,
        slotIndexOnPage: slotOnPage,
        row,
        column: col,
        rotatedOnSheet: layout.rotatedOnSheet,
        isPhotoPrintSlot: true
      };

      let slotRotation = 0;
      if (rule.autoRotatePolicy === "rotateToSlotOrientation" && input !== undefined) {
        const imgW = input.asset.width;
        const imgH = input.asset.height;
        if (typeof imgW === "number" && typeof imgH === "number" && imgW > 0 && imgH > 0) {
          const imgIsPortrait = imgH > imgW;
          const slotIsPortrait = layout.slotHeightPx > layout.slotWidthPx;
          if (imgIsPortrait !== slotIsPortrait) {
            slotRotation = 90;
          }
        } else if (layout.rotatedOnSheet) {
          slotRotation = 90;
        }
      }

      const fitMode = (input?.manualFitModeOverride ?? rule.fitMode) as FitMode;
      const imageAssetId = input?.asset.id;
      const contentType = imageAssetId !== undefined ? "image" : "empty";
      const contentTransform = input?.manualContentTransform ?? {
        ...defaultContentTransform,
        rotation: slotRotation
      };

      const fill: FillStyle | undefined = rule.frameBorderEnabled
        ? { version: 1, color: rule.frameBorderColor, opacity: 1 }
        : undefined;

      const cutLineEffects: VisualEffectStack | undefined = rule.cutLineEnabled ? {
        version: 1,
        enabled: true,
        effects: [{
          version: 1,
          id: createId("ve"),
          enabled: true,
          params: { type: "stroke", color: rule.cutLineColor, width: rule.cutLineWidthPx * 2, position: "outside", opacity: 1 }
        }]
      } : undefined;
      const visualEffects = mergePhotoPrintVisualEffects(input?.visualEffects, cutLineEffects);

      const frame = createFrameLayer({
        name: `הדפסה ${globalIndex + 1}`,
        rect: { x, y, width: layout.slotWidthPx, height: layout.slotHeightPx },
        behaviorMode: "layoutLocked",
        shape: "rect",
        contentType,
        imageAssetId,
        fitMode,
        contentTransform,
        padding: borderPx,
        lockedFrame: false,
        zIndex: globalIndex,
        metadata: {
          photoPrintSlot: metadata,
          ...(input?.imageEditParams !== undefined ? { imageEditParams: input.imageEditParams as unknown as import("@/types/primitives").JsonValue } : {})
        }
      });

      const smartCropMode = rule.faceDetectionEnabled ? "face" : "center";
      frames.push({ ...frame, fill, visualEffects, smartCropMode } as FrameLayer);
    }

    const updatedPage: Page = {
      ...page,
      layers: [...page.layers.filter((l) => !isPhotoPrintSlotForRule(l, rule.id)), ...frames]
    };
    pages.push(updatedPage);
    finalRule = {
      ...finalRule,
      pageIds: [...finalRule.pageIds, updatedPage.id],
      frameIds: [...finalRule.frameIds, ...frames.map((f) => f.id)]
    };
  }

  return { pages, finalRule };
}

function buildAssignments(pages: Page[], rule: PhotoPrintRule, expandedInputs: ExpandedInput[]): PhotoPrintImageAssignment[] {
  const assignments: PhotoPrintImageAssignment[] = [];
  pages.forEach((page, pageIndex) => {
    page.layers.filter((l): l is PhotoPrintFrameLayer => isPhotoPrintSlotLayer(l)).forEach((frame) => {
      const meta = frame.metadata["photoPrintSlot"] as PhotoPrintFrameMetadata;
      const input = expandedInputs[meta.slotIndexGlobal];
      if (input === undefined) return;
      assignments.push({
        version: 1,
        id: createId("pp_assign"),
        photoPrintId: rule.id,
        assetId: input.asset.id,
        frameId: frame.id,
        globalIndex: meta.slotIndexGlobal,
        pageIndex,
        slotIndexOnPage: meta.slotIndexOnPage,
        sourceImageIndex: input.sourceImageIndex,
        copyIndex: input.copyIndex,
        manualContentTransform: input.manualContentTransform,
        manualFitModeOverride: input.manualFitModeOverride,
        imageEditParams: input.imageEditParams,
        visualEffects: input.visualEffects,
        hasManualCropOverride: input.manualContentTransform !== undefined,
        hasManualRotationOverride: false,
        passportState: rule.passportRequirementId === undefined ? undefined : {
          version: 1,
          selectedPassportPreset: rule.passportPresetId,
          selectedPassportSize: rule.passportSizeMm,
          showPassportGuidelines: rule.showPassportGuidelines ?? true
        }
      });
    });
  });
  return assignments;
}

function removePhotoPrintSlots(document: Document, ruleId: string): Document {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.filter((l) => !isPhotoPrintSlotForRule(l, ruleId))
    })),
    photoPrintRules: document.photoPrintRules.map((r) => r.id === ruleId ? { ...r, frameIds: [], pageIds: [] } : r)
  };
}

function isPhotoPrintSlotForRule(layer: VisualLayer, ruleId: string): boolean {
  const meta = layer.metadata["photoPrintSlot"];
  return typeof meta === "object" && meta !== null && "photoPrintId" in meta && meta.photoPrintId === ruleId;
}

function getRule(document: Document, ruleId: string): PhotoPrintRule | undefined {
  return document.photoPrintRules.find((r) => r.id === ruleId);
}

function mergeAssets(existing: Asset[], incoming: Asset[]): Asset[] {
  const ids = new Set(existing.map((a) => a.id));
  return [...existing, ...incoming.filter((a) => !ids.has(a.id))];
}

/**
 * One-shot async pass that runs MediaPipe face detection (via the Python
 * sidecar) on every photo-print frame whose `smartCropMode === "face"` and
 * shifts the frame's contentTransform.offsetX/Y so the detected face lands at
 * the cell's center. Rotation (auto-rotate-to-slot) is preserved.
 *
 * Safe to call when the sidecar is unavailable: `detectFocalPoint` falls back
 * to a saliency heuristic and the offsets still get a sensible center.
 *
 * Frames whose user has already manually cropped (assignment has
 * `manualContentTransform` / `hasManualCropOverride`) are skipped.
 */
export async function applyFaceDetectionToPhotoPrint(
  document: Document,
  ruleId: string
): Promise<Document> {
  const rule = getRule(document, ruleId);
  if (rule === undefined || !rule.faceDetectionEnabled) return document;

  const assignmentByFrame = new Map<string, PhotoPrintImageAssignment>();
  for (const a of document.photoPrintImageAssignments) {
    if (a.photoPrintId === ruleId) assignmentByFrame.set(a.frameId, a);
  }
  const assetById = new Map<string, Asset>(document.assets.map((a) => [a.id, a]));

  let nextDoc = document;
  for (const page of document.pages) {
    if (!rule.pageIds.includes(page.id)) continue;
    for (const layer of page.layers) {
      if (!isPhotoPrintSlotLayer(layer)) continue;
      if (layer.smartCropMode !== "face") continue;
      if (layer.contentType !== "image" || layer.imageAssetId === undefined) continue;

      const assignment = assignmentByFrame.get(layer.id);
      if (assignment?.hasManualCropOverride) continue;
      const asset = assetById.get(layer.imageAssetId);
      if (asset === undefined) continue;

      const src = asset.previewPath ?? asset.originalPath;
      if (!src) continue;

      try {
        const img = await loadHtmlImage(src);
        const focal = await detectFocalPoint(img, src);
        const nextTransform = focalToCenteringTransform(
          focal,
          layer.contentTransform,
          layer.width,
          layer.height,
          img.naturalWidth,
          img.naturalHeight,
          layer.fitMode,
          layer.padding
        );
        nextDoc = updateFrameContentTransform(nextDoc, page.id, layer.id, nextTransform);
      } catch {
        // ignore — keep the engine-set transform
      }
    }
  }
  return nextDoc;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Given a focal point in image coords (0..1), return a ContentTransform with
 * offsetX/offsetY that shifts the focal point toward the cell's center along
 * any axis where the image overflows the cell.
 *
 * In "fill" mode the image MUST always cover the cell (no white space). So
 * face detection can only nudge the image along axes where the image extends
 * beyond the cell. For exact-fit axes (bbox == cell, e.g. after auto-rotate),
 * the clamp pulls the offset back to 0 on that axis — face detection becomes
 * a no-op for that axis, which is the correct behavior given the fill
 * invariant. No auto-zoom is applied: scale + fit semantics stay intact.
 */
function focalToCenteringTransform(
  focal: FocalPoint,
  current: ContentTransform,
  frameWidth: number,
  frameHeight: number,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  fitMode: FitMode,
  padding: number
): ContentTransform {
  // Rotated bbox dims at the current scale.
  const probe = computeContentRect(
    frameWidth,
    frameHeight,
    imageNaturalWidth,
    imageNaturalHeight,
    fitMode,
    { ...current, offsetX: 0, offsetY: 0 },
    padding
  );

  // Where does the focal land in the rotated bbox?
  const rad = ((current.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ax = focal.x - 0.5;
  const ay = focal.y - 0.5;
  const aBbox = 0.5 + ax * cos - ay * sin;
  const bBbox = 0.5 + ax * sin + ay * cos;

  // Offset that would put the focal at the cell center (before clamping).
  const desiredOffsetX = probe.width * (0.5 - aBbox);
  const desiredOffsetY = probe.height * (0.5 - bBbox);

  return clampContentTransformToFillBounds(
    { ...current, offsetX: desiredOffsetX, offsetY: desiredOffsetY },
    frameWidth,
    frameHeight,
    imageNaturalWidth,
    imageNaturalHeight,
    fitMode,
    padding
  );
}

function updateFrameContentTransform(
  document: Document,
  pageId: string,
  frameId: string,
  contentTransform: ContentTransform
): Document {
  return {
    ...document,
    pages: document.pages.map((page) => {
      if (page.id !== pageId) return page;
      return {
        ...page,
        layers: page.layers.map((layer) =>
          layer.id === frameId ? { ...layer, contentTransform } : layer
        )
      };
    })
  };
}

function deduplicateByAssetId(inputs: PhotoPrintImageInput[]): PhotoPrintImageInput[] {
  const seen = new Set<string>();
  return inputs.filter((inp) => {
    if (seen.has(inp.asset.id)) return false;
    seen.add(inp.asset.id);
    return true;
  });
}

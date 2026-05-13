import { createDocument, createPage } from "@/core/document/factory";
import { createId } from "@/core/ids";
import { createFrameLayer, createTextLayer, defaultContentTransform } from "@/core/layers/factory";
import { withProjectMetadata } from "@/core/projectMetadata";
import { measureTextLayerSize } from "@/core/text/measurement";
import type { Asset, Document, Page } from "@/types/document";
import type { ContentTransform, FrameLayer, TextLayer, VisualLayer } from "@/types/layers";
import type {
  MaskCreateOptions,
  MaskFrameMetadata,
  MaskFrameRect,
  MaskImageAssignment,
  MaskImageInput,
  MaskLayoutRule,
  MaskPreset,
  MaskShape,
  MaskTextOverlayRule
} from "@/types/mask";
import type { FitMode, Margins, PageSetup, Rect } from "@/types/primitives";
import type { ProjectMetadataInput } from "@/types/project";

export const DEFAULT_MASK_SIZE = 220;
export const DEFAULT_MASK_SPACING = 24;
export const MIN_MASK_CANVAS_INSET = 8;

export function createMaskModeDocument(name: string, setup: PageSetup, options: Partial<MaskCreateOptions> = {}, projectMetadata: ProjectMetadataInput = {}): Document {
  const maskOptions = normalizeMaskCreateOptions(options);
  const page = createPage({ name: "Mask 1", setup });
  const maskId = createId("mask");
  const linkedGroupId = createId("linked");
  const preset = createBuiltInMaskPreset(maskOptions.maskShape, {
    width: maskOptions.maskWidth,
    height: maskOptions.maskHeight
  });
  const rule = createMaskRule(maskId, preset.id, linkedGroupId, maskOptions);

  return withProjectMetadata({
    ...createDocument({
      name,
      dpi: setup.dpi,
      pages: [{
        ...page,
        metadata: { ...page.metadata, maskId, maskPageIndex: 0 }
      }],
      metadata: {
        mode: "mask",
        activeMaskId: maskId
      }
    }),
    maskRules: [{ ...rule, pageIds: [page.id] }],
    maskPresets: [preset]
  }, { ...projectMetadata, projectType: projectMetadata.projectType ?? "Mask" });
}

export function computeMaskFrameRects(page: Pick<Page, "width" | "height" | "setup">, rule: Pick<MaskLayoutRule, "maskWidth" | "maskHeight" | "margins" | "safeArea" | "spacingX" | "spacingY">): MaskFrameRect[] {
  const left = Math.max(MIN_MASK_CANVAS_INSET, rule.margins.left, rule.safeArea.left);
  const right = Math.max(MIN_MASK_CANVAS_INSET, rule.margins.right, rule.safeArea.right);
  const top = Math.max(MIN_MASK_CANVAS_INSET, rule.margins.top, rule.safeArea.top);
  const bottom = Math.max(MIN_MASK_CANVAS_INSET, rule.margins.bottom, rule.safeArea.bottom);
  const availableWidth = page.width - left - right;
  const availableHeight = page.height - top - bottom;
  const width = Math.max(1, rule.maskWidth);
  const height = Math.max(1, rule.maskHeight);
  const columns = Math.max(1, Math.floor((availableWidth + rule.spacingX) / (width + rule.spacingX)));
  const rows = Math.max(1, Math.floor((availableHeight + rule.spacingY) / (height + rule.spacingY)));
  const rects: MaskFrameRect[] = [];

  if (availableWidth < width || availableHeight < height) {
    return rects;
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      rects.push({
        x: left + column * (width + rule.spacingX),
        y: top + row * (height + rule.spacingY),
        width,
        height,
        row,
        column,
        maskIndexOnPage: row * columns + column
      });
    }
  }

  return rects;
}

export function fillMaskWithImages(document: Document, maskId: string, inputs: MaskImageInput[]): Document {
  const rule = getMaskRule(document, maskId);
  if (rule === undefined) return document;
  const basePage = document.pages.find((page) => page.id === rule.pageIds[0]) ?? document.pages[0];
  if (basePage === undefined) return document;
  const framesPerPage = Math.max(1, computeMaskFrameRects(basePage, rule).length);
  const pageCount = rule.autoCreatePages ? Math.max(1, Math.ceil(Math.max(inputs.length, 1) / framesPerPage)) : Math.max(1, rule.pageIds.length);

  let working = ensureMaskPageCount(document, rule, basePage, pageCount, inputs.length);
  const workingRule = getMaskRule(working, maskId);
  if (workingRule === undefined) return working;
  const frameIds = workingRule.frameIds;
  const nextAssignments: MaskImageAssignment[] = [];

  working = {
    ...working,
    assets: mergeAssets(working.assets, inputs.map((input) => input.asset)),
    pages: working.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => {
        if (layer.type !== "frame" || !frameIds.includes(layer.id)) return layer;
        const frame = getMaskFrameMetadata(layer);
        const input = frame === null ? undefined : inputs[frame.maskIndexGlobal];
        if (input === undefined) {
          return { ...layer, contentType: "empty", imageAssetId: undefined, contentTransform: { ...defaultContentTransform } };
        }
        if (frame === null) return layer;
        nextAssignments.push(createAssignment(workingRule.id, input.asset.id, layer.id, frame.maskIndexGlobal, frame.maskPageIndex, frame.maskIndexOnPage, input));
        return {
          ...layer,
          name: input.asset.name,
          contentType: "image",
          imageAssetId: input.asset.id,
          fitMode: input.manualFitModeOverride ?? workingRule.fitMode,
          contentTransform: input.manualContentTransform ?? { ...defaultContentTransform },
          smartCropMode: workingRule.smartCropEnabled ? "face" : "center"
        };
      })
    })),
    maskImageAssignments: [
      ...working.maskImageAssignments.filter((assignment) => assignment.maskId !== maskId),
      ...nextAssignments
    ]
  };

  return applyTextOverlaysToMask(working, maskId);
}

export function addImagesToMask(document: Document, maskId: string, inputs: MaskImageInput[]): Document {
  if (inputs.length === 0) return document;
  const existingInputs = document.maskImageAssignments
    .filter((assignment) => assignment.maskId === maskId)
    .sort((a, b) => a.globalIndex - b.globalIndex)
    .flatMap((assignment): MaskImageInput[] => {
      const asset = document.assets.find((item) => item.id === assignment.assetId);
      return asset === undefined ? [] : [{ asset, manualContentTransform: assignment.manualContentTransform, manualFitModeOverride: assignment.manualFitModeOverride }];
    });
  return fillMaskWithImages(document, maskId, [...existingInputs, ...inputs]);
}

export function regenerateMaskLayout(document: Document, maskId: string, patch: Partial<MaskLayoutRule>): Document {
  const rule = getMaskRule(document, maskId);
  if (rule === undefined) return document;
  const nextRule = normalizeMaskRulePatch({ ...rule, ...patch });
  const assignments = document.maskImageAssignments
    .filter((assignment) => assignment.maskId === maskId)
    .sort((a, b) => a.globalIndex - b.globalIndex);
  const firstPage = document.pages.find((page) => page.id === rule.pageIds[0]) ?? document.pages[0];
  if (firstPage === undefined) return document;
  const framesPerPage = Math.max(1, computeMaskFrameRects(firstPage, nextRule).length);
  const requiredPages = nextRule.autoCreatePages ? Math.max(1, Math.ceil(Math.max(assignments.length, 1) / framesPerPage)) : nextRule.pageIds.length;
  const cleared = removeMaskFrames(document, maskId);
  const ensured = ensureMaskPageCount({
    ...cleared,
    maskRules: cleared.maskRules.map((item) => item.id === maskId ? { ...nextRule, pageIds: item.pageIds, frameIds: [] } : item)
  }, nextRule, firstPage, requiredPages, assignments.length);
  const inputs = assignments.flatMap((assignment): MaskImageInput[] => {
    const asset = ensured.assets.find((item) => item.id === assignment.assetId);
    return asset === undefined ? [] : [{
      asset,
      manualContentTransform: assignment.hasManualCropOverride || assignment.hasManualRotationOverride ? assignment.manualContentTransform : undefined,
      manualFitModeOverride: assignment.manualFitModeOverride
    }];
  });
  return fillMaskWithImages(ensured, maskId, inputs);
}

export function applyMaskFitModeToAll(document: Document, maskId: string, fitMode: FitMode): Document {
  const rule = getMaskRule(document, maskId);
  if (rule === undefined) return document;
  const manualFrameIds = new Set(document.maskImageAssignments.filter((assignment) => assignment.maskId === maskId && assignment.hasManualCropOverride).map((assignment) => assignment.frameId));
  return {
    ...document,
    maskRules: document.maskRules.map((item) => item.id === maskId ? { ...item, fitMode } : item),
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => layer.type === "frame" && rule.frameIds.includes(layer.id) && !manualFrameIds.has(layer.id) ? { ...layer, fitMode } : layer)
    })),
    maskImageAssignments: document.maskImageAssignments.map((assignment) =>
      assignment.maskId === maskId && !assignment.hasManualCropOverride ? { ...assignment, manualFitModeOverride: undefined } : assignment
    )
  };
}

export function resetMaskCrops(document: Document, maskId: string): Document {
  const rule = getMaskRule(document, maskId);
  if (rule === undefined) return document;
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) =>
        layer.type === "frame" && rule.frameIds.includes(layer.id)
          ? { ...layer, contentTransform: { ...defaultContentTransform }, crop: { x: 0, y: 0, width: 1, height: 1 } }
          : layer
      )
    })),
    maskImageAssignments: document.maskImageAssignments.map((assignment) =>
      assignment.maskId === maskId
        ? { ...assignment, manualCrop: undefined, manualContentTransform: undefined, hasManualCropOverride: false, hasManualRotationOverride: false }
        : assignment
    )
  };
}

export function swapMaskFrameImages(document: Document, maskId: string, frameIdA: string, frameIdB: string): Document {
  const a = document.maskImageAssignments.find((assignment) => assignment.maskId === maskId && assignment.frameId === frameIdA);
  const b = document.maskImageAssignments.find((assignment) => assignment.maskId === maskId && assignment.frameId === frameIdB);
  if (a === undefined || b === undefined) return document;
  const assignmentByFrameId = new Map<string, MaskImageAssignment>([
    [frameIdA, { ...b, id: a.id, frameId: frameIdA, globalIndex: a.globalIndex, pageIndex: a.pageIndex, maskIndexOnPage: a.maskIndexOnPage }],
    [frameIdB, { ...a, id: b.id, frameId: frameIdB, globalIndex: b.globalIndex, pageIndex: b.pageIndex, maskIndexOnPage: b.maskIndexOnPage }]
  ]);
  return applyAssignmentsToFrames({
    ...document,
    maskImageAssignments: document.maskImageAssignments.map((assignment) => assignmentByFrameId.get(assignment.frameId) ?? assignment)
  }, maskId);
}

export function deleteMaskImageAndCompactFromEnd(document: Document, maskId: string, globalIndex: number): Document {
  const sorted = document.maskImageAssignments
    .filter((assignment) => assignment.maskId === maskId)
    .sort((a, b) => a.globalIndex - b.globalIndex);
  if (globalIndex < 0 || globalIndex >= sorted.length) return document;
  const compacted = sorted.slice();
  const last = compacted.at(-1);
  if (last === undefined) return document;
  compacted[globalIndex] = { ...last, globalIndex };
  compacted.pop();
  return fillMaskWithImages(document, maskId, compacted.flatMap((assignment) => {
    const asset = document.assets.find((item) => item.id === assignment.assetId);
    return asset === undefined ? [] : [{ asset, manualContentTransform: assignment.manualContentTransform, manualFitModeOverride: assignment.manualFitModeOverride }];
  }));
}

export function createMaskTextOverlay(document: Document, maskId: string, ruleInput: Partial<MaskTextOverlayRule>): Document {
  const overlay: MaskTextOverlayRule = {
    version: 1,
    id: ruleInput.id ?? createId("mask_text"),
    maskId,
    name: ruleInput.name ?? "Mask text overlay",
    anchor: ruleInput.anchor ?? "bottomCenter",
    relativeX: ruleInput.relativeX ?? 0.5,
    relativeY: ruleInput.relativeY ?? 0.88,
    relativeWidth: ruleInput.relativeWidth ?? 0.9,
    relativeHeight: ruleInput.relativeHeight ?? 0.14,
    offsetX: ruleInput.offsetX ?? 0,
    offsetY: ruleInput.offsetY ?? 0,
    padding: ruleInput.padding ?? 6,
    autoFitText: ruleInput.autoFitText ?? true,
    minFontSize: ruleInput.minFontSize ?? 10,
    maxFontSize: ruleInput.maxFontSize ?? 30,
    textSource: ruleInput.textSource ?? "filename",
    defaultText: ruleInput.defaultText ?? "",
    textStyle: {
      fontFamily: "DM Sans",
      fontWeight: 700,
      fontSize: ruleInput.maxFontSize ?? 30,
      color: "#ffffff",
      alignment: "center",
      direction: "auto",
      ...ruleInput.textStyle
    },
    applyToExistingMasks: ruleInput.applyToExistingMasks ?? true,
    applyToNewMasks: ruleInput.applyToNewMasks ?? true,
    overridable: ruleInput.overridable ?? true,
    textLayerIdsByFrameId: ruleInput.textLayerIdsByFrameId ?? {},
    perFrameOverrides: ruleInput.perFrameOverrides ?? {},
    metadata: ruleInput.metadata ?? {}
  };
  return applyTextOverlaysToMask({
    ...document,
    maskRules: document.maskRules.map((rule) => rule.id === maskId ? { ...rule, textOverlayRuleIds: [...new Set([...rule.textOverlayRuleIds, overlay.id])] } : rule),
    maskTextOverlayRules: [...document.maskTextOverlayRules.filter((item) => item.id !== overlay.id), overlay]
  }, maskId);
}

export function applyTextLayerToAllMaskFrames(document: Document, maskId: string, textLayerId: string): Document {
  const source = document.pages.flatMap((page) => page.layers).find((layer): layer is TextLayer => layer.type === "text" && layer.id === textLayerId);
  if (source === undefined) return document;
  const sourceFrame = findTextSourceFrame(document, maskId, source);
  if (sourceFrame === undefined) return document;
  const relativeWidth = source.width / sourceFrame.width;
  const relativeHeight = source.height / sourceFrame.height;
  const relativeX = (source.x - sourceFrame.x) / sourceFrame.width + relativeWidth / 2;
  const relativeY = (source.y - sourceFrame.y) / sourceFrame.height + relativeHeight / 2;
  const next = createMaskTextOverlay(document, maskId, {
    name: source.name || "Text for all masks",
    anchor: "custom",
    relativeX,
    relativeY,
    relativeWidth,
    relativeHeight,
    offsetX: 0,
    offsetY: 0,
    padding: 0,
    autoFitText: false,
    minFontSize: Math.max(6, Math.round(source.fontSize * 0.5)),
    maxFontSize: source.fontSize,
    textSource: "manual",
    defaultText: source.text,
    textStyle: {
      fontFamily: source.fontFamily,
      fontWeight: source.fontWeight,
      fontStyle: source.fontStyle,
      fontSize: source.fontSize,
      color: source.color,
      alignment: source.alignment,
      direction: source.direction,
      letterSpacing: source.letterSpacing,
      lineHeight: source.lineHeight
    },
    applyToExistingMasks: true,
    applyToNewMasks: true
  });

  if (source.metadata["maskText"] !== undefined) return next;
  return {
    ...next,
    pages: next.pages.map((page) => ({
      ...page,
      layers: page.layers.filter((layer) => layer.id !== source.id)
    }))
  };
}

export function cleanFilenameForMaskText(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim();
}

export function isMaskFrameLayer(layer: VisualLayer): layer is FrameLayer {
  return layer.type === "frame" && layer.metadata["maskFrame"] !== undefined;
}

function normalizeMaskCreateOptions(options: Partial<MaskCreateOptions>): MaskCreateOptions {
  const width = Math.max(1, options.maskWidth ?? DEFAULT_MASK_SIZE);
  const height = Math.max(1, options.keepProportions ?? true ? options.maskHeight ?? width : options.maskHeight ?? DEFAULT_MASK_SIZE);
  return {
    name: options.name ?? "Mask",
    maskShape: options.maskShape ?? "circle",
    maskWidth: width,
    maskHeight: height,
    keepProportions: options.keepProportions ?? true,
    margins: options.margins ?? { top: 0, right: 0, bottom: 0, left: 0 },
    spacingX: Math.max(0, options.spacingX ?? DEFAULT_MASK_SPACING),
    spacingY: Math.max(0, options.spacingY ?? DEFAULT_MASK_SPACING),
    fitMode: options.fitMode ?? "fill",
    smartCropEnabled: options.smartCropEnabled ?? true,
    autoCreatePages: options.autoCreatePages ?? true
  };
}

function createBuiltInMaskPreset(shape: MaskShape, defaultSize: { width: number; height: number }): MaskPreset {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: createId("mask_preset"),
    name: shapeLabel(shape),
    type: "builtInShape",
    shape,
    defaultSize,
    keepProportionsDefault: true,
    createdAt: now,
    updatedAt: now,
    metadata: {}
  };
}

function createMaskRule(maskId: string, presetId: string, linkedGroupId: string, options: MaskCreateOptions): MaskLayoutRule {
  return {
    version: 1,
    id: maskId,
    name: options.name ?? "Mask",
    pageIds: [],
    frameIds: [],
    maskPresetId: presetId,
    maskShape: options.maskShape,
    maskWidth: options.maskWidth,
    maskHeight: options.maskHeight,
    keepProportions: options.keepProportions ?? true,
    margins: options.margins,
    safeArea: options.margins,
    spacingX: options.spacingX,
    spacingY: options.spacingY,
    arrangement: "packedRows",
    fitMode: options.fitMode ?? "fill",
    autoCreatePages: options.autoCreatePages ?? true,
    imageDeleteBehavior: "fillFromLastUsedImage",
    dragDropBehavior: "swapImages",
    smartCropEnabled: options.smartCropEnabled ?? true,
    linkedGroupId,
    textOverlayRuleIds: [],
    metadata: {}
  };
}

function normalizeMaskRulePatch(rule: MaskLayoutRule): MaskLayoutRule {
  const width = Math.max(1, rule.maskWidth);
  const height = Math.max(1, rule.keepProportions ? rule.maskHeight || width : rule.maskHeight);
  return {
    ...rule,
    maskWidth: width,
    maskHeight: height,
    spacingX: Math.max(0, rule.spacingX),
    spacingY: Math.max(0, rule.spacingY)
  };
}

function createMaskPage(page: Page, rule: MaskLayoutRule, pageIndex: number, maxFramesOnPage?: number): { page: Page; rule: MaskLayoutRule } {
  const rects = computeMaskFrameRects(page, rule);
  const frameRects = maxFramesOnPage === undefined ? rects : rects.slice(0, Math.max(0, maxFramesOnPage));
  const frames = frameRects.map((rect, index) => createMaskFrame(rule, rect, pageIndex, pageIndex * rects.length + index));
  return {
    page: {
      ...page,
      metadata: { ...page.metadata, maskId: rule.id, maskPageIndex: pageIndex },
      layers: [...page.layers.filter((layer) => !isMaskFrameForRule(layer, rule.id)), ...frames]
    },
    rule: {
      ...rule,
      pageIds: [...new Set([...rule.pageIds, page.id])],
      frameIds: [...rule.frameIds, ...frames.map((frame) => frame.id)]
    }
  };
}

function createMaskFrame(rule: MaskLayoutRule, rect: MaskFrameRect, pageIndex: number, globalIndex: number): FrameLayer {
  const metadata: MaskFrameMetadata = {
    maskId: rule.id,
    maskPageIndex: pageIndex,
    maskIndexGlobal: globalIndex,
    maskIndexOnPage: rect.maskIndexOnPage,
    row: rect.row,
    column: rect.column,
    isMaskFrame: true,
    layoutManaged: true,
    maskShape: rule.maskShape
  };
  return createFrameLayer({
    name: `Mask ${globalIndex + 1}`,
    rect,
    behaviorMode: "layoutLocked",
    shape: frameShapeForMask(rule.maskShape),
    contentType: "empty",
    fitMode: rule.fitMode,
    linkedGroup: rule.linkedGroupId,
    batchIndex: globalIndex,
    lockedFrame: true,
    cornerRadius: rule.maskShape === "roundedRect" ? Math.min(rect.width, rect.height) * 0.18 : undefined,
    smartCropMode: rule.smartCropEnabled ? "face" : "center",
    zIndex: globalIndex,
    metadata: { maskFrame: metadata }
  });
}

function ensureMaskPageCount(document: Document, rule: MaskLayoutRule, basePage: Page, pageCount: number, desiredFrameCount: number): Document {
  let pages = document.pages.slice();
  let nextRule = document.maskRules.find((item) => item.id === rule.id) ?? rule;
  const framesPerPage = Math.max(1, computeMaskFrameRects(basePage, rule).length);

  for (let index = 0; index < pageCount; index += 1) {
    const existingPage = pages.find((page) => page.id === nextRule.pageIds[index]) ?? (index === 0 ? basePage : undefined);
    const source = existingPage ?? {
      ...createPage({ name: `Mask ${index + 1}`, setup: basePage.setup }),
      metadata: { ...basePage.metadata, name: `Mask ${index + 1}`, maskId: rule.id, maskPageIndex: index },
      layers: []
    };
    const cleaned = { ...source, layers: source.layers.filter((layer) => !isMaskFrameForRule(layer, rule.id)) };
    const remainingFrames = Math.max(0, desiredFrameCount - index * framesPerPage);
    const result = createMaskPage(cleaned, { ...nextRule, frameIds: nextRule.frameIds.filter((frameId) => !source.layers.some((layer) => layer.id === frameId)) }, index, Math.min(framesPerPage, remainingFrames));
    pages = pages.some((page) => page.id === result.page.id)
      ? pages.map((page) => page.id === result.page.id ? result.page : page)
      : [...pages, result.page];
    nextRule = result.rule;
  }

  const allowedPageIds = new Set(nextRule.pageIds.slice(0, pageCount));
  nextRule = {
    ...nextRule,
    pageIds: nextRule.pageIds.filter((pageId) => allowedPageIds.has(pageId)),
    frameIds: pages.flatMap((page) => page.layers.filter((layer) => isMaskFrameForRule(layer, rule.id)).map((layer) => layer.id))
  };
  return {
    ...document,
    pages,
    maskRules: document.maskRules.map((item) => item.id === rule.id ? nextRule : item)
  };
}

function removeMaskFrames(document: Document, maskId: string): Document {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.filter((layer) => !isMaskFrameForRule(layer, maskId) && !isMaskTextForRule(layer, maskId))
    })),
    maskRules: document.maskRules.map((rule) => rule.id === maskId ? { ...rule, frameIds: [] } : rule),
    maskTextOverlayRules: document.maskTextOverlayRules.map((rule) => rule.maskId === maskId ? { ...rule, textLayerIdsByFrameId: {} } : rule)
  };
}

function applyAssignmentsToFrames(document: Document, maskId: string): Document {
  const assignmentByFrameId = new Map(document.maskImageAssignments.filter((assignment) => assignment.maskId === maskId).map((assignment) => [assignment.frameId, assignment]));
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => {
        if (layer.type !== "frame") return layer;
        const assignment = assignmentByFrameId.get(layer.id);
        if (assignment === undefined) return layer;
        return {
          ...layer,
          imageAssetId: assignment.assetId,
          contentType: "image",
          contentTransform: assignment.manualContentTransform ?? layer.contentTransform,
          fitMode: assignment.manualFitModeOverride ?? layer.fitMode
        };
      })
    }))
  };
}

function applyTextOverlaysToMask(document: Document, maskId: string): Document {
  const rule = getMaskRule(document, maskId);
  if (rule === undefined) return document;
  const overlays = document.maskTextOverlayRules.filter((overlay) => overlay.maskId === maskId && overlay.applyToExistingMasks);
  if (overlays.length === 0) return document;
  const assignmentsByFrame = new Map(document.maskImageAssignments.filter((assignment) => assignment.maskId === maskId).map((assignment) => [assignment.frameId, assignment]));
  let updatedOverlays = overlays;
  const pages = document.pages.map((page) => {
    let layers = page.layers.slice();
    page.layers.filter((layer): layer is FrameLayer => layer.type === "frame" && isMaskFrameForRule(layer, maskId)).forEach((frame) => {
      overlays.forEach((overlay) => {
        if (overlay.textLayerIdsByFrameId[frame.id] !== undefined) return;
        const assignment = assignmentsByFrame.get(frame.id);
        const asset = assignment === undefined ? undefined : document.assets.find((item) => item.id === assignment.assetId);
        const textLayer = createOverlayTextLayer(frame, overlay, asset, assignment?.globalIndex ?? getMaskFrameMetadata(frame)?.maskIndexGlobal ?? 0);
        layers = [...layers, textLayer];
        updatedOverlays = updatedOverlays.map((item) => item.id === overlay.id ? { ...item, textLayerIdsByFrameId: { ...item.textLayerIdsByFrameId, [frame.id]: textLayer.id } } : item);
      });
    });
    return { ...page, layers };
  });
  return {
    ...document,
    pages,
    maskTextOverlayRules: document.maskTextOverlayRules.map((overlay) => updatedOverlays.find((item) => item.id === overlay.id) ?? overlay)
  };
}

function createOverlayTextLayer(frame: FrameLayer, overlay: MaskTextOverlayRule, asset: Asset | undefined, globalIndex: number): TextLayer {
  const rect = overlayRect(frame, overlay);
  const layer = createTextLayer({
    name: `${overlay.name} ${globalIndex + 1}`,
    text: textForOverlay(overlay, asset, globalIndex),
    rect,
    linkedSlotId: frame.id,
    zIndex: frame.zIndex + 10000,
    metadata: {
      maskText: {
        maskId: overlay.maskId,
        overlayRuleId: overlay.id,
        frameId: frame.id,
        hasContentOverride: false,
        hasPositionOverride: false
      }
    }
  });
  const styled = {
    ...layer,
    ...overlay.textStyle,
    alignment: overlay.textStyle.alignment ?? layer.alignment,
    direction: overlay.textStyle.direction ?? layer.direction,
    fontSize: overlay.autoFitText ? overlay.maxFontSize : overlay.textStyle.fontSize ?? layer.fontSize
  } as TextLayer;
  const measured = measureTextLayerSize(styled);
  return { ...styled, width: Math.min(rect.width, measured.width), height: overlay.relativeHeight === undefined ? measured.height : rect.height };
}

function overlayRect(frame: FrameLayer, overlay: MaskTextOverlayRule): Rect {
  const width = frame.width * overlay.relativeWidth;
  const height = frame.height * (overlay.relativeHeight ?? 0.14);
  const anchor = anchorPoint(overlay);
  return {
    x: frame.x + frame.width * anchor.x - width * anchor.boxX + overlay.offsetX,
    y: frame.y + frame.height * anchor.y - height * anchor.boxY + overlay.offsetY,
    width: Math.max(8, width - overlay.padding * 2),
    height: Math.max(8, height - overlay.padding * 2)
  };
}

function anchorPoint(overlay: MaskTextOverlayRule): { x: number; y: number; boxX: number; boxY: number } {
  const map = {
    topLeft: { x: 0, y: 0, boxX: 0, boxY: 0 },
    topCenter: { x: 0.5, y: 0, boxX: 0.5, boxY: 0 },
    topRight: { x: 1, y: 0, boxX: 1, boxY: 0 },
    centerLeft: { x: 0, y: 0.5, boxX: 0, boxY: 0.5 },
    center: { x: 0.5, y: 0.5, boxX: 0.5, boxY: 0.5 },
    centerRight: { x: 1, y: 0.5, boxX: 1, boxY: 0.5 },
    bottomLeft: { x: 0, y: 1, boxX: 0, boxY: 1 },
    bottomCenter: { x: 0.5, y: 1, boxX: 0.5, boxY: 1 },
    bottomRight: { x: 1, y: 1, boxX: 1, boxY: 1 },
    custom: { x: overlay.relativeX, y: overlay.relativeY, boxX: 0.5, boxY: 0.5 }
  };
  return map[overlay.anchor];
}

function textForOverlay(overlay: MaskTextOverlayRule, asset: Asset | undefined, globalIndex: number): string {
  if (overlay.textSource === "filename") return cleanFilenameForMaskText(asset?.name ?? "");
  if (overlay.textSource === "index") return String(globalIndex + 1);
  if (overlay.textSource === "empty") return "";
  return overlay.defaultText;
}

function findTextSourceFrame(document: Document, maskId: string, source: TextLayer): FrameLayer | undefined {
  if (source.linkedSlotId !== undefined) {
    const linkedFrame = document.pages.flatMap((page) => page.layers).find((layer): layer is FrameLayer => layer.type === "frame" && layer.id === source.linkedSlotId);
    if (linkedFrame !== undefined) return linkedFrame;
  }
  const centerX = source.x + source.width / 2;
  const centerY = source.y + source.height / 2;
  return document.pages
    .flatMap((page) => page.layers)
    .find((layer): layer is FrameLayer =>
      layer.type === "frame" &&
      isMaskFrameForRule(layer, maskId) &&
      centerX >= layer.x &&
      centerX <= layer.x + layer.width &&
      centerY >= layer.y &&
      centerY <= layer.y + layer.height
    );
}

function createAssignment(maskId: string, assetId: string, frameId: string, globalIndex: number, pageIndex: number, maskIndexOnPage: number, input: MaskImageInput): MaskImageAssignment {
  return {
    version: 1,
    id: createId("mask_assignment"),
    maskId,
    assetId,
    frameId,
    globalIndex,
    pageIndex,
    maskIndexOnPage,
    manualContentTransform: input.manualContentTransform,
    manualFitModeOverride: input.manualFitModeOverride,
    hasManualCropOverride: input.manualContentTransform !== undefined,
    hasManualRotationOverride: input.manualContentTransform !== undefined && input.manualContentTransform.rotation !== 0
  };
}

function mergeAssets(existing: Asset[], incoming: Asset[]): Asset[] {
  const ids = new Set(existing.map((asset) => asset.id));
  return [...existing, ...incoming.filter((asset) => !ids.has(asset.id))];
}

function getMaskRule(document: Document, maskId: string): MaskLayoutRule | undefined {
  return document.maskRules.find((rule) => rule.id === maskId);
}

function getMaskFrameMetadata(layer: VisualLayer): MaskFrameMetadata | null {
  const value = layer.metadata["maskFrame"];
  return isMaskFrameMetadata(value) ? value : null;
}

function isMaskFrameForRule(layer: VisualLayer, maskId: string): boolean {
  return getMaskFrameMetadata(layer)?.maskId === maskId;
}

function isMaskTextForRule(layer: VisualLayer, maskId: string): boolean {
  const value = layer.metadata["maskText"];
  return typeof value === "object" && value !== null && "maskId" in value && value.maskId === maskId;
}

function isMaskFrameMetadata(value: unknown): value is MaskFrameMetadata {
  return typeof value === "object" && value !== null && "isMaskFrame" in value && value.isMaskFrame === true;
}

function frameShapeForMask(shape: MaskShape): FrameLayer["shape"] {
  if (shape === "circle") return "circle";
  if (shape === "roundedRect") return "rect";
  if (shape === "heart" || shape === "star") return "svgPath";
  return "customMask";
}

function shapeLabel(shape: MaskShape): string {
  const labels: Record<MaskShape, string> = {
    circle: "Circle",
    heart: "Heart",
    roundedRect: "Rounded rectangle",
    star: "Star",
    custom: "Custom"
  };
  return labels[shape];
}

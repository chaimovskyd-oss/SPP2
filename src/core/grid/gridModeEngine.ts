import { createDocument, createPage } from "@/core/document/factory";
import { createId } from "@/core/ids";
import { createFrameLayer, createTextLayer, defaultContentTransform } from "@/core/layers/factory";
import { withProjectMetadata } from "@/core/projectMetadata";
import { measureTextLayerSize } from "@/core/text/measurement";
import type { Asset, Document, Page } from "@/types/document";
import type { FrameLayer, TextLayer, VisualLayer } from "@/types/layers";
import type { ContentTransform } from "@/types/layers";
import type { GridCellMetadata, GridCellRect, GridCreateOptions, GridImageAssignment, GridImageInput, GridLayoutRule, GridTextOverlayRule } from "@/types/grid";
import type { FitMode, JsonValue, Margins, Metadata, PageSetup, Rect } from "@/types/primitives";
import type { ProjectMetadataInput } from "@/types/project";

export const DEFAULT_GRID_ROWS = 2;
export const DEFAULT_GRID_COLUMNS = 3;
export const DEFAULT_GRID_SPACING = 24;

function metadataWithImageEditParams(metadata: Metadata, imageEditParams: GridImageInput["imageEditParams"]): Metadata {
  const { imageEditParams: _discarded, ...rest } = metadata;
  return imageEditParams === undefined
    ? rest
    : { ...rest, imageEditParams: imageEditParams as unknown as JsonValue };
}

export function createGridModeDocument(name: string, setup: PageSetup, options: Partial<GridCreateOptions> = {}, projectMetadata: ProjectMetadataInput = {}): Document {
  const gridOptions = normalizeGridCreateOptions(options);
  const page = createPage({ name: "Grid 1", setup });
  const gridId = createId("grid");
  const linkedGroupId = createId("linked");
  const rule = createGridRule(gridId, linkedGroupId, gridOptions);
  const { page: pageWithCells, rule: ruleWithCells } = createGridPage(page, rule, 0);
  return withProjectMetadata({
    ...createDocument({
      name,
      dpi: setup.dpi,
      pages: [pageWithCells],
      metadata: {
        mode: "grid",
        activeGridId: gridId
      }
    }),
    gridRules: [ruleWithCells]
  }, { ...projectMetadata, projectType: projectMetadata.projectType ?? "Grid" });
}

export function computeGridCellRects(page: Pick<Page, "width" | "height">, rule: Pick<GridLayoutRule, "rows" | "columns" | "margins" | "spacingX" | "spacingY" | "fillDirection">): GridCellRect[] {
  const rows = Math.max(1, Math.floor(rule.rows));
  const columns = Math.max(1, Math.floor(rule.columns));
  const availableWidth = Math.max(1, page.width - rule.margins.left - rule.margins.right);
  const availableHeight = Math.max(1, page.height - rule.margins.top - rule.margins.bottom);
  const cellWidth = Math.max(1, (availableWidth - rule.spacingX * (columns - 1)) / columns);
  const cellHeight = Math.max(1, (availableHeight - rule.spacingY * (rows - 1)) / rows);
  const rects: GridCellRect[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let orderColumn = 0; orderColumn < columns; orderColumn += 1) {
      const column = rule.fillDirection === "rtl" ? columns - 1 - orderColumn : orderColumn;
      const cellIndexOnPage = row * columns + orderColumn;
      rects.push({
        x: rule.margins.left + column * (cellWidth + rule.spacingX),
        y: rule.margins.top + row * (cellHeight + rule.spacingY),
        width: cellWidth,
        height: cellHeight,
        row,
        column,
        cellIndexOnPage
      });
    }
  }

  return rects;
}

export function fillGridWithImages(document: Document, gridId: string, inputs: GridImageInput[]): Document {
  const rule = getGridRule(document, gridId);
  if (rule === undefined) return document;
  const cellsPerPage = rule.rows * rule.columns;
  const pageCount = rule.autoCreatePages ? Math.max(1, Math.ceil(inputs.length / cellsPerPage)) : Math.max(1, rule.pageIds.length);
  const basePage = document.pages.find((page) => page.id === rule.pageIds[0]) ?? document.pages[0];
  if (basePage === undefined) return document;

  let working = ensureGridPageCount(document, rule, basePage, pageCount);
  const workingRule = getGridRule(working, gridId);
  if (workingRule === undefined) return working;
  const frameIds = workingRule.frameIds;
  const nextAssignments: GridImageAssignment[] = [];

  working = {
    ...working,
    assets: mergeAssets(working.assets, inputs.map((input) => input.asset)),
    pages: working.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => {
        if (layer.type !== "frame" || !frameIds.includes(layer.id)) return layer;
        const cell = getGridCellMetadata(layer);
        const input = cell === null ? undefined : inputs[cell.cellIndexGlobal];
        if (input === undefined) {
          return { ...layer, contentType: "empty", imageAssetId: undefined, contentTransform: { ...defaultContentTransform } };
        }
        if (cell === null) return layer;
        nextAssignments.push(createAssignment(workingRule.id, input.asset.id, layer.id, cell.cellIndexGlobal, cell.gridPageIndex, cell.cellIndexOnPage, input));
        return {
          ...layer,
          name: input.asset.name,
          contentType: "image",
          imageAssetId: input.asset.id,
          fitMode: input.manualFitModeOverride ?? workingRule.fitMode,
          contentTransform: input.manualContentTransform ?? autoRotationTransform(input.asset, layer, workingRule.autoRotatePolicy),
          visualEffects: input.visualEffects ?? layer.visualEffects,
          metadata: metadataWithImageEditParams(layer.metadata, input.imageEditParams)
        };
      })
    })),
    gridImageAssignments: [
      ...working.gridImageAssignments.filter((assignment) => assignment.gridId !== gridId),
      ...nextAssignments
    ]
  };

  return applyTextOverlaysToGrid(working, gridId);
}

export function addImagesToGrid(document: Document, gridId: string, inputs: GridImageInput[]): Document {
  if (inputs.length === 0) return document;
  const existingInputs = document.gridImageAssignments
    .filter((assignment) => assignment.gridId === gridId)
    .sort((a, b) => a.globalIndex - b.globalIndex)
    .flatMap((assignment): GridImageInput[] => {
      const asset = document.assets.find((item) => item.id === assignment.assetId);
      if (asset === undefined) return [];
      return [{
        asset,
        manualContentTransform: assignment.manualContentTransform,
        manualFitModeOverride: assignment.manualFitModeOverride,
        imageEditParams: assignment.imageEditParams,
        visualEffects: assignment.visualEffects
      }];
    });

  return fillGridWithImages(document, gridId, [...existingInputs, ...inputs]);
}

export function isGridCellLayer(layer: VisualLayer): layer is FrameLayer {
  return layer.type === "frame" && layer.metadata["gridCell"] !== undefined;
}

export function regenerateGrid(document: Document, gridId: string, patch: Partial<GridLayoutRule>): Document {
  const rule = getGridRule(document, gridId);
  if (rule === undefined) return document;
  const nextRule: GridLayoutRule = { ...rule, ...patch };
  const assignments = document.gridImageAssignments
    .filter((assignment) => assignment.gridId === gridId)
    .sort((a, b) => a.globalIndex - b.globalIndex);
  const cellsPerPage = Math.max(1, nextRule.rows * nextRule.columns);
  const requiredPages = nextRule.autoCreatePages ? Math.max(1, Math.ceil(Math.max(assignments.length, 1) / cellsPerPage)) : nextRule.pageIds.length;
  const firstPage = document.pages.find((page) => page.id === rule.pageIds[0]) ?? document.pages[0];
  if (firstPage === undefined) return document;
  const cleared = removeGridCells(document, gridId);
  const ensured = ensureGridPageCount(
    {
      ...cleared,
      gridRules: cleared.gridRules.map((item) => (item.id === gridId ? { ...nextRule, pageIds: item.pageIds, frameIds: [] } : item))
    },
    nextRule,
    firstPage,
    requiredPages
  );
  const inputs: Array<GridImageInput | null> = assignments.map((assignment) => {
    const asset = ensured.assets.find((item) => item.id === assignment.assetId);
    return asset === undefined ? null : {
      asset,
      manualContentTransform: assignment.hasManualCropOverride || assignment.hasManualRotationOverride ? assignment.manualContentTransform : undefined,
      manualFitModeOverride: assignment.manualFitModeOverride,
      imageEditParams: assignment.imageEditParams,
      visualEffects: assignment.visualEffects
    };
  });
  return fillGridWithImages(ensured, gridId, inputs.filter((input): input is GridImageInput => input !== null));
}

export function swapGridCellImages(document: Document, gridId: string, frameIdA: string, frameIdB: string): Document {
  const a = document.gridImageAssignments.find((assignment) => assignment.gridId === gridId && assignment.frameId === frameIdA);
  const b = document.gridImageAssignments.find((assignment) => assignment.gridId === gridId && assignment.frameId === frameIdB);
  if (a === undefined || b === undefined) return document;
  const assignmentByFrameId = new Map<string, GridImageAssignment>([
    [frameIdA, { ...b, id: a.id, frameId: frameIdA, globalIndex: a.globalIndex, pageIndex: a.pageIndex, cellIndexOnPage: a.cellIndexOnPage }],
    [frameIdB, { ...a, id: b.id, frameId: frameIdB, globalIndex: b.globalIndex, pageIndex: b.pageIndex, cellIndexOnPage: b.cellIndexOnPage }]
  ]);
  return applyAssignmentsToFrames({
    ...document,
    gridImageAssignments: document.gridImageAssignments.map((assignment) => assignmentByFrameId.get(assignment.frameId) ?? assignment)
  }, gridId);
}

export function deleteGridImageAndCompactFromEnd(document: Document, gridId: string, globalIndex: number): Document {
  const sorted = document.gridImageAssignments
    .filter((assignment) => assignment.gridId === gridId)
    .sort((a, b) => a.globalIndex - b.globalIndex);
  if (globalIndex < 0 || globalIndex >= sorted.length) return document;
  const compacted = sorted.slice();
  const last = compacted.at(-1);
  if (last === undefined) return document;
  compacted[globalIndex] = { ...last, globalIndex };
  compacted.pop();
  return fillGridWithImages(document, gridId, compacted.flatMap((assignment) => {
    const asset = document.assets.find((item) => item.id === assignment.assetId);
    return asset === undefined ? [] : [{
      asset,
      manualContentTransform: assignment.manualContentTransform,
      manualFitModeOverride: assignment.manualFitModeOverride,
      imageEditParams: assignment.imageEditParams,
      visualEffects: assignment.visualEffects
    }];
  }));
}

export function applyGridFitModeToAll(document: Document, gridId: string, fitMode: FitMode): Document {
  const rule = getGridRule(document, gridId);
  if (rule === undefined) return document;
  const manualFrameIds = new Set(document.gridImageAssignments.filter((assignment) => assignment.gridId === gridId && assignment.hasManualCropOverride).map((assignment) => assignment.frameId));
  return {
    ...document,
    gridRules: document.gridRules.map((item) => (item.id === gridId ? { ...item, fitMode } : item)),
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => layer.type === "frame" && rule.frameIds.includes(layer.id) && !manualFrameIds.has(layer.id) ? { ...layer, fitMode } : layer)
    })),
    gridImageAssignments: document.gridImageAssignments.map((assignment) =>
      assignment.gridId === gridId && !assignment.hasManualCropOverride ? { ...assignment, manualFitModeOverride: undefined } : assignment
    )
  };
}

export function resetGridCrops(document: Document, gridId: string): Document {
  const rule = getGridRule(document, gridId);
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
    gridImageAssignments: document.gridImageAssignments.map((assignment) =>
      assignment.gridId === gridId
        ? { ...assignment, manualCrop: undefined, manualContentTransform: undefined, hasManualCropOverride: false, hasManualRotationOverride: false }
        : assignment
    )
  };
}

export function createGridTextOverlay(document: Document, gridId: string, ruleInput: Partial<GridTextOverlayRule>): Document {
  const overlay: GridTextOverlayRule = {
    version: 1,
    id: ruleInput.id ?? createId("grid_text"),
    gridId,
    name: ruleInput.name ?? "Grid text overlay",
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
    maxFontSize: ruleInput.maxFontSize ?? 32,
    textSource: ruleInput.textSource ?? "filename",
    defaultText: ruleInput.defaultText ?? "",
    textStyle: {
      fontFamily: "DM Sans",
      fontWeight: 700,
      fontSize: ruleInput.maxFontSize ?? 32,
      color: "#ffffff",
      alignment: "center",
      direction: "auto",
      ...ruleInput.textStyle
    },
    applyToExistingCells: ruleInput.applyToExistingCells ?? true,
    applyToNewCells: ruleInput.applyToNewCells ?? true,
    overridable: ruleInput.overridable ?? true,
    textLayerIdsByFrameId: ruleInput.textLayerIdsByFrameId ?? {},
    perCellOverrides: ruleInput.perCellOverrides ?? {},
    metadata: ruleInput.metadata ?? {}
  };
  const next = {
    ...document,
    gridRules: document.gridRules.map((rule) => rule.id === gridId ? { ...rule, textOverlayRuleIds: [...new Set([...rule.textOverlayRuleIds, overlay.id])] } : rule),
    gridTextOverlayRules: [...document.gridTextOverlayRules.filter((item) => item.id !== overlay.id), overlay]
  };
  return applyTextOverlaysToGrid(next, gridId);
}

export function applyTextLayerToAllGridCells(document: Document, gridId: string, textLayerId: string): Document {
  const source = document.pages.flatMap((page) => page.layers).find((layer): layer is TextLayer => layer.type === "text" && layer.id === textLayerId);
  if (source === undefined) return document;
  const sourceFrame = findTextSourceFrame(document, gridId, source);
  if (sourceFrame === undefined) return document;

  const relativeWidth = source.width / sourceFrame.width;
  const relativeHeight = source.height / sourceFrame.height;
  const relativeX = (source.x - sourceFrame.x) / sourceFrame.width + relativeWidth / 2;
  const relativeY = (source.y - sourceFrame.y) / sourceFrame.height + relativeHeight / 2;
  const next = createGridTextOverlay(document, gridId, {
    name: source.name || "טקסט לכל התאים",
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
    applyToExistingCells: true,
    applyToNewCells: true
  });

  if (source.metadata["gridText"] !== undefined) return next;
  return {
    ...next,
    pages: next.pages.map((page) => ({
      ...page,
      layers: page.layers.filter((layer) => layer.id !== source.id)
    }))
  };
}

export function updateGridTextOverlayRule(
  document: Document,
  overlayRuleId: string,
  patch: Partial<GridTextOverlayRule>,
  options: { applyStyle?: boolean; applyPosition?: boolean; resetOverrides?: boolean } = {}
): Document {
  const before = document.gridTextOverlayRules.find((rule) => rule.id === overlayRuleId);
  if (before === undefined) return document;
  const nextRule: GridTextOverlayRule = {
    ...before,
    ...patch,
    textStyle: {
      ...before.textStyle,
      ...patch.textStyle
    },
    perCellOverrides: options.resetOverrides === true ? {} : before.perCellOverrides
  };
  const textLayerIds = new Set(Object.values(nextRule.textLayerIdsByFrameId));
  const frameById = new Map(document.pages.flatMap((page) => page.layers).filter((layer): layer is FrameLayer => layer.type === "frame").map((frame) => [frame.id, frame]));
  const frameIdByTextLayerId = new Map(Object.entries(nextRule.textLayerIdsByFrameId).map(([frameId, textLayerId]) => [textLayerId, frameId]));

  return {
    ...document,
    gridTextOverlayRules: document.gridTextOverlayRules.map((rule) => rule.id === overlayRuleId ? nextRule : rule),
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => {
        if (layer.type !== "text" || !textLayerIds.has(layer.id)) return layer;
        const frameId = frameIdByTextLayerId.get(layer.id);
        const frame = frameId === undefined ? undefined : frameById.get(frameId);
        const override = frameId === undefined ? undefined : nextRule.perCellOverrides[frameId];
        let next: TextLayer = layer;
        if (options.applyStyle === true && override?.textStyle === undefined) {
          next = {
            ...next,
            ...nextRule.textStyle,
            alignment: nextRule.textStyle.alignment ?? next.alignment,
            direction: nextRule.textStyle.direction ?? next.direction
          };
        }
        if (options.applyPosition === true && frame !== undefined && override?.relativeX === undefined && override?.relativeY === undefined) {
          const rect = overlayRect(frame, nextRule);
          next = { ...next, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
        return next;
      })
    }))
  };
}

export function cleanFilenameForGridText(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim();
}

function findTextSourceFrame(document: Document, gridId: string, source: TextLayer): FrameLayer | undefined {
  const gridText = source.metadata["gridText"];
  if (typeof gridText === "object" && gridText !== null && "frameId" in gridText && typeof gridText.frameId === "string") {
    return document.pages.flatMap((page) => page.layers).find((layer): layer is FrameLayer => layer.type === "frame" && layer.id === gridText.frameId);
  }
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
      isGridCellForRule(layer, gridId) &&
      centerX >= layer.x &&
      centerX <= layer.x + layer.width &&
      centerY >= layer.y &&
      centerY <= layer.y + layer.height
    );
}

function normalizeGridCreateOptions(options: Partial<GridCreateOptions>): GridCreateOptions {
  return {
    name: options.name ?? "Grid",
    rows: Math.max(1, Math.floor(options.rows ?? DEFAULT_GRID_ROWS)),
    columns: Math.max(1, Math.floor(options.columns ?? DEFAULT_GRID_COLUMNS)),
    margins: options.margins ?? { top: 0, right: 0, bottom: 0, left: 0 },
    spacingX: Math.max(0, options.spacingX ?? DEFAULT_GRID_SPACING),
    spacingY: Math.max(0, options.spacingY ?? DEFAULT_GRID_SPACING),
    fillDirection: options.fillDirection ?? "rtl",
    fitMode: options.fitMode ?? "fill",
    autoCreatePages: options.autoCreatePages ?? true
  };
}

function createGridRule(gridId: string, linkedGroupId: string, options: GridCreateOptions): GridLayoutRule {
  return {
    version: 1,
    id: gridId,
    name: options.name ?? "Grid",
    pageIds: [],
    frameIds: [],
    rows: options.rows,
    columns: options.columns,
    margins: options.margins,
    spacingX: options.spacingX,
    spacingY: options.spacingY,
    fillDirection: options.fillDirection ?? "rtl",
    fillOrder: "rowMajor",
    fitMode: options.fitMode ?? "fill",
    autoCreatePages: options.autoCreatePages ?? true,
    removeUnusedTrailingCells: true,
    imageOverflowBehavior: "createPages",
    imageDeleteBehavior: "fillFromLastUsedImage",
    dragDropBehavior: "swapImages",
    autoRotatePolicy: "none",
    orientationPolicy: "allowMixed",
    preserveManualRotationOnRegenerate: true,
    preserveManualCropAsMuchAsPossible: true,
    preserveImageAssignmentByStableIndex: true,
    linkedGroupId,
    textOverlayRuleIds: [],
    metadata: {}
  };
}

function createGridPage(page: Page, rule: GridLayoutRule, pageIndex: number): { page: Page; rule: GridLayoutRule } {
  const rects = computeGridCellRects(page, rule);
  const frames = rects.map((rect, index) => createGridCellFrame(rule, rect, pageIndex, pageIndex * rects.length + index));
  return {
    page: {
      ...page,
      layers: [...page.layers.filter((layer) => !isGridCellForRule(layer, rule.id)), ...frames]
    },
    rule: {
      ...rule,
      pageIds: [...new Set([...rule.pageIds, page.id])],
      frameIds: [...rule.frameIds, ...frames.map((frame) => frame.id)]
    }
  };
}

function createGridCellFrame(rule: GridLayoutRule, rect: GridCellRect, pageIndex: number, globalIndex: number): FrameLayer {
  const metadata: GridCellMetadata = {
    gridId: rule.id,
    gridPageIndex: pageIndex,
    cellIndexGlobal: globalIndex,
    cellIndexOnPage: rect.cellIndexOnPage,
    row: rect.row,
    column: rect.column,
    isGridCell: true
  };
  return createFrameLayer({
    name: `Grid cell ${globalIndex + 1}`,
    rect,
    behaviorMode: "layoutLocked",
    shape: "rect",
    contentType: "empty",
    fitMode: rule.fitMode,
    linkedGroup: rule.linkedGroupId,
    batchIndex: globalIndex,
    lockedFrame: true,
    zIndex: globalIndex,
    metadata: { gridCell: metadata }
  });
}

function ensureGridPageCount(document: Document, rule: GridLayoutRule, basePage: Page, pageCount: number): Document {
  let pages = document.pages.slice();
  let nextRule = document.gridRules.find((item) => item.id === rule.id) ?? rule;

  for (let index = 0; index < pageCount; index += 1) {
    const existingPage = pages.find((page) => page.id === nextRule.pageIds[index]) ?? (index === 0 ? basePage : undefined);
    const source = existingPage ?? {
      ...createPage({ name: `Grid ${index + 1}`, setup: basePage.setup }),
      metadata: { ...basePage.metadata, name: `Grid ${index + 1}`, gridId: rule.id, gridPageIndex: index },
      layers: []
    };
    const cleaned = { ...source, layers: source.layers.filter((layer) => !isGridCellForRule(layer, rule.id)) };
    const result = createGridPage(cleaned, { ...nextRule, frameIds: nextRule.frameIds.filter((frameId) => !source.layers.some((layer) => layer.id === frameId)) }, index);
    pages = pages.some((page) => page.id === result.page.id)
      ? pages.map((page) => page.id === result.page.id ? result.page : page)
      : [...pages, result.page];
    nextRule = result.rule;
  }

  const allowedPageIds = new Set(nextRule.pageIds.slice(0, pageCount));
  nextRule = {
    ...nextRule,
    pageIds: nextRule.pageIds.filter((pageId) => allowedPageIds.has(pageId)),
    frameIds: pages.flatMap((page) => page.layers.filter((layer) => isGridCellForRule(layer, rule.id)).map((layer) => layer.id))
  };
  return {
    ...document,
    pages,
    gridRules: document.gridRules.map((item) => item.id === rule.id ? nextRule : item)
  };
}

function removeGridCells(document: Document, gridId: string): Document {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.filter((layer) => !isGridCellForRule(layer, gridId) && !isGridTextForRule(layer, gridId))
    })),
    gridRules: document.gridRules.map((rule) => rule.id === gridId ? { ...rule, frameIds: [] } : rule),
    gridTextOverlayRules: document.gridTextOverlayRules.map((rule) => rule.gridId === gridId ? { ...rule, textLayerIdsByFrameId: {} } : rule)
  };
}

function applyAssignmentsToFrames(document: Document, gridId: string): Document {
  const assignmentByFrameId = new Map(document.gridImageAssignments.filter((assignment) => assignment.gridId === gridId).map((assignment) => [assignment.frameId, assignment]));
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
          fitMode: assignment.manualFitModeOverride ?? layer.fitMode,
          visualEffects: assignment.visualEffects ?? layer.visualEffects,
          metadata: metadataWithImageEditParams(layer.metadata, assignment.imageEditParams)
        };
      })
    }))
  };
}

function applyTextOverlaysToGrid(document: Document, gridId: string): Document {
  const rule = getGridRule(document, gridId);
  if (rule === undefined) return document;
  const overlayRules = document.gridTextOverlayRules.filter((overlay) => overlay.gridId === gridId && overlay.applyToExistingCells);
  if (overlayRules.length === 0) return document;
  const assignmentsByFrame = new Map(document.gridImageAssignments.filter((assignment) => assignment.gridId === gridId).map((assignment) => [assignment.frameId, assignment]));
  let updatedOverlayRules = overlayRules;
  const pages = document.pages.map((page) => {
    let layers = page.layers.slice();
    page.layers.filter((layer): layer is FrameLayer => layer.type === "frame" && isGridCellForRule(layer, gridId)).forEach((frame) => {
      overlayRules.forEach((overlay) => {
        if (overlay.textLayerIdsByFrameId[frame.id] !== undefined) return;
        const assignment = assignmentsByFrame.get(frame.id);
        const asset = assignment === undefined ? undefined : document.assets.find((item) => item.id === assignment.assetId);
        const textLayer = createOverlayTextLayer(frame, overlay, asset, assignment?.globalIndex ?? getGridCellMetadata(frame)?.cellIndexGlobal ?? 0);
        layers = [...layers, textLayer];
        updatedOverlayRules = updatedOverlayRules.map((item) => item.id === overlay.id ? { ...item, textLayerIdsByFrameId: { ...item.textLayerIdsByFrameId, [frame.id]: textLayer.id } } : item);
      });
    });
    return { ...page, layers };
  });
  return {
    ...document,
    pages,
    gridTextOverlayRules: document.gridTextOverlayRules.map((overlay) => updatedOverlayRules.find((item) => item.id === overlay.id) ?? overlay)
  };
}

function createOverlayTextLayer(frame: FrameLayer, overlay: GridTextOverlayRule, asset: Asset | undefined, globalIndex: number): TextLayer {
  const rect = overlayRect(frame, overlay);
  const text = textForOverlay(overlay, asset, globalIndex);
  const layer = createTextLayer({
    name: `${overlay.name} ${globalIndex + 1}`,
    text,
    rect,
    linkedSlotId: frame.id,
    zIndex: frame.zIndex + 10000,
    metadata: {
      gridText: {
        gridId: overlay.gridId,
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

function overlayRect(frame: FrameLayer, overlay: GridTextOverlayRule): Rect {
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

function anchorPoint(overlay: GridTextOverlayRule): { x: number; y: number; boxX: number; boxY: number } {
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

function textForOverlay(overlay: GridTextOverlayRule, asset: Asset | undefined, globalIndex: number): string {
  if (overlay.textSource === "filename") return cleanFilenameForGridText(asset?.name ?? "");
  if (overlay.textSource === "index") return String(globalIndex + 1);
  if (overlay.textSource === "empty") return "";
  return overlay.defaultText;
}

function createAssignment(gridId: string, assetId: string, frameId: string, globalIndex: number, pageIndex: number, cellIndexOnPage: number, input: GridImageInput): GridImageAssignment {
  return {
    version: 1,
    id: createId("grid_assignment"),
    gridId,
    assetId,
    frameId,
    globalIndex,
    pageIndex,
    cellIndexOnPage,
    manualContentTransform: input.manualContentTransform,
    manualFitModeOverride: input.manualFitModeOverride,
    imageEditParams: input.imageEditParams,
    visualEffects: input.visualEffects,
    hasManualCropOverride: input.manualContentTransform !== undefined,
    hasManualRotationOverride: input.manualContentTransform !== undefined && input.manualContentTransform.rotation !== 0,
    manualRotation: input.manualContentTransform?.rotation
  };
}

function autoRotationTransform(asset: Asset, frame: FrameLayer, policy: GridLayoutRule["autoRotatePolicy"]): ContentTransform {
  if (policy === "none") return { ...defaultContentTransform };
  const imageLandscape = (asset.width ?? 0) > (asset.height ?? 0);
  const cellLandscape = frame.width > frame.height;
  const shouldRotate =
    policy === "forcePortrait" ? imageLandscape :
    policy === "forceLandscape" ? !imageLandscape :
    imageLandscape !== cellLandscape;
  return shouldRotate ? { ...defaultContentTransform, rotation: 90 } : { ...defaultContentTransform };
}

function mergeAssets(existing: Asset[], incoming: Asset[]): Asset[] {
  const ids = new Set(existing.map((asset) => asset.id));
  return [...existing, ...incoming.filter((asset) => !ids.has(asset.id))];
}

function getGridRule(document: Document, gridId: string): GridLayoutRule | undefined {
  return document.gridRules.find((rule) => rule.id === gridId);
}

function getGridCellMetadata(layer: VisualLayer): GridCellMetadata | null {
  const value = layer.metadata["gridCell"];
  return isGridCellMetadata(value) ? value : null;
}

function isGridCellForRule(layer: VisualLayer, gridId: string): boolean {
  return getGridCellMetadata(layer)?.gridId === gridId;
}

function isGridTextForRule(layer: VisualLayer, gridId: string): boolean {
  const value = layer.metadata["gridText"];
  return typeof value === "object" && value !== null && "gridId" in value && value.gridId === gridId;
}

function isGridCellMetadata(value: unknown): value is GridCellMetadata {
  return typeof value === "object" && value !== null && "isGridCell" in value && value.isGridCell === true;
}

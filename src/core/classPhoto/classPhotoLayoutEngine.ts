import type { FrameLayer, TextLayer } from "@/types/layers";
import type { Page } from "@/types/document";
import type { JsonValue } from "@/types/primitives";
import type {
  ClassPhotoFrameStyle,
  ClassPhotoLayoutRule,
  ClassPhotoLayoutSettings,
  ClassPhotoPersonRecord,
  ClassPhotoVisualBalanceSettings
} from "@/types/classPhoto";
import type { TextStyle } from "@/types/template";

export interface ClassPhotoTextVisualStyle {
  fontStyle?: TextLayer["fontStyle"];
  fillOpacity?: number;
  opacity?: number;
  blendMode?: TextLayer["blendMode"];
  stroke?: TextLayer["stroke"];
  shadow?: TextLayer["shadow"];
  gradient?: TextLayer["gradient"];
  effects?: TextLayer["effects"];
  textEffects?: TextLayer["textEffects"];
  autoContrast?: TextLayer["autoContrast"];
  autoContrastOverridden?: boolean;
}

function readTextVisualStyle(rule: ClassPhotoLayoutRule, role: "child" | "staff"): ClassPhotoTextVisualStyle | undefined {
  const key = role === "child" ? "childNameTextVisualStyle" : "staffNameTextVisualStyle";
  const value = rule.metadata[key];
  return typeof value === "object" && value !== null ? value as unknown as ClassPhotoTextVisualStyle : undefined;
}

function visualStyleToMetadata(style: ClassPhotoTextVisualStyle): JsonValue {
  return style as unknown as JsonValue;
}

export function classPhotoTextVisualStyleToMetadata(style: ClassPhotoTextVisualStyle): JsonValue {
  return visualStyleToMetadata(style);
}

// ─── Position record ──────────────────────────────────────────────────────────

export interface PersonPosition {
  record: ClassPhotoPersonRecord;
  frameX: number;
  frameY: number;
  frameW: number;
  frameH: number;
  nameX: number;
  nameY: number;
  nameW: number;
  nameH: number;
}

export interface ClassPhotoPositionResult {
  staffPositions: PersonPosition[];
  childPositions: PersonPosition[];
  overflows: boolean;
  warningMessage?: string;
}

export interface ClassPhotoAutoLayoutPlan {
  childColumns: number;
  staffColumns: number;
  childRows: number[];
  staffRows: number[];
  childFrameSize: number;
  staffFrameSize: number;
  usedContentWidth: number;
  usedContentHeight: number;
  utilizationScore: number;
}

// ─── Balance algorithm ────────────────────────────────────────────────────────

function balanceIntoRows(count: number, itemsPerRow: number): number[] {
  if (count <= 0 || itemsPerRow <= 0) return [];
  const fullRows = Math.floor(count / itemsPerRow);
  const remainder = count % itemsPerRow;
  const rows: number[] = [];

  if (remainder === 0) {
    for (let i = 0; i < fullRows; i++) rows.push(itemsPerRow);
    return rows;
  }

  // Try to balance: distribute overflow across all rows
  const totalRows = fullRows + 1;
  const base = Math.floor(count / totalRows);
  const extra = count % totalRows;
  for (let i = 0; i < totalRows; i++) {
    rows.push(base + (i < extra ? 1 : 0));
  }
  return rows;
}

// ─── Frame shape → FrameLayer shape type ─────────────────────────────────────

function frameStyleShapeToLayerShape(
  style: ClassPhotoFrameStyle
): FrameLayer["shape"] {
  switch (style.shape) {
    case "circle": return "circle";
    case "ellipse": return "ellipse";
    case "roundedRect": return "rect";
    case "rect": return "rect";
    case "star": return "polygon";
    case "cloud": return "svgPath";
    case "maskPreset": return "customMask";
    default: return "rect";
  }
}

// ─── Name text height estimate ────────────────────────────────────────────────

function clampScale(value: number | undefined): number {
  return Math.max(0.5, Math.min(1.6, Number.isFinite(value) ? value ?? 1 : 1));
}

function hasTitleText(rule: ClassPhotoLayoutRule): boolean {
  return rule.titleText.trim().length > 0;
}

function hasFooterText(rule: ClassPhotoLayoutRule): boolean {
  return rule.footerText.trim().length > 0;
}

function effectiveTopTitleAreaHeight(rule: ClassPhotoLayoutRule): number {
  return hasTitleText(rule) ? rule.layoutSettings.topTitleAreaHeight : 0;
}

function effectiveBottomFooterAreaHeight(rule: ClassPhotoLayoutRule): number {
  return hasFooterText(rule) ? rule.layoutSettings.bottomFooterAreaHeight : 0;
}

function effectiveTitleToContentSpacing(rule: ClassPhotoLayoutRule): number {
  return hasTitleText(rule) ? rule.layoutSettings.titleToContentSpacing : 0;
}

function effectiveContentToFooterSpacing(rule: ClassPhotoLayoutRule): number {
  return hasFooterText(rule) ? rule.layoutSettings.contentToFooterSpacing : 0;
}

function estimateNameLineCount(text: string, textStyle: TextStyle, boxW: number): number {
  const usableW = Math.max(1, boxW - 8);
  const avgCharW = Math.max(1, textStyle.fontSize * 0.56 + Math.max(0, textStyle.letterSpacing));
  const maxCharsPerLine = Math.max(1, Math.floor(usableW / avgCharW));
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let lines = 1;
  let current = 0;
  for (const word of words) {
    const parts = Math.max(1, Math.ceil(word.length / maxCharsPerLine));
    for (let part = 0; part < parts; part++) {
      const partLength = part === parts - 1 ? Math.max(1, word.length - part * maxCharsPerLine) : maxCharsPerLine;
      const nextLength = current === 0 ? partLength : current + 1 + partLength;
      if (nextLength <= maxCharsPerLine) {
        current = nextLength;
      } else {
        lines++;
        current = partLength;
      }
    }
  }
  return lines;
}

const MAX_NAME_LAYOUT_LINES = 2;
const MAX_NAME_TO_FRAME_RATIO = 0.32;

function estimateNameHeight(textStyle: TextStyle, names: string[] = [], boxW = Number.POSITIVE_INFINITY): number {
  const rawLineCount = Number.isFinite(boxW)
    ? Math.max(1, ...names.map((name) => estimateNameLineCount(name, textStyle, boxW)))
    : 1;
  const lineCount = Math.min(MAX_NAME_LAYOUT_LINES, rawLineCount);
  const naturalHeight = lineCount <= 1
    ? Math.round(textStyle.fontSize * textStyle.lineHeight * 1.1)
    : Math.ceil(lineCount * textStyle.fontSize * textStyle.lineHeight + Math.max(6, textStyle.fontSize * 0.28));
  if (!Number.isFinite(boxW)) return naturalHeight;
  const maxLayoutHeight = Math.max(textStyle.fontSize * textStyle.lineHeight * 1.1, boxW * MAX_NAME_TO_FRAME_RATIO);
  return Math.round(Math.min(naturalHeight, maxLayoutHeight));
}

// ─── Compute row Y positions ──────────────────────────────────────────────────

function computeCellHeight(frameH: number, nameH: number, spacing: number, namePos: ClassPhotoLayoutSettings["namePosition"]): number {
  if (namePos === "insideBottom" || namePos === "insideTop") return frameH;
  return frameH + spacing + nameH;
}

function rowsForCount(count: number, itemsPerRow: number, balanced: boolean): number[] {
  if (count <= 0) return [];
  if (balanced) return balanceIntoRows(count, itemsPerRow);
  const rows: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    rows.push(Math.min(remaining, itemsPerRow));
    remaining -= itemsPerRow;
  }
  return rows;
}

function maxRowCount(rows: number[]): number {
  return Math.max(1, ...rows);
}

function estimateScaledNameRatio(textStyle: TextStyle, frameSize: number, fallback: number): number {
  if (frameSize <= 0) return fallback;
  return Math.max(0, estimateNameHeight(textStyle, [], frameSize) / frameSize);
}

function rowWidth(rowCount: number, frameW: number, spacing: number): number {
  return rowCount * frameW + Math.max(0, rowCount - 1) * spacing;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function constrainLayoutSettingsToPage(
  pageW: number,
  pageH: number,
  rule: ClassPhotoLayoutRule
): ClassPhotoLayoutSettings {
  const s = rule.layoutSettings;
  const minPageSide = Math.max(1, Math.min(pageW, pageH));
  const maxHorizontalMargin = Math.max(0, pageW * 0.18);
  const maxVerticalMargin = Math.max(0, pageH * 0.14);
  const maxPersonSpacing = Math.max(0, minPageSide * 0.045);
  const maxAreaSpacing = Math.max(0, minPageSide * 0.06);
  const maxFrameToName = Math.max(0, minPageSide * 0.025);

  return {
    ...s,
    margins: {
      top: clampNumber(s.margins.top, 0, maxVerticalMargin),
      right: clampNumber(s.margins.right, 0, maxHorizontalMargin),
      bottom: clampNumber(s.margins.bottom, 0, maxVerticalMargin),
      left: clampNumber(s.margins.left, 0, maxHorizontalMargin)
    },
    topTitleAreaHeight: hasTitleText(rule) ? clampNumber(s.topTitleAreaHeight, 0, pageH * 0.16) : 0,
    bottomFooterAreaHeight: hasFooterText(rule) ? clampNumber(s.bottomFooterAreaHeight, 0, pageH * 0.11) : 0,
    horizontalSpacing: clampNumber(s.horizontalSpacing, 0, maxPersonSpacing),
    verticalSpacing: clampNumber(s.verticalSpacing, 0, maxPersonSpacing),
    staffToChildrenSpacing: clampNumber(s.staffToChildrenSpacing, 0, maxAreaSpacing),
    frameToNameSpacing: clampNumber(s.frameToNameSpacing, 0, maxFrameToName),
    titleToContentSpacing: hasTitleText(rule) ? clampNumber(s.titleToContentSpacing, 0, maxAreaSpacing) : 0,
    contentToFooterSpacing: hasFooterText(rule) ? clampNumber(s.contentToFooterSpacing, 0, maxAreaSpacing) : 0
  };
}

function buildPlanSafeRule(pageW: number, pageH: number, rule: ClassPhotoLayoutRule): ClassPhotoLayoutRule {
  let safeRule: ClassPhotoLayoutRule = {
    ...rule,
    layoutSettings: constrainLayoutSettingsToPage(pageW, pageH, rule)
  };
  if (computeOptimalClassPhotoLayout(pageW, pageH, safeRule) !== null) return safeRule;

  const attempts = [0.75, 0.5, 0.3, 0.15, 0];
  for (const ratio of attempts) {
    const s = safeRule.layoutSettings;
    safeRule = {
      ...safeRule,
      layoutSettings: {
        ...s,
        margins: {
          top: Math.round(s.margins.top * ratio),
          right: Math.round(s.margins.right * ratio),
          bottom: Math.round(s.margins.bottom * ratio),
          left: Math.round(s.margins.left * ratio)
        },
        horizontalSpacing: Math.round(s.horizontalSpacing * ratio),
        verticalSpacing: Math.round(s.verticalSpacing * ratio),
        staffToChildrenSpacing: Math.round(s.staffToChildrenSpacing * ratio),
        frameToNameSpacing: Math.round(s.frameToNameSpacing * ratio),
        titleToContentSpacing: Math.round(s.titleToContentSpacing * ratio),
        contentToFooterSpacing: Math.round(s.contentToFooterSpacing * ratio)
      }
    };
    if (computeOptimalClassPhotoLayout(pageW, pageH, safeRule) !== null) return safeRule;
  }

  return safeRule;
}

export function computeOptimalClassPhotoLayout(
  pageW: number,
  pageH: number,
  rule: ClassPhotoLayoutRule
): ClassPhotoAutoLayoutPlan | null {
  const s = rule.layoutSettings;
  const childCount = rule.personRecords.filter((p) => p.role === "child").length;
  const staffCount = rule.personRecords.filter((p) => p.role === "staff").length;
  if (childCount + staffCount === 0) return null;

  const availW = pageW - s.margins.left - s.margins.right;
  const availH =
    pageH -
    s.margins.top -
    s.margins.bottom -
    effectiveTopTitleAreaHeight(rule) -
    effectiveBottomFooterAreaHeight(rule) -
    effectiveTitleToContentSpacing(rule) -
    effectiveContentToFooterSpacing(rule);

  if (availW <= 0 || availH <= 0) return null;

  const staffEnabled = s.staffRowEnabled && staffCount > 0;
  const staffScale = s.staffScale || 1.3;
  const childNames = rule.personRecords.filter((p) => p.role === "child").map((p) => p.displayName);
  const staffNames = rule.personRecords.filter((p) => p.role === "staff").map((p) => p.displayName);
  const childNameRatio = estimateScaledNameRatio(rule.childNameTextStyle, s.childFrameSize.width, 0.18);
  const staffNameRatio = estimateScaledNameRatio(rule.staffNameTextStyle, s.staffFrameSize.width, 0.18);
  const childCellFactor = s.namePosition === "insideBottom" || s.namePosition === "insideTop"
    ? 1
    : 1 + childNameRatio;
  const staffCellFactor = s.namePosition === "insideBottom" || s.namePosition === "insideTop"
    ? staffScale
    : staffScale * (1 + staffNameRatio);

  let best: ClassPhotoAutoLayoutPlan | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  const childColumnLimit = Math.max(1, childCount);
  const staffColumnLimit = staffEnabled ? Math.max(1, staffCount) : 0;

  for (let requestedChildCols = 1; requestedChildCols <= childColumnLimit; requestedChildCols++) {
    const childRows = rowsForCount(childCount, requestedChildCols, rule.visualBalanceSettings.balanceLastRows);
    const childColumns = childRows.length > 0 ? maxRowCount(childRows) : 0;
    const childRowsCount = childRows.length;
    const childWidthLimit = childColumns > 0
      ? (availW - Math.max(0, childColumns - 1) * s.horizontalSpacing) / childColumns
      : Number.POSITIVE_INFINITY;

    const staffColStart = staffEnabled ? 1 : 0;
    const staffColEnd = staffEnabled ? staffColumnLimit : 0;
    for (let requestedStaffCols = staffColStart; requestedStaffCols <= staffColEnd; requestedStaffCols++) {
      const staffRows = staffEnabled ? rowsForCount(staffCount, requestedStaffCols, false) : [];
      const staffColumns = staffRows.length > 0 ? maxRowCount(staffRows) : 0;
      const staffRowsCount = staffRows.length;
      const staffWidthLimit = staffColumns > 0
        ? (availW - Math.max(0, staffColumns - 1) * s.horizontalSpacing) / (staffColumns * staffScale)
        : Number.POSITIVE_INFINITY;

      const totalRows = childRowsCount + staffRowsCount;
      const rowGaps = Math.max(0, totalRows - 1) * s.verticalSpacing;
      const staffToChildrenGap = staffRowsCount > 0 && childRowsCount > 0 ? s.staffToChildrenSpacing : 0;
      const nameSpacingH =
        s.namePosition === "insideBottom" || s.namePosition === "insideTop"
          ? 0
          : (childRowsCount + staffRowsCount) * s.frameToNameSpacing;
      const fixedH = rowGaps + staffToChildrenGap + nameSpacingH;
      const frameFactor = childRowsCount * childCellFactor + staffRowsCount * staffCellFactor;
      const heightLimit = frameFactor > 0 ? (availH - fixedH) / frameFactor : Number.POSITIVE_INFINITY;

      const fittedChild = Math.floor(Math.min(childWidthLimit, staffWidthLimit, heightLimit));
      if (!Number.isFinite(fittedChild) || fittedChild <= 0) continue;

      const fittedStaff = Math.round(fittedChild * staffScale);
      const childNameH = estimateNameHeight(rule.childNameTextStyle, childNames, fittedChild);
      const staffNameH = estimateNameHeight(rule.staffNameTextStyle, staffNames, fittedStaff);
      const childCellH = computeCellHeight(fittedChild, childNameH, s.frameToNameSpacing, s.namePosition);
      const staffCellH = computeCellHeight(fittedStaff, staffNameH, s.frameToNameSpacing, s.namePosition);
      const usedContentWidth = Math.max(
        childRows.length > 0 ? Math.max(...childRows.map((count) => rowWidth(count, fittedChild, s.horizontalSpacing))) : 0,
        staffRows.length > 0 ? Math.max(...staffRows.map((count) => rowWidth(count, fittedStaff, s.horizontalSpacing))) : 0
      );
      const usedContentHeight =
        childRowsCount * childCellH +
        staffRowsCount * staffCellH +
        rowGaps +
        staffToChildrenGap;
      if (usedContentWidth > availW + 0.01 || usedContentHeight > availH + 0.01) continue;

      const utilization = Math.max(0, Math.min(1, (usedContentWidth * usedContentHeight) / (availW * availH)));
      const lastChildRow = childRows.at(-1) ?? childColumns;
      const emptyLastRowRatio = childColumns > 0 ? (childColumns - lastChildRow) / childColumns : 0;
      const rowBalancePenalty = childRows.length > 1
        ? (Math.max(...childRows) - Math.min(...childRows)) / Math.max(...childRows)
        : 0;
      const tooFewRowsPenalty = childCount >= 12 && childRowsCount < 3 ? 50000 : 0;
      const score =
        fittedChild * 1000 +
        utilization * 100 -
        tooFewRowsPenalty -
        emptyLastRowRatio * 30 -
        rowBalancePenalty * 20 -
        Math.abs(usedContentWidth - availW) / Math.max(availW, 1);

      if (score > bestScore) {
        bestScore = score;
        best = {
          childColumns,
          staffColumns,
          childRows,
          staffRows,
          childFrameSize: fittedChild,
          staffFrameSize: fittedStaff,
          usedContentWidth,
          usedContentHeight,
          utilizationScore: utilization
        };
      }
    }
  }

  return best;
}

function scaledPlanFitsPage(
  pageW: number,
  pageH: number,
  rule: ClassPhotoLayoutRule,
  plan: ClassPhotoAutoLayoutPlan,
  childFrameSize: number,
  staffFrameSize: number,
  childTextStyle: TextStyle,
  staffTextStyle: TextStyle
): boolean {
  const s = rule.layoutSettings;
  const availW = pageW - s.margins.left - s.margins.right;
  const availH =
    pageH -
    s.margins.top -
    s.margins.bottom -
    effectiveTopTitleAreaHeight(rule) -
    effectiveBottomFooterAreaHeight(rule) -
    effectiveTitleToContentSpacing(rule) -
    effectiveContentToFooterSpacing(rule);
  const childNames = rule.personRecords.filter((p) => p.role === "child").map((p) => p.displayName);
  const staffNames = rule.personRecords.filter((p) => p.role === "staff").map((p) => p.displayName);
  const childNameH = estimateNameHeight(childTextStyle, childNames, childFrameSize);
  const staffNameH = estimateNameHeight(staffTextStyle, staffNames, staffFrameSize);
  const childCellH = computeCellHeight(childFrameSize, childNameH, s.frameToNameSpacing, s.namePosition);
  const staffCellH = computeCellHeight(staffFrameSize, staffNameH, s.frameToNameSpacing, s.namePosition);
  const totalRows = plan.childRows.length + plan.staffRows.length;
  const rowGaps = Math.max(0, totalRows - 1) * s.verticalSpacing;
  const staffToChildrenGap = plan.staffRows.length > 0 && plan.childRows.length > 0 ? s.staffToChildrenSpacing : 0;
  const usedContentWidth = Math.max(
    plan.childRows.length > 0 ? Math.max(...plan.childRows.map((count) => rowWidth(count, childFrameSize, s.horizontalSpacing))) : 0,
    plan.staffRows.length > 0 ? Math.max(...plan.staffRows.map((count) => rowWidth(count, staffFrameSize, s.horizontalSpacing))) : 0
  );
  const usedContentHeight =
    plan.childRows.length * childCellH +
    plan.staffRows.length * staffCellH +
    rowGaps +
    staffToChildrenGap;

  return usedContentWidth <= availW + 0.01 && usedContentHeight <= availH + 0.01;
}

function scaledNameTextStyle(textStyle: TextStyle, ratio: number, minFontSize: number): TextStyle {
  return {
    ...textStyle,
    fontSize: Math.max(minFontSize, Math.round(textStyle.fontSize * ratio))
  };
}

export function canApplyClassPhotoGroupScale(
  pageW: number,
  pageH: number,
  rule: ClassPhotoLayoutRule,
  scales: { childGroupScale?: number; staffGroupScale?: number }
): boolean {
  const baseRule = buildPlanSafeRule(pageW, pageH, {
    ...rule,
    layoutSettings: {
      ...rule.layoutSettings,
      childGroupScale: 1,
      staffGroupScale: 1
    }
  });
  const plan = computeOptimalClassPhotoLayout(pageW, pageH, baseRule);
  if (!plan) return false;
  const childScale = clampScale(scales.childGroupScale ?? rule.layoutSettings.childGroupScale);
  const staffScale = clampScale(scales.staffGroupScale ?? rule.layoutSettings.staffGroupScale);
  const childFrameSize = Math.max(16, Math.round(plan.childFrameSize * childScale));
  const staffFrameSize = Math.max(16, Math.round(plan.staffFrameSize * staffScale));
  const childRatio = rule.layoutSettings.childFrameSize.width > 0 ? childFrameSize / rule.layoutSettings.childFrameSize.width : 1;
  const staffRatio = rule.layoutSettings.staffFrameSize.width > 0 ? staffFrameSize / rule.layoutSettings.staffFrameSize.width : childRatio;
  return scaledPlanFitsPage(
    pageW,
    pageH,
    baseRule,
    plan,
    childFrameSize,
    staffFrameSize,
    scaledNameTextStyle(baseRule.childNameTextStyle, childRatio, 8),
    scaledNameTextStyle(baseRule.staffNameTextStyle, staffRatio, 9)
  );
}

// ─── Auto-fit: compute largest frame size that fits the page ─────────────────

/**
 * Given fixed spacing values, analytically compute the largest frame size where
 * the full layout still fits within the page. Returns an updated ClassPhotoLayoutRule
 * with adjusted childFrameSize and staffFrameSize (and proportionally updated text styles).
 *
 * This ensures the layout ALWAYS stays within canvas bounds regardless of spacing.
 */
export function fitLayoutToPage(
  pageW: number,
  pageH: number,
  rule: ClassPhotoLayoutRule
): ClassPhotoLayoutRule {
  const safeRule = buildPlanSafeRule(pageW, pageH, rule);
  const s = safeRule.layoutSettings;
  const plan = computeOptimalClassPhotoLayout(pageW, pageH, safeRule);
  if (!plan) return safeRule;

  // Apply the selected grid plan as the single source for frame sizing.
  const MIN_FRAME = 16;
  const baseChildW = Math.max(MIN_FRAME, plan.childFrameSize);
  const baseStaffW = Math.max(MIN_FRAME, plan.staffFrameSize);
  const requestedChildW = Math.max(MIN_FRAME, Math.round(baseChildW * clampScale(s.childGroupScale)));
  const requestedStaffW = Math.max(MIN_FRAME, Math.round(baseStaffW * clampScale(s.staffGroupScale)));

  // ── Fit title/footer font sizes to their areas (light override) ─────────────
  // Cap font size so it never exceeds 70% of the allotted area height (single line comfort)
  const titleFontMax = Math.floor(effectiveTopTitleAreaHeight(safeRule) * 0.62);
  const footerFontMax = Math.floor(effectiveBottomFooterAreaHeight(safeRule) * 0.62);
  const fittedTitleStyle = titleFontMax > 0 && safeRule.titleTextStyle.fontSize > titleFontMax
    ? { ...safeRule.titleTextStyle, fontSize: titleFontMax }
    : safeRule.titleTextStyle;
  const fittedFooterStyle = footerFontMax > 0 && safeRule.footerTextStyle.fontSize > footerFontMax
    ? { ...safeRule.footerTextStyle, fontSize: footerFontMax }
    : safeRule.footerTextStyle;
  // Update name text styles proportionally
  const requestedChildRatio = s.childFrameSize.width > 0 ? requestedChildW / s.childFrameSize.width : 1;
  const requestedStaffRatio = s.staffFrameSize.width > 0 ? requestedStaffW / s.staffFrameSize.width : requestedChildRatio;
  const requestedChildNameStyle = scaledNameTextStyle(safeRule.childNameTextStyle, requestedChildRatio, 8);
  const requestedStaffNameStyle = scaledNameTextStyle(safeRule.staffNameTextStyle, requestedStaffRatio, 9);
  const scaledFits = scaledPlanFitsPage(
    pageW,
    pageH,
    safeRule,
    plan,
    requestedChildW,
    requestedStaffW,
    requestedChildNameStyle,
    requestedStaffNameStyle
  );
  const fittedChildW = scaledFits ? requestedChildW : baseChildW;
  const fittedStaffW = scaledFits ? requestedStaffW : baseStaffW;
  const updatedChildNameStyle = scaledFits
    ? requestedChildNameStyle
    : scaledNameTextStyle(safeRule.childNameTextStyle, s.childFrameSize.width > 0 ? baseChildW / s.childFrameSize.width : 1, 8);
  const updatedStaffNameStyle = scaledFits
    ? requestedStaffNameStyle
    : scaledNameTextStyle(safeRule.staffNameTextStyle, s.staffFrameSize.width > 0 ? baseStaffW / s.staffFrameSize.width : 1, 9);

  return {
    ...safeRule,
    layoutSettings: {
      ...s,
      childGroupScale: scaledFits ? clampScale(s.childGroupScale) : 1,
      staffGroupScale: scaledFits ? clampScale(s.staffGroupScale) : 1,
      childFrameSize: { width: fittedChildW, height: fittedChildW },
      staffFrameSize: { width: fittedStaffW, height: fittedStaffW }
    },
    childNameTextStyle: updatedChildNameStyle,
    staffNameTextStyle: updatedStaffNameStyle,
    titleTextStyle: fittedTitleStyle,
    footerTextStyle: fittedFooterStyle,
    metadata: {
      ...rule.metadata,
      classPhotoAutoLayout: {
        childColumns: plan.childColumns,
        staffColumns: plan.staffColumns,
        childRows: plan.childRows,
        staffRows: plan.staffRows,
        childFrameSize: fittedChildW,
        staffFrameSize: fittedStaffW,
        usedContentWidth: plan.usedContentWidth,
        usedContentHeight: plan.usedContentHeight,
        utilizationScore: plan.utilizationScore
      }
    }
  };
}

// ─── Core layout algorithm ────────────────────────────────────────────────────

export function computeClassPhotoPositions(
  pageW: number,
  pageH: number,
  rule: ClassPhotoLayoutRule
): ClassPhotoPositionResult {
  const s = rule.layoutSettings;
  const v = rule.visualBalanceSettings;
  const plan = computeOptimalClassPhotoLayout(pageW, pageH, rule);

  const staffRecords = rule.personRecords
    .filter((p) => p.role === "staff")
    .sort((a, b) =>
      v.sortMode === "alphabetical"
        ? a.displayName.localeCompare(b.displayName, "he")
        : a.orderIndex - b.orderIndex
    );

  const childRecords = rule.personRecords
    .filter((p) => p.role === "child")
    .sort((a, b) =>
      v.sortMode === "alphabetical"
        ? a.displayName.localeCompare(b.displayName, "he")
        : a.orderIndex - b.orderIndex
    );

  // Available content area
  const availX = s.margins.left;
  const availY = s.margins.top + effectiveTopTitleAreaHeight(rule) + effectiveTitleToContentSpacing(rule);
  const availW = pageW - s.margins.left - s.margins.right;

  const childNameH = estimateNameHeight(rule.childNameTextStyle, childRecords.map((p) => p.displayName), s.childFrameSize.width);
  const staffNameH = estimateNameHeight(rule.staffNameTextStyle, staffRecords.map((p) => p.displayName), s.staffFrameSize.width);

  const childCellH = computeCellHeight(s.childFrameSize.height, childNameH, s.frameToNameSpacing, s.namePosition);
  const staffCellH = computeCellHeight(s.staffFrameSize.height, staffNameH, s.frameToNameSpacing, s.namePosition);

  // Staff positions
  const staffPositions: PersonPosition[] = [];
  let currentY = availY;

  if (s.staffRowEnabled && staffRecords.length > 0) {
    // How many staff fit per row?
    const staffPerRow = Math.max(1, plan?.staffColumns ?? Math.floor((availW + s.horizontalSpacing) / (s.staffFrameSize.width + s.horizontalSpacing)));
    const staffRows = Math.ceil(staffRecords.length / staffPerRow);

    for (let row = 0; row < staffRows; row++) {
      const rowStart = row * staffPerRow;
      const rowEnd = Math.min(rowStart + staffPerRow, staffRecords.length);
      const rowCount = rowEnd - rowStart;

      const rowWidth = rowCount * s.staffFrameSize.width + (rowCount - 1) * s.horizontalSpacing;
      const rowOffsetX = v.centerStaffRow ? Math.round((availW - rowWidth) / 2) : 0;

      for (let i = 0; i < rowCount; i++) {
        const rec = staffRecords[rowStart + i];
        if (!rec) continue;
        const fx = availX + rowOffsetX + i * (s.staffFrameSize.width + s.horizontalSpacing);
        const fy = currentY;
        const nameY = s.namePosition === "aboveFrame"
          ? fy - s.frameToNameSpacing - staffNameH
          : fy + s.staffFrameSize.height + s.frameToNameSpacing;
        staffPositions.push({
          record: rec,
          frameX: fx,
          frameY: fy,
          frameW: s.staffFrameSize.width,
          frameH: s.staffFrameSize.height,
          nameX: fx,
          nameY,
          nameW: s.staffFrameSize.width,
          nameH: staffNameH
        });
      }
      currentY += staffCellH + s.verticalSpacing;
    }
    currentY += s.staffToChildrenSpacing - s.verticalSpacing;
  }

  // Child positions
  const childPositions: PersonPosition[] = [];

  if (childRecords.length > 0) {
    const childPerRow = Math.max(1, plan?.childColumns ?? Math.floor((availW + s.horizontalSpacing) / (s.childFrameSize.width + s.horizontalSpacing)));
    const rowDistribution = plan?.childRows ?? rowsForCount(childRecords.length, childPerRow, v.balanceLastRows);

    let childIdx = 0;
    for (const rowCount of rowDistribution) {
      const rowWidth = rowCount * s.childFrameSize.width + (rowCount - 1) * s.horizontalSpacing;
      const rowOffsetX = v.centerPartialRows ? Math.round((availW - rowWidth) / 2) : 0;

      for (let i = 0; i < rowCount; i++) {
        const rec = childRecords[childIdx];
        if (!rec) continue;
        childIdx++;
        const fx = availX + rowOffsetX + i * (s.childFrameSize.width + s.horizontalSpacing);
        const fy = currentY;
        const nameY = s.namePosition === "aboveFrame"
          ? fy - s.frameToNameSpacing - childNameH
          : fy + s.childFrameSize.height + s.frameToNameSpacing;
        childPositions.push({
          record: rec,
          frameX: fx,
          frameY: fy,
          frameW: s.childFrameSize.width,
          frameH: s.childFrameSize.height,
          nameX: fx,
          nameY,
          nameW: s.childFrameSize.width,
          nameH: childNameH
        });
      }
      currentY += childCellH + s.verticalSpacing;
    }
  }

  // Overflow check
  const footerTop = pageH - s.margins.bottom - effectiveBottomFooterAreaHeight(rule) - effectiveContentToFooterSpacing(rule);
  const contentBottom = currentY - s.verticalSpacing;
  const overflows = contentBottom > footerTop;

  return {
    staffPositions,
    childPositions,
    overflows,
    warningMessage: overflows
      ? "התוכן חורג מגבולות הדף. הקטן את מסגרות התמונות, הרווחים, או שנה את גודל הדף."
      : undefined
  };
}

// ─── Create FrameLayer from person + position ─────────────────────────────────

function buildFrameVisualEffects(style: ClassPhotoFrameStyle): import("@/types/visualEffects").VisualEffectStack | undefined {
  const effects: import("@/types/visualEffects").VisualEffect[] = [];

  if (style.shadow) {
    effects.push({
      version: 1,
      id: "cp-shadow",
      enabled: true,
      params: {
        type: "dropShadow",
        color: style.shadow.color,
        opacity: style.shadow.opacity,
        offsetX: style.shadow.offsetX,
        offsetY: style.shadow.offsetY,
        blur: style.shadow.blur,
        spread: 0
      }
    });
  }
  if (style.outerGlow) {
    effects.push({
      version: 1,
      id: "cp-glow",
      enabled: true,
      params: {
        type: "outerGlow",
        color: style.outerGlow.color,
        opacity: style.outerGlow.opacity,
        blur: style.outerGlow.blur,
        spread: 0
      }
    });
  }
  if (style.stroke) {
    effects.push({
      version: 1,
      id: "cp-stroke",
      enabled: true,
      params: {
        type: "stroke",
        color: style.stroke.color,
        width: style.stroke.width,
        position: "outside" as const,
        opacity: style.stroke.opacity
      }
    });
  }

  if (effects.length === 0) return undefined;
  return { version: 1, enabled: true, effects };
}

function shallowEqualVisualEffects(
  a: import("@/types/visualEffects").VisualEffectStack | undefined,
  b: import("@/types/visualEffects").VisualEffectStack | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.enabled !== b.enabled) return false;
  if (a.effects.length !== b.effects.length) return false;
  // Cheap structural compare — JSON.stringify is good enough for short stacks
  // and avoids hand-writing comparators for every effect variant.
  return JSON.stringify(a.effects) === JSON.stringify(b.effects);
}

function makePersonFrameLayer(
  pos: PersonPosition,
  style: ClassPhotoFrameStyle,
  ruleId: string,
  zIndex: number,
  existingId?: string,
  prevFrame?: FrameLayer,
): FrameLayer {
  // Cloud/star shapes need metadata for KonvaLayerNode clipFunc detection
  const shapeMetaKey =
    style.shape === "cloud" ? "cloud"
    : style.shape === "star" ? "star"
    : null;

  return {
    version: 1,
    id: existingId ?? crypto.randomUUID(),
    type: "frame",
    name: `תמונה - ${pos.record.displayName}`,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    x: pos.frameX,
    y: pos.frameY,
    width: pos.frameW,
    height: pos.frameH,
    rotation: 0,
    zIndex,
    selected: false,
    behaviorMode: "layoutLocked",
    shape: frameStyleShapeToLayerShape(style),
    contentType: pos.record.assetId ? "image" : "empty",
    imageAssetId: pos.record.assetId || undefined,
    fitMode: "fill",
    contentTransform: {
      version: 1,
      offsetX: pos.record.manualImageCrop?.x ?? 0,
      offsetY: pos.record.manualImageCrop?.y ?? 0,
      scale: pos.record.manualImageScale ?? 1,
      rotation: pos.record.manualImageRotation ?? 0
    },
    crop: { x: 0, y: 0, width: pos.frameW, height: pos.frameH },
    padding: 0,
    cornerRadius: style.shape === "roundedRect" ? (style.cornerRadius ?? 12) : undefined,
    fill: style.fill,
    maskId: style.maskPresetId,
    smartCropMode: "face",
    faceAnchor: pos.record.faceData,
    visualEffects: pos.record.visualEffectsOverride ?? prevFrame?.visualEffects ?? buildFrameVisualEffects(style),
    metadata: {
      ...(pos.record.imageEditParams !== undefined
        ? { imageEditParams: pos.record.imageEditParams as unknown as import("@/types/primitives").JsonValue }
        : prevFrame?.metadata["imageEditParams"] !== undefined
          ? { imageEditParams: prevFrame.metadata["imageEditParams"] }
          : {}),
      classPhotoFrame: {
        ruleId,
        personId: pos.record.id,
        role: pos.record.role
      },
      ...(shapeMetaKey ? { maskFrame: { maskShape: shapeMetaKey } } : {})
    }
  };
}

// ─── Create TextLayer for person name ────────────────────────────────────────

function makePersonNameLayer(
  pos: PersonPosition,
  textStyle: TextStyle,
  ruleId: string,
  zIndex: number,
  existingId?: string,
  visualStyle?: ClassPhotoTextVisualStyle
): TextLayer {
  const base: TextLayer = {
    version: 1,
    id: existingId ?? crypto.randomUUID(),
    type: "text",
    layerType: "text",
    name: `שם - ${pos.record.displayName}`,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    x: pos.nameX,
    y: pos.nameY,
    width: pos.nameW,
    height: pos.nameH,
    rotation: 0,
    zIndex,
    selected: false,
    parentFrameId: null,
    text: pos.record.displayName,
    fontFamily: textStyle.fontFamily,
    fontWeight: textStyle.fontWeight,
    fontStyle: "normal",
    fontSize: textStyle.fontSize,
    lineHeight: textStyle.lineHeight,
    letterSpacing: textStyle.letterSpacing,
    color: textStyle.color,
    fillOpacity: 1,
    alignment: textStyle.alignment,
    direction: textStyle.direction,
    overflowPolicy: "clip",
    anchorPoint: "top_left",
    anchorOffsetX: 0,
    anchorOffsetY: 0,
    warpSettings: {
      version: 1,
      enabled: false,
      type: "arc",
      intensity: 0,
      amount: 0,
      horizontalDistortion: 0,
      verticalDistortion: 0,
      bend: 0
    },
    effects: [],
    autoContrast: { version: 1, enabled: false, lightBgColor: "#ffffff", darkBgColor: "#000000", minContrastRatio: 4.5 },
    autoContrastOverridden: false,
    isDynamic: false,
    metadata: {
      classPhotoName: {
        ruleId,
        personId: pos.record.id,
        role: pos.record.role
      }
    }
  };
  return visualStyle === undefined ? base : { ...base, ...visualStyle };
}

// ─── Title/Footer text layers ─────────────────────────────────────────────────

export function makeTitleLayer(
  pageW: number,
  rule: ClassPhotoLayoutRule,
  zIndex: number
): TextLayer {
  const s = rule.layoutSettings;
  const ts = rule.titleTextStyle;
  return {
    version: 1,
    id: crypto.randomUUID(),
    type: "text",
    layerType: "text",
    name: "כותרת",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    x: s.margins.left,
    y: s.margins.top,
    width: pageW - s.margins.left - s.margins.right,
    height: s.topTitleAreaHeight,
    rotation: 0,
    zIndex,
    selected: false,
    parentFrameId: null,
    text: rule.titleText,
    fontFamily: ts.fontFamily,
    fontWeight: ts.fontWeight,
    fontStyle: "normal",
    fontSize: ts.fontSize,
    lineHeight: ts.lineHeight,
    letterSpacing: ts.letterSpacing,
    color: ts.color,
    fillOpacity: 1,
    alignment: ts.alignment,
    direction: ts.direction,
    overflowPolicy: "clip",
    anchorPoint: "top_left",
    anchorOffsetX: 0,
    anchorOffsetY: 0,
    warpSettings: { version: 1, enabled: false, type: "arc", intensity: 0, amount: 0, horizontalDistortion: 0, verticalDistortion: 0, bend: 0 },
    effects: rule.titleTextEffects ?? [],
    autoContrast: { version: 1, enabled: false, lightBgColor: "#ffffff", darkBgColor: "#000000", minContrastRatio: 4.5 },
    autoContrastOverridden: false,
    isDynamic: false,
    metadata: { classPhotoTitle: { ruleId: rule.id } },
    // Apply preset style (color, gradient, stroke, shadow from BUILTIN_TEXT_PRESETS)
    ...(rule.titlePresetStyle as Partial<TextLayer> | undefined)
  };
}

export function makeFooterLayer(
  pageW: number,
  pageH: number,
  rule: ClassPhotoLayoutRule,
  zIndex: number
): TextLayer {
  const s = rule.layoutSettings;
  const ts = rule.footerTextStyle;
  return {
    version: 1,
    id: crypto.randomUUID(),
    type: "text",
    layerType: "text",
    name: "כותרת תחתונה",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    x: s.margins.left,
    y: pageH - s.margins.bottom - s.bottomFooterAreaHeight,
    width: pageW - s.margins.left - s.margins.right,
    height: s.bottomFooterAreaHeight,
    rotation: 0,
    zIndex,
    selected: false,
    parentFrameId: null,
    text: rule.footerText || "",
    fontFamily: ts.fontFamily,
    fontWeight: ts.fontWeight,
    fontStyle: "normal",
    fontSize: ts.fontSize,
    lineHeight: ts.lineHeight,
    letterSpacing: ts.letterSpacing,
    color: ts.color,
    fillOpacity: 1,
    alignment: ts.alignment,
    direction: ts.direction,
    overflowPolicy: "clip",
    anchorPoint: "top_left",
    anchorOffsetX: 0,
    anchorOffsetY: 0,
    warpSettings: { version: 1, enabled: false, type: "arc", intensity: 0, amount: 0, horizontalDistortion: 0, verticalDistortion: 0, bend: 0 },
    effects: rule.footerTextEffects ?? [],
    autoContrast: { version: 1, enabled: false, lightBgColor: "#ffffff", darkBgColor: "#000000", minContrastRatio: 4.5 },
    autoContrastOverridden: false,
    isDynamic: false,
    metadata: { classPhotoFooter: { ruleId: rule.id } },
    ...(rule.footerPresetStyle as Partial<TextLayer> | undefined)
  };
}

// ─── Main sync function ───────────────────────────────────────────────────────

export interface ClassPhotoSyncResult {
  page: Page;
  rule: ClassPhotoLayoutRule;
  overflows: boolean;
  warningMessage?: string;
}

export function syncClassPhotoToPage(
  page: Page,
  rule: ClassPhotoLayoutRule
): ClassPhotoSyncResult {
  // Always auto-fit frame sizes to page before computing positions
  const fittedRule = fitLayoutToPage(page.width, page.height, rule);
  const positions = computeClassPhotoPositions(page.width, page.height, fittedRule);
  // Use fittedRule for all layer generation
  rule = fittedRule;

  // Remove all previously managed layers
  const existingLayers = page.layers.filter((l) => {
    const meta = l.metadata;
    return !meta["classPhotoFrame"] && !meta["classPhotoName"] && !meta["classPhotoTitle"] && !meta["classPhotoFooter"];
  });

  const newLayers: import("@/types/layers").VisualLayer[] = [...existingLayers];
  let zIdx = existingLayers.length;

  // Build lookup for existing IDs — declare before use to prevent hoisting issues
  const existingFrameIds = new Map(rule.personRecords.map((r) => [r.id, r.frameLayerId]));
  const existingNameIds = new Map(rule.personRecords.map((r) => [r.id, r.nameTextLayerId]));

  // Index existing layers by id so we can preserve visualEffects the user
  // edited directly on the frame (without going through the wizard).
  const existingFrameById = new Map<string, import("@/types/layers").FrameLayer>();
  for (const l of page.layers) {
    if (l.type === "frame") existingFrameById.set(l.id, l as import("@/types/layers").FrameLayer);
  }
  const existingTitleId = rule.titleTextLayerId;
  const existingFooterId = rule.footerTextLayerId;

  // Title — reuse existing ID to prevent Konva remount
  const titleLayer = hasTitleText(rule)
    ? { ...makeTitleLayer(page.width, rule, zIdx++), id: existingTitleId ?? crypto.randomUUID() }
    : null;

  // Footer — reuse existing ID
  const footerLayer = hasFooterText(rule)
    ? { ...makeFooterLayer(page.width, page.height, rule, zIdx++), id: existingFooterId ?? crypto.randomUUID() }
    : null;

  // Staff frames + names
  const updatedStaffRecords: ClassPhotoPersonRecord[] = [];
  for (const pos of positions.staffPositions) {
    const prevFrame = (() => { const id = existingFrameIds.get(pos.record.id); return id ? existingFrameById.get(id) : undefined; })();
    const frame = makePersonFrameLayer(pos, rule.staffFrameStyle, rule.id, zIdx++, existingFrameIds.get(pos.record.id), prevFrame);
    const name = makePersonNameLayer(pos, rule.staffNameTextStyle, rule.id, zIdx++, existingNameIds.get(pos.record.id), readTextVisualStyle(rule, "staff"));
    newLayers.push(frame, name);
    // Promote any user-edited visualEffects on the previous frame to the record
    // so subsequent regenerates can find it (record is the canonical source of truth).
    const promotedOverride = pos.record.visualEffectsOverride
      ?? (prevFrame && !shallowEqualVisualEffects(prevFrame.visualEffects, buildFrameVisualEffects(rule.staffFrameStyle))
        ? prevFrame.visualEffects
        : undefined);
    updatedStaffRecords.push({
      ...pos.record,
      frameLayerId: frame.id,
      nameTextLayerId: name.id,
      imageEditParams: pos.record.imageEditParams ?? (prevFrame?.metadata["imageEditParams"] as Record<string, number | boolean | string> | undefined),
      visualEffectsOverride: promotedOverride,
    });
  }

  // Child frames + names
  const updatedChildRecords: ClassPhotoPersonRecord[] = [];
  for (const pos of positions.childPositions) {
    const prevChildFrame = (() => { const id = existingFrameIds.get(pos.record.id); return id ? existingFrameById.get(id) : undefined; })();
    const frame = makePersonFrameLayer(pos, rule.childFrameStyle, rule.id, zIdx++, existingFrameIds.get(pos.record.id), prevChildFrame);
    const name = makePersonNameLayer(pos, rule.childNameTextStyle, rule.id, zIdx++, existingNameIds.get(pos.record.id), readTextVisualStyle(rule, "child"));
    newLayers.push(frame, name);
    const promotedOverride = pos.record.visualEffectsOverride
      ?? (prevChildFrame && !shallowEqualVisualEffects(prevChildFrame.visualEffects, buildFrameVisualEffects(rule.childFrameStyle))
        ? prevChildFrame.visualEffects
        : undefined);
    updatedChildRecords.push({
      ...pos.record,
      frameLayerId: frame.id,
      nameTextLayerId: name.id,
      imageEditParams: pos.record.imageEditParams ?? (prevChildFrame?.metadata["imageEditParams"] as Record<string, number | boolean | string> | undefined),
      visualEffectsOverride: promotedOverride,
    });
  }

  // Add title/footer on top
  if (titleLayer) newLayers.push(titleLayer);
  if (footerLayer) newLayers.push(footerLayer);

  const updatedRule: ClassPhotoLayoutRule = {
    ...rule,
    personRecords: [
      ...updatedStaffRecords,
      ...updatedChildRecords
    ],
    titleTextLayerId: titleLayer?.id,
    footerTextLayerId: footerLayer?.id
  };

  const updatedPage: Page = { ...page, layers: newLayers };

  return {
    page: updatedPage,
    rule: updatedRule,
    overflows: positions.overflows,
    warningMessage: positions.warningMessage
  };
}

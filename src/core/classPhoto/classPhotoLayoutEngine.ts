import type { FrameLayer, TextLayer } from "@/types/layers";
import type { Page } from "@/types/document";
import type {
  ClassPhotoFrameStyle,
  ClassPhotoLayoutRule,
  ClassPhotoLayoutSettings,
  ClassPhotoPersonRecord,
  ClassPhotoVisualBalanceSettings
} from "@/types/classPhoto";
import type { TextStyle } from "@/types/template";

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

function estimateNameHeight(textStyle: TextStyle): number {
  return Math.round(textStyle.fontSize * textStyle.lineHeight * 1.1);
}

// ─── Compute row Y positions ──────────────────────────────────────────────────

function computeCellHeight(frameH: number, nameH: number, spacing: number, namePos: ClassPhotoLayoutSettings["namePosition"]): number {
  if (namePos === "insideBottom" || namePos === "insideTop") return frameH;
  return frameH + spacing + nameH;
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
  const s = rule.layoutSettings;
  const childCount = rule.personRecords.filter((p) => p.role === "child").length;
  const staffCount = rule.personRecords.filter((p) => p.role === "staff").length;

  if (childCount + staffCount === 0) return rule;

  const availW = pageW - s.margins.left - s.margins.right;
  const availH =
    pageH -
    s.margins.top -
    s.margins.bottom -
    s.topTitleAreaHeight -
    s.bottomFooterAreaHeight -
    s.titleToContentSpacing -
    s.contentToFooterSpacing;

  const hSpacing = s.horizontalSpacing;
  const vSpacing = s.verticalSpacing;

  // ── Determine columns from child count (balanced) ──────────────────────────
  const childPerRow = Math.max(1, Math.min(childCount, Math.ceil(Math.sqrt(childCount * 1.5))));

  // ── Max frame width from horizontal constraint ─────────────────────────────
  const maxByWidth = Math.floor((availW - (childPerRow - 1) * hSpacing) / childPerRow);

  // ── Max frame size from vertical constraint ────────────────────────────────
  // Estimate name height as a fraction of frame size (we'll iterate once)
  // nameH ≈ frameW * 0.14 * lineHeight
  const nameHRatio = 0.14 * 1.25; // fontSize ratio * lineHeight
  const nameSpacing = s.frameToNameSpacing;

  const staffRows = s.staffRowEnabled && staffCount > 0 ? Math.ceil(staffCount / Math.max(1, childPerRow)) : 0;
  const childRows = Math.ceil(childCount / childPerRow);
  const totalRows = childRows + staffRows;

  // Total height = rows * (frameSize + nameH + nameSpacing) + (rows-1) * vSpacing + staffToChildSpacing
  // = totalRows * frameW * (1 + staffScale for staff) + totalRows * (frameW * nameHRatio + nameSpacing) + gaps
  // Simplify: each child cell = frameW * (1 + nameHRatio) + nameSpacing
  //           each staff cell = frameW * staffScale * (1 + nameHRatio * 0.9) + nameSpacing
  const staffScale = s.staffScale || 1.3;
  const staffToChildH = staffRows > 0 ? s.staffToChildrenSpacing : 0;
  const gapH = (totalRows > 1 ? (totalRows - 1) * vSpacing : 0);

  // cellH(frameW) = frameW * (1 + nameHRatio) + nameSpacing
  // staffCellH(frameW) = frameW * staffScale * (1 + nameHRatio) + nameSpacing
  // totalH = childRows * cellH + staffRows * staffCellH + gapH + staffToChildH
  // Solve for frameW where totalH = availH
  const cellFactor = 1 + nameHRatio;
  const staffCellFactor = staffScale * (1 + nameHRatio);
  const fixedH = childRows * nameSpacing + staffRows * nameSpacing + gapH + staffToChildH;
  const frameWFactor = childRows * cellFactor + staffRows * staffCellFactor;

  const maxByHeight = frameWFactor > 0 ? Math.floor((availH - fixedH) / frameWFactor) : maxByWidth;

  // ── Final frame size: minimum of both constraints with a safety margin ─────
  const MIN_FRAME = 40;
  const fittedChildW = Math.max(MIN_FRAME, Math.min(maxByWidth, maxByHeight, s.childFrameSize.width));
  const fittedStaffW = Math.max(MIN_FRAME, Math.round(fittedChildW * staffScale));

  // ── Fit title/footer font sizes to their areas (light override) ─────────────
  // Cap font size so it never exceeds 70% of the allotted area height (single line comfort)
  const titleFontMax = Math.floor(s.topTitleAreaHeight * 0.62);
  const footerFontMax = Math.floor(s.bottomFooterAreaHeight * 0.62);
  const fittedTitleStyle = rule.titleTextStyle.fontSize > titleFontMax
    ? { ...rule.titleTextStyle, fontSize: titleFontMax }
    : rule.titleTextStyle;
  const fittedFooterStyle = rule.footerTextStyle.fontSize > footerFontMax
    ? { ...rule.footerTextStyle, fontSize: footerFontMax }
    : rule.footerTextStyle;
  const textStylesChanged =
    fittedTitleStyle !== rule.titleTextStyle ||
    fittedFooterStyle !== rule.footerTextStyle;

  // If nothing changed, return rule as-is
  if (fittedChildW === s.childFrameSize.width && !textStylesChanged) return rule;

  // Update name text styles proportionally
  const sizeRatio = s.childFrameSize.width > 0 ? fittedChildW / s.childFrameSize.width : 1;
  const updatedChildNameStyle = {
    ...rule.childNameTextStyle,
    fontSize: Math.max(14, Math.round(rule.childNameTextStyle.fontSize * sizeRatio))
  };
  const updatedStaffNameStyle = {
    ...rule.staffNameTextStyle,
    fontSize: Math.max(16, Math.round(rule.staffNameTextStyle.fontSize * sizeRatio))
  };

  return {
    ...rule,
    layoutSettings: {
      ...s,
      childFrameSize: { width: fittedChildW, height: fittedChildW },
      staffFrameSize: { width: fittedStaffW, height: fittedStaffW },
      frameToNameSpacing: Math.max(4, Math.round(s.frameToNameSpacing * sizeRatio))
    },
    childNameTextStyle: updatedChildNameStyle,
    staffNameTextStyle: updatedStaffNameStyle,
    titleTextStyle: fittedTitleStyle,
    footerTextStyle: fittedFooterStyle
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
  const availY = s.margins.top + s.topTitleAreaHeight + s.titleToContentSpacing;
  const availW = pageW - s.margins.left - s.margins.right;

  const childNameH = estimateNameHeight(rule.childNameTextStyle);
  const staffNameH = estimateNameHeight(rule.staffNameTextStyle);

  const childCellH = computeCellHeight(s.childFrameSize.height, childNameH, s.frameToNameSpacing, s.namePosition);
  const staffCellH = computeCellHeight(s.staffFrameSize.height, staffNameH, s.frameToNameSpacing, s.namePosition);

  // Staff positions
  const staffPositions: PersonPosition[] = [];
  let currentY = availY;

  if (s.staffRowEnabled && staffRecords.length > 0) {
    // How many staff fit per row?
    const staffPerRow = Math.max(1, Math.floor((availW + s.horizontalSpacing) / (s.staffFrameSize.width + s.horizontalSpacing)));
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
    const childPerRow = Math.max(1, Math.floor((availW + s.horizontalSpacing) / (s.childFrameSize.width + s.horizontalSpacing)));
    const rowDistribution = v.balanceLastRows
      ? balanceIntoRows(childRecords.length, childPerRow)
      : (() => {
          const rows: number[] = [];
          let remaining = childRecords.length;
          while (remaining > 0) {
            rows.push(Math.min(remaining, childPerRow));
            remaining -= childPerRow;
          }
          return rows;
        })();

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
  const footerTop = pageH - s.margins.bottom - s.bottomFooterAreaHeight - s.contentToFooterSpacing;
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

function makePersonFrameLayer(
  pos: PersonPosition,
  style: ClassPhotoFrameStyle,
  ruleId: string,
  zIndex: number,
  existingId?: string
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
      scale: 1,
      rotation: pos.record.manualImageRotation ?? 0
    },
    crop: { x: 0, y: 0, width: pos.frameW, height: pos.frameH },
    padding: 0,
    cornerRadius: style.shape === "roundedRect" ? (style.cornerRadius ?? 12) : undefined,
    fill: style.fill,
    maskId: style.maskPresetId,
    smartCropMode: "face",
    faceAnchor: pos.record.faceData,
    visualEffects: buildFrameVisualEffects(style),
    metadata: {
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
  existingId?: string
): TextLayer {
  return {
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
    text: rule.titleText || "תמונת כיתה",
    fontFamily: ts.fontFamily,
    fontWeight: ts.fontWeight,
    fontStyle: "normal",
    fontSize: ts.fontSize,
    lineHeight: ts.lineHeight,
    letterSpacing: ts.letterSpacing,
    color: ts.color,
    fillOpacity: 1,
    alignment: "center",
    direction: "rtl",
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
    alignment: "center",
    direction: "rtl",
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
  const existingTitleId = rule.titleTextLayerId;
  const existingFooterId = rule.footerTextLayerId;

  // Title — reuse existing ID to prevent Konva remount
  const titleLayer = { ...makeTitleLayer(page.width, rule, zIdx++), id: existingTitleId ?? crypto.randomUUID() };

  // Footer — reuse existing ID
  const footerLayer = { ...makeFooterLayer(page.width, page.height, rule, zIdx++), id: existingFooterId ?? crypto.randomUUID() };

  // Staff frames + names
  const updatedStaffRecords: ClassPhotoPersonRecord[] = [];
  for (const pos of positions.staffPositions) {
    const frame = makePersonFrameLayer(pos, rule.staffFrameStyle, rule.id, zIdx++, existingFrameIds.get(pos.record.id));
    const name = makePersonNameLayer(pos, rule.staffNameTextStyle, rule.id, zIdx++, existingNameIds.get(pos.record.id));
    newLayers.push(frame, name);
    updatedStaffRecords.push({ ...pos.record, frameLayerId: frame.id, nameTextLayerId: name.id });
  }

  // Child frames + names
  const updatedChildRecords: ClassPhotoPersonRecord[] = [];
  for (const pos of positions.childPositions) {
    const frame = makePersonFrameLayer(pos, rule.childFrameStyle, rule.id, zIdx++, existingFrameIds.get(pos.record.id));
    const name = makePersonNameLayer(pos, rule.childNameTextStyle, rule.id, zIdx++, existingNameIds.get(pos.record.id));
    newLayers.push(frame, name);
    updatedChildRecords.push({ ...pos.record, frameLayerId: frame.id, nameTextLayerId: name.id });
  }

  // Add title/footer on top
  newLayers.push(titleLayer, footerLayer);

  const updatedRule: ClassPhotoLayoutRule = {
    ...rule,
    personRecords: [
      ...updatedStaffRecords,
      ...updatedChildRecords
    ],
    titleTextLayerId: titleLayer.id,
    footerTextLayerId: footerLayer.id
  };

  const updatedPage: Page = { ...page, layers: newLayers };

  return {
    page: updatedPage,
    rule: updatedRule,
    overflows: positions.overflows,
    warningMessage: positions.warningMessage
  };
}

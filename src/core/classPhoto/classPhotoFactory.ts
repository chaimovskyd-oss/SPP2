import { createPage } from "@/core/document/factory";
import type { Asset, Document } from "@/types/document";
import type { PageSetup } from "@/types/primitives";
import type { ProjectCustomerInfo } from "@/types/project";
import type {
  ClassPhotoFrameStyle,
  ClassPhotoLayoutRule,
  ClassPhotoLayoutSettings,
  ClassPhotoPersonRecord,
  ClassPhotoPersonRole,
  ClassPhotoVisualBalanceSettings
} from "@/types/classPhoto";
import type { TextStyle } from "@/types/template";

// ─── Frame style defaults ─────────────────────────────────────────────────────

export function defaultChildFrameStyle(): ClassPhotoFrameStyle {
  return {
    version: 1,
    shape: "circle",
    stroke: { version: 1, color: "#ffffff", width: 3, opacity: 1 },
    shadow: { version: 1, color: "#000000", blur: 8, offsetX: 0, offsetY: 2, opacity: 0.18 }
  };
}

export function defaultStaffFrameStyle(): ClassPhotoFrameStyle {
  return {
    version: 1,
    shape: "roundedRect",
    cornerRadius: 12,
    stroke: { version: 1, color: "#ffffff", width: 3, opacity: 1 },
    shadow: { version: 1, color: "#000000", blur: 8, offsetX: 0, offsetY: 2, opacity: 0.22 }
  };
}

// ─── Text style defaults — font sizes scale with page/frame dimensions ────────

export function defaultChildNameTextStyle(frameSizePx: number, fontFamily = "Assistant"): TextStyle {
  return {
    version: 1,
    fontFamily,
    fontWeight: 400,
    fontSize: Math.max(18, Math.round(frameSizePx * 0.14)),
    lineHeight: 1.25,
    letterSpacing: 0,
    color: "#222222",
    alignment: "center",
    direction: "rtl"
  };
}

export function defaultStaffNameTextStyle(frameSizePx: number, fontFamily = "Assistant"): TextStyle {
  return {
    version: 1,
    fontFamily,
    fontWeight: 600,
    fontSize: Math.max(20, Math.round(frameSizePx * 0.15)),
    lineHeight: 1.25,
    letterSpacing: 0,
    color: "#111111",
    alignment: "center",
    direction: "rtl"
  };
}

export function defaultTitleTextStyle(pageWidthPx: number, fontFamily = "Assistant"): TextStyle {
  return {
    version: 1,
    fontFamily,
    fontWeight: 700,
    fontSize: Math.max(60, Math.round(pageWidthPx * 0.045)),
    lineHeight: 1.3,
    letterSpacing: 0,
    color: "#1a1a2e",
    alignment: "center",
    direction: "rtl"
  };
}

export function defaultFooterTextStyle(pageWidthPx: number, fontFamily = "Assistant"): TextStyle {
  return {
    version: 1,
    fontFamily,
    fontWeight: 400,
    fontSize: Math.max(32, Math.round(pageWidthPx * 0.025)),
    lineHeight: 1.3,
    letterSpacing: 0,
    color: "#555555",
    alignment: "center",
    direction: "rtl"
  };
}

// ─── Auto-sizing: compute frame size from child/staff count ──────────────────

/**
 * Given available content width and the number of people in the layout,
 * returns an optimal frame size so the layout fills the page well.
 * Fewer children → bigger frames.
 */
export function computeAutoFrameSize(
  availableWidthPx: number,
  childCount: number,
  staffCount: number,
  hSpacingRatio = 0.04
): { childFrameSize: number; staffFrameSize: number } {
  const total = Math.max(1, childCount + staffCount);

  // Target columns: square-root heuristic, capped at sensible range
  const targetPerRow = Math.min(10, Math.max(2, Math.ceil(Math.sqrt(total * 1.5))));

  // Derive spacing from frame size (we'll iterate once)
  // spacing = frameSize * hSpacingRatio
  // frameSize * targetPerRow + spacing * (targetPerRow - 1) = availableWidth
  // frameSize * (targetPerRow + hSpacingRatio * (targetPerRow - 1)) = availableWidth
  const frameDivisor = targetPerRow + hSpacingRatio * (targetPerRow - 1);
  const childFrameSize = Math.round(availableWidthPx / frameDivisor);
  const staffFrameSize = Math.round(childFrameSize * 1.3);

  return { childFrameSize, staffFrameSize };
}

// ─── Layout settings ──────────────────────────────────────────────────────────

export function defaultLayoutSettings(
  pageWidthPx: number,
  pageHeightPx: number,
  childCount = 20,
  staffCount = 2
): ClassPhotoLayoutSettings {
  const marginH = Math.round(pageWidthPx * 0.03);
  const marginV = Math.round(pageHeightPx * 0.03);
  const availW = pageWidthPx - marginH * 2;

  const { childFrameSize, staffFrameSize } = computeAutoFrameSize(availW, childCount, staffCount);

  // Spacing proportional to frame size so layout stays consistent
  const hSpacing = Math.round(childFrameSize * 0.12);
  const vSpacing = Math.round(childFrameSize * 0.14);

  return {
    version: 1,
    topTitleAreaHeight: Math.round(pageHeightPx * 0.1),
    bottomFooterAreaHeight: Math.round(pageHeightPx * 0.065),
    staffRowEnabled: true,
    staffLargerThanChildren: true,
    staffScale: 1.3,
    childGroupScale: 1,
    staffGroupScale: 1,
    childFrameSize: { width: childFrameSize, height: childFrameSize },
    staffFrameSize: { width: staffFrameSize, height: staffFrameSize },
    horizontalSpacing: hSpacing,
    verticalSpacing: vSpacing,
    staffToChildrenSpacing: Math.round(vSpacing * 1.5),
    frameToNameSpacing: Math.round(childFrameSize * 0.06),
    titleToContentSpacing: Math.round(pageHeightPx * 0.015),
    contentToFooterSpacing: Math.round(pageHeightPx * 0.015),
    namePosition: "belowFrame",
    margins: { top: marginV, right: marginH, bottom: marginV, left: marginH },
    autoFitToPage: true,
    preventOverlap: true
  };
}

export function defaultVisualBalanceSettings(): ClassPhotoVisualBalanceSettings {
  return {
    version: 1,
    centerPartialRows: true,
    balanceLastRows: true,
    centerStaffRow: true,
    sortMode: "manualOrder"
  };
}

// ─── Person record ────────────────────────────────────────────────────────────

export function extractNameFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createClassPhotoPersonRecord(
  assetId: string,
  filename: string,
  role: ClassPhotoPersonRole,
  orderIndex: number
): ClassPhotoPersonRecord {
  return {
    version: 1,
    id: crypto.randomUUID(),
    role,
    assetId,
    originalFilename: filename,
    displayName: extractNameFromFilename(filename),
    orderIndex,
    metadata: {}
  };
}

// ─── Layout rule ─────────────────────────────────────────────────────────────

export function createClassPhotoLayoutRule(
  pageId: string,
  personRecords: ClassPhotoPersonRecord[],
  titleText: string,
  footerText: string,
  layoutSettings: ClassPhotoLayoutSettings,
  visualBalanceSettings: ClassPhotoVisualBalanceSettings,
  childFrameStyle?: ClassPhotoFrameStyle,
  staffFrameStyle?: ClassPhotoFrameStyle,
  titleFontFamily = "Assistant",
  footerFontFamily = "Assistant",
  pageWidthPx = 2480,
  titleTextEffects: import("@/types/text").TextEffect[] = [],
  footerTextEffects: import("@/types/text").TextEffect[] = [],
  titlePresetStyle?: import("@/types/primitives").Metadata,
  footerPresetStyle?: import("@/types/primitives").Metadata
): ClassPhotoLayoutRule {
  const childFrameSize = layoutSettings.childFrameSize.width;
  const staffFrameSize = layoutSettings.staffFrameSize.width;

  return {
    version: 1,
    id: crypto.randomUUID(),
    pageId,
    personRecords,
    childFrameStyle: childFrameStyle ?? defaultChildFrameStyle(),
    staffFrameStyle: staffFrameStyle ?? defaultStaffFrameStyle(),
    childNameTextStyle: defaultChildNameTextStyle(childFrameSize),
    staffNameTextStyle: defaultStaffNameTextStyle(staffFrameSize),
    titleTextStyle: defaultTitleTextStyle(pageWidthPx, titleFontFamily),
    footerTextStyle: defaultFooterTextStyle(pageWidthPx, footerFontFamily),
    layoutSettings,
    visualBalanceSettings,
    titleText,
    footerText,
    titleTextEffects,
    footerTextEffects,
    titlePresetStyle,
    footerPresetStyle,
    metadata: {}
  };
}

// ─── Full document factory ────────────────────────────────────────────────────

export function createClassPhotoModeDocument(
  name: string,
  pageSetup: PageSetup,
  assets: Asset[],
  personRecords: ClassPhotoPersonRecord[],
  titleText: string,
  footerText: string,
  layoutSettings: ClassPhotoLayoutSettings,
  visualBalanceSettings: ClassPhotoVisualBalanceSettings,
  childFrameStyle: ClassPhotoFrameStyle,
  staffFrameStyle: ClassPhotoFrameStyle,
  titleFontFamily = "Assistant",
  footerFontFamily = "Assistant",
  backgroundAssetId?: string,
  projectMetadata?: Partial<ProjectCustomerInfo>,
  titleTextEffects: import("@/types/text").TextEffect[] = [],
  footerTextEffects: import("@/types/text").TextEffect[] = [],
  titlePresetStyle?: import("@/types/primitives").Metadata,
  footerPresetStyle?: import("@/types/primitives").Metadata
): Document {
  const page = createPage({ setup: pageSetup });

  // Apply background if provided
  const pageWithBg = backgroundAssetId
    ? { ...page, background: { version: 1 as const, type: "asset" as const, assetId: backgroundAssetId } }
    : page;

  const rule = createClassPhotoLayoutRule(
    pageWithBg.id,
    personRecords,
    titleText,
    footerText,
    layoutSettings,
    visualBalanceSettings,
    childFrameStyle,
    staffFrameStyle,
    titleFontFamily,
    footerFontFamily,
    pageSetup.size.width,
    titleTextEffects,
    footerTextEffects,
    titlePresetStyle,
    footerPresetStyle
  );

  return {
    version: 1,
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    dpi: pageSetup.dpi,
    colorProfile: "sRGB",
    pages: [pageWithBg],
    assets,
    presets: [],
    gridRules: [],
    gridImageAssignments: [],
    gridTextOverlayRules: [],
    maskRules: [],
    maskImageAssignments: [],
    maskTextOverlayRules: [],
    maskPresets: [],
    collageRules: [],
    photoPrintRules: [],
    photoPrintImageAssignments: [],
    classPhotoRules: [rule],
    blessingRules: [],
    viewport: {
      version: 1,
      zoom: 1,
      panX: 0,
      panY: 0,
      screenWidth: 1200,
      screenHeight: 800,
      showRulers: true,
      showGrid: false,
      showGuides: true,
      snapEnabled: true,
      fitMode: "fitPage",
      backgroundStyle: "checkerboard"
    },
    metadata: {
      mode: "class_photo",
      activeClassPhotoId: rule.id,
      ...(projectMetadata ?? {})
    }
  };
}

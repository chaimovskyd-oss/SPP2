import type { ID, Margins, Metadata, Rect, Size, VersionedEntity } from "./primitives";
import type { FillStyle, ShadowStyle, StrokeStyle } from "./primitives";
import type { TextStyle } from "./template";

// ─── Frame style ─────────────────────────────────────────────────────────────

export interface ClassPhotoFrameStyle extends VersionedEntity {
  shape: "rect" | "roundedRect" | "circle" | "ellipse" | "star" | "cloud" | "maskPreset";
  maskPresetId?: string;
  cornerRadius?: number;
  stroke?: StrokeStyle;
  shadow?: ShadowStyle;
  outerGlow?: ShadowStyle;
  fill?: FillStyle;
}

// ─── Layout settings ─────────────────────────────────────────────────────────

export interface ClassPhotoLayoutSettings extends VersionedEntity {
  topTitleAreaHeight: number;
  bottomFooterAreaHeight: number;

  staffRowEnabled: boolean;
  staffLargerThanChildren: boolean;
  staffScale: number;

  childFrameSize: Size;
  staffFrameSize: Size;

  horizontalSpacing: number;
  verticalSpacing: number;
  staffToChildrenSpacing: number;
  frameToNameSpacing: number;
  titleToContentSpacing: number;
  contentToFooterSpacing: number;

  namePosition: "belowFrame" | "aboveFrame" | "insideBottom" | "insideTop";

  margins: Margins;
  safeArea?: Rect;

  autoFitToPage: boolean;
  preventOverlap: boolean;
}

// ─── Visual balance ───────────────────────────────────────────────────────────

export interface ClassPhotoVisualBalanceSettings extends VersionedEntity {
  centerPartialRows: boolean;
  balanceLastRows: boolean;
  centerStaffRow: boolean;
  sortMode: "manualOrder" | "alphabetical";
}

// ─── Person record ────────────────────────────────────────────────────────────

export type ClassPhotoPersonRole = "child" | "staff";

export interface ClassPhotoPersonRecord extends VersionedEntity {
  id: ID;
  role: ClassPhotoPersonRole;

  assetId: ID;
  frameLayerId?: ID;
  nameTextLayerId?: ID;

  originalFilename: string;
  displayName: string;

  faceData?: import("./layers").FaceAnchorData;

  orderIndex: number;

  manualImageCrop?: import("./primitives").CropRect;
  manualImageRotation?: number;
  hasManualCropOverride?: boolean;
  hasManualRotationOverride?: boolean;

  /**
   * Per-person override for the frame's VisualEffectStack. When present, the
   * class-photo sync uses this instead of the rule-level frameStyle effects,
   * so user-customized effects survive frame-style changes / regenerate.
   */
  visualEffectsOverride?: import("./visualEffects").VisualEffectStack;

  metadata: Metadata;
}

// ─── Main layout rule ─────────────────────────────────────────────────────────

export interface ClassPhotoLayoutRule extends VersionedEntity {
  id: ID;
  pageId: ID;

  titleTextLayerId?: ID;
  footerTextLayerId?: ID;
  backgroundLayerId?: ID;

  personRecords: ClassPhotoPersonRecord[];

  childFrameStyle: ClassPhotoFrameStyle;
  staffFrameStyle: ClassPhotoFrameStyle;

  childNameTextStyle: TextStyle;
  staffNameTextStyle: TextStyle;

  titleTextStyle: TextStyle;
  footerTextStyle: TextStyle;

  layoutSettings: ClassPhotoLayoutSettings;
  visualBalanceSettings: ClassPhotoVisualBalanceSettings;

  backgroundPresetId?: string;
  templatePresetId?: string;

  titleText: string;
  footerText: string;

  titleTextEffects: import("./text").TextEffect[];
  footerTextEffects: import("./text").TextEffect[];
  /** Preset visual style (color, gradient, stroke, shadow) applied from BUILTIN_TEXT_PRESETS */
  titlePresetStyle?: import("./primitives").Metadata;
  footerPresetStyle?: import("./primitives").Metadata;

  metadata: Metadata;
}

// ─── Wizard result ────────────────────────────────────────────────────────────

export interface ClassPhotoWizardImageEntry {
  file: File;
  url: string;
  width: number;
  height: number;
}

export interface ClassPhotoWizardResult {
  /** Raw image entries — App.tsx imports these as assets */
  images: ClassPhotoWizardImageEntry[];
  /** Person records with PLACEHOLDER_ assetIds — App.tsx replaces them after import */
  personRecords: ClassPhotoPersonRecord[];
  /** Background image file if the user chose one */
  backgroundFile?: File;
  pageSetup: import("./primitives").PageSetup;
  titleText: string;
  footerText: string;
  titleFontFamily: string;
  footerFontFamily: string;
  titlePresetId?: string;
  footerPresetId?: string;
  childFrameStyle: ClassPhotoFrameStyle;
  staffFrameStyle: ClassPhotoFrameStyle;
  layoutSettings: ClassPhotoLayoutSettings;
  visualBalanceSettings: ClassPhotoVisualBalanceSettings;
  customerInfo?: Partial<import("./project").ProjectCustomerInfo>;
}

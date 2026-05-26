import type { Asset } from "./document";
import type { ContentTransform, FrameLayer } from "./layers";
import type { FitMode, ID, JsonValue, Metadata, VersionedEntity } from "./primitives";

export type PhotoPrintAutoRotatePolicy = "none" | "rotateToSlotOrientation";

export interface PhotoPrintFrameMetadata extends Record<string, JsonValue> {
  photoPrintId: ID;
  photoPrintPageIndex: number;
  slotIndexGlobal: number;
  slotIndexOnPage: number;
  row: number;
  column: number;
  rotatedOnSheet: boolean;
  isPhotoPrintSlot: true;
}

export interface PhotoPrintImageAssignment extends VersionedEntity {
  id: ID;
  photoPrintId: ID;
  assetId: ID;
  frameId: ID;
  globalIndex: number;
  pageIndex: number;
  slotIndexOnPage: number;
  sourceImageIndex: number;
  copyIndex: number;
  manualContentTransform?: ContentTransform;
  manualFitModeOverride?: FitMode;
  hasManualCropOverride?: boolean;
  hasManualRotationOverride?: boolean;
  passportState?: PhotoPrintPassportAssignmentState;
}

export interface PhotoPrintPassportSize {
  width: number;
  height: number;
}

export interface PhotoPrintPassportAssignmentState extends VersionedEntity {
  selectedPassportPreset?: string;
  selectedPassportSize?: PhotoPrintPassportSize;
  showPassportGuidelines?: boolean;
  manualAdjustmentState?: ContentTransform;
  autoAdjustmentState?: ContentTransform;
}

export interface PhotoPrintRule extends VersionedEntity {
  id: ID;
  name: string;
  pageIds: ID[];
  frameIds: ID[];
  printWidthMm: number;
  printHeightMm: number;
  pagePresetId?: string;
  frameBorderEnabled: boolean;
  frameBorderMm: number;
  frameBorderColor: string;
  cutLineEnabled: boolean;
  cutLineWidthPx: number;
  cutLineColor: string;
  fitMode: FitMode;
  autoRotatePolicy: PhotoPrintAutoRotatePolicy;
  autoRotateOnSheet: boolean;
  sheetMarginsMm: number;
  gapBetweenPrintsMm: number;
  slotsPerRow: number;
  slotsPerColumn: number;
  slotsRotatedOnSheet: boolean;
  targetsPerPage: number;
  orientationPolicy: "auto" | "portrait" | "landscape";
  faceDetectionEnabled: boolean;
  globalCopies: number;
  perImageCopies: Record<number, number>;
  smartFillEnabled: boolean;
  passportPresetId?: string;
  passportRequirementId?: string;
  passportSizeMm?: PhotoPrintPassportSize;
  showPassportGuidelines?: boolean;
  metadata: Metadata;
}

export interface PhotoPrintCreateOptions {
  name?: string;
  printWidthMm: number;
  printHeightMm: number;
  globalCopies?: number;
  frameBorderEnabled?: boolean;
  frameBorderMm?: number;
  frameBorderColor?: string;
  cutLineEnabled?: boolean;
  fitMode?: FitMode;
  autoRotatePolicy?: PhotoPrintAutoRotatePolicy;
  autoRotateOnSheet?: boolean;
  sheetMarginsMm?: number;
  gapBetweenPrintsMm?: number;
  targetsPerPage?: number;
  orientationPolicy?: "auto" | "portrait" | "landscape";
  faceDetectionEnabled?: boolean;
  smartFillEnabled?: boolean;
  printPresetId?: string;
  passportPresetId?: string;
  passportRequirementId?: string;
  passportSizeMm?: PhotoPrintPassportSize;
  showPassportGuidelines?: boolean;
}

export interface PhotoPrintImageInput {
  asset: Asset;
  copies?: number;
  manualContentTransform?: ContentTransform;
  manualFitModeOverride?: FitMode;
}

export interface PrintSizePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  category: "photo" | "paper" | "passport" | "official" | "custom";
  passportRequirementId?: string;
  passportPresetId?: string;
}

export const PRINT_SIZE_PRESETS: PrintSizePreset[] = [
  { id: "10x15", name: "10×15 ס\"מ", widthMm: 100, heightMm: 150, category: "photo" },
  { id: "4x6_inch", name: "4×6 אינץ'", widthMm: 101.6, heightMm: 152.4, category: "photo" },
  { id: "13x18", name: "13×18 ס\"מ", widthMm: 130, heightMm: 180, category: "photo" },
  { id: "5x7_inch", name: "5×7 אינץ'", widthMm: 127, heightMm: 177.8, category: "photo" },
  { id: "15x20", name: "15×20 ס\"מ", widthMm: 150, heightMm: 200, category: "photo" },
  { id: "6x8_inch", name: "6×8 אינץ'", widthMm: 152.4, heightMm: 203.2, category: "photo" },
  { id: "20x25", name: "20×25 ס\"מ", widthMm: 200, heightMm: 250, category: "photo" },
  { id: "20x30", name: "20×30 ס\"מ", widthMm: 200, heightMm: 300, category: "photo" },
  { id: "30x40", name: "30×40 ס\"מ", widthMm: 300, heightMm: 400, category: "photo" },
  { id: "40x50", name: "40×50 ס\"מ", widthMm: 400, heightMm: 500, category: "photo" },
  { id: "50x70", name: "50×70 ס\"מ", widthMm: 500, heightMm: 700, category: "photo" },
  { id: "60x90", name: "60×90 ס\"מ", widthMm: 600, heightMm: 900, category: "photo" },
  { id: "a5", name: "A5", widthMm: 148, heightMm: 210, category: "paper" },
  { id: "a4", name: "A4", widthMm: 210, heightMm: 297, category: "paper" },
  { id: "a3", name: "A3", widthMm: 297, heightMm: 420, category: "paper" },
  { id: "israel_biometric_35x45", name: "Israeli Biometric 35x45", widthMm: 35, heightMm: 45, category: "passport", passportRequirementId: "israelBiometric", passportPresetId: "israelBiometric35x45" },
  { id: "israel_biometric_50x50", name: "Israeli Biometric 50x50", widthMm: 50, heightMm: 50, category: "passport", passportRequirementId: "israelBiometric", passportPresetId: "israelBiometric50x50" },
  { id: "israel_passport_35x45", name: "Israeli Passport 35x45", widthMm: 35, heightMm: 45, category: "passport", passportRequirementId: "israelPassport35x45", passportPresetId: "israelPassport35x45" },
  { id: "israel_passport_50x50", name: "Israeli Passport 50x50", widthMm: 50, heightMm: 50, category: "passport", passportRequirementId: "israelPassport50x50", passportPresetId: "israelPassport50x50" },
  { id: "israel_id", name: "Israeli ID 35x45", widthMm: 35, heightMm: 45, category: "official", passportRequirementId: "israelId", passportPresetId: "israelId" },
  { id: "israel_visa_embassy", name: "Israeli Visa / Embassy 50x50", widthMm: 50, heightMm: 50, category: "official", passportRequirementId: "israelVisaEmbassy", passportPresetId: "israelVisaEmbassy" },
  { id: "us_visa", name: "US Visa 2x2\"", widthMm: 50.8, heightMm: 50.8, category: "official", passportRequirementId: "usVisa", passportPresetId: "usVisa" },
  { id: "passport_il", name: "דרכון ישראלי 3.5×4.5", widthMm: 35, heightMm: 45, category: "passport" },
  { id: "passport_us", name: "US Passport 2×2\"", widthMm: 50.8, heightMm: 50.8, category: "passport" },
  { id: "passport_uk", name: "UK Passport 35×45", widthMm: 35, heightMm: 45, category: "passport" },
  { id: "passport_ca", name: "Canada Passport 50×70", widthMm: 50, heightMm: 70, category: "passport" },
  { id: "custom", name: "מותאם אישית", widthMm: 100, heightMm: 150, category: "custom" }
];

export interface PhotoPagePreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
}

export const PHOTO_PAGE_PRESETS: PhotoPagePreset[] = [
  { id: "4x6_inch", name: '4×6 אינץ\'', widthMm: 101.6, heightMm: 152.4, dpi: 300 },
  { id: "6x8_inch", name: '6×8 אינץ\'', widthMm: 152.4, heightMm: 203.2, dpi: 300 },
  { id: "photo_10x15", name: "10×15 ס\"מ", widthMm: 100, heightMm: 150, dpi: 300 },
  { id: "photo_13x18", name: "13×18 ס\"מ", widthMm: 130, heightMm: 180, dpi: 300 },
  { id: "photo_15x20", name: "15×20 ס\"מ", widthMm: 150, heightMm: 200, dpi: 300 },
  { id: "photo_20x30", name: "20×30 ס\"מ", widthMm: 200, heightMm: 300, dpi: 300 },
  { id: "a5", name: "A5", widthMm: 148, heightMm: 210, dpi: 300 },
  { id: "a4", name: "A4", widthMm: 210, heightMm: 297, dpi: 300 },
  { id: "a3", name: "A3", widthMm: 297, heightMm: 420, dpi: 300 },
  { id: "large_printer", name: "גיליון גדול 60.96×21", widthMm: 609.6, heightMm: 210, dpi: 300 },
  { id: "custom", name: "מותאם אישית", widthMm: 210, heightMm: 297, dpi: 300 }
];

export type PhotoPrintFrameLayer = FrameLayer & {
  metadata: FrameLayer["metadata"] & {
    photoPrintSlot: PhotoPrintFrameMetadata;
  };
};

export interface PhotoPrintLayoutResult {
  slotsPerRow: number;
  slotsPerColumn: number;
  rotatedOnSheet: boolean;
  slotsPerPage: number;
  totalPages: number;
  slotWidthPx: number;
  slotHeightPx: number;
  fits: boolean;
}

export interface PhotoPrintWizardResult {
  images: PhotoPrintWizardImageEntry[];
  pageWidthMm: number;
  pageHeightMm: number;
  pageDpi: number;
  pageOrientation: "portrait" | "landscape";
  pagePresetId: string;
  printOptions: PhotoPrintCreateOptions;
  customerInfo?: {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
  };
}

export interface PhotoPrintWizardImageEntry {
  file: File;
  url: string;
  width: number;
  height: number;
  copies: number;
}

export type { Asset };

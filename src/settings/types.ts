import type { Unit } from "@/types/primitives";
import type { AppShortcutDef } from "@/core/input/inputSystem";

export type { AppShortcutDef };

// ─── Shortcut types ────────────────────────────────────────────────────────────

export interface ShortcutModifiers {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/** Persisted shortcut entry: extends the definition with user-overridden current binding */
export interface AppShortcut extends AppShortcutDef {
  currentKey: string;
  currentCtrl?: boolean;
  currentMeta?: boolean;
  currentShift?: boolean;
  currentAlt?: boolean;
}

// ─── Category interfaces ───────────────────────────────────────────────────────

export interface GeneralSettings {
  defaultUnit: Unit;
  startupBehavior: "home" | "lastProject" | "recentProjects";
  defaultProjectFolder: string;
  customerNameEnabled: boolean;
  customerPhoneEnabled: boolean;
  customerEmailEnabled: boolean;
  saveProjectType: boolean;
  defaultFileNamingPattern: string;
}

export interface FreeModeDefaults {
  snappingEnabled: boolean;
  showAlignmentGuides: boolean;
  nudgeStepMm: number;
  nudgeLargeStepMm: number;
}

export interface GridModeDefaults {
  defaultGapMm: number;
  defaultMarginsMm: number;
  autoFill: boolean;
  autoRotateImageInCell: boolean;
}

export interface SizeModeDefaults {
  defaultSpacingMm: number;
  defaultRepeatQuantity: number;
  preventOversizedCells: boolean;
  showOversizeWarning: boolean;
}

export interface PassportModeDefaults {
  defaultCountry: string;
  showValidationByDefault: boolean;
  showCompositionByDefault: boolean;
}

export interface MaskModeDefaults {
  defaultMaskFitMode: "cover" | "contain" | "fit";
  showOutlineByDefault: boolean;
  defaultFeatherPx: number;
  defaultCellLocked: boolean;
  defaultSpacingUnit: Unit;
}

export interface WorkspaceSettings {
  defaultPageSizePresetId: string;
  defaultOrientation: "portrait" | "landscape";
  defaultMarginsEnabled: boolean;
  defaultMarginsMm: number;
  defaultBleedMm: number;
  defaultSafeAreaMm: number;
  defaultZoomBehavior: "fitScreen" | "100" | "rememberLast";
  snappingEnabled: boolean;
  guidesEnabled: boolean;
  rulersEnabled: boolean;
  gridVisible: boolean;
  defaultObjectSpacingMm: number;
  defaultImageFillMode: "cover" | "contain" | "fit" | "stretch";
  autoRotateImagesInFrames: boolean;
  freeModeDefaults: FreeModeDefaults;
  gridModeDefaults: GridModeDefaults;
  sizeModeDefaults: SizeModeDefaults;
  passportModeDefaults: PassportModeDefaults;
  maskModeDefaults: MaskModeDefaults;
}

export interface ShortcutsSettings {
  shortcuts: AppShortcut[];
  nudgeStepMm: number;
  nudgeLargeStepMm: number;
}

export interface AppearanceSettings {
  theme: "dark" | "light" | "system";
  uiDensity: "comfortable" | "compact";
  canvasBackgroundColor: string;
  guideColor: string;
  gridColor: string;
  safeAreaColor: string;
  bleedColor: string;
  selectionColor: string;
}

export interface PerformanceSettings {
  previewQuality: "low" | "medium" | "high";
  renderQuality: "standard" | "high" | "print";
  enableGpuAcceleration: boolean;
  maxPreviewSizePx: number;
  undoHistoryLimit: number;
  warnLargeFileMb: number;
  performanceMode: boolean;
  lowResWhileDragging: boolean;
}

export interface FilesAutosaveSettings {
  autosaveEnabled: boolean;
  autosaveIntervalMinutes: number;
  autosaveAfterActions: number;
  keepBackupVersions: boolean;
  backupVersionCount: number;
  recentProjectsCount: number;
  projectStorageMode: "linked" | "embedded" | "ask";
  warnMissingLinkedImage: boolean;
  saveProjectThumbnail: boolean;
  autoClearCacheDays: number;
  // External app paths (mirrors ExternalAppPaths from settingsStore for bridge compatibility)
  photoshopPath: string;
  colorLabPath: string;
  pdfEditorPath: string;
  collageEditorPath: string;
  projectsFolder: string;
  exportsFolder: string;
  tempEditingFolder: string;
}

export interface ExportPrintSettings {
  defaultExportFormat: "pdf" | "png" | "jpg";
  defaultDpi: number;
  jpgQuality: number;
  pngTransparency: boolean;
  includeBleedInExport: boolean;
  includeCropMarks: boolean;
  openFolderAfterExport: boolean;
  defaultExportFolder: string;
  afterExportBehavior: "nothing" | "openFolder" | "openFile";
}

export interface PassportSettings {
  defaultPresetId: string;
  rememberLastPreset: boolean;
  showValidationPanel: boolean;
  showCompositionRecommendations: boolean;
  validationStrictness: "normal" | "strict";
  showGuideLines: boolean;
}

export interface AdvancedSettings {
  debugMode: boolean;
  enableDiagnostics: boolean;
}

// ─── Root settings shape ───────────────────────────────────────────────────────

export interface AppSettings {
  schemaVersion: number;
  general: GeneralSettings;
  workspace: WorkspaceSettings;
  shortcuts: ShortcutsSettings;
  appearance: AppearanceSettings;
  performance: PerformanceSettings;
  filesAutosave: FilesAutosaveSettings;
  exportPrint: ExportPrintSettings;
  passport: PassportSettings;
  advanced: AdvancedSettings;
}

export type SettingsCategory = keyof Omit<AppSettings, "schemaVersion">;

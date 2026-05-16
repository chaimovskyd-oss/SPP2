import { DEFAULT_SHORTCUT_DEFINITIONS } from "@/core/input/inputSystem";
import type { AppSettings } from "./types";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 1,

  general: {
    defaultUnit: "mm",
    startupBehavior: "home",
    defaultProjectFolder: "",
    customerNameEnabled: true,
    customerPhoneEnabled: true,
    customerEmailEnabled: true,
    saveProjectType: true,
    defaultFileNamingPattern: "customerName-date-projectType"
  },

  workspace: {
    defaultPageSizePresetId: "a4",
    defaultOrientation: "portrait",
    defaultMarginsEnabled: false,
    defaultMarginsMm: 0,
    defaultBleedMm: 0,
    defaultSafeAreaMm: 0,
    defaultZoomBehavior: "fitScreen",
    snappingEnabled: true,
    guidesEnabled: true,
    rulersEnabled: true,
    gridVisible: false,
    defaultObjectSpacingMm: 3,
    defaultImageFillMode: "cover",
    autoRotateImagesInFrames: false,
    freeModeDefaults: {
      snappingEnabled: true,
      showAlignmentGuides: true,
      nudgeStepMm: 1,
      nudgeLargeStepMm: 10
    },
    gridModeDefaults: {
      defaultGapMm: 3,
      defaultMarginsMm: 5,
      autoFill: true,
      autoRotateImageInCell: false
    },
    sizeModeDefaults: {
      defaultSpacingMm: 3,
      defaultRepeatQuantity: 1,
      preventOversizedCells: true,
      showOversizeWarning: true
    },
    passportModeDefaults: {
      defaultCountry: "IL",
      showValidationByDefault: true,
      showCompositionByDefault: true
    },
    maskModeDefaults: {
      defaultMaskFitMode: "cover",
      showOutlineByDefault: true,
      defaultFeatherPx: 0
    }
  },

  shortcuts: {
    shortcuts: DEFAULT_SHORTCUT_DEFINITIONS.map((def) => ({
      ...def,
      currentKey: def.defaultKey,
      currentCtrl: def.ctrl,
      currentMeta: def.meta,
      currentShift: def.shift,
      currentAlt: def.alt
    })),
    nudgeStepMm: 1,
    nudgeLargeStepMm: 10
  },

  appearance: {
    theme: "dark",
    uiDensity: "comfortable",
    canvasBackgroundColor: "#0f0e13",
    guideColor: "#7c6fe0",
    gridColor: "#7c6fe0",
    safeAreaColor: "#52c97a",
    bleedColor: "#e06b6b",
    selectionColor: "#7c6fe0"
  },

  performance: {
    previewQuality: "high",
    renderQuality: "high",
    enableGpuAcceleration: true,
    maxPreviewSizePx: 2048,
    undoHistoryLimit: 100,
    warnLargeFileMb: 50,
    performanceMode: false,
    lowResWhileDragging: false
  },

  filesAutosave: {
    autosaveEnabled: true,
    autosaveIntervalMinutes: 3,
    autosaveAfterActions: 20,
    keepBackupVersions: true,
    backupVersionCount: 5,
    recentProjectsCount: 20,
    projectStorageMode: "linked",
    warnMissingLinkedImage: true,
    saveProjectThumbnail: true,
    autoClearCacheDays: 30,
    photoshopPath: "",
    colorLabPath: "",
    pdfEditorPath: "",
    collageEditorPath: "",
    projectsFolder: "",
    exportsFolder: "",
    tempEditingFolder: ""
  },

  exportPrint: {
    defaultExportFormat: "pdf",
    defaultDpi: 300,
    jpgQuality: 90,
    pngTransparency: false,
    includeBleedInExport: false,
    includeCropMarks: false,
    openFolderAfterExport: false,
    defaultExportFolder: "",
    afterExportBehavior: "nothing"
  },

  passport: {
    defaultPresetId: "il-passport",
    rememberLastPreset: true,
    showValidationPanel: true,
    showCompositionRecommendations: true,
    validationStrictness: "normal",
    showGuideLines: true
  },

  advanced: {
    debugMode: false,
    enableDiagnostics: false
  }
};

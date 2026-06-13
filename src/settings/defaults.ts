import { DEFAULT_SHORTCUT_DEFINITIONS } from "@/core/input/inputSystem";
import { BUILT_IN_OUTPUT_PRESETS } from "@/core/advancedPrint/builtInPresets";
import type { AppSettings } from "./types";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 2,

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
    smartGuidesEnabled: true,
    snapToCanvasEnabled: true,
    snapToLayersEnabled: true,
    rotationSnapEnabled: true,
    snapTolerancePx: 6,
    shiftSnapTolerancePx: 14,
    rotationSnapToleranceDeg: 4,
    shiftRotationStepDeg: 15,
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
      defaultFeatherPx: 0,
      defaultCellLocked: false,
      defaultSpacingUnit: "mm"
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
    lowResWhileDragging: false,
    aiPerformanceMode: "balanced",
    aiShowLoadingVideo: true
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
  },

  printHub: {
    networkFolderPath: "",
    stationRole: "designer",
    defaultApprovalMode: "require_approval",
    serverHubRoot: "",
    retentionDays: 14,
    transportMode: "folder",
    lanHost: "",
    lanPort: 8788,
    lanToken: "",
    cloudStatusEnabled: false
  },

  advancedPrint: {
    enabled: true,
    profiles: [],
    outputPresets: BUILT_IN_OUTPUT_PRESETS,
    iccProfiles: [],
    defaultProfileId: null,
    lastSuccessfulByPrinter: {}
  },

  components: {
    lastCheckedAt: ""
  }
};

// Data models for the experimental Advanced Print Engine (APE).
//
// APE is a parallel print path modeled on Photoshop's print dialog. It is separate
// from the photo-lab `printHub` system (src/types/printHub.ts) on purpose: these
// profiles describe *local desktop printing* with driver-owned settings (DEVMODE,
// tray, real borderless, roll) that SPP captures and replays rather than fights.
//
// The single most important type here is `PrintLayout`: it is computed once by
// computePrintLayout() and consumed by the preview, preflight, test page, PDF output,
// and the actual print job. Preview and job may never disagree on size/orientation/borderless.

// ─── Enums / unions ──────────────────────────────────────────────────────────

/** Which engine prints the job. The fallback ladder downgrades left→right. */
export type AdvancedPrintEngine = "windows-native" | "driver-dialog-first" | "pdf" | "electron";

export type OrientationPolicy =
  | "from-rendered-output"
  | "force-portrait"
  | "force-landscape"
  | "ask-before-print";

export type ScalingMode =
  | "actual-size"
  | "fit-to-page"
  | "fill-page"
  | "custom-percent"
  | "custom-size";

export type PositionMode = "center" | "top-left" | "custom";

export type MarginsPolicy = "use-driver-printable-area" | "force-none" | "custom-margins";

/**
 * Borderless is never claimed as "true" until verified. The status escalates only as
 * we gain evidence: a saved driver profile, or an actual test print confirmed by the user.
 */
export type BorderlessStatus =
  | "not-requested"
  | "requested-not-verified"
  | "driver-profile-saved"
  | "test-print-verified";

export type ColorManagementMode = "app-manages-color" | "printer-manages-color" | "none";

export type RenderingIntent = "perceptual" | "relative-colorimetric" | "saturation" | "absolute-colorimetric";

export type OutputUse =
  | "photo"
  | "canvas"
  | "sublimation"
  | "office"
  | "poster"
  | "product"
  | "proof";

/** Generic printer class inferred from capabilities (drives starter-profile suggestions). */
export type PrinterClass = "office-multi-tray" | "wide-format-roll" | "dye-sub" | "generic";

export type ResolvedOrientation = "portrait" | "landscape";

// ─── Geometry primitives ─────────────────────────────────────────────────────

export interface SizeMm {
  widthMm: number;
  heightMm: number;
}

export interface RectMm {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface EdgeInsetsMm {
  topMm: number;
  rightMm: number;
  bottomMm: number;
  leftMm: number;
}

/** Standard paper, or a custom size (e.g. roll cut length). */
export interface PaperSize extends SizeMm {
  /** Standard name where known (e.g. "A4", "A3", "Letter"); empty for custom. */
  name: string;
  custom: boolean;
}

// ─── Profile sub-objects ─────────────────────────────────────────────────────

export interface ScalingConfig {
  mode: ScalingMode;
  /** For custom-percent. 100 = actual size. */
  percent?: number;
  /** For custom-size. */
  widthMm?: number;
  heightMm?: number;
  lockRatio: boolean;
}

export interface PositionConfig {
  mode: PositionMode;
  /** For custom: offset of the print's top-left from the printable-area top-left, in mm. */
  xMm?: number;
  yMm?: number;
}

export interface BorderlessConfig {
  status: BorderlessStatus;
}

export interface TraySourceConfig {
  /** Human label shown in the UI ("Bypass", "Tray 2", "Roll"). */
  label: string;
  /** Raw driver source id (DMBIN_*), where known. Not always reliable. */
  rawDriverSourceId?: number;
  /** Source list the driver reported at capture time, for diagnostics. */
  driverReportedSources?: string[];
  /** True only when we are confident the source maps correctly (e.g. test-print verified). */
  verified: boolean;
}

export interface ColorConfig {
  mode: ColorManagementMode;
  /** Id of an ICC profile registered in AdvancedPrintSettings.iccProfiles, when app-manages-color. */
  iccProfileId?: string;
  renderingIntent: RenderingIntent;
  blackPointCompensation: boolean;
}

/**
 * Opaque Windows DEVMODE blob plus identity used for staleness detection. Saved DEVMODE
 * can become invalid if the printer is renamed/removed or the driver changes version.
 */
export interface DevmodeConfig {
  base64?: string;
  /** Windows printer name this DEVMODE was captured for. */
  capturedForPrinter?: string;
  driverName?: string;
  driverVersion?: string;
  /** ISO timestamp. */
  capturedAt?: string;
}

/** Per-profile mechanical correction (filled by the future calibration wizard). */
export interface CalibrationConfig {
  offsetXmm: number;
  offsetYmm: number;
  scaleXPercent: number;
  scaleYPercent: number;
}

export interface SafetyConfig {
  requirePreflight: boolean;
  allowSilentPrint: boolean;
  requireTestPrintFirst: boolean;
}

// ─── Printer profile ─────────────────────────────────────────────────────────

export interface AdvancedPrinterProfile {
  id: string;
  name: string;
  /** Exact Windows spooler name. */
  windowsPrinterName: string;
  engine: AdvancedPrintEngine;

  // Photoshop-like page-setup separation. These are independent concepts:
  /** The design's intrinsic size. Usually derived from the document, may be overridden. */
  documentSizeMm?: SizeMm;
  /** The paper loaded in the printer (what the driver will feed). */
  printerPaper: PaperSize;
  /** The intended physical output size (may differ from paper, e.g. centered with margins). */
  printSizeMm?: SizeMm;

  scaling: ScalingConfig;
  position: PositionConfig;
  orientationPolicy: OrientationPolicy;
  marginsPolicy: MarginsPolicy;
  customMarginsMm?: EdgeInsetsMm;
  bleedMm: number;

  borderless: BorderlessConfig;
  traySource: TraySourceConfig;
  color: ColorConfig;
  outputPresetId?: string;
  devmode: DevmodeConfig;
  calibration: CalibrationConfig;
  safety: SafetyConfig;

  /** Inferred class, used for suggestions and UI hints. */
  printerClass?: PrinterClass;
  notes: string;
}

// ─── Output / color preset ───────────────────────────────────────────────────

export interface OutputPreset {
  id: string;
  name: string;
  targetUse: OutputUse;
  /** Source smart preset from the editor Tool Library, when this output preset mirrors one. */
  sourceSmartPresetId?: string;

  // Tone / color adjustments (neutral defaults = 0, except gamma=1, scales 1).
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  gamma: number;
  vibrance?: number;
  sharpness: number;
  blackPoint?: number;
  whitePoint?: number;

  colorMode: ColorManagementMode;
  iccProfileId?: string;
  renderingIntent: RenderingIntent;
  blackPointCompensation: boolean;

  /** Built-in presets ship with the app and cannot be deleted (only duplicated/reset). */
  builtIn: boolean;
  notes: string;
}

/** A registered ICC profile (.icc/.icm) the user has imported. */
export interface IccProfileRef {
  id: string;
  name: string;
  /** Absolute path on disk. */
  path: string;
}

// ─── PrintLayout: the single source of truth ─────────────────────────────────

export interface PrintLayout {
  /** The design's intrinsic size. */
  documentSizeMm: SizeMm;
  /** The paper the driver will feed. */
  printerPaperMm: PaperSize;
  /** The resolved physical output size after scaling. */
  printSizeMm: SizeMm;

  resolvedOrientation: ResolvedOrientation;
  /** Driver printable area within the paper, in mm. */
  printableAreaMm: RectMm;
  marginsMm: EdgeInsetsMm;
  bleedMm: number;
  safeAreaMm: EdgeInsetsMm;

  /** Where the print is placed on the paper (top-left origin), after position + calibration. */
  placementRectMm: RectMm;
  scalePercent: number;
  borderlessStatus: BorderlessStatus;
  calibrationApplied: CalibrationConfig;

  /** Areas of the design that fall outside the printable/placement region (will be clipped). */
  cropRiskRectsMm: RectMm[];

  dpi: number;
  renderedPx: { width: number; height: number };
}

// ─── Preflight ───────────────────────────────────────────────────────────────

export type PreflightSeverity = "info" | "warning" | "blocker";

export type PreflightCode =
  | "orientation-mismatch"
  | "physical-size-mismatch"
  | "borderless-not-verified"
  | "scaling-mismatch"
  | "dpi-too-low"
  | "missing-bleed"
  | "tray-unverified"
  | "double-color-correction"
  | "devmode-stale"
  | "printer-missing"
  | "crop-risk";

export interface PreflightWarning {
  code: PreflightCode;
  severity: PreflightSeverity;
  /** Human-readable message (Hebrew). */
  message: string;
  /** Optional practical hint for resolving it. */
  hint?: string;
}

export interface PreflightReport {
  warnings: PreflightWarning[];
  /** True when at least one warning is a blocker — printing must be prevented. */
  hasBlocker: boolean;
  /** True when there are zero warnings of any severity (enables "do not show again"). */
  clean: boolean;
}

/** Live driver/printer state used by preflight (queried from the worker). */
export interface DriverState {
  printerExists: boolean;
  currentDriverName?: string;
  currentDriverVersion?: string;
  /** Whether SetHdevmode applied cleanly when last attempted. */
  devmodeApplied?: boolean;
  reportedBorderlessSupported?: boolean;
}

// ─── Printer capabilities ────────────────────────────────────────────────────

export interface PrinterCapabilities {
  windowsPrinterName: string;
  paperSizes: PaperSize[];
  /** Tray/source names the driver reports. */
  sources: string[];
  /** Printable area per paper name, in mm. */
  printableAreaByPaper: Record<string, EdgeInsetsMm>;
  duplex: boolean;
  color: boolean;
  resolutionsDpi: number[];
  isWideFormat: boolean;
  isRoll: boolean;
}

/** A suggested starter profile for a detected printer (generic, not hardcoded per model). */
export interface StarterProfileSuggestion {
  /** Partial profile pre-filled from capabilities; the wizard completes it. */
  profile: Partial<AdvancedPrinterProfile>;
  /** Human reason shown to the user ("Wide-format detected → Roll/Poster profile?"). */
  reason: string;
}

// ─── Multi-page selection ────────────────────────────────────────────────────

export interface MultiPageSelection {
  mode: "current" | "all" | "selected" | "range";
  /** e.g. "1-3,5,8" when mode === "range". */
  rangeText?: string;
  copiesPerPage: number;
  /** "copies-per-page": 1,1,1,2,2,2 — "one-of-each": 1,2,3,1,2,3. */
  collate: "copies-per-page" | "one-of-each";
}

// ─── Job log ─────────────────────────────────────────────────────────────────

export interface AdvancedPrintJobLog {
  timestamp: string;
  printerName: string;
  profileName: string;
  engine: AdvancedPrintEngine;
  /** Engines tried before the one that succeeded (the fallback ladder taken). */
  engineFallbacks: AdvancedPrintEngine[];
  renderedFilePath: string;
  renderedWidthPx: number;
  renderedHeightPx: number;
  physicalWidthMm: number;
  physicalHeightMm: number;
  dpi: number;
  orientation: ResolvedOrientation;
  scalePercent: number;
  marginsPolicy: MarginsPolicy;
  trayLabel: string;
  colorMode: ColorManagementMode;
  iccProfileId?: string;
  outputPresetId?: string;
  warnings: PreflightWarning[];
  status: "success" | "failed" | "canceled";
  errorMessage?: string;
}

// ─── Settings shape ──────────────────────────────────────────────────────────

export interface AdvancedPrintSettings {
  /** Opt-in experimental flag. When false, APE is hidden and the editor uses the existing path. */
  enabled: boolean;
  profiles: AdvancedPrinterProfile[];
  outputPresets: OutputPreset[];
  iccProfiles: IccProfileRef[];
  defaultProfileId: string | null;
  /** Settings remembered after a confirmed-successful print, keyed by Windows printer name. */
  lastSuccessfulByPrinter: Record<string, Partial<AdvancedPrinterProfile>>;
}

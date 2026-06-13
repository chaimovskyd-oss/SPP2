/** Global type for the Electron contextBridge API exposed via preload.ts */
interface SmartSelectionProgressEvent {
  phase: string;
  message: string;
  percent?: number | null;
  modelId?: string;
  fileName?: string;
  bytesDone?: number | null;
  bytesTotal?: number | null;
  operation?: string;
  /** Present on AI preload progress events (phase === "preload"). */
  model?: AiModelStatus;
}

type AiModelStatusValue = "idle" | "loading" | "ready" | "failed" | "fallback";

interface AiModelStatus {
  name: string;
  status: AiModelStatusValue;
  provider?: string | null;
  loadMs?: number | null;
  warmupMs?: number | null;
  memoryMb?: number | null;
  loadedAt?: number | null;
  error?: string | null;
  fallbackReason?: string | null;
  warmupError?: string | null;
}

interface AiModelsStatusResult {
  ok: boolean;
  level: string;
  overall: AiModelStatusValue;
  essentialReady: boolean;
  models: Record<string, AiModelStatus>;
}

type SppComponentStatus = "installed" | "partial" | "missing" | "failed" | "cloud";

interface SppComponentEntry {
  id: string;
  displayName: string;
  type: "core" | "optional" | "editor" | "cloud";
  defaultSelected: boolean;
  installOnFirstRun: boolean;
  installOnDemandOnly?: boolean;
  blocksLaunch: boolean;
  isOptional: boolean;
  requirements: string[];
  models: string[];
  toolIds: string[];
  estimatedSizeMB: number;
  removeSafe: boolean;
  status: SppComponentStatus;
  signatureCurrent: boolean;
  lastError?: string;
  updatedAt?: string;
  importOk?: boolean;
  importDetail?: string;
  healthStatus?: SppComponentStatus;
}

interface SppComponentsListResult {
  success: boolean;
  userDataDir: string;
  logsDir: string;
  modelsDir: string;
  components: SppComponentEntry[];
  error?: string;
}

interface SppComponentsApi {
  list(): Promise<SppComponentsListResult>;
  health(id?: string): Promise<{ success: boolean; components?: SppComponentEntry[]; component?: SppComponentEntry; error?: string }>;
  install(id: string): Promise<{ ok?: boolean; success?: boolean; error?: string; cancelled?: boolean }>;
  repair(id: string): Promise<{ ok?: boolean; success?: boolean; error?: string; cancelled?: boolean }>;
  remove(id: string): Promise<{ success: boolean; error?: string }>;
  openLogs(): Promise<{ success: boolean; error?: string }>;
  openModels(): Promise<{ success: boolean; error?: string }>;
  gpuInfo(): Promise<{ nvidia: boolean; names: string[]; platform: string; error?: string }>;
}

type ContentFillEngine = "auto" | "quick_heal" | "lama" | "sd_inpaint" | "migan" | "texture_fill";

interface InpaintRemoveOptions {
  imagePngBase64?: string;
  maskPngBase64: string;
  targetWidth: number;
  targetHeight: number;
  roiPadding?: number;
  maxPatchPixels?: number;
  forceFallback?: boolean;
  debug?: boolean;
  blend?: "feather";
  /** Fill engine. Omit or "auto" to let the backend choose (spec §11 heuristic). */
  engine?: ContentFillEngine;
  /** Texture Fill sampling regions (PNG, alpha = region). */
  samplingIncludeMaskPngBase64?: string;
  samplingExcludeMaskPngBase64?: string;
  preserveLines?: boolean;
  colorAdaptation?: boolean;
  /** Request a fast low-res pass for live preview (no commit). */
  preview?: boolean;
  /** Stable-Diffusion engine controls (engine === "sd_inpaint"). */
  prompt?: string;
  negativePrompt?: string;
  sdSteps?: number;
  sdGuidance?: number;
  sdWorkingSize?: number;
  sdSeed?: number;
  /** Local diffusion tier: "sd15" (fast, default) or "sdxl" (quality). */
  sdModel?: string;
  /** Max selected/total ratio (default 0.5). Outpainting passes higher values. */
  maxSelectedRatio?: number;
}

interface InpaintRemoveResult {
  ok: true;
  patchPngBase64: string;
  roi: { x: number; y: number; width: number; height: number };
  imageWidth: number;
  imageHeight: number;
  modelId: "lama" | "opencv_telea" | string;
  modelVersion: string;
  fallback: boolean;
  backendAttempted?: string;
  backendUsed?: string;
  backendDevice?: string | null;
  modelWeightsPath?: string | null;
  fallbackReason?: string | null;
  debugDir?: string | null;
  message: string;
  processingMs: number;
}

interface BatchBackgroundRemoveProgressEvent {
  status: "running" | "done";
  total: number;
  completed: number;
  currentFile?: string;
  message: string;
}

interface BatchBackgroundRemoveItemResult {
  inputPath: string;
  outputPath?: string;
  fileName: string;
  error?: string;
}

interface BatchBackgroundRemoveResult {
  success: boolean;
  outputDir: string;
  successes: BatchBackgroundRemoveItemResult[];
  failures: BatchBackgroundRemoveItemResult[];
  error?: string;
}

interface SmartPrintPrepareSaveItem {
  fileName: string;
  sourcePath?: string;
  dataUrl: string;
}

interface SmartPrintPrepareSaveResult {
  success: boolean;
  outputDir?: string;
  saved?: string[];
  error?: string;
}

interface HarmonizeDiagnostics {
  brightnessAdj: number;
  saturationAdj: number;
  tempAdj: number;
  contrastAdj: number;
}

interface HarmonizeResult {
  ok: boolean;
  diagnostics?: HarmonizeDiagnostics;
  mode?: "algorithm" | "neural" | "passthrough";
  shadow?: { ok: boolean; error?: string };
  error?: string;
}

interface PrintHubSubmitImage {
  path: string;
  dataUrl: string;
}

interface PrintHubSubmitPayload {
  hubRoot: string;
  manifest: import("./types/printHub").PrintJobManifest;
  images: PrintHubSubmitImage[];
  previews?: PrintHubSubmitImage[];
}

interface PrintHubSubmitResult {
  success: boolean;
  jobId?: string;
  destination?: "incoming" | "outbox";
  path?: string;
  error?: string;
}

interface PrintHubJobSummary {
  jobId: string;
  state: import("./types/printHub").PrintJobState;
  size?: string;
  finish?: string;
  borderMode?: string;
  copies?: number;
  fileCount: number;
  customer: { name: string; phone: string; note: string };
  createdAt?: string;
  priority?: string;
  approval?: { mode: string; state: string | null };
  source?: string;
  sourceComputer?: string;
  lastNote?: string;
  error?: string;
}

type PrintHubJobActionName = "cancel" | "reject" | "approve" | "retry" | "archive" | "delete";

interface PrintHubSettingsSnapshot {
  schemaVersion: number;
  exportedAt: string;
  sourceComputer: string;
  hubRoot: string;
  appSettings: import("./settings/types").PrintHubSettings | null;
  hubConfig: {
    retentionDays?: number;
    lanPort?: number;
    pairingToken?: string;
  };
  profiles: import("./types/printHub").PrinterProfile[] | null;
  stations: import("./types/printHub").Station[];
  media: import("./types/printHub").MediaItem[];
}

interface PrintHubApi {
  /** Render-ready package → atomically published into the hub Incoming (or queued to outbox if offline). */
  submitJob: (payload: PrintHubSubmitPayload) => Promise<PrintHubSubmitResult>;
  /** Retries every package sitting in the local outbox (gap G10). */
  flushOutbox: () => Promise<{ success: boolean; flushed: number; failed: number; error?: string }>;
  /** Count of packages currently waiting in the local outbox. */
  outboxCount: () => Promise<{ success: boolean; count: number; error?: string }>;
  /** This machine's name, used to stamp sourceComputer on outgoing jobs. */
  stationInfo: () => Promise<{ success: boolean; computerName: string }>;
  /** (Tray server only) The hub root the print engine is actually watching. */
  getServerHub?: () => Promise<{ success: boolean; hubRoot: string; serverName: string }>;
  /** (Tray server only) Point the print engine at a hub root and persist it. */
  setServerHub?: (hubRoot: string) => Promise<{ success: boolean; hubRoot?: string; error?: string }>;
  /** (Tray server only) LAN ingest address(es) + pairing token to show the operator. */
  lanInfo?: () => Promise<{ success: boolean; addresses: string[]; port: number; token: string }>;
  /** (Tray server only) Push the logged-in cloud config + session so the headless Hub can write status. */
  setCloudSession?: (payload: {
    supabaseUrl: string;
    anonKey: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    userId?: string;
  }) => Promise<{ ok: boolean; userId?: string; error?: string }>;
  /** Reads the server.log lines from a hub root (shows what the print server is doing). */
  readServerLog: (hubRoot: string) => Promise<{ success: boolean; lines: string[]; error?: string }>;
  /** Lists all jobs across every state folder of the hub. */
  listQueue: (hubRoot: string) => Promise<{ success: boolean; jobs: PrintHubJobSummary[]; error?: string }>;
  /** Performs a queue management action (printing stays on the server). */
  jobAction: (payload: { hubRoot: string; jobId: string; action: PrintHubJobActionName }) => Promise<{ success: boolean; error?: string }>;
  /** Opens a job's folder (or the hub root) in the OS file manager. */
  openJobFolder: (payload: { hubRoot: string; jobId: string }) => Promise<{ success: boolean; error?: string }>;
  /** Installs the Windows Explorer "Send to SPP Print Hub" context-menu entry (HKCU, no admin). */
  installContextMenu: () => Promise<{ success: boolean; error?: string }>;
  /** Removes the Explorer context-menu entry. */
  uninstallContextMenu: () => Promise<{ success: boolean; error?: string }>;
  /** Subscribes to files sent via the Explorer quick-print verb. Returns an unsubscribe fn. */
  onQuickPrintFiles: (callback: (files: string[]) => void) => () => void;
  /** Lists Windows printers installed on this machine. */
  getPrinters: () => Promise<{ success: boolean; printers: Array<{ name: string; displayName: string; status: number; isDefault: boolean }>; error?: string }>;
  /** Reads a printer's real supported paper sizes from the Windows driver (best-effort). */
  getPrinterPapers: (printerName: string) => Promise<{ success: boolean; papers: Array<{ name: string; widthMm: number; heightMm: number }>; error?: string }>;
  /** Loads the saved printer profiles (printers.json) from a hub root, or null if none saved. */
  loadProfiles: (hubRoot: string) => Promise<{ success: boolean; profiles: import("./types/printHub").PrinterProfile[] | null; error?: string }>;
  /** Saves printer profiles to a hub root's printers.json. */
  saveProfiles: (payload: { hubRoot: string; profiles: import("./types/printHub").PrinterProfile[] }) => Promise<{ success: boolean; error?: string }>;
  loadStations: (hubRoot: string) => Promise<{ success: boolean; stations: import("./types/printHub").Station[] | null; error?: string }>;
  saveStations: (payload: { hubRoot: string; stations: import("./types/printHub").Station[] }) => Promise<{ success: boolean; error?: string }>;
  loadMedia: (hubRoot: string) => Promise<{ success: boolean; items: import("./types/printHub").MediaItem[] | null; error?: string }>;
  saveMedia: (payload: { hubRoot: string; items: import("./types/printHub").MediaItem[] }) => Promise<{ success: boolean; error?: string }>;
  loadHubConfig: (hubRoot: string) => Promise<{ success: boolean; config?: PrintHubSettingsSnapshot["hubConfig"]; error?: string }>;
  saveHubConfig: (payload: { hubRoot: string; config: Partial<PrintHubSettingsSnapshot["hubConfig"]> }) => Promise<{ success: boolean; config?: PrintHubSettingsSnapshot["hubConfig"]; error?: string }>;
  exportSettings: (payload: { hubRoot: string; appSettings?: import("./settings/types").PrintHubSettings | null }) => Promise<{ success: boolean; snapshot?: PrintHubSettingsSnapshot; error?: string }>;
  importSettings: (payload: { hubRoot: string; snapshot: PrintHubSettingsSnapshot }) => Promise<{ success: boolean; snapshot?: PrintHubSettingsSnapshot; error?: string }>;
  readProductionLog: (payload: { hubRoot: string; date?: string }) => Promise<{ success: boolean; entries: Array<{ at: string; jobId: string; sourceComputer: string; size: string; finish: string; borderMode: string; prints: number }>; error?: string }>;
}

interface AdvancedPrintHealth {
  available: boolean;
  isWindows: boolean;
  reason?: string;
  worker?: { ok: boolean; worker: string; version: string };
}

interface AdvancedPrintCapabilitiesResult {
  windowsPrinterName: string;
  paperSizes: Array<{ name: string; widthMm: number; heightMm: number; custom: boolean }>;
  sources: string[];
  printableAreaByPaper: Record<string, { topMm: number; rightMm: number; bottomMm: number; leftMm: number }>;
  duplex: boolean;
  color: boolean;
  resolutionsDpi: number[];
  isWideFormat: boolean;
  isRoll: boolean;
}

interface AdvancedPrintJobResult {
  success: boolean;
  actualOrientation: "portrait" | "landscape";
  actualPaperSize: number;
  devmodeApplied: boolean;
  error?: string;
  /** What the device actually reported at print time (real paper/printable/margins vs. the job). */
  diagnostics?: {
    devicePaperWidthMm: number;
    devicePaperHeightMm: number;
    devicePrintableWidthMm: number;
    devicePrintableHeightMm: number;
    hardMarginLeftMm: number;
    hardMarginTopMm: number;
    jobPaperWidthMm: number;
    jobPaperHeightMm: number;
    /** True when the DEVMODE that printed was on different paper than the job was laid out for. */
    paperMismatch: boolean;
    /** True when the worker recentered the placement on the real device page due to a mismatch. */
    recentered: boolean;
    drawXmm: number;
    drawYmm: number;
    drawWidthMm: number;
    drawHeightMm: number;
    originAtMargins: boolean;
  };
}

interface AdvancedPrintApi {
  /** Worker availability — drives the renderer's engine-selection fallback ladder. */
  health: () => Promise<AdvancedPrintHealth>;
  listPrinters: () => Promise<{ printers: string[] }>;
  getCapabilities: (printerName: string) => Promise<AdvancedPrintCapabilitiesResult>;
  /** Enumerates ICC/ICM color profiles installed on the machine (system color spool dir). */
  listIccProfiles: () => Promise<{ profiles: Array<{ name: string; path: string }> }>;
  /** Queries the printer's real printable area (hardware margins) for the paper in the DEVMODE. */
  getPrintableArea: (printerName: string, devmodeBase64?: string) => Promise<{
    available: boolean;
    dpiX?: number;
    dpiY?: number;
    physicalWidthMm?: number;
    physicalHeightMm?: number;
    printableWidthMm?: number;
    printableHeightMm?: number;
    marginsMm?: { topMm: number; rightMm: number; bottomMm: number; leftMm: number };
  }>;
  /**
   * Opens the real Windows driver dialog and returns the captured DEVMODE as base64, plus the
   * parsed paper/orientation/source the driver chose — so the renderer can apply them to the
   * layout immediately (driver settings drive the preview, never the other way around).
   */
  openDriverDialog: (printerName: string, devmodeBase64?: string) => Promise<{
    cancelled: boolean;
    devmodeBase64?: string | null;
    orientation?: "portrait" | "landscape";
    driverVersion?: string;
    paperSizeCode?: number;
    paperName?: string;
    paperWidthMm?: number;
    paperHeightMm?: number;
    sourceCode?: number;
    sourceName?: string;
  }>;
  getDefaultDevmode: (printerName: string) => Promise<{ devmodeBase64: string | null }>;
  /** Prints an already color-managed bitmap at the layout's placement, replaying saved DEVMODE. */
  print: (job: Record<string, unknown>) => Promise<AdvancedPrintJobResult>;
  testPage: (job: Record<string, unknown>) => Promise<AdvancedPrintJobResult>;
  /** Runs the Python color/ICC pass; returns the path of the color-managed file. */
  applyColor: (payload: Record<string, unknown>) => Promise<{ outputPath: string }>;
  /** Runs the color pass on a downscaled copy and returns it as a data URL (for before/after preview). */
  colorPreview: (payload: {
    dataUrl: string;
    preset?: import("./types/advancedPrint").OutputPreset | null;
    colorMode: string;
    applyIcc: boolean;
    iccProfilePath?: string;
    renderingIntent: string;
    blackPointCompensation: boolean;
    maxPx?: number;
  }) => Promise<{ dataUrl: string }>;
  /** Writes a data URL to a temp file for the worker to print. */
  writeTempImage: (dataUrl: string, ext: string) => Promise<{ path: string }>;
  writeLog: (entry: import("./types/advancedPrint").AdvancedPrintJobLog) => Promise<{ ok: boolean; file?: string; error?: string }>;
  readLog: (day?: string) => Promise<{ entries: import("./types/advancedPrint").AdvancedPrintJobLog[]; error?: string }>;
}

interface SppElectronAPI {
  platform: string;
  printHub?: PrintHubApi;
  advancedPrint?: AdvancedPrintApi;
  components?: SppComponentsApi;
  writeTempImage: (dataUrl: string, ext: string) => Promise<string>;
  getMemoryUsage?: () => Promise<{
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  }>;
  listSystemFonts?: () => Promise<string[]>;
  readFileBase64: (filePath: string) => Promise<string>;
  choosePsdFile?: () => Promise<{ success: boolean; filePath?: string; fileSize?: number; error?: string }>;
  importPsd?: (filePath: string) => Promise<{ success: boolean; manifest?: import("./services/psdImport").PsdImportManifest; error?: string }>;
  harmonizeLayer?: (layerPath: string, bgPath: string, bboxJson: string, optionsJson: string, outputPath: string) => Promise<HarmonizeResult>;
  savePdfDialog?: (pdfBase64: string, suggestedName?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  /** Export every page of a multi-page document to one chosen folder (single dialog). */
  exportPagesToFolder?: (payload: { documentName?: string; items: Array<{ dataUrl: string; fileName: string }> }) => Promise<{ success: boolean; folderPath?: string; count?: number; canceled?: boolean; error?: string }>;
  /** Pick a destination path for a project file (Save As). Writing is done via writeProjectFile. */
  saveProjectDialog?: (suggestedName?: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  /** Overwrite an existing project file in place (Save / Ctrl+S). */
  writeProjectFile?: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  /** Cache an imported asset's original bytes on disk for autosave recovery. */
  cacheAssetFile?: (base64: string, fileName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  convertOfficeToPdf?: (inputPath: string) => Promise<{ success: boolean; pdfBase64?: string; outputPath?: string; outputName?: string; error?: string }>;
  getFilePath?: (file: File) => string;
  checkLibreOffice?: () => Promise<{ found: boolean; path?: string; error?: string }>;
  chooseLibreOfficePath?: () => Promise<{ success: boolean; path?: string; error?: string }>;
  openImageEditor: (inputPath: string, outputPath: string) => Promise<{ success: boolean; error?: string }>;
  openModeWindow?: (payload: { mode: string; title?: string; snapshot?: unknown }) => Promise<{ success: boolean; error?: string }>;
  getModeWindowSnapshot?: (snapshotId: string) => Promise<{ success: boolean; snapshot?: unknown; error?: string }>;
  openPdfStudioWindow?: () => Promise<{ success: boolean; error?: string }>;
  applyImageParams: (inputPath: string, outputPath: string, paramsJson: string) => Promise<{ success: boolean; error?: string }>;
  smartSelection?: {
    health(): Promise<{
      ok: boolean;
      profile: "quality" | "balanced" | "performance";
      recommendedProfile: "quality" | "balanced" | "performance";
      providers: string[];
      selectedProvider?: string | null;
      gpu: { cuda: boolean; mps: boolean; directml: boolean };
      pythonExecutable?: string;
      diagnostics?: {
        pythonExecutable?: string;
        pythonVersion?: string;
        onnxruntime?: { available: boolean; version?: string | null; providers?: string[]; selectedProvider?: string | null; error?: string };
        onnxruntimeDirectml?: { installed: boolean; version?: string | null };
        torch?: { available: boolean; version?: string | null; cuda?: boolean; error?: string };
        mediapipe?: { available: boolean; version?: string | null; error?: string };
        warnings?: string[];
        models?: Record<string, unknown>;
      };
      modelsDir?: string;
      fallback?: boolean;
      message?: string;
    }>;
    accelerationStatus(providers?: string[]): Promise<{
      ok: boolean;
      platform: string;
      onnxruntimePackage?: string | null;
      onnxruntimeVersion?: string | null;
      onnxruntimeCpuInstalled: boolean;
      onnxruntimeDirectmlInstalled: boolean;
      onnxruntimeGpuInstalled?: boolean;
      conflict: boolean;
      availableProviders: string[];
      selectedProvider?: string | null;
      accelerationEnabled: boolean;
      device: string;
      message: string;
    }>;
    benchmark(options?: { iterations?: number; providers?: string[] }): Promise<{
      ok: boolean;
      results: Array<{ requested: string; provider?: string | null; device: string; msPerInference?: number; error?: string }>;
      selectedProvider?: string | null;
      accelerationEnabled: boolean;
      device: string;
      speedup?: number | null;
      message: string;
    }>;
    sdAccelerationStatus(): Promise<{
      ok: boolean;
      torchInstalled: boolean;
      torchVersion?: string | null;
      cudaAvailable: boolean;
      cudaDeviceName?: string | null;
      diffusersInstalled: boolean;
      sdDevice?: string | null;
      estimatedMode: "fast" | "slow" | "unavailable";
      message: string;
    }>;
    setPerformanceProfile(profile: "quality" | "balanced" | "performance"): Promise<{ ok: boolean; profile: string }>;
    ensureModel(modelId: string): Promise<{
      ok: boolean;
      modelId: string;
      available: boolean;
      path?: string | null;
      status?: string;
      message?: string;
      manifestPath?: string;
      sha256?: string | null;
      expectedSha256?: string | null;
      sizeBytes?: number | null;
      version?: string | null;
    }>;
    listModels(): Promise<{
      ok: boolean;
      manifestPath: string;
      modelsDir: string;
      models: Array<{
        ok: boolean;
        modelId: string;
        available: boolean;
        path?: string | null;
        status?: string;
        message?: string;
        manifestPath?: string;
        sha256?: string | null;
        expectedSha256?: string | null;
        sizeBytes?: number | null;
        version?: string | null;
      }>;
    }>;
    loadImage(imageId: string, imagePath: string, sourceHash: string): Promise<{ ok: boolean; imageId: string; cached?: boolean }>;
    encodeSam(imageId: string): Promise<{ ok: boolean; imageId: string; cached?: boolean; fallback?: boolean }>;
    autoSegment(imageId: string, options: unknown): Promise<{
      maskPngBase64: string;
      width: number;
      height: number;
      sourceWidth?: number;
      sourceHeight?: number;
      modelId: string;
      modelVersion: string;
      profile: "quality" | "balanced" | "performance";
      fallback?: boolean;
      message?: string;
    }>;
    predictMask(imageId: string, options: unknown): Promise<{
      maskPngBase64: string;
      width: number;
      height: number;
      sourceWidth?: number;
      sourceHeight?: number;
      modelId: string;
      modelVersion: string;
      profile: "quality" | "balanced" | "performance";
      fallback?: boolean;
      message?: string;
    }>;
    refineMask(imageId: string, options: unknown): Promise<{
      maskPngBase64: string;
      width: number;
      height: number;
      sourceWidth?: number;
      sourceHeight?: number;
      modelId: string;
      modelVersion: string;
      profile: "quality" | "balanced" | "performance";
      fallback?: boolean;
      message?: string;
    }>;
    inpaintRemove(imageId: string, options: InpaintRemoveOptions): Promise<InpaintRemoveResult | { ok?: false; error?: string; message?: string; fallback?: boolean }>;
    warmInpaint(): Promise<{ ok: boolean; ready?: boolean; device?: string | null; error?: string }>;
    warmSdInpaint(): Promise<{ ok: boolean; ready?: boolean; device?: string | null; modelId?: string; error?: string }>;
    preloadModels(level: string): Promise<{ ok: boolean; started: boolean; level: string; models: string[] }>;
    modelsStatus(): Promise<AiModelsStatusResult>;
    reloadModels(level: string): Promise<{ ok: boolean; started: boolean; level: string; models: string[] }>;
    unloadImage(imageId: string): Promise<{ ok: boolean }>;
    detectFaces(imageId: string): Promise<{
      ok: boolean;
      imageId: string;
      width: number;
      height: number;
      backend: "scrfd_2.5g_kps" | "mediapipe" | "haar" | "none";
      faces: { x: number; y: number; width: number; height: number; score: number; landmarks?: { x: number; y: number }[] }[];
    }>;
    cancel(requestId: string): Promise<{ ok: boolean }>;
    onProgress(callback: (progress: SmartSelectionProgressEvent) => void): () => void;
  };
  /** Camera RAW decoding via LibRaw (lazily-installed optional component). */
  raw?: {
    decode(bytes: Uint8Array, fileName: string): Promise<{
      ok: boolean;
      bytes?: Uint8Array;
      width?: number;
      height?: number;
      format?: string;
      error?: string;
      cancelled?: boolean;
    }>;
  };
  batchBackgroundRemove?: {
    chooseImages(): Promise<{ success: boolean; filePaths?: string[]; defaultOutputDir?: string; canceled?: boolean; error?: string }>;
    chooseOutputDir(defaultPath?: string): Promise<{ success: boolean; folderPath?: string; canceled?: boolean; error?: string }>;
    run(payload: { filePaths: string[]; outputDir?: string }): Promise<BatchBackgroundRemoveResult>;
    onProgress(callback: (progress: BatchBackgroundRemoveProgressEvent) => void): () => void;
  };
  smartPrintPrepare?: {
    chooseOutputDir(defaultPath?: string): Promise<{ success: boolean; folderPath?: string; canceled?: boolean; error?: string }>;
    saveBatch(payload: { outputDir?: string; items: SmartPrintPrepareSaveItem[]; report: unknown }): Promise<SmartPrintPrepareSaveResult>;
  };
  /** Local Graphics Library */
  glib?: {
    ensureDirs(): Promise<{ baseDir: string }>;
    scanDir(): Promise<{ files: import("./features/graphicsLibrary/types").FileScanResult[]; baseDir: string }>;
    readIndex(): Promise<{ success: boolean; index: import("./features/graphicsLibrary/types").GraphicAsset[] }>;
    writeIndex(assets: import("./features/graphicsLibrary/types").GraphicAsset[]): Promise<{ success: boolean; error?: string }>;
    saveThumbnail(args: { id: string; base64: string; ext: string }): Promise<{ success: boolean; thumbnailPath?: string; error?: string }>;
    readFileB64(filePath: string): Promise<{ success: boolean; dataUrl?: string; error?: string }>;
    revealFile(filePath: string): Promise<{ success: boolean; error?: string }>;
    deleteFile(filePath: string): Promise<{ success: boolean; error?: string }>;
    moveFile(args: { fromPath: string; toDir: string; newName?: string }): Promise<{ success: boolean; newPath?: string; error?: string }>;
    saveAsset(args: { base64: string; ext: string; filename: string; category: string }): Promise<{ success: boolean; filePath?: string; fileName?: string; mtimeMs?: number; size?: number; error?: string }>;
    chooseImportFolder(): Promise<{ success: boolean; folderPath?: string; canceled?: boolean; error?: string }>;
    copyFolder(args: { srcDir: string; category: string }): Promise<{ success: boolean; destDir?: string; copied?: import("./features/graphicsLibrary/types").FileScanResult[]; error?: string }>;
    getBaseDir(): Promise<{ baseDir: string }>;
  };
  pixabaySaveAsset?: (args: {
    imageBase64: string;
    filename: string;
    ext: string;
    metadata: import("./types/pixabay").PixabayResult;
  }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  openUrl: (url: string) => Promise<void>;
  openFolder: (folderPath: string) => Promise<{ error?: string }>;
  openPath?: (filePath: string) => Promise<{ error?: string }>;
  openUserGuide?: () => Promise<{ error?: string }>;
  openExternalApp: (execPath: string, fileArg?: string) => Promise<{ error?: string }>;
  detectPhotoshop: () => Promise<{ path?: string }>;
  watchFile: (watchId: string, filePath: string) => Promise<{ error?: string }>;
  unwatchFile: (watchId: string) => Promise<void>;
  onFileChanged: (callback: (watchId: string, filePath: string) => void) => () => void;
  onOpenFilePath?: (callback: (filePath: string) => void) => () => void;
  /** Main process is asking this window to close (X button). Reply with confirmClose() when ready. */
  onCloseRequested?: (callback: () => void) => () => void;
  /** Tell the main process it is safe to close this window. */
  confirmClose?: () => void;
  // Settings-related IPC stubs — implemented in a future Electron update
  openLogsFolder?: () => Promise<void>;
  openSettingsFile?: () => Promise<void>;
  openCacheFolder?: () => Promise<void>;
  clearCache?: () => Promise<{ freed: number }>;
  pickFolder?: () => Promise<{ path?: string }>;
  // Batch templates IPC — stores full SPP packages in userData
  batchTemplates?: {
    save(payload: {
      templateId: string;
      packageBytes: Uint8Array;
      thumbnailPngBytes: Uint8Array | null;
      indexItem: unknown;
    }): Promise<{ success: boolean; error?: string }>;
    load(templateId: string): Promise<{ success: boolean; packageBytes?: Uint8Array; error?: string }>;
    loadThumbnail(templateId: string): Promise<{ success: boolean; thumbnailBytes?: Uint8Array | null; error?: string }>;
    list(): Promise<{ success: boolean; items?: unknown[]; error?: string }>;
    delete(templateId: string): Promise<{ success: boolean; error?: string }>;
  };
  // Product library IPC — implemented alongside Python product handlers
  productLibrary?: {
    loadAll(): Promise<import("./services/python_bridge/productBridge").PythonProduct[]>;
    saveOne(product: import("./services/python_bridge/productBridge").PythonProduct): Promise<void>;
    uploadMask(productId: string, maskDataBase64: string, fileName: string): Promise<string>;
    reloadOne(productId: string): Promise<import("./services/python_bridge/productBridge").PythonProduct | null>;
  };
  debug?: {
    getReport: () => unknown;
    logPageSwitch: (
      fromPageId: string | null,
      toPageId: string,
      summary?: {
        documentPageCount: number;
        activePageLayerCount: number;
        totalLayerCount: number;
        assetCount: number;
        historyUndoCount: number;
        historyRedoCount: number;
      }
    ) => void;
    runStressTest: (options?: { pages?: number; images?: number; switches?: number }) => Promise<unknown>;
    reset: () => void;
  };
}

declare global {
  interface Window {
    spp: SppElectronAPI;
  }
}

export {};

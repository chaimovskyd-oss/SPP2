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
}

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

interface SppElectronAPI {
  platform: string;
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
      gpu: { cuda: boolean; mps: boolean; directml: boolean };
      modelsDir?: string;
      fallback?: boolean;
      message?: string;
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
    unloadImage(imageId: string): Promise<{ ok: boolean }>;
    detectFaces(imageId: string): Promise<{
      ok: boolean;
      imageId: string;
      width: number;
      height: number;
      backend: "mediapipe" | "haar" | "none";
      faces: { x: number; y: number; width: number; height: number; score: number }[];
    }>;
    cancel(requestId: string): Promise<{ ok: boolean }>;
    onProgress(callback: (progress: SmartSelectionProgressEvent) => void): () => void;
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
  openExternalApp: (execPath: string, fileArg?: string) => Promise<{ error?: string }>;
  detectPhotoshop: () => Promise<{ path?: string }>;
  watchFile: (watchId: string, filePath: string) => Promise<{ error?: string }>;
  unwatchFile: (watchId: string) => Promise<void>;
  onFileChanged: (callback: (watchId: string, filePath: string) => void) => () => void;
  onOpenFilePath?: (callback: (filePath: string) => void) => () => void;
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

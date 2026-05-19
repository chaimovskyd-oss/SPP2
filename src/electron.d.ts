/** Global type for the Electron contextBridge API exposed via preload.ts */
interface SmartSelectionProgressEvent {
  phase: string;
  message: string;
  percent?: number | null;
  modelId?: string;
  fileName?: string;
  bytesDone?: number | null;
  bytesTotal?: number | null;
}

interface SppElectronAPI {
  platform: string;
  writeTempImage: (dataUrl: string, ext: string) => Promise<string>;
  readFileBase64: (filePath: string) => Promise<string>;
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
    unloadImage(imageId: string): Promise<{ ok: boolean }>;
    cancel(requestId: string): Promise<{ ok: boolean }>;
    onProgress(callback: (progress: SmartSelectionProgressEvent) => void): () => void;
  };
  openUrl: (url: string) => Promise<void>;
  openFolder: (folderPath: string) => Promise<{ error?: string }>;
  openPath?: (filePath: string) => Promise<{ error?: string }>;
  openExternalApp: (execPath: string, fileArg?: string) => Promise<{ error?: string }>;
  detectPhotoshop: () => Promise<{ path?: string }>;
  watchFile: (watchId: string, filePath: string) => Promise<{ error?: string }>;
  unwatchFile: (watchId: string) => Promise<void>;
  onFileChanged: (callback: (watchId: string, filePath: string) => void) => () => void;
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
}

declare global {
  interface Window {
    spp: SppElectronAPI;
  }
}

export {};

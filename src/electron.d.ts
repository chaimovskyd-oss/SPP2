/** Global type for the Electron contextBridge API exposed via preload.ts */
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

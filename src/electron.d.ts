/** Global type for the Electron contextBridge API exposed via preload.ts */
interface SppElectronAPI {
  platform: string;
  writeTempImage: (dataUrl: string, ext: string) => Promise<string>;
  readFileBase64: (filePath: string) => Promise<string>;
  openImageEditor: (inputPath: string, outputPath: string) => Promise<{ success: boolean; error?: string }>;
  applyImageParams: (inputPath: string, outputPath: string, paramsJson: string) => Promise<{ success: boolean; error?: string }>;
  openUrl: (url: string) => Promise<void>;
  openFolder: (folderPath: string) => Promise<{ error?: string }>;
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
}

declare global {
  interface Window {
    spp: SppElectronAPI;
  }
}

export {};

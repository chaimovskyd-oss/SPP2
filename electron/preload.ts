import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("spp", {
  platform: process.platform,

  /** Write a data URL to a temp file; returns the temp file path. */
  writeTempImage: (dataUrl: string, ext: string): Promise<string> =>
    ipcRenderer.invoke("spp:write-temp-image", dataUrl, ext),

  /** Read a file from disk as a base64 string. */
  readFileBase64: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("spp:read-file-base64", filePath),

  /**
   * Open the Python image editor for a specific file.
   * Resolves when the window is closed.
   */
  openImageEditor: (inputPath: string, outputPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("spp:open-image-editor", inputPath, outputPath),

  /** Open the Python Print Preview module for a rendered print file. */
  openPrintPreview: (payload: {
    filePath: string;
    documentName: string;
    pageName?: string;
    widthPx: number;
    heightPx: number;
    widthMm: number;
    heightMm: number;
    dpi: number;
    mimeType: string;
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("spp:open-print-preview", payload),

  /**
   * Apply edit params to an image headlessly (no UI).
   * Returns { success: true } when the output file is ready.
   */
  applyImageParams: (inputPath: string, outputPath: string, paramsJson: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("spp:apply-image-params", inputPath, outputPath, paramsJson),

  /** Open a URL in the default system browser. */
  openUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke("spp:open-url", url),

  /** Open a folder in the system file manager. */
  openFolder: (folderPath: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke("spp:open-folder", folderPath),

  /** Launch an external application with an optional file argument. */
  openExternalApp: (execPath: string, fileArg?: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke("spp:open-external-app", execPath, fileArg),

  /** Auto-detect Photoshop executable. */
  detectPhotoshop: (): Promise<{ path?: string }> =>
    ipcRenderer.invoke("spp:detect-photoshop"),

  /** Start watching a file for external modifications. */
  watchFile: (watchId: string, filePath: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke("spp:watch-file", watchId, filePath),

  /** Stop watching a file. */
  unwatchFile: (watchId: string): Promise<void> =>
    ipcRenderer.invoke("spp:unwatch-file", watchId),

  /** Subscribe to file change events from the main process. */
  onFileChanged: (callback: (watchId: string, filePath: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, watchId: string, filePath: string) => callback(watchId, filePath);
    ipcRenderer.on("spp:file-changed", handler);
    return () => ipcRenderer.removeListener("spp:file-changed", handler);
  }
});

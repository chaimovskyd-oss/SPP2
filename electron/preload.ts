import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("spp", {
  platform: process.platform,

  /** Write a data URL to a temp file; returns the temp file path. */
  writeTempImage: (dataUrl: string, ext: string): Promise<string> =>
    ipcRenderer.invoke("spp:write-temp-image", dataUrl, ext),

  /** Read a file from disk as a base64 string. */
  readFileBase64: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("spp:read-file-base64", filePath),

  /** Save a generated PDF through the native save dialog. */
  savePdfDialog: (pdfBase64: string, suggestedName?: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke("spp:save-pdf-dialog", pdfBase64, suggestedName),

  /** Convert an Office document to PDF using LibreOffice headless. */
  convertOfficeToPdf: (inputPath: string): Promise<{ success: boolean; pdfBase64?: string; outputPath?: string; outputName?: string; error?: string }> =>
    ipcRenderer.invoke("spp:convert-office-to-pdf", inputPath),

  getFilePath: (file: File): string =>
    webUtils.getPathForFile(file),

  checkLibreOffice: (): Promise<{ found: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke("spp:check-libreoffice"),

  chooseLibreOfficePath: (): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke("spp:choose-libreoffice-path"),

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
    orientation?: "portrait" | "landscape";
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("spp:open-print-preview", payload),

  openModeWindow: (payload: { mode: string; title?: string; snapshot?: unknown }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("spp:open-mode-window", payload),

  getModeWindowSnapshot: (snapshotId: string): Promise<{ success: boolean; snapshot?: unknown; error?: string }> =>
    ipcRenderer.invoke("spp:get-mode-window-snapshot", snapshotId),

  openPdfStudioWindow: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("spp:open-mode-window", { mode: "pdf-studio", title: "SPP2-PDF EDITOR" }),

  /**
   * Apply edit params to an image headlessly (no UI).
   * Returns { success: true } when the output file is ready.
   */
  applyImageParams: (inputPath: string, outputPath: string, paramsJson: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("spp:apply-image-params", inputPath, outputPath, paramsJson),

  smartSelection: {
    health: () => ipcRenderer.invoke("spp:smart-selection:health"),
    setPerformanceProfile: (profile: string) => ipcRenderer.invoke("spp:smart-selection:set-performance-profile", profile),
    ensureModel: (modelId: string) => ipcRenderer.invoke("spp:smart-selection:ensure-model", modelId),
    listModels: () => ipcRenderer.invoke("spp:smart-selection:list-models"),
    loadImage: (imageId: string, imagePath: string, sourceHash: string) => ipcRenderer.invoke("spp:smart-selection:load-image", imageId, imagePath, sourceHash),
    encodeSam: (imageId: string) => ipcRenderer.invoke("spp:smart-selection:encode-sam", imageId),
    autoSegment: (imageId: string, options: unknown) => ipcRenderer.invoke("spp:smart-selection:auto-segment", imageId, options),
    predictMask: (imageId: string, options: unknown) => ipcRenderer.invoke("spp:smart-selection:predict-mask", imageId, options),
    refineMask: (imageId: string, options: unknown) => ipcRenderer.invoke("spp:smart-selection:refine-mask", imageId, options),
    inpaintRemove: (imageId: string, options: unknown) => ipcRenderer.invoke("spp:smart-selection:inpaint-remove", imageId, options),
    unloadImage: (imageId: string) => ipcRenderer.invoke("spp:smart-selection:unload-image", imageId),
    cancel: (requestId: string) => ipcRenderer.invoke("spp:smart-selection:cancel", requestId),
    onProgress: (callback: (payload: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
      ipcRenderer.on("spp:smart-selection:progress", handler);
      return () => ipcRenderer.removeListener("spp:smart-selection:progress", handler);
    },
  },

  /** Open a URL in the default system browser. */
  openUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke("spp:open-url", url),

  /** Open a folder in the system file manager. */
  openFolder: (folderPath: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke("spp:open-folder", folderPath),

  /** Open any file or folder with the default OS application. Used for multi-page PDF printing. */
  openPath: (filePath: string): Promise<{ error?: string }> =>
    ipcRenderer.invoke("spp:open-path", filePath),

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
  },

  /** Product Library — persistent read/write via Python backend. */
  productLibrary: {
    loadAll: async (): Promise<unknown[]> => {
      const res = await ipcRenderer.invoke("spp:product-library:get-all") as { success: boolean; products?: unknown[]; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to load products");
      return res.products!;
    },
    saveOne: async (product: unknown): Promise<void> => {
      const res = await ipcRenderer.invoke("spp:product-library:save-one", product) as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to save product");
    },
    uploadMask: async (productId: string, maskDataBase64: string, fileName: string): Promise<string> => {
      const res = await ipcRenderer.invoke("spp:product-library:upload-mask", productId, maskDataBase64, fileName) as { success: boolean; maskPath?: string; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to upload mask");
      return res.maskPath!;
    },
    reloadOne: async (productId: string): Promise<unknown | null> => {
      const res = await ipcRenderer.invoke("spp:product-library:reload-one", productId) as { success: boolean; product?: unknown | null; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to reload product");
      return res.product ?? null;
    },
  },
});

import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("spp", {
  platform: process.platform,

  /** Write a data URL to a temp file; returns the temp file path. */
  writeTempImage: (dataUrl: string, ext: string): Promise<string> =>
    ipcRenderer.invoke("spp:write-temp-image", dataUrl, ext),

  /** Dev diagnostics: renderer-accessible process memory snapshot. */
  getMemoryUsage: (): Promise<NodeJS.MemoryUsage> =>
    ipcRenderer.invoke("spp:get-memory-usage"),

  /** List installed OS font families. */
  listSystemFonts: (): Promise<string[]> =>
    ipcRenderer.invoke("spp:list-system-fonts"),

  /** Read a file from disk as a base64 string. */
  readFileBase64: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("spp:read-file-base64", filePath),

  choosePsdFile: (): Promise<{ success: boolean; filePath?: string; fileSize?: number; error?: string }> =>
    ipcRenderer.invoke("spp:choose-psd-file"),

  importPsd: (filePath: string): Promise<{ success: boolean; manifest?: unknown; error?: string }> =>
    ipcRenderer.invoke("spp:import-psd", filePath),

  /** Harmonize a layer's colors/brightness to match the background. */
  harmonizeLayer: (
    layerPath: string,
    bgPath: string,
    bboxJson: string,
    optionsJson: string,
    outputPath: string
  ): Promise<{ ok: boolean; diagnostics?: { brightnessAdj: number; saturationAdj: number; tempAdj: number; contrastAdj: number }; error?: string }> =>
    ipcRenderer.invoke("spp:harmonize-layer", layerPath, bgPath, bboxJson, optionsJson, outputPath),

  /** Save a generated PDF through the native save dialog. */
  savePdfDialog: (pdfBase64: string, suggestedName?: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke("spp:save-pdf-dialog", pdfBase64, suggestedName),

  /** Export every page of a multi-page document to one chosen folder (single dialog). */
  exportPagesToFolder: (payload: { documentName?: string; items: Array<{ dataUrl: string; fileName: string }> }): Promise<{ success: boolean; folderPath?: string; count?: number; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke("spp:export-pages-to-folder", payload),

  /** Pick a destination path for a project file (Save As). Writing is done via writeProjectFile. */
  saveProjectDialog: (suggestedName?: string): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke("spp:save-project-dialog", suggestedName),

  /** Overwrite an existing project file in place (Save / Ctrl+S). */
  writeProjectFile: (filePath: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("spp:write-project-file", filePath, content),

  /** Cache an imported asset's original bytes on disk for autosave recovery. */
  cacheAssetFile: (base64: string, fileName: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke("spp:cache-asset-file", base64, fileName),

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
    accelerationStatus: (providers?: string[]) => ipcRenderer.invoke("spp:smart-selection:acceleration-status", providers),
    sdAccelerationStatus: () => ipcRenderer.invoke("spp:smart-selection:sd-acceleration-status"),
    benchmark: (options?: { iterations?: number; providers?: string[] }) => ipcRenderer.invoke("spp:smart-selection:benchmark", options),
    setPerformanceProfile: (profile: string) => ipcRenderer.invoke("spp:smart-selection:set-performance-profile", profile),
    ensureModel: (modelId: string) => ipcRenderer.invoke("spp:smart-selection:ensure-model", modelId),
    listModels: () => ipcRenderer.invoke("spp:smart-selection:list-models"),
    loadImage: (imageId: string, imagePath: string, sourceHash: string) => ipcRenderer.invoke("spp:smart-selection:load-image", imageId, imagePath, sourceHash),
    encodeSam: (imageId: string) => ipcRenderer.invoke("spp:smart-selection:encode-sam", imageId),
    autoSegment: (imageId: string, options: unknown) => ipcRenderer.invoke("spp:smart-selection:auto-segment", imageId, options),
    predictMask: (imageId: string, options: unknown) => ipcRenderer.invoke("spp:smart-selection:predict-mask", imageId, options),
    refineMask: (imageId: string, options: unknown) => ipcRenderer.invoke("spp:smart-selection:refine-mask", imageId, options),
    inpaintRemove: (imageId: string, options: unknown) => ipcRenderer.invoke("spp:smart-selection:inpaint-remove", imageId, options),
    warmInpaint: () => ipcRenderer.invoke("spp:smart-selection:warm-inpaint"),
    warmSdInpaint: () => ipcRenderer.invoke("spp:smart-selection:warm-sd-inpaint"),
    preloadModels: (level: string) => ipcRenderer.invoke("spp:smart-selection:preload-models", level),
    modelsStatus: () => ipcRenderer.invoke("spp:smart-selection:models-status"),
    reloadModels: (level: string) => ipcRenderer.invoke("spp:smart-selection:reload-models", level),
    unloadImage: (imageId: string) => ipcRenderer.invoke("spp:smart-selection:unload-image", imageId),
    detectFaces: (imageId: string) => ipcRenderer.invoke("spp:smart-selection:detect-faces", imageId),
    cancel: (requestId: string) => ipcRenderer.invoke("spp:smart-selection:cancel", requestId),
    onProgress: (callback: (payload: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
      ipcRenderer.on("spp:smart-selection:progress", handler);
      return () => ipcRenderer.removeListener("spp:smart-selection:progress", handler);
    },
  },

  raw: {
    decode: (bytes: Uint8Array, fileName: string) => ipcRenderer.invoke("spp:raw:decode", bytes, fileName),
  },

  components: {
    list: () => ipcRenderer.invoke("spp:component:list"),
    health: (id: string) => ipcRenderer.invoke("spp:component:health", id),
    install: (id: string) => ipcRenderer.invoke("spp:component:install", id),
    repair: (id: string) => ipcRenderer.invoke("spp:component:repair", id),
    remove: (id: string) => ipcRenderer.invoke("spp:component:remove", id),
    openLogs: () => ipcRenderer.invoke("spp:component:open-logs"),
    openModels: () => ipcRenderer.invoke("spp:component:open-models"),
    gpuInfo: () => ipcRenderer.invoke("spp:system:gpu-info"),
  },

  batchBackgroundRemove: {
    chooseImages: () => ipcRenderer.invoke("spp:batch-background-remove:choose-images"),
    chooseOutputDir: (defaultPath: string) => ipcRenderer.invoke("spp:batch-background-remove:choose-output-dir", defaultPath),
    run: (payload: unknown) => ipcRenderer.invoke("spp:batch-background-remove:run", payload),
    onProgress: (callback: (payload: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
      ipcRenderer.on("spp:batch-background-remove:progress", handler);
      return () => ipcRenderer.removeListener("spp:batch-background-remove:progress", handler);
    },
  },

  smartPrintPrepare: {
    chooseOutputDir: (defaultPath?: string) => ipcRenderer.invoke("spp:smart-print-prepare:choose-output-dir", defaultPath),
    saveBatch: (payload: unknown) => ipcRenderer.invoke("spp:smart-print-prepare:save-batch", payload),
  },

  printHub: {
    submitJob: (payload: unknown) => ipcRenderer.invoke("spp:printHub:submit-job", payload),
    flushOutbox: () => ipcRenderer.invoke("spp:printHub:flush-outbox"),
    outboxCount: () => ipcRenderer.invoke("spp:printHub:outbox-count"),
    stationInfo: () => ipcRenderer.invoke("spp:printHub:station-info"),
    getServerHub: () => ipcRenderer.invoke("spp:printHub:get-server-hub"),
    setServerHub: (hubRoot: string) => ipcRenderer.invoke("spp:printHub:set-server-hub", hubRoot),
    lanInfo: () => ipcRenderer.invoke("spp:printHub:lan-info"),
    setCloudSession: (payload: unknown) => ipcRenderer.invoke("spp:printHub:set-cloud-session", payload),
    readServerLog: (hubRoot: string) => ipcRenderer.invoke("spp:printHub:read-server-log", hubRoot),
    listQueue: (hubRoot: string) => ipcRenderer.invoke("spp:printHub:list-queue", hubRoot),
    jobAction: (payload: unknown) => ipcRenderer.invoke("spp:printHub:job-action", payload),
    openJobFolder: (payload: unknown) => ipcRenderer.invoke("spp:printHub:open-job-folder", payload),
    installContextMenu: () => ipcRenderer.invoke("spp:printHub:install-context-menu"),
    uninstallContextMenu: () => ipcRenderer.invoke("spp:printHub:uninstall-context-menu"),
    getPrinters: () => ipcRenderer.invoke("spp:printHub:get-printers"),
    getPrinterPapers: (printerName: string) => ipcRenderer.invoke("spp:printHub:get-printer-papers", printerName),
    loadProfiles: (hubRoot: string) => ipcRenderer.invoke("spp:printHub:load-profiles", hubRoot),
    saveProfiles: (payload: unknown) => ipcRenderer.invoke("spp:printHub:save-profiles", payload),
    loadStations: (hubRoot: string) => ipcRenderer.invoke("spp:printHub:load-stations", hubRoot),
    saveStations: (payload: unknown) => ipcRenderer.invoke("spp:printHub:save-stations", payload),
    loadMedia: (hubRoot: string) => ipcRenderer.invoke("spp:printHub:load-media", hubRoot),
    saveMedia: (payload: unknown) => ipcRenderer.invoke("spp:printHub:save-media", payload),
    loadHubConfig: (hubRoot: string) => ipcRenderer.invoke("spp:printHub:load-hub-config", hubRoot),
    saveHubConfig: (payload: unknown) => ipcRenderer.invoke("spp:printHub:save-hub-config", payload),
    exportSettings: (payload: unknown) => ipcRenderer.invoke("spp:printHub:export-settings", payload),
    importSettings: (payload: unknown) => ipcRenderer.invoke("spp:printHub:import-settings", payload),
    readProductionLog: (payload: unknown) => ipcRenderer.invoke("spp:printHub:read-production-log", payload),
    onQuickPrintFiles: (callback: (files: string[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, files: string[]) => callback(files);
      ipcRenderer.on("spp:printHub:quick-print-files", handler);
      return () => ipcRenderer.removeListener("spp:printHub:quick-print-files", handler);
    },
  },

  advancedPrint: {
    health: () => ipcRenderer.invoke("spp:advancedPrint:health"),
    listPrinters: () => ipcRenderer.invoke("spp:advancedPrint:list-printers"),
    getCapabilities: (printerName: string) => ipcRenderer.invoke("spp:advancedPrint:get-capabilities", printerName),
    listIccProfiles: () => ipcRenderer.invoke("spp:advancedPrint:list-icc-profiles"),
    getPrintableArea: (printerName: string, devmodeBase64?: string) => ipcRenderer.invoke("spp:advancedPrint:get-printable-area", printerName, devmodeBase64),
    openDriverDialog: (printerName: string, devmodeBase64?: string) => ipcRenderer.invoke("spp:advancedPrint:open-driver-dialog", printerName, devmodeBase64),
    getDefaultDevmode: (printerName: string) => ipcRenderer.invoke("spp:advancedPrint:get-default-devmode", printerName),
    print: (job: unknown) => ipcRenderer.invoke("spp:advancedPrint:print", job),
    testPage: (job: unknown) => ipcRenderer.invoke("spp:advancedPrint:test-page", job),
    applyColor: (payload: unknown) => ipcRenderer.invoke("spp:advancedPrint:apply-color", payload),
    colorPreview: (payload: unknown) => ipcRenderer.invoke("spp:advancedPrint:color-preview", payload),
    writeTempImage: (dataUrl: string, ext: string) => ipcRenderer.invoke("spp:advancedPrint:write-temp-image", dataUrl, ext),
    writeLog: (entry: unknown) => ipcRenderer.invoke("spp:advancedPrint:write-log", entry),
    readLog: (day?: string) => ipcRenderer.invoke("spp:advancedPrint:read-log", day),
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

  /** Open the bundled HTML user guide in the OS default browser. */
  openUserGuide: (): Promise<{ error?: string }> =>
    ipcRenderer.invoke("spp:open-user-guide"),

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

  /**
   * Subscribe to the main process asking the window to close (the X button).
   * The renderer must decide whether to prompt about unsaved work, then call
   * confirmClose() to actually close. Returns an unsubscribe function.
   */
  onCloseRequested: (callback: () => void): (() => void) => {
    const handler = (): void => callback();
    ipcRenderer.on("spp:close-requested", handler);
    return () => ipcRenderer.removeListener("spp:close-requested", handler);
  },

  /** Tell the main process it is now safe to close this window. */
  confirmClose: (): void => ipcRenderer.send("spp:confirm-close"),

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

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("spp", {
  platform: process.platform,

  writeTempImage: (dataUrl, ext) =>
    ipcRenderer.invoke("spp:write-temp-image", dataUrl, ext),

  getMemoryUsage: () =>
    ipcRenderer.invoke("spp:get-memory-usage"),

  listSystemFonts: () =>
    ipcRenderer.invoke("spp:list-system-fonts"),

  readFileBase64: (filePath) =>
    ipcRenderer.invoke("spp:read-file-base64", filePath),

  choosePsdFile: () =>
    ipcRenderer.invoke("spp:choose-psd-file"),

  importPsd: (filePath) =>
    ipcRenderer.invoke("spp:import-psd", filePath),

  harmonizeLayer: (layerPath, bgPath, bboxJson, optionsJson, outputPath) =>
    ipcRenderer.invoke("spp:harmonize-layer", layerPath, bgPath, bboxJson, optionsJson, outputPath),

  savePdfDialog: (pdfBase64, suggestedName) =>
    ipcRenderer.invoke("spp:save-pdf-dialog", pdfBase64, suggestedName),

  convertOfficeToPdf: (inputPath) =>
    ipcRenderer.invoke("spp:convert-office-to-pdf", inputPath),

  getFilePath: (file) =>
    webUtils.getPathForFile(file),

  checkLibreOffice: () =>
    ipcRenderer.invoke("spp:check-libreoffice"),

  chooseLibreOfficePath: () =>
    ipcRenderer.invoke("spp:choose-libreoffice-path"),

  openImageEditor: (inputPath, outputPath) =>
    ipcRenderer.invoke("spp:open-image-editor", inputPath, outputPath),

  openPrintPreview: (payload) =>
    ipcRenderer.invoke("spp:open-print-preview", payload),

  openModeWindow: (payload) =>
    ipcRenderer.invoke("spp:open-mode-window", payload),

  getModeWindowSnapshot: (snapshotId) =>
    ipcRenderer.invoke("spp:get-mode-window-snapshot", snapshotId),

  openPdfStudioWindow: () =>
    ipcRenderer.invoke("spp:open-mode-window", { mode: "pdf-studio", title: "SPP2-PDF EDITOR" }),

  applyImageParams: (inputPath, outputPath, paramsJson) =>
    ipcRenderer.invoke("spp:apply-image-params", inputPath, outputPath, paramsJson),

  smartSelection: {
    health: () => ipcRenderer.invoke("spp:smart-selection:health"),
    setPerformanceProfile: (profile) => ipcRenderer.invoke("spp:smart-selection:set-performance-profile", profile),
    ensureModel: (modelId) => ipcRenderer.invoke("spp:smart-selection:ensure-model", modelId),
    listModels: () => ipcRenderer.invoke("spp:smart-selection:list-models"),
    loadImage: (imageId, imagePath, sourceHash) => ipcRenderer.invoke("spp:smart-selection:load-image", imageId, imagePath, sourceHash),
    encodeSam: (imageId) => ipcRenderer.invoke("spp:smart-selection:encode-sam", imageId),
    autoSegment: (imageId, options) => ipcRenderer.invoke("spp:smart-selection:auto-segment", imageId, options),
    predictMask: (imageId, options) => ipcRenderer.invoke("spp:smart-selection:predict-mask", imageId, options),
    refineMask: (imageId, options) => ipcRenderer.invoke("spp:smart-selection:refine-mask", imageId, options),
    inpaintRemove: (imageId, options) => ipcRenderer.invoke("spp:smart-selection:inpaint-remove", imageId, options),
    unloadImage: (imageId) => ipcRenderer.invoke("spp:smart-selection:unload-image", imageId),
    detectFaces: (imageId) => ipcRenderer.invoke("spp:smart-selection:detect-faces", imageId),
    cancel: (requestId) => ipcRenderer.invoke("spp:smart-selection:cancel", requestId),
    onProgress: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("spp:smart-selection:progress", handler);
      return () => ipcRenderer.removeListener("spp:smart-selection:progress", handler);
    },
  },

  pixabaySaveAsset: (args) =>
    ipcRenderer.invoke("spp:pixabay-save-asset", args),

  /** Local Graphics Library */
  glib: {
    ensureDirs:          ()             => ipcRenderer.invoke("spp:glib:ensure-dirs"),
    scanDir:             ()             => ipcRenderer.invoke("spp:glib:scan-dir"),
    readIndex:           ()             => ipcRenderer.invoke("spp:glib:read-index"),
    writeIndex:          (assets)       => ipcRenderer.invoke("spp:glib:write-index", assets),
    saveThumbnail:       (args)         => ipcRenderer.invoke("spp:glib:save-thumbnail", args),
    readFileB64:         (filePath)     => ipcRenderer.invoke("spp:glib:read-file-b64", filePath),
    revealFile:          (filePath)     => ipcRenderer.invoke("spp:glib:reveal-file", filePath),
    deleteFile:          (filePath)     => ipcRenderer.invoke("spp:glib:delete-file", filePath),
    moveFile:            (args)         => ipcRenderer.invoke("spp:glib:move-file", args),
    saveAsset:           (args)         => ipcRenderer.invoke("spp:glib:save-asset", args),
    chooseImportFolder:  ()             => ipcRenderer.invoke("spp:glib:choose-import-folder"),
    copyFolder:          (args)         => ipcRenderer.invoke("spp:glib:copy-folder", args),
    getBaseDir:          ()             => ipcRenderer.invoke("spp:glib:get-base-dir"),
  },

  openUrl: (url) =>
    ipcRenderer.invoke("spp:open-url", url),

  openFolder: (folderPath) =>
    ipcRenderer.invoke("spp:open-folder", folderPath),

  openPath: (filePath) =>
    ipcRenderer.invoke("spp:open-path", filePath),

  openExternalApp: (execPath, fileArg) =>
    ipcRenderer.invoke("spp:open-external-app", execPath, fileArg),

  detectPhotoshop: () =>
    ipcRenderer.invoke("spp:detect-photoshop"),

  watchFile: (watchId, filePath) =>
    ipcRenderer.invoke("spp:watch-file", watchId, filePath),

  unwatchFile: (watchId) =>
    ipcRenderer.invoke("spp:unwatch-file", watchId),

  onFileChanged: (callback) => {
    const handler = (_event, watchId, filePath) => callback(watchId, filePath);
    ipcRenderer.on("spp:file-changed", handler);
    return () => ipcRenderer.removeListener("spp:file-changed", handler);
  },

  onOpenFilePath: (callback) => {
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on("spp:open-file-path", handler);
    return () => ipcRenderer.removeListener("spp:open-file-path", handler);
  },

  /** Batch Production Templates — stored as full SPP packages in userData. */
  batchTemplates: {
    save: (payload) => ipcRenderer.invoke("spp:batch-template:save", payload),
    load: (templateId) => ipcRenderer.invoke("spp:batch-template:load", templateId),
    loadThumbnail: (templateId) => ipcRenderer.invoke("spp:batch-template:load-thumbnail", templateId),
    list: () => ipcRenderer.invoke("spp:batch-template:list"),
    delete: (templateId) => ipcRenderer.invoke("spp:batch-template:delete", templateId),
  },

  /** Product Library — persistent read/write via Python backend. */
  productLibrary: {
    /** Load all products from the library JSON. Returns PythonProduct[]. */
    loadAll: async () => {
      const res = await ipcRenderer.invoke("spp:product-library:get-all");
      if (!res.success) throw new Error(res.error || "Failed to load products");
      return res.products;
    },

    /** Upsert a product into the library JSON. */
    saveOne: async (product) => {
      const res = await ipcRenderer.invoke("spp:product-library:save-one", product);
      if (!res.success) throw new Error(res.error || "Failed to save product");
    },

    /**
     * Upload a mask (base64-encoded) to the product library.
     * Returns the relative path of the saved mask file.
     */
    uploadMask: async (productId, maskDataBase64, fileName) => {
      const res = await ipcRenderer.invoke(
        "spp:product-library:upload-mask",
        productId,
        maskDataBase64,
        fileName
      );
      if (!res.success) throw new Error(res.error || "Failed to upload mask");
      return res.maskPath;
    },

    /** Reload a single product by ID. Returns PythonProduct or null. */
    reloadOne: async (productId) => {
      const res = await ipcRenderer.invoke("spp:product-library:reload-one", productId);
      if (!res.success) throw new Error(res.error || "Failed to reload product");
      return res.product; // null when not found
    },
  },
});

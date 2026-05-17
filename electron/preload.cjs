const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spp", {
  platform: process.platform,

  writeTempImage: (dataUrl, ext) =>
    ipcRenderer.invoke("spp:write-temp-image", dataUrl, ext),

  readFileBase64: (filePath) =>
    ipcRenderer.invoke("spp:read-file-base64", filePath),

  savePdfDialog: (pdfBase64, suggestedName) =>
    ipcRenderer.invoke("spp:save-pdf-dialog", pdfBase64, suggestedName),

  convertOfficeToPdf: (inputPath) =>
    ipcRenderer.invoke("spp:convert-office-to-pdf", inputPath),

  openImageEditor: (inputPath, outputPath) =>
    ipcRenderer.invoke("spp:open-image-editor", inputPath, outputPath),

  openPrintPreview: (payload) =>
    ipcRenderer.invoke("spp:open-print-preview", payload),

  applyImageParams: (inputPath, outputPath, paramsJson) =>
    ipcRenderer.invoke("spp:apply-image-params", inputPath, outputPath, paramsJson),

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
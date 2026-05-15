const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spp", {
  platform: process.platform,

  writeTempImage: (dataUrl, ext) =>
    ipcRenderer.invoke("spp:write-temp-image", dataUrl, ext),

  readFileBase64: (filePath) =>
    ipcRenderer.invoke("spp:read-file-base64", filePath),

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
  }
});
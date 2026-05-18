const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sppBootstrap", {
  onEvent: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("spp:bootstrap:event", listener);
    return () => ipcRenderer.removeListener("spp:bootstrap:event", listener);
  },
  cancel: () => ipcRenderer.invoke("spp:bootstrap:cancel"),
  resolve: (decision) => ipcRenderer.invoke("spp:bootstrap:resolve", decision)
});

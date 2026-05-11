import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("spp", {
  platform: process.platform
});

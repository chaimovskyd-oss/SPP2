const { app, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { getComponents, computeComponentSignature } = require("./components.manifest.cjs");
const { ensureComponentInstalled, getVenvPythonExe } = require("./pythonBootstrap.cjs");

function getResourcesRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
}

function getUserDataDir() {
  return app.getPath("userData");
}

function getLogsDir() {
  const dir = path.join(getUserDataDir(), "logs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getModelsDir() {
  const dir = path.join(getUserDataDir(), "models");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getComponentsStatePath() {
  return path.join(getUserDataDir(), "components-state.json");
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(getComponentsStatePath(), "utf-8"));
  } catch {
    return { version: 1, components: {} };
  }
}

function writeState(state) {
  fs.writeFileSync(getComponentsStatePath(), JSON.stringify(state, null, 2), "utf-8");
}

function getSignaturePath(component) {
  return path.join(getUserDataDir(), "python-env", component.signatureFile || `.spp2-comp-${component.id}.sig`);
}

function getComponentSignature(component) {
  return computeComponentSignature(component.id, {
    appVersion: app.getVersion(),
    resourcesRoot: getResourcesRoot()
  });
}

function probePythonImport(importStatement, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!importStatement) {
      resolve({ ok: true, detail: "cloud" });
      return;
    }
    const python = getVenvPythonExe();
    if (!fs.existsSync(python)) {
      resolve({ ok: false, detail: "סביבת Python חסרה" });
      return;
    }
    const proc = spawn(python, ["-c", `${importStatement}; print("ok")`], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ ok: false, detail: "timeout" });
    }, timeoutMs);
    proc.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, detail: code === 0 ? stdout.trim() : stderr.trim() || `exit ${code}` });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, detail: err.message });
    });
  });
}

let _gpuInfoCache = null;

/**
 * Detects whether an NVIDIA GPU is physically present. Uses the OS video-controller
 * list (reliable on Optimus/hybrid laptops where Chromium's getGPUInfo only reports
 * the active iGPU). Cached after first probe. Drives the optional "NVIDIA AI
 * Acceleration" (CUDA torch) offer — we never push that ~2.5 GB download without a card.
 */
function detectGpuInfo() {
  if (_gpuInfoCache) return Promise.resolve(_gpuInfoCache);
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      _gpuInfoCache = { nvidia: false, names: [], platform: process.platform };
      resolve(_gpuInfoCache);
      return;
    }
    const proc = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );
    let out = "";
    const timer = setTimeout(() => { try { proc.kill(); } catch { /* ignore */ } }, 8000);
    proc.stdout?.on("data", (c) => { out += c.toString(); });
    proc.on("error", () => {
      clearTimeout(timer);
      _gpuInfoCache = { nvidia: false, names: [], platform: "win32", error: "probe-failed" };
      resolve(_gpuInfoCache);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const names = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      _gpuInfoCache = { nvidia: names.some((n) => /nvidia/i.test(n)), names, platform: "win32" };
      resolve(_gpuInfoCache);
    });
  });
}

async function listComponents() {
  const state = readState();
  const items = [];
  for (const component of getComponents()) {
    const targetSig = getComponentSignature(component);
    const sigPath = getSignaturePath(component);
    let storedSig = "";
    try { storedSig = fs.readFileSync(sigPath, "utf-8").trim(); } catch { /* missing */ }
    const stateEntry = state.components?.[component.id] || {};
    const signatureCurrent = Boolean(storedSig && storedSig === targetSig);
    const status =
      component.type === "cloud" ? "cloud" :
      stateEntry.status === "failed" ? "failed" :
      signatureCurrent ? "installed" :
      storedSig ? "partial" :
      "missing";
    items.push({
      ...component,
      status,
      installedVersion: storedSig,
      targetVersion: targetSig,
      signatureCurrent,
      lastError: stateEntry.lastError || "",
      updatedAt: stateEntry.updatedAt || ""
    });
  }
  return {
    success: true,
    userDataDir: getUserDataDir(),
    logsDir: getLogsDir(),
    modelsDir: getModelsDir(),
    components: items
  };
}

async function healthComponent(id) {
  const listed = await listComponents();
  const component = listed.components.find((item) => item.id === id);
  if (!component) return { success: false, error: `רכיב לא מוכר: ${id}` };
  const importProbe = await probePythonImport(component.healthImport);
  return {
    success: true,
    component: {
      ...component,
      importOk: importProbe.ok,
      importDetail: importProbe.detail,
      healthStatus: component.status === "installed" && importProbe.ok ? "installed" : component.status === "cloud" ? "cloud" : "failed"
    }
  };
}

function markRemoved(id) {
  const state = readState();
  state.components = state.components || {};
  state.components[id] = {
    ...(state.components[id] || {}),
    status: "missing",
    lastError: "",
    updatedAt: new Date().toISOString()
  };
  writeState(state);
}

function registerComponentManagerIpc() {
  ipcMain.handle("spp:component:list", () => listComponents());
  ipcMain.handle("spp:component:health", async (_event, id) => {
    if (id) return healthComponent(id);
    const listed = await listComponents();
    const components = [];
    for (const item of listed.components) {
      const health = await healthComponent(item.id);
      components.push(health.component || item);
    }
    return { success: true, components };
  });
  ipcMain.handle("spp:component:install", async (_event, id) => ensureComponentInstalled(String(id), { prompt: false }));
  ipcMain.handle("spp:component:repair", async (_event, id) => {
    const component = getComponents().find((item) => item.id === id);
    if (!component) return { ok: false, error: `רכיב לא מוכר: ${id}` };
    try { fs.unlinkSync(getSignaturePath(component)); } catch { /* missing */ }
    return ensureComponentInstalled(component.id, { prompt: false });
  });
  ipcMain.handle("spp:component:remove", async (_event, id) => {
    const component = getComponents().find((item) => item.id === id);
    if (!component) return { success: false, error: `רכיב לא מוכר: ${id}` };
    if (!component.removeSafe) return { success: false, error: "לא ניתן להסיר רכיב בסיסי" };
    try { fs.unlinkSync(getSignaturePath(component)); } catch { /* missing */ }
    markRemoved(component.id);
    return { success: true };
  });
  ipcMain.handle("spp:component:open-logs", async () => {
    const error = await shell.openPath(getLogsDir());
    return error ? { success: false, error } : { success: true };
  });
  ipcMain.handle("spp:component:open-models", async () => {
    const error = await shell.openPath(getModelsDir());
    return error ? { success: false, error } : { success: true };
  });
  ipcMain.handle("spp:system:gpu-info", () => detectGpuInfo());
}

module.exports = { registerComponentManagerIpc, listComponents, detectGpuInfo };

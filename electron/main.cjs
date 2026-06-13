const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// ─── Dual-mode entry ────────────────────────────────────────────────────────────
// SPP2.exe            → editor (this file).
// SPP2.exe --print-hub-server → standalone Print Hub Tray (delegate to the bundled server and
// skip the editor bootstrap entirely). Top-level `return` is valid in a CommonJS module.
if (process.argv.includes("--print-hub-server")) {
  require("./printHubServer.bundle.cjs");
  return;
}

const { ensurePythonEnv, ensureComponentInstalled, getVenvPythonExe } = require("./pythonBootstrap.cjs");
const { registerHealthCheckIpc } = require("./healthCheck.cjs");
const { registerComponentManagerIpc } = require("./componentManager.cjs");
const { registerPrintHubMainIpc } = require("./printHubMain.cjs");
const { registerAdvancedPrintIpc } = require("./advancedPrintMain.cjs");
const { registerQuickPrintIpc, extractQuickPrintFiles } = require("./printHubQuickPrint.cjs");
const diagnosticsEnabled = !app.isPackaged || process.env.NODE_ENV !== "production";

function appendMainErrorLog(kind, err) {
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const message = err instanceof Error ? `${err.stack || err.message}` : String(err);
    fs.appendFileSync(path.join(dir, "main-error.log"), `[${new Date().toISOString()}] ${kind}\n${message}\n\n`, "utf-8");
  } catch { /* ignore */ }
}

process.on("uncaughtException", (err) => {
  appendMainErrorLog("uncaughtException", err);
  console.error("[main:uncaughtException]", err);
});

process.on("unhandledRejection", (err) => {
  appendMainErrorLog("unhandledRejection", err);
  console.error("[main:unhandledRejection]", err);
});

// ─── Paths ────────────────────────────────────────────────────────────────────

function getAppRoot() {
  // Dev: project/electron/main.cjs → project
  // Packaged with asar:false: resources/app/electron/main.cjs → resources/app
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app");
  }
  return path.join(__dirname, "..");
}

/**
 * Root containing the bundled Python engines.
 * Packaged: process.resourcesPath  (engines live in resources/<engine>/ via extraResources)
 * Dev:      project root            (engines live alongside the source)
 */
function getEngineRoot(engine) {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  return engine ? path.join(base, engine) : base;
}

function getEngineDir() {
  return getEngineRoot("image.editor.engine");
}

function getPrintPreviewEngineDir() {
  return getEngineRoot("print.preview.engine");
}

/**
 * Path to the Python interpreter SPP2 should spawn.
 * - Packaged: the venv created by pythonBootstrap (%APPDATA%/SPP2/python-env).
 *   Falls back to the embedded interpreter if the venv isn't ready yet (very
 *   early calls during bootstrap recovery).
 * - Dev: system `python` (Windows) / `python3` (else) — same behavior as before.
 */
function getPythonCommand() {
  const venvPython = getVenvPythonExe();
  if (fs.existsSync(venvPython)) return venvPython;
  if (app.isPackaged) {
    // Fallback: embedded python (won't have engine deps, but allows minimal commands).
    const embedded = path.join(process.resourcesPath, "python-embed", process.platform === "win32" ? "python.exe" : "bin/python3");
    if (fs.existsSync(embedded)) return embedded;
  }
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * Writable user-data directory for the product library.
 * Seeded once from the bundled template (see seedProductLibraryIfNeeded).
 * Python's product_handler reads/writes this location via cwd + PYTHONPATH.
 */
function getProductLibraryUserDir() {
  return path.join(app.getPath("userData"), "product_library");
}

function getModelsCacheDir() {
  return path.join(app.getPath("userData"), "models");
}

function getPythonEnvBase() {
  // Common env vars added to every Python spawn so model caches and config
  // land in writable user data, not in Program Files.
  const modelsDir = getModelsCacheDir();
  const logsDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  return {
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    PYTHONLEGACYWINDOWSSTDIO: "0",
    TORCH_HOME: modelsDir,
    HF_HOME: modelsDir,
    XDG_CACHE_HOME: modelsDir,
    SPP2_MODELS_DIR: modelsDir,
    SPP2_LOGS_DIR: logsDir,
    SPP2_USER_DATA_DIR: app.getPath("userData")
  };
}

function runBufferedCommand(command, args, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, stdout, stderr: stderr || "Command timed out" });
    }, timeoutMs);

    proc.stdout?.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    proc.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, stdout, stderr: err.message });
    });
  });
}

function cleanFontFamilies(values) {
  const seen = new Set();
  const families = [];
  for (const value of Array.isArray(values) ? values : []) {
    const family = String(value || "").trim().replace(/\s+/g, " ");
    if (!family) continue;
    const key = family.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    families.push(family);
  }
  return families.sort((a, b) => a.localeCompare(b, ["he", "en"], { sensitivity: "base" }));
}

async function listWindowsFontFamilies() {
  const script = [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "Add-Type -AssemblyName System.Drawing",
    "$fonts = New-Object System.Drawing.Text.InstalledFontCollection",
    "$fonts.Families | ForEach-Object { $_.Name } | Sort-Object -Unique | ConvertTo-Json -Compress"
  ].join("; ");
  const result = await runBufferedCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
  if (!result.success || !result.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout.trim());
    return cleanFontFamilies(Array.isArray(parsed) ? parsed : [parsed]);
  } catch {
    return cleanFontFamilies(result.stdout.split(/\r?\n/));
  }
}

async function listUnixFontFamilies() {
  const result = await runBufferedCommand("fc-list", [":", "family"], 12000);
  if (!result.success || !result.stdout.trim()) return [];
  const names = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    for (const name of line.split(",")) names.push(name.trim());
  }
  return cleanFontFamilies(names);
}

async function listMacFontFamilies() {
  const result = await runBufferedCommand("system_profiler", ["SPFontsDataType", "-json"], 20000);
  if (!result.success || !result.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    const items = Array.isArray(parsed?.SPFontsDataType) ? parsed.SPFontsDataType : [];
    return cleanFontFamilies(items.map((item) => item?._name || item?.family || item?.fullname));
  } catch {
    return [];
  }
}

async function listSystemFontFamilies() {
  if (process.platform === "win32") return listWindowsFontFamilies();
  if (process.platform === "darwin") return listMacFontFamilies();
  return listUnixFontFamilies();
}

function runPython(scriptPath, args, options = {}) {
  return new Promise((resolve) => {
    const engineDir = getEngineDir();

    if (!fs.existsSync(scriptPath)) {
      resolve({
        success: false,
        error: `Python script not found: ${scriptPath}`
      });
      return;
    }

    const proc = spawn(getPythonCommand(), [scriptPath, ...args], {
      cwd: engineDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...getPythonEnvBase(),
        PYTHONPATH: [
          engineDir,
          process.env.PYTHONPATH || ""
        ].filter(Boolean).join(path.delimiter)
      },
      ...options
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      console.log("[python]", chunk.toString().trim());
    });

    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      console.warn("[python:error]", chunk.toString().trim());
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        code,
        stdout,
        stderr,
        error: code === 0 ? undefined : stderr || stdout || `Python exited with code ${code}`
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        error: err.message
      });
    });
  });
}

// ─── Image Editor IPC ─────────────────────────────────────────────────────────

class SmartSelectionSidecar {
  constructor() {
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = Buffer.alloc(0);
  }

  ensureStarted() {
    if (this.proc && !this.proc.killed) return;
    const scriptPath = path.join(getEngineDir(), "smart_selection", "sidecar.py");
    if (!fs.existsSync(scriptPath)) throw new Error(`Smart Selection sidecar not found: ${scriptPath}`);
    this.proc = spawn(getPythonCommand(), ["-u", scriptPath], {
      cwd: getEngineDir(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        ...getPythonEnvBase(),
        PYTHONPATH: [getEngineDir(), process.env.PYTHONPATH || ""].filter(Boolean).join(path.delimiter)
      }
    });
    this.proc.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.proc.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (!text) return;
      const lines = text.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const isStructuredError = line.includes('"message": "request failed"') || line.includes('"level": "error"');
        const isDownloadProgress = line.includes("Downloading:") || /\d+%[|]/.test(line);
        if (isStructuredError) console.warn("[smart-selection:error]", line);
        else if (isDownloadProgress) console.log("[smart-selection:download]", line);
        else console.log("[smart-selection:stderr]", line);
      }
    });
    this.proc.stdin.on("error", (err) => {
      console.warn("[smart-selection:stdin]", err);
      this.rejectAll(err);
      this.proc = null;
      this.stdoutBuffer = Buffer.alloc(0);
    });
    this.proc.on("close", (code) => {
      this.rejectAll(new Error(`Smart Selection sidecar exited with code ${code}`));
      this.proc = null;
      this.stdoutBuffer = Buffer.alloc(0);
    });
    this.proc.on("error", (err) => {
      this.rejectAll(err);
      this.proc = null;
    });
  }

  onStdout(chunk) {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    while (this.stdoutBuffer.length >= 4) {
      const length = this.stdoutBuffer.readUInt32BE(0);
      if (this.stdoutBuffer.length < 4 + length) return;
      const body = this.stdoutBuffer.subarray(4, 4 + length).toString("utf-8");
      this.stdoutBuffer = this.stdoutBuffer.subarray(4 + length);
      const message = JSON.parse(body);
      if (message.event === "smart-selection-progress") {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) win.webContents.send("spp:smart-selection:progress", message.payload || {});
        }
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || String(message.error)));
      else pending.resolve(message.result);
    }
  }

  call(method, params = {}, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      try {
        this.ensureStarted();
      } catch (err) {
        reject(err);
        return;
      }

      if (!this.proc || this.proc.killed || !this.proc.stdin || !this.proc.stdin.writable) {
        reject(new Error("Smart Selection sidecar unavailable"));
        return;
      }

      const id = this.nextId++;
      const payload = Buffer.from(JSON.stringify({ id, method, params }), "utf-8");
      const header = Buffer.alloc(4);
      header.writeUInt32BE(payload.length, 0);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Smart Selection timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      try {
        this.proc.stdin.write(Buffer.concat([header, payload]), (err) => {
          if (!err) return;
          this.pending.delete(id);
          clearTimeout(timer);
          reject(err);
        });
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  shutdown() {
    if (!this.proc) return;
    this.proc.kill();
    this.proc = null;
  }
}

const smartSelectionSidecar = new SmartSelectionSidecar();

async function ensureContentAwareFillReady() {
  const result = await ensureComponentInstalled("content-aware-fill", { prompt: false });
  if (!result || result.ok !== true) {
    throw new Error(result && result.error ? result.error : "Content-Aware Fill dependencies are not installed.");
  }
  if (app.isPackaged) smartSelectionSidecar.shutdown();
}

function smartSelectionCall(method, params = {}, timeoutMs) {
  return smartSelectionSidecar.call(method, params, timeoutMs).catch((err) => ({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    fallback: true,
    message: "Smart Selection is running in fallback mode."
  }));
}

ipcMain.handle("spp:write-temp-image", async (_event, dataUrl, ext) => {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  const safeExt = String(ext || "jpg").replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const tmpPath = path.join(os.tmpdir(), `spp_edit_input_${Date.now()}.${safeExt}`);
  if (diagnosticsEnabled) console.debug("[spp diagnostics] write-temp-image:start", { ext: safeExt, base64Length: base64.length, tmpPath });
  fs.writeFileSync(tmpPath, Buffer.from(base64, "base64"));
  if (diagnosticsEnabled) console.debug("[spp diagnostics] write-temp-image:end", { tmpPath });
  return tmpPath;
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL GRAPHICS LIBRARY IPC
// ═══════════════════════════════════════════════════════════════════════════════

function getGlibBaseDir() {
  return path.join(app.getPath("userData"), "SPP2", "Graphics");
}
function getGlibThumbDir() {
  return path.join(getGlibBaseDir(), ".thumbnails");
}
function getGlibIndexPath() {
  return path.join(getGlibBaseDir(), "graphics_index.json");
}

const GLIB_EXTS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);
const GLIB_MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };

function glibWalk(dir, baseDir) {
  const results = [];
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      const ext = path.extname(e.name).toLowerCase().slice(1);
      if (!GLIB_EXTS.has(ext)) continue;
      try {
        const stat = fs.statSync(full);
        // Read companion JSON metadata if present
        let companionMeta = null;
        const jsonPath = full + ".json";
        if (fs.existsSync(jsonPath)) {
          try { companionMeta = JSON.parse(fs.readFileSync(jsonPath, "utf-8")); } catch {}
        }
        results.push({ filePath: full, fileName: e.name, size: stat.size, mtimeMs: stat.mtimeMs, companionMeta });
      } catch {}
    }
  }
  walk(dir);
  return results;
}

ipcMain.handle("spp:glib:ensure-dirs", async () => {
  const base = getGlibBaseDir();
  const dirs = [
    base, getGlibThumbDir(),
    path.join(base, "Backgrounds"), path.join(base, "Elements"),
    path.join(base, "Stickers"), path.join(base, "Frames"),
    path.join(base, "Textures"), path.join(base, "Shapes"),
    path.join(base, "Downloaded", "Pixabay"),
  ];
  dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));
  return { baseDir: base };
});

ipcMain.handle("spp:glib:scan-dir", async () => {
  const base = getGlibBaseDir();
  fs.mkdirSync(base, { recursive: true });
  return { files: glibWalk(base, base), baseDir: base };
});

ipcMain.handle("spp:glib:read-index", async () => {
  try {
    const raw = fs.readFileSync(getGlibIndexPath(), "utf-8");
    return { success: true, index: JSON.parse(raw) };
  } catch { return { success: true, index: [] }; }
});

ipcMain.handle("spp:glib:write-index", async (_event, assets) => {
  try {
    fs.writeFileSync(getGlibIndexPath(), JSON.stringify(assets, null, 2));
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle("spp:glib:save-thumbnail", async (_event, { id, base64, ext }) => {
  try {
    const dir = getGlibThumbDir();
    fs.mkdirSync(dir, { recursive: true });
    const safeExt = (ext || "jpg").replace(/[^a-zA-Z]/g, "");
    const thumbPath = path.join(dir, `${id}.${safeExt}`);
    fs.writeFileSync(thumbPath, Buffer.from(base64, "base64"));
    return { success: true, thumbnailPath: thumbPath };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle("spp:glib:read-file-b64", async (_event, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mime = GLIB_MIME[ext] || "application/octet-stream";
    return { success: true, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle("spp:glib:reveal-file", async (_event, filePath) => {
  try { shell.showItemInFolder(filePath); return { success: true }; }
  catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle("spp:glib:delete-file", async (_event, filePath) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const json = filePath + ".json";
    if (fs.existsSync(json)) fs.unlinkSync(json);
    return { success: true };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle("spp:glib:move-file", async (_event, { fromPath, toDir, newName }) => {
  try {
    fs.mkdirSync(toDir, { recursive: true });
    const dest = path.join(toDir, newName || path.basename(fromPath));
    fs.renameSync(fromPath, dest);
    return { success: true, newPath: dest };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle("spp:glib:save-asset", async (_event, { base64, ext, filename, category }) => {
  try {
    const safeExt = (ext || "png").replace(/[^a-zA-Z0-9]/g, "");
    const safeName = String(filename || "graphic").replace(/[^a-zA-Z0-9_\-֐-׿]/g, "_").slice(0, 120);
    const dir = path.join(getGlibBaseDir(), category || "Elements");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${safeName}.${safeExt}`);
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    const stat = fs.statSync(filePath);
    return { success: true, filePath, fileName: path.basename(filePath), mtimeMs: stat.mtimeMs, size: stat.size };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle("spp:glib:choose-import-folder", async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, { title: "בחר תיקייה לייבוא", properties: ["openDirectory"] });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    return { success: true, folderPath: result.filePaths[0] };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle("spp:glib:copy-folder", async (_event, { srcDir, category }) => {
  try {
    const destDir = path.join(getGlibBaseDir(), category);
    fs.mkdirSync(destDir, { recursive: true });
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    const copied = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase().slice(1);
      if (!GLIB_EXTS.has(ext)) continue;
      const src = path.join(srcDir, entry.name);
      const dest = path.join(destDir, entry.name);
      fs.copyFileSync(src, dest);
      const stat = fs.statSync(dest);
      copied.push({ filePath: dest, fileName: entry.name, size: stat.size, mtimeMs: stat.mtimeMs });
    }
    return { success: true, destDir, copied };
  } catch (err) { return { success: false, error: String(err) }; }
});

ipcMain.handle("spp:glib:get-base-dir", async () => ({ baseDir: getGlibBaseDir() }));

// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle("spp:pixabay-save-asset", async (_event, { imageBase64, filename, ext, metadata }) => {
  try {
    const safeExt = String(ext || "jpg").replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const safeName = String(filename || "pixabay_asset").replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 120);
    const dir = path.join(app.getPath("userData"), "SPP2", "Graphics", "Downloaded", "Pixabay");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${safeName}.${safeExt}`);
    fs.writeFileSync(filePath, Buffer.from(imageBase64, "base64"));
    if (metadata) {
      fs.writeFileSync(filePath + ".json", JSON.stringify(metadata, null, 2));
    }
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:get-memory-usage", async () => process.memoryUsage());

ipcMain.handle("spp:list-system-fonts", async () => listSystemFontFamilies());

ipcMain.handle("spp:read-file-base64", async (_event, filePath) => {
  const buf = fs.readFileSync(filePath);
  return buf.toString("base64");
});

function getPsdImportBaseDir() {
  return path.join(app.getPath("userData"), "temp", "psd-import");
}

function cleanupDirSafe(dirPath) {
  try {
    if (dirPath && fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.warn("[psd-import] cleanup failed", err instanceof Error ? err.message : String(err));
  }
}

function parsePsdManifest(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) throw new Error("PSD importer returned no manifest.");
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

ipcMain.handle("spp:choose-psd-file", async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, {
      title: "ייבוא PSD",
      properties: ["openFile"],
      filters: [{ name: "Photoshop", extensions: ["psd", "psb"] }]
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return { success: false, error: "בחירת קובץ בוטלה" };
    const stat = fs.statSync(filePath);
    return { success: true, filePath, fileSize: stat.size };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:import-psd", async (_event, filePath) => {
  let outputDir = "";
  try {
    if (typeof filePath !== "string" || filePath.length === 0 || !fs.existsSync(filePath)) {
      return { success: false, error: `PSD file not found: ${filePath || "missing"}` };
    }
    const lower = filePath.toLowerCase();
    if (!lower.endsWith(".psd") && !lower.endsWith(".psb")) {
      return { success: false, error: "Only PSD and PSB files are supported." };
    }
    const scriptPath = path.join(getEngineDir(), "psd_import_service.py");
    const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    outputDir = path.join(getPsdImportBaseDir(), jobId);
    fs.mkdirSync(outputDir, { recursive: true });
    const stat = fs.statSync(filePath);
    const result = await runPython(scriptPath, ["--input", filePath, "--output-dir", outputDir], { timeout: 0 });
    let manifest;
    try {
      manifest = parsePsdManifest(result.stdout);
    } catch (parseErr) {
      cleanupDirSafe(outputDir);
      return { success: false, error: parseErr instanceof Error ? parseErr.message : String(parseErr) };
    }
    manifest.sourcePath = filePath;
    manifest.outputDir = outputDir;
    manifest.fileSize = stat.size;
    if (!result.success && (!Array.isArray(manifest.layers) || manifest.layers.length === 0)) {
      cleanupDirSafe(outputDir);
      return { success: false, manifest, error: manifest.error || result.error || "PSD import failed." };
    }
    return { success: true, manifest };
  } catch (err) {
    cleanupDirSafe(outputDir);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:harmonize-layer", async (_event, layerPath, bgPath, bboxJson, optionsJson, outputPath) => {
  try {
    const scriptPath = path.join(getEngineDir(), "harmonize_service.py");
    const result = await runPython(scriptPath, [
      "--layer-path", layerPath,
      "--bg-path", bgPath,
      "--bbox", bboxJson,
      "--options", optionsJson,
      "--output-path", outputPath
    ]);
    if (!result.success && !result.stdout) {
      return { ok: false, error: result.error || "harmonize failed" };
    }
    const lastLine = result.stdout.trim().split(/\r?\n/).pop() || "";
    return JSON.parse(lastLine);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:save-pdf-dialog", async (_event, pdfBase64, suggestedName = "SPP2-PDF-Studio.pdf") => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showSaveDialog(win, {
      title: "שמירת PDF",
      defaultPath: suggestedName,
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: "השמירה בוטלה" };
    }

    fs.writeFileSync(result.filePath, Buffer.from(pdfBase64, "base64"));
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Pick a destination for a project file (Save As). Returns the chosen path only;
// the renderer writes via spp:write-project-file so metadata stays consistent.
ipcMain.handle("spp:save-project-dialog", async (_event, suggestedName = "project.spp2") => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showSaveDialog(win, {
      title: "שמירת פרויקט",
      defaultPath: suggestedName,
      filters: [
        { name: "SPP2 Project", extensions: ["spp2"] },
        { name: "JSON", extensions: ["json"] }
      ]
    });
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Overwrite an existing project file in place (Ctrl+S when a path is known).
ipcMain.handle("spp:write-project-file", async (_event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, "utf8");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Persist an imported asset's original bytes to an on-disk cache. Autosave strips
// inline data URLs to stay under the localStorage quota; keeping a stable cache
// path lets recovery re-load the full image later. Content-addressed by filename
// (hash.ext) so re-importing the same image is deduplicated.
ipcMain.handle("spp:cache-asset-file", async (_event, base64, fileName) => {
  try {
    const dir = path.join(app.getPath("userData"), "asset-cache");
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, path.basename(fileName));
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    }
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

function getLibreOfficeCandidates() {
  const candidates = [];
  const configured = getConfiguredLibreOfficePath();
  if (configured) candidates.push(configured);
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\LibreOffice\\program\\soffice.exe");
    candidates.push("C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe");
    candidates.push("soffice.exe");
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/LibreOffice.app/Contents/MacOS/soffice");
    candidates.push("soffice");
  } else {
    candidates.push("libreoffice");
    candidates.push("soffice");
  }
  return candidates;
}

function getPdfStudioSettingsPath() {
  return path.join(app.getPath("userData"), "pdf-studio-settings.json");
}

function getConfiguredLibreOfficePath() {
  try {
    const settingsPath = getPdfStudioSettingsPath();
    if (!fs.existsSync(settingsPath)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return typeof parsed.libreOfficePath === "string" && parsed.libreOfficePath.length > 0
      ? parsed.libreOfficePath
      : undefined;
  } catch {
    return undefined;
  }
}

function setConfiguredLibreOfficePath(sofficePath) {
  const settingsPath = getPdfStudioSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({ libreOfficePath: sofficePath }, null, 2), "utf-8");
}

async function findLibreOffice() {
  let lastError = "LibreOffice לא נמצא.";
  for (const candidate of getLibreOfficeCandidates()) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const result = await runLibreOfficeProbe(candidate);
    if (result.success) return { found: true, path: candidate };
    lastError = result.error || lastError;
  }
  return { found: false, error: lastError };
}

function runLibreOfficeProbe(sofficePath) {
  return new Promise((resolve) => {
    const proc = spawn(sofficePath, ["--version"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: "בדיקת LibreOffice עברה את מגבלת הזמן." });
    }, 8000);
    proc.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, error: stderr || `LibreOffice exited with code ${code}` });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });
  });
}

function runLibreOfficeConversion(sofficePath, inputPath, outDir) {
  return new Promise((resolve) => {
    const args = ["--headless", "--convert-to", "pdf", "--outdir", outDir, inputPath];
    const proc = spawn(sofficePath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, error: "המרת LibreOffice עברה את מגבלת הזמן." });
    }, 90000);
    proc.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, stdout, stderr, code });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });
  });
}

ipcMain.handle("spp:check-libreoffice", async () => findLibreOffice());

ipcMain.handle("spp:choose-libreoffice-path", async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    title: "בחר soffice.exe של LibreOffice",
    properties: ["openFile"],
    filters: process.platform === "win32"
      ? [{ name: "LibreOffice", extensions: ["exe"] }]
      : [{ name: "LibreOffice", extensions: ["*"] }]
  });
  if (result.canceled || !result.filePaths[0]) {
    return { success: false, error: "בחירת LibreOffice בוטלה." };
  }
  const selected = result.filePaths[0];
  const probe = await runLibreOfficeProbe(selected);
  if (!probe.success) {
    return { success: false, error: probe.error || "הנתיב שנבחר אינו LibreOffice תקין." };
  }
  setConfiguredLibreOfficePath(selected);
  return { success: true, path: selected };
});

ipcMain.handle("spp:convert-office-to-pdf", async (_event, inputPath) => {
  try {
    if (!inputPath || !fs.existsSync(inputPath)) {
      return { success: false, error: `Office file not found: ${inputPath || "missing"}` };
    }

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "spp2-office-pdf-"));
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outDir, `${baseName}.pdf`);

    let lastError = "LibreOffice was not found or conversion failed.";
    for (const candidate of getLibreOfficeCandidates()) {
      if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
      const result = await runLibreOfficeConversion(candidate, inputPath, outDir);
      if (result.success && fs.existsSync(outputPath)) {
        const pdfBase64 = fs.readFileSync(outputPath).toString("base64");
        return { success: true, pdfBase64, outputPath, outputName: `${baseName}.pdf` };
      }
      lastError = result.error || result.stderr || result.stdout || lastError;
    }

    return { success: false, error: lastError };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});


ipcMain.handle("spp:open-image-editor", async (_event, inputPath, outputPath) => {
  {
    const engineDir = getEngineDir();
    const launcherPath = path.join(engineDir, "launch_editor.py");
    const standalonePath = path.join(engineDir, "standalone.py");

    if (fs.existsSync(launcherPath)) {
      return runPython(launcherPath, ["--input", inputPath, "--output", outputPath]);
    }
    return runPython(standalonePath, []);
  }

  // Ensure editor-only AI deps (gfpgan, realesrgan) are installed before opening.
  const depsResult = await ensureEditorAiDeps();
  if (!depsResult.ok) {
    if (depsResult.cancelled) return { success: false, error: "cancelled" };
    return { success: false, error: depsResult.error ?? "התקנת מודלים נכשלה" };
  }

  const engineDir = getEngineDir();
  const launcherPath = path.join(engineDir, "launch_editor.py");
  const standalonePath = path.join(engineDir, "standalone.py");

  if (fs.existsSync(launcherPath)) {
    return runPython(launcherPath, ["--input", inputPath, "--output", outputPath]);
  }
  // Fallback: opens standalone editor, but may not return output to SPP
  return runPython(standalonePath, []);
});

ipcMain.handle("spp:apply-image-params", async (_event, inputPath, outputPath, paramsJson) => {
  const scriptPath = path.join(getEngineDir(), "apply_params.py");

  const result = await runPython(scriptPath, [
    "--input",
    inputPath,
    "--output",
    outputPath,
    "--params",
    paramsJson
  ]);

  if (!result.success) {
    return result;
  }

  if (!fs.existsSync(outputPath)) {
    return {
      success: false,
      error: `Output file was not created: ${outputPath}`
    };
  }

  return { success: true };
});


// ─── Print Preview IPC ───────────────────────────────────────────────────────

function spawnPrintPreview(args, engineDir) {
  return new Promise((resolve) => {
    try {
      const proc = spawn(getPythonCommand(), args, {
        cwd: engineDir,
        detached: true,
        stdio: ["ignore", "ignore", "pipe"],
        env: {
          ...process.env,
          ...getPythonEnvBase(),
          PYTHONPATH: [engineDir, process.env.PYTHONPATH || ""].filter(Boolean).join(path.delimiter)
        }
      });
      let stderr = "";
      proc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
        console.warn("[print-preview]", chunk.toString().trim());
      });
      proc.on("spawn", () => { proc.unref(); resolve({ success: true }); });
      proc.on("error", (err) => resolve({ success: false, error: err.message }));
      proc.on("close", (code) => {
        if (code !== 0 && stderr) console.warn(`[print-preview] exited with code ${code}: ${stderr}`);
      });
    } catch (err) {
      resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

ipcMain.handle("spp:smart-selection:health", async () => smartSelectionCall("health", {}, 8000));
ipcMain.handle("spp:smart-selection:acceleration-status", async (_event, providers) => smartSelectionCall("acceleration_status", { providers: Array.isArray(providers) ? providers : undefined }, 15000));
ipcMain.handle("spp:smart-selection:sd-acceleration-status", async () => smartSelectionCall("sd_acceleration_status", {}, 20000));
ipcMain.handle("spp:smart-selection:benchmark", async (_event, options) => smartSelectionCall("benchmark_acceleration", { iterations: options && options.iterations, providers: options && Array.isArray(options.providers) ? options.providers : undefined }, 60000));
ipcMain.handle("spp:smart-selection:set-performance-profile", async (_event, profile) => smartSelectionCall("set_performance_profile", { profile }, 8000));
ipcMain.handle("spp:smart-selection:ensure-model", async (_event, modelId) => smartSelectionCall("ensure_model", { model_id: modelId }, 120000));
ipcMain.handle("spp:smart-selection:list-models", async () => smartSelectionCall("list_models", {}, 8000));
ipcMain.handle("spp:smart-selection:load-image", async (_event, imageId, imagePath, sourceHash) => smartSelectionCall("load_image", { image_id: imageId, path: imagePath, source_hash: sourceHash }, 30000));
ipcMain.handle("spp:smart-selection:encode-sam", async (_event, imageId) => smartSelectionCall("encode_sam", { image_id: imageId }, 120000));
ipcMain.handle("spp:smart-selection:auto-segment", async (_event, imageId, options) => smartSelectionCall("auto_segment", { image_id: imageId, options: options || {} }, 120000));
ipcMain.handle("spp:smart-selection:predict-mask", async (_event, imageId, options) => smartSelectionCall("predict_mask", { image_id: imageId, options: options || {} }, 30000));
ipcMain.handle("spp:smart-selection:refine-mask", async (_event, imageId, options) => smartSelectionCall("refine_mask", { image_id: imageId, options: options || {} }, 120000));
ipcMain.handle("spp:smart-selection:inpaint-remove", async (_event, imageId, options) => {
  const requestedEngine = String((options && options.engine) || "sd_inpaint").toLowerCase();
  if (requestedEngine !== "quick_heal") await ensureContentAwareFillReady();
  return smartSelectionCall("inpaint_remove", { image_id: imageId, options: options || {} }, 600000);
});
ipcMain.handle("spp:smart-selection:warm-inpaint", async () => smartSelectionCall("warm_inpaint", {}, 120000));
ipcMain.handle("spp:smart-selection:warm-sd-inpaint", async () => {
  await ensureContentAwareFillReady();
  return smartSelectionCall("warm_sd_inpaint", {}, 600000);
});
ipcMain.handle("spp:smart-selection:preload-models", async (_event, level) => smartSelectionCall("preload_models", { level }, 8000));
ipcMain.handle("spp:smart-selection:models-status", async () => smartSelectionCall("ai_models_status", {}, 8000));
ipcMain.handle("spp:smart-selection:reload-models", async (_event, level) => smartSelectionCall("reload_models", { level }, 8000));
ipcMain.handle("spp:smart-selection:unload-image", async (_event, imageId) => smartSelectionCall("unload_image", { image_id: imageId }, 8000));
ipcMain.handle("spp:smart-selection:detect-faces", async (_event, imageId) => smartSelectionCall("detect_faces", { image_id: imageId }, 30000));
ipcMain.handle("spp:smart-selection:cancel", async (_event, requestId) => smartSelectionCall("cancel", { request_id: requestId }, 8000));

// Develop a camera RAW file to a flat JPEG so the rest of the app treats it like
// any other imported photo. rawpy (LibRaw) is an optional, lazily-installed
// component — the first RAW dropped triggers a small one-time install with a note
// about the default-development limitations; after that it is seamless.
ipcMain.handle("spp:raw:decode", async (_event, bytes, fileName) => {
  const ext = String(path.extname(String(fileName || "")).replace(/^\./, "") || "raw")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") || "raw";
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(os.tmpdir(), `spp_raw_in_${stamp}.${ext}`);
  const outputPath = path.join(os.tmpdir(), `spp_raw_out_${stamp}.jpg`);
  try {
    const install = await ensureComponentInstalled("raw-support", {
      prompt: true,
      detail:
        "תמיכה בקבצי RAW (CR2/CR3, NEF, ARW, DNG, RAF, RW2 ועוד) דורשת התקנה חד-פעמית קטנה (כ-15MB).\n\n" +
        "שים לב: קבצי RAW מפותחים אוטומטית עם איזון הלבן של המצלמה והגדרות ברירת מחדל — בשלב הטעינה אין כוונון ידני של חשיפה או צבע."
    });
    if (!install || install.ok !== true) {
      return { ok: false, cancelled: Boolean(install && install.cancelled), error: install && install.error };
    }

    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    fs.writeFileSync(inputPath, buffer);

    const result = await smartSelectionCall("decode_raw", { options: { inputPath, outputPath } }, 120000);
    if (!result || result.ok !== true || !fs.existsSync(outputPath)) {
      return { ok: false, error: (result && (result.error || result.message)) || "RAW decode failed" };
    }

    const out = fs.readFileSync(outputPath);
    return { ok: true, bytes: out, width: result.width, height: result.height, format: result.format || "JPEG" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch { /* ignore */ }
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }
  }
});

const BATCH_BG_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"];

function batchBgDefaultOutputDir(filePaths) {
  const first = Array.isArray(filePaths) ? filePaths.find((filePath) => typeof filePath === "string" && filePath.length > 0) : undefined;
  const baseDir = first ? path.dirname(first) : app.getPath("pictures");
  return path.join(baseDir, "SPP2_background_removed");
}

function uniquePngOutputPath(outputDir, inputPath) {
  const baseName = path.basename(inputPath, path.extname(inputPath)).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") || "image";
  let candidate = path.join(outputDir, `${baseName}_no-bg.png`);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(outputDir, `${baseName}_no-bg_${index}.png`);
    index += 1;
  }
  return candidate;
}

function sendBatchBgProgress(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("spp:batch-background-remove:progress", payload);
  }
}

ipcMain.handle("spp:batch-background-remove:choose-images", async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, {
      title: "בחירת תמונות להסרת רקע כמותית",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: BATCH_BG_IMAGE_EXTENSIONS }]
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
    return {
      success: true,
      filePaths: result.filePaths,
      defaultOutputDir: batchBgDefaultOutputDir(result.filePaths)
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:batch-background-remove:choose-output-dir", async (_event, defaultPath) => {
  try {
    const fallbackDir = typeof defaultPath === "string" && defaultPath.length > 0 ? defaultPath : batchBgDefaultOutputDir([]);
    fs.mkdirSync(fallbackDir, { recursive: true });
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, {
      title: "בחירת תיקיית שמירה",
      defaultPath: fallbackDir,
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    return { success: true, folderPath: result.filePaths[0] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:batch-background-remove:run", async (_event, payload) => {
  const requestedPaths = Array.isArray(payload?.filePaths) ? payload.filePaths : [];
  const filePaths = requestedPaths
    .map((filePath) => String(filePath || ""))
    .filter((filePath) => {
      const ext = path.extname(filePath).toLowerCase().slice(1);
      return filePath && fs.existsSync(filePath) && BATCH_BG_IMAGE_EXTENSIONS.includes(ext);
    });
  const outputDir = String(payload?.outputDir || batchBgDefaultOutputDir(filePaths));
  const successes = [];
  const failures = [];

  if (filePaths.length === 0) {
    return { success: false, outputDir, successes, failures, error: "No image files were selected." };
  }

  fs.mkdirSync(outputDir, { recursive: true });
  sendBatchBgProgress({ status: "running", total: filePaths.length, completed: 0, currentFile: "", message: "מתחיל עיבוד תמונות" });

  for (let index = 0; index < filePaths.length; index += 1) {
    const inputPath = filePaths[index];
    const fileName = path.basename(inputPath);
    const imageId = `batch-bg-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
    const outputPath = uniquePngOutputPath(outputDir, inputPath);
    sendBatchBgProgress({
      status: "running",
      total: filePaths.length,
      completed: index,
      currentFile: fileName,
      message: `מעבד ${index + 1} מתוך ${filePaths.length}`
    });
    try {
      const loaded = await smartSelectionCall("load_image", { image_id: imageId, path: inputPath, source_hash: `${inputPath}:${fs.statSync(inputPath).mtimeMs}` }, 30000);
      if (!loaded?.ok) throw new Error(loaded?.error || loaded?.message || "Failed to load image.");
      const result = await smartSelectionCall("remove_background_to_file", { image_id: imageId, options: { outputPath } }, 180000);
      if (!result?.ok || !fs.existsSync(outputPath)) {
        throw new Error(result?.error || result?.message || "Object detection failed.");
      }
      successes.push({ inputPath, outputPath, fileName });
    } catch (err) {
      failures.push({ inputPath, fileName, error: err instanceof Error ? err.message : String(err) });
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch {}
    } finally {
      await smartSelectionCall("unload_image", { image_id: imageId }, 8000);
    }
  }

  sendBatchBgProgress({
    status: "done",
    total: filePaths.length,
    completed: filePaths.length,
    currentFile: "",
    message: `הסתיים: ${successes.length} הצליחו, ${failures.length} נכשלו`
  });
  return { success: true, outputDir, successes, failures };
});

function smartPrepareDefaultOutputDir(items) {
  const firstSource = items.map((item) => String(item.sourcePath || "")).find((value) => value.length > 0 && fs.existsSync(value));
  const baseDir = firstSource ? path.dirname(firstSource) : app.getPath("pictures");
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(baseDir, `SPP2_Smart_Print_Prepare_${stamp}`);
}

function safePreparedBaseName(fileName) {
  const raw = path.basename(String(fileName || "image"), path.extname(String(fileName || "")));
  return (raw || "image").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 120);
}

function uniquePreparedOutputPath(outputDir, fileName) {
  const base = safePreparedBaseName(fileName);
  let candidate = path.join(outputDir, `${base}_prepared.jpg`);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(outputDir, `${base}_prepared_${index}.jpg`);
    index += 1;
  }
  return candidate;
}

function dataUrlToBuffer(dataUrl) {
  const value = String(dataUrl || "");
  const match = /^data:[^;]+;base64,(.+)$/i.exec(value);
  if (!match) throw new Error("Invalid image data URL.");
  return Buffer.from(match[1], "base64");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] || char));
}

function smartPrepareReportHtml(report, outputDir) {
  const summary = report?.summary || {};
  const rows = Array.isArray(report?.results) ? report.results : [];
  const tr = rows.map((item) => `
    <tr>
      <td>${escapeHtml(item.fileName || "")}</td>
      <td>${Math.round(Number(item.confidence || 0) * 100)}%</td>
      <td>${escapeHtml((item.warnings || []).map((warning) => warning.message || warning.type).join(", "))}</td>
    </tr>
  `).join("");
  return `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><title>SPP2 Smart Print Prepare Report</title>
<style>body{font-family:Arial,sans-serif;margin:32px;line-height:1.6;color:#111827}table{width:100%;border-collapse:collapse}td,th{border:1px solid #d1d5db;padding:8px;text-align:right}th{background:#eef2ff}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:18px 0}.card{border:1px solid #d1d5db;border-radius:8px;padding:12px;background:#f9fafb}</style></head>
<body><h1>הכנה חכמה לדפוס - דוח</h1><p>פלט נשמר אל: ${escapeHtml(outputDir)}</p>
<div class="summary">
<div class="card"><strong>${Number(report?.total || rows.length)}</strong><br>תמונות</div>
<div class="card"><strong>${Number(summary.screenshotsCleaned || 0)}</strong><br>צילומי מסך נוקו</div>
<div class="card"><strong>${Number(summary.colorCorrected || 0)}</strong><br>תיקוני צבע</div>
<div class="card"><strong>${Number(summary.croppedToTarget || 0)}</strong><br>התאמות למידה</div>
<div class="card"><strong>${Number(summary.manualReviewRequired || 0)}</strong><br>דורשות בדיקה</div>
</div>
<table><thead><tr><th>קובץ</th><th>Confidence</th><th>אזהרות</th></tr></thead><tbody>${tr}</tbody></table>
</body></html>`;
}

ipcMain.handle("spp:smart-print-prepare:choose-output-dir", async (_event, defaultPath) => {
  try {
    const fallbackDir = typeof defaultPath === "string" && defaultPath.length > 0 ? defaultPath : path.join(app.getPath("pictures"), "SPP2_Smart_Print_Prepare");
    fs.mkdirSync(fallbackDir, { recursive: true });
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, {
      title: "בחירת תיקיית פלט",
      defaultPath: fallbackDir,
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    return { success: true, folderPath: result.filePaths[0] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:smart-print-prepare:save-batch", async (_event, payload) => {
  try {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0) return { success: false, error: "No prepared images to save." };
    const outputDir = String(payload?.outputDir || smartPrepareDefaultOutputDir(items));
    const imagesDir = path.join(outputDir, "images");
    fs.mkdirSync(imagesDir, { recursive: true });
    const saved = [];
    for (const item of items) {
      const outputPath = uniquePreparedOutputPath(imagesDir, item.fileName);
      fs.writeFileSync(outputPath, dataUrlToBuffer(item.dataUrl));
      saved.push(outputPath);
    }
    const report = payload?.report || {};
    fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf-8");
    fs.writeFileSync(path.join(outputDir, "report.html"), smartPrepareReportHtml(report, outputDir), "utf-8");
    return { success: true, outputDir, saved };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Export every page of a multi-page document to ONE chosen folder in a single
// dialog (replaces the old per-page browser download which opened N save popups).
// The renderer supplies fully-formed, numbered file names (e.g. "doc-page-01.png").
ipcMain.handle("spp:export-pages-to-folder", async (_event, payload) => {
  try {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0) return { success: false, error: "אין עמודים לייצוא." };
    const safeDocName = (String(payload?.documentName || "SPP2_Export").replace(/[<>:"/\\|?* -]/g, "_").slice(0, 120)) || "SPP2_Export";
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, {
      title: "בחירת תיקיית ייצוא",
      defaultPath: path.join(app.getPath("pictures"), safeDocName),
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    const outputDir = path.join(result.filePaths[0], safeDocName);
    fs.mkdirSync(outputDir, { recursive: true });
    let count = 0;
    for (const item of items) {
      const base = safePreparedBaseName(item.fileName || "page");
      const ext = (path.extname(String(item.fileName || "")) || ".png").toLowerCase();
      let candidate = path.join(outputDir, `${base}${ext}`);
      let index = 2;
      while (fs.existsSync(candidate)) {
        candidate = path.join(outputDir, `${base}_${index}${ext}`);
        index += 1;
      }
      fs.writeFileSync(candidate, dataUrlToBuffer(item.dataUrl));
      count += 1;
    }
    void shell.openPath(outputDir);
    return { success: true, folderPath: outputDir, count };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

registerPrintHubMainIpc({ ipcMain, getUserDataDir: () => app.getPath("userData") });
registerAdvancedPrintIpc({
  ipcMain,
  isPackaged: () => app.isPackaged,
  getResourcesRoot: () => (app.isPackaged ? process.resourcesPath : path.join(__dirname, "..")),
  getUserDataDir: () => app.getPath("userData"),
  pythonColorCall: (method, params, timeoutMs) => smartSelectionCall(method, params, timeoutMs)
});
registerQuickPrintIpc({ ipcMain, getExePath: () => app.getPath("exe") });

// Quick Print: aggregate multi-select (Explorer invokes the verb once per file → several
// second-instance events) with a short debounce, then forward to the renderer once.
let quickPrintBuffer = [];
let quickPrintTimer = null;
function flushQuickPrintFiles() {
  const files = quickPrintBuffer;
  quickPrintBuffer = [];
  quickPrintTimer = null;
  if (files.length === 0) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send("spp:printHub:quick-print-files", files);
  }
}
function enqueueQuickPrintFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return;
  quickPrintBuffer.push(...files);
  if (quickPrintTimer) clearTimeout(quickPrintTimer);
  quickPrintTimer = setTimeout(flushQuickPrintFiles, 400);
}

ipcMain.handle("spp:open-print-preview", async (_event, payload) => {
  const engineDir = getPrintPreviewEngineDir();
  const scriptPath = path.join(engineDir, "launch_spp2_print_preview.py");

  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `Print Preview launcher not found: ${scriptPath}` };
  }

  // ── Multi-page mode ─────────────────────────────────────────────────────────
  if (payload?.pages && payload.pages.length > 0) {
    for (const page of payload.pages) {
      if (!page.filePath || !fs.existsSync(page.filePath)) {
        return { success: false, error: `Page image not found: ${page.filePath ?? "missing"}` };
      }
    }

    const manifest = {
      document_name: payload.documentName ?? "SPP2 Document",
      pages: payload.pages.map((p, i) => ({
        image_path: p.filePath,
        page_name: p.pageName ?? `עמוד ${i + 1}`,
        width_mm: p.widthMm,
        height_mm: p.heightMm,
        dpi: p.dpi,
        orientation: p.orientation ?? "auto"
      }))
    };

    const manifestPath = path.join(os.tmpdir(), `spp2_print_manifest_${Date.now()}.json`);
    try {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    } catch (err) {
      return { success: false, error: `Failed to write print manifest: ${err instanceof Error ? err.message : String(err)}` };
    }

    return spawnPrintPreview([scriptPath, "--manifest", manifestPath], engineDir);
  }

  // ── Single-page mode (original) ─────────────────────────────────────────────
  if (!payload?.filePath || !fs.existsSync(payload.filePath)) {
    return { success: false, error: `Rendered print file not found: ${payload?.filePath ?? "missing"}` };
  }

  const args = [
    scriptPath,
    "--file", payload.filePath,
    "--document-name", payload.documentName ?? "SPP2 Document",
    "--page-name", payload.pageName ?? "Page 1",
    "--width-mm", String(payload.widthMm ?? 210),
    "--height-mm", String(payload.heightMm ?? 297),
    "--width-px", String(payload.widthPx ?? 0),
    "--height-px", String(payload.heightPx ?? 0),
    "--dpi", String(payload.dpi ?? 300),
    "--mime-type", payload.mimeType ?? "image/png",
    "--orientation", payload.orientation ?? ((payload.widthPx ?? 0) >= (payload.heightPx ?? 0) ? "landscape" : "portrait")
  ];

  return spawnPrintPreview(args, engineDir);
});

// ─── External Apps & Utilities IPC ────────────────────────────────────────────

// ─── Batch Templates IPC ──────────────────────────────────────────────────────
// Batch templates are stored as full SPP packages on disk so background/asset
// quality is preserved (see C:\Users\chaim\.claude\plans\we-need-to-fix-starry-horizon.md).

function getBatchTemplatesDir() {
  const dir = path.join(app.getPath("userData"), "SPP2", "batch-templates");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getBatchTemplatesIndexPath() {
  return path.join(getBatchTemplatesDir(), "templates-index.json");
}

function getBatchTemplateFolder(templateId) {
  // templateId is a UUID; reject anything else to keep us safely inside the dir.
  if (typeof templateId !== "string" || !/^[A-Za-z0-9_-]+$/.test(templateId)) {
    throw new Error("Invalid templateId");
  }
  return path.join(getBatchTemplatesDir(), `template_${templateId}`);
}

function readBatchTemplatesIndex() {
  try {
    const raw = fs.readFileSync(getBatchTemplatesIndexPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeBatchTemplatesIndex(items) {
  fs.writeFileSync(getBatchTemplatesIndexPath(), JSON.stringify(items, null, 2), "utf-8");
}

ipcMain.handle("spp:batch-template:save", async (_event, payload) => {
  try {
    const { templateId, packageBytes, thumbnailPngBytes, indexItem } = payload;
    const folder = getBatchTemplateFolder(templateId);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "template.spp2"), Buffer.from(packageBytes));
    if (thumbnailPngBytes && thumbnailPngBytes.byteLength > 0) {
      fs.writeFileSync(path.join(folder, "thumbnail.png"), Buffer.from(thumbnailPngBytes));
    }

    const items = readBatchTemplatesIndex();
    const idx = items.findIndex((t) => t.templateId === templateId);
    const next = idx >= 0
      ? items.map((t, i) => (i === idx ? indexItem : t))
      : [...items, indexItem];
    writeBatchTemplatesIndex(next);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:batch-template:load", async (_event, templateId) => {
  try {
    const folder = getBatchTemplateFolder(templateId);
    const pkgPath = path.join(folder, "template.spp2");
    if (!fs.existsSync(pkgPath)) return { success: false, error: "Template not found" };
    const buf = fs.readFileSync(pkgPath);
    return { success: true, packageBytes: buf };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:batch-template:list", async () => {
  try {
    return { success: true, items: readBatchTemplatesIndex() };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:batch-template:load-thumbnail", async (_event, templateId) => {
  try {
    const folder = getBatchTemplateFolder(templateId);
    const thumbPath = path.join(folder, "thumbnail.png");
    if (!fs.existsSync(thumbPath)) return { success: true, thumbnailBytes: null };
    return { success: true, thumbnailBytes: fs.readFileSync(thumbPath) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:batch-template:delete", async (_event, templateId) => {
  try {
    const folder = getBatchTemplateFolder(templateId);
    if (fs.existsSync(folder)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
    const items = readBatchTemplatesIndex().filter((t) => t.templateId !== templateId);
    writeBatchTemplatesIndex(items);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:open-url", async (_event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle("spp:open-folder", async (_event, folderPath) => {
  try {
    const error = await shell.openPath(folderPath);
    return error ? { error } : {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:open-path", async (_event, filePath) => {
  try {
    const error = await shell.openPath(filePath);
    return error ? { error } : {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

// Opens the bundled HTML user guide in the OS default browser. We must NOT use
// window.open(file://) in the renderer — installFileDropNavigationGuard's
// setWindowOpenHandler denies any file:// URL that isn't the app index. The guide ships
// via extraResources (packaged) / lives in the repo (dev) at the same docs/guide-mapping
// location, so its relative ../../output/...screenshots paths resolve in both.
ipcMain.handle("spp:open-user-guide", async () => {
  try {
    const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
    const guidePath = path.join(base, "docs", "guide-mapping", "spp2-user-guide-he.html");
    if (!fs.existsSync(guidePath)) {
      return { error: `Guide not found at ${guidePath}` };
    }
    const error = await shell.openPath(guidePath);
    return error ? { error } : {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:open-external-app", (_event, execPath, fileArg) => {
  return new Promise((resolve) => {
    try {
      const args = fileArg !== undefined ? [fileArg] : [];
      const proc = spawn(execPath, args, {
        detached: true,
        stdio: "ignore"
      });

      proc.on("error", (err) => resolve({ error: err.message }));
      proc.on("spawn", () => {
        proc.unref();
        resolve({});
      });
    } catch (err) {
      resolve({ error: err instanceof Error ? err.message : String(err) });
    }
  });
});

ipcMain.handle("spp:detect-photoshop", async () => {
  const candidates = [];

  if (process.platform === "win32") {
    const base = "C:\\Program Files\\Adobe";

    if (fs.existsSync(base)) {
      const entries = fs
        .readdirSync(base)
        .filter((d) => d.startsWith("Adobe Photoshop"));

      for (const entry of entries.reverse()) {
        const candidate = path.join(base, entry, "Photoshop.exe");
        if (fs.existsSync(candidate)) candidates.push(candidate);
      }
    }
  }

  if (process.platform === "darwin") {
    candidates.push("/Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app/Contents/MacOS/Adobe Photoshop 2026");
    candidates.push("/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app/Contents/MacOS/Adobe Photoshop 2025");
    candidates.push("/Applications/Adobe Photoshop 2024/Adobe Photoshop 2024.app/Contents/MacOS/Adobe Photoshop 2024");
  }

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ? { path: found } : {};
});

// ─── File Watchers ────────────────────────────────────────────────────────────

const fileWatchers = new Map();

ipcMain.handle("spp:watch-file", (_event, watchId, filePath) => {
  return new Promise((resolve) => {
    try {
      if (fileWatchers.has(watchId)) {
        fileWatchers.get(watchId).close();
      }

      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === "change") {
          const win = BrowserWindow.getAllWindows()[0];
          win?.webContents.send("spp:file-changed", watchId, filePath);
        }
      });

      watcher.on("error", () => {
        fileWatchers.delete(watchId);
      });

      fileWatchers.set(watchId, watcher);
      resolve({});
    } catch (err) {
      resolve({ error: err instanceof Error ? err.message : String(err) });
    }
  });
});

ipcMain.handle("spp:unwatch-file", (_event, watchId) => {
  fileWatchers.get(watchId)?.close();
  fileWatchers.delete(watchId);
});

// ─── Product Library IPC ─────────────────────────────────────────────────────

/**
 * Bundled (read-only in packaged builds) location of the product library template.
 */
function getProductLibraryTemplateDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "product_library")
    : path.join(__dirname, "..", "product_library");
}

/**
 * One-time copy of the bundled product_library into a writable user-data dir
 * so the Python handler can read & write products_library.json, masks/,
 * thumbnails/ without admin rights. Idempotent: never overwrites user data.
 */
function seedProductLibraryIfNeeded() {
  const target = getProductLibraryUserDir();
  fs.mkdirSync(target, { recursive: true });

  const source = getProductLibraryTemplateDir();
  if (!fs.existsSync(source)) return;

  // Copy module code + JSON template, but never overwrite an existing
  // products_library.json (that's the user's data).
  const skipOverwrite = new Set(["products_library.json"]);
  const skipDirs = new Set(["__pycache__", "exports", "thumbnails"]);

  function copyTree(src, dst) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (skipDirs.has(entry.name)) continue;
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(d, { recursive: true });
        copyTree(s, d);
      } else if (entry.isFile()) {
        if (skipOverwrite.has(entry.name) && fs.existsSync(d)) continue;
        // Refresh code files every launch (templates may change between versions);
        // user-data files (products_library.json) are protected above.
        fs.copyFileSync(s, d);
      }
    }
  }

  try {
    copyTree(source, target);
  } catch (err) {
    console.warn("[product-lib] seed failed:", err.message);
  }
}

function getProductLibraryDir() {
  // Always return the writable user-data location — Python reads/writes here.
  return getProductLibraryUserDir();
}

/**
 * Run product_library.product_handler as a Python module with the given CLI arguments.
 * Uses `python -m product_library.product_handler` so that relative imports in
 * pl_storage.py (from .pl_models import Product) resolve correctly.
 * cwd and PYTHONPATH are set so the user-data copy of the package is importable.
 */
function runProductPython(args) {
  const userBase = app.getPath("userData");
  const productDir = getProductLibraryUserDir();
  const handlerFile = path.join(productDir, "product_handler.py");
  const handlerModule = "product_library.product_handler";

  if (!fs.existsSync(handlerFile)) {
    // Defensive — seedProductLibraryIfNeeded should have been called at startup.
    seedProductLibraryIfNeeded();
  }
  if (!fs.existsSync(handlerFile)) {
    return Promise.resolve({
      success: false,
      error: `Product handler not found: ${handlerFile}`
    });
  }

  return new Promise((resolve) => {
    const proc = spawn(getPythonCommand(), ["-m", handlerModule, ...args], {
      cwd: userBase,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...getPythonEnvBase(),
        PYTHONPATH: [userBase, process.env.PYTHONPATH || ""].filter(Boolean).join(path.delimiter)
      }
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      console.warn("[product-lib]", chunk.toString().trim());
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: code === 0 ? undefined : (stderr.trim() || `Python exited with code ${code}`)
      });
    });

    proc.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

function productMaskMimeType(maskPath) {
  const lower = maskPath.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

function enrichProductMaskData(product) {
  const maskPath = typeof product?.mask_path === "string" ? product.mask_path : "";
  if (!maskPath) return product;
  const resolved = path.isAbsolute(maskPath)
    ? maskPath
    : path.join(getProductLibraryDir(), maskPath);
  try {
    if (!fs.existsSync(resolved)) return product;
    return {
      ...product,
      mask_data_base64: fs.readFileSync(resolved).toString("base64"),
      mask_mime_type: productMaskMimeType(resolved),
      mask_file_name: path.basename(resolved)
    };
  } catch {
    return product;
  }
}

/** Load all products from the library JSON and return them as an array. */
ipcMain.handle("spp:product-library:get-all", async () => {
  const result = await runProductPython(["--action", "get-all"]);
  if (!result.success) {
    return { success: false, error: result.error || "Failed to load products" };
  }
  try {
    const products = JSON.parse(result.stdout);
    return { success: true, products: Array.isArray(products) ? products.map(enrichProductMaskData) : products };
  } catch (err) {
    return { success: false, error: `Invalid JSON from product handler: ${err.message}` };
  }
});

/** Upsert a product into the library JSON. */
ipcMain.handle("spp:product-library:save-one", async (_event, product) => {
  const tmpPath = path.join(os.tmpdir(), `spp2_product_save_${Date.now()}.json`);
  try {
    if (!product || typeof product !== "object") {
      return { success: false, error: "Invalid product object" };
    }
    fs.writeFileSync(tmpPath, JSON.stringify(product), "utf-8");
    const result = await runProductPython(["--action", "save-one", "--input", tmpPath]);
    return result.success
      ? { success: true }
      : { success: false, error: result.error || "Save failed" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

/**
 * Upload a mask file to the product library.
 * Electron decodes base64 → temp file; Python copies it to masks/ and returns the relative path.
 */
ipcMain.handle("spp:product-library:upload-mask", async (_event, productId, maskDataBase64, fileName) => {
  const safeExt = (path.extname(String(fileName || ".png")).toLowerCase() || ".png")
    .replace(/[^.a-z0-9]/g, "").slice(0, 5) || ".png";
  const tmpPath = path.join(os.tmpdir(), `spp2_mask_${Date.now()}${safeExt}`);
  try {
    if (!productId || !maskDataBase64) {
      return { success: false, error: "productId and maskDataBase64 are required" };
    }
    fs.writeFileSync(tmpPath, Buffer.from(String(maskDataBase64), "base64"));
    const result = await runProductPython([
      "--action",     "upload-mask",
      "--product-id", String(productId),
      "--mask-file",  tmpPath,
      "--file-name",  String(fileName || "mask.png")
    ]);
    if (!result.success) {
      return { success: false, error: result.error || "Mask upload failed" };
    }
    try {
      const output = JSON.parse(result.stdout);
      return { success: true, maskPath: String(output.path || "") };
    } catch {
      return { success: false, error: "Invalid response from mask upload handler" };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

/** Reload a single product by ID from the library JSON. */
ipcMain.handle("spp:product-library:reload-one", async (_event, productId) => {
  if (!productId) {
    return { success: false, error: "productId is required" };
  }
  const result = await runProductPython([
    "--action",     "reload-one",
    "--product-id", String(productId)
  ]);
  if (!result.success) {
    return { success: false, error: result.error || "Reload failed" };
  }
  try {
    const product = JSON.parse(result.stdout); // null when not found, object otherwise
    return { success: true, product: product ? enrichProductMaskData(product) : product };
  } catch (err) {
    return { success: false, error: `Invalid JSON from reload handler: ${err.message}` };
  }
});

// ─── Main Window ──────────────────────────────────────────────────────────────

const modeWindowSnapshots = new Map();
const MODE_WINDOW_TITLES = {
  "pdf-studio": "SPP2-PDF EDITOR",
  editor: "SPP2-EDITOR",
  "product-library": "SPP2-PRODUCT LIBRARY",
  settings: "SPP2-SETTINGS",
  setup: "SPP2-SETUP",
  "collage-wizard": "SPP2-COLLAGE",
  "photo-print-wizard": "SPP2-PHOTO PRINT",
  "class-photo-wizard": "SPP2-CLASS PHOTO",
  "mask-wizard": "SPP2-MASK"
};

function sanitizeModeWindowMode(mode) {
  const value = String(mode || "").trim().toLowerCase();
  return /^[a-z0-9_-]+$/.test(value) ? value : "";
}

function getModeWindowTitle(mode, requestedTitle) {
  if (typeof requestedTitle === "string" && requestedTitle.trim().length > 0) {
    return requestedTitle.trim();
  }
  return MODE_WINDOW_TITLES[mode] || `SPP2-${mode.replace(/-/g, " ").toUpperCase()}`;
}

function createSnapshotId() {
  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAppIndexFileUrl(targetUrl) {
  try {
    return targetUrl === pathToFileURL(path.join(getAppRoot(), "dist", "index.html")).href;
  } catch {
    return false;
  }
}

function installFileDropNavigationGuard(win) {
  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (typeof targetUrl === "string" && targetUrl.startsWith("file://") && !isAppIndexFileUrl(targetUrl)) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === "string" && url.startsWith("file://") && !isAppIndexFileUrl(url)) {
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

// ─── File-association helpers ─────────────────────────────────────────────────

let pendingOpenFilePath = null;
let pendingQuickPrintFiles = [];

function extractFilePathFromArgv(argv) {
  const exts = [".spp2", ".spp", ".psd", ".psb"];
  // argv[0] is the executable; start from index 1.
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg && !arg.startsWith("-") && exts.some((e) => arg.toLowerCase().endsWith(e))) {
      return arg;
    }
  }
  return null;
}

// Single-instance lock — ensures only one SPP2 process runs at a time.
// When a second instance starts (e.g. user double-clicks a .spp2 file while
// the app is already open), we forward the file path to the first instance.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const filePath = extractFilePathFromArgv(commandLine);
    if (filePath) {
      win.webContents.send("spp:open-file-path", filePath);
    }
    enqueueQuickPrintFiles(extractQuickPrintFiles(commandLine));
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#17161C",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  installFileDropNavigationGuard(win);

  // Don't let the window close out from under unsaved work. Ask the renderer
  // first; it shows the "unsaved changes" prompt and calls confirmClose() when
  // the user decides. confirmClose() destroys the window, bypassing this guard
  // and the beforeunload handler. Only guard once the renderer is loaded and
  // listening; before that, allow a normal close so the X never appears stuck.
  win.webContents.once("did-finish-load", () => { win.__sppCloseGuard = true; });
  win.on("close", (event) => {
    if (win.__sppCloseGuard !== true || win.webContents.isDestroyed()) return;
    event.preventDefault();
    win.webContents.send("spp:close-requested");
  });

  win.loadFile(path.join(getAppRoot(), "dist", "index.html"));

  // If the app was launched by double-clicking a file, send the path once
  // the renderer is ready to receive it.
  if (pendingOpenFilePath) {
    const fileToOpen = pendingOpenFilePath;
    pendingOpenFilePath = null;
    win.webContents.once("did-finish-load", () => {
      win.webContents.send("spp:open-file-path", fileToOpen);
    });
  }

  // If launched via Explorer "Send to SPP Print Hub" (--quick-print), forward the files once ready.
  if (pendingQuickPrintFiles.length > 0) {
    const files = pendingQuickPrintFiles;
    pendingQuickPrintFiles = [];
    win.webContents.once("did-finish-load", () => {
      win.webContents.send("spp:printHub:quick-print-files", files);
    });
  }

  // לפתיחת DevTools זמנית אם צריך דיבוג:
  // win.webContents.openDevTools();
}

// The renderer calls this once the user has resolved any unsaved-changes prompt.
// destroy() force-closes without re-triggering the close guard or beforeunload.
ipcMain.on("spp:confirm-close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win !== null) {
    win.destroy();
  }
});

function createModeWindow(payload = {}) {
  const mode = sanitizeModeWindowMode(payload.mode);
  if (!mode) {
    throw new Error("mode is required");
  }
  const title = getModeWindowTitle(mode, payload.title);
  const snapshotId = payload.snapshot !== undefined ? createSnapshotId() : undefined;
  if (snapshotId !== undefined) {
    modeWindowSnapshots.set(snapshotId, payload.snapshot);
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title,
    backgroundColor: "#17161C",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  installFileDropNavigationGuard(win);
  win.on("closed", () => {
    if (snapshotId !== undefined) modeWindowSnapshots.delete(snapshotId);
  });

  const hash = snapshotId !== undefined ? `/window/${mode}/${snapshotId}` : `/window/${mode}`;
  win.loadFile(path.join(getAppRoot(), "dist", "index.html"), { hash });
  win.webContents.on("did-finish-load", () => {
    win.setTitle(title);
  });
}

ipcMain.handle("spp:open-mode-window", async (_event, payload) => {
  try {
    createModeWindow(payload);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:get-mode-window-snapshot", async (_event, snapshotId) => {
  if (typeof snapshotId !== "string" || !modeWindowSnapshots.has(snapshotId)) {
    return { success: false, error: "Snapshot not found" };
  }
  return { success: true, snapshot: modeWindowSnapshots.get(snapshotId) };
});

ipcMain.handle("spp:open-pdf-studio-window", async () => {
  try {
    createModeWindow({ mode: "pdf-studio", title: MODE_WINDOW_TITLES["pdf-studio"] });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

app.whenReady().then(async () => {
  // Capture file path from launch arguments (file-association double-click).
  pendingOpenFilePath = extractFilePathFromArgv(process.argv);
  pendingQuickPrintFiles = extractQuickPrintFiles(process.argv);

  try {
    seedProductLibraryIfNeeded();
  } catch (err) {
    console.warn("[startup] product library seed failed:", err);
  }
  try {
    registerHealthCheckIpc();
  } catch (err) {
    console.warn("[startup] health check registration failed:", err);
  }
  try {
    registerComponentManagerIpc();
  } catch (err) {
    console.warn("[startup] component manager registration failed:", err);
  }
  try {
    await ensurePythonEnv();
  } catch (err) {
    console.error("[startup] python bootstrap failed:", err);
    // ensurePythonEnv handles user-facing recovery; if we get here something
    // unexpected happened — surface a dialog rather than launching headless.
    dialog.showErrorBox("SPP2", `הכנת הסביבה נכשלה:\n${err instanceof Error ? err.message : String(err)}`);
    app.exit(1);
    return;
  }
  createWindow();
});

app.on("window-all-closed", () => {
  smartSelectionSidecar.shutdown();
  for (const watcher of fileWatchers.values()) {
    watcher.close();
  }
  fileWatchers.clear();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  smartSelectionSidecar.shutdown();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

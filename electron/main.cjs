const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { ensurePythonEnv, getVenvPythonExe } = require("./pythonBootstrap.cjs");
const { registerHealthCheckIpc } = require("./healthCheck.cjs");
const diagnosticsEnabled = !app.isPackaged || process.env.NODE_ENV !== "production";

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
  if (app.isPackaged) {
    const venvPython = getVenvPythonExe();
    if (fs.existsSync(venvPython)) return venvPython;
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
    this.ensureStarted();
    const id = this.nextId++;
    const payload = Buffer.from(JSON.stringify({ id, method, params }), "utf-8");
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Smart Selection timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.proc.stdin.write(Buffer.concat([header, payload]), (err) => {
        if (!err) return;
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err);
      });
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
ipcMain.handle("spp:smart-selection:set-performance-profile", async (_event, profile) => smartSelectionCall("set_performance_profile", { profile }, 8000));
ipcMain.handle("spp:smart-selection:ensure-model", async (_event, modelId) => smartSelectionCall("ensure_model", { model_id: modelId }, 120000));
ipcMain.handle("spp:smart-selection:list-models", async () => smartSelectionCall("list_models", {}, 8000));
ipcMain.handle("spp:smart-selection:load-image", async (_event, imageId, imagePath, sourceHash) => smartSelectionCall("load_image", { image_id: imageId, path: imagePath, source_hash: sourceHash }, 30000));
ipcMain.handle("spp:smart-selection:encode-sam", async (_event, imageId) => smartSelectionCall("encode_sam", { image_id: imageId }, 120000));
ipcMain.handle("spp:smart-selection:auto-segment", async (_event, imageId, options) => smartSelectionCall("auto_segment", { image_id: imageId, options: options || {} }, 120000));
ipcMain.handle("spp:smart-selection:predict-mask", async (_event, imageId, options) => smartSelectionCall("predict_mask", { image_id: imageId, options: options || {} }, 30000));
ipcMain.handle("spp:smart-selection:refine-mask", async (_event, imageId, options) => smartSelectionCall("refine_mask", { image_id: imageId, options: options || {} }, 120000));
ipcMain.handle("spp:smart-selection:inpaint-remove", async (_event, imageId, options) => smartSelectionCall("inpaint_remove", { image_id: imageId, options: options || {} }, 120000));
ipcMain.handle("spp:smart-selection:unload-image", async (_event, imageId) => smartSelectionCall("unload_image", { image_id: imageId }, 8000));
ipcMain.handle("spp:smart-selection:detect-faces", async (_event, imageId) => smartSelectionCall("detect_faces", { image_id: imageId }, 30000));
ipcMain.handle("spp:smart-selection:cancel", async (_event, requestId) => smartSelectionCall("cancel", { request_id: requestId }, 8000));

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
  win.loadFile(path.join(getAppRoot(), "dist", "index.html"));

  // לפתיחת DevTools זמנית אם צריך דיבוג:
  // win.webContents.openDevTools();
}

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

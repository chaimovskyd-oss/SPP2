/**
 * SPP2 health check — verifies the packaged app's runtime prerequisites
 * (Python venv, engines on disk, writable user-data, optional LibreOffice).
 *
 * Exposed via IPC channel `spp:health-check`. A renderer-facing UI can call
 * window.spp.healthCheck() and surface results to the user. Results are also
 * written to logs/health.log for support diagnostics.
 */

const { app, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { getVenvPythonExe } = require("./pythonBootstrap.cjs");

function getHealthLogPath() {
  const dir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "health.log");
}

function probe(cmd, args, timeoutMs = 6000) {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        proc.kill();
        resolve({ ok: false, error: "timeout" });
      }, timeoutMs);
      proc.stdout?.on("data", (c) => { stdout += c.toString(); });
      proc.stderr?.on("data", (c) => { stderr += c.toString(); });
      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: code === 0 ? undefined : (stderr.trim() || `exit ${code}`)
        });
      });
      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ ok: false, error: err.message });
      });
    } catch (err) {
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

function checkWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probePath = path.join(dir, ".spp2-write-test");
    fs.writeFileSync(probePath, "ok", "utf-8");
    fs.unlinkSync(probePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function getEnginesRoot() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
}

async function runHealthCheck() {
  const userData = app.getPath("userData");
  const enginesRoot = getEnginesRoot();
  const checks = [];

  // 1) Python environment
  const venvPython = getVenvPythonExe();
  if (fs.existsSync(venvPython)) {
    const v = await probe(venvPython, ["--version"]);
    checks.push({
      id: "python",
      label: "Python (venv)",
      ok: v.ok,
      detail: v.ok ? (v.stdout || v.stderr) : (v.error || "unknown"),
      path: venvPython
    });
  } else {
    checks.push({
      id: "python",
      label: "Python (venv)",
      ok: !app.isPackaged, // in dev we don't need a venv
      detail: app.isPackaged ? "venv missing — תידרש הכנה מחדש" : "dev mode — using system Python",
      path: venvPython
    });
  }

  // 2) Engine scripts on disk
  const engineFiles = [
    { id: "engine:image-editor", label: "מנוע עריכת תמונה", path: path.join(enginesRoot, "image.editor.engine", "launch_editor.py") },
    { id: "engine:print-preview", label: "מנוע תצוגת הדפסה", path: path.join(enginesRoot, "print.preview.engine", "launch_spp2_print_preview.py") },
    { id: "engine:product-library", label: "ספריית מוצרים", path: path.join(enginesRoot, "product_library", "product_handler.py") }
  ];
  for (const entry of engineFiles) {
    checks.push({
      id: entry.id,
      label: entry.label,
      ok: fs.existsSync(entry.path),
      detail: fs.existsSync(entry.path) ? entry.path : "חסר",
      path: entry.path
    });
  }

  // 3) Writable user-data
  const writeUserData = checkWritable(userData);
  checks.push({
    id: "user-data",
    label: "תיקיית נתוני משתמש",
    ok: writeUserData.ok,
    detail: writeUserData.ok ? "writable" : (writeUserData.error || "not writable"),
    path: userData
  });

  // 4) Writable models cache
  const modelsDir = path.join(userData, "models");
  const writeModels = checkWritable(modelsDir);
  checks.push({
    id: "models-cache",
    label: "תיקיית מודלים (AI)",
    ok: writeModels.ok,
    detail: writeModels.ok ? "writable" : (writeModels.error || "not writable"),
    path: modelsDir
  });

  // 5) Product library seed
  const productJson = path.join(userData, "product_library", "products_library.json");
  checks.push({
    id: "products-json",
    label: "products_library.json",
    ok: fs.existsSync(productJson),
    detail: fs.existsSync(productJson) ? "present" : "חסר — ירוצו seed בפעם הבאה",
    path: productJson
  });

  // 6) Optional: Python venv can import a sentinel package (e.g. PIL).
  if (fs.existsSync(venvPython)) {
    const importCheck = await probe(venvPython, ["-c", "import PIL, sys; print(PIL.__version__)"]);
    checks.push({
      id: "python-deps",
      label: "תלויות Python (Pillow)",
      ok: importCheck.ok,
      detail: importCheck.ok ? `Pillow ${importCheck.stdout}` : (importCheck.error || "import failed"),
      path: ""
    });
  }

  const overall = checks.every((c) => c.ok);
  const summary = {
    ok: overall,
    appVersion: app.getVersion(),
    platform: `${process.platform}-${process.arch}`,
    userDataDir: userData,
    enginesRoot,
    timestamp: new Date().toISOString(),
    checks
  };

  try {
    fs.appendFileSync(getHealthLogPath(), JSON.stringify(summary, null, 2) + "\n", "utf-8");
  } catch { /* ignore */ }

  return summary;
}

function registerHealthCheckIpc() {
  ipcMain.handle("spp:health-check", () => runHealthCheck());
}

module.exports = { runHealthCheck, registerHealthCheckIpc };

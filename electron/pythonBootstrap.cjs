/**
 * First-run Python environment bootstrap.
 *
 * In a packaged build we ship:
 *   resources/python-embed/           — Windows embeddable CPython (no site-packages)
 *   resources/<engine>/requirements.txt × 3
 *
 * On first launch we create a venv in %APPDATA%/SPP2/python-env and
 * pip-install every engine's requirements into it. A signature file
 * (.spp2-env-version) records the app version + sha256 of all requirements.txt
 * contents so a new release with changed deps re-triggers the install.
 *
 * In dev (`app.isPackaged === false`) we skip everything and let the user's
 * system Python run the engines, just like today.
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ENGINES = ["image.editor.engine", "print.preview.engine", "product_library"];

function getResourcesRoot() {
  if (app.isPackaged) return process.resourcesPath;
  return path.join(__dirname, "..");
}

function getEmbeddedPythonExe() {
  if (process.platform === "win32") {
    return path.join(getResourcesRoot(), "python-embed", "python.exe");
  }
  // Mac / Linux (phase 2): embed layout TBD; for now fall back to system python3.
  return "python3";
}

function getVenvDir() {
  return path.join(app.getPath("userData"), "python-env");
}

function getVenvPythonExe() {
  const dir = getVenvDir();
  if (process.platform === "win32") {
    return path.join(dir, "Scripts", "python.exe");
  }
  return path.join(dir, "bin", "python3");
}

function getSignaturePath() {
  return path.join(getVenvDir(), ".spp2-env-version");
}

function getLogPath() {
  const dir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "bootstrap.log");
}

function getEngineRequirementsPath(engine) {
  return path.join(getResourcesRoot(), engine, "requirements.txt");
}

function getAiRequirementsPath() {
  return path.join(getResourcesRoot(), "image.editor.engine", "requirements-ai.txt");
}

function getEditorAiRequirementsPath() {
  return path.join(getResourcesRoot(), "image.editor.engine", "requirements-editor-ai.txt");
}

function getEditorAiSignaturePath() {
  return path.join(getVenvDir(), ".spp2-editor-ai-version");
}

function computeEditorAiSignature() {
  const hash = crypto.createHash("sha256");
  let appVersion = "0.0.0";
  try { appVersion = app.getVersion(); } catch { /* ignore */ }
  hash.update(`app:${appVersion}\n`);
  hash.update(`platform:${process.platform}-${process.arch}\n`);
  const reqPath = getEditorAiRequirementsPath();
  if (fs.existsSync(reqPath)) {
    hash.update("editor-ai:");
    hash.update(fs.readFileSync(reqPath));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function computeEnvSignature() {
  const hash = crypto.createHash("sha256");
  let appVersion = "0.0.0";
  try { appVersion = app.getVersion(); } catch { /* ignore */ }
  hash.update(`app:${appVersion}\n`);
  hash.update(`platform:${process.platform}-${process.arch}\n`);
  for (const engine of ENGINES) {
    const reqPath = getEngineRequirementsPath(engine);
    if (fs.existsSync(reqPath)) {
      hash.update(`${engine}:`);
      hash.update(fs.readFileSync(reqPath));
      hash.update("\n");
    }
  }
  const aiReqPath = getAiRequirementsPath();
  if (fs.existsSync(aiReqPath)) {
    hash.update("ai:");
    hash.update(fs.readFileSync(aiReqPath));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function readStoredSignature() {
  try {
    return fs.readFileSync(getSignaturePath(), "utf-8").trim();
  } catch {
    return "";
  }
}

function writeStoredSignature(sig) {
  fs.writeFileSync(getSignaturePath(), sig, "utf-8");
}

function appendLog(line) {
  try {
    fs.appendFileSync(getLogPath(), line.endsWith("\n") ? line : line + "\n", "utf-8");
  } catch { /* ignore */ }
}

function runPipeStream(cmd, args, options, onLine) {
  return new Promise((resolve) => {
    appendLog(`\n$ ${cmd} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, ...options });
    const handle = (chunk, stream) => {
      const text = chunk.toString();
      appendLog(text.replace(/\n$/, ""));
      if (onLine) {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) onLine(stream, line);
        }
      }
    };
    proc.stdout?.on("data", (c) => handle(c, "stdout"));
    proc.stderr?.on("data", (c) => handle(c, "stderr"));
    proc.on("error", (err) => {
      appendLog(`! spawn error: ${err.message}`);
      resolve({ success: false, code: -1, error: err.message });
    });
    proc.on("close", (code) => {
      appendLog(`(exit ${code})`);
      resolve({ success: code === 0, code });
    });
  });
}

function createBootstrapWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 360,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#17161C",
    title: "SPP2 — הכנת סביבה",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "bootstrapPreload.cjs")
    }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "bootstrap.html"));
  return win;
}

function emit(win, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send("spp:bootstrap:event", payload);
  }
}

let cancelled = false;
function registerCancelHandler() {
  ipcMain.removeHandler("spp:bootstrap:cancel");
  ipcMain.handle("spp:bootstrap:cancel", () => {
    cancelled = true;
    return { ok: true };
  });
}

async function ensurePythonEnv() {
  // Dev mode → rely on system Python, as the project already does today.
  if (!app.isPackaged) {
    return { skipped: true, reason: "dev" };
  }

  const targetSig = computeEnvSignature();
  const storedSig = readStoredSignature();
  const venvPython = getVenvPythonExe();

  if (storedSig === targetSig && fs.existsSync(venvPython)) {
    return { skipped: true, reason: "current" };
  }

  appendLog(`\n=== bootstrap @ ${new Date().toISOString()} ===`);
  appendLog(`target signature: ${targetSig}`);
  appendLog(`stored signature: ${storedSig || "(none)"}`);

  cancelled = false;
  registerCancelHandler();
  const win = createBootstrapWindow();
  await new Promise((r) => win.webContents.once("did-finish-load", r));

  const setStage = (stage, message, progress) => {
    emit(win, { type: "stage", stage, message, progress });
  };
  const appendLine = (line) => {
    emit(win, { type: "log", line });
  };

  const checkCancel = () => {
    if (cancelled) {
      appendLog("! cancelled by user");
      throw new Error("CANCELLED");
    }
  };

  try {
    const embeddedPython = getEmbeddedPythonExe();
    if (!fs.existsSync(embeddedPython)) {
      throw new Error(`Embedded Python not found at ${embeddedPython}`);
    }

    const venvDir = getVenvDir();
    fs.mkdirSync(path.dirname(venvDir), { recursive: true });

    // Step 1 — bootstrap pip in the embedded python so it can create a venv.
    setStage("pip", "מתקין כלי התקנה (pip)…", 0.05);
    const getPipScript = path.join(getResourcesRoot(), "python-embed", "get-pip.py");
    if (fs.existsSync(getPipScript)) {
      checkCancel();
      const r = await runPipeStream(embeddedPython, [getPipScript, "--no-warn-script-location"], {}, (_s, l) => appendLine(l));
      if (!r.success) throw new Error("Failed to bootstrap pip in embedded Python");
    }

    // Step 2 — ensure the venv module and create the venv.
    setStage("venv", "יוצר סביבת עבודה מקומית…", 0.15);
    checkCancel();
    // Use `virtualenv` (which works with embedded Python) — fall back to stdlib `venv`.
    let venvCreated = false;
    {
      const tryVenv = await runPipeStream(
        embeddedPython,
        ["-m", "venv", venvDir],
        {},
        (_s, l) => appendLine(l)
      );
      if (tryVenv.success && fs.existsSync(venvPython)) venvCreated = true;
    }
    if (!venvCreated) {
      // Embedded distro doesn't always ship ensurepip; install virtualenv via the pip we just bootstrapped.
      const installVirtualenv = await runPipeStream(
        embeddedPython,
        ["-m", "pip", "install", "--upgrade", "virtualenv"],
        {},
        (_s, l) => appendLine(l)
      );
      if (!installVirtualenv.success) throw new Error("Failed to install virtualenv");
      checkCancel();
      const mkVenv = await runPipeStream(
        embeddedPython,
        ["-m", "virtualenv", venvDir],
        {},
        (_s, l) => appendLine(l)
      );
      if (!mkVenv.success || !fs.existsSync(venvPython)) throw new Error("Failed to create venv");
    }

    // Step 3 — upgrade pip inside the venv.
    setStage("pip-upgrade", "מעדכן pip…", 0.25);
    checkCancel();
    await runPipeStream(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], {}, (_s, l) => appendLine(l));

    // Step 4 — install each engine's requirements.
    const friendlyNames = {
      "image.editor.engine": "מנוע עריכת תמונה (PIL, OpenCV, PSD Tools)",
      "print.preview.engine": "מנוע תצוגת הדפסה",
      "product_library": "ספריית מוצרים"
    };
    const startProgress = 0.3;
    const endProgress = 0.88;
    const engineCount = ENGINES.filter((e) => fs.existsSync(getEngineRequirementsPath(e))).length || 1;
    let engineIdx = 0;

    for (const engine of ENGINES) {
      const reqPath = getEngineRequirementsPath(engine);
      if (!fs.existsSync(reqPath)) continue;
      const stageProgress = startProgress + ((endProgress - startProgress) * engineIdx) / engineCount;
      setStage(`install:${engine}`, `מתקין: ${friendlyNames[engine] || engine}…`, stageProgress);
      checkCancel();
      const r = await runPipeStream(
        venvPython,
        ["-m", "pip", "install", "--prefer-binary", "-r", reqPath],
        {},
        (_s, l) => appendLine(l)
      );
      if (!r.success) {
        throw new Error(`pip install failed for ${engine}. ראה logs/bootstrap.log.`);
      }
      engineIdx += 1;
    }

    // Step 5 — install AI requirements (torch, onnxruntime, mediapipe, gfpgan…).
    // This is a large download (~3-5 GB) and is kept separate so the progress bar
    // clearly communicates the heavy step to the user.
    const aiReqPath = getAiRequirementsPath();
    if (fs.existsSync(aiReqPath)) {
      setStage("install:ai", "מתקין ספריות AI (torch, onnxruntime, mediapipe, GFPGAN — הורדה גדולה, יכול לקחת 10-20 דקות)…", 0.88);
      checkCancel();
      const rAi = await runPipeStream(
        venvPython,
        ["-m", "pip", "install", "--prefer-binary", "-r", aiReqPath],
        {},
        (_s, l) => appendLine(l)
      );
      if (!rAi.success) {
        throw new Error(`pip install failed for AI requirements. ראה logs/bootstrap.log.`);
      }
    }

    setStage("done", "סיום, פותח את האפליקציה…", 1.0);
    writeStoredSignature(targetSig);
    appendLog("=== bootstrap complete ===");

    // Briefly let the user see "done" before closing.
    await new Promise((r) => setTimeout(r, 600));
    if (!win.isDestroyed()) win.close();
    return { skipped: false, reason: "installed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(`! bootstrap failed: ${message}`);

    if (message === "CANCELLED") {
      if (!win.isDestroyed()) win.close();
      app.exit(0);
      return { skipped: false, error: "cancelled" };
    }

    // Offline / partial failure: if a venv from a previous run still works,
    // let the user continue with it rather than blocking the launch.
    const hasUsableVenv = fs.existsSync(venvPython) && storedSig !== "";
    emit(win, {
      type: "error",
      message,
      canContinue: hasUsableVenv
    });
    const choice = await new Promise((resolve) => {
      ipcMain.removeHandler("spp:bootstrap:resolve");
      ipcMain.handle("spp:bootstrap:resolve", (_e, decision) => {
        resolve(decision);
        return { ok: true };
      });
    });
    if (!win.isDestroyed()) win.close();
    if (choice === "continue" && hasUsableVenv) {
      return { skipped: false, reason: "fallback", error: message };
    }
    app.exit(1);
    return { skipped: false, error: message };
  } finally {
    ipcMain.removeHandler("spp:bootstrap:cancel");
    ipcMain.removeHandler("spp:bootstrap:resolve");
  }
}

/**
 * Lazily installs editor-only AI packages (gfpgan, realesrgan, torchvision).
 * Called before opening the standalone image editor for the first time.
 * Shows a confirmation dialog, then a bootstrap progress window.
 * Returns { ok: true } when ready, { ok: false, cancelled: true } if user declined.
 */
async function ensureEditorAiDeps() {
  if (!app.isPackaged) return { ok: true }; // dev — assume deps available

  const reqPath = getEditorAiRequirementsPath();
  if (!fs.existsSync(reqPath)) return { ok: true }; // no editor-ai deps defined

  const targetSig = computeEditorAiSignature();
  const venvPython = getVenvPythonExe();

  // Check if already installed
  let storedSig = "";
  try { storedSig = fs.readFileSync(getEditorAiSignaturePath(), "utf-8").trim(); } catch { /* first run */ }
  if (storedSig === targetSig && fs.existsSync(venvPython)) {
    return { ok: true };
  }

  // Ask for confirmation — this is a ~2 GB download
  const { dialog: d } = require("electron");
  const choice = d.showMessageBoxSync({
    type: "info",
    title: "SPP2 — עורך התמונות",
    message: "הפעלת עורך התמונות לראשונה",
    detail: "עורך התמונות משתמש במודלי AI לשחזור פנים (GFPGAN) ולהגדלת תמונה (RealESRGAN).\n\nנדרשת הורדה חד-פעמית של כ-2 GB. ניתן להמשיך להשתמש בתוכנה בזמן ההורדה.\n\nלהתקין?",
    buttons: ["התקן ופתח עורך", "ביטול"],
    defaultId: 0,
    cancelId: 1
  });

  if (choice !== 0) return { ok: false, cancelled: true };

  // Run installation in a bootstrap window (reuses the same UI)
  appendLog(`\n=== editor-ai bootstrap @ ${new Date().toISOString()} ===`);
  appendLog(`target signature: ${targetSig}`);

  cancelled = false;
  registerCancelHandler();
  const win = createBootstrapWindow();
  await new Promise((r) => win.webContents.once("did-finish-load", r));

  const setStage = (stage, message, progress) => emit(win, { type: "stage", stage, message, progress });
  const appendLine = (line) => emit(win, { type: "log", line });

  try {
    if (!fs.existsSync(venvPython)) {
      throw new Error("סביבת Python לא נמצאה. אנא הפעל מחדש את האפליקציה.");
    }

    setStage("install:editor-ai", "מתקין מודלי AI לעורך (torchvision, RealESRGAN, GFPGAN — כ-2 GB)…", 0.1);

    const r = await runPipeStream(
      venvPython,
      ["-m", "pip", "install", "--prefer-binary", "-r", reqPath],
      {},
      (_s, l) => appendLine(l)
    );

    if (!r.success) throw new Error("התקנת מודלי AI נכשלה. ראה logs/bootstrap.log.");

    setStage("done", "סיום, פותח את עורך התמונות…", 1.0);
    fs.writeFileSync(getEditorAiSignaturePath(), targetSig, "utf-8");
    appendLog("=== editor-ai bootstrap complete ===");

    await new Promise((r) => setTimeout(r, 500));
    if (!win.isDestroyed()) win.close();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(`! editor-ai bootstrap failed: ${message}`);
    emit(win, { type: "error", message, canContinue: false });
    await new Promise((resolve) => {
      ipcMain.removeHandler("spp:bootstrap:resolve");
      ipcMain.handle("spp:bootstrap:resolve", (_e, decision) => { resolve(decision); return { ok: true }; });
    });
    if (!win.isDestroyed()) win.close();
    return { ok: false, error: message };
  } finally {
    ipcMain.removeHandler("spp:bootstrap:cancel");
    ipcMain.removeHandler("spp:bootstrap:resolve");
  }
}

module.exports = {
  ensurePythonEnv,
  ensureEditorAiDeps,
  getVenvPythonExe,
  getVenvDir,
  getEmbeddedPythonExe,
  computeEnvSignature
};

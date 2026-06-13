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
const { getComponents, getComponent, computeComponentSignature } = require("./components.manifest.cjs");

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

function getComponentSignaturePath(component) {
  return path.join(getVenvDir(), component.signatureFile || `.spp2-comp-${component.id}.sig`);
}

function getComponentsStatePath() {
  return path.join(app.getPath("userData"), "components-state.json");
}

function getComponentsSelectionPath() {
  return path.join(getResourcesRoot(), "components-selection.json");
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
  const component = getComponent("editor-heavy-ai");
  return getComponentSignaturePath(component || { id: "editor-heavy-ai", signatureFile: ".spp2-comp-editor-heavy-ai.sig" });
}

function computeEditorAiSignature() {
  return computeComponentSignature("editor-heavy-ai", {
    appVersion: safeAppVersion(),
    resourcesRoot: getResourcesRoot()
  });
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

function safeAppVersion() {
  try { return app.getVersion(); } catch { return "0.0.0"; }
}

function readComponentsState() {
  try {
    return JSON.parse(fs.readFileSync(getComponentsStatePath(), "utf-8"));
  } catch {
    return { version: 1, components: {} };
  }
}

function writeComponentsState(state) {
  const next = {
    version: 1,
    components: state && typeof state.components === "object" ? state.components : {}
  };
  fs.mkdirSync(path.dirname(getComponentsStatePath()), { recursive: true });
  fs.writeFileSync(getComponentsStatePath(), JSON.stringify(next, null, 2), "utf-8");
}

function updateComponentState(componentId, patch) {
  const state = readComponentsState();
  state.components[componentId] = {
    ...(state.components[componentId] || {}),
    ...patch,
    updatedAt: new Date().toISOString()
  };
  writeComponentsState(state);
}

function readInstallerSelection() {
  try {
    const raw = fs.readFileSync(getComponentsSelectionPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function shouldInstallOnFirstRun(component, installerSelection) {
  if (!component.installOnFirstRun) return false;
  if (installerSelection.__skipAiForNow && component.isOptional) return false;
  if (Object.prototype.hasOwnProperty.call(installerSelection, component.id)) {
    return installerSelection[component.id] === true;
  }
  return component.defaultSelected !== false;
}

function askFirstRunInstallMode() {
  const { dialog: d } = require("electron");
  const choice = d.showMessageBoxSync({
    type: "question",
    title: "SPP2 - הכנה ראשונית",
    message: "אילו רכיבים להתקין עכשיו?",
    detail: "אפשר להתקין את הרכיבים המומלצים, לדלג כרגע על רכיבי AI מקומיים, או לפתוח את מנהל הרכיבים מתוך ההגדרות לאחר עליית התוכנה.",
    buttons: ["התקן רכיבים מומלצים", "דלג על AI כרגע", "פתח מנהל רכיבים בהמשך"],
    defaultId: 0,
    cancelId: 1
  });
  if (choice === 1) return "skip-ai";
  if (choice === 2) return "manager";
  return "recommended";
}

function getComponentRequirementPaths(component) {
  return (component.requirements || [])
    .map((relPath) => path.join(getResourcesRoot(), relPath))
    .filter((reqPath) => fs.existsSync(reqPath));
}

function isRetryablePipFailure(result) {
  const code = Number(result && result.code);
  return code === -1 || code === 1 || code === 2;
}

async function runPipWithRetry(venvPython, reqPath, pipArgs, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 2;
  const backoffMs = Array.isArray(options.backoffMs) ? options.backoffMs : [3000, 8000];
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    last = await runPipeStream(
      venvPython,
      ["-m", "pip", "install", ...(pipArgs || []), "-r", reqPath],
      {},
      options.onLine
    );
    if (last.success) return last;
    if (attempt >= retries || !isRetryablePipFailure(last)) return last;
    const waitMs = backoffMs[Math.min(attempt, backoffMs.length - 1)] || 3000;
    appendLog(`! pip failed for ${reqPath}; retrying in ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return last || { success: false, code: -1 };
}

function getAccelerationStatePath() {
  return path.join(app.getPath("userData"), "ai-acceleration.json");
}

/** Run a command and capture stdout/stderr as strings (used for verification probes). */
function runCapture(cmd, args) {
  return new Promise((resolve) => {
    appendLog(`\n$ ${cmd} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    proc.stdout?.on("data", (c) => { out += c.toString(); });
    proc.stderr?.on("data", (c) => { err += c.toString(); });
    proc.on("error", (e) => resolve({ success: false, code: -1, stdout: out, stderr: err + e.message }));
    proc.on("close", (code) => {
      appendLog(out.trim());
      if (err.trim()) appendLog(err.trim());
      appendLog(`(exit ${code})`);
      resolve({ success: code === 0, code, stdout: out, stderr: err });
    });
  });
}

// Tiny python probe: prints JSON describing installed onnxruntime variants and
// the available providers. Kept as a one-liner so it has no file dependency.
const ONNX_PROBE_PY = [
  "import json, importlib.metadata as m",
  "def v(p):",
  " try: return m.version(p)",
  " except Exception: return None",
  "d={'cpu':v('onnxruntime'),'dml':v('onnxruntime-directml'),'gpu':v('onnxruntime-gpu'),'providers':[],'error':None}",
  "try:",
  " import onnxruntime as ort; d['providers']=list(ort.get_available_providers()); d['version']=getattr(ort,'__version__',None)",
  "except Exception as e: d['error']=str(e)",
  "print('SPP2_ONNX_JSON='+json.dumps(d))"
].join("\n");

function parseOnnxProbe(stdout) {
  const line = String(stdout || "").split(/\r?\n/).find((l) => l.startsWith("SPP2_ONNX_JSON="));
  if (!line) return null;
  try {
    return JSON.parse(line.slice("SPP2_ONNX_JSON=".length));
  } catch {
    return null;
  }
}

/**
 * Guarantees that, on Windows, Smart Selection runs onnxruntime-directml (GPU)
 * and never silently falls back to a plain CPU onnxruntime. Detects the classic
 * "both onnxruntime and onnxruntime-directml installed" conflict that clobbers
 * the GPU provider, repairs it, and records the outcome to ai-acceleration.json
 * so the Settings panel / support can read why acceleration is (un)available.
 */
async function hardenOnnxAcceleration(venvPython, onLine) {
  const record = (data) => {
    try {
      fs.mkdirSync(path.dirname(getAccelerationStatePath()), { recursive: true });
      fs.writeFileSync(getAccelerationStatePath(), JSON.stringify({ ...data, checkedAt: new Date().toISOString() }, null, 2), "utf-8");
    } catch { /* ignore */ }
  };

  // Non-Windows builds install plain onnxruntime by design — nothing to harden.
  if (process.platform !== "win32") {
    record({ platform: process.platform, accelerationEnabled: null, skipped: true, reason: "non-windows" });
    return { ok: true, skipped: true };
  }

  appendLog("\n=== onnxruntime acceleration hardening (Windows) ===");
  const probe1 = await runCapture(venvPython, ["-c", ONNX_PROBE_PY]);
  const before = parseOnnxProbe(probe1.stdout);

  const hasDml = (before?.providers || []).includes("DmlExecutionProvider");
  const conflict = Boolean(before && [before.cpu, before.dml, before.gpu].filter(Boolean).length > 1);

  // Happy path: DirectML active and no conflicting CPU/gpu wheel installed.
  if (before && hasDml && !conflict) {
    appendLog(`! acceleration OK: providers=${(before.providers || []).join(",")}`);
    record({ platform: "win32", accelerationEnabled: true, conflict: false, providers: before.providers, onnxruntimeVersion: before.version || null, repaired: false });
    return { ok: true, accelerationEnabled: true, repaired: false };
  }

  appendLog(`! acceleration needs repair (hasDml=${hasDml}, conflict=${conflict}); reinstalling onnxruntime-directml`);
  if (onLine) onLine("stdout", "מתקן האצת GPU (DirectML)…");

  // Repair: remove every onnxruntime variant (they share the same import dir, so
  // a leftover CPU/gpu wheel silences DirectML), then install a clean DirectML build.
  await runPipeStream(venvPython, ["-m", "pip", "uninstall", "-y", "onnxruntime", "onnxruntime-gpu", "onnxruntime-directml"], {}, onLine);
  const install = await runPipeStream(
    venvPython,
    ["-m", "pip", "install", "--force-reinstall", "--prefer-binary", "onnxruntime-directml>=1.17,<1.24"],
    {},
    onLine
  );
  if (!install.success) {
    appendLog("! DirectML install failed — Smart Selection will run on CPU");
    record({ platform: "win32", accelerationEnabled: false, conflict, providers: before?.providers || [], repaired: false, error: "directml install failed" });
    return { ok: false, accelerationEnabled: false, error: "directml-install-failed" };
  }

  const probe2 = await runCapture(venvPython, ["-c", ONNX_PROBE_PY]);
  const after = parseOnnxProbe(probe2.stdout);
  const enabled = (after?.providers || []).includes("DmlExecutionProvider");
  appendLog(`! acceleration after repair: enabled=${enabled}, providers=${(after?.providers || []).join(",")}`);
  record({
    platform: "win32",
    accelerationEnabled: enabled,
    conflict: false,
    providers: after?.providers || [],
    onnxruntimeVersion: after?.version || null,
    repaired: true
  });
  return { ok: enabled, accelerationEnabled: enabled, repaired: true };
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

  const firstRunMode = askFirstRunInstallMode();
  appendLog(`first-run mode: ${firstRunMode}`);

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
        ["-m", "virtualenv", "--clear", "--no-seed", venvDir],
        {},
        (_s, l) => appendLine(l)
      );
      if (!mkVenv.success || !fs.existsSync(venvPython)) throw new Error("Failed to create venv");
    }

    const pipProbe = await runPipeStream(venvPython, ["-m", "pip", "--version"], {}, (_s, l) => appendLine(l));
    if (!pipProbe.success) {
      const getPipScript = path.join(getResourcesRoot(), "python-embed", "get-pip.py");
      if (!fs.existsSync(getPipScript)) throw new Error("Failed to locate get-pip.py for the new venv");
      const installPipInVenv = await runPipeStream(
        venvPython,
        [getPipScript, "--no-warn-script-location"],
        {},
        (_s, l) => appendLine(l)
      );
      if (!installPipInVenv.success) throw new Error("Failed to install pip in venv");
    }

    // Step 3 — upgrade pip inside the venv.
    setStage("pip-upgrade", "מעדכן pip…", 0.25);
    checkCancel();
    await runPipeStream(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], {}, (_s, l) => appendLine(l));

    {
    const startProgress = 0.3;
    const endProgress = 0.88;
    const installerSelection = {
      ...readInstallerSelection(),
      __skipAiForNow: firstRunMode === "skip-ai"
    };
    const selectedComponents = getComponents().filter((component) => shouldInstallOnFirstRun(component, installerSelection));
    const installableComponents = selectedComponents.filter((component) => getComponentRequirementPaths(component).length > 0);
    const componentCount = installableComponents.length || 1;
    let componentIdx = 0;

    for (const component of selectedComponents) {
      const reqPaths = getComponentRequirementPaths(component);
      const targetComponentSig = computeComponentSignature(component.id, {
        appVersion: safeAppVersion(),
        resourcesRoot: getResourcesRoot()
      });
      const componentSigPath = getComponentSignaturePath(component);
      let storedComponentSig = "";
      try { storedComponentSig = fs.readFileSync(componentSigPath, "utf-8").trim(); } catch { /* first run */ }

      if (storedComponentSig === targetComponentSig) {
        updateComponentState(component.id, { status: "installed", installedVersion: targetComponentSig, lastError: "" });
        continue;
      }

      if (reqPaths.length === 0) {
        fs.writeFileSync(componentSigPath, targetComponentSig, "utf-8");
        updateComponentState(component.id, { status: "installed", installedVersion: targetComponentSig, lastError: "" });
        continue;
      }

      const stageProgress = startProgress + ((endProgress - startProgress) * componentIdx) / componentCount;
      setStage(`install:${component.id}`, `מתקין: ${component.displayName}...`, stageProgress);
      checkCancel();

      let componentOk = true;
      let componentError = "";
      for (const reqPath of reqPaths) {
        const r = await runPipWithRetry(
          venvPython,
          reqPath,
          component.pipArgs,
          { retries: 2, backoffMs: [3000, 8000], onLine: (_s, l) => appendLine(l) }
        );
        if (!r.success) {
          componentOk = false;
          componentError = `pip install failed for ${component.id}: ${path.basename(reqPath)}`;
          break;
        }
      }

      if (componentOk) {
        fs.writeFileSync(componentSigPath, targetComponentSig, "utf-8");
        updateComponentState(component.id, { status: "installed", installedVersion: targetComponentSig, lastError: "" });
      } else {
        appendLog(`! component failed: ${component.id}: ${componentError}`);
        emit(win, { type: "component-failed", id: component.id, message: componentError });
        updateComponentState(component.id, { status: "failed", installedVersion: storedComponentSig || "", lastError: componentError });
        if (component.blocksLaunch) {
          throw new Error(`${component.displayName} failed. See logs/bootstrap.log.`);
        }
      }
      componentIdx += 1;
    }

    // Verify (and repair if needed) GPU acceleration once Smart Selection — the
    // component that owns onnxruntime — has been installed.
    if (selectedComponents.some((c) => c.id === "smart-selection")) {
      setStage("verify", "מאמת האצת GPU…", 0.95);
      await hardenOnnxAcceleration(venvPython, (_s, l) => appendLine(l));
    }

    setStage("done", "ההתקנה הושלמה, פותח את SPP2...", 1.0);
    writeStoredSignature(targetSig);
    appendLog("=== bootstrap complete ===");

    await new Promise((r) => setTimeout(r, 600));
    if (!win.isDestroyed()) win.close();
    return { skipped: false, reason: "installed" };
    }

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
async function ensureComponentInstalled(componentId, options = {}) {
  if (!app.isPackaged) return { ok: true };

  const component = getComponent(componentId);
  if (!component) return { ok: false, error: `Unknown component: ${componentId}` };

  const reqPaths = getComponentRequirementPaths(component);
  if (reqPaths.length === 0) {
    updateComponentState(component.id, { status: "installed", installedVersion: "no-requirements", lastError: "" });
    return { ok: true };
  }

  const targetSig = computeComponentSignature(component.id, {
    appVersion: safeAppVersion(),
    resourcesRoot: getResourcesRoot()
  });
  const venvPython = getVenvPythonExe();
  const signaturePath = getComponentSignaturePath(component);

  let storedSig = "";
  try { storedSig = fs.readFileSync(signaturePath, "utf-8").trim(); } catch { /* first run */ }
  if (storedSig === targetSig && fs.existsSync(venvPython)) {
    updateComponentState(component.id, { status: "installed", installedVersion: targetSig, lastError: "" });
    return { ok: true };
  }

  if (options.prompt !== false) {
    const { dialog: d } = require("electron");
    const detail = typeof options.detail === "string" && options.detail.trim()
      ? options.detail
      : `זהו רכיב אופציונלי בגודל משוער של ${component.estimatedSizeMB || "?"} MB. אפשר להתקין אותו עכשיו.`;
    const choice = d.showMessageBoxSync({
      type: "info",
      title: `SPP2 - ${component.displayName}`,
      message: `${component.displayName} עדיין לא מותקן`,
      detail,
      buttons: ["התקן", "ביטול"],
      defaultId: 0,
      cancelId: 1
    });
    if (choice !== 0) return { ok: false, cancelled: true };
  }

  appendLog(`\n=== component bootstrap ${component.id} @ ${new Date().toISOString()} ===`);
  cancelled = false;
  registerCancelHandler();
  const win = createBootstrapWindow();
  await new Promise((r) => win.webContents.once("did-finish-load", r));

  const setStage = (stage, message, progress) => emit(win, { type: "stage", stage, message, progress });
  const appendLine = (line) => emit(win, { type: "log", line });

  try {
    if (!fs.existsSync(venvPython)) {
      throw new Error("Python environment is missing. Restart SPP2 to run first-run setup.");
    }

    for (let i = 0; i < reqPaths.length; i += 1) {
      setStage(`install:${component.id}`, `מתקין: ${component.displayName}...`, 0.1 + (0.75 * i) / reqPaths.length);
      const r = await runPipWithRetry(
        venvPython,
        reqPaths[i],
        component.pipArgs,
        { retries: 2, backoffMs: [3000, 8000], onLine: (_s, l) => appendLine(l) }
      );
      if (!r.success) throw new Error(`pip install failed for ${component.id}: ${path.basename(reqPaths[i])}`);
    }

    if (component.id === "smart-selection") {
      setStage("verify", "מאמת האצת GPU…", 0.95);
      await hardenOnnxAcceleration(venvPython, (_s, l) => appendLine(l));
    }

    setStage("done", "ההתקנה הושלמה.", 1.0);
    fs.writeFileSync(signaturePath, targetSig, "utf-8");
    updateComponentState(component.id, { status: "installed", installedVersion: targetSig, lastError: "" });
    appendLog(`=== component bootstrap complete: ${component.id} ===`);
    await new Promise((r) => setTimeout(r, 500));
    if (!win.isDestroyed()) win.close();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(`! component bootstrap failed (${component.id}): ${message}`);
    updateComponentState(component.id, { status: "failed", installedVersion: storedSig || "", lastError: message });
    emit(win, { type: "error", message, canContinue: false });
    await new Promise((resolve) => {
      ipcMain.removeHandler("spp:bootstrap:resolve");
      ipcMain.handle("spp:bootstrap:resolve", () => { resolve("closed"); return { ok: true }; });
    });
    if (!win.isDestroyed()) win.close();
    return { ok: false, error: message };
  } finally {
    ipcMain.removeHandler("spp:bootstrap:cancel");
    ipcMain.removeHandler("spp:bootstrap:resolve");
  }
}

async function ensureEditorAiDeps() {
  return ensureComponentInstalled("editor-heavy-ai", { prompt: true });

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
  ensureComponentInstalled,
  hardenOnnxAcceleration,
  getAccelerationStatePath,
  getVenvPythonExe,
  getVenvDir,
  getEmbeddedPythonExe,
  computeEnvSignature
};

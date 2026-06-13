// Electron-main bridge for the experimental Advanced Print Engine.
//
// Spawns and talks to the native SppAdvancedPrintWorker.exe over the same framed JSON-RPC
// protocol as the Python smart-selection sidecar (4-byte BE length + UTF-8 JSON). When the
// worker exe is absent (e.g. the .NET SDK wasn't available at build time), every worker call
// rejects and the renderer's engine ladder falls back to PDF/Electron — the app never hangs.
//
// Also owns: per-job JSONL logging, and the color-pass delegation to the Python engine.

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

class AdvancedPrintWorker {
  constructor(exePathResolver) {
    this.resolveExePath = exePathResolver;
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = Buffer.alloc(0);
  }

  exeExists() {
    try {
      return fs.existsSync(this.resolveExePath());
    } catch {
      return false;
    }
  }

  ensureStarted() {
    if (this.proc && !this.proc.killed) return;
    const exe = this.resolveExePath();
    if (!fs.existsSync(exe)) throw new Error(`Advanced print worker not found: ${exe}`);
    this.proc = spawn(exe, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.proc.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.proc.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.log("[advanced-print:stderr]", text);
    });
    this.proc.stdin.on("error", (err) => {
      console.warn("[advanced-print:stdin]", err);
      this.rejectAll(err);
      this.proc = null;
      this.stdoutBuffer = Buffer.alloc(0);
    });
    this.proc.on("close", (code) => {
      this.rejectAll(new Error(`Advanced print worker exited with code ${code}`));
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
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || String(message.error)));
      else pending.resolve(message.result);
    }
  }

  rejectAll(err) {
    for (const { reject } of this.pending.values()) reject(err);
    this.pending.clear();
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
        reject(new Error("Advanced print worker unavailable"));
        return;
      }
      const id = this.nextId++;
      const payload = Buffer.from(JSON.stringify({ id, method, params }), "utf-8");
      const header = Buffer.alloc(4);
      header.writeUInt32BE(payload.length, 0);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Advanced print worker timed out: ${method}`));
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

  dispose() {
    if (this.proc && !this.proc.killed) {
      try { this.proc.kill(); } catch { /* ignore */ }
    }
    this.proc = null;
  }
}

/**
 * Registers all Advanced Print IPC.
 * @param {object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {() => boolean} deps.isPackaged
 * @param {() => string} deps.getResourcesRoot  process.resourcesPath (packaged) or project root (dev)
 * @param {() => string} deps.getUserDataDir
 * @param {(method: string, params: object, timeoutMs?: number) => Promise<any>} [deps.pythonColorCall]
 *        Delegate to the Python engine for the color/ICC pass (smart-selection sidecar).
 */
function registerAdvancedPrintIpc(deps) {
  const { ipcMain, isPackaged, getResourcesRoot, getUserDataDir, pythonColorCall } = deps;

  const resolveExePath = () => {
    const root = getResourcesRoot();
    // Packaged: resources/spp2_advanced_print_worker/SppAdvancedPrintWorker.exe
    // Dev:      <project>/spp2_advanced_print_worker/dist/SppAdvancedPrintWorker.exe
    return isPackaged()
      ? path.join(root, "spp2_advanced_print_worker", "SppAdvancedPrintWorker.exe")
      : path.join(root, "spp2_advanced_print_worker", "dist", "SppAdvancedPrintWorker.exe");
  };

  const worker = new AdvancedPrintWorker(resolveExePath);

  const isWindows = process.platform === "win32";

  // Health / availability — drives the renderer's engine-selection ladder.
  ipcMain.handle("spp:advancedPrint:health", async () => {
    if (!isWindows || !worker.exeExists()) {
      return { available: false, isWindows, reason: !isWindows ? "non-windows" : "worker-missing" };
    }
    try {
      const result = await worker.call("health", {}, 8000);
      return { available: Boolean(result && result.ok), isWindows, worker: result };
    } catch (err) {
      return { available: false, isWindows, reason: String(err && err.message ? err.message : err) };
    }
  });

  ipcMain.handle("spp:advancedPrint:list-printers", async () => {
    return worker.call("list-printers", {}, 15000);
  });

  ipcMain.handle("spp:advancedPrint:get-capabilities", async (_event, printerName) => {
    return worker.call("get-capabilities", { printerName }, 20000);
  });

  ipcMain.handle("spp:advancedPrint:list-icc-profiles", async () => {
    return worker.call("list-icc-profiles", {}, 15000);
  });

  ipcMain.handle("spp:advancedPrint:get-printable-area", async (_event, printerName, devmodeBase64) => {
    return worker.call("get-printable-area", { printerName, devmodeBase64: devmodeBase64 ?? null }, 15000);
  });

  ipcMain.handle("spp:advancedPrint:open-driver-dialog", async (_event, printerName, devmodeBase64) => {
    // Seed the dialog with the profile's saved DEVMODE so reopening shows the user's last settings
    // (paper/tray/borderless) instead of resetting to the driver default.
    return worker.call("open-driver-dialog", { printerName, devmodeBase64: devmodeBase64 ?? null }, 300000); // user-driven; long timeout
  });

  ipcMain.handle("spp:advancedPrint:get-default-devmode", async (_event, printerName) => {
    return worker.call("get-default-devmode", { printerName }, 15000);
  });

  ipcMain.handle("spp:advancedPrint:print", async (_event, job) => {
    return worker.call("print", job || {}, 120000);
  });

  ipcMain.handle("spp:advancedPrint:test-page", async (_event, job) => {
    return worker.call("test-page", job || {}, 120000);
  });

  // Color/ICC pass — delegate to the Python engine. Returns the path of the color-managed file.
  ipcMain.handle("spp:advancedPrint:apply-color", async (_event, payload) => {
    if (typeof pythonColorCall !== "function") {
      throw new Error("Color engine unavailable");
    }
    return pythonColorCall("advanced_print_color", payload || {}, 120000);
  });

  // Color preview — runs the SAME color math on a downscaled copy and returns the result as a
  // data URL the renderer can show in the before/after slider. Fast (preview_max_px downscale).
  ipcMain.handle("spp:advancedPrint:color-preview", async (_event, payload) => {
    if (typeof pythonColorCall !== "function") throw new Error("Color engine unavailable");
    const p = payload || {};
    const dir = path.join(getUserDataDir(), "AdvancedPrintTemp");
    fs.mkdirSync(dir, { recursive: true });
    const inFile = path.join(dir, `cp_in_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
    const base64 = String(p.dataUrl || "").replace(/^data:[^;]+;base64,/, "");
    fs.writeFileSync(inFile, Buffer.from(base64, "base64"));
    try {
      const result = await pythonColorCall("advanced_print_color", {
        input_path: inFile,
        preset: p.preset ?? null,
        color_mode: p.colorMode,
        apply_icc: p.applyIcc,
        icc_profile_path: p.iccProfilePath ?? "",
        rendering_intent: p.renderingIntent,
        black_point_compensation: p.blackPointCompensation,
        preview_max_px: p.maxPx ?? 700
      }, 60000);
      const outPath = result && result.outputPath;
      if (!outPath || !fs.existsSync(outPath)) throw new Error("color preview produced no output");
      const outBuf = fs.readFileSync(outPath);
      try { fs.unlinkSync(inFile); } catch { /* ignore */ }
      try { fs.unlinkSync(outPath); } catch { /* ignore */ }
      return { dataUrl: "data:image/png;base64," + outBuf.toString("base64") };
    } catch (err) {
      try { fs.unlinkSync(inFile); } catch { /* ignore */ }
      throw err;
    }
  });

  // ─── JSONL logging ────────────────────────────────────────────────────────
  const logDir = () => path.join(getUserDataDir(), "AdvancedPrintLogs");

  ipcMain.handle("spp:advancedPrint:write-log", async (_event, entry) => {
    try {
      const dir = logDir();
      fs.mkdirSync(dir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      const file = path.join(dir, `print_${day}.jsonl`);
      fs.appendFileSync(file, JSON.stringify(entry) + "\n", "utf-8");
      return { ok: true, file };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  ipcMain.handle("spp:advancedPrint:read-log", async (_event, day) => {
    try {
      const target = day || new Date().toISOString().slice(0, 10);
      const file = path.join(logDir(), `print_${target}.jsonl`);
      if (!fs.existsSync(file)) return { entries: [] };
      const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
      const entries = lines.map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
      return { entries };
    } catch (err) {
      return { entries: [], error: String(err && err.message ? err.message : err) };
    }
  });

  // Write a temp file from a data URL (rendered output / test page) for the worker to print.
  ipcMain.handle("spp:advancedPrint:write-temp-image", async (_event, dataUrl, ext) => {
    const dir = path.join(getUserDataDir(), "AdvancedPrintTemp");
    fs.mkdirSync(dir, { recursive: true });
    const safeExt = ext === "pdf" ? "pdf" : "png";
    const file = path.join(dir, `ape_${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`);
    const base64 = String(dataUrl).replace(/^data:[^;]+;base64,/, "");
    fs.writeFileSync(file, Buffer.from(base64, "base64"));
    return { path: file };
  });

  return { worker };
}

module.exports = { registerAdvancedPrintIpc, AdvancedPrintWorker };

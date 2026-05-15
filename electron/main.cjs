const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// ─── Paths ────────────────────────────────────────────────────────────────────

function getAppRoot() {
  // Dev: project/electron/main.cjs → project
  // Packaged with asar:false: resources/app/electron/main.cjs → resources/app
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app");
  }
  return path.join(__dirname, "..");
}

function getEngineDir() {
  return path.join(getAppRoot(), "image.editor.engine");
}

function getPrintPreviewEngineDir() {
  return path.join(getAppRoot(), "print.preview.engine");
}

function getPythonCommand() {
  return process.platform === "win32" ? "python" : "python3";
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

ipcMain.handle("spp:write-temp-image", async (_event, dataUrl, ext) => {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  const safeExt = String(ext || "jpg").replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const tmpPath = path.join(os.tmpdir(), `spp_edit_input_${Date.now()}.${safeExt}`);
  fs.writeFileSync(tmpPath, Buffer.from(base64, "base64"));
  return tmpPath;
});

ipcMain.handle("spp:read-file-base64", async (_event, filePath) => {
  const buf = fs.readFileSync(filePath);
  return buf.toString("base64");
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

ipcMain.handle("spp:open-print-preview", async (_event, payload) => {
  const engineDir = getPrintPreviewEngineDir();
  const scriptPath = path.join(engineDir, "launch_spp2_print_preview.py");

  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `Print Preview launcher not found: ${scriptPath}` };
  }

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
    "--mime-type", payload.mimeType ?? "image/png"
  ];

  return new Promise((resolve) => {
    try {
      const proc = spawn(getPythonCommand(), args, {
        cwd: engineDir,
        detached: true,
        stdio: ["ignore", "ignore", "pipe"],
        env: {
          ...process.env,
          PYTHONPATH: [engineDir, process.env.PYTHONPATH || ""].filter(Boolean).join(path.delimiter)
        }
      });

      let stderr = "";
      proc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
        console.warn("[print-preview]", chunk.toString().trim());
      });
      proc.on("spawn", () => {
        proc.unref();
        resolve({ success: true });
      });
      proc.on("error", (err) => resolve({ success: false, error: err.message }));
      proc.on("close", (code) => {
        if (code !== 0 && stderr) console.warn(`[print-preview] exited with code ${code}: ${stderr}`);
      });
    } catch (err) {
      resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
});

// ─── External Apps & Utilities IPC ────────────────────────────────────────────

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

// ─── Main Window ──────────────────────────────────────────────────────────────

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

  win.loadFile(path.join(getAppRoot(), "dist", "index.html"));

  // לפתיחת DevTools זמנית אם צריך דיבוג:
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  for (const watcher of fileWatchers.values()) {
    watcher.close();
  }
  fileWatchers.clear();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
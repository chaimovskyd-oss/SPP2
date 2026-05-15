import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;

function getAppRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app");
  }
  return path.join(__dirname, "..");
}

function getPrintPreviewEngineDir(): string {
  return path.join(getAppRoot(), "print.preview.engine");
}

function getPythonCommand(): string {
  return process.platform === "win32" ? "python" : "python3";
}

// ─── Image Editor IPC ─────────────────────────────────────────────────────────

/**
 * Write a data URL to a temp file and return the file path.
 * Used to give the Python editor a real file to open.
 */
ipcMain.handle("spp:write-temp-image", async (_event, dataUrl: string, ext: string): Promise<string> => {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  const tmpPath = path.join(os.tmpdir(), `spp_edit_input_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpPath, Buffer.from(base64, "base64"));
  return tmpPath;
});

/**
 * Read a file from disk and return it as a base64 string.
 * Used to bring the edited image back into the renderer.
 */
ipcMain.handle("spp:read-file-base64", async (_event, filePath: string): Promise<string> => {
  const buf = fs.readFileSync(filePath);
  return buf.toString("base64");
});

/**
 * Launch the Smart Image Editor (Python / PySide6) for a specific file.
 * Resolves with { success: true } when the user clicks "Apply to Canvas",
 * or { success: false } if the window is closed without saving.
 */
ipcMain.handle(
  "spp:open-image-editor",
  (_event, inputPath: string, outputPath: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      // Resolve the launcher script relative to the project root
      const launcherPath = isDev
        ? path.join(__dirname, "../../image.editor.engine/launch_editor.py")
        : path.join(process.resourcesPath, "image.editor.engine/launch_editor.py");

      const proc = spawn(
        "python",
        [launcherPath, "--input", inputPath, "--output", outputPath],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      proc.stderr?.on("data", (chunk) => {
        console.warn("[image-editor]", chunk.toString().trim());
      });

      proc.on("close", (code) => {
        resolve({ success: code === 0 });
      });

      proc.on("error", (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }
);

/**
 * Apply edit params to an image headlessly via the Python pipeline.
 * Returns { success: true } when output file is written successfully.
 */
ipcMain.handle(
  "spp:apply-image-params",
  (_event, inputPath: string, outputPath: string, paramsJson: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const scriptPath = isDev
        ? path.join(__dirname, "../../image.editor.engine/apply_params.py")
        : path.join(process.resourcesPath, "image.editor.engine/apply_params.py");

      const proc = spawn(
        "python",
        [scriptPath, "--input", inputPath, "--output", outputPath, "--params", paramsJson],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      proc.stderr?.on("data", (chunk) => {
        console.warn("[apply-params]", chunk.toString().trim());
      });

      proc.on("close", (code) => {
        resolve({ success: code === 0 });
      });

      proc.on("error", (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }
);


// ─── Print Preview IPC ───────────────────────────────────────────────────────

ipcMain.handle("spp:open-print-preview", async (_event, payload: {
  filePath: string;
  documentName?: string;
  pageName?: string;
  widthPx?: number;
  heightPx?: number;
  widthMm?: number;
  heightMm?: number;
  dpi?: number;
  mimeType?: string;
}): Promise<{ success: boolean; error?: string }> => {
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

// ─── External Apps & Utilities IPC ───────────────────────────────────────────

/** Open a URL in the default system browser. */
ipcMain.handle("spp:open-url", async (_event, url: string): Promise<void> => {
  await shell.openExternal(url);
});

/** Open a folder in the system file manager. */
ipcMain.handle("spp:open-folder", async (_event, folderPath: string): Promise<{ error?: string }> => {
  try {
    await shell.openPath(folderPath);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

/** Launch an external application with an optional file argument. */
ipcMain.handle(
  "spp:open-external-app",
  (_event, execPath: string, fileArg?: string): Promise<{ error?: string }> => {
    return new Promise((resolve) => {
      const args = fileArg !== undefined ? [fileArg] : [];
      const proc = spawn(execPath, args, { detached: true, stdio: "ignore" });
      proc.unref();
      proc.on("error", (err) => resolve({ error: err.message }));
      proc.on("spawn", () => resolve({}));
    });
  }
);

/** Auto-detect Photoshop executable on Windows/Mac. */
ipcMain.handle("spp:detect-photoshop", async (): Promise<{ path?: string }> => {
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const base = "C:\\Program Files\\Adobe";
    if (fs.existsSync(base)) {
      const entries = fs.readdirSync(base).filter((d) => d.startsWith("Adobe Photoshop"));
      for (const entry of entries.reverse()) {
        const candidate = path.join(base, entry, "Photoshop.exe");
        if (fs.existsSync(candidate)) candidates.push(candidate);
      }
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app/Contents/MacOS/Adobe Photoshop 2025");
    candidates.push("/Applications/Adobe Photoshop 2024/Adobe Photoshop 2024.app/Contents/MacOS/Adobe Photoshop 2024");
  }
  const found = candidates.find((c) => fs.existsSync(c));
  return found !== undefined ? { path: found } : {};
});

// Active file watchers: watchId → FSWatcher
const fileWatchers = new Map<string, fs.FSWatcher>();

/** Watch a file for external modifications. Sends "spp:file-changed" event when modified. */
ipcMain.handle("spp:watch-file", (_event, watchId: string, filePath: string): Promise<{ error?: string }> => {
  return new Promise((resolve) => {
    try {
      if (fileWatchers.has(watchId)) {
        fileWatchers.get(watchId)!.close();
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

/** Stop watching a file. */
ipcMain.handle("spp:unwatch-file", (_event, watchId: string): void => {
  fileWatchers.get(watchId)?.close();
  fileWatchers.delete(watchId);
});

// ─── Main window ──────────────────────────────────────────────────────────────

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#17161C",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    await win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

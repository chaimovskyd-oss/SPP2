import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
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

ipcMain.handle("spp:save-pdf-dialog", async (_event, pdfBase64: string, suggestedName = "SPP2-PDF-Studio.pdf"): Promise<{ success: boolean; filePath?: string; error?: string }> => {
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

function getLibreOfficeCandidates(): string[] {
  if (process.platform === "win32") {
    return [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
      "soffice.exe"
    ];
  }
  if (process.platform === "darwin") {
    return ["/Applications/LibreOffice.app/Contents/MacOS/soffice", "soffice"];
  }
  return ["libreoffice", "soffice"];
}

function runLibreOfficeConversion(sofficePath: string, inputPath: string, outDir: string): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string; code?: number | null }> {
  return new Promise((resolve) => {
    const args = ["--headless", "--convert-to", "pdf", "--outdir", outDir, inputPath];
    const proc = spawn(sofficePath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("close", (code) => resolve({ success: code === 0, stdout, stderr, code }));
    proc.on("error", (err) => resolve({ success: false, error: err.message }));
  });
}

ipcMain.handle("spp:convert-office-to-pdf", async (_event, inputPath: string): Promise<{ success: boolean; pdfBase64?: string; outputPath?: string; outputName?: string; error?: string }> => {
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

interface PrintPreviewPageEntry {
  filePath: string;
  pageName?: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  orientation?: "portrait" | "landscape";
}

interface PrintPreviewPayload {
  // Single-page mode (original)
  filePath?: string;
  documentName?: string;
  pageName?: string;
  widthPx?: number;
  heightPx?: number;
  widthMm?: number;
  heightMm?: number;
  dpi?: number;
  mimeType?: string;
  orientation?: "portrait" | "landscape";
  // Multi-page mode: supply pages[] instead of filePath
  pages?: PrintPreviewPageEntry[];
}

function spawnPrintPreview(args: string[], engineDir: string): Promise<{ success: boolean; error?: string }> {
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
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        console.warn("[print-preview]", chunk.toString().trim());
      });
      proc.on("spawn", () => { proc.unref(); resolve({ success: true }); });
      proc.on("error", (err: Error) => resolve({ success: false, error: err.message }));
      proc.on("close", (code: number | null) => {
        if (code !== 0 && stderr) console.warn(`[print-preview] exited with code ${code}: ${stderr}`);
      });
    } catch (err) {
      resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

ipcMain.handle("spp:open-print-preview", async (_event, payload: PrintPreviewPayload): Promise<{ success: boolean; error?: string }> => {
  const engineDir = getPrintPreviewEngineDir();
  const scriptPath = path.join(engineDir, "launch_spp2_print_preview.py");

  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `Print Preview launcher not found: ${scriptPath}` };
  }

  // ── Multi-page mode ───────────────────────────────────────────────────────
  if (payload?.pages && payload.pages.length > 0) {
    // Validate all page files exist
    for (const page of payload.pages) {
      if (!page.filePath || !fs.existsSync(page.filePath)) {
        return { success: false, error: `Page image not found: ${page.filePath ?? "missing"}` };
      }
    }

    // Write JSON manifest to temp file
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

    const args = [scriptPath, "--manifest", manifestPath];
    return spawnPrintPreview(args, engineDir);
  }

  // ── Single-page mode (original) ───────────────────────────────────────────
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

/** Open any file with its default OS application (used for multi-page PDF printing). */
ipcMain.handle("spp:open-path", async (_event, filePath: string): Promise<{ error?: string }> => {
  try {
    const error = await shell.openPath(filePath);
    return error ? { error } : {};
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

// ─── Product Library IPC ─────────────────────────────────────────────────────

function getProductLibraryDir(): string {
  return path.join(getAppRoot(), "product_library");
}

function runProductPython(args: string[]): Promise<{ success: boolean; stdout: string; stderr: string; error?: string }> {
  const appRoot = getAppRoot();
  const handlerModule = "product_library.product_handler";
  const handlerFile = path.join(appRoot, "product_library", "product_handler.py");

  if (!fs.existsSync(handlerFile)) {
    return Promise.resolve({ success: false, stdout: "", stderr: "", error: `Product handler not found: ${handlerFile}` });
  }

  return new Promise((resolve) => {
    const proc = spawn(getPythonCommand(), ["-m", handlerModule, ...args], {
      cwd: appRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONPATH: [appRoot, process.env.PYTHONPATH || ""].filter(Boolean).join(path.delimiter)
      }
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); console.warn("[product-lib]", chunk.toString().trim()); });
    proc.on("close", (code) => {
      resolve({ success: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), error: code === 0 ? undefined : (stderr.trim() || `Python exited with code ${code}`) });
    });
    proc.on("error", (err: Error) => resolve({ success: false, stdout: "", stderr: "", error: err.message }));
  });
}

ipcMain.handle("spp:product-library:get-all", async () => {
  const result = await runProductPython(["--action", "get-all"]);
  if (!result.success) return { success: false, error: result.error };
  try { return { success: true, products: JSON.parse(result.stdout) }; }
  catch (err) { return { success: false, error: `Invalid JSON: ${(err as Error).message}` }; }
});

ipcMain.handle("spp:product-library:save-one", async (_event, product: unknown) => {
  const tmpPath = path.join(os.tmpdir(), `spp2_product_save_${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(product), "utf-8");
    const result = await runProductPython(["--action", "save-one", "--input", tmpPath]);
    return result.success ? { success: true } : { success: false, error: result.error };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

ipcMain.handle("spp:product-library:upload-mask", async (_event, productId: string, maskDataBase64: string, fileName: string) => {
  const safeExt = (path.extname(String(fileName || ".png")).toLowerCase() || ".png").replace(/[^.a-z0-9]/g, "").slice(0, 5) || ".png";
  const tmpPath = path.join(os.tmpdir(), `spp2_mask_${Date.now()}${safeExt}`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(String(maskDataBase64), "base64"));
    const result = await runProductPython(["--action", "upload-mask", "--product-id", String(productId), "--mask-file", tmpPath, "--file-name", String(fileName || "mask.png")]);
    if (!result.success) return { success: false, error: result.error };
    try { const output = JSON.parse(result.stdout); return { success: true, maskPath: String(output.path || "") }; }
    catch { return { success: false, error: "Invalid response from mask handler" }; }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

ipcMain.handle("spp:product-library:reload-one", async (_event, productId: string) => {
  const result = await runProductPython(["--action", "reload-one", "--product-id", String(productId)]);
  if (!result.success) return { success: false, error: result.error };
  try { return { success: true, product: JSON.parse(result.stdout) }; }
  catch (err) { return { success: false, error: `Invalid JSON: ${(err as Error).message}` }; }
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

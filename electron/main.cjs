const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
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

function runLibreOfficeConversion(sofficePath, inputPath, outDir) {
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

function getProductLibraryDir() {
  return path.join(getAppRoot(), "product_library");
}

/**
 * Run product_library.product_handler as a Python module with the given CLI arguments.
 * Uses `python -m product_library.product_handler` so that relative imports in
 * pl_storage.py (from .pl_models import Product) resolve correctly.
 * cwd and PYTHONPATH are set to the app root.
 */
function runProductPython(args) {
  const appRoot = getAppRoot();
  const handlerModule = "product_library.product_handler";
  const handlerFile = path.join(appRoot, "product_library", "product_handler.py");

  if (!fs.existsSync(handlerFile)) {
    return Promise.resolve({
      success: false,
      error: `Product handler not found: ${handlerFile}`
    });
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

/** Load all products from the library JSON and return them as an array. */
ipcMain.handle("spp:product-library:get-all", async () => {
  const result = await runProductPython(["--action", "get-all"]);
  if (!result.success) {
    return { success: false, error: result.error || "Failed to load products" };
  }
  try {
    const products = JSON.parse(result.stdout);
    return { success: true, products };
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
    return { success: true, product };
  } catch (err) {
    return { success: false, error: `Invalid JSON from reload handler: ${err.message}` };
  }
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
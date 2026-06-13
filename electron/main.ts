import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;
const diagnosticsEnabled = isDev || process.env.NODE_ENV !== "production";

function getAppRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app");
  }
  return path.join(__dirname, "..");
}

function getPrintPreviewEngineDir(): string {
  return path.join(getAppRoot(), "print.preview.engine");
}

function getImageEngineDir(): string {
  return path.join(getAppRoot(), "image.editor.engine");
}

function getPythonCommand(): string {
  return process.platform === "win32" ? "python" : "python3";
}

// ─── Image Editor IPC ─────────────────────────────────────────────────────────

function runBufferedCommand(command: string, args: string[], timeoutMs = 12000): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, stdout, stderr: stderr || "Command timed out" });
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, stdout, stderr });
    });
    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({ success: false, stdout, stderr: err.message });
    });
  });
}

function cleanFontFamilies(values: unknown): string[] {
  const seen = new Set<string>();
  const families: string[] = [];
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

async function listWindowsFontFamilies(): Promise<string[]> {
  const script = [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "Add-Type -AssemblyName System.Drawing",
    "$fonts = New-Object System.Drawing.Text.InstalledFontCollection",
    "$fonts.Families | ForEach-Object { $_.Name } | Sort-Object -Unique | ConvertTo-Json -Compress"
  ].join("; ");
  const result = await runBufferedCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
  if (!result.success || !result.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout.trim()) as unknown;
    return cleanFontFamilies(Array.isArray(parsed) ? parsed : [parsed]);
  } catch {
    return cleanFontFamilies(result.stdout.split(/\r?\n/));
  }
}

async function listUnixFontFamilies(): Promise<string[]> {
  const result = await runBufferedCommand("fc-list", [":", "family"], 12000);
  if (!result.success || !result.stdout.trim()) return [];
  const names: string[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    for (const name of line.split(",")) names.push(name.trim());
  }
  return cleanFontFamilies(names);
}

async function listMacFontFamilies(): Promise<string[]> {
  const result = await runBufferedCommand("system_profiler", ["SPFontsDataType", "-json"], 20000);
  if (!result.success || !result.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout) as { SPFontsDataType?: Array<{ _name?: string; family?: string; fullname?: string }> };
    const items = Array.isArray(parsed?.SPFontsDataType) ? parsed.SPFontsDataType : [];
    return cleanFontFamilies(items.map((item) => item?._name || item?.family || item?.fullname));
  } catch {
    return [];
  }
}

async function listSystemFontFamilies(): Promise<string[]> {
  if (process.platform === "win32") return listWindowsFontFamilies();
  if (process.platform === "darwin") return listMacFontFamilies();
  return listUnixFontFamilies();
}

/**
 * Write a data URL to a temp file and return the file path.
 * Used to give the Python editor a real file to open.
 */
ipcMain.handle("spp:write-temp-image", async (_event, dataUrl: string, ext: string): Promise<string> => {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  const tmpPath = path.join(os.tmpdir(), `spp_edit_input_${Date.now()}.${ext}`);
  if (diagnosticsEnabled) console.debug("[spp diagnostics] write-temp-image:start", { ext, base64Length: base64.length, tmpPath });
  fs.writeFileSync(tmpPath, Buffer.from(base64, "base64"));
  if (diagnosticsEnabled) console.debug("[spp diagnostics] write-temp-image:end", { tmpPath });
  return tmpPath;
});

ipcMain.handle("spp:get-memory-usage", async (): Promise<NodeJS.MemoryUsage> => process.memoryUsage());

ipcMain.handle("spp:list-system-fonts", async (): Promise<string[]> => listSystemFontFamilies());

/**
 * Read a file from disk and return it as a base64 string.
 * Used to bring the edited image back into the renderer.
 */
ipcMain.handle("spp:read-file-base64", async (_event, filePath: string): Promise<string> => {
  const buf = fs.readFileSync(filePath);
  return buf.toString("base64");
});

function getPsdImportBaseDir(): string {
  return path.join(app.getPath("userData"), "temp", "psd-import");
}

function cleanupDirSafe(dirPath: string): void {
  try {
    if (dirPath && fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.warn("[psd-import] cleanup failed", err instanceof Error ? err.message : String(err));
  }
}

function parsePsdManifest(stdout: string): unknown {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) throw new Error("PSD importer returned no manifest.");
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines[lines.length - 1] ?? "{}");
}

function runPsdImport(scriptPath: string, inputPath: string, outputDir: string): Promise<{ success: boolean; stdout: string; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(getPythonCommand(), [scriptPath, "--input", inputPath, "--output-dir", outputDir], {
      cwd: getImageEngineDir(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        SPP2_LOGS_DIR: path.join(app.getPath("userData"), "logs"),
        SPP2_USER_DATA_DIR: app.getPath("userData"),
        PYTHONPATH: [getImageEngineDir(), process.env.PYTHONPATH || ""].filter(Boolean).join(path.delimiter)
      }
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); console.warn("[psd-import]", chunk.toString().trim()); });
    proc.on("close", (code) => resolve({ success: code === 0, stdout, stderr, error: code === 0 ? undefined : stderr || `Python exited with code ${code}` }));
    proc.on("error", (err: Error) => resolve({ success: false, stdout, stderr, error: err.message }));
  });
}

ipcMain.handle("spp:choose-psd-file", async (): Promise<{ success: boolean; filePath?: string; fileSize?: number; error?: string }> => {
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

ipcMain.handle("spp:import-psd", async (_event, filePath: string): Promise<{ success: boolean; manifest?: unknown; error?: string }> => {
  let outputDir = "";
  try {
    if (typeof filePath !== "string" || filePath.length === 0 || !fs.existsSync(filePath)) {
      return { success: false, error: `PSD file not found: ${filePath || "missing"}` };
    }
    const lower = filePath.toLowerCase();
    if (!lower.endsWith(".psd") && !lower.endsWith(".psb")) {
      return { success: false, error: "Only PSD and PSB files are supported." };
    }
    const scriptPath = path.join(getImageEngineDir(), "psd_import_service.py");
    const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    outputDir = path.join(getPsdImportBaseDir(), jobId);
    fs.mkdirSync(outputDir, { recursive: true });
    const stat = fs.statSync(filePath);
    const result = await runPsdImport(scriptPath, filePath, outputDir);
    let manifest = parsePsdManifest(result.stdout) as Record<string, unknown>;
    manifest = { ...manifest, sourcePath: filePath, outputDir, fileSize: stat.size };
    if (!result.success && (!Array.isArray(manifest.layers) || manifest.layers.length === 0)) {
      cleanupDirSafe(outputDir);
      return { success: false, manifest, error: String(manifest.error || result.error || "PSD import failed.") };
    }
    return { success: true, manifest };
  } catch (err) {
    cleanupDirSafe(outputDir);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
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

// Pick a destination for a project file (Save As). Returns the chosen path only;
// the renderer writes via spp:write-project-file so metadata stays consistent.
ipcMain.handle("spp:save-project-dialog", async (_event, suggestedName = "project.spp2"): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> => {
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
ipcMain.handle("spp:write-project-file", async (_event, filePath: string, content: string): Promise<{ success: boolean; error?: string }> => {
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
ipcMain.handle("spp:cache-asset-file", async (_event, base64: string, fileName: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
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

function getLibreOfficeCandidates(): string[] {
  const configured = getConfiguredLibreOfficePath();
  if (process.platform === "win32") {
    return [
      configured,
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
      "soffice.exe"
    ].filter(Boolean) as string[];
  }
  if (process.platform === "darwin") {
    return [configured, "/Applications/LibreOffice.app/Contents/MacOS/soffice", "soffice"].filter(Boolean) as string[];
  }
  return [configured, "libreoffice", "soffice"].filter(Boolean) as string[];
}

function getPdfStudioSettingsPath(): string {
  return path.join(app.getPath("userData"), "pdf-studio-settings.json");
}

function getConfiguredLibreOfficePath(): string | undefined {
  try {
    const settingsPath = getPdfStudioSettingsPath();
    if (!fs.existsSync(settingsPath)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as { libreOfficePath?: unknown };
    return typeof parsed.libreOfficePath === "string" && parsed.libreOfficePath.length > 0
      ? parsed.libreOfficePath
      : undefined;
  } catch {
    return undefined;
  }
}

function setConfiguredLibreOfficePath(sofficePath: string): void {
  const settingsPath = getPdfStudioSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({ libreOfficePath: sofficePath }, null, 2), "utf-8");
}

function runLibreOfficeProbe(sofficePath: string): Promise<{ success: boolean; error?: string }> {
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

async function findLibreOffice(): Promise<{ found: boolean; path?: string; error?: string }> {
  let lastError = "LibreOffice לא נמצא.";
  for (const candidate of getLibreOfficeCandidates()) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const result = await runLibreOfficeProbe(candidate);
    if (result.success) return { found: true, path: candidate };
    lastError = result.error || lastError;
  }
  return { found: false, error: lastError };
}

function runLibreOfficeConversion(sofficePath: string, inputPath: string, outDir: string): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string; code?: number | null }> {
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

ipcMain.handle("spp:check-libreoffice", async (): Promise<{ found: boolean; path?: string; error?: string }> => findLibreOffice());

ipcMain.handle("spp:choose-libreoffice-path", async (): Promise<{ success: boolean; path?: string; error?: string }> => {
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

// Opens the bundled HTML user guide in the OS default browser. window.open(file://) in the
// renderer is denied by setWindowOpenHandler, so route through shell.openPath instead.
ipcMain.handle("spp:open-user-guide", async (): Promise<{ error?: string }> => {
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

function productMaskMimeType(maskPath: string): string {
  const lower = maskPath.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

function enrichProductMaskData(product: any): any {
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

ipcMain.handle("spp:product-library:get-all", async () => {
  const result = await runProductPython(["--action", "get-all"]);
  if (!result.success) return { success: false, error: result.error };
  try {
    const products = JSON.parse(result.stdout);
    return { success: true, products: Array.isArray(products) ? products.map(enrichProductMaskData) : products };
  }
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
  try {
    const product = JSON.parse(result.stdout);
    return { success: true, product: product ? enrichProductMaskData(product) : product };
  }
  catch (err) { return { success: false, error: `Invalid JSON: ${(err as Error).message}` }; }
});

// ─── Main window ──────────────────────────────────────────────────────────────

const modeWindowSnapshots = new Map<string, unknown>();
const MODE_WINDOW_TITLES: Record<string, string> = {
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

function sanitizeModeWindowMode(mode: unknown): string {
  const value = String(mode ?? "").trim().toLowerCase();
  return /^[a-z0-9_-]+$/.test(value) ? value : "";
}

function getModeWindowTitle(mode: string, requestedTitle: unknown): string {
  if (typeof requestedTitle === "string" && requestedTitle.trim().length > 0) {
    return requestedTitle.trim();
  }
  return MODE_WINDOW_TITLES[mode] ?? `SPP2-${mode.replace(/-/g, " ").toUpperCase()}`;
}

function createSnapshotId(): string {
  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAppIndexFileUrl(targetUrl: string): boolean {
  try {
    return targetUrl === pathToFileURL(path.join(getAppRoot(), "dist", "index.html")).href;
  } catch {
    return false;
  }
}

function installFileDropNavigationGuard(win: BrowserWindow): void {
  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl.startsWith("file://") && !isAppIndexFileUrl(targetUrl)) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("file://") && !isAppIndexFileUrl(url)) {
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

interface ModeWindowPayload {
  mode?: unknown;
  title?: unknown;
  snapshot?: unknown;
}

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

  installFileDropNavigationGuard(win);

  // Don't let the window close out from under unsaved work. Ask the renderer
  // first; it shows the "unsaved changes" prompt and calls confirmClose() when
  // the user decides. confirmClose() destroys the window, bypassing this guard
  // and the beforeunload handler. Only guard once the renderer is loaded and
  // listening; before that, allow a normal close so the X never appears stuck.
  let closeGuardActive = false;
  win.webContents.once("did-finish-load", () => { closeGuardActive = true; });
  win.on("close", (event) => {
    if (!closeGuardActive || win.webContents.isDestroyed()) return;
    event.preventDefault();
    win.webContents.send("spp:close-requested");
  });

  if (isDev) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    await win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// The renderer calls this once the user has resolved any unsaved-changes prompt.
// destroy() force-closes without re-triggering the close guard or beforeunload.
ipcMain.on("spp:confirm-close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win !== null) {
    win.destroy();
  }
});

async function createModeWindow(payload: ModeWindowPayload = {}): Promise<void> {
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
  if (isDev) {
    await win.loadURL(`${process.env.VITE_DEV_SERVER_URL as string}#${hash}`);
  } else {
    await win.loadFile(path.join(__dirname, "../dist/index.html"), { hash });
  }
  win.webContents.on("did-finish-load", () => {
    win.setTitle(title);
  });
}

ipcMain.handle("spp:open-mode-window", async (_event, payload: ModeWindowPayload): Promise<{ success: boolean; error?: string }> => {
  try {
    await createModeWindow(payload);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("spp:get-mode-window-snapshot", async (_event, snapshotId: string): Promise<{ success: boolean; snapshot?: unknown; error?: string }> => {
  if (!modeWindowSnapshots.has(snapshotId)) {
    return { success: false, error: "Snapshot not found" };
  }
  return { success: true, snapshot: modeWindowSnapshots.get(snapshotId) };
});

ipcMain.handle("spp:open-pdf-studio-window", async (): Promise<{ success: boolean; error?: string }> => {
  try {
    await createModeWindow({ mode: "pdf-studio", title: MODE_WINDOW_TITLES["pdf-studio"] });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

interface SmartPrepareSaveItem {
  fileName?: unknown;
  sourcePath?: unknown;
  dataUrl?: unknown;
}

interface SmartPrepareSavePayload {
  outputDir?: unknown;
  items?: unknown;
  report?: unknown;
}

function smartPrepareDefaultOutputDir(items: SmartPrepareSaveItem[]): string {
  const firstSource = items.map((item) => String(item.sourcePath || "")).find((value) => value.length > 0 && fs.existsSync(value));
  const baseDir = firstSource ? path.dirname(firstSource) : app.getPath("pictures");
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(baseDir, `SPP2_Smart_Print_Prepare_${stamp}`);
}

function safePreparedBaseName(fileName: unknown): string {
  const raw = path.basename(String(fileName || "image"), path.extname(String(fileName || "")));
  return (raw || "image").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 120);
}

function uniquePreparedOutputPath(outputDir: string, fileName: unknown): string {
  const base = safePreparedBaseName(fileName);
  let candidate = path.join(outputDir, `${base}_prepared.jpg`);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(outputDir, `${base}_prepared_${index}.jpg`);
    index += 1;
  }
  return candidate;
}

function dataUrlToBuffer(dataUrl: unknown): Buffer {
  const value = String(dataUrl || "");
  const match = /^data:[^;]+;base64,(.+)$/i.exec(value);
  if (!match) throw new Error("Invalid image data URL.");
  return Buffer.from(match[1], "base64");
}

function smartPrepareReportHtml(report: any, outputDir: string): string {
  const summary = report?.summary || {};
  const rows = Array.isArray(report?.results) ? report.results : [];
  const tr = rows.map((item: any) => `
    <tr>
      <td>${escapeHtml(item.fileName || "")}</td>
      <td>${Math.round(Number(item.confidence || 0) * 100)}%</td>
      <td>${escapeHtml((item.warnings || []).map((warning: any) => warning.message || warning.type).join(", "))}</td>
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] || char));
}

ipcMain.handle("spp:smart-print-prepare:choose-output-dir", async (_event, defaultPath?: string): Promise<{ success: boolean; folderPath?: string; canceled?: boolean; error?: string }> => {
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

ipcMain.handle("spp:smart-print-prepare:save-batch", async (_event, payload: SmartPrepareSavePayload): Promise<{ success: boolean; outputDir?: string; saved?: string[]; error?: string }> => {
  try {
    const items = Array.isArray(payload?.items) ? payload.items as SmartPrepareSaveItem[] : [];
    if (items.length === 0) return { success: false, error: "No prepared images to save." };
    const outputDir = String(payload?.outputDir || smartPrepareDefaultOutputDir(items));
    const imagesDir = path.join(outputDir, "images");
    fs.mkdirSync(imagesDir, { recursive: true });
    const saved: string[] = [];
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
ipcMain.handle("spp:export-pages-to-folder", async (_event, payload: { documentName?: string; items?: Array<{ dataUrl: string; fileName: string }> }): Promise<{ success: boolean; folderPath?: string; count?: number; canceled?: boolean; error?: string }> => {
  try {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (items.length === 0) return { success: false, error: "אין עמודים לייצוא." };
    const safeDocName = (String(payload?.documentName || "SPP2_Export").replace(/[<>:"/\\|?* -]/g, "_").slice(0, 120)) || "SPP2_Export";
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

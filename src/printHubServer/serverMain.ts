// Print Hub Server — dedicated Electron tray app (architecture decision #2).
//
// Runs on the print-station machine independently of the SPP2 editor: shows a tray icon, watches
// ONE hub Incoming folder (synced with the management window), drives jobs through the engine,
// prints locally via the Windows spooler, pops a notification on each new job, writes a full
// server.log, and hosts an independent management window.
// Bundled to electron/printHubServer.bundle.cjs (scripts/build-print-hub-server.cjs).

import { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { ensureHubLayout, hubStateDir, listReadyJobIds } from "@/core/printHub/atomicIo";
import { createSpoolerAdapter, type PrintImageOptions } from "@/core/printHub/adapters/spoolerAdapter";
import { loadProfiles, resolveTargetFromProfiles, saveProfiles } from "@/core/printHub/printerProfiles";
import { loadStations, requiresApprovalForJob, saveStations } from "@/core/printHub/stations";
import { isDuplicateFingerprint } from "@/core/printHub/idempotency";
import { appendProductionLog, jobPrintCount, readProductionLog } from "@/core/printHub/productionLog";
import { purgeOldJobs } from "@/core/printHub/retention";
import { consumeMedia, loadMedia, saveMedia } from "@/core/printHub/mediaInventory";
import type { MediaItem, Station } from "@/types/printHub";
import { jobAction, listQueue, type QueueActionName } from "@/core/printHub/queueAdmin";
import { getPrinterPapers } from "@/core/printHub/printerCaps";
import { loadHubConfig, saveHubConfig, type HubConfig } from "@/core/printHub/hubConfig";
import { processJob, type ServerEngineDeps } from "@/core/printHub/serverEngine";
import { startLanServer, type LanServerHandle } from "./lanServer";
import { initCloudStatusSync, setCloudSession, upsertJobStatus } from "./cloudStatusSync";
import type { PrintJobManifest } from "@/types/printHub";

const POLL_INTERVAL_MS = 4000; // poll — fs.watch is unreliable on SMB shares

// ── Single source of truth for the hub root (synced with the management window) ──
let currentHubRoot = "";
let serverName = "";
let deps: ServerEngineDeps;
const seenJobs = new Set<string>();
let paused = false;
let processing = false;
let incomingWatcher: fs.FSWatcher | null = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;
let lanServer: LanServerHandle | null = null;

// fs.watch is only a fast nudge to run tick() immediately on a new file; the 4s poll remains the
// primary, reliable mechanism (fs.watch is unreliable on SMB network shares).
function setupIncomingWatcher(): void {
  try { incomingWatcher?.close(); } catch { /* ignore */ }
  incomingWatcher = null;
  try {
    const incoming = hubStateDir(currentHubRoot, "incoming");
    fs.mkdirSync(incoming, { recursive: true });
    incomingWatcher = fs.watch(incoming, { persistent: true }, () => {
      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => void tick(), 300);
    });
  } catch {
    // fs.watch failed (e.g. SMB) — polling still covers it.
  }
}

function serverConfigPath(): string {
  return path.join(app.getPath("userData"), "print-hub-server.json");
}
function loadPersistedHubRoot(): string | null {
  try {
    const c = JSON.parse(fs.readFileSync(serverConfigPath(), "utf-8")) as { hubRoot?: string };
    return typeof c.hubRoot === "string" && c.hubRoot.length > 0 ? c.hubRoot : null;
  } catch { return null; }
}
function persistHubRoot(hubRoot: string): void {
  try {
    fs.mkdirSync(path.dirname(serverConfigPath()), { recursive: true });
    fs.writeFileSync(serverConfigPath(), JSON.stringify({ hubRoot }, null, 2), "utf-8");
  } catch { /* non-fatal */ }
}
function resolveHubRoot(): string {
  const fromArg = process.argv.find((a) => a.startsWith("--hub="));
  if (fromArg) return fromArg.slice("--hub=".length);
  if (process.env.SPP_HUB_ROOT) return process.env.SPP_HUB_ROOT;
  const persisted = loadPersistedHubRoot();
  if (persisted) return persisted;
  return process.platform === "win32" ? "C:\\SPP_PrintHub" : path.join(os.homedir(), "SPP_PrintHub");
}

function serverLog(message: string): void {
  const line = `[${new Date().toLocaleString("he-IL")}] ${message}`;
  try {
    const dir = path.join(currentHubRoot, "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "server.log"), `${line}\n`, "utf-8");
  } catch { /* non-fatal */ }
  // eslint-disable-next-line no-console
  console.log(`[PrintHub] ${message}`);
}

function createElectronPrintImage(): (filePath: string, options: PrintImageOptions) => Promise<void> {
  return (filePath, options) =>
    new Promise<void>((resolve, reject) => {
      // Load the image via a temp HTML FILE (file:// origin) — a data: URL is blocked from loading
      // local file:// images, which produced blank prints. We also WAIT for the image to finish
      // loading/decoding before printing, otherwise the page prints empty.
      const win = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
      const tmpHtml = path.join(os.tmpdir(), `spp_print_${Date.now()}_${Math.random().toString(36).slice(2)}.html`);
      const imgUrl = pathToFileURL(filePath).href;
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;padding:0;width:100%;height:100%}
        img{width:100%;height:100%;object-fit:cover;display:block}
      </style></head><body><img id="spp-print-img" src="${imgUrl}"></body></html>`;

      const cleanup = (): void => {
        try { fs.unlinkSync(tmpHtml); } catch { /* ignore */ }
        if (!win.isDestroyed()) win.close();
      };

      try {
        fs.writeFileSync(tmpHtml, html, "utf-8");
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      win.webContents.once("did-finish-load", () => {
        void win.webContents
          .executeJavaScript(`new Promise(function(res){
            var i=document.getElementById('spp-print-img');
            if(!i){res(false);return;}
            if(i.complete && i.naturalWidth>0){res(true);return;}
            i.onload=function(){res(true)}; i.onerror=function(){res(false)};
          })`)
          .then((loaded) => {
            if (loaded !== true) {
              cleanup();
              reject(new Error(`image did not load: ${filePath}`));
              return;
            }
            win.webContents.print(
              {
                silent: true,
                printBackground: true,
                deviceName: options.printerName,
                margins: { marginType: "none" },
                pageSize: { width: options.pageWidthMicrons, height: options.pageHeightMicrons }
              },
              (success, failureReason) => {
                cleanup();
                if (success) resolve();
                else reject(new Error(failureReason || "print failed"));
              }
            );
          })
          .catch((err) => { cleanup(); reject(err instanceof Error ? err : new Error(String(err))); });
      });

      win.loadFile(tmpHtml).catch((err) => { cleanup(); reject(err instanceof Error ? err : new Error(String(err))); });
    });
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  try {
    new Notification({ title, body }).show();
  } catch { /* non-fatal */ }
}

function jobNotificationBody(manifest: PrintJobManifest): string {
  const o = manifest.requestedOutput;
  const who = manifest.customer.name ? `${manifest.customer.name} · ` : "";
  const from = manifest.sourceComputer ? `מ-${manifest.sourceComputer} · ` : "";
  return `${who}${from}${o.size} · ${manifest.files.length} תמונות`;
}

function buildDeps(): ServerEngineDeps {
  const adapter = createSpoolerAdapter(createElectronPrintImage());
  return {
    hubRoot: currentHubRoot,
    serverName,
    adapter,
    resolveTarget: (manifest) => resolveTargetFromProfiles(loadProfiles(currentHubRoot), manifest),
    requiresApproval: (manifest) => requiresApprovalForJob(loadStations(currentHubRoot), manifest),
    isDuplicate: (manifest) => isDuplicateFingerprint(currentHubRoot, manifest.jobFingerprint),
    onCompleted: (manifest) => {
      appendProductionLog(currentHubRoot, manifest);
      const target = resolveTargetFromProfiles(loadProfiles(currentHubRoot), manifest);
      if (target) consumeMedia(currentHubRoot, target.preset.id, jobPrintCount(manifest));
      serverLog(`✓ עבודה ${manifest.jobId} הודפסה בהצלחה (${jobPrintCount(manifest)} תמונות)`);
      void upsertJobStatus(serverName, "done", manifest); // single-writer cloud status (Phase 2)
    },
    onJobState: (jobId, state, manifest) => {
      const last = manifest.statusHistory[manifest.statusHistory.length - 1];
      const note = last?.note ? ` — ${last.note}` : "";
      serverLog(`עבודה ${jobId}: ${state}${note}`);
      if (state === "printing") {
        const t = resolveTargetFromProfiles(loadProfiles(currentHubRoot), manifest);
        serverLog(`  → שולח להדפסה במדפסת "${t?.profile.windowsPrinterName ?? "?"}" · פריסט ${t?.preset.name ?? "?"}`);
      }
      if (state === "waiting_approval") notify("עבודה ממתינה לאישור מנהל", jobNotificationBody(manifest));
      // Mirror every transition to the cloud (best-effort; the Hub is the single source of truth).
      void upsertJobStatus(serverName, state, manifest);
    }
  };
}

async function tick(): Promise<void> {
  if (paused || processing) return;
  processing = true;
  try {
    const ready = listReadyJobIds(currentHubRoot);
    for (const jobId of ready) {
      if (!seenJobs.has(jobId)) {
        seenJobs.add(jobId);
        serverLog(`📥 עבודה חדשה נקלטה בתור: ${jobId}`);
        notify("עבודת הדפסה חדשה בתור", jobId);
      }
      if (paused) break;
      await processJob(deps, jobId);
    }
  } catch (err) {
    serverLog(`⚠ שגיאה בלולאת העיבוד: ${errMsg(err)}`);
  } finally {
    processing = false;
  }
}

function assetPath(file: string): string {
  return path.join(__dirname, "assets", file);
}

// Standalone tray icon from the packaged icon pack, with a generated-bitmap fallback.
function trayIcon(): Electron.NativeImage {
  const png = assetPath("spp2_standalone_32x32.png");
  if (fs.existsSync(png)) {
    const img = nativeImage.createFromPath(png);
    if (!img.isEmpty()) return img;
  }
  const ico = assetPath("spp2_standalone.ico");
  if (fs.existsSync(ico)) {
    const img = nativeImage.createFromPath(ico);
    if (!img.isEmpty()) return img;
  }
  // Fallback: generated 32×32 printer glyph.
  const size = 32;
  const buf = Buffer.alloc(size * size * 4, 0);
  const set = (x: number, y: number, b: number, g: number, r: number, a: number): void => {
    const i = (y * size + x) * 4;
    buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a;
  };
  for (let y = 10; y <= 26; y += 1) for (let x = 5; x <= 26; x += 1) set(x, y, 235, 99, 37, 255);
  for (let y = 6; y < 11; y += 1) for (let x = 8; x <= 23; x += 1) set(x, y, 180, 70, 25, 255);
  for (let y = 16; y <= 20; y += 1) for (let x = 9; x <= 22; x += 1) set(x, y, 255, 255, 255, 255);
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

let mgmtWin: BrowserWindow | null = null;
function distIndexHtml(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "dist", "index.html")
    : path.join(__dirname, "..", "dist", "index.html");
}
function openManagementWindow(): void {
  if (mgmtWin && !mgmtWin.isDestroyed()) {
    if (mgmtWin.isMinimized()) mgmtWin.restore();
    mgmtWin.show();
    mgmtWin.focus();
    return;
  }
  mgmtWin = new BrowserWindow({
    width: 760,
    height: 860,
    title: "SPP2 Print Hub",
    backgroundColor: "#0f172a",
    icon: assetPath("spp2_standalone.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  void mgmtWin.loadFile(distIndexHtml(), { hash: "print-hub" });
  mgmtWin.on("closed", () => { mgmtWin = null; });
}

// Autostart — single source of truth = HKCU Run\SPP2PrintHub (shared with the installer, no
// duplicate setLoginItemSettings). The tray toggle and the installer write the same key.
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_NAME = "SPP2PrintHub";
let autostartOn = false;
let rebuildTrayMenu: () => void = () => { /* assigned in start() */ };

function runReg(args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    if (process.platform !== "win32") { resolve({ ok: false, stdout: "" }); return; }
    const proc = spawn("reg", args, { windowsHide: true });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString("utf8"); });
    proc.on("close", (code) => resolve({ ok: code === 0, stdout: out }));
    proc.on("error", () => resolve({ ok: false, stdout: "" }));
  });
}
async function refreshAutostart(): Promise<void> {
  const res = await runReg(["query", RUN_KEY, "/v", RUN_NAME]);
  autostartOn = res.ok && res.stdout.includes(RUN_NAME);
}
async function setAutostart(enabled: boolean): Promise<void> {
  if (enabled) {
    await runReg(["add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", `"${process.execPath}" --print-hub-server`, "/f"]);
  } else {
    await runReg(["delete", RUN_KEY, "/v", RUN_NAME, "/f"]);
  }
  autostartOn = enabled;
  rebuildTrayMenu();
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function readRetentionDays(hubRoot: string): number {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(hubRoot, "config", "hub.json"), "utf-8")) as { retentionDays?: number };
    return typeof cfg.retentionDays === "number" ? cfg.retentionDays : 14;
  } catch {
    return 14;
  }
}

function readJsonFile<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

function exportSettingsSnapshot(hubRoot: string, appSettings: unknown): Record<string, unknown> {
  ensureHubLayout(hubRoot);
  const configDir = path.join(hubRoot, "config");
  const printers = readJsonFile<{ profiles?: unknown }>(path.join(configDir, "printers.json"), {});
  const stations = readJsonFile<{ stations?: unknown }>(path.join(configDir, "stations.json"), {});
  const media = readJsonFile<{ items?: unknown }>(path.join(configDir, "media.json"), {});
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    sourceComputer: serverName || os.hostname(),
    hubRoot,
    appSettings: appSettings && typeof appSettings === "object" ? appSettings : null,
    hubConfig: loadHubConfig(hubRoot),
    profiles: Array.isArray(printers.profiles) ? printers.profiles : null,
    stations: Array.isArray(stations.stations) ? stations.stations : [],
    media: Array.isArray(media.items) ? media.items : []
  };
}

function importSettingsSnapshot(hubRoot: string, snapshot: unknown): Record<string, unknown> {
  if (!hubRoot) throw new Error("missing hubRoot");
  if (!snapshot || typeof snapshot !== "object") throw new Error("invalid snapshot");
  const s = snapshot as Record<string, unknown>;
  ensureHubLayout(hubRoot);
  const configDir = path.join(hubRoot, "config");
  if (s.hubConfig && typeof s.hubConfig === "object") saveHubConfig(hubRoot, s.hubConfig as Partial<HubConfig>);
  if (Array.isArray(s.profiles)) writeJsonAtomic(path.join(configDir, "printers.json"), { profiles: s.profiles });
  if (Array.isArray(s.stations)) writeJsonAtomic(path.join(configDir, "stations.json"), { stations: s.stations });
  if (Array.isArray(s.media)) writeJsonAtomic(path.join(configDir, "media.json"), { items: s.media });
  deps = buildDeps();
  return exportSettingsSnapshot(hubRoot, s.appSettings ?? null);
}

// Switches the hub root the engine + window operate on, and re-syncs everything.
function setHubRoot(hubRoot: string): void {
  if (!hubRoot || hubRoot === currentHubRoot) return;
  currentHubRoot = hubRoot;
  fs.mkdirSync(currentHubRoot, { recursive: true });
  ensureHubLayout(currentHubRoot);
  persistHubRoot(currentHubRoot);
  deps = buildDeps();
  seenJobs.clear();
  setupIncomingWatcher();
  serverLog(`📂 תיקיית התור עודכנה ל: ${currentHubRoot}`);
}

// IPC the management window (PrintHubPanel) needs — the tray process serves its own handlers.
// All handlers default to the server's single current hub root.
function registerManagementIpc(): void {
  const root = (h: unknown): string => (typeof h === "string" && h.length > 0 ? h : currentHubRoot);

  ipcMain.handle("spp:printHub:station-info", async () => ({ success: true, computerName: serverName }));
  ipcMain.handle("spp:printHub:get-server-hub", async () => ({ success: true, hubRoot: currentHubRoot, serverName }));
  ipcMain.handle("spp:printHub:lan-info", async () => ({
    success: true,
    addresses: lanServer?.addresses() ?? [],
    port: lanServer?.port ?? 0,
    token: lanServer?.token() ?? ""
  }));
  ipcMain.handle("spp:printHub:set-cloud-session", async (_e, payload) => {
    try { return setCloudSession(payload); }
    catch (err) { return { ok: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:set-server-hub", async (_e, hubRoot) => {
    try { setHubRoot(String(hubRoot || "")); return { success: true, hubRoot: currentHubRoot }; }
    catch (err) { return { success: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:read-server-log", async (_e, hubRoot) => {
    try {
      const file = path.join(root(hubRoot), "logs", "server.log");
      if (!fs.existsSync(file)) return { success: true, lines: [] };
      const lines = fs.readFileSync(file, "utf-8").split("\n").filter((l) => l.trim()).slice(-300);
      return { success: true, lines };
    } catch (err) { return { success: false, lines: [], error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:list-queue", async (_e, hubRoot) => {
    try { return { success: true, jobs: listQueue(root(hubRoot)) }; }
    catch (err) { return { success: false, jobs: [], error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:job-action", async (_e, payload) => {
    try {
      const result = jobAction(root(payload?.hubRoot), String(payload?.jobId || ""), payload?.action as QueueActionName);
      if (result.success) { seenJobs.delete(String(payload?.jobId || "")); serverLog(`👤 פעולת מנהל: ${payload?.action} על ${payload?.jobId}`); }
      return result;
    } catch (err) { return { success: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:open-job-folder", async (_e, payload) => {
    try { const error = await shell.openPath(root(payload?.hubRoot)); return { success: !error, error: error || undefined }; }
    catch (err) { return { success: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:get-printers", async (e) => {
    try {
      const printers = await e.sender.getPrintersAsync();
      return { success: true, printers: printers.map((p) => {
        const info = p as { name: string; displayName?: string; status?: number; isDefault?: boolean };
        return { name: info.name, displayName: info.displayName || info.name, status: info.status ?? 0, isDefault: info.isDefault ?? false };
      }) };
    } catch (err) { return { success: false, printers: [], error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:load-profiles", async (_e, hubRoot) => {
    try {
      const file = path.join(root(hubRoot), "config", "printers.json");
      if (!fs.existsSync(file)) return { success: true, profiles: null };
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      return { success: true, profiles: Array.isArray(parsed.profiles) ? parsed.profiles : null };
    } catch (err) { return { success: false, profiles: null, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:save-profiles", async (_e, payload) => {
    try { saveProfiles(root(payload?.hubRoot), payload?.profiles ?? []); serverLog("⚙ פרופילי מדפסת נשמרו"); return { success: true }; }
    catch (err) { return { success: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:get-printer-papers", async (_e, printerName) => {
    try { return { success: true, papers: await getPrinterPapers(String(printerName || "")) }; }
    catch (err) { return { success: false, papers: [], error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:load-stations", async (_e, hubRoot) => {
    try { return { success: true, stations: loadStations(root(hubRoot)) }; }
    catch (err) { return { success: false, stations: null, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:save-stations", async (_e, payload) => {
    try { saveStations(root(payload?.hubRoot), (payload?.stations ?? []) as Station[]); return { success: true }; }
    catch (err) { return { success: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:load-media", async (_e, hubRoot) => {
    try { return { success: true, items: loadMedia(root(hubRoot)) }; }
    catch (err) { return { success: false, items: null, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:save-media", async (_e, payload) => {
    try { saveMedia(root(payload?.hubRoot), (payload?.items ?? []) as MediaItem[]); return { success: true }; }
    catch (err) { return { success: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:load-hub-config", async (_e, hubRoot) => {
    try { return { success: true, config: loadHubConfig(root(hubRoot)) }; }
    catch (err) { return { success: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:save-hub-config", async (_e, payload) => {
    try { return { success: true, config: saveHubConfig(root(payload?.hubRoot), payload?.config ?? {}) }; }
    catch (err) { return { success: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:export-settings", async (_e, payload) => {
    try { return { success: true, snapshot: exportSettingsSnapshot(root(payload?.hubRoot), payload?.appSettings ?? null) }; }
    catch (err) { return { success: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:import-settings", async (_e, payload) => {
    try { return { success: true, snapshot: importSettingsSnapshot(root(payload?.hubRoot), payload?.snapshot) }; }
    catch (err) { return { success: false, error: errMsg(err) }; }
  });
  ipcMain.handle("spp:printHub:read-production-log", async (_e, payload) => {
    try {
      const date = payload?.date ? new Date(`${String(payload.date)}T00:00:00`) : new Date();
      return { success: true, entries: readProductionLog(root(payload?.hubRoot), date) };
    } catch (err) { return { success: false, entries: [], error: errMsg(err) }; }
  });
  // Explorer context-menu belongs on SPP2 design stations — safe stubs here.
  ipcMain.handle("spp:printHub:install-context-menu", async () => ({ success: false, error: "פעולה זו זמינה מתוך SPP2 בתחנת העיצוב" }));
  ipcMain.handle("spp:printHub:uninstall-context-menu", async () => ({ success: false, error: "פעולה זו זמינה מתוך SPP2 בתחנת העיצוב" }));
}

async function start(): Promise<void> {
  serverName = os.hostname();
  currentHubRoot = resolveHubRoot();
  fs.mkdirSync(currentHubRoot, { recursive: true });
  ensureHubLayout(currentHubRoot);
  initCloudStatusSync(app.getPath("userData"), serverLog);
  registerManagementIpc();
  deps = buildDeps();
  await refreshAutostart();
  // Installer "Start with Windows" launches us once with this flag → enable autostart key.
  if (process.argv.includes("--enable-autostart")) await setAutostart(true);
  serverLog(`🚀 שרת ההדפסה עלה — ${serverName} — תיקיית תור: ${currentHubRoot}`);

  // LAN ingest server — lets design stations send jobs directly over the network (Phase 1).
  // Binds once for the process lifetime; ingest follows hub-root changes via the getHubRoot closure.
  lanServer = startLanServer({
    getHubRoot: () => currentHubRoot,
    getServerName: () => serverName,
    isPaused: () => paused,
    log: serverLog
  });
  serverLog(`🌐 LAN: ${lanServer.addresses().join(" / ") || `127.0.0.1:${lanServer.port}`} · קוד שיוך: ${lanServer.token()}`);

  const tray = new Tray(trayIcon());
  const rebuildMenu = (): void => {
    const lanLabel = lanServer ? (lanServer.addresses().join("  ") || `127.0.0.1:${lanServer.port}`) : "—";
    const lanToken = lanServer ? lanServer.token() : "";
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `SPP2 Print Hub — ${serverName}`, enabled: false },
        { label: currentHubRoot, enabled: false },
        { type: "separator" },
        { label: `🌐 כתובת LAN: ${lanLabel}`, enabled: false },
        { label: `🔑 קוד שיוך: ${lanToken}`, enabled: false },
        { label: "העתק כתובת + קוד", click: () => { const { clipboard } = require("electron"); clipboard.writeText(`${lanLabel}  ·  ${lanToken}`); } },
        { type: "separator" },
        { label: "פתח חלון ניהול", click: openManagementWindow },
        { label: paused ? "המשך עיבוד" : "השהה עיבוד", click: () => { paused = !paused; serverLog(paused ? "⏸ עיבוד הושהה" : "▶ עיבוד חודש"); rebuildMenu(); } },
        { label: "פתח תיקיית תור", click: () => void shell.openPath(currentHubRoot) },
        { type: "checkbox", label: "הפעל עם Windows", checked: autostartOn, click: (item) => void setAutostart(item.checked) },
        { type: "separator" },
        { label: "יציאה", click: () => app.quit() }
      ])
    );
    tray.setToolTip(`SPP2 Print Hub${paused ? " (מושהה)" : ""}`);
  };
  rebuildTrayMenu = rebuildMenu;
  rebuildMenu();
  tray.on("click", openManagementWindow);

  setupIncomingWatcher();              // immediate nudge on new files
  setInterval(() => void tick(), POLL_INTERVAL_MS); // primary reliable poll
  void tick();

  const purge = (): void => {
    try { purgeOldJobs(currentHubRoot, readRetentionDays(currentHubRoot)); } catch { /* non-fatal */ }
  };
  setInterval(purge, 60 * 60 * 1000);
  purge();
}

// Single-instance via a dedicated lockfile — does NOT use Electron's requestSingleInstanceLock,
// so the editor (which does use it) and the print server can run in parallel. Only a 2nd *server*
// instance is blocked (decision #3).
function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
}
function acquireServerLock(): boolean {
  const lockFile = path.join(app.getPath("userData"), "print-hub-server.lock");
  try {
    if (fs.existsSync(lockFile)) {
      const pid = parseInt(fs.readFileSync(lockFile, "utf-8").trim(), 10);
      if (Number.isFinite(pid) && isProcessAlive(pid)) return false; // another server already running
    }
    fs.writeFileSync(lockFile, String(process.pid), "utf-8");
    app.on("quit", () => { try { fs.unlinkSync(lockFile); } catch { /* ignore */ } });
    return true;
  } catch {
    return true; // if the lock check fails, proceed rather than block the print server
  }
}

app.whenReady().then(() => {
  if (!acquireServerLock()) { app.quit(); return; }
  void start();
});
app.on("window-all-closed", () => {
  // tray app — keep running with no windows
});

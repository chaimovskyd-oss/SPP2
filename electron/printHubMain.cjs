// Print Hub — main-process job publishing + local outbox (gaps G2, G10).
//
// Runtime CJS module required by main.cjs. Mirrors the atomic publish protocol of
// src/core/printHub/atomicIo.ts (which cannot be imported here — the main process has no "@/"
// alias and is not bundled). The renderer owns rendering + manifest building; this module only
// writes bytes atomically and manages the offline outbox.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

// Reads a Windows printer's real supported paper sizes from the driver (DeviceCapabilities).
// Best-effort: returns [] on non-Windows or any failure. Mirrors src/core/printHub/printerCaps.ts.
const PAPER_PS_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$code = 'using System;using System.Runtime.InteropServices;public class PaperCaps{[DllImport("winspool.drv",CharSet=CharSet.Unicode,SetLastError=true)]public static extern int DeviceCapabilities(string device,string port,int cap,IntPtr buf,IntPtr dm);}'
Add-Type -TypeDefinition $code | Out-Null
$name=$env:SPP_PRINTER
$count=[PaperCaps]::DeviceCapabilities($name,$null,16,[IntPtr]::Zero,[IntPtr]::Zero)
if($count -le 0){ '[]'; return }
$namesBuf=[Runtime.InteropServices.Marshal]::AllocHGlobal($count*64*2)
[PaperCaps]::DeviceCapabilities($name,$null,16,$namesBuf,[IntPtr]::Zero) | Out-Null
$sizesBuf=[Runtime.InteropServices.Marshal]::AllocHGlobal($count*8)
[PaperCaps]::DeviceCapabilities($name,$null,3,$sizesBuf,[IntPtr]::Zero) | Out-Null
$list=New-Object System.Collections.ArrayList
for($i=0;$i -lt $count;$i++){
  $p=[IntPtr]::Add($namesBuf,$i*64*2)
  $pn=([Runtime.InteropServices.Marshal]::PtrToStringUni($p,64)).Trim([char]0).Trim()
  $x=[Runtime.InteropServices.Marshal]::ReadInt32($sizesBuf,$i*8)
  $y=[Runtime.InteropServices.Marshal]::ReadInt32($sizesBuf,$i*8+4)
  [void]$list.Add([pscustomobject]@{name=$pn;widthMm=[math]::Round($x/10,1);heightMm=[math]::Round($y/10,1)})
}
[Runtime.InteropServices.Marshal]::FreeHGlobal($namesBuf)
[Runtime.InteropServices.Marshal]::FreeHGlobal($sizesBuf)
$list | ConvertTo-Json -Compress
`;

function getPrinterPapers(printerName) {
  if (process.platform !== "win32" || !printerName) return Promise.resolve([]);
  return new Promise((resolve) => {
    const encoded = Buffer.from(PAPER_PS_SCRIPT, "utf16le").toString("base64");
    const proc = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      windowsHide: true,
      env: { ...process.env, SPP_PRINTER: printerName }
    });
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString("utf8"); });
    const timer = setTimeout(() => { proc.kill(); resolve([]); }, 15000);
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out.trim() || "[]");
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        resolve(arr.filter((p) => p && typeof p.name === "string" && p.widthMm > 0 && p.heightMm > 0));
      } catch { resolve([]); }
    });
    proc.on("error", () => { clearTimeout(timer); resolve([]); });
  });
}

const STATE_FOLDERS = {
  incoming: "Incoming",
  validating: "Validating",
  waiting_approval: "WaitingApproval",
  printing: "Printing",
  done: "Done",
  failed: "Failed",
  canceled: "Canceled",
  rejected: "Rejected",
  archived: "Archive"
};
const READY_SENTINEL = "READY";
const STAGING_FOLDER = ".staging";

function dataUrlToBuffer(dataUrl) {
  const value = String(dataUrl || "");
  const match = /^data:[^;]+;base64,(.+)$/i.exec(value);
  if (!match) throw new Error("Invalid image data URL.");
  return Buffer.from(match[1], "base64");
}

function ensureHubLayout(hubRoot) {
  for (const folder of Object.values(STATE_FOLDERS)) {
    fs.mkdirSync(path.join(hubRoot, folder), { recursive: true });
  }
  fs.mkdirSync(path.join(hubRoot, STATE_FOLDERS.incoming, STAGING_FOLDER), { recursive: true });
  fs.mkdirSync(path.join(hubRoot, "config"), { recursive: true });
}

function readJsonFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

function readHubConfig(hubRoot) {
  return readJsonFile(path.join(hubRoot, "config", "hub.json"), {});
}

function saveHubConfig(hubRoot, patch) {
  const next = { ...readHubConfig(hubRoot), ...(patch || {}) };
  writeJsonAtomic(path.join(hubRoot, "config", "hub.json"), next);
  return next;
}

function exportSettingsSnapshot(hubRoot, appSettings) {
  ensureHubLayout(hubRoot);
  const configDir = path.join(hubRoot, "config");
  const printers = readJsonFile(path.join(configDir, "printers.json"), { profiles: null });
  const stations = readJsonFile(path.join(configDir, "stations.json"), { stations: [] });
  const media = readJsonFile(path.join(configDir, "media.json"), { items: [] });
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    sourceComputer: os.hostname(),
    hubRoot,
    appSettings: appSettings && typeof appSettings === "object" ? appSettings : null,
    hubConfig: readHubConfig(hubRoot),
    profiles: Array.isArray(printers.profiles) ? printers.profiles : null,
    stations: Array.isArray(stations.stations) ? stations.stations : [],
    media: Array.isArray(media.items) ? media.items : []
  };
}

function importSettingsSnapshot(hubRoot, snapshot) {
  if (!hubRoot) throw new Error("missing hubRoot");
  if (!snapshot || typeof snapshot !== "object") throw new Error("invalid snapshot");
  ensureHubLayout(hubRoot);
  const configDir = path.join(hubRoot, "config");
  if (snapshot.hubConfig && typeof snapshot.hubConfig === "object") saveHubConfig(hubRoot, snapshot.hubConfig);
  if (Array.isArray(snapshot.profiles)) writeJsonAtomic(path.join(configDir, "printers.json"), { profiles: snapshot.profiles });
  if (Array.isArray(snapshot.stations)) writeJsonAtomic(path.join(configDir, "stations.json"), { stations: snapshot.stations });
  if (Array.isArray(snapshot.media)) writeJsonAtomic(path.join(configDir, "media.json"), { items: snapshot.media });
  return exportSettingsSnapshot(hubRoot, snapshot.appSettings || null);
}

// Atomically publish a fully-assembled job into Incoming. READY is written into staging BEFORE
// the rename so the publish is a single atomic step the watcher can never observe half-done.
function publishJobPackage(hubRoot, manifest, images, previews) {
  ensureHubLayout(hubRoot);
  const jobId = String(manifest.jobId);
  const staging = path.join(hubRoot, STATE_FOLDERS.incoming, STAGING_FOLDER, jobId);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(path.join(staging, "images"), { recursive: true });
  fs.mkdirSync(path.join(staging, "previews"), { recursive: true });

  for (const img of images || []) {
    fs.writeFileSync(path.join(staging, img.path), dataUrlToBuffer(img.dataUrl));
  }
  for (const prev of previews || []) {
    fs.writeFileSync(path.join(staging, prev.path), dataUrlToBuffer(prev.dataUrl));
  }
  fs.writeFileSync(path.join(staging, "job.json"), JSON.stringify(manifest, null, 2), "utf-8");
  fs.writeFileSync(path.join(staging, READY_SENTINEL), "");

  const dest = path.join(hubRoot, STATE_FOLDERS.incoming, jobId);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(staging, dest);
  return dest;
}

function outboxRoot(userDataDir) {
  return path.join(userDataDir, "PrintHubOutbox");
}

// Persist a package locally with its target hub so it can be retried (gap G10).
function writeToOutbox(userDataDir, hubRoot, manifest, images, previews) {
  const root = outboxRoot(userDataDir);
  const dir = path.join(root, String(manifest.jobId));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "images"), { recursive: true });
  fs.mkdirSync(path.join(dir, "previews"), { recursive: true });
  for (const img of images || []) {
    fs.writeFileSync(path.join(dir, img.path), dataUrlToBuffer(img.dataUrl));
  }
  for (const prev of previews || []) {
    fs.writeFileSync(path.join(dir, prev.path), dataUrlToBuffer(prev.dataUrl));
  }
  fs.writeFileSync(path.join(dir, "job.json"), JSON.stringify(manifest, null, 2), "utf-8");
  fs.writeFileSync(path.join(dir, "outbox.json"), JSON.stringify({ hubRoot }, null, 2), "utf-8");
  return dir;
}

function listOutbox(userDataDir) {
  const root = outboxRoot(userDataDir);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(root, e.name));
}

// Re-publish every outbox package whose target hub is reachable again.
function flushOutbox(userDataDir) {
  let flushed = 0;
  let failed = 0;
  for (const dir of listOutbox(userDataDir)) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, "outbox.json"), "utf-8"));
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, "job.json"), "utf-8"));
      const images = readDirAsDataImages(dir, "images");
      const previews = readDirAsDataImages(dir, "previews");
      publishJobPackage(meta.hubRoot, manifest, images, previews);
      fs.rmSync(dir, { recursive: true, force: true });
      flushed += 1;
    } catch {
      failed += 1;
    }
  }
  return { flushed, failed };
}

// ── Queue management (SPP2-side UI). Printing itself stays on the server; the editor UI only
// inspects the queue and performs folder/manifest transitions (approve/reject/retry/cancel). ──

function readJobSummary(jobFolder, state) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(jobFolder, "job.json"), "utf-8"));
    const history = Array.isArray(m.statusHistory) ? m.statusHistory : [];
    const last = history[history.length - 1] || {};
    return {
      jobId: m.jobId,
      state,
      size: m.requestedOutput && m.requestedOutput.size,
      finish: m.requestedOutput && m.requestedOutput.finish,
      borderMode: m.requestedOutput && m.requestedOutput.borderMode,
      copies: m.requestedOutput && m.requestedOutput.copies,
      fileCount: Array.isArray(m.files) ? m.files.length : 0,
      customer: m.customer || { name: "", phone: "", note: "" },
      createdAt: m.createdAt,
      priority: m.routing && m.routing.priority,
      approval: m.approval || { mode: "auto", state: null },
      source: m.source,
      sourceComputer: m.sourceComputer,
      lastNote: last.note || ""
    };
  } catch {
    return { jobId: path.basename(jobFolder), state, fileCount: 0, error: "unreadable", customer: { name: "", phone: "", note: "" } };
  }
}

function listQueue(hubRoot) {
  ensureHubLayout(hubRoot);
  const out = [];
  for (const [stateKey, folder] of Object.entries(STATE_FOLDERS)) {
    const dir = path.join(hubRoot, folder);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      out.push(readJobSummary(path.join(dir, entry.name), stateKey));
    }
  }
  return out;
}

function findJobLocation(hubRoot, jobId) {
  for (const [stateKey, folder] of Object.entries(STATE_FOLDERS)) {
    const dir = path.join(hubRoot, folder, jobId);
    if (fs.existsSync(dir)) return { stateKey, folder, dir };
  }
  return null;
}

function moveJobFolder(hubRoot, jobId, fromFolder, toFolder) {
  const src = path.join(hubRoot, fromFolder, jobId);
  const dest = path.join(hubRoot, toFolder, jobId);
  fs.mkdirSync(path.join(hubRoot, toFolder), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(src, dest);
  return dest;
}

function setApprovalState(jobFolder, state) {
  const file = path.join(jobFolder, "job.json");
  const m = JSON.parse(fs.readFileSync(file, "utf-8"));
  m.approval = { ...(m.approval || { mode: "require_approval" }), state };
  fs.writeFileSync(file, JSON.stringify(m, null, 2), "utf-8");
}

// Actions the editor may perform without the print engine. Approve/retry route the job back to
// Incoming so the server picks it up; the printed.json sidecar makes retry resume (gap G13).
function jobAction(hubRoot, jobId, action) {
  const loc = findJobLocation(hubRoot, jobId);
  if (!loc) return { success: false, error: "job not found" };
  switch (action) {
    case "cancel":
      if (!["incoming", "validating", "waiting_approval"].includes(loc.stateKey)) return { success: false, error: "העבודה כבר אינה בתור" };
      moveJobFolder(hubRoot, jobId, loc.folder, STATE_FOLDERS.canceled);
      return { success: true };
    case "reject":
      if (loc.stateKey !== "waiting_approval") return { success: false, error: "העבודה אינה ממתינה לאישור" };
      setApprovalState(loc.dir, "rejected");
      moveJobFolder(hubRoot, jobId, loc.folder, STATE_FOLDERS.rejected);
      return { success: true };
    case "approve":
      if (loc.stateKey !== "waiting_approval") return { success: false, error: "העבודה אינה ממתינה לאישור" };
      setApprovalState(loc.dir, "approved");
      moveJobFolder(hubRoot, jobId, loc.folder, STATE_FOLDERS.incoming);
      return { success: true };
    case "retry":
      if (loc.stateKey !== "failed") return { success: false, error: "ניתן להדפיס שוב רק עבודה שנכשלה" };
      moveJobFolder(hubRoot, jobId, loc.folder, STATE_FOLDERS.incoming);
      return { success: true };
    case "archive":
      moveJobFolder(hubRoot, jobId, loc.folder, STATE_FOLDERS.archived);
      return { success: true };
    case "delete":
      fs.rmSync(loc.dir, { recursive: true, force: true });
      return { success: true };
    default:
      return { success: false, error: `unknown action: ${action}` };
  }
}

function readDirAsDataImages(jobDir, sub) {
  const dir = path.join(jobDir, sub);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => ({
    path: `${sub}/${name}`,
    dataUrl: `data:image/jpeg;base64,${fs.readFileSync(path.join(dir, name)).toString("base64")}`
  }));
}

// Registers the Print Hub IPC handlers. `deps` supplies { ipcMain, getUserDataDir }.
function registerPrintHubMainIpc(deps) {
  const { ipcMain, getUserDataDir } = deps;

  ipcMain.handle("spp:printHub:submit-job", async (_event, payload) => {
    const userDataDir = getUserDataDir();
    const hubRoot = String(payload?.hubRoot || "");
    const manifest = payload?.manifest;
    const images = Array.isArray(payload?.images) ? payload.images : [];
    const previews = Array.isArray(payload?.previews) ? payload.previews : [];
    if (!hubRoot || !manifest || !manifest.jobId) {
      return { success: false, error: "Missing hubRoot or manifest." };
    }
    try {
      const dest = publishJobPackage(hubRoot, manifest, images, previews);
      return { success: true, jobId: manifest.jobId, destination: "incoming", path: dest };
    } catch (err) {
      // Hub unreachable → queue locally for retry (gap G10).
      try {
        const dir = writeToOutbox(userDataDir, hubRoot, manifest, images, previews);
        return { success: true, jobId: manifest.jobId, destination: "outbox", path: dir };
      } catch (err2) {
        return { success: false, error: err2 instanceof Error ? err2.message : String(err) };
      }
    }
  });

  ipcMain.handle("spp:printHub:flush-outbox", async () => {
    const userDataDir = getUserDataDir();
    try {
      const result = flushOutbox(userDataDir);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, flushed: 0, failed: 0, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("spp:printHub:outbox-count", async () => {
    const userDataDir = getUserDataDir();
    try {
      return { success: true, count: listOutbox(userDataDir).length };
    } catch (err) {
      return { success: false, count: 0, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("spp:printHub:station-info", async () => {
    try {
      return { success: true, computerName: os.hostname() };
    } catch {
      return { success: true, computerName: "SPP2" };
    }
  });

  ipcMain.handle("spp:printHub:list-queue", async (_event, hubRoot) => {
    try {
      return { success: true, jobs: listQueue(String(hubRoot || "")) };
    } catch (err) {
      return { success: false, jobs: [], error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("spp:printHub:job-action", async (_event, payload) => {
    try {
      return jobAction(String(payload?.hubRoot || ""), String(payload?.jobId || ""), String(payload?.action || ""));
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("spp:printHub:get-printers", async (event) => {
    try {
      const printers = await event.sender.getPrintersAsync();
      return { success: true, printers: printers.map((p) => ({
        name: p.name, displayName: p.displayName || p.name, status: p.status, isDefault: p.isDefault
      })) };
    } catch (err) {
      return { success: false, printers: [], error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("spp:printHub:load-profiles", async (_event, hubRoot) => {
    try {
      const file = path.join(String(hubRoot || ""), "config", "printers.json");
      if (!fs.existsSync(file)) return { success: true, profiles: null };
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      return { success: true, profiles: Array.isArray(parsed.profiles) ? parsed.profiles : null };
    } catch (err) {
      return { success: false, profiles: null, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("spp:printHub:save-profiles", async (_event, payload) => {
    try {
      const hubRoot = String(payload?.hubRoot || "");
      if (!hubRoot) return { success: false, error: "missing hubRoot" };
      const profiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
      fs.mkdirSync(path.join(hubRoot, "config"), { recursive: true });
      fs.writeFileSync(path.join(hubRoot, "config", "printers.json"), JSON.stringify({ profiles }, null, 2), "utf-8");
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  const readConfigArray = (hubRoot, file, key) => {
    try {
      const p = path.join(String(hubRoot || ""), "config", file);
      if (!fs.existsSync(p)) return null;
      const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
      return Array.isArray(parsed[key]) ? parsed[key] : null;
    } catch { return null; }
  };
  const writeConfigArray = (hubRoot, file, key, value) => {
    const dir = path.join(String(hubRoot || ""), "config");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ [key]: value }, null, 2), "utf-8");
  };

  ipcMain.handle("spp:printHub:read-server-log", async (_e, hubRoot) => {
    try {
      const file = path.join(String(hubRoot || ""), "logs", "server.log");
      if (!fs.existsSync(file)) return { success: true, lines: [] };
      const lines = fs.readFileSync(file, "utf-8").split("\n").filter((l) => l.trim()).slice(-300);
      return { success: true, lines };
    } catch (err) { return { success: false, lines: [], error: err instanceof Error ? err.message : String(err) }; }
  });
  ipcMain.handle("spp:printHub:get-printer-papers", async (_e, printerName) => {
    try { return { success: true, papers: await getPrinterPapers(String(printerName || "")) }; }
    catch (err) { return { success: false, papers: [], error: err instanceof Error ? err.message : String(err) }; }
  });
  ipcMain.handle("spp:printHub:load-stations", async (_e, hubRoot) =>
    ({ success: true, stations: readConfigArray(hubRoot, "stations.json", "stations") }));
  ipcMain.handle("spp:printHub:save-stations", async (_e, payload) => {
    try { writeConfigArray(payload?.hubRoot, "stations.json", "stations", payload?.stations ?? []); return { success: true }; }
    catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });
  ipcMain.handle("spp:printHub:load-media", async (_e, hubRoot) =>
    ({ success: true, items: readConfigArray(hubRoot, "media.json", "items") }));
  ipcMain.handle("spp:printHub:save-media", async (_e, payload) => {
    try { writeConfigArray(payload?.hubRoot, "media.json", "items", payload?.items ?? []); return { success: true }; }
    catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });
  ipcMain.handle("spp:printHub:read-production-log", async (_e, payload) => {
    try {
      const hubRoot = String(payload?.hubRoot || "");
      const date = String(payload?.date || new Date().toISOString().slice(0, 10));
      const file = path.join(hubRoot, "logs", `production_${date}.jsonl`);
      if (!fs.existsSync(file)) return { success: true, entries: [] };
      const entries = fs.readFileSync(file, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
      return { success: true, entries };
    } catch (err) { return { success: false, entries: [], error: err instanceof Error ? err.message : String(err) }; }
  });

  ipcMain.handle("spp:printHub:load-hub-config", async (_e, hubRoot) => {
    try {
      const root = String(hubRoot || "");
      if (!root) return { success: false, error: "missing hubRoot" };
      ensureHubLayout(root);
      return { success: true, config: readHubConfig(root) };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  ipcMain.handle("spp:printHub:save-hub-config", async (_e, payload) => {
    try {
      const hubRoot = String(payload?.hubRoot || "");
      if (!hubRoot) return { success: false, error: "missing hubRoot" };
      ensureHubLayout(hubRoot);
      return { success: true, config: saveHubConfig(hubRoot, payload?.config || {}) };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  ipcMain.handle("spp:printHub:export-settings", async (_e, payload) => {
    try {
      const hubRoot = String(payload?.hubRoot || "");
      if (!hubRoot) return { success: false, error: "missing hubRoot" };
      return { success: true, snapshot: exportSettingsSnapshot(hubRoot, payload?.appSettings || null) };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  ipcMain.handle("spp:printHub:import-settings", async (_e, payload) => {
    try {
      const hubRoot = String(payload?.hubRoot || "");
      const snapshot = importSettingsSnapshot(hubRoot, payload?.snapshot);
      return { success: true, snapshot };
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) }; }
  });

  ipcMain.handle("spp:printHub:open-job-folder", async (_event, payload) => {
    try {
      const loc = findJobLocation(String(payload?.hubRoot || ""), String(payload?.jobId || ""));
      const { shell } = require("electron");
      const target = loc ? loc.dir : String(payload?.hubRoot || "");
      const error = await shell.openPath(target);
      return { success: !error, error: error || undefined };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

module.exports = {
  STATE_FOLDERS,
  READY_SENTINEL,
  publishJobPackage,
  writeToOutbox,
  listOutbox,
  flushOutbox,
  listQueue,
  jobAction,
  registerPrintHubMainIpc
};

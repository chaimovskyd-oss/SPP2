// LAN ingest HTTP server for the Print Hub (Phase 1 cross-machine transport).
//
// Runs inside the always-on Print Hub server process. A design station POSTs a job as
// multipart/form-data (one `manifest` JSON field + N binary `image`/`preview` parts); we stream
// the parts straight into the hub's staging folder and publish atomically via lanIngest — feeding
// the EXISTING queue + print engine unchanged. Images never round-trip through base64.
//
// NODE-ONLY.

import http from "node:http";
import os from "node:os";

import busboy from "busboy";

import { jobDir, listReadyJobIds } from "@/core/printHub/atomicIo";
import { parseManifest } from "@/core/printHub/jobPackage";
import type { PrintJobManifest } from "@/types/printHub";
import fs from "node:fs";
import {
  abortIngest,
  beginIngest,
  finalizeIngest,
  hasFreeSpace,
  isDuplicateJob,
  markReceived,
  resolvePart,
  type IngestHandle
} from "@/core/printHub/lanIngest";
import { getLanPort, getOrCreatePairingToken, tokensMatch } from "@/core/printHub/hubConfig";

const SERVER_VERSION = "1";

export interface LanServerDeps {
  getHubRoot: () => string;
  getServerName: () => string;
  isPaused: () => boolean;
  log: (msg: string) => void;
}

export interface LanServerHandle {
  close: () => void;
  /** LAN IPv4 addresses as "host:port" for display (tray / management window). */
  addresses: () => string[];
  port: number;
  /** The hub's current pairing token. */
  token: () => string;
}

/** Enumerates non-internal IPv4 addresses, e.g. ["192.168.1.50", "10.0.0.4"]. */
export function lanIPv4Addresses(): string[] {
  const out: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (info.family === "IPv4" && !info.internal) out.push(info.address);
    }
  }
  return out;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(json);
}

function handleHealth(res: http.ServerResponse, deps: LanServerDeps): void {
  let queueDepth = 0;
  try { queueDepth = listReadyJobIds(deps.getHubRoot()).length; } catch { /* hub not ready */ }
  sendJson(res, 200, {
    ok: true,
    hubName: deps.getServerName(),
    version: SERVER_VERSION,
    ready: !deps.isPaused(),
    queueDepth
  });
}

function handlePrintJob(req: http.IncomingMessage, res: http.ServerResponse, deps: LanServerDeps): void {
  const hubRoot = deps.getHubRoot();

  // Auth: pairing token (constant-time compare).
  const token = String(req.headers["x-spp-token"] ?? "");
  if (!tokensMatch(token, getOrCreatePairingToken(hubRoot))) {
    req.resume(); // drain
    sendJson(res, 401, { success: false, error: "unauthorized" });
    return;
  }

  // Optional pre-flight free-disk check (client may declare the total job size).
  const declaredBytes = Number(req.headers["x-spp-job-bytes"] ?? 0);
  if (declaredBytes > 0 && !hasFreeSpace(hubRoot, declaredBytes)) {
    req.resume();
    sendJson(res, 507, { success: false, error: "insufficient disk space on hub" });
    return;
  }

  let bb: ReturnType<typeof busboy>;
  try {
    bb = busboy({ headers: req.headers });
  } catch {
    req.resume();
    sendJson(res, 400, { success: false, error: "invalid multipart request" });
    return;
  }

  let manifestJson = "";
  let manifest: PrintJobManifest | null = null;
  let handle: IngestHandle | null = null;
  let manifestSeen = false;
  let responded = false;
  let fatal: { status: number; error: string } | null = null;
  const filePromises: Array<Promise<void>> = [];

  const fail = (status: number, error: string): void => {
    if (!fatal) fatal = { status, error };
  };
  const finish = (): void => {
    if (responded) return;
    responded = true;
    if (handle && fatal) abortIngest(handle);
    if (fatal) { sendJson(res, fatal.status, { success: false, error: fatal.error }); return; }
    sendJson(res, 200, body200);
  };
  let body200: Record<string, unknown> = { success: true };

  bb.on("field", (name, val) => {
    if (name === "manifest") manifestJson = val;
  });

  // We rely on the client appending `manifest` before the file parts (lanQueueClient does).
  bb.on("file", (name, stream, info) => {
    // Resolve the manifest exactly once, on the first file part.
    if (!manifestSeen) {
      manifestSeen = true;
      try {
        manifest = parseManifest(manifestJson);
        if (fs.existsSync(jobDir(hubRoot, "incoming", manifest.jobId))) {
          fail(409, "job already queued");
        } else if (isDuplicateJob(hubRoot, manifest)) {
          body200 = { success: true, jobId: manifest.jobId, duplicate: true };
        } else {
          handle = beginIngest(hubRoot, manifest);
          body200 = { success: true, jobId: manifest.jobId, destination: "incoming" };
        }
      } catch (err) {
        fail(400, `manifest invalid: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (handle === null || fatal) { stream.resume(); return; } // duplicate / conflict / error → drain

    const part = resolvePart(handle, info.filename);
    if (part === null) {
      fail(400, `unsafe or unexpected filename: ${info.filename}`);
      stream.resume();
      return;
    }
    const activeHandle = handle;
    const p = new Promise<void>((resolve) => {
      const ws = fs.createWriteStream(part.absPath);
      ws.on("error", () => { fail(500, `write failed: ${part.rel}`); resolve(); });
      ws.on("finish", () => { markReceived(activeHandle, part.rel); resolve(); });
      stream.on("error", () => { fail(500, `upload stream error: ${part.rel}`); ws.destroy(); resolve(); });
      stream.pipe(ws);
    });
    filePromises.push(p);
  });

  bb.on("error", () => fail(400, "malformed multipart body"));

  bb.on("close", () => {
    void Promise.all(filePromises).then(() => {
      // A manifest with zero files never triggers "file" — treat as bad request.
      if (!manifestSeen) { fail(400, "no image parts received"); finish(); return; }
      if (handle && manifest && !fatal) {
        try {
          finalizeIngest(handle, manifest);
        } catch (err) {
          fail(400, err instanceof Error ? err.message : String(err));
        }
      }
      finish();
    });
  });

  req.pipe(bb);
}

/** Starts the LAN ingest HTTP server. Binds once for the process lifetime. */
export function startLanServer(deps: LanServerDeps): LanServerHandle {
  const port = getLanPort(deps.getHubRoot());

  const server = http.createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    try {
      if (req.method === "GET" && url === "/health") { handleHealth(res, deps); return; }
      if (req.method === "POST" && url === "/print-jobs") { handlePrintJob(req, res, deps); return; }
      sendJson(res, 404, { success: false, error: "not found" });
    } catch (err) {
      deps.log(`⚠ LAN request error: ${err instanceof Error ? err.message : String(err)}`);
      try { sendJson(res, 500, { success: false, error: "internal error" }); } catch { /* ignore */ }
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      deps.log(`⚠ LAN: הפורט ${port} תפוס — שליחה ברשת מושבתת. סגור את התוכנה שתופסת אותו או שנה lanPort ב-hub.json.`);
    } else {
      deps.log(`⚠ LAN server error: ${err.message}`);
    }
  });

  server.listen(port, "0.0.0.0");

  return {
    close: () => { try { server.close(); } catch { /* ignore */ } },
    addresses: () => lanIPv4Addresses().map((ip) => `${ip}:${port}`),
    port,
    token: () => getOrCreatePairingToken(deps.getHubRoot())
  };
}

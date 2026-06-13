// LAN transport for Print Hub jobs (Phase 1). A design station POSTs a job as multipart/form-data
// directly to the Print Hub machine on the local network — images stream as binary (no base64
// bloat), with live upload progress. Mirrors src/services/cloud/cloudQueueClient.ts structurally.
//
// Runs in the renderer (Electron renderer has fetch / FormData / Blob / XMLHttpRequest).

import { serializeManifest } from "@/core/printHub/jobPackage";
import type { PrintJobManifest } from "@/types/printHub";

export interface LanConfig {
  host: string;
  port: number;
  token: string;
}

/** Builds a LanConfig from the printHub settings, or null when LAN transport is not active/configured. */
export function lanConfigFromSettings(p: {
  transportMode: "folder" | "lan";
  lanHost: string;
  lanPort: number;
  lanToken: string;
}): LanConfig | null {
  if (p.transportMode !== "lan" || !p.lanHost) return null;
  return { host: p.lanHost, port: p.lanPort || 8788, token: p.lanToken };
}

export interface LanImage {
  path: string;
  dataUrl: string;
}

export type LanUploadPhase = "connecting" | "uploading" | "finalizing" | "success" | "error";

export interface LanUploadProgress {
  phase: LanUploadPhase;
  loadedBytes: number;
  totalBytes: number;
  imagesSent: number;
  imagesTotal: number;
}

export interface LanSubmitResult {
  success: boolean;
  jobId?: string;
  destination?: "lan";
  duplicate?: boolean;
  error?: string;
  status?: number;
}

export interface LanSubmitOptions {
  previews?: LanImage[];
  onProgress?: (p: LanUploadProgress) => void;
}

function baseUrl(config: LanConfig): string {
  return `http://${config.host}:${config.port}`;
}

/** Decodes a base64 data URL into a typed Blob (the renderer equivalent of the CJS dataUrlToBuffer). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mimeMatch = /data:([^;]+)/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** How many image parts have fully uploaded given the bytes sent so far (cumulative end offsets). */
export function imagesSentForBytes(cumulative: number[], loadedBytes: number): number {
  return cumulative.filter((end) => loadedBytes >= end).length;
}

/** Maps a low-level failure to a clear, actionable Hebrew message. */
export function lanErrorMessage(status: number | undefined, raw?: string): string {
  if (status === 401) return "קוד השיוך שגוי. העתק קוד חדש מחלון ה-Print Hub.";
  if (status === 507) return "אין מספיק מקום בדיסק במחשב ההדפסה.";
  if (status === 409) return "העבודה כבר נמצאת בתור.";
  if (status === undefined || status === 0) {
    return "לא הצלחנו להתחבר למחשב ההדפסה. בדוק שה-Print Hub פתוח וששני המחשבים באותה רשת.";
  }
  return raw && raw.length > 0 ? raw : `שגיאת שרת (${status}).`;
}

/**
 * Submits a job to the Hub over LAN via XMLHttpRequest (for real upload progress). Resolves with
 * a result; never throws — network failures come back as `{ success:false, status:0 }` so callers
 * can fall back to the outbox / show a retry message.
 */
export function submitJobToLan(
  config: LanConfig,
  manifest: PrintJobManifest,
  images: LanImage[],
  opts: LanSubmitOptions = {}
): Promise<LanSubmitResult> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append("manifest", serializeManifest(manifest));

    // Cumulative image byte sizes → derive "image N of M" from uploaded bytes.
    let totalBytes = 0;
    const cumulative: number[] = [];
    for (const img of images) {
      const blob = dataUrlToBlob(img.dataUrl);
      totalBytes += blob.size;
      cumulative.push(totalBytes);
      form.append("image", blob, img.path);
    }
    for (const pv of opts.previews ?? []) {
      form.append("preview", dataUrlToBlob(pv.dataUrl), pv.path);
    }
    const imagesTotal = images.length;

    const emit = (phase: LanUploadPhase, loadedBytes: number): void => {
      opts.onProgress?.({ phase, loadedBytes, totalBytes, imagesSent: imagesSentForBytes(cumulative, loadedBytes), imagesTotal });
    };

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl(config)}/print-jobs`);
    xhr.setRequestHeader("X-SPP-Token", config.token);
    xhr.setRequestHeader("X-SPP-Job-Bytes", String(totalBytes));
    xhr.timeout = 0; // large uploads must not time out; connect failures still fire onerror

    emit("connecting", 0);
    xhr.upload.onprogress = (e) => emit("uploading", e.loaded);
    xhr.upload.onload = () => emit("finalizing", totalBytes);

    xhr.onload = () => {
      let body: { success?: boolean; jobId?: string; duplicate?: boolean; error?: string } = {};
      try { body = JSON.parse(xhr.responseText) as typeof body; } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.success) {
        emit("success", totalBytes);
        resolve({ success: true, jobId: body.jobId, destination: "lan", duplicate: body.duplicate, status: xhr.status });
      } else {
        emit("error", 0);
        resolve({ success: false, status: xhr.status, error: lanErrorMessage(xhr.status, body.error) });
      }
    };
    xhr.onerror = () => { emit("error", 0); resolve({ success: false, status: 0, error: lanErrorMessage(0) }); };
    xhr.ontimeout = () => { emit("error", 0); resolve({ success: false, status: 0, error: lanErrorMessage(0) }); };

    xhr.send(form);
  });
}

export interface LanHealth {
  ok: boolean;
  hubName?: string;
  ready?: boolean;
  queueDepth?: number;
  error?: string;
}

/** GET /health with a short timeout — drives the connection status light + connection test. */
export async function testLanConnection(config: LanConfig, timeoutMs = 3000): Promise<LanHealth> {
  if (!config.host || !config.port) return { ok: false, error: "no host configured" };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl(config)}/health`, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `status ${res.status}` };
    const body = (await res.json()) as { ok?: boolean; hubName?: string; ready?: boolean; queueDepth?: number };
    return { ok: Boolean(body.ok), hubName: body.hubName, ready: body.ready, queueDepth: body.queueDepth };
  } catch {
    return { ok: false, error: "unreachable" };
  } finally {
    clearTimeout(t);
  }
}

export interface LanCheck {
  id: "reachable" | "port-open" | "token-valid" | "same-subnet" | "firewall";
  ok: boolean | "unknown";
  detail: string;
  fix?: string;
}

/** Runs structured connection diagnostics for the "אבחון חיבור" panel. */
export async function troubleshootLan(config: LanConfig, stationIp?: string): Promise<{ checks: LanCheck[] }> {
  const checks: LanCheck[] = [];

  // 1 + 2: reachability / port open via /health.
  const health = await testLanConnection(config, 3000);
  const portOpen = health.ok;
  checks.push({
    id: "reachable",
    ok: portOpen,
    detail: portOpen ? `המחשב ${health.hubName ?? config.host} זמין` : `אין מענה מ-${config.host}`,
    fix: portOpen ? undefined : "ודא שמחשב ה-Print Hub דולק ושהתוכנה פתוחה."
  });
  checks.push({
    id: "port-open",
    ok: portOpen,
    detail: portOpen ? `הפורט ${config.port} פתוח` : `הפורט ${config.port} סגור או חסום`,
    fix: portOpen ? undefined : "ודא שהפורט פתוח בחומת האש של מחשב ההדפסה."
  });

  // 3: token validity — POST with the token and an empty body. busboy rejects the empty body with
  // 400 when the token is ACCEPTED; a wrong token returns 401 before parsing.
  if (portOpen) {
    let tokenOk: boolean | "unknown" = "unknown";
    try {
      const res = await fetch(`${baseUrl(config)}/print-jobs`, {
        method: "POST",
        headers: { "X-SPP-Token": config.token, "Content-Type": "multipart/form-data; boundary=spp-probe" },
        body: "--spp-probe--"
      });
      tokenOk = res.status === 401 ? false : true;
    } catch {
      tokenOk = "unknown";
    }
    checks.push({
      id: "token-valid",
      ok: tokenOk,
      detail: tokenOk === true ? "קוד השיוך תקין" : tokenOk === false ? "קוד השיוך שגוי" : "לא ניתן לאמת את הקוד",
      fix: tokenOk === false ? "העתק קוד שיוך עדכני מחלון ה-Print Hub והדבק כאן." : undefined
    });
  }

  // 4: same subnet (best-effort, only when both are IPv4 literals).
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/;
  if (stationIp && ipv4.test(stationIp) && ipv4.test(config.host)) {
    const same = stationIp.split(".").slice(0, 3).join(".") === config.host.split(".").slice(0, 3).join(".");
    checks.push({
      id: "same-subnet",
      ok: same,
      detail: same ? "שני המחשבים באותה רשת" : "המחשבים נראים ברשתות שונות",
      fix: same ? undefined : "חבר את שני המחשבים לאותה רשת/ראוטר."
    });
  } else {
    checks.push({ id: "same-subnet", ok: "unknown", detail: "לא ניתן לבדוק רשת משותפת" });
  }

  // 5: firewall hint when unreachable.
  if (!portOpen) {
    checks.push({
      id: "firewall",
      ok: "unknown",
      detail: "ייתכן שחומת האש חוסמת את החיבור",
      fix: `במחשב ההדפסה: אפשר חיבור נכנס ל-TCP ${config.port} (חומת האש של Windows).`
    });
  }

  return { checks };
}

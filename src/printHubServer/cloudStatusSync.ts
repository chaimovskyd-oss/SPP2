// Cloud status writer for the Print Hub server (Phase 2). The server is the SINGLE writer of job
// state to Supabase. Cloud config + the user's session are pushed in from the management-window
// renderer (which has the Vite-built env + the logged-in session) via IPC, then cached + persisted
// here so the headless main process can write status (and refresh its token) even with no window
// open. Best-effort only — printing never blocks on the cloud.
//
// NODE-ONLY (Electron main / Print Hub server). Uses global fetch (Node 18+).

import fs from "node:fs";
import path from "node:path";

import type { PrintJobManifest, PrintJobState } from "@/types/printHub";
import { buildUpsertUrl, decodeJwtUserId, manifestToStatusRow } from "@/core/printHub/cloudStatus";

interface CloudState {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

/** Payload the renderer pushes (config + session). userId is derived from the token if omitted. */
export interface CloudSessionPayload {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId?: string;
}

let state: CloudState | null = null;
let configFile = "";
let log: (msg: string) => void = () => { /* set in init */ };

function persist(): void {
  if (!configFile) return;
  try {
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    const tmp = `${configFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state ?? {}, null, 2), "utf-8");
    fs.renameSync(tmp, configFile);
  } catch { /* non-fatal */ }
}

/** Initializes the sync: where to persist + loads any previously-pushed session. */
export function initCloudStatusSync(userDataDir: string, logger: (msg: string) => void): void {
  log = logger;
  configFile = path.join(userDataDir, "print-hub-cloud.json");
  try {
    const raw = JSON.parse(fs.readFileSync(configFile, "utf-8")) as Partial<CloudState>;
    if (raw && typeof raw.supabaseUrl === "string" && typeof raw.accessToken === "string" && typeof raw.userId === "string") {
      state = {
        supabaseUrl: raw.supabaseUrl,
        anonKey: String(raw.anonKey ?? ""),
        accessToken: raw.accessToken,
        refreshToken: String(raw.refreshToken ?? ""),
        expiresAt: typeof raw.expiresAt === "number" ? raw.expiresAt : 0,
        userId: raw.userId
      };
    }
  } catch { /* none yet */ }
}

/** Accepts a session pushed from the management window; caches + persists it. */
export function setCloudSession(payload: CloudSessionPayload): { ok: boolean; userId?: string } {
  if (!payload?.supabaseUrl || !payload.accessToken) { return { ok: false }; }
  const userId = payload.userId ?? decodeJwtUserId(payload.accessToken) ?? "";
  if (!userId) return { ok: false };
  state = {
    supabaseUrl: payload.supabaseUrl.replace(/\/+$/, ""),
    anonKey: payload.anonKey ?? "",
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken ?? "",
    expiresAt: typeof payload.expiresAt === "number" ? payload.expiresAt : 0,
    userId
  };
  persist();
  return { ok: true, userId };
}

export function clearCloudSession(): void {
  state = null;
  persist();
}

export function isCloudConfigured(): boolean {
  return state !== null;
}

/** Refreshes the access token if it is near expiry. Best-effort; clears nothing on failure. */
async function ensureFreshToken(): Promise<boolean> {
  if (!state) return false;
  if (state.expiresAt > Date.now() + 60_000) return true;
  if (!state.refreshToken || !state.anonKey) return state.accessToken.length > 0;
  try {
    const res = await fetch(`${state.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: state.anonKey },
      body: JSON.stringify({ refresh_token: state.refreshToken })
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (typeof body.access_token !== "string") return false;
    state = {
      ...state,
      accessToken: body.access_token,
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : state.refreshToken,
      expiresAt: Date.now() + (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1000
    };
    persist();
    return true;
  } catch {
    return false;
  }
}

/**
 * Upserts a job's current status to Supabase. Best-effort: any failure is logged and swallowed so
 * the local print pipeline is never blocked by cloud issues.
 */
export async function upsertJobStatus(
  targetComputer: string,
  jobState: PrintJobState | string,
  manifest: PrintJobManifest
): Promise<void> {
  if (!state) return;
  try {
    const fresh = await ensureFreshToken();
    if (!fresh || !state) return;
    const row = manifestToStatusRow(state.userId, targetComputer, jobState, manifest);
    const res = await fetch(buildUpsertUrl(state.supabaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: state.anonKey,
        Authorization: `Bearer ${state.accessToken}`,
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    });
    if (!res.ok) {
      log(`☁ סנכרון סטטוס נכשל (${res.status}) לעבודה ${manifest.jobId}`);
    }
  } catch (err) {
    log(`☁ שגיאת סנכרון ענן: ${err instanceof Error ? err.message : String(err)}`);
  }
}

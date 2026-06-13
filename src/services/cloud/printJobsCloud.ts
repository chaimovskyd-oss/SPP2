// Renderer-side cloud access for Print Hub Phase 2 status.
//  - Design stations READ the account's live cross-machine queue from Supabase (RLS-scoped to the
//    logged-in user, so every machine on the same account sees the same jobs).
//  - The Print Hub management window PUSHES its config + session to the headless server process so
//    the server (the single writer) can mirror job state to the cloud even with no window open.

import { getCloudConfig } from "./cloudConfig";
import { getValidCloudSession } from "./cloudAuth";
import { buildListUrl, decodeJwtUserId, type PrintJobCloudRow } from "@/core/printHub/cloudStatus";

/** True when cloud is configured (env present). Does not imply the user is logged in. */
export function cloudStatusConfigured(): boolean {
  return getCloudConfig().configured;
}

/** Reads the account's print jobs (most-recent first) across all the user's machines. */
export async function listCloudPrintJobs(): Promise<{ ok: boolean; jobs: PrintJobCloudRow[]; error?: string }> {
  const config = getCloudConfig();
  if (!config.configured) return { ok: false, jobs: [], error: "cloud not configured" };
  const session = await getValidCloudSession();
  if (!session) return { ok: false, jobs: [], error: "not signed in" };
  try {
    const res = await fetch(buildListUrl(config.supabaseUrl), {
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${session.accessToken}`
      }
    });
    if (!res.ok) return { ok: false, jobs: [], error: `status ${res.status}` };
    const rows = (await res.json()) as PrintJobCloudRow[];
    return { ok: true, jobs: Array.isArray(rows) ? rows : [] };
  } catch (err) {
    return { ok: false, jobs: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Pushes the current cloud config + session into the Print Hub server process (so the headless
 * server can write status). Call this from the Hub's management window. No-op if not configured,
 * not signed in, or the bridge is unavailable. Returns whether a session was pushed.
 */
export async function pushCloudSessionToHub(): Promise<boolean> {
  const api = window.spp?.printHub;
  if (api?.setCloudSession === undefined) return false;
  const config = getCloudConfig();
  if (!config.configured) return false;
  const session = await getValidCloudSession();
  if (!session) return false;
  const userId = decodeJwtUserId(session.accessToken) ?? undefined;
  const res = await api.setCloudSession({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabasePublishableKey,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    userId
  });
  return Boolean(res?.ok);
}

import { getCloudConfig } from "./cloudConfig";
import { getValidCloudSession } from "./cloudAuth";
import { decodeJwtUserId } from "@/core/printHub/cloudStatus";
import type { PrintHubSettings } from "@/settings/types";
import type { MediaItem, PrinterProfile, Station } from "@/types/printHub";

export interface PrintHubSettingsSnapshot {
  schemaVersion: number;
  exportedAt: string;
  sourceComputer: string;
  hubRoot: string;
  appSettings: PrintHubSettings | null;
  hubConfig: {
    retentionDays?: number;
    lanPort?: number;
    pairingToken?: string;
  };
  profiles: PrinterProfile[] | null;
  stations: Station[];
  media: MediaItem[];
}

export interface CloudPrintHubSettingsRow {
  id: string;
  user_id: string;
  profile_name: string;
  source_computer: string | null;
  settings: PrintHubSettingsSnapshot;
  created_at: string;
  updated_at: string;
}

const PROFILE_NAME = "default";

function tableUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/rest/v1/print_hub_settings`;
}

function headers(accessToken: string, apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: apiKey,
    Authorization: `Bearer ${accessToken}`
  };
}

export async function publishPrintHubSettingsToCloud(
  snapshot: PrintHubSettingsSnapshot
): Promise<{ ok: boolean; row?: CloudPrintHubSettingsRow; error?: string }> {
  const config = getCloudConfig();
  if (!config.configured) return { ok: false, error: "cloud not configured" };
  const session = await getValidCloudSession();
  if (!session) return { ok: false, error: "not signed in" };
  const userId = decodeJwtUserId(session.accessToken);
  if (!userId) return { ok: false, error: "missing user id" };

  try {
    const res = await fetch(`${tableUrl(config.supabaseUrl)}?on_conflict=user_id,profile_name`, {
      method: "POST",
      headers: {
        ...headers(session.accessToken, config.supabasePublishableKey),
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        user_id: userId,
        profile_name: PROFILE_NAME,
        source_computer: snapshot.sourceComputer,
        settings: snapshot
      })
    });
    if (!res.ok) return { ok: false, error: `status ${res.status}` };
    const rows = (await res.json()) as CloudPrintHubSettingsRow[];
    return { ok: true, row: rows[0] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pullPrintHubSettingsFromCloud(): Promise<{ ok: boolean; row?: CloudPrintHubSettingsRow; error?: string }> {
  const config = getCloudConfig();
  if (!config.configured) return { ok: false, error: "cloud not configured" };
  const session = await getValidCloudSession();
  if (!session) return { ok: false, error: "not signed in" };

  try {
    const query = new URLSearchParams({
      profile_name: `eq.${PROFILE_NAME}`,
      select: "*",
      order: "updated_at.desc",
      limit: "1"
    });
    const res = await fetch(`${tableUrl(config.supabaseUrl)}?${query}`, {
      headers: headers(session.accessToken, config.supabasePublishableKey)
    });
    if (!res.ok) return { ok: false, error: `status ${res.status}` };
    const rows = (await res.json()) as CloudPrintHubSettingsRow[];
    return { ok: true, row: rows[0] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

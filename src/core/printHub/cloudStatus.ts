// Pure helpers for Phase 2 cloud status sync (no Node / Electron / DOM deps, so they run in both
// the Print Hub server bundle and the renderer, and are unit-testable). The Print Hub server is the
// single writer of job state to Supabase; design stations read it for a live cross-machine queue.
// Only small metadata is stored — never image bytes.

import type { PrintJobManifest, PrintJobState } from "@/types/printHub";

/** A row written to Supabase `print_jobs` (status/metadata only). */
export interface PrintJobStatusRow {
  user_id: string;
  job_id: string;
  source_computer: string;
  target_computer: string;
  customer_name: string;
  size: string;
  finish: string;
  border_mode: string;
  copies: number;
  image_count: number;
  state: string;
  error: string | null;
}

/** A row read back from Supabase `print_jobs` (adds server-managed fields). */
export interface PrintJobCloudRow extends PrintJobStatusRow {
  id: string;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Base64url → UTF-8 string (works in both Node and the browser via atob). */
function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bin = atob(b64);
  // Decode UTF-8 bytes (handles non-ASCII emails etc.).
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Extracts the Supabase user id (`sub` claim) from a JWT access token, or null if unparseable. */
export function decodeJwtUserId(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(base64UrlDecode(parts[1])) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Pulls the most recent status-history note (used to surface the failure reason on error states). */
function lastNote(manifest: PrintJobManifest): string | null {
  const last = manifest.statusHistory[manifest.statusHistory.length - 1];
  return last?.note && last.note.length > 0 ? last.note : null;
}

/** Maps a manifest + current state into the Supabase status row. */
export function manifestToStatusRow(
  userId: string,
  targetComputer: string,
  state: PrintJobState | string,
  manifest: PrintJobManifest
): PrintJobStatusRow {
  const out = manifest.requestedOutput;
  return {
    user_id: userId,
    job_id: manifest.jobId,
    source_computer: manifest.sourceComputer ?? "",
    target_computer: targetComputer,
    customer_name: manifest.customer?.name ?? "",
    size: out.size,
    finish: out.finish,
    border_mode: out.borderMode,
    copies: out.copies,
    image_count: manifest.files.length,
    state: String(state),
    error: state === "failed" ? lastNote(manifest) : null
  };
}

const TABLE_PATH = "/rest/v1/print_jobs";

/** Upsert endpoint (on the unique (user_id, job_id) constraint). */
export function buildUpsertUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}${TABLE_PATH}?on_conflict=user_id,job_id`;
}

/** List endpoint for the reader (most-recent first, capped). */
export function buildListUrl(supabaseUrl: string, limit = 100): string {
  return `${supabaseUrl.replace(/\/+$/, "")}${TABLE_PATH}?select=*&order=updated_at.desc&limit=${limit}`;
}

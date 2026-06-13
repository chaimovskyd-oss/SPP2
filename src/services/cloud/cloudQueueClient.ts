// Optional cloud transport for Print Hub jobs (Phase 11 / V3, spec §16). Lets a station submit a
// job to an HTTP queue instead of a shared network folder. Off by default — V1 stays folder-based.
// Reuses the existing cloud config (getCloudConfig / VITE_SPP2_CLOUD_API_URL).

import type { PrintJobManifest } from "@/types/printHub";

export interface CloudSubmitResult {
  success: boolean;
  jobId?: string;
  destination?: "cloud";
  error?: string;
}

export interface CloudSubmitImage {
  path: string;
  dataUrl: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * POSTs a job package to the cloud queue endpoint `${apiUrl}/print-jobs`.
 * The fetch implementation is injectable for testing.
 */
export async function submitJobToCloud(
  apiUrl: string,
  manifest: PrintJobManifest,
  images: CloudSubmitImage[],
  fetchImpl?: FetchLike
): Promise<CloudSubmitResult> {
  if (!apiUrl) return { success: false, error: "Cloud API URL not configured" };
  const doFetch = (fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  if (doFetch === undefined) return { success: false, error: "fetch unavailable" };
  try {
    const res = await doFetch(`${apiUrl.replace(/\/+$/, "")}/print-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifest, images })
    });
    if (!res.ok) {
      return { success: false, error: `cloud queue returned ${res.status}` };
    }
    const body = (await res.json()) as { jobId?: string };
    return { success: true, jobId: body.jobId ?? manifest.jobId, destination: "cloud" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

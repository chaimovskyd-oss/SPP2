// Print Job Builder (sender side, runs in the renderer).
//
// Renders each source image to the preset's exact print size, assembles the job.json manifest,
// and hands the package to the main process to publish atomically into the hub's Incoming
// folder. When the hub share is unavailable the main process queues to a local outbox (gap G10).

import { buildJobManifest } from "./jobPackage";
import { stableHashHex } from "./jobPackage";
import { renderImageForPreset } from "./printRender";
import type {
  ApprovalMode,
  JobCustomer,
  JobFile,
  JobPriority,
  JobSource,
  PrintPreset
} from "@/types/printHub";

export interface JobSourceImage {
  sourceUrl: string;
  fileName: string;
  /** Strong content hash if known (e.g. asset.hash); otherwise derived from the rendered bytes. */
  sourceHash?: string;
  copies?: number;
}

export interface BuildAndSubmitInput {
  hubRoot: string;
  sources: JobSourceImage[];
  preset: PrintPreset;
  size: string;
  source: JobSource;
  sourceComputer: string;
  copies?: number;
  priority?: JobPriority;
  approvalMode?: ApprovalMode;
  customer?: Partial<JobCustomer>;
  preferredDeviceId?: string | null;
  /** Pre-allocated job id (e.g. to stamp an order-summary slip with the same id). */
  jobId?: string;
  /** Test print — only the first image is printed (spec §18#3). */
  testPrintFirstOnly?: boolean;
  /** Optional cloud transport (Phase 11 / V3). When set, the job is POSTed to the cloud queue
   *  instead of the local hub folder. Default is folder transport. */
  cloudApiUrl?: string;
  /** Optional LAN transport (Phase 1 cross-machine). When set, the job is POSTed directly to the
   *  Print Hub machine over the local network instead of written to a shared folder. */
  lan?: import("@/services/lan/lanQueueClient").LanConfig;
  /** Progress while rendering the source images (done/total). */
  onProgress?: (done: number, total: number) => void;
  /** Progress while uploading over LAN (connecting / N-of-M images / MB-of-MB). */
  onLanProgress?: (p: import("@/services/lan/lanQueueClient").LanUploadProgress) => void;
}

export interface SubmitJobResult {
  success: boolean;
  jobId?: string;
  /** "incoming" when published to the hub, "outbox" when queued locally for retry (gap G10),
   *  "cloud" when sent to the V3 cloud queue, "lan" when sent directly over the local network. */
  destination?: "incoming" | "outbox" | "cloud" | "lan";
  path?: string;
  error?: string;
}

/** Renders all sources, builds the manifest, and submits the package via the chosen transport. */
export async function buildAndSubmitJob(input: BuildAndSubmitInput): Promise<SubmitJobResult> {
  const api = globalThis.window?.spp?.printHub;
  // The IPC bridge is required only for the folder/outbox transport; LAN and cloud go over HTTP.
  if (api?.submitJob === undefined && !input.lan?.host && !input.cloudApiUrl) {
    return { success: false, error: "Print Hub bridge unavailable" };
  }

  const total = input.sources.length;
  const images: Array<{ path: string; dataUrl: string }> = [];
  const files: JobFile[] = [];

  for (let i = 0; i < total; i += 1) {
    const src = input.sources[i];
    const rendered = await renderImageForPreset(src.sourceUrl, input.preset);
    const relPath = `images/${String(i + 1).padStart(3, "0")}.jpg`;
    images.push({ path: relPath, dataUrl: rendered.dataUrl });
    files.push({
      path: relPath,
      copies: Math.max(1, src.copies ?? 1),
      renderedWidthPx: rendered.width,
      renderedHeightPx: rendered.height,
      contentHash: src.sourceHash ?? `r1:${stableHashHex(rendered.dataUrl)}`
    });
    input.onProgress?.(i + 1, total);
  }

  const manifest = buildJobManifest({
    source: input.source,
    sourceComputer: input.sourceComputer,
    size: input.size,
    finish: input.preset.finish,
    borderMode: input.preset.borderMode,
    copies: input.copies ?? 1,
    files,
    priority: input.priority,
    approvalMode: input.approvalMode,
    customer: input.customer,
    preferredDeviceId: input.preferredDeviceId,
    jobId: input.jobId,
    testPrintFirstOnly: input.testPrintFirstOnly
  });

  // LAN transport (Phase 1) — POST directly to the Hub machine over the local network.
  if (input.lan?.host) {
    const { submitJobToLan } = await import("@/services/lan/lanQueueClient");
    const lanResult = await submitJobToLan(input.lan, manifest, images, { onProgress: input.onLanProgress });
    if (lanResult.success) {
      return { success: true, jobId: lanResult.jobId, destination: "lan" };
    }
    // Hub offline → buffer via the existing folder outbox if a folder is configured; else surface error.
    if (input.hubRoot && api?.submitJob) {
      return api.submitJob({ hubRoot: input.hubRoot, manifest, images });
    }
    return { success: false, error: lanResult.error };
  }

  // Cloud transport (Phase 11 / V3) — optional, off by default.
  if (input.cloudApiUrl) {
    const { submitJobToCloud } = await import("@/services/cloud/cloudQueueClient");
    return submitJobToCloud(input.cloudApiUrl, manifest, images);
  }

  if (api?.submitJob === undefined) {
    return { success: false, error: "Print Hub bridge unavailable" };
  }
  return api.submitJob({ hubRoot: input.hubRoot, manifest, images });
}

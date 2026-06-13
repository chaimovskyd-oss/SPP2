// Order time estimation (pure). The admin sets seconds-per-print on each preset; the system
// estimates how long an order will take and how long it will wait behind the rest of the queue.

import { resolvePreset, type ResolvedTarget } from "./resolveProfile";
import type { BorderMode, PrintFinish, PrinterProfile, PrintJobManifest, PrintPreset } from "@/types/printHub";

export const DEFAULT_SECONDS_PER_PRINT = 12;

export function presetSeconds(preset: PrintPreset): number {
  return preset.secondsPerPrint && preset.secondsPerPrint > 0 ? preset.secondsPerPrint : DEFAULT_SECONDS_PER_PRINT;
}

/** Prints in a job = sum(file.copies) * job copies. */
export function manifestPrints(manifest: PrintJobManifest): number {
  const perPass = manifest.files.reduce((s, f) => s + Math.max(1, f.copies), 0);
  return perPass * Math.max(1, manifest.requestedOutput.copies);
}

/** Estimated seconds to print a full manifest, using its resolved preset's seconds-per-print. */
export function estimateManifestSeconds(profiles: PrinterProfile[], manifest: PrintJobManifest): number {
  const target: ResolvedTarget | null = resolvePreset(profiles, {
    ...manifest.requestedOutput,
    preferredDeviceId: manifest.routing.preferredDeviceId
  });
  return manifestPrints(manifest) * (target ? presetSeconds(target.preset) : DEFAULT_SECONDS_PER_PRINT);
}

export interface QueueJobLike {
  state: string;
  size?: string;
  finish?: string;
  borderMode?: string;
  copies?: number;
  fileCount: number;
}

/** Estimated seconds for one queued job (uses summary fields; approximate but good enough). */
export function estimateJobSeconds(profiles: PrinterProfile[], job: QueueJobLike): number {
  const prints = Math.max(1, job.fileCount) * Math.max(1, job.copies ?? 1);
  const target = job.size
    ? resolvePreset(profiles, {
        size: job.size,
        finish: (job.finish as PrintFinish) ?? "glossy",
        borderMode: (job.borderMode as BorderMode) ?? "borderless"
      })
    : null;
  return prints * (target ? presetSeconds(target.preset) : DEFAULT_SECONDS_PER_PRINT);
}

const ACTIVE_STATES = new Set(["incoming", "validating", "waiting_approval", "printing"]);

/** Total estimated seconds of work still in the queue (jobs not yet finished). */
export function estimateQueueSeconds(profiles: PrinterProfile[], jobs: QueueJobLike[]): number {
  return jobs.filter((j) => ACTIVE_STATES.has(j.state)).reduce((s, j) => s + estimateJobSeconds(profiles, j), 0);
}

/** Human Hebrew duration: "פחות מדקה" / "X דק׳" / "X שע׳ Y דק׳". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return "פחות מדקה";
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} דק׳`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} שע׳ ${m} דק׳` : `${h} שע׳`;
}

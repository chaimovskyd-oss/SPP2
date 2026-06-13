// Print Hub Server processing engine (the "brain" that runs on the print station).
//
// NODE-ONLY. Drives a job through the canonical state machine: incoming → validating →
// [waiting_approval] → printing → done | failed. It is decoupled from Electron/Tray wiring and
// from the actual print backend (via DriverAdapter), so it can be unit-tested with a fake adapter.
//
// Resume (gap G13): printed files are recorded in a `printed.json` sidecar inside the job folder,
// so a job that fails/restarts mid-run skips already-printed images.

import fs from "node:fs";
import path from "node:path";

import {
  jobDir,
  listReadyJobIds,
  readManifest,
  transitionJobFolder,
  writeManifest
} from "./atomicIo";
import type { DriverAdapter, PrintableImage, PrintRequest } from "./driverAdapter";
import { transition } from "./stateMachine";
import type { PrintJobManifest, PrintPreset, PrinterProfile, PrintJobState } from "@/types/printHub";

const PRINTED_SIDECAR = "printed.json";
const MICRONS_PER_MM = 1000;

export interface ResolvedTarget {
  profile: PrinterProfile;
  preset: PrintPreset;
}

export interface ServerEngineDeps {
  hubRoot: string;
  /** Identifies this server in statusHistory entries (e.g. computer name). */
  serverName: string;
  /** Maps a job's requestedOutput to a concrete printer + preset, or null if unsupported. */
  resolveTarget: (manifest: PrintJobManifest) => ResolvedTarget | null;
  adapter: DriverAdapter;
  /** Whether a job must wait for admin approval before printing (Phase 6). Defaults to manifest.approval. */
  requiresApproval?: (manifest: PrintJobManifest) => boolean;
  /** Whether this job duplicates one already printed (Phase 10, gap G9). */
  isDuplicate?: (manifest: PrintJobManifest) => boolean;
  /** Called when a job reaches Done (e.g. production log, media consume). */
  onCompleted?: (manifest: PrintJobManifest) => void;
  onJobState?: (jobId: string, state: PrintJobState, manifest: PrintJobManifest) => void;
}

export interface ProcessResult {
  jobId: string;
  finalState: PrintJobState;
  error?: string;
}

export function scanReadyJobs(hubRoot: string): string[] {
  return listReadyJobIds(hubRoot);
}

function appendHistory(
  deps: ServerEngineDeps,
  manifest: PrintJobManifest,
  from: PrintJobState,
  to: PrintJobState,
  note?: string
): PrintJobManifest {
  const entry = transition(from, to, deps.serverName, note);
  return { ...manifest, statusHistory: [...manifest.statusHistory, entry] };
}

function readPrinted(jobFolder: string): Set<string> {
  const file = path.join(jobFolder, PRINTED_SIDECAR);
  if (!fs.existsSync(file)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as { printed?: string[] };
    return new Set(data.printed ?? []);
  } catch {
    return new Set();
  }
}

function writePrinted(jobFolder: string, printed: Set<string>): void {
  fs.writeFileSync(path.join(jobFolder, PRINTED_SIDECAR), JSON.stringify({ printed: [...printed] }, null, 2));
}

function physicalPageForRenderedFile(
  preset: PrintPreset,
  file: { renderedWidthPx?: number; renderedHeightPx?: number }
): { pageWidthMicrons: number; pageHeightMicrons: number } {
  const bleed = Math.max(0, preset.bleedMm);
  const widthMm = preset.widthMm + 2 * bleed;
  const heightMm = preset.heightMm + 2 * bleed;
  const shortMm = Math.min(widthMm, heightMm);
  const longMm = Math.max(widthMm, heightMm);
  const renderedLandscape = (file.renderedWidthPx ?? 0) >= (file.renderedHeightPx ?? Number.POSITIVE_INFINITY);
  return {
    pageWidthMicrons: Math.round((renderedLandscape ? longMm : shortMm) * MICRONS_PER_MM),
    pageHeightMicrons: Math.round((renderedLandscape ? shortMm : longMm) * MICRONS_PER_MM)
  };
}

/** Processes a single ready job through to a terminal/awaiting state. */
export async function processJob(deps: ServerEngineDeps, jobId: string): Promise<ProcessResult> {
  // incoming -> validating
  let folder = transitionJobFolder(deps.hubRoot, jobId, "incoming", "validating");
  let manifest = readManifest(folder);
  manifest = appendHistory(deps, manifest, "incoming", "validating");
  writeManifest(folder, manifest);
  deps.onJobState?.(jobId, "validating", manifest);

  // resolve printer + preset
  const target = deps.resolveTarget(manifest);
  if (target === null) {
    folder = transitionJobFolder(deps.hubRoot, jobId, "validating", "failed");
    manifest = appendHistory(deps, manifest, "validating", "failed", "no matching printer/preset");
    writeManifest(folder, manifest);
    deps.onJobState?.(jobId, "failed", manifest);
    return { jobId, finalState: "failed", error: "no matching printer/preset" };
  }

  // duplicate detection (Phase 10, gap G9)
  if (deps.isDuplicate?.(manifest) === true) {
    folder = transitionJobFolder(deps.hubRoot, jobId, "validating", "failed");
    manifest = appendHistory(deps, manifest, "validating", "failed", "duplicate — already printed");
    writeManifest(folder, manifest);
    deps.onJobState?.(jobId, "failed", manifest);
    return { jobId, finalState: "failed", error: "duplicate — already printed" };
  }

  // approval gating (Phase 6)
  const needsApproval = deps.requiresApproval
    ? deps.requiresApproval(manifest)
    : manifest.approval.mode === "require_approval" && manifest.approval.state !== "approved";
  if (needsApproval) {
    folder = transitionJobFolder(deps.hubRoot, jobId, "validating", "waiting_approval");
    manifest = appendHistory(deps, manifest, "validating", "waiting_approval");
    manifest = { ...manifest, approval: { ...manifest.approval, state: "pending" } };
    writeManifest(folder, manifest);
    deps.onJobState?.(jobId, "waiting_approval", manifest);
    return { jobId, finalState: "waiting_approval" };
  }

  return printJob(deps, jobId, "validating", manifest, target);
}

/** Prints a job that is approved/auto, transitioning into Printing and on to Done/Failed. */
export async function printJob(
  deps: ServerEngineDeps,
  jobId: string,
  from: PrintJobState,
  manifestIn: PrintJobManifest,
  target: ResolvedTarget
): Promise<ProcessResult> {
  let folder = transitionJobFolder(deps.hubRoot, jobId, from, "printing");
  let manifest = appendHistory(deps, manifestIn, from, "printing");
  writeManifest(folder, manifest);
  deps.onJobState?.(jobId, "printing", manifest);

  const alreadyPrinted = readPrinted(folder);
  const jobCopies = Math.max(1, manifest.requestedOutput.copies);
  // Test print prints only the first image (spec §18#3).
  const effectiveFiles = manifest.testPrintFirstOnly === true ? manifest.files.slice(0, 1) : manifest.files;
  const remaining: PrintableImage[] = effectiveFiles
    .filter((f) => !alreadyPrinted.has(f.path))
    .map((f) => ({
      filePath: path.join(folder, f.path),
      copies: Math.max(1, f.copies) * jobCopies,
      ...physicalPageForRenderedFile(target.preset, f)
    }));

  const request: PrintRequest = {
    jobId,
    preset: target.preset,
    windowsPrinterName: target.profile.windowsPrinterName,
    images: remaining
  };

  let result;
  try {
    result = await deps.adapter.print(request);
  } catch (err) {
    result = { success: false, printedFiles: [] as string[], error: err instanceof Error ? err.message : String(err) };
  }

  // Record progress for resume (gap G13). Adapter reports printed by absolute filePath; map back to rel paths.
  const absToRel = new Map(manifest.files.map((f) => [path.join(folder, f.path), f.path] as const));
  for (const abs of result.printedFiles) {
    const rel = absToRel.get(abs) ?? abs;
    alreadyPrinted.add(rel);
  }
  writePrinted(folder, alreadyPrinted);

  const allDone = effectiveFiles.every((f) => alreadyPrinted.has(f.path));
  if (result.success && allDone) {
    folder = transitionJobFolder(deps.hubRoot, jobId, "printing", "done");
    manifest = appendHistory(deps, manifest, "printing", "done");
    writeManifest(folder, manifest);
    deps.onCompleted?.(manifest);
    deps.onJobState?.(jobId, "done", manifest);
    return { jobId, finalState: "done" };
  }

  folder = transitionJobFolder(deps.hubRoot, jobId, "printing", "failed");
  const note = result.error ?? "print incomplete";
  manifest = appendHistory(deps, manifest, "printing", "failed", note);
  writeManifest(folder, manifest);
  deps.onJobState?.(jobId, "failed", manifest);
  return { jobId, finalState: "failed", error: note };
}

/** Admin approves a waiting job → moves it into printing (Phase 6). */
export async function approveJob(deps: ServerEngineDeps, jobId: string): Promise<ProcessResult> {
  const folder = jobDir(deps.hubRoot, "waiting_approval", jobId);
  let manifest = readManifest(folder);
  manifest = { ...manifest, approval: { ...manifest.approval, state: "approved" } };
  writeManifest(folder, manifest);
  const target = deps.resolveTarget(manifest);
  if (target === null) {
    const failed = transitionJobFolder(deps.hubRoot, jobId, "waiting_approval", "failed");
    manifest = appendHistory(deps, manifest, "waiting_approval", "failed", "no matching printer/preset");
    writeManifest(failed, manifest);
    return { jobId, finalState: "failed", error: "no matching printer/preset" };
  }
  return printJob(deps, jobId, "waiting_approval", manifest, target);
}

/** Admin rejects a waiting job → rejected. */
export function rejectJob(deps: ServerEngineDeps, jobId: string, note?: string): ProcessResult {
  const folder = transitionJobFolder(deps.hubRoot, jobId, "waiting_approval", "rejected");
  let manifest = readManifest(folder);
  manifest = appendHistory(deps, { ...manifest, approval: { ...manifest.approval, state: "rejected" } }, "waiting_approval", "rejected", note);
  writeManifest(folder, manifest);
  return { jobId, finalState: "rejected" };
}

/** Retries a failed job — re-enters printing, skipping already-printed images (gap G13). */
export async function retryJob(deps: ServerEngineDeps, jobId: string): Promise<ProcessResult> {
  const folder = jobDir(deps.hubRoot, "failed", jobId);
  const manifest = readManifest(folder);
  const target = deps.resolveTarget(manifest);
  if (target === null) {
    return { jobId, finalState: "failed", error: "no matching printer/preset" };
  }
  return printJob(deps, jobId, "failed", manifest, target);
}

/** Processes every ready job once. Returns per-job results. */
export async function runOnce(deps: ServerEngineDeps): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  for (const jobId of scanReadyJobs(deps.hubRoot)) {
    results.push(await processJob(deps, jobId));
  }
  return results;
}

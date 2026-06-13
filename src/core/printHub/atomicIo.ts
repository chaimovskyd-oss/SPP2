// Atomic, race-free job-folder IO for the shared queue (gap G2).
//
// NODE-ONLY — runs in the Electron main process / Print Hub Server, never the renderer.
//
// Publishing protocol: a job is assembled inside `<Incoming>/.staging/<jobId>` (same volume
// as Incoming, so rename is atomic). The READY sentinel is written INTO the staging folder
// BEFORE the final rename, so the rename publishes a complete-and-ready folder in one atomic
// step. The watcher only ever picks up folders that already contain READY, so it can never
// observe a half-copied job.

import fs from "node:fs";
import path from "node:path";

import { STATE_FOLDERS, type PrintJobManifest, type PrintJobState } from "@/types/printHub";
import { JOB_MANIFEST_NAME, parseManifest, serializeManifest } from "./jobPackage";

export const READY_SENTINEL = "READY";
const STAGING_FOLDER = ".staging";

export function hubStateDir(hubRoot: string, state: PrintJobState): string {
  return path.join(hubRoot, STATE_FOLDERS[state]);
}

export function jobDir(hubRoot: string, state: PrintJobState, jobId: string): string {
  return path.join(hubStateDir(hubRoot, state), jobId);
}

/** Creates every state folder, the staging area, and the config folder. Idempotent. */
export function ensureHubLayout(hubRoot: string): void {
  for (const state of Object.keys(STATE_FOLDERS) as PrintJobState[]) {
    fs.mkdirSync(hubStateDir(hubRoot, state), { recursive: true });
  }
  fs.mkdirSync(path.join(hubStateDir(hubRoot, "incoming"), STAGING_FOLDER), { recursive: true });
  fs.mkdirSync(path.join(hubRoot, "config"), { recursive: true });
}

function stagingDir(hubRoot: string, jobId: string): string {
  return path.join(hubStateDir(hubRoot, "incoming"), STAGING_FOLDER, jobId);
}

/** Begins assembling a job in the staging area; returns the staging dir with images/ + previews/ ready. */
export function beginJobStaging(hubRoot: string, jobId: string): string {
  const dir = stagingDir(hubRoot, jobId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "images"), { recursive: true });
  fs.mkdirSync(path.join(dir, "previews"), { recursive: true });
  return dir;
}

/**
 * Atomically publishes a fully-assembled staging job into Incoming.
 * Writes READY into staging first, then renames staging -> Incoming/<jobId>.
 * Returns the published job directory.
 */
export function finalizeJob(hubRoot: string, jobId: string): string {
  const staging = stagingDir(hubRoot, jobId);
  if (!fs.existsSync(staging)) {
    throw new Error(`No staged job to finalize: ${jobId}`);
  }
  fs.writeFileSync(path.join(staging, READY_SENTINEL), "");
  const dest = jobDir(hubRoot, "incoming", jobId);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(staging, dest);
  return dest;
}

export function isJobReady(jobFolder: string): boolean {
  return fs.existsSync(path.join(jobFolder, READY_SENTINEL));
}

/** Lists job ids in Incoming that carry READY, skipping the staging dir and any dotfiles. */
export function listReadyJobIds(hubRoot: string): string[] {
  const incoming = hubStateDir(hubRoot, "incoming");
  if (!fs.existsSync(incoming)) {
    return [];
  }
  return fs
    .readdirSync(incoming, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((id) => isJobReady(path.join(incoming, id)));
}

/** Atomically moves a job folder between two state folders (same volume). Returns the new path. */
export function transitionJobFolder(
  hubRoot: string,
  jobId: string,
  from: PrintJobState,
  to: PrintJobState
): string {
  const src = jobDir(hubRoot, from, jobId);
  const dest = jobDir(hubRoot, to, jobId);
  if (!fs.existsSync(src)) {
    throw new Error(`Job ${jobId} not found in ${from}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(src, dest);
  return dest;
}

export function writeManifest(jobFolder: string, manifest: PrintJobManifest): void {
  const tmp = path.join(jobFolder, `${JOB_MANIFEST_NAME}.tmp`);
  fs.writeFileSync(tmp, serializeManifest(manifest));
  fs.renameSync(tmp, path.join(jobFolder, JOB_MANIFEST_NAME));
}

export function readManifest(jobFolder: string): PrintJobManifest {
  const json = fs.readFileSync(path.join(jobFolder, JOB_MANIFEST_NAME), "utf-8");
  return parseManifest(json);
}

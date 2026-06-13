// LAN ingest orchestrator: turns an incoming multipart upload (manifest + streamed image parts)
// into a complete, atomically-published job in the hub's Incoming folder — reusing the SAME
// staging/READY protocol as the folder-publish path (src/core/printHub/atomicIo.ts). The HTTP
// plumbing (busboy) lives in src/printHubServer/lanServer.ts and drives these primitives.
//
// NODE-ONLY.

import fs from "node:fs";
import path from "node:path";

import type { PrintJobManifest } from "@/types/printHub";
import { beginJobStaging, ensureHubLayout, finalizeJob, writeManifest } from "./atomicIo";
import { isDuplicateFingerprint } from "./idempotency";

export interface IngestHandle {
  hubRoot: string;
  jobId: string;
  stagingDir: string;
  /** Relative paths the manifest declares (images/… + any previews referenced). */
  expected: Set<string>;
  received: Set<string>;
}

/** True when this job's fingerprint was already printed (Done/Archive) — caller should skip re-queue. */
export function isDuplicateJob(hubRoot: string, manifest: PrintJobManifest): boolean {
  return isDuplicateFingerprint(hubRoot, manifest.jobFingerprint);
}

/**
 * Normalizes an uploaded part filename to a safe job-relative path, or null if it is unsafe.
 * Only `images/<base>` and `previews/<base>` are allowed; `base` is a single path segment of
 * `[A-Za-z0-9._-]`. Rejects traversal (`..`), absolute paths, backslashes, and nested folders.
 */
export function sanitizeJobRelPath(filename: string): string | null {
  if (typeof filename !== "string" || filename.length === 0) return null;
  const norm = filename.trim();
  // Reject backslashes, traversal, and absolute paths outright (no normalization that could hide them).
  if (norm.includes("\\") || norm.includes("..") || norm.startsWith("/")) return null;
  const m = /^(images|previews)\/([A-Za-z0-9._-]+)$/.exec(norm);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Begins a staged ingest: ensures layout, clears any prior staging, records expected file paths. */
export function beginIngest(hubRoot: string, manifest: PrintJobManifest): IngestHandle {
  ensureHubLayout(hubRoot);
  const stagingDir = beginJobStaging(hubRoot, manifest.jobId);
  const expected = new Set<string>(manifest.files.map((f) => f.path));
  return { hubRoot, jobId: manifest.jobId, stagingDir, expected, received: new Set() };
}

/** Resolves a part filename to its absolute staging path (creating the subfolder), or null if unsafe. */
export function resolvePart(handle: IngestHandle, filename: string): { absPath: string; rel: string } | null {
  const rel = sanitizeJobRelPath(filename);
  if (rel === null) return null;
  const absPath = path.join(handle.stagingDir, rel);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  return { absPath, rel };
}

/** Marks a relative path as fully received (call after the file stream closes). */
export function markReceived(handle: IngestHandle, rel: string): void {
  handle.received.add(rel);
}

/** The manifest image paths that have not yet been received. */
export function missingFiles(handle: IngestHandle): string[] {
  return [...handle.expected].filter((rel) => !handle.received.has(rel));
}

/**
 * Verifies every declared image arrived, writes job.json into staging, then atomically publishes
 * into Incoming. Throws if any manifest file is missing (the caller cleans up + returns 400).
 */
export function finalizeIngest(handle: IngestHandle, manifest: PrintJobManifest): { jobId: string; dest: string } {
  const missing = missingFiles(handle);
  if (missing.length > 0) {
    throw new Error(`missing image parts: ${missing.join(", ")}`);
  }
  writeManifest(handle.stagingDir, manifest);
  const dest = finalizeJob(handle.hubRoot, handle.jobId);
  return { jobId: handle.jobId, dest };
}

/** Removes the staging folder (orphan cleanup on any error). Best-effort. */
export function abortIngest(handle: IngestHandle): void {
  try {
    fs.rmSync(handle.stagingDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/**
 * Best-effort free-space check on the staging volume. Returns true when at least `needBytes`
 * (plus a small margin) is free, or when the platform cannot report it (never block on unknown).
 */
export function hasFreeSpace(hubRoot: string, needBytes: number): boolean {
  if (!Number.isFinite(needBytes) || needBytes <= 0) return true;
  const statfs = (fs as unknown as { statfsSync?: (p: string) => { bavail: number; bsize: number } }).statfsSync;
  if (typeof statfs !== "function") return true;
  try {
    const s = statfs(hubRoot);
    const free = s.bavail * s.bsize;
    return free > needBytes + 64 * 1024 * 1024; // 64 MB margin
  } catch {
    return true;
  }
}

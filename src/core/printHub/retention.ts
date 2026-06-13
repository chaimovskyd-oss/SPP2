// Retention / auto-purge of finished jobs (Phase 10, gap G12). Deletes job folders in terminal
// states older than retentionDays, keeping the shared queue from growing without bound.
//
// NODE-ONLY.

import fs from "node:fs";
import path from "node:path";

import { STATE_FOLDERS } from "@/types/printHub";

const PURGEABLE = [STATE_FOLDERS.done, STATE_FOLDERS.failed, STATE_FOLDERS.canceled, STATE_FOLDERS.rejected, STATE_FOLDERS.archived];

/** Age of a job in days, preferring its manifest createdAt and falling back to folder mtime. */
function jobAgeDays(jobFolder: string, now: number): number {
  let created = now;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(jobFolder, "job.json"), "utf-8")) as { createdAt?: string };
    const t = m.createdAt ? Date.parse(m.createdAt) : NaN;
    created = Number.isNaN(t) ? fs.statSync(jobFolder).mtimeMs : t;
  } catch {
    try {
      created = fs.statSync(jobFolder).mtimeMs;
    } catch {
      return 0;
    }
  }
  return (now - created) / (1000 * 60 * 60 * 24);
}

/**
 * Deletes terminal-state jobs older than retentionDays. retentionDays <= 0 keeps everything.
 * Returns the number of jobs purged.
 */
export function purgeOldJobs(hubRoot: string, retentionDays: number, now: number = Date.now()): number {
  if (retentionDays <= 0) return 0;
  let purged = 0;
  for (const folder of PURGEABLE) {
    const dir = path.join(hubRoot, folder);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const jobFolder = path.join(dir, entry.name);
      if (jobAgeDays(jobFolder, now) >= retentionDays) {
        fs.rmSync(jobFolder, { recursive: true, force: true });
        purged += 1;
      }
    }
  }
  return purged;
}

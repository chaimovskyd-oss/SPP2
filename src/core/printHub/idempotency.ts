// Duplicate-job detection (Phase 10, gap G9). Before printing, the server checks whether a job
// with the same fingerprint was already printed (lives in Done/Archive), preventing accidental
// re-prints of the same set+params.
//
// NODE-ONLY.

import fs from "node:fs";
import path from "node:path";

import { STATE_FOLDERS } from "@/types/printHub";

const CHECKED_STATES = [STATE_FOLDERS.done, STATE_FOLDERS.archived];

/** Returns the set of fingerprints already printed (Done + Archive). */
export function printedFingerprints(hubRoot: string): Set<string> {
  const out = new Set<string>();
  for (const folder of CHECKED_STATES) {
    const dir = path.join(hubRoot, folder);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, entry.name, "job.json"), "utf-8")) as { jobFingerprint?: string };
        if (typeof m.jobFingerprint === "string" && m.jobFingerprint.length > 0) out.add(m.jobFingerprint);
      } catch {
        // ignore unreadable jobs
      }
    }
  }
  return out;
}

/** True when a job with this fingerprint already exists in Done/Archive. */
export function isDuplicateFingerprint(hubRoot: string, fingerprint: string): boolean {
  if (!fingerprint) return false;
  return printedFingerprints(hubRoot).has(fingerprint);
}

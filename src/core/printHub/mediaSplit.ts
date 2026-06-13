// Smart job splitting when media (ribbon/paper) is insufficient (Phase 7, gap G13/spec §19).
// Pure — splits a job into ordered parts each fitting the available unit count, preserving image
// order and exact copy counts (a file's copies may straddle a part boundary).

import { computeJobFingerprint, estimateRequiredUnits } from "./jobPackage";
import type { JobFile, PrintJobManifest } from "@/types/printHub";

/** Flattens files into an ordered list of per-print path tokens (copies × jobCopies). */
function expandUnits(files: JobFile[], jobCopies: number): string[] {
  const units: string[] = [];
  const copies = Math.max(1, jobCopies);
  for (const f of files) {
    for (let c = 0; c < Math.max(1, f.copies) * copies; c += 1) {
      units.push(f.path);
    }
  }
  return units;
}

/** Collapses an ordered run of path tokens back into JobFile[] (consecutive same-path → copies). */
function collapse(tokens: string[], byPath: Map<string, JobFile>): JobFile[] {
  const out: JobFile[] = [];
  for (const path of tokens) {
    const last = out[out.length - 1];
    if (last && last.path === path) {
      last.copies += 1;
    } else {
      out.push({ path, copies: 1, contentHash: byPath.get(path)?.contentHash });
    }
  }
  return out;
}

/**
 * Plans a split of a job's files into ordered parts. Part sizes default to `availableUnits` for
 * every part (i.e. "print until media runs out, change media, continue"). Returns one JobFile[]
 * per part. Throws if availableUnits < 1.
 */
export function planSplit(files: JobFile[], jobCopies: number, availableUnits: number): JobFile[][] {
  if (availableUnits < 1) throw new Error("availableUnits must be >= 1");
  const byPath = new Map(files.map((f) => [f.path, f] as const));
  const units = expandUnits(files, jobCopies);
  const parts: JobFile[][] = [];
  for (let i = 0; i < units.length; i += availableUnits) {
    parts.push(collapse(units.slice(i, i + availableUnits), byPath));
  }
  return parts.length > 0 ? parts : [[]];
}

/**
 * Builds child manifests for a split job. Each part keeps the parent's settings, gets a derived
 * jobId, splitInfo, recomputed fingerprint, and its own requiredUnits.
 */
export function buildSplitManifests(parent: PrintJobManifest, parts: JobFile[][]): PrintJobManifest[] {
  const partCount = parts.length;
  // The expansion already baked the job-level copies into each part's file copies, so child
  // manifests use copies:1 to avoid re-multiplying during printing/unit accounting.
  return parts.map((files, index) => {
    const partIndex = index + 1;
    const jobId = `${parent.jobId}_part_${partIndex}`;
    const requestedOutput = { ...parent.requestedOutput, copies: 1 };
    const fingerprint = computeJobFingerprint({
      files,
      size: requestedOutput.size,
      finish: requestedOutput.finish,
      borderMode: requestedOutput.borderMode,
      copies: 1
    });
    return {
      ...parent,
      jobId,
      requestedOutput,
      files,
      jobFingerprint: fingerprint,
      splitInfo: { isSplitJob: true, parentJobId: parent.jobId, partIndex, partCount },
      mediaCheck: { ...parent.mediaCheck, requiredUnits: estimateRequiredUnits(files, 1) },
      statusHistory: [{ state: "incoming", at: new Date().toISOString(), by: parent.sourceComputer, note: `part ${partIndex}/${partCount}` }]
    };
  });
}

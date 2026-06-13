// Daily production log (Phase 10, spec §18#10). Appends one JSON line per completed job to
// logs/production_YYYY-MM-DD.jsonl on the hub, for shop reporting (counts by size/finish/hour).
//
// NODE-ONLY.

import fs from "node:fs";
import path from "node:path";

import type { PrintJobManifest } from "@/types/printHub";

export interface ProductionLogEntry {
  at: string;
  jobId: string;
  sourceComputer: string;
  size: string;
  finish: string;
  borderMode: string;
  prints: number;
}

/** Total prints in a job = sum(file.copies) * job copies. */
export function jobPrintCount(manifest: PrintJobManifest): number {
  const perPass = manifest.files.reduce((sum, f) => sum + Math.max(1, f.copies), 0);
  return perPass * Math.max(1, manifest.requestedOutput.copies);
}

function logFile(hubRoot: string, date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return path.join(hubRoot, "logs", `production_${stamp}.jsonl`);
}

export function appendProductionLog(hubRoot: string, manifest: PrintJobManifest, now: Date = new Date()): void {
  const entry: ProductionLogEntry = {
    at: now.toISOString(),
    jobId: manifest.jobId,
    sourceComputer: manifest.sourceComputer,
    size: manifest.requestedOutput.size,
    finish: manifest.requestedOutput.finish,
    borderMode: manifest.requestedOutput.borderMode,
    prints: jobPrintCount(manifest)
  };
  const file = logFile(hubRoot, now);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf-8");
}

/** Reads and parses a day's production log (for reporting UIs). */
export function readProductionLog(hubRoot: string, date: Date = new Date()): ProductionLogEntry[] {
  const file = logFile(hubRoot, date);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ProductionLogEntry);
}

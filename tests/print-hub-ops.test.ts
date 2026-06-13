import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { beginJobStaging, ensureHubLayout, finalizeJob, transitionJobFolder, writeManifest } from "@/core/printHub/atomicIo";
import { buildJobManifest } from "@/core/printHub/jobPackage";
import { isDuplicateFingerprint } from "@/core/printHub/idempotency";
import { purgeOldJobs } from "@/core/printHub/retention";
import { appendProductionLog, jobPrintCount, readProductionLog } from "@/core/printHub/productionLog";
import type { PrintJobState } from "@/types/printHub";

let hubRoot: string;

beforeEach(() => {
  hubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spp-ops-"));
  ensureHubLayout(hubRoot);
});
afterEach(() => fs.rmSync(hubRoot, { recursive: true, force: true }));

function seedInto(state: PrintJobState, jobId: string, createdAt?: string) {
  const manifest = buildJobManifest({
    source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
    borderMode: "borderless", copies: 1, jobId, createdAt,
    files: [{ path: "images/001.jpg", copies: 1 }]
  });
  const staging = beginJobStaging(hubRoot, jobId);
  writeManifest(staging, manifest);
  finalizeJob(hubRoot, jobId);
  if (state !== "incoming") transitionJobFolder(hubRoot, jobId, "incoming", state);
  return manifest;
}

describe("idempotency (gap G9)", () => {
  it("detects a fingerprint already in Done", () => {
    const m = seedInto("done", "JOB1");
    expect(isDuplicateFingerprint(hubRoot, m.jobFingerprint)).toBe(true);
    expect(isDuplicateFingerprint(hubRoot, "fp1:nonexistent")).toBe(false);
  });
});

describe("retention purge (gap G12)", () => {
  it("purges terminal jobs older than retentionDays, keeps fresh ones", () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    seedInto("done", "OLD", old);
    seedInto("done", "FRESH", new Date().toISOString());
    const purged = purgeOldJobs(hubRoot, 14);
    expect(purged).toBe(1);
    expect(fs.existsSync(path.join(hubRoot, "Done", "OLD"))).toBe(false);
    expect(fs.existsSync(path.join(hubRoot, "Done", "FRESH"))).toBe(true);
  });

  it("retentionDays <= 0 keeps everything", () => {
    seedInto("done", "KEEP", new Date(0).toISOString());
    expect(purgeOldJobs(hubRoot, 0)).toBe(0);
  });
});

describe("production log (spec §18#10)", () => {
  it("counts prints and appends/reads a daily log", () => {
    const manifest = buildJobManifest({
      source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
      borderMode: "borderless", copies: 2, jobId: "JOBP",
      files: [{ path: "a.jpg", copies: 1 }, { path: "b.jpg", copies: 2 }]
    });
    expect(jobPrintCount(manifest)).toBe(6); // (1+2)*2

    const now = new Date("2026-06-05T12:00:00Z");
    appendProductionLog(hubRoot, manifest, now);
    appendProductionLog(hubRoot, manifest, now);
    const entries = readProductionLog(hubRoot, now);
    expect(entries).toHaveLength(2);
    expect(entries[0].prints).toBe(6);
    expect(entries[0].size).toBe("10x15");
  });
});

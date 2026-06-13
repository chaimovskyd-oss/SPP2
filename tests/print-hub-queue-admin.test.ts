import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { beginJobStaging, ensureHubLayout, finalizeJob, transitionJobFolder, writeManifest } from "@/core/printHub/atomicIo";
import { buildJobManifest } from "@/core/printHub/jobPackage";
import { jobAction, listQueue } from "@/core/printHub/queueAdmin";
import { availableOptionsFromProfiles } from "@/core/printHub/resolveProfile";
import { DEFAULT_PROFILES } from "@/core/printHub/defaultProfiles";
import type { PrintJobState } from "@/types/printHub";

let hubRoot: string;
beforeEach(() => { hubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spp-qadmin-")); ensureHubLayout(hubRoot); });
afterEach(() => fs.rmSync(hubRoot, { recursive: true, force: true }));

function seed(jobId: string, state: PrintJobState, approvalMode?: "auto" | "require_approval") {
  const m = buildJobManifest({
    source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
    borderMode: "borderless", copies: 1, jobId, approvalMode,
    files: [{ path: "images/001.jpg", copies: 1 }]
  });
  const staging = beginJobStaging(hubRoot, jobId);
  writeManifest(staging, m);
  finalizeJob(hubRoot, jobId);
  if (state !== "incoming") transitionJobFolder(hubRoot, jobId, "incoming", state);
}

describe("queueAdmin.listQueue", () => {
  it("summarises jobs across states", () => {
    seed("A", "waiting_approval", "require_approval");
    seed("B", "done");
    const jobs = listQueue(hubRoot);
    expect(jobs).toHaveLength(2);
    expect(jobs.find((j) => j.jobId === "A")?.state).toBe("waiting_approval");
    expect(jobs.find((j) => j.jobId === "B")?.size).toBe("10x15");
  });
});

describe("queueAdmin.jobAction", () => {
  it("approve moves a job back to incoming for the server to print", () => {
    seed("A", "waiting_approval", "require_approval");
    expect(jobAction(hubRoot, "A", "approve").success).toBe(true);
    expect(fs.existsSync(path.join(hubRoot, "Incoming", "A"))).toBe(true);
  });
  it("cancel and delete work; missing job errors", () => {
    seed("B", "failed");
    expect(jobAction(hubRoot, "B", "delete").success).toBe(true);
    expect(jobAction(hubRoot, "ghost", "cancel").success).toBe(false);
  });
});

describe("availableOptionsFromProfiles", () => {
  it("derives sizes/finishes/borders offered by the configured printers", () => {
    const opts = availableOptionsFromProfiles(DEFAULT_PROFILES);
    expect(opts.sizes).toContain("10x15");
    expect(opts.sizes).toContain("15x20");
    expect(opts.finishes).toContain("glossy");
    expect(opts.finishes).toContain("matte");
    expect(opts.borderModes).toContain("borderless");
  });
});

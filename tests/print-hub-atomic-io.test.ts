import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  beginJobStaging,
  ensureHubLayout,
  finalizeJob,
  isJobReady,
  jobDir,
  listReadyJobIds,
  readManifest,
  transitionJobFolder,
  writeManifest
} from "@/core/printHub/atomicIo";
import { buildJobManifest } from "@/core/printHub/jobPackage";
import { STATE_FOLDERS } from "@/types/printHub";

let hubRoot: string;

beforeEach(() => {
  hubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spp-hub-"));
});

afterEach(() => {
  fs.rmSync(hubRoot, { recursive: true, force: true });
});

function manifestFor(jobId: string) {
  return buildJobManifest({
    source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
    borderMode: "borderless", copies: 1, jobId,
    files: [{ path: "images/001.jpg", copies: 1 }]
  });
}

describe("Print Hub atomic IO", () => {
  it("creates the full hub layout", () => {
    ensureHubLayout(hubRoot);
    for (const folder of Object.values(STATE_FOLDERS)) {
      expect(fs.existsSync(path.join(hubRoot, folder))).toBe(true);
    }
    expect(fs.existsSync(path.join(hubRoot, "config"))).toBe(true);
  });

  it("only exposes a job after finalize (no half-copied reads — G2)", () => {
    ensureHubLayout(hubRoot);
    const staging = beginJobStaging(hubRoot, "JOB1");
    fs.writeFileSync(path.join(staging, "images", "001.jpg"), "fake");
    writeManifest(staging, manifestFor("JOB1"));

    // Before finalize: nothing visible in Incoming.
    expect(listReadyJobIds(hubRoot)).toEqual([]);

    finalizeJob(hubRoot, "JOB1");
    expect(listReadyJobIds(hubRoot)).toEqual(["JOB1"]);
    expect(isJobReady(jobDir(hubRoot, "incoming", "JOB1"))).toBe(true);
    expect(readManifest(jobDir(hubRoot, "incoming", "JOB1")).jobId).toBe("JOB1");
  });

  it("ignores the staging dir when listing ready jobs", () => {
    ensureHubLayout(hubRoot);
    beginJobStaging(hubRoot, "JOB_STAGED");
    expect(listReadyJobIds(hubRoot)).toEqual([]);
  });

  it("transitions a job folder atomically between states", () => {
    ensureHubLayout(hubRoot);
    const staging = beginJobStaging(hubRoot, "JOB1");
    writeManifest(staging, manifestFor("JOB1"));
    finalizeJob(hubRoot, "JOB1");

    const dest = transitionJobFolder(hubRoot, "JOB1", "incoming", "printing");
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.existsSync(jobDir(hubRoot, "incoming", "JOB1"))).toBe(false);
    expect(jobDir(hubRoot, "printing", "JOB1")).toBe(dest);
  });

  it("throws when transitioning a missing job", () => {
    ensureHubLayout(hubRoot);
    expect(() => transitionJobFolder(hubRoot, "NOPE", "incoming", "printing")).toThrow(/not found/);
  });
});

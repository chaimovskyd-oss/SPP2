// End-to-end integration of the Print Hub server pipeline WITHOUT hardware.
// Drives the real engine (atomicIo publish → listReadyJobIds → processJob → resolveTarget →
// approval → printJob → DriverAdapter.print) with a real createSpoolerAdapter whose print syscall
// is a FileAdapter that copies each image to a "_printed" output folder — proving printing ran and
// produced output on disk.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  beginJobStaging,
  ensureHubLayout,
  finalizeJob,
  jobDir,
  listReadyJobIds,
  readManifest,
  writeManifest
} from "@/core/printHub/atomicIo";
import { buildJobManifest } from "@/core/printHub/jobPackage";
import { DEFAULT_PROFILES } from "@/core/printHub/defaultProfiles";
import { createSpoolerAdapter, type PrintImageOptions } from "@/core/printHub/adapters/spoolerAdapter";
import { resolveTargetFromProfiles } from "@/core/printHub/printerProfiles";
import { loadStations, requiresApprovalForJob, saveStations } from "@/core/printHub/stations";
import { jobAction } from "@/core/printHub/queueAdmin";
import { processJob, runOnce, type ServerEngineDeps } from "@/core/printHub/serverEngine";
import type { ApprovalMode, PrinterProfile, Station } from "@/types/printHub";

let hubRoot: string;
let printedDir: string;
let printCount: number;
let concurrent: number;
let maxConcurrent: number;

// FileAdapter print syscall: writes each printed image to disk (simulates a real printer's output).
const printImage = async (filePath: string, _options: PrintImageOptions): Promise<void> => {
  concurrent += 1;
  maxConcurrent = Math.max(maxConcurrent, concurrent);
  fs.mkdirSync(printedDir, { recursive: true });
  fs.copyFileSync(filePath, path.join(printedDir, `${printCount}_${path.basename(filePath)}`));
  printCount += 1;
  await new Promise((r) => setTimeout(r, 0));
  concurrent -= 1;
};

const adapter = createSpoolerAdapter(printImage);

function deps(profiles: PrinterProfile[] = DEFAULT_PROFILES): ServerEngineDeps {
  return {
    hubRoot,
    serverName: "PRINT-PC",
    adapter,
    resolveTarget: (m) => resolveTargetFromProfiles(profiles, m),
    requiresApproval: (m) => requiresApprovalForJob(loadStations(hubRoot), m)
  };
}

function pad(n: number): string {
  return String(n).padStart(3, "0");
}

function publish(jobId: string, opts: { files?: number; copies?: number; approvalMode?: ApprovalMode; sourceComputer?: string } = {}): void {
  const count = opts.files ?? 2;
  const files = Array.from({ length: count }, (_, i) => ({ path: `images/${pad(i + 1)}.jpg`, copies: 1 }));
  const manifest = buildJobManifest({
    source: "spp2_editor", sourceComputer: opts.sourceComputer ?? "DESK-2", size: "10x15", finish: "glossy",
    borderMode: "borderless", copies: opts.copies ?? 1, files, jobId, approvalMode: opts.approvalMode
  });
  const staging = beginJobStaging(hubRoot, jobId);
  for (const f of files) fs.writeFileSync(path.join(staging, f.path), `img-${jobId}-${f.path}`);
  writeManifest(staging, manifest);
  finalizeJob(hubRoot, jobId);
}

// Creates a job folder directly in Incoming WITHOUT a READY sentinel.
function publishWithoutReady(jobId: string): void {
  const dir = jobDir(hubRoot, "incoming", jobId);
  fs.mkdirSync(path.join(dir, "images"), { recursive: true });
  fs.writeFileSync(path.join(dir, "images", "001.jpg"), "x");
  const manifest = buildJobManifest({
    source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
    borderMode: "borderless", copies: 1, jobId, files: [{ path: "images/001.jpg", copies: 1 }]
  });
  fs.writeFileSync(path.join(dir, "job.json"), JSON.stringify(manifest, null, 2));
}

const trusted: Station[] = [{ computerName: "DESK-2", displayName: "עיצוב", role: "designer", trusted: true }];

beforeEach(() => {
  hubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spp-e2e-"));
  ensureHubLayout(hubRoot);
  printedDir = path.join(hubRoot, "_printed");
  printCount = 0;
  concurrent = 0;
  maxConcurrent = 0;
});
afterEach(() => fs.rmSync(hubRoot, { recursive: true, force: true }));

describe("Print Hub end-to-end (FileAdapter)", () => {
  it("ignores a job folder without READY", async () => {
    publishWithoutReady("NR");
    expect(listReadyJobIds(hubRoot)).toEqual([]);
    const results = await runOnce(deps());
    expect(results).toEqual([]);
    expect(printCount).toBe(0);
    expect(fs.existsSync(jobDir(hubRoot, "incoming", "NR"))).toBe(true); // still sitting there
  });

  it("auto-prints a trusted station's auto job, producing output on disk → Done", async () => {
    saveStations(hubRoot, trusted);
    publish("J1", { approvalMode: "auto", sourceComputer: "DESK-2", files: 3 });
    const [res] = await runOnce(deps());
    expect(res.finalState).toBe("done");
    expect(fs.existsSync(jobDir(hubRoot, "done", "J1"))).toBe(true);
    expect(fs.readdirSync(printedDir)).toHaveLength(3); // 3 images printed to disk
  });

  it("holds a non-trusted station's job in WaitingApproval (no output)", async () => {
    saveStations(hubRoot, trusted); // KIOSK is not listed → untrusted
    publish("J2", { approvalMode: "auto", sourceComputer: "KIOSK" });
    const [res] = await runOnce(deps());
    expect(res.finalState).toBe("waiting_approval");
    expect(fs.existsSync(jobDir(hubRoot, "waiting_approval", "J2"))).toBe(true);
    expect(printCount).toBe(0);
  });

  it("approve returns the job to processing and prints it", async () => {
    saveStations(hubRoot, trusted);
    publish("J3", { approvalMode: "require_approval", sourceComputer: "KIOSK", files: 2 });
    await runOnce(deps());
    expect(fs.existsSync(jobDir(hubRoot, "waiting_approval", "J3"))).toBe(true);

    // Admin approves (UI path) → back to Incoming → server reprocesses → prints.
    expect(jobAction(hubRoot, "J3", "approve").success).toBe(true);
    const [res] = await runOnce(deps());
    expect(res.finalState).toBe("done");
    expect(fs.readdirSync(printedDir)).toHaveLength(2);
  });

  it("fails with a clear message when no preset matches", async () => {
    saveStations(hubRoot, trusted);
    publish("J4", { approvalMode: "auto", sourceComputer: "DESK-2" });
    const res = await processJob(deps([]), "J4"); // no printers configured
    expect(res.finalState).toBe("failed");
    expect(res.error).toMatch(/no matching printer\/preset/);
    const manifest = readManifest(jobDir(hubRoot, "failed", "J4"));
    expect(manifest.statusHistory.some((h) => h.note === "no matching printer/preset")).toBe(true);
    expect(printCount).toBe(0);
  });

  it("does not re-print: approve is rejected once the job already left WaitingApproval (no double print)", async () => {
    saveStations(hubRoot, trusted);
    publish("DUP", { approvalMode: "require_approval", sourceComputer: "KIOSK", files: 1 });
    await runOnce(deps());                                   // → waiting_approval
    expect(jobAction(hubRoot, "DUP", "approve").success).toBe(true);
    await runOnce(deps());                                   // prints once → Done
    expect(printCount).toBe(1);
    // A second (stale/duplicate) approve must be refused because it is no longer waiting.
    const second = jobAction(hubRoot, "DUP", "approve");
    expect(second.success).toBe(false);
    await runOnce(deps());
    expect(printCount).toBe(1);                              // still one print
  });

  it("streams large jobs (300 images) without loading them all at once", async () => {
    saveStations(hubRoot, trusted);
    publish("BIG", { approvalMode: "auto", sourceComputer: "DESK-2", files: 300 });
    const [res] = await runOnce(deps());
    expect(res.finalState).toBe("done");
    expect(printCount).toBe(300);             // all printed
    expect(maxConcurrent).toBe(1);            // one image in flight at a time — no bulk load
    expect(fs.readdirSync(printedDir)).toHaveLength(300);
  });
});

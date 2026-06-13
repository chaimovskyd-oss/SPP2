import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { beginJobStaging, ensureHubLayout, finalizeJob, writeManifest } from "@/core/printHub/atomicIo";
import { buildJobManifest } from "@/core/printHub/jobPackage";
import {
  approveJob,
  processJob,
  retryJob,
  runOnce,
  type ResolvedTarget,
  type ServerEngineDeps
} from "@/core/printHub/serverEngine";
import type { DriverAdapter, PrintRequest, PrintResult } from "@/core/printHub/driverAdapter";
import type { ApprovalMode, PrintPreset, PrinterProfile } from "@/types/printHub";

const preset: PrintPreset = {
  id: "dnp_10x15_glossy", name: "10x15 Glossy", widthMm: 100, heightMm: 150, dpi: 300,
  bleedMm: 0, finish: "glossy", borderMode: "borderless", copies: 1
};
const profile: PrinterProfile = {
  deviceId: "dnp1", windowsPrinterName: "DNP DS-RX1HS", displayName: "DNP",
  supportedProducts: ["photo_print"], supportedSizes: ["10x15"], supportedFinishes: ["glossy"], presets: [preset]
};
const target: ResolvedTarget = { profile, preset };

class FakeAdapter implements DriverAdapter {
  readonly id = "fake";
  mode: "all" | "jam_after_first" | "throw" = "all";
  calls: PrintRequest[] = [];
  supports(): boolean {
    return true;
  }
  async print(request: PrintRequest): Promise<PrintResult> {
    this.calls.push(request);
    if (this.mode === "throw") throw new Error("driver crash");
    if (this.mode === "jam_after_first") {
      const first = request.images.slice(0, 1).map((i) => i.filePath);
      return { success: false, printedFiles: first, error: "paper jam" };
    }
    return { success: true, printedFiles: request.images.map((i) => i.filePath) };
  }
}

let hubRoot: string;
let adapter: FakeAdapter;

function deps(resolve?: ServerEngineDeps["resolveTarget"]): ServerEngineDeps {
  return {
    hubRoot,
    serverName: "PRINT-PC",
    adapter,
    resolveTarget: resolve ?? (() => target)
  };
}

function seedJob(jobId: string, opts: { files?: number; approvalMode?: ApprovalMode } = {}): void {
  const fileCount = opts.files ?? 2;
  const files = Array.from({ length: fileCount }, (_, i) => ({ path: `images/${String(i + 1).padStart(3, "0")}.jpg`, copies: 1 }));
  const manifest = buildJobManifest({
    source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
    borderMode: "borderless", copies: 1, files, jobId, approvalMode: opts.approvalMode
  });
  const staging = beginJobStaging(hubRoot, jobId);
  for (const f of files) fs.writeFileSync(path.join(staging, f.path), "img");
  writeManifest(staging, manifest);
  finalizeJob(hubRoot, jobId);
}

beforeEach(() => {
  hubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spp-hub-eng-"));
  ensureHubLayout(hubRoot);
  adapter = new FakeAdapter();
});

afterEach(() => {
  fs.rmSync(hubRoot, { recursive: true, force: true });
});

describe("serverEngine", () => {
  it("auto-prints a job all the way to done", async () => {
    seedJob("JOB1");
    const [result] = await runOnce(deps());
    expect(result.finalState).toBe("done");
    expect(fs.existsSync(path.join(hubRoot, "Done", "JOB1", "job.json"))).toBe(true);
    expect(adapter.calls[0].images).toHaveLength(2);
  });

  it("fails when no printer/preset matches", async () => {
    seedJob("JOB2");
    const result = await processJob(deps(() => null), "JOB2");
    expect(result.finalState).toBe("failed");
    expect(fs.existsSync(path.join(hubRoot, "Failed", "JOB2"))).toBe(true);
  });

  it("holds require_approval jobs, then prints on approval", async () => {
    seedJob("JOB3", { approvalMode: "require_approval" });
    const held = await processJob(deps(), "JOB3");
    expect(held.finalState).toBe("waiting_approval");
    expect(adapter.calls).toHaveLength(0);

    const approved = await approveJob(deps(), "JOB3");
    expect(approved.finalState).toBe("done");
  });

  it("resumes after a jam, skipping already-printed images (gap G13)", async () => {
    seedJob("JOB4", { files: 3 });
    adapter.mode = "jam_after_first";
    const failed = await processJob(deps(), "JOB4");
    expect(failed.finalState).toBe("failed");
    const printedSidecar = JSON.parse(fs.readFileSync(path.join(hubRoot, "Failed", "JOB4", "printed.json"), "utf-8"));
    expect(printedSidecar.printed).toHaveLength(1);

    adapter.mode = "all";
    adapter.calls = [];
    const retried = await retryJob(deps(), "JOB4");
    expect(retried.finalState).toBe("done");
    // retry should only re-send the 2 remaining images
    expect(adapter.calls[0].images).toHaveLength(2);
  });

  it("treats a driver crash as a failure", async () => {
    seedJob("JOB5");
    adapter.mode = "throw";
    const result = await processJob(deps(), "JOB5");
    expect(result.finalState).toBe("failed");
    expect(result.error).toMatch(/crash/);
  });
});

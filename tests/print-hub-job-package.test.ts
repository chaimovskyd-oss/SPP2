import { describe, expect, it } from "vitest";

import {
  buildJobManifest,
  computeJobFingerprint,
  estimateRequiredUnits,
  generateJobId,
  InvalidManifestError,
  parseManifest,
  serializeManifest
} from "@/core/printHub/jobPackage";
import type { JobFile } from "@/types/printHub";

const files: JobFile[] = [
  { path: "images/001.jpg", copies: 1, contentHash: "sha256:aaa" },
  { path: "images/002.jpg", copies: 2, contentHash: "sha256:bbb" }
];

describe("computeJobFingerprint", () => {
  it("is stable for the same inputs", () => {
    const a = computeJobFingerprint({ files, size: "10x15", finish: "glossy", borderMode: "borderless", copies: 1 });
    const b = computeJobFingerprint({ files, size: "10x15", finish: "glossy", borderMode: "borderless", copies: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^fp1:[0-9a-f]{32}$/);
  });

  it("is order-independent on files but sensitive to params", () => {
    const reordered = computeJobFingerprint({ files: [...files].reverse(), size: "10x15", finish: "glossy", borderMode: "borderless", copies: 1 });
    const base = computeJobFingerprint({ files, size: "10x15", finish: "glossy", borderMode: "borderless", copies: 1 });
    expect(reordered).toBe(base);

    const matte = computeJobFingerprint({ files, size: "10x15", finish: "matte", borderMode: "borderless", copies: 1 });
    expect(matte).not.toBe(base);
  });
});

describe("estimateRequiredUnits", () => {
  it("sums per-file copies times job copies", () => {
    expect(estimateRequiredUnits(files, 1)).toBe(3); // 1 + 2
    expect(estimateRequiredUnits(files, 4)).toBe(12);
  });
});

describe("generateJobId", () => {
  it("produces a sortable timestamped id", () => {
    const id = generateJobId(new Date("2026-06-05T15:30:12"), "ABC123");
    expect(id).toBe("2026-06-05_153012_ABC123");
  });
});

describe("buildJobManifest / parseManifest", () => {
  it("builds a complete manifest with defaults and round-trips", () => {
    const manifest = buildJobManifest({
      source: "spp2_editor",
      sourceComputer: "DESK-2",
      size: "10x15",
      finish: "glossy",
      borderMode: "borderless",
      copies: 1,
      files,
      jobId: "2026-06-05_153012_ABC123",
      createdAt: "2026-06-05T15:30:12+03:00"
    });
    expect(manifest.jobSchemaVersion).toBe(1);
    expect(manifest.approval.state).toBeNull();
    expect(manifest.statusHistory[0].state).toBe("incoming");
    expect(manifest.mediaCheck.requiredUnits).toBe(3);

    const parsed = parseManifest(serializeManifest(manifest));
    expect(parsed).toEqual(manifest);
  });

  it("sets pending approval when require_approval", () => {
    const manifest = buildJobManifest({
      source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
      borderMode: "borderless", copies: 1, files, approvalMode: "require_approval"
    });
    expect(manifest.approval.mode).toBe("require_approval");
    expect(manifest.approval.state).toBe("pending");
  });

  it("rejects malformed manifests", () => {
    expect(() => parseManifest("{ not json")).toThrow(InvalidManifestError);
    expect(() => parseManifest(JSON.stringify({ jobSchemaVersion: 1, jobId: "x", files: [] }))).toThrow(/non-empty/);
    expect(() => parseManifest(JSON.stringify({ jobSchemaVersion: 99, jobId: "x", files } ))).toThrow(/unsupported/);
  });
});

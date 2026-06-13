import { describe, expect, it } from "vitest";

import { checkMedia } from "@/core/printHub/mediaInventory";
import { buildSplitManifests, planSplit } from "@/core/printHub/mediaSplit";
import { buildJobManifest } from "@/core/printHub/jobPackage";
import type { JobFile, MediaItem } from "@/types/printHub";

const media: MediaItem[] = [{ presetId: "dnp_10x15", remainingUnits: 84, unitType: "10x15_prints" }];

describe("checkMedia (advisory)", () => {
  it("passes untracked presets", () => {
    const r = checkMedia(media, "unknown", 1000);
    expect(r.sufficient).toBe(true);
    expect(r.tracked).toBe(false);
  });

  it("reports shortfall for tracked presets", () => {
    const r = checkMedia(media, "dnp_10x15", 120);
    expect(r.sufficient).toBe(false);
    expect(r.remaining).toBe(84);
    expect(r.shortfall).toBe(36);
  });
});

describe("planSplit", () => {
  const files: JobFile[] = [
    { path: "images/001.jpg", copies: 1 },
    { path: "images/002.jpg", copies: 1 },
    { path: "images/003.jpg", copies: 1 }
  ];

  it("splits an ordered job into parts that fit the available units", () => {
    const parts = planSplit(files, 1, 2);
    expect(parts).toHaveLength(2);
    expect(parts[0].map((f) => f.path)).toEqual(["images/001.jpg", "images/002.jpg"]);
    expect(parts[1].map((f) => f.path)).toEqual(["images/003.jpg"]);
  });

  it("straddles a file's copies across a part boundary, preserving total count", () => {
    const parts = planSplit([{ path: "a.jpg", copies: 5 }], 1, 3);
    expect(parts).toHaveLength(2);
    expect(parts[0][0]).toEqual({ path: "a.jpg", copies: 3, contentHash: undefined });
    expect(parts[1][0].copies).toBe(2);
  });

  it("accounts for job-level copies", () => {
    const parts = planSplit([{ path: "a.jpg", copies: 1 }], 4, 3);
    // 4 total prints, parts of 3 → [3,1]
    expect(parts.map((p) => p[0].copies)).toEqual([3, 1]);
  });
});

describe("buildSplitManifests", () => {
  it("derives child manifests with split metadata and copies:1", () => {
    const parent = buildJobManifest({
      source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
      borderMode: "borderless", copies: 2, jobId: "JOB1",
      files: [{ path: "a.jpg", copies: 1 }, { path: "b.jpg", copies: 1 }]
    });
    const parts = planSplit(parent.files, parent.requestedOutput.copies, 3); // 4 prints → [3,1]
    const children = buildSplitManifests(parent, parts);

    expect(children).toHaveLength(2);
    expect(children[0].splitInfo).toEqual({ isSplitJob: true, parentJobId: "JOB1", partIndex: 1, partCount: 2 });
    expect(children[1].splitInfo.partIndex).toBe(2);
    expect(children[0].requestedOutput.copies).toBe(1);
    expect(children[0].jobId).toBe("JOB1_part_1");
    // total prints across parts equals original 4
    const total = children.flatMap((c) => c.files).reduce((s, f) => s + f.copies, 0);
    expect(total).toBe(4);
  });
});

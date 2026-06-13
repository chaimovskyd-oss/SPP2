import { describe, expect, it } from "vitest";

import {
  estimateJobSeconds,
  estimateManifestSeconds,
  estimateQueueSeconds,
  formatDuration,
  presetSeconds
} from "@/core/printHub/timeEstimate";
import { buildJobManifest } from "@/core/printHub/jobPackage";
import type { PrinterProfile } from "@/types/printHub";

const profiles: PrinterProfile[] = [
  {
    deviceId: "dnp", windowsPrinterName: "DNP", displayName: "DNP",
    supportedProducts: ["photo_print"], supportedSizes: ["10x15"], supportedFinishes: ["glossy"],
    presets: [{ id: "p", name: "10x15", widthMm: 102, heightMm: 152, dpi: 300, bleedMm: 1.5, finish: "glossy", borderMode: "borderless", secondsPerPrint: 10, copies: 1 }]
  }
];

describe("presetSeconds", () => {
  it("uses the admin value, else the default", () => {
    expect(presetSeconds(profiles[0].presets[0])).toBe(10);
    expect(presetSeconds({ ...profiles[0].presets[0], secondsPerPrint: undefined })).toBe(12);
  });
});

describe("estimateManifestSeconds", () => {
  it("multiplies prints by the preset's seconds-per-print", () => {
    const manifest = buildJobManifest({
      source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
      borderMode: "borderless", copies: 2, files: [{ path: "a.jpg", copies: 1 }, { path: "b.jpg", copies: 1 }]
    });
    // (1+1)*2 prints * 10s = 40s
    expect(estimateManifestSeconds(profiles, manifest)).toBe(40);
  });
});

describe("estimateJobSeconds / estimateQueueSeconds", () => {
  it("estimates from a queue summary and sums only active jobs", () => {
    const a = { state: "printing", size: "10x15", finish: "glossy", borderMode: "borderless", copies: 1, fileCount: 3 };
    const b = { state: "incoming", size: "10x15", finish: "glossy", borderMode: "borderless", copies: 2, fileCount: 5 };
    const done = { state: "done", size: "10x15", finish: "glossy", borderMode: "borderless", copies: 1, fileCount: 100 };
    expect(estimateJobSeconds(profiles, a)).toBe(30); // 3 * 10
    expect(estimateQueueSeconds(profiles, [a, b, done])).toBe(30 + 100); // ignores done
  });

  it("falls back to default seconds when no preset matches", () => {
    expect(estimateJobSeconds([], { state: "incoming", size: "10x15", finish: "glossy", borderMode: "borderless", copies: 1, fileCount: 2 })).toBe(24);
  });
});

describe("formatDuration", () => {
  it("formats Hebrew durations", () => {
    expect(formatDuration(30)).toBe("פחות מדקה");
    expect(formatDuration(600)).toBe("10 דק׳");
    expect(formatDuration(3660)).toBe("1 שע׳ 1 דק׳");
    expect(formatDuration(7200)).toBe("2 שע׳");
  });
});

import { describe, expect, it } from "vitest";
import {
  getExportPixelRatio,
  getImportPreviewMaxSide,
  getJpegQuality,
  resolveEffectivePerformanceSettings
} from "@/settings/performancePolicy";
import type { PerformanceSettings } from "@/settings";
import type { Page } from "@/types/document";

const baseSettings: PerformanceSettings = {
  previewQuality: "high",
  renderQuality: "high",
  enableGpuAcceleration: true,
  maxPreviewSizePx: 4096,
  undoHistoryLimit: 100,
  warnLargeFileMb: 50,
  performanceMode: false,
  lowResWhileDragging: false,
  aiPerformanceMode: "full",
  aiShowLoadingVideo: true
};

const page = {
  id: "page-1",
  width: 1000,
  height: 1000,
  setup: { dpi: 300 }
} as Page;

describe("performance policy", () => {
  it("resolves preview limits from quality and explicit max size", () => {
    expect(getImportPreviewMaxSide({ ...baseSettings, previewQuality: "low", maxPreviewSizePx: 4096 })).toBe(1024);
    expect(getImportPreviewMaxSide({ ...baseSettings, previewQuality: "high", maxPreviewSizePx: 2048 })).toBe(2048);
  });

  it("applies performance mode as an effective policy without mutating base choices", () => {
    const effective = resolveEffectivePerformanceSettings({ ...baseSettings, performanceMode: true });
    expect(effective.previewQuality).toBe("high");
    expect(effective.effectivePreviewQuality).toBe("medium");
    expect(effective.lowResWhileDragging).toBe(true);
    expect(effective.effectiveMaxPreviewSizePx).toBe(2048);
  });

  it("maps export quality to pixel ratio", () => {
    expect(getExportPixelRatio(page, { ...baseSettings, renderQuality: "standard" })).toBe(1);
    expect(getExportPixelRatio(page, { ...baseSettings, renderQuality: "high" })).toBe(2);
  });

  it("normalizes jpg quality percentages", () => {
    expect(getJpegQuality(90)).toBe(0.9);
    expect(getJpegQuality(500)).toBe(1);
    expect(getJpegQuality(-1)).toBe(0.1);
  });
});

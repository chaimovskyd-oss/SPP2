import { describe, it, expect } from "vitest";
import { buildAutoEnhanceAdjustments } from "@/core/analysis/autoEnhance";
import type { ImageAutoAnalysis } from "@/core/analysis/imageAutoAnalysis";
import type { ImageAdjustmentTemplate } from "@/types/imageAdjustments";

function analysis(overrides: {
  meanLuma?: number;
  contrast?: number;
  shadowClip?: number;
  highlightClip?: number;
  cast?: ImageAutoAnalysis["whiteBalance"]["cast"];
  magnitude?: number;
  source?: ImageAutoAnalysis["whiteBalance"]["source"];
}): ImageAutoAnalysis {
  const meanLuma = overrides.meanLuma ?? 0.5;
  const contrast = overrides.contrast ?? 0.18;
  const shadowClip = overrides.shadowClip ?? 0;
  const highlightClip = overrides.highlightClip ?? 0;
  return {
    exposure: { meanLuma, contrast, shadowClip, highlightClip, verdict: "ok" },
    whiteBalance: {
      source: overrides.source ?? "image",
      meanR: 0.5,
      meanG: 0.5,
      meanB: 0.5,
      cast: overrides.cast ?? "neutral",
      magnitude: overrides.magnitude ?? 0
    },
    suggestions: []
  };
}

function find<T extends ImageAdjustmentTemplate["type"]>(
  templates: ImageAdjustmentTemplate[],
  type: T
): Extract<ImageAdjustmentTemplate, { type: T }> | undefined {
  return templates.find((t) => t.type === type) as
    | Extract<ImageAdjustmentTemplate, { type: T }>
    | undefined;
}

describe("buildAutoEnhanceAdjustments", () => {
  it("returns a gentle / empty recipe for an already-balanced image", () => {
    const templates = buildAutoEnhanceAdjustments(
      analysis({ meanLuma: 0.52, contrast: 0.2, source: undefined }),
      "autoEnhance"
    );
    // No exposure deficit, healthy contrast, neutral WB → no brightness/HS/color/detail spikes.
    expect(find(templates, "basicTone")).toBeUndefined();
    expect(find(templates, "highlightsShadows")).toBeUndefined();
  });

  it("brightens a dark image and lifts shadows (autoEnhance)", () => {
    const templates = buildAutoEnhanceAdjustments(
      analysis({ meanLuma: 0.25, contrast: 0.1, shadowClip: 0.2 }),
      "autoEnhance"
    );
    const tone = find(templates, "basicTone");
    const hs = find(templates, "highlightsShadows");
    expect(tone?.brightness ?? 0).toBeGreaterThan(0);
    expect(hs?.shadows ?? 0).toBeGreaterThan(0);
  });

  it("faceBrighten lifts the subject harder than autoEnhance", () => {
    const dark = analysis({ meanLuma: 0.28, shadowClip: 0.1 });
    const face = buildAutoEnhanceAdjustments(dark, "faceBrighten");
    const auto = buildAutoEnhanceAdjustments(dark, "autoEnhance");
    const faceBrightness = find(face, "basicTone")?.brightness ?? 0;
    const autoBrightness = find(auto, "basicTone")?.brightness ?? 0;
    expect(faceBrightness).toBeGreaterThan(autoBrightness);
  });

  it("cools down a yellow (warm) cast", () => {
    const templates = buildAutoEnhanceAdjustments(
      analysis({ cast: "yellow", magnitude: 0.15, source: "skin" }),
      "autoColor"
    );
    const color = find(templates, "color");
    expect(color).toBeDefined();
    expect(color?.temperature ?? 0).toBeLessThan(0);
  });

  it("warms up a blue (cold) cast", () => {
    const templates = buildAutoEnhanceAdjustments(
      analysis({ cast: "blue", magnitude: 0.15 }),
      "autoColor"
    );
    expect(find(templates, "color")?.temperature ?? 0).toBeGreaterThan(0);
  });

  it("autoColor only touches color (no tone / highlights-shadows / detail)", () => {
    const templates = buildAutoEnhanceAdjustments(
      analysis({ meanLuma: 0.2, contrast: 0.05, cast: "yellow", magnitude: 0.2 }),
      "autoColor"
    );
    expect(find(templates, "highlightsShadows")).toBeUndefined();
    expect(find(templates, "detail")).toBeUndefined();
    expect(find(templates, "color")).toBeDefined();
  });

  it("autoEnhance adds clarity/detail for a flat (low-contrast) image", () => {
    const templates = buildAutoEnhanceAdjustments(
      analysis({ meanLuma: 0.5, contrast: 0.1 }),
      "autoEnhance"
    );
    const detail = find(templates, "detail");
    expect(detail).toBeDefined();
    expect(detail?.clarity ?? 0).toBeGreaterThan(0);
  });
});

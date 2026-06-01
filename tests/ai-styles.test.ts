import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_STYLE_PRESETS, aiStyleCategories, getAiStylePreset } from "@/features/aiStyles/catalog";

describe("AI Style Studio catalog", () => {
  it("ships the MVP presets with unique ids", () => {
    expect(AI_STYLE_PRESETS).toHaveLength(15);
    const ids = AI_STYLE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks local MVP presets as zero-cost and runnable without cloud", () => {
    const local = AI_STYLE_PRESETS.filter((preset) => !preset.requiresCloud);
    expect(local.map((preset) => preset.id).sort()).toEqual([
      "cute_sticker",
      "line_engraving",
      "pencil_sketch",
      "posterize_pop",
    ]);
    expect(local.every((preset) => preset.estimatedCredits === 0 && preset.estimatedCostUsd === 0)).toBe(true);
    expect(local.every((preset) => preset.pipeline.every((step) => step.local))).toBe(true);
  });

  it("keeps cloud style presets open for direct fal testing and credit-ready later", () => {
    const cloud = AI_STYLE_PRESETS.filter((preset) => preset.requiresCloud);
    expect(cloud.length).toBeGreaterThan(0);
    expect(cloud.every((preset) => preset.cloudCapability === "required")).toBe(true);
    expect(cloud.every((preset) => preset.estimatedCredits > 0 && preset.estimatedCostUsd > 0)).toBe(true);
    expect(cloud.every((preset) => preset.pipeline.some((step) => (step.type === "cloud-style" || step.type === "cloud-lineart") && !step.local))).toBe(true);
    expect(cloud.some((preset) => preset.id === "ai_lineart")).toBe(true);
    expect(cloud.some((preset) => preset.id === "romantic_couple")).toBe(true);
    expect(cloud.some((preset) => preset.id === "soft_anime_storybook")).toBe(true);
    expect(cloud.some((preset) => preset.id === "memorial_pencil_portrait")).toBe(true);
  });

  it("has categories and lookup helpers", () => {
    expect(aiStyleCategories()).toEqual(["Cloud styles", "Stickers", "Line art", "Local effects"]);
    expect(getAiStylePreset("line_engraving")?.name).toBe("Line Art / Engraving");
    expect(getAiStylePreset("missing")).toBeUndefined();
  });

  it("keeps fal access isolated to the pipeline transport boundary", () => {
    const root = join(process.cwd(), "src", "features", "aiStyles");
    const files = ["catalog.ts", "localPipeline.ts", "types.ts"];
    const sources = Object.fromEntries(files.map((file) => [file, readFileSync(join(root, file), "utf8")]));
    expect(sources["catalog.ts"]).not.toContain("falAiService");
    expect(sources["types.ts"]).not.toContain("falAiService");
    expect(sources["localPipeline.ts"]).toContain("falAiService");
  });
});

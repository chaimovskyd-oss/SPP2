import { describe, expect, it } from "vitest";

import {
  buildCustomPresetDefinition,
  fineTuneTemplates,
  isNeutralFineTune,
  NEUTRAL_FINE_TUNE,
  type PresetFineTune
} from "@/core/presets/customPresets";
import { getPreset, isCustomPresetId } from "@/core/presets/smartPresets";
import { combinedPreviewAdjustments } from "@/services/preview/presetPreviewService";

describe("fine-tune helpers", () => {
  it("treats the all-zero offsets as neutral and emits no templates", () => {
    expect(isNeutralFineTune(NEUTRAL_FINE_TUNE)).toBe(true);
    expect(fineTuneTemplates(NEUTRAL_FINE_TUNE)).toEqual([]);
  });

  it("emits only the non-zero fields, grouped by tool", () => {
    const ft: PresetFineTune = { brightness: 10, contrast: 0, saturation: -20, temperature: 0 };
    const templates = fineTuneTemplates(ft);
    expect(templates).toHaveLength(2);
    const tone = templates.find((t) => t.type === "basicTone");
    const color = templates.find((t) => t.type === "color");
    expect(tone).toEqual({ type: "basicTone", brightness: 10 });
    expect(color).toEqual({ type: "color", saturation: -20 });
    expect(isNeutralFineTune(ft)).toBe(false);
  });

  it("groups brightness+contrast into one tone template and sat+temp into one color template", () => {
    const ft: PresetFineTune = { brightness: 5, contrast: 7, saturation: 3, temperature: -4 };
    const templates = fineTuneTemplates(ft);
    expect(templates).toEqual([
      { type: "basicTone", brightness: 5, contrast: 7 },
      { type: "color", saturation: 3, temperature: -4 }
    ]);
  });
});

describe("buildCustomPresetDefinition", () => {
  it("bakes the base recipe (scaled) plus fine-tune into a custom:<uuid> preset", () => {
    const base = getPreset("sun_rescue");
    expect(base).toBeDefined();
    if (base === undefined) return;

    const ft: PresetFineTune = { brightness: 12, contrast: 0, saturation: 0, temperature: -8 };
    const def = buildCustomPresetDefinition(base, 0.5, ft, "  My Sunset  ");

    expect(isCustomPresetId(def.id)).toBe(true);
    expect(def.category).toBe("Custom");
    expect(def.name).toBe("My Sunset"); // trimmed
    expect(def.defaultStrength).toBe(1); // recipe is pre-scaled
    expect(def.requires).toEqual([]);

    // base templates (scaled) + 2 fine-tune templates
    expect(def.imageAdjustments).toHaveLength(base.imageAdjustments.length + 2);

    // the scaled base highlights value: -55 * 0.5 = -27.5
    const hs = def.imageAdjustments.find((t) => t.type === "highlightsShadows");
    expect(hs).toMatchObject({ highlights: -27.5 });
  });

  it("falls back to the base name when given a blank name", () => {
    const base = getPreset("sun_rescue");
    if (base === undefined) throw new Error("missing base preset");
    const def = buildCustomPresetDefinition(base, 1, NEUTRAL_FINE_TUNE, "   ");
    expect(def.name).toBe(base.name);
    // neutral fine-tune adds no extra templates
    expect(def.imageAdjustments).toHaveLength(base.imageAdjustments.length);
  });
});

describe("combinedPreviewAdjustments", () => {
  it("appends fine-tune adjustments after the preset's scaled adjustments", () => {
    const base = getPreset("sun_rescue");
    if (base === undefined) throw new Error("missing base preset");
    const ft: PresetFineTune = { brightness: 15, contrast: 0, saturation: 0, temperature: 0 };
    const combined = combinedPreviewAdjustments("sun_rescue", 1, ft);
    // preset templates + 1 fine-tune (brightness only)
    expect(combined).toHaveLength(base.imageAdjustments.length + 1);
    const last = combined[combined.length - 1];
    expect(last.type).toBe("basicTone");
  });

  it("returns just the preset adjustments when fine-tune is neutral", () => {
    const base = getPreset("sun_rescue");
    if (base === undefined) throw new Error("missing base preset");
    const combined = combinedPreviewAdjustments("sun_rescue", 1, NEUTRAL_FINE_TUNE);
    expect(combined).toHaveLength(base.imageAdjustments.length);
  });

  it("returns [] for an unknown preset id", () => {
    expect(combinedPreviewAdjustments("does_not_exist", 1, NEUTRAL_FINE_TUNE)).toEqual([]);
  });
});

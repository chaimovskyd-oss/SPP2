/**
 * Custom presets + per-preset fine-tune (plan שלב 4, library editing/saving).
 *
 * Two related concerns live here, both PURE (no store, no React):
 *
 *  1. PresetFineTune — a small set of live offsets (brightness/contrast/
 *     saturation/temperature) the user nudges in the library *on top of* a preset
 *     before applying. They are previewed as extra adjustment templates and, on
 *     Apply, appended to the layer stack as plain manual adjustments (NOT part of
 *     the preset instance), so re-strengthening the base preset stays clean and
 *     the tweaks survive reload.
 *
 *  2. buildCustomPresetDefinition — bakes a base preset (scaled at the chosen
 *     strength) plus the fine-tune offsets into a new SmartPresetDefinition with a
 *     `custom:<uuid>` id and category "Custom", ready to persist and re-apply.
 */

import type { ImageAdjustmentTemplate } from "@/types/imageAdjustments";
import { scaleTemplate, type SmartPresetDefinition } from "@/core/presets/smartPresets";

/** Live offsets layered on top of a preset in the library, before Apply. */
export interface PresetFineTune {
  /** -100..100, 0 = neutral */
  brightness: number;
  /** -100..100, 0 = neutral */
  contrast: number;
  /** -100..100, 0 = neutral */
  saturation: number;
  /** -100..100, 0 = neutral */
  temperature: number;
}

export const NEUTRAL_FINE_TUNE: PresetFineTune = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0
};

export function isNeutralFineTune(ft: PresetFineTune): boolean {
  return ft.brightness === 0 && ft.contrast === 0 && ft.saturation === 0 && ft.temperature === 0;
}

/**
 * Translate fine-tune offsets into adjustment templates (only non-zero fields).
 * brightness/contrast → a basicTone template; saturation/temperature → a color
 * template. Returns an empty array when fully neutral.
 */
export function fineTuneTemplates(ft: PresetFineTune): ImageAdjustmentTemplate[] {
  const templates: ImageAdjustmentTemplate[] = [];

  const tone: Partial<{ brightness: number; contrast: number }> = {};
  if (ft.brightness !== 0) tone.brightness = ft.brightness;
  if (ft.contrast !== 0) tone.contrast = ft.contrast;
  if (Object.keys(tone).length > 0) {
    templates.push({ type: "basicTone", ...tone });
  }

  const color: Partial<{ saturation: number; temperature: number }> = {};
  if (ft.saturation !== 0) color.saturation = ft.saturation;
  if (ft.temperature !== 0) color.temperature = ft.temperature;
  if (Object.keys(color).length > 0) {
    templates.push({ type: "color", ...color });
  }

  return templates;
}

/**
 * Bake a base preset (scaled at `strength`) plus fine-tune offsets into a new,
 * self-contained custom preset definition. The result has defaultStrength 1
 * because the recipe is already pre-scaled — re-applying it reproduces exactly
 * what the user saw when they saved it.
 */
export function buildCustomPresetDefinition(
  base: SmartPresetDefinition,
  strength: number,
  ft: PresetFineTune,
  name: string
): SmartPresetDefinition {
  const scaledBase = base.imageAdjustments.map((template) => scaleTemplate(template, strength));
  const imageAdjustments = [...scaledBase, ...fineTuneTemplates(ft)];
  const trimmed = name.trim();
  return {
    id: `custom:${crypto.randomUUID()}`,
    name: trimmed.length > 0 ? trimmed : base.name,
    icon: base.icon ?? "✨",
    category: "Custom",
    description: `מבוסס על ${base.name}`,
    defaultStrength: 1,
    recommendedApplyMode: base.recommendedApplyMode,
    allowedApplyModes: [...base.allowedApplyModes],
    requires: [],
    optionalRequires: [],
    imageAdjustments,
    pageLookEffect: base.pageLookEffect,
    notRecommendedAsPageLook: base.notRecommendedAsPageLook,
    notRecommendedForText: base.notRecommendedForText,
    printWarnings: base.printWarnings
  };
}

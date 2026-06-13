// Maps a product/usage type to a recommended printer profile + output preset, so that
// opening the Advanced Print dialog for (say) a canvas product auto-selects the right
// canvas profile. Recommendations are best-effort and never override an explicit choice.

import type { AdvancedPrinterProfile, OutputPreset, OutputUse } from "@/types/advancedPrint";

/** A coarse product kind SPP documents can carry. Extend as the product schema grows. */
export type ProductKind = OutputUse | "unknown";

export interface ProductRecommendation {
  outputPresetId?: string;
  profileId?: string;
  outputUse: OutputUse;
}

/** Maps a product kind to a default OutputUse and a preferred built-in preset id. */
const KIND_TO_USE: Record<ProductKind, OutputUse> = {
  photo: "photo",
  canvas: "canvas",
  sublimation: "sublimation",
  office: "office",
  poster: "poster",
  product: "product",
  proof: "proof",
  unknown: "photo"
};

const USE_TO_BUILTIN_PRESET: Record<OutputUse, string> = {
  photo: "canvas_punch",
  canvas: "canvas_punch",
  sublimation: "sublimation_boost",
  office: "laser_printer_skin_fix",
  poster: "canvas_punch",
  product: "wood_print_prep",
  proof: "laser_ready"
};

/**
 * Recommends an output preset and (when a matching profile exists) a printer profile for a
 * given product kind. Profile matching prefers a profile whose linked output preset shares
 * the same targetUse, else a profile whose outputPresetId points at the recommended preset.
 */
export function recommendForProduct(
  kind: ProductKind,
  profiles: AdvancedPrinterProfile[],
  presets: OutputPreset[]
): ProductRecommendation {
  const outputUse = KIND_TO_USE[kind] ?? "photo";
  const builtinId = USE_TO_BUILTIN_PRESET[outputUse];

  // Prefer a user/custom preset matching the use; else the built-in.
  const matchingPreset =
    presets.find((p) => !p.builtIn && p.targetUse === outputUse) ??
    presets.find((p) => p.id === builtinId) ??
    presets.find((p) => p.targetUse === outputUse);
  const outputPresetId = matchingPreset?.id ?? builtinId;

  const presetIdByUse = new Set(presets.filter((p) => p.targetUse === outputUse).map((p) => p.id));
  const matchingProfile = profiles.find(
    (prof) => prof.outputPresetId && presetIdByUse.has(prof.outputPresetId)
  );

  return { outputUse, outputPresetId, profileId: matchingProfile?.id };
}

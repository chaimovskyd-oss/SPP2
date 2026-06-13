// Color-management resolution for Advanced Print.
//
// Decides who manages color (SPP via ICC, the printer, or no management) and whether the
// Python color pass needs to run. The key risk is double correction: SPP applying an ICC
// transform while the driver also corrects color. We surface that and gate the transform.

import type {
  AdvancedPrinterProfile,
  ColorManagementMode,
  OutputPreset,
  RenderingIntent
} from "@/types/advancedPrint";

export interface ResolvedColor {
  mode: ColorManagementMode;
  iccProfileId?: string;
  renderingIntent: RenderingIntent;
  blackPointCompensation: boolean;
  /** Whether the Python pass should run (adjustments and/or ICC). */
  needsColorPass: boolean;
  /** Whether an ICC transform specifically should be applied (only when app-manages-color + profile present). */
  applyIcc: boolean;
  /** True when the user should disable driver color correction. */
  warnDisableDriverColor: boolean;
}

/** True when the preset has any non-neutral tonal adjustment that requires the Python pass. */
function hasAdjustments(preset?: OutputPreset): boolean {
  if (!preset) return false;
  return (
    preset.brightness !== 0 ||
    preset.contrast !== 0 ||
    preset.saturation !== 0 ||
    preset.temperature !== 0 ||
    preset.gamma !== 1 ||
    (preset.vibrance ?? 0) !== 0 ||
    preset.sharpness !== 0 ||
    (preset.blackPoint ?? 0) !== 0 ||
    (preset.whitePoint ?? 0) !== 0
  );
}

/**
 * Resolves the effective color configuration.
 *
 * Color-management ownership (mode + ICC profile + intent + BPC) is the PROFILE's job — the user
 * first picks a real system ICC profile (e.g. the F100 Textile/Rigid profile) at the profile level.
 * The output preset is a *layer on top*: it contributes only tonal adjustments (brightness,
 * contrast, …). This matches the Photoshop-like mental model the user asked for and prevents the
 * preset from silently re-deciding who manages color.
 */
export function resolveColor(profile: AdvancedPrinterProfile, preset?: OutputPreset): ResolvedColor {
  const mode = profile.color.mode;
  const iccProfileId = profile.color.iccProfileId;
  const renderingIntent = profile.color.renderingIntent;
  const blackPointCompensation = profile.color.blackPointCompensation;

  // ICC is applied only when SPP manages color AND a profile is chosen.
  const applyIcc = mode === "app-manages-color" && Boolean(iccProfileId);
  // When the printer manages color we must NOT apply ICC (avoids double correction),
  // but simple output-preset adjustments may still be applied if requested.
  const needsColorPass = applyIcc || hasAdjustments(preset);
  const warnDisableDriverColor = mode === "app-manages-color";

  return {
    mode,
    iccProfileId,
    renderingIntent,
    blackPointCompensation,
    needsColorPass,
    applyIcc,
    warnDisableDriverColor
  };
}

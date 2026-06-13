// Built-in OutputPresets shipped with the app, plus factory helpers for new
// profiles/presets. The output presets mirror the editor Tool Library's Print
// presets so the same print recipes are available in Advanced Print.

import { listPresetsByCategory } from "@/core/presets/smartPresets";
import type { ImageAdjustmentTemplate } from "@/types/imageAdjustments";
import type {
  AdvancedPrinterProfile,
  CalibrationConfig,
  OutputPreset,
  PaperSize
} from "@/types/advancedPrint";

export const NEUTRAL_CALIBRATION: CalibrationConfig = {
  offsetXmm: 0,
  offsetYmm: 0,
  scaleXPercent: 100,
  scaleYPercent: 100
};

export const A4_PAPER: PaperSize = { name: "A4", widthMm: 210, heightMm: 297, custom: false };

const NEUTRAL = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  gamma: 1,
  vibrance: 0,
  sharpness: 0
} as const;

const PRINT_PRESET_USE: Record<string, OutputPreset["targetUse"]> = {
  sublimation_boost: "sublimation",
  canvas_punch: "canvas",
  laser_printer_skin_fix: "office",
  laser_ready: "office",
  wood_print_prep: "product"
};

function preset(
  id: string,
  name: string,
  targetUse: OutputPreset["targetUse"],
  overrides: Partial<OutputPreset>
): OutputPreset {
  return {
    id,
    name,
    targetUse,
    ...NEUTRAL,
    colorMode: "printer-manages-color",
    renderingIntent: "relative-colorimetric",
    blackPointCompensation: true,
    builtIn: true,
    notes: "",
    ...overrides
  };
}

function addClamped(target: Record<string, number>, key: keyof typeof NEUTRAL, value: number): void {
  const min = key === "gamma" ? 0.1 : -100;
  const max = key === "gamma" ? 3 : 100;
  target[key] = Math.max(min, Math.min(max, (target[key] ?? NEUTRAL[key]) + value));
}

function applySmartTemplateToOutput(values: Record<string, number>, template: ImageAdjustmentTemplate): void {
  if (template.type === "basicTone") {
    addClamped(values, "brightness", (template.brightness ?? 0) + (template.exposure ?? 0) * 30);
    addClamped(values, "contrast", template.contrast ?? 0);
    addClamped(values, "gamma", (template.gamma ?? 1) - 1);
    return;
  }
  if (template.type === "color") {
    addClamped(values, "saturation", template.saturation ?? 0);
    addClamped(values, "vibrance", template.vibrance ?? 0);
    addClamped(values, "temperature", template.temperature ?? 0);
    return;
  }
  if (template.type === "detail") {
    addClamped(values, "sharpness", (template.sharpness ?? 0) + (template.clarity ?? 0) * 0.5);
    return;
  }
  if (template.type === "highlightsShadows") {
    addClamped(values, "brightness", (template.shadows ?? 0) * 0.12 + (template.highlights ?? 0) * 0.08);
    addClamped(values, "contrast", (template.whites ?? 0) * 0.08 - (template.blacks ?? 0) * 0.08);
    return;
  }
  if (template.type === "blackWhite") {
    addClamped(values, "saturation", -(template.strength ?? 0));
  }
}

function smartPrintPresetToOutputPreset(def: ReturnType<typeof listPresetsByCategory>[number]): OutputPreset {
  const values: Record<string, number> = { ...NEUTRAL };
  for (const template of def.imageAdjustments) applySmartTemplateToOutput(values, template);
  return preset(def.id, def.name, PRINT_PRESET_USE[def.id] ?? "photo", {
    ...values,
    sourceSmartPresetId: def.id,
    colorMode: "app-manages-color",
    renderingIntent: def.id === "sublimation_boost" ? "saturation" : "perceptual",
    notes: def.description
  });
}

export const BUILT_IN_OUTPUT_PRESETS: OutputPreset[] = listPresetsByCategory("Print")
  .filter((def) => def.imageAdjustments.length > 0)
  .map(smartPrintPresetToOutputPreset);

export function scaleOutputPreset(preset: OutputPreset | undefined, strength: number): OutputPreset | undefined {
  if (!preset) return undefined;
  const clamped = Math.max(0, Math.min(1, strength));
  return {
    ...preset,
    brightness: preset.brightness * clamped,
    contrast: preset.contrast * clamped,
    saturation: preset.saturation * clamped,
    temperature: preset.temperature * clamped,
    gamma: 1 + (preset.gamma - 1) * clamped,
    vibrance: (preset.vibrance ?? 0) * clamped,
    sharpness: preset.sharpness * clamped,
    blackPoint: (preset.blackPoint ?? 0) * clamped,
    whitePoint: (preset.whitePoint ?? 0) * clamped
  };
}

let idCounter = 0;

export function newAdvancedPrintId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createDefaultProfile(windowsPrinterName: string, name?: string): AdvancedPrinterProfile {
  return {
    id: newAdvancedPrintId("profile"),
    name: name ?? windowsPrinterName,
    windowsPrinterName,
    engine: "windows-native",
    printerPaper: { ...A4_PAPER },
    scaling: { mode: "fit-to-page", lockRatio: true },
    position: { mode: "center" },
    orientationPolicy: "from-rendered-output",
    marginsPolicy: "use-driver-printable-area",
    bleedMm: 0,
    borderless: { status: "not-requested" },
    traySource: { label: "Driver default tray", verified: false },
    color: {
      mode: "printer-manages-color",
      renderingIntent: "relative-colorimetric",
      blackPointCompensation: true
    },
    devmode: {},
    calibration: { ...NEUTRAL_CALIBRATION },
    safety: { requirePreflight: true, allowSilentPrint: false, requireTestPrintFirst: false },
    notes: ""
  };
}

export function duplicateOutputPreset(source: OutputPreset, name?: string): OutputPreset {
  return {
    ...source,
    id: newAdvancedPrintId("preset"),
    name: name ?? `${source.name} (copy)`,
    builtIn: false
  };
}

import { defaultGridSettings, defaultPageSetup, defaultSnapSettings } from "@/core/defaults";
import { unitToPx } from "@/core/units/conversion";
import type { PageSetup, Unit } from "@/types/primitives";

export interface PagePreset {
  id: string;
  name: string;
  category: "paper" | "photo" | "social" | "sublimation" | "mitsubishi" | "custom";
  width: number;
  height: number;
  units: Unit;
  dpi: number;
  bleed?: number;
  margins?: number;
  printIntent?: PageSetup["printIntent"];
}

export const PAGE_PRESETS: PagePreset[] = [
  { id: "a5", name: "A5", category: "paper", width: 148, height: 210, units: "mm", dpi: 300, bleed: 0, margins: 0, printIntent: "press" },
  { id: "a4", name: "A4", category: "paper", width: 210, height: 297, units: "mm", dpi: 300, bleed: 0, margins: 0, printIntent: "press" },
  { id: "a3", name: "A3", category: "paper", width: 297, height: 420, units: "mm", dpi: 300, bleed: 0, margins: 0, printIntent: "press" },
  { id: "letter", name: "Letter", category: "paper", width: 8.5, height: 11, units: "inch", dpi: 300, bleed: 0, margins: 0, printIntent: "press" },
  { id: "legal", name: "Legal", category: "paper", width: 8.5, height: 14, units: "inch", dpi: 300, bleed: 0, margins: 0, printIntent: "press" },
  { id: "photo_10x15", name: "10x15", category: "photo", width: 100, height: 150, units: "mm", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "photo_13x18", name: "13x18", category: "photo", width: 130, height: 180, units: "mm", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "photo_15x20", name: "15x20", category: "photo", width: 150, height: 200, units: "mm", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "photo_20x30", name: "20x30", category: "photo", width: 200, height: 300, units: "mm", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "instagram", name: "Instagram", category: "social", width: 1080, height: 1350, units: "px", dpi: 72, margins: 0, printIntent: "photo" },
  { id: "story", name: "סטורי", category: "social", width: 1080, height: 1920, units: "px", dpi: 72, margins: 0, printIntent: "photo" },
  { id: "square", name: "ריבוע", category: "social", width: 1080, height: 1080, units: "px", dpi: 72, margins: 0, printIntent: "photo" },
  { id: "sub_mug_11oz", name: "ספל סובלימציה 11oz", category: "sublimation", width: 220, height: 95, units: "mm", dpi: 300, bleed: 0, margins: 0, printIntent: "sublimation" },
  { id: "sub_tshirt_a3", name: "חולצת סובלימציה A3", category: "sublimation", width: 297, height: 420, units: "mm", dpi: 300, bleed: 0, margins: 0, printIntent: "sublimation" },
  { id: "mitsubishi_10x15", name: "Mitsubishi 10x15", category: "mitsubishi", width: 1240, height: 1844, units: "px", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "custom", name: "מותאם אישית", category: "custom", width: 210, height: 297, units: "mm", dpi: 300, bleed: 0, margins: 0, printIntent: "photo" }
];

export function pageSetupFromPreset(preset: PagePreset, orientation: "portrait" | "landscape" = "portrait"): PageSetup {
  const width = unitToPx(preset.width, preset.units, preset.dpi);
  const height = unitToPx(preset.height, preset.units, preset.dpi);
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const pageWidth = orientation === "portrait" ? shortSide : longSide;
  const pageHeight = orientation === "portrait" ? longSide : shortSide;
  const bleed = unitToPx(preset.bleed ?? 0, preset.units, preset.dpi);
  const margins = unitToPx(preset.margins ?? 0, preset.units, preset.dpi);
  return {
    ...defaultPageSetup,
    units: preset.units,
    dpi: preset.dpi,
    orientation,
    size: {
      width: Math.round(pageWidth),
      height: Math.round(pageHeight)
    },
    bleed: {
      top: bleed,
      right: bleed,
      bottom: bleed,
      left: bleed
    },
    margins: {
      top: margins,
      right: margins,
      bottom: margins,
      left: margins
    },
    safeArea: {
      top: margins,
      right: margins,
      bottom: margins,
      left: margins
    },
    printIntent: preset.printIntent,
    snapSettings: { ...defaultSnapSettings },
    gridSettings: { ...defaultGridSettings },
    metadata: {
      presetId: preset.id,
      presetName: preset.name
    }
  };
}

export function getPagePreset(id: string): PagePreset {
  return PAGE_PRESETS.find((preset) => preset.id === id) ?? PAGE_PRESETS[1];
}

// Built-in printer profiles + preset helpers (pure, no Node deps — safe to import in the renderer
// for the Printers & Presets editor). printerProfiles.ts re-uses these for the server side.

import { SIZE_MM } from "./sizes";
import type { BorderMode, PrintFinish, PrinterProfile, PrintPreset } from "@/types/printHub";

/** Builds a preset from a size key + finish + border (dpi 300, bleed for borderless). */
export function makePreset(id: string, name: string, size: string, finish: PrintFinish, borderMode: BorderMode): PrintPreset {
  const dims = SIZE_MM[size] ?? SIZE_MM["10x15"];
  return {
    id,
    name,
    widthMm: dims.widthMm,
    heightMm: dims.heightMm,
    dpi: 300,
    bleedMm: borderMode === "borderless" ? 1.5 : 0,
    finish,
    borderMode,
    copies: 1
  };
}

export const DEFAULT_PROFILES: PrinterProfile[] = [
  {
    deviceId: "dnp_ds_rx1hs",
    windowsPrinterName: "DNP DS-RX1HS",
    displayName: "DNP DS-RX1HS",
    supportedProducts: ["photo_print"],
    supportedSizes: ["10x15", "15x20"],
    supportedFinishes: ["glossy", "matte"],
    presets: [
      makePreset("dnp_rx1hs_10x15_glossy", "10×15 מבריק ללא שוליים", "10x15", "glossy", "borderless"),
      makePreset("dnp_rx1hs_10x15_matte", "10×15 מאט ללא שוליים", "10x15", "matte", "borderless"),
      makePreset("dnp_rx1hs_15x20_glossy", "15×20 מבריק", "15x20", "glossy", "borderless")
    ]
  },
  {
    deviceId: "dnp_ds620a",
    windowsPrinterName: "DNP DS620",
    displayName: "DNP DS620A",
    supportedProducts: ["photo_print"],
    supportedSizes: ["10x15", "15x20"],
    supportedFinishes: ["glossy", "matte"],
    presets: [
      makePreset("dnp_ds620_10x15_glossy", "10×15 מבריק ללא שוליים", "10x15", "glossy", "borderless"),
      makePreset("dnp_ds620_15x20_glossy", "15×20 מבריק", "15x20", "glossy", "borderless")
    ]
  },
  {
    deviceId: "mitsubishi_cpd80",
    windowsPrinterName: "Mitsubishi CP-D80",
    displayName: "Mitsubishi CP-D80",
    supportedProducts: ["photo_print"],
    supportedSizes: ["10x15", "15x20"],
    supportedFinishes: ["glossy"],
    presets: [makePreset("mitsubishi_d80_10x15_glossy", "10×15 מבריק", "10x15", "glossy", "borderless")]
  }
];

/** Creates an empty editable profile (for the "add printer" flow). */
export function makeBlankProfile(deviceId: string): PrinterProfile {
  return {
    deviceId,
    windowsPrinterName: "",
    displayName: "מדפסת חדשה",
    supportedProducts: ["photo_print"],
    supportedSizes: [],
    supportedFinishes: [],
    presets: []
  };
}

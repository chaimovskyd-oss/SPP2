// Generic printer classification and starter-profile suggestions.
//
// Works for ANY printer from its reported capabilities (not hardcoded per model), so a user
// plugging in an unknown printer still gets sensible profile suggestions.

import type {
  PaperSize,
  PrinterCapabilities,
  PrinterClass,
  StarterProfileSuggestion
} from "@/types/advancedPrint";
import { NEUTRAL_CALIBRATION } from "./builtInPresets";

/** Classifies a printer from its capabilities. */
export function classifyPrinter(caps: PrinterCapabilities): PrinterClass {
  if (caps.isRoll || caps.isWideFormat) return "wide-format-roll";
  // Dye-sub heuristic: small fixed photo sizes only, no large office paper, no big trays.
  const maxPaperLongMm = caps.paperSizes.reduce((max, p) => Math.max(max, p.widthMm, p.heightMm), 0);
  const hasOfficeSizes = caps.paperSizes.some((p) => p.name === "A4" || p.name === "Letter" || p.name === "A3");
  if (!hasOfficeSizes && maxPaperLongMm > 0 && maxPaperLongMm <= 210) return "dye-sub";
  if (caps.sources.length >= 2 && hasOfficeSizes) return "office-multi-tray";
  return "generic";
}

function findPaper(caps: PrinterCapabilities, name: string): PaperSize | undefined {
  return caps.paperSizes.find((p) => p.name === name);
}

/** Suggests starter profiles for a detected printer based on its class. */
export function suggestStarterProfiles(caps: PrinterCapabilities): StarterProfileSuggestion[] {
  const printerClass = classifyPrinter(caps);
  const printer = caps.windowsPrinterName;
  const suggestions: StarterProfileSuggestion[] = [];

  const base = {
    windowsPrinterName: printer,
    printerClass,
    calibration: { ...NEUTRAL_CALIBRATION }
  } as const;

  if (printerClass === "wide-format-roll") {
    suggestions.push({
      reason: "זוהתה מדפסת רחבה/גליל — ליצור פרופיל פוסטר/גליל?",
      profile: {
        ...base,
        name: `${printer} — פוסטר/גליל`,
        engine: "windows-native",
        scaling: { mode: "fit-to-page", lockRatio: true },
        marginsPolicy: "use-driver-printable-area",
        color: { mode: "app-manages-color", renderingIntent: "perceptual", blackPointCompensation: true }
      }
    });
  } else if (printerClass === "dye-sub") {
    const photo = findPaper(caps, "10x15") ?? caps.paperSizes[0];
    suggestions.push({
      reason: "זוהתה מדפסת תמונות (dye-sub) — ליצור פרופיל תמונות ללא שוליים?",
      profile: {
        ...base,
        name: `${printer} — תמונות`,
        engine: "windows-native",
        printerPaper: photo,
        scaling: { mode: "fill-page", lockRatio: true },
        bleedMm: 1.5,
        borderless: { status: "requested-not-verified" },
        color: { mode: "app-manages-color", renderingIntent: "perceptual", blackPointCompensation: true }
      }
    });
  } else if (printerClass === "office-multi-tray") {
    const a4 = findPaper(caps, "A4");
    suggestions.push({
      reason: "זוהתה מדפסת משרדית עם כמה מגשים — ליצור פרופיל A4 רגיל?",
      profile: {
        ...base,
        name: `${printer} — A4 מגש ראשי`,
        engine: "windows-native",
        printerPaper: a4,
        scaling: { mode: "fit-to-page", lockRatio: true },
        color: { mode: "printer-manages-color", renderingIntent: "relative-colorimetric", blackPointCompensation: true }
      }
    });
    suggestions.push({
      reason: "ליצור גם פרופיל Bypass להזנה ידנית?",
      profile: {
        ...base,
        name: `${printer} — Bypass`,
        engine: "driver-dialog-first",
        printerPaper: a4,
        traySource: { label: "Bypass", verified: false },
        scaling: { mode: "actual-size", lockRatio: true },
        color: { mode: "printer-manages-color", renderingIntent: "relative-colorimetric", blackPointCompensation: true }
      }
    });
  } else {
    suggestions.push({
      reason: "ליצור פרופיל בסיסי למדפסת הזו?",
      profile: {
        ...base,
        name: `${printer} — בסיסי`,
        engine: "windows-native",
        scaling: { mode: "fit-to-page", lockRatio: true }
      }
    });
  }

  return suggestions;
}

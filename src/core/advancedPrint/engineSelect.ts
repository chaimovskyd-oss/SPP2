// Engine-selection fallback ladder. Never leaves the user stuck: when the preferred
// engine cannot run, it downgrades through progressively safer options.
//
//   windows-native + saved DEVMODE
//   → windows-native + driver default
//   → driver-dialog-first (open the driver, let the user configure)
//   → pdf (render to PDF and print/export that)
//   → electron (the existing simple path)
//   → export-only (write the file, user prints manually)

import type { AdvancedPrintEngine, AdvancedPrinterProfile, DriverState } from "@/types/advancedPrint";

export type ResolvedEngineStep =
  | "windows-native-devmode"
  | "windows-native-default"
  | "driver-dialog-first"
  | "pdf"
  | "electron"
  | "export-only";

export interface EngineSelection {
  /** The step to attempt first. */
  primary: ResolvedEngineStep;
  /** Ordered fallbacks to try if the primary fails or is unavailable. */
  fallbacks: ResolvedEngineStep[];
  /** The mapped AdvancedPrintEngine for logging. */
  engine: AdvancedPrintEngine;
  /** Human reason shown to the user when a downgrade is offered. */
  note?: string;
}

export interface EngineSelectInput {
  profile: AdvancedPrinterProfile;
  driver: DriverState;
  /** Whether we are running on Windows (native engine is Windows-only). */
  isWindows: boolean;
  /** Whether the native worker reported healthy. */
  workerAvailable: boolean;
}

const FULL_LADDER: ResolvedEngineStep[] = [
  "windows-native-devmode",
  "windows-native-default",
  "driver-dialog-first",
  "pdf",
  "electron",
  "export-only"
];

export function stepToEngine(step: ResolvedEngineStep): AdvancedPrintEngine {
  switch (step) {
    case "windows-native-devmode":
    case "windows-native-default":
      return "windows-native";
    case "driver-dialog-first":
      return "driver-dialog-first";
    case "pdf":
      return "pdf";
    case "electron":
    case "export-only":
    default:
      return "electron";
  }
}

/** Picks the starting step and the ordered fallbacks based on profile + environment. */
export function selectEngine(input: EngineSelectInput): EngineSelection {
  const { profile, driver, isWindows, workerAvailable } = input;

  // Non-Windows or no worker → native is impossible; start at PDF.
  if (!isWindows || !workerAvailable) {
    const fallbacks: ResolvedEngineStep[] = ["pdf", "electron", "export-only"];
    return {
      primary: "pdf",
      fallbacks: fallbacks.slice(1),
      engine: "pdf",
      note: !isWindows
        ? "מנוע ההדפסה ה-Native זמין רק ב-Windows. נעבור להדפסה דרך PDF."
        : "עוזר ההדפסה ה-Native אינו זמין. נעבור להדפסה דרך PDF."
    };
  }

  // Determine the first viable step on the full ladder.
  let primaryIndex = 0;
  let note: string | undefined;

  const requestedNative = profile.engine === "windows-native";
  const requestedDialog = profile.engine === "driver-dialog-first";
  const requestedPdf = profile.engine === "pdf";
  const requestedElectron = profile.engine === "electron";

  if (requestedElectron) {
    primaryIndex = FULL_LADDER.indexOf("electron");
  } else if (requestedPdf) {
    primaryIndex = FULL_LADDER.indexOf("pdf");
  } else if (requestedDialog) {
    primaryIndex = FULL_LADDER.indexOf("driver-dialog-first");
  } else if (requestedNative) {
    const hasUsableDevmode = Boolean(profile.devmode.base64) && driver.printerExists && driver.devmodeApplied !== false;
    if (hasUsableDevmode) {
      primaryIndex = FULL_LADDER.indexOf("windows-native-devmode");
    } else if (driver.printerExists) {
      primaryIndex = FULL_LADDER.indexOf("windows-native-default");
      note = profile.devmode.base64
        ? "הגדרות הדרייבר השמורות אינן תקפות — נדפיס עם הגדרות ברירת המחדל של הדרייבר."
        : undefined;
    } else {
      primaryIndex = FULL_LADDER.indexOf("driver-dialog-first");
      note = "המדפסת לא נמצאה — פתח הגדרות מדפסת או הדפס דרך PDF.";
    }
  }

  const primary = FULL_LADDER[primaryIndex];
  const fallbacks = FULL_LADDER.slice(primaryIndex + 1);
  return { primary, fallbacks, engine: stepToEngine(primary), note };
}

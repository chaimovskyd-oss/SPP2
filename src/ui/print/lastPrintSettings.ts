import type { PrintRangeMode } from "./printRangeUtils";

const STORAGE_KEY = "spp2_last_print_settings";

export interface LastPrintSettings {
  printRangeMode: PrintRangeMode;
  customPageRange?: string;
  lastUsedAt: string;
}

export function loadLastPrintSettings(): LastPrintSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastPrintSettings;
  } catch {
    return null;
  }
}

export function saveLastPrintSettings(settings: Omit<LastPrintSettings, "lastUsedAt">): void {
  const toSave: LastPrintSettings = {
    ...settings,
    lastUsedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

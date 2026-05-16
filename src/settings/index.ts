export type {
  AppSettings,
  SettingsCategory,
  GeneralSettings,
  WorkspaceSettings,
  ShortcutsSettings,
  AppearanceSettings,
  PerformanceSettings,
  FilesAutosaveSettings,
  ExportPrintSettings,
  PassportSettings,
  AdvancedSettings,
  AppShortcut,
  AppShortcutDef,
  ShortcutModifiers,
  FreeModeDefaults,
  GridModeDefaults,
  SizeModeDefaults,
  PassportModeDefaults,
  MaskModeDefaults
} from "./types";

export { DEFAULT_APP_SETTINGS } from "./defaults";
export { migrateSettings, SETTINGS_MIGRATIONS, CURRENT_SETTINGS_VERSION } from "./migrations";
export { useAppSettings } from "./store";
export type { AppSettingsState } from "./store";

import { useAppSettings } from "./store";
import type { AppSettings } from "./types";

/**
 * Convenience hook — select a single settings category with minimal re-renders.
 * Usage: const general = useAppSetting("general")
 */
export function useAppSetting<K extends keyof AppSettings>(category: K): AppSettings[K] {
  return useAppSettings((state) => state.settings[category]);
}

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppSettings,
  GeneralSettings,
  WorkspaceSettings,
  ShortcutsSettings,
  AppearanceSettings,
  PerformanceSettings,
  FilesAutosaveSettings,
  ExportPrintSettings,
  PassportSettings,
  AdvancedSettings,
  PrintHubSettings,
  AdvancedPrintSettings,
  ComponentsSettings,
  SettingsCategory,
  ShortcutModifiers
} from "./types";
import { DEFAULT_APP_SETTINGS } from "./defaults";
import { migrateSettings } from "./migrations";

// ─── Store interface ───────────────────────────────────────────────────────────

export interface AppSettingsState {
  settings: AppSettings;
  updateGeneral: (patch: Partial<GeneralSettings>) => void;
  updateWorkspace: (patch: Partial<WorkspaceSettings>) => void;
  updateShortcuts: (patch: Partial<ShortcutsSettings>) => void;
  updateAppearance: (patch: Partial<AppearanceSettings>) => void;
  updatePerformance: (patch: Partial<PerformanceSettings>) => void;
  updateFilesAutosave: (patch: Partial<FilesAutosaveSettings>) => void;
  updateExportPrint: (patch: Partial<ExportPrintSettings>) => void;
  updatePassport: (patch: Partial<PassportSettings>) => void;
  updateAdvanced: (patch: Partial<AdvancedSettings>) => void;
  updatePrintHub: (patch: Partial<PrintHubSettings>) => void;
  updateAdvancedPrint: (patch: Partial<AdvancedPrintSettings>) => void;
  updateComponents: (patch: Partial<ComponentsSettings>) => void;
  /** Reset a single settings category to its defaults */
  resetCategory: (category: SettingsCategory) => void;
  /** Reset all settings to defaults */
  resetAll: () => void;
  /** Serialise current settings to a JSON string */
  exportSettings: () => string;
  /** Validate + apply imported settings JSON. Returns success/error. */
  importSettings: (json: string) => { success: boolean; error?: string };
  /** Update a single shortcut's key binding (pass key=null to clear to default) */
  updateShortcutKey: (action: string, key: string | null, modifiers: ShortcutModifiers) => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useAppSettings = create<AppSettingsState>()(
  persist(
    (set, get) => ({
      settings: { ...DEFAULT_APP_SETTINGS },

      updateGeneral: (patch) =>
        set((s) => ({ settings: { ...s.settings, general: { ...s.settings.general, ...patch } } })),

      updateWorkspace: (patch) =>
        set((s) => ({ settings: { ...s.settings, workspace: { ...s.settings.workspace, ...patch } } })),

      updateShortcuts: (patch) =>
        set((s) => ({ settings: { ...s.settings, shortcuts: { ...s.settings.shortcuts, ...patch } } })),

      updateAppearance: (patch) =>
        set((s) => ({ settings: { ...s.settings, appearance: { ...s.settings.appearance, ...patch } } })),

      updatePerformance: (patch) =>
        set((s) => ({ settings: { ...s.settings, performance: { ...s.settings.performance, ...patch } } })),

      updateFilesAutosave: (patch) =>
        set((s) => ({ settings: { ...s.settings, filesAutosave: { ...s.settings.filesAutosave, ...patch } } })),

      updateExportPrint: (patch) =>
        set((s) => ({ settings: { ...s.settings, exportPrint: { ...s.settings.exportPrint, ...patch } } })),

      updatePassport: (patch) =>
        set((s) => ({ settings: { ...s.settings, passport: { ...s.settings.passport, ...patch } } })),

      updateAdvanced: (patch) =>
        set((s) => ({ settings: { ...s.settings, advanced: { ...s.settings.advanced, ...patch } } })),

      updatePrintHub: (patch) =>
        set((s) => ({ settings: { ...s.settings, printHub: { ...s.settings.printHub, ...patch } } })),

      updateAdvancedPrint: (patch) =>
        set((s) => ({ settings: { ...s.settings, advancedPrint: { ...s.settings.advancedPrint, ...patch } } })),

      updateComponents: (patch) =>
        set((s) => ({ settings: { ...s.settings, components: { ...s.settings.components, ...patch } } })),

      resetCategory: (category) =>
        set((s) => ({
          settings: {
            ...s.settings,
            [category]: { ...(DEFAULT_APP_SETTINGS[category] as object) }
          }
        })),

      resetAll: () => set({ settings: { ...DEFAULT_APP_SETTINGS } }),

      exportSettings: () => JSON.stringify(get().settings, null, 2),

      importSettings: (json) => {
        try {
          const parsed: unknown = JSON.parse(json);
          const migrated = migrateSettings(parsed);
          set({ settings: migrated });
          return { success: true };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : "שגיאה בניתוח קובץ ההגדרות" };
        }
      },

      updateShortcutKey: (action, key, modifiers) =>
        set((s) => {
          const def = DEFAULT_APP_SETTINGS.shortcuts.shortcuts.find((sc) => sc.action === action);
          const resolvedKey = key ?? def?.defaultKey ?? "";
          return {
            settings: {
              ...s.settings,
              shortcuts: {
                ...s.settings.shortcuts,
                shortcuts: s.settings.shortcuts.shortcuts.map((sc) =>
                  sc.action === action
                    ? {
                        ...sc,
                        currentKey: resolvedKey,
                        currentCtrl: modifiers.ctrl,
                        currentMeta: modifiers.meta,
                        currentShift: modifiers.shift,
                        currentAlt: modifiers.alt
                      }
                    : sc
                )
              }
            }
          };
        })
    }),
    {
      name: "spp-app-settings",
      // Run migration on every rehydration so stored blobs from older versions are upgraded
      merge: (persisted, current) => {
        const raw =
          persisted !== null &&
          typeof persisted === "object" &&
          "settings" in (persisted as object)
            ? (persisted as { settings: unknown }).settings
            : persisted;
        return { ...current, settings: migrateSettings(raw) };
      }
    }
  )
);

// ─── One-time migration from old spp-utilities-settings store ─────────────────
// Runs once on module load. If the new store already has paths set, skip.
function syncFromUtilitiesSettings(): void {
  const state = useAppSettings.getState();
  if (state.settings.filesAutosave.photoshopPath !== "") return;
  try {
    const raw = localStorage.getItem("spp-utilities-settings");
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Zustand persist wraps value in { state: ..., version: ... }
    const inner =
      "state" in parsed && typeof parsed.state === "object" && parsed.state !== null
        ? (parsed.state as Record<string, unknown>)
        : parsed;
    const pathKeys = [
      "photoshopPath", "colorLabPath", "pdfEditorPath", "collageEditorPath",
      "projectsFolder", "exportsFolder", "tempEditingFolder"
    ] as const;
    const patch: Partial<FilesAutosaveSettings> = {};
    for (const k of pathKeys) {
      if (typeof inner[k] === "string" && inner[k] !== "") {
        patch[k] = inner[k] as string;
      }
    }
    if (Object.keys(patch).length > 0) {
      useAppSettings.getState().updateFilesAutosave(patch);
    }
  } catch {
    // Non-fatal — silently skip
  }
}

syncFromUtilitiesSettings();

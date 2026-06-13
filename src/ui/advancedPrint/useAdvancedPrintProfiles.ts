// Thin hooks over the settings store for Advanced Print profile/preset CRUD.

import { useCallback } from "react";

import { useAppSettings } from "@/settings/store";
import { BUILT_IN_OUTPUT_PRESETS, duplicateOutputPreset } from "@/core/advancedPrint/builtInPresets";
import type { AdvancedPrinterProfile, OutputPreset } from "@/types/advancedPrint";

export function useAdvancedPrintSettings() {
  const settings = useAppSettings((s) => s.settings.advancedPrint);
  const update = useAppSettings((s) => s.updateAdvancedPrint);

  const upsertProfile = useCallback(
    (profile: AdvancedPrinterProfile) => {
      const existing = settings.profiles.findIndex((p) => p.id === profile.id);
      const profiles = existing >= 0
        ? settings.profiles.map((p) => (p.id === profile.id ? profile : p))
        : [...settings.profiles, profile];
      update({ profiles, defaultProfileId: settings.defaultProfileId ?? profile.id });
    },
    [settings, update]
  );

  const deleteProfile = useCallback(
    (id: string) => {
      const profiles = settings.profiles.filter((p) => p.id !== id);
      const defaultProfileId = settings.defaultProfileId === id ? (profiles[0]?.id ?? null) : settings.defaultProfileId;
      update({ profiles, defaultProfileId });
    },
    [settings, update]
  );

  const setDefaultProfile = useCallback((id: string) => update({ defaultProfileId: id }), [update]);

  const upsertPreset = useCallback(
    (preset: OutputPreset) => {
      const existing = settings.outputPresets.findIndex((p) => p.id === preset.id);
      const outputPresets = existing >= 0
        ? settings.outputPresets.map((p) => (p.id === preset.id ? preset : p))
        : [...settings.outputPresets, preset];
      update({ outputPresets });
    },
    [settings, update]
  );

  const duplicatePreset = useCallback(
    (source: OutputPreset) => {
      const copy = duplicateOutputPreset(source);
      update({ outputPresets: [...settings.outputPresets, copy] });
      return copy;
    },
    [settings, update]
  );

  const resetPreset = useCallback(
    (preset: OutputPreset) => {
      const builtin = BUILT_IN_OUTPUT_PRESETS.find((b) => b.id === preset.id);
      if (!builtin) return;
      update({ outputPresets: settings.outputPresets.map((p) => (p.id === preset.id ? { ...builtin } : p)) });
    },
    [settings, update]
  );

  const setEnabled = useCallback((enabled: boolean) => update({ enabled }), [update]);

  return {
    settings,
    upsertProfile,
    deleteProfile,
    setDefaultProfile,
    upsertPreset,
    duplicatePreset,
    resetPreset,
    setEnabled
  };
}

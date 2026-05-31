import { create } from "zustand";
import { persist } from "zustand/middleware";

import { setCustomPresets, type SmartPresetDefinition } from "@/core/presets/smartPresets";

/**
 * Persistent registry of user-saved custom presets (plan שלב 4).
 *
 * Custom presets are full SmartPresetDefinitions with `custom:<uuid>` ids and
 * category "Custom". They are persisted to localStorage and mirrored into the
 * pure smartPresets module via `setCustomPresets`, so `getPreset`/`listPresets`
 * resolve them exactly like built-ins (apply/preview/strength all reuse one path).
 *
 * `syncRegistry` is called on every mutation and on rehydrate to keep the pure
 * module in step with the persisted store.
 */

interface CustomPresetState {
  presets: SmartPresetDefinition[];
  /** Add a new custom preset (most-recent first). */
  addPreset: (def: SmartPresetDefinition) => void;
  /** Rename an existing custom preset by id. */
  renamePreset: (id: string, name: string) => void;
  /** Remove a custom preset by id. */
  removePreset: (id: string) => void;
}

function syncRegistry(presets: SmartPresetDefinition[]): void {
  setCustomPresets(presets);
}

export const useCustomPresetStore = create<CustomPresetState>()(
  persist(
    (set) => ({
      presets: [],

      addPreset: (def) =>
        set((s) => {
          const next = [def, ...s.presets];
          syncRegistry(next);
          return { presets: next };
        }),

      renamePreset: (id, name) =>
        set((s) => {
          const trimmed = name.trim();
          const next = s.presets.map((p) => (p.id === id && trimmed.length > 0 ? { ...p, name: trimmed } : p));
          syncRegistry(next);
          return { presets: next };
        }),

      removePreset: (id) =>
        set((s) => {
          const next = s.presets.filter((p) => p.id !== id);
          syncRegistry(next);
          return { presets: next };
        })
    }),
    {
      name: "spp2-custom-presets",
      onRehydrateStorage: () => (state) => {
        if (state !== undefined) syncRegistry(state.presets);
      }
    }
  )
);

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Recently-Used persistence for the unified Tool Library (plan שלב 4).
 *
 * Stores the `LibraryItem.key`s of items the user most recently applied, most
 * recent first, capped at MAX_RECENT. Keys follow the toolLibrary scheme:
 *   - raw tool:        `tool:<ImageAdjustmentType>`
 *   - page effect:     `effect:<PageLookEffectKind>`
 *   - image preset:    `<presetId>`
 *   - page-look preset:`pagelook:<presetId>`
 *
 * Persisted to localStorage so the Recently-Used row survives reloads.
 */

const MAX_RECENT = 12;

interface ToolLibraryState {
  /** Most-recent-first list of LibraryItem keys. */
  recentKeys: string[];
  /** Record that an item was applied: moves/inserts its key at the front. */
  markUsed: (key: string) => void;
  /** Clear the Recently-Used history. */
  clearRecent: () => void;
}

export const useToolLibraryStore = create<ToolLibraryState>()(
  persist(
    (set) => ({
      recentKeys: [],

      markUsed: (key) =>
        set((s) => {
          const without = s.recentKeys.filter((k) => k !== key);
          return { recentKeys: [key, ...without].slice(0, MAX_RECENT) };
        }),

      clearRecent: () => set({ recentKeys: [] })
    }),
    { name: "spp2-tool-library-recent" }
  )
);

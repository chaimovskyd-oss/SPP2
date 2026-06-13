import { create } from "zustand";

/**
 * Live status of the AI model preload/warmup system. Driven by the smart-selection
 * sidecar (via aiPreloadService): progress events + periodic status polls write
 * here, and the AiPreloadChip / AiPreloadSplash render from it. See plan
 * add-an-ai-model-jiggly-locket.
 */
export type AiPreloadOverall = "idle" | "loading" | "ready" | "failed" | "fallback";

export type AiModelStatusValue = "idle" | "loading" | "ready" | "failed" | "fallback";

export interface AiModelStatusEntry {
  name: string;
  status: AiModelStatusValue;
  provider?: string | null;
  loadMs?: number | null;
  warmupMs?: number | null;
  memoryMb?: number | null;
  loadedAt?: number | null;
  error?: string | null;
  fallbackReason?: string | null;
  warmupError?: string | null;
}

interface AiPreloadState {
  /** "lazy" means preload is disabled; we never enter loading. */
  level: string;
  overall: AiPreloadOverall;
  /** True once the essential (most-used) models are ready enough to hide the splash. */
  essentialReady: boolean;
  models: Record<string, AiModelStatusEntry>;
  /** Wall-clock ms when the current preload run began (for the slow-load splash). */
  startedAt: number | null;
  setLevel: (level: string) => void;
  beginPreload: (level: string) => void;
  applyStatus: (status: {
    level?: string;
    overall?: AiPreloadOverall;
    essentialReady?: boolean;
    models?: Record<string, AiModelStatusEntry>;
  }) => void;
  applyModel: (model: AiModelStatusEntry) => void;
  reset: () => void;
}

export const useAiPreloadStore = create<AiPreloadState>((set) => ({
  level: "lazy",
  overall: "idle",
  essentialReady: true,
  models: {},
  startedAt: null,
  setLevel: (level) => set({ level }),
  beginPreload: (level) =>
    set({ level, overall: level === "lazy" ? "idle" : "loading", essentialReady: level === "lazy", startedAt: Date.now() }),
  applyStatus: (status) =>
    set((s) => ({
      level: status.level ?? s.level,
      overall: status.overall ?? s.overall,
      essentialReady: status.essentialReady ?? s.essentialReady,
      models: status.models ?? s.models
    })),
  applyModel: (model) =>
    set((s) => ({ models: { ...s.models, [model.name]: model } })),
  reset: () => set({ overall: "idle", essentialReady: true, models: {}, startedAt: null })
}));

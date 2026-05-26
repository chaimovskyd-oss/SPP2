import { create } from "zustand";
import type { PassportDetectionResult } from "@/core/passport/passportDetectionService";
import type { PassportValidationResult } from "@/core/passport/passportValidationService";

export interface PassportRuntimeEntry {
  loading: boolean;
  detection: PassportDetectionResult | null;
  validation: PassportValidationResult | null;
  error?: string;
  updatedAt: number;
}

interface PassportAssistantState {
  entries: Record<string, PassportRuntimeEntry>;
  setLoading: (key: string) => void;
  setResult: (key: string, detection: PassportDetectionResult, validation: PassportValidationResult) => void;
  setError: (key: string, error: string) => void;
  clearMissing: (keys: string[]) => void;
}

export const usePassportAssistantStore = create<PassportAssistantState>((set) => ({
  entries: {},
  setLoading: (key) => set((state) => ({
    entries: {
      ...state.entries,
      [key]: {
        loading: true,
        detection: state.entries[key]?.detection ?? null,
        validation: state.entries[key]?.validation ?? null,
        updatedAt: Date.now()
      }
    }
  })),
  setResult: (key, detection, validation) => set((state) => ({
    entries: {
      ...state.entries,
      [key]: { loading: false, detection, validation, updatedAt: Date.now() }
    }
  })),
  setError: (key, error) => set((state) => ({
    entries: {
      ...state.entries,
      [key]: {
        loading: false,
        detection: state.entries[key]?.detection ?? null,
        validation: state.entries[key]?.validation ?? null,
        error,
        updatedAt: Date.now()
      }
    }
  })),
  clearMissing: (keys) => set((state) => {
    const keep = new Set(keys);
    const entries = Object.fromEntries(Object.entries(state.entries).filter(([key]) => keep.has(key)));
    return { entries };
  })
}));

export function passportRuntimeKey(frameId: string, assetId: string | undefined, transformKey: string, requirementId: string, sizeKey: string): string {
  return [frameId, assetId ?? "empty", transformKey, requirementId, sizeKey].join("|");
}

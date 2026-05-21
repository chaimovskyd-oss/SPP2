import { create } from "zustand";
import type { HarmonyScheme } from "@/core/color/harmonies";

const STORAGE_KEY = "spp2.colorStore.v1";
const MAX_HISTORY = 12;

export interface ColorStoreState {
  currentColor: string;
  history: string[];
  dominantColors: string[];
  harmonyScheme: HarmonyScheme;
  setCurrentColor: (hex: string) => void;
  sampleColor: (hex: string) => void;
  removeFromHistory: (hex: string) => void;
  clearHistory: () => void;
  setDominantColors: (list: string[]) => void;
  setHarmonyScheme: (scheme: HarmonyScheme) => void;
}

const VALID_SCHEMES: HarmonyScheme[] = ["complementary", "analogous", "triadic", "splitComplement", "monochromatic"];
function isHarmonyScheme(v: unknown): v is HarmonyScheme {
  return typeof v === "string" && (VALID_SCHEMES as string[]).includes(v);
}

function normalizeHex(input: string): string {
  let v = input.trim();
  if (!v.startsWith("#")) v = `#${v}`;
  v = v.toUpperCase();
  if (/^#[0-9A-F]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return /^#[0-9A-F]{6}$/.test(v) ? v : "#000000";
}

function loadInitial(): { currentColor: string; history: string[]; harmonyScheme: HarmonyScheme } {
  const fallback = { currentColor: "#000000", history: [] as string[], harmonyScheme: "complementary" as HarmonyScheme };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as { currentColor?: unknown; history?: unknown; harmonyScheme?: unknown };
    const cur = typeof parsed.currentColor === "string" ? normalizeHex(parsed.currentColor) : "#000000";
    const hist = Array.isArray(parsed.history)
      ? parsed.history.filter((v): v is string => typeof v === "string").map(normalizeHex).slice(0, MAX_HISTORY)
      : [];
    const scheme = isHarmonyScheme(parsed.harmonyScheme) ? parsed.harmonyScheme : "complementary";
    return { currentColor: cur, history: hist, harmonyScheme: scheme };
  } catch {
    return fallback;
  }
}

function persist(state: { currentColor: string; history: string[]; harmonyScheme: HarmonyScheme }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ currentColor: state.currentColor, history: state.history, harmonyScheme: state.harmonyScheme })
    );
  } catch {
    // ignore quota / privacy errors
  }
}

const initial = loadInitial();

function snapshot(): { currentColor: string; history: string[]; harmonyScheme: HarmonyScheme } {
  const s = useColorStore.getState();
  return { currentColor: s.currentColor, history: s.history, harmonyScheme: s.harmonyScheme };
}

export const useColorStore = create<ColorStoreState>((set) => ({
  currentColor: initial.currentColor,
  history: initial.history,
  dominantColors: [],
  harmonyScheme: initial.harmonyScheme,
  setCurrentColor: (hex) =>
    set(() => {
      const normalized = normalizeHex(hex);
      persist({ ...snapshot(), currentColor: normalized });
      return { currentColor: normalized };
    }),
  sampleColor: (hex) =>
    set((state) => {
      const normalized = normalizeHex(hex);
      const filtered = state.history.filter((c) => c !== normalized);
      const nextHistory = [normalized, ...filtered].slice(0, MAX_HISTORY);
      persist({ ...snapshot(), currentColor: normalized, history: nextHistory });
      return { currentColor: normalized, history: nextHistory };
    }),
  removeFromHistory: (hex) =>
    set((state) => {
      const normalized = normalizeHex(hex);
      const nextHistory = state.history.filter((c) => c !== normalized);
      persist({ ...snapshot(), history: nextHistory });
      return { history: nextHistory };
    }),
  clearHistory: () =>
    set(() => {
      persist({ ...snapshot(), history: [] });
      return { history: [] };
    }),
  setDominantColors: (list) =>
    set(() => ({ dominantColors: list.map(normalizeHex) })),
  setHarmonyScheme: (scheme) =>
    set(() => {
      persist({ ...snapshot(), harmonyScheme: scheme });
      return { harmonyScheme: scheme };
    })
}));

export function rgbaToHex(r: number, g: number, b: number): string {
  const toHex = (v: number): string => {
    const clamped = Math.max(0, Math.min(255, Math.round(v)));
    return clamped.toString(16).padStart(2, "0").toUpperCase();
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

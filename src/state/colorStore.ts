import { create } from "zustand";

const STORAGE_KEY = "spp2.colorStore.v1";
const MAX_HISTORY = 12;

export interface ColorStoreState {
  currentColor: string;
  history: string[];
  setCurrentColor: (hex: string) => void;
  sampleColor: (hex: string) => void;
  removeFromHistory: (hex: string) => void;
  clearHistory: () => void;
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

function loadInitial(): { currentColor: string; history: string[] } {
  if (typeof window === "undefined") return { currentColor: "#000000", history: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { currentColor: "#000000", history: [] };
    const parsed = JSON.parse(raw) as { currentColor?: unknown; history?: unknown };
    const cur = typeof parsed.currentColor === "string" ? normalizeHex(parsed.currentColor) : "#000000";
    const hist = Array.isArray(parsed.history)
      ? parsed.history.filter((v): v is string => typeof v === "string").map(normalizeHex).slice(0, MAX_HISTORY)
      : [];
    return { currentColor: cur, history: hist };
  } catch {
    return { currentColor: "#000000", history: [] };
  }
}

function persist(state: { currentColor: string; history: string[] }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentColor: state.currentColor, history: state.history }));
  } catch {
    // ignore quota / privacy errors
  }
}

const initial = loadInitial();

export const useColorStore = create<ColorStoreState>((set) => ({
  currentColor: initial.currentColor,
  history: initial.history,
  setCurrentColor: (hex) =>
    set(() => {
      const normalized = normalizeHex(hex);
      const next = { currentColor: normalized };
      persist({ currentColor: normalized, history: useColorStore.getState().history });
      return next;
    }),
  sampleColor: (hex) =>
    set((state) => {
      const normalized = normalizeHex(hex);
      const filtered = state.history.filter((c) => c !== normalized);
      const nextHistory = [normalized, ...filtered].slice(0, MAX_HISTORY);
      const next = { currentColor: normalized, history: nextHistory };
      persist(next);
      return next;
    }),
  removeFromHistory: (hex) =>
    set((state) => {
      const normalized = normalizeHex(hex);
      const nextHistory = state.history.filter((c) => c !== normalized);
      const next = { currentColor: state.currentColor, history: nextHistory };
      persist(next);
      return { history: nextHistory };
    }),
  clearHistory: () =>
    set((state) => {
      persist({ currentColor: state.currentColor, history: [] });
      return { history: [] };
    })
}));

export function rgbaToHex(r: number, g: number, b: number): string {
  const toHex = (v: number): string => {
    const clamped = Math.max(0, Math.min(255, Math.round(v)));
    return clamped.toString(16).padStart(2, "0").toUpperCase();
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Built-in and user-saved presets for the multi-channel Curves editor.
 *
 * A preset is just a full CurveChannelPoints set. Built-ins are computed; custom
 * presets are persisted in localStorage so they survive across sessions without
 * touching the document schema.
 */

import { createDefaultCurveChannels, type CurveChannelPoints } from "@/types/imageAdjustments";

export interface CurveChannelPreset {
  id: string;
  label: string;
  channels: CurveChannelPoints;
}

/** Build a channel set from a partial override (unspecified channels stay identity). */
function channels(over: Partial<CurveChannelPoints>): CurveChannelPoints {
  return { ...createDefaultCurveChannels(), ...over };
}

export const BUILTIN_CURVE_PRESETS: CurveChannelPreset[] = [
  {
    id: "mildContrast",
    label: "ניגודיות עדינה",
    channels: channels({ rgb: [{ x: 0, y: 0 }, { x: 64, y: 56 }, { x: 192, y: 200 }, { x: 255, y: 255 }] })
  },
  {
    id: "strongContrast",
    label: "ניגודיות חזקה",
    channels: channels({ rgb: [{ x: 0, y: 0 }, { x: 64, y: 38 }, { x: 192, y: 218 }, { x: 255, y: 255 }] })
  },
  {
    id: "matteFade",
    label: "Matte Fade",
    channels: channels({ rgb: [{ x: 0, y: 28 }, { x: 64, y: 80 }, { x: 192, y: 196 }, { x: 255, y: 236 }] })
  },
  {
    id: "warmHighlights",
    label: "הדגשות חמות",
    channels: channels({
      r: [{ x: 0, y: 0 }, { x: 160, y: 174 }, { x: 255, y: 255 }],
      b: [{ x: 0, y: 0 }, { x: 160, y: 146 }, { x: 255, y: 255 }]
    })
  },
  {
    id: "coolShadows",
    label: "צללים קרירים",
    channels: channels({
      b: [{ x: 0, y: 14 }, { x: 96, y: 110 }, { x: 255, y: 255 }],
      r: [{ x: 0, y: 0 }, { x: 96, y: 84 }, { x: 255, y: 255 }]
    })
  }
];

// ─── custom (saved) presets ────────────────────────────────────────────────────

const STORAGE_KEY = "spp2.curves.customPresets";

export interface CustomCurvePreset {
  id: string;
  name: string;
  channels: CurveChannelPoints;
}

export function loadCustomCurvePresets(): CustomCurvePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is CustomCurvePreset =>
        typeof p === "object" && p !== null && "id" in p && "name" in p && "channels" in p
    );
  } catch {
    return [];
  }
}

export function saveCustomCurvePreset(name: string, channelsToSave: CurveChannelPoints): CustomCurvePreset[] {
  const presets = loadCustomCurvePresets();
  const preset: CustomCurvePreset = {
    id: `curve_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "פריסט עקומה",
    channels: channelsToSave
  };
  const next = [...presets, preset];
  persist(next);
  return next;
}

export function deleteCustomCurvePreset(id: string): CustomCurvePreset[] {
  const next = loadCustomCurvePresets().filter((p) => p.id !== id);
  persist(next);
  return next;
}

function persist(presets: CustomCurvePreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Storage unavailable / quota — non-fatal; presets just won't persist.
  }
}

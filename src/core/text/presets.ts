import type { TextLayer } from "@/types/layers";
import type { GradientStyle, ShadowStyle, StrokeStyle } from "@/types/primitives";
import type { TextEffect, TextPreset, TextStylePatch } from "@/types/text";

const USER_TEXT_PRESETS_KEY = "spp2_user_text_presets_v1";

function effect(effectId: string, effectType: TextEffect["effectType"], params: TextEffect["params"]): TextEffect {
  return {
    version: 1,
    id: effectId,
    effectId,
    effectType,
    enabled: true,
    opacity: 1,
    blendMode: "normal",
    params
  };
}

function stroke(color: string, width: number, opacity = 1): StrokeStyle {
  return {
    version: 1,
    color,
    width,
    opacity
  };
}

function shadow(color: string, blur: number, offsetX: number, offsetY: number, opacity: number): ShadowStyle {
  return {
    version: 1,
    color,
    blur,
    offsetX,
    offsetY,
    opacity
  };
}

function gradient(colors: string[], angle = 0): GradientStyle {
  return {
    version: 1,
    type: "linear",
    angle,
    stops: colors.map((color, index) => ({
      offset: colors.length === 1 ? 0 : index / (colors.length - 1),
      color,
      opacity: 1
    }))
  };
}

function gradientStops(stops: Array<[number, string, number?]>, angle = 0, type: GradientStyle["type"] = "linear"): GradientStyle {
  return {
    version: 1,
    type,
    angle,
    stops: stops.map(([offset, color, opacity = 1]) => ({ offset, color, opacity }))
  };
}

function preset(input: Omit<TextPreset, "version" | "isBuiltin" | "isFavourite" | "folder"> & { folder?: string }): TextPreset {
  return {
    version: 1,
    isBuiltin: true,
    isFavourite: false,
    folder: input.folder ?? input.category,
    ...input
  };
}

export const BUILTIN_TEXT_PRESETS: TextPreset[] = [
  preset({
    presetId: "gold_classic",
    name: "זהב קלאסי",
    category: "metal",
    includesTypography: false,
    style: {
      color: "#f7d66b",
      gradient: gradient(["#fff4a8", "#d69a25", "#fff1a0"], 90),
      stroke: stroke("#4d3105", 2, 0.95),
      shadow: shadow("#2c1b04", 8, 5, 7, 0.42)
    },
    effects: [
      effect("gold_fill", "fill", { fillType: "gradient", gradient: gradient(["#fff4a8", "#d69a25", "#fff1a0"], 90) }),
      effect("gold_shadow", "drop_shadow", { color: "#2c1b04", opacity: 0.42, angle: 54, distance: 9, blur: 8 })
    ]
  }),
  preset({
    presetId: "chrome",
    name: "כרום",
    category: "metal",
    includesTypography: false,
    style: {
      color: "#e7edf4",
      gradient: gradient(["#ffffff", "#9ca7b5", "#f7fbff", "#596270"], 90),
      stroke: stroke("#2a3038", 1, 0.8),
      shadow: shadow("#111827", 4, 3, 4, 0.28)
    },
    effects: [
      effect("chrome_fill", "fill", { fillType: "gradient", gradient: gradient(["#ffffff", "#9ca7b5", "#f7fbff", "#596270"], 90) }),
      effect("chrome_satin", "satin", { color: "#ffffff", opacity: 0.35 })
    ]
  }),
  preset({
    presetId: "neon_pink",
    name: "ניאון ורוד",
    category: "neon",
    includesTypography: false,
    style: {
      color: "#ff4fd8",
      stroke: stroke("#fff5ff", 1, 0.8),
      shadow: shadow("#ff39d6", 22, 0, 0, 0.85)
    },
    effects: [
      effect("neon_pink_fill", "fill", { fillType: "solid", color: "#ff4fd8", opacity: 1 }),
      effect("neon_pink_glow", "outer_glow", { color: "#ff39d6", opacity: 0.85, angle: 0, distance: 0, blur: 22, spread: 8 })
    ]
  }),
  preset({
    presetId: "neon_blue",
    name: "ניאון כחול",
    category: "neon",
    includesTypography: false,
    style: {
      color: "#60d5ff",
      stroke: stroke("#e9fbff", 1, 0.8),
      shadow: shadow("#29a8ff", 20, 0, 0, 0.75)
    },
    effects: [effect("neon_blue_glow", "outer_glow", { color: "#29a8ff", opacity: 0.75, angle: 0, distance: 0, blur: 20, spread: 6 })]
  }),
  preset({
    presetId: "modern_clean",
    name: "מודרני נקי",
    category: "modern",
    includesTypography: true,
    style: {
      fontFamily: "DM Sans",
      fontWeight: 700,
      color: "#17161c",
      shadow: undefined,
      stroke: undefined,
      gradient: undefined
    },
    effects: []
  }),
  preset({
    presetId: "retro_sunset",
    name: "רטרו שקיעה",
    category: "retro",
    includesTypography: false,
    style: {
      color: "#ff7a59",
      gradient: gradient(["#ffd166", "#ef476f", "#7b2cbf"], 90),
      shadow: shadow("#2b143d", 6, 4, 5, 0.35)
    },
    effects: [effect("retro_fill", "fill", { fillType: "gradient", gradient: gradient(["#ffd166", "#ef476f", "#7b2cbf"], 90) })]
  }),
  preset({
    presetId: "hebrew_elegant",
    name: "עברית אלגנטית",
    category: "hebrew",
    includesTypography: true,
    style: {
      fontFamily: "Noto Sans Hebrew, Arial",
      fontWeight: 600,
      color: "#26232d",
      letterSpacing: 0,
      lineHeight: 1.18
    },
    effects: []
  }),
  preset({
    presetId: "soft_shadow",
    name: "צל רך",
    category: "minimal",
    includesTypography: false,
    style: {
      color: "#24222b",
      shadow: shadow("#000000", 10, 0, 5, 0.2)
    },
    effects: [effect("soft_shadow", "drop_shadow", { color: "#000000", opacity: 0.2, angle: 90, distance: 5, blur: 10 })]
  }),
  preset({
    presetId: "outlined_white",
    name: "לבן עם קו",
    category: "minimal",
    includesTypography: false,
    style: {
      color: "#ffffff",
      stroke: stroke("#15131a", 3, 1),
      shadow: shadow("#000000", 4, 2, 2, 0.24)
    },
    effects: []
  }),
  preset({
    presetId: "minimal_white",
    name: "לבן",
    category: "minimal",
    includesTypography: false,
    style: {
      color: "#ffffff",
      shadow: shadow("#000000", 6, 0, 3, 0.2),
      stroke: undefined,
      gradient: undefined
    },
    effects: [effect("minimal_white_shadow", "drop_shadow", { color: "#000000", opacity: 0.2, angle: 90, distance: 3, blur: 6 })]
  }),
  preset({
    presetId: "minimal_black",
    name: "שחור",
    category: "minimal",
    includesTypography: false,
    style: {
      color: "#000000",
      stroke: undefined,
      shadow: undefined,
      gradient: undefined
    },
    effects: []
  }),
  preset({
    presetId: "3d_extrude",
    name: "תלת מימד",
    category: "3d",
    includesTypography: false,
    style: {
      color: "#5eead4",
      gradient: gradient(["#99f6e4", "#14b8a6"], 90),
      stroke: stroke("#0f766e", 1.5, 1),
      shadow: shadow("#115e59", 2, 7, 8, 0.62)
    },
    effects: [
      effect("extrude_fill", "fill", { fillType: "gradient", gradient: gradient(["#99f6e4", "#14b8a6"], 90) }),
      effect("extrude_depth", "drop_shadow", { color: "#115e59", opacity: 0.62, angle: 48, distance: 11, blur: 2 })
    ]
  }),
  preset({
    presetId: "real_3d_gold",
    name: "זהב תלת ממדי אמיתי",
    category: "3d",
    includesTypography: false,
    style: {
      color: "#f8d76a",
      gradient: gradientStops([[0, "#fff7bd"], [0.18, "#f8d76a"], [0.38, "#a8640c"], [0.56, "#fff0a3"], [0.76, "#c98618"], [1, "#5f3204"]], 90),
      stroke: stroke("#3a2204", 2.4, 1),
      shadow: shadow("#1b1002", 12, 8, 10, 0.42)
    },
    effects: [
      effect("real_gold_extrude", "extrude_3d", { color: "#7b4308", depth: 18, offsetX: 1.15, offsetY: 1.25, steps: 18, opacity: 0.92 }),
      effect("real_gold_fill", "fill", { fillType: "gradient", gradient: gradientStops([[0, "#fff7bd"], [0.18, "#f8d76a"], [0.38, "#a8640c"], [0.56, "#fff0a3"], [0.76, "#c98618"], [1, "#5f3204"]], 90), opacity: 1 }),
      effect("real_gold_bevel", "bevel_emboss", { style: "inner_bevel", technique: "smooth", depth: 8, size: 5, soften: 1, highlightColor: "#ffffff", shadowColor: "#5d3306" }),
      effect("real_gold_brushed_pattern", "pattern_overlay", { patternType: "brushed_metal", foreground: "#fff7c2", background: "#b87512", opacity: 0.2, scale: 1, rotation: -8, spacing: 5 }),
      effect("real_gold_sparkle", "sparkle", { density: 0.22, size: 6, color: "#ffffff", seed: 31, opacity: 0.82, rays: 8, glint: 0.8, halo: 0.75 })
    ]
  }),
  preset({
    presetId: "real_3d_blue",
    name: "כחול תלת ממדי",
    category: "3d",
    includesTypography: false,
    style: {
      color: "#38d5ff",
      gradient: gradientStops([[0, "#e4fbff"], [0.22, "#39d9ff"], [0.5, "#1260d3"], [0.76, "#6ef1ff"], [1, "#092a70"]], 90),
      stroke: stroke("#061a4a", 2, 1),
      shadow: shadow("#05122e", 10, 8, 9, 0.46)
    },
    effects: [
      effect("real_blue_extrude", "extrude_3d", { color: "#063c95", depth: 15, offsetX: 1.05, offsetY: 1.15, steps: 16, opacity: 0.9 }),
      effect("real_blue_bevel", "bevel_emboss", { style: "inner_bevel", technique: "smooth", depth: 7, size: 5, soften: 1, highlightColor: "#ffffff", shadowColor: "#06215d" }),
      effect("real_blue_glow", "outer_glow", { color: "#22d3ee", outerColor: "#2563eb", opacity: 0.45, angle: 0, distance: 0, blur: 24, spread: 8, passes: 3 })
    ]
  }),
  preset({
    presetId: "true_silver_sparkle",
    name: "כסף אמיתי נוצץ",
    category: "sparkle",
    includesTypography: false,
    style: {
      color: "#eef4fb",
      gradient: gradientStops([[0, "#ffffff"], [0.12, "#8c98a6"], [0.26, "#f7fbff"], [0.42, "#596472"], [0.62, "#ffffff"], [0.78, "#aab4c0"], [1, "#2f3742"]], 90),
      stroke: stroke("#1e242c", 1.4, 0.9),
      shadow: shadow("#0b1220", 8, 4, 6, 0.34)
    },
    effects: [
      effect("silver_brush", "pattern_overlay", { patternType: "brushed_metal", foreground: "#ffffff", background: "#9aa4b2", opacity: 0.34, scale: 1, rotation: 0, spacing: 7 }),
      effect("silver_spark", "sparkle", { density: 0.28, size: 6, color: "#ffffff", seed: 12, opacity: 0.86 }),
      effect("silver_bevel", "bevel_emboss", { style: "inner_bevel", technique: "smooth", depth: 5, size: 4, soften: 1, highlightColor: "#ffffff", shadowColor: "#475569" })
    ]
  }),
  preset({
    presetId: "chrome_black_rim",
    name: "כרום עם קו שחור",
    category: "metal",
    includesTypography: false,
    style: {
      color: "#edf2f7",
      gradient: gradientStops([[0, "#ffffff"], [0.16, "#1f2937"], [0.34, "#f8fafc"], [0.52, "#64748b"], [0.7, "#ffffff"], [1, "#111827"]], 90),
      stroke: stroke("#050505", 1.6, 1),
      shadow: shadow("#000000", 5, 3, 4, 0.32)
    },
    effects: [
      effect("chrome_rim_bevel", "bevel_emboss", { style: "inner_bevel", technique: "chisel_soft", depth: 5, size: 3, soften: 1, highlightColor: "#ffffff", shadowColor: "#111827" })
    ]
  }),
  preset({
    presetId: "balloon_burnt_inside",
    name: "בלון שרוף בפנים",
    category: "comic",
    includesTypography: false,
    style: {
      color: "#ffb33c",
      gradient: gradientStops([[0, "#ffe08a"], [0.28, "#ff9d21"], [0.58, "#9d2707"], [0.82, "#ff5a1f"], [1, "#441006"]], 90),
      stroke: stroke("#080808", 2.2, 1),
      shadow: shadow("#6b1904", 8, 0, 0, 0.22)
    },
    effects: [
      effect("balloon_inner_burn", "pattern_overlay", { patternType: "halftone", foreground: "#481008", background: "#ffb33c", opacity: 0.2, scale: 1, rotation: -12, spacing: 11 }),
      effect("balloon_glow", "outer_glow", { color: "#ff7a18", outerColor: "#ef4444", opacity: 0.38, angle: 0, distance: 0, blur: 18, spread: 6, passes: 2 })
    ]
  }),
  preset({
    presetId: "candy_gloss",
    name: "סוכריה מבריקה",
    category: "sparkle",
    includesTypography: false,
    style: {
      color: "#ff4fa3",
      gradient: gradientStops([[0, "#fff6fb"], [0.18, "#ff9bd0"], [0.48, "#ff2f8f"], [0.52, "#ffffff"], [0.66, "#ff5fb0"], [1, "#a60854"]], 90),
      stroke: stroke("#7a083f", 1.8, 0.9),
      shadow: shadow("#5b0b35", 9, 4, 6, 0.32)
    },
    effects: [
      effect("candy_shine", "pattern_overlay", { patternType: "diagonal_shine", foreground: "#ffffff", background: "#ff4fa3", opacity: 0.42, scale: 1, rotation: -18, spacing: 18 }),
      effect("candy_bevel", "bevel_emboss", { style: "inner_bevel", technique: "smooth", depth: 4, size: 4, soften: 1, highlightColor: "#ffffff", shadowColor: "#a60854" })
    ]
  }),
  preset({
    presetId: "holographic",
    name: "הולוגרפי",
    category: "sparkle",
    includesTypography: false,
    style: {
      color: "#c4f1ff",
      gradient: gradientStops([[0, "#a7f3d0"], [0.16, "#93c5fd"], [0.32, "#f0abfc"], [0.48, "#ffffff"], [0.64, "#fef08a"], [0.82, "#67e8f9"], [1, "#c084fc"]], 20),
      stroke: stroke("#273047", 1.4, 0.7),
      shadow: shadow("#312e81", 9, 3, 5, 0.25)
    },
    effects: [
      effect("holo_spark", "sparkle", { density: 0.16, size: 4, color: "#ffffff", seed: 67, opacity: 0.5 })
    ]
  }),
  preset({
    presetId: "neon_double_glow",
    name: "ניאון כפול",
    category: "neon",
    includesTypography: false,
    style: {
      color: "#f8fbff",
      stroke: stroke("#8b5cf6", 1, 0.9),
      shadow: shadow("#06b6d4", 32, 0, 0, 0.72)
    },
    effects: [
      effect("double_neon_glow", "outer_glow", { color: "#f0f9ff", innerColor: "#ffffff", outerColor: "#06b6d4", opacity: 0.92, angle: 0, distance: 0, blur: 34, spread: 14, passes: 4 })
    ]
  }),
  preset({
    presetId: "sticker_white_pop",
    name: "מדבקה לבנה",
    category: "sticker",
    includesTypography: false,
    style: {
      color: "#ffffff",
      stroke: stroke("#111111", 2.6, 1),
      shadow: shadow("#000000", 6, 5, 6, 0.3)
    },
    effects: [
      effect("sticker_soft_glow", "outer_glow", { color: "#ffffff", opacity: 0.45, angle: 0, distance: 0, blur: 10, spread: 5, passes: 2 })
    ]
  }),
  preset({
    presetId: "comic_boom",
    name: "קומיקס בום",
    category: "comic",
    includesTypography: false,
    style: {
      color: "#fff04a",
      gradient: gradientStops([[0, "#fffde0"], [0.35, "#fff04a"], [0.72, "#ff6b00"], [1, "#d71920"]], 90),
      stroke: stroke("#111111", 3.2, 1),
      shadow: shadow("#2563eb", 2, 7, 7, 0.85)
    },
    effects: [
      effect("comic_dots", "pattern_overlay", { patternType: "dots", foreground: "#d71920", background: "#fff04a", opacity: 0.2, scale: 1, rotation: 0, spacing: 12 })
    ]
  }),
  preset({
    presetId: "brushed_metal",
    name: "מתכת מוברשת",
    category: "metal",
    includesTypography: false,
    style: {
      color: "#d7dde5",
      gradient: gradientStops([[0, "#f8fafc"], [0.22, "#8792a0"], [0.45, "#dce3ea"], [0.72, "#6b7280"], [1, "#f1f5f9"]], 0),
      stroke: stroke("#29313b", 1.2, 0.9),
      shadow: shadow("#111827", 5, 3, 4, 0.25)
    },
    effects: [
      effect("metal_brush_pattern", "pattern_overlay", { patternType: "brushed_metal", foreground: "#ffffff", background: "#64748b", opacity: 0.42, scale: 1, rotation: 0, spacing: 5 })
    ]
  }),
  preset({
    presetId: "fire_glow",
    name: "אש זוהרת",
    category: "sparkle",
    includesTypography: false,
    style: {
      color: "#ffb020",
      gradient: gradientStops([[0, "#fff7ad"], [0.22, "#ffb020"], [0.5, "#ff5a1f"], [0.76, "#b91c1c"], [1, "#3b0505"]], 90),
      stroke: stroke("#3b0505", 1.8, 1),
      shadow: shadow("#ef4444", 26, 0, 0, 0.65)
    },
    effects: [
      effect("fire_outer_glow", "outer_glow", { color: "#ffb020", innerColor: "#fff7ad", outerColor: "#ef4444", opacity: 0.82, angle: 0, distance: 0, blur: 30, spread: 12, passes: 3 }),
      effect("fire_noise", "pattern_overlay", { patternType: "noise", foreground: "#fff7ad", background: "#b91c1c", opacity: 0.18, scale: 1, rotation: 0, spacing: 8 })
    ]
  })
];

const PRESET_TYPOGRAPHY_KEYS = ["fontFamily", "fontWeight", "fontStyle", "lineHeight", "letterSpacing"] as const;

function presetStyleForApply(style: TextStylePatch, includesTypography: boolean): TextStylePatch {
  const next = cloneStylePatch(style);
  // Presets and text effects must never set or constrain the font size.
  delete next.fontSize;
  // Pure-effect presets (outline, 3D, neon, metal, ...) leave the layer's typography untouched.
  if (!includesTypography) {
    for (const key of PRESET_TYPOGRAPHY_KEYS) {
      delete next[key];
    }
  }
  return next;
}

export function applyTextPresetToLayer(layer: TextLayer, preset: TextPreset): TextLayer {
  return {
    ...layer,
    ...presetStyleForApply(preset.style, preset.includesTypography),
    effects: cloneEffects(preset.effects),
    textEffects: cloneEffects(preset.effects)
  };
}

export function createTextPresetFromLayer(layer: TextLayer, name: string): TextPreset {
  return {
    version: 1,
    presetId: `user_${Date.now()}_${randomId()}`,
    name: name.trim() || "Custom text preset",
    category: "user",
    includesTypography: true,
    isBuiltin: false,
    isFavourite: false,
    folder: "user",
    style: extractTextStylePatch(layer),
    effects: cloneEffects(layer.effects)
  };
}

export function loadUserTextPresets(): TextPreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(USER_TEXT_PRESETS_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as TextPreset[];
    return Array.isArray(parsed) ? parsed.map(normalizeUserPreset).filter((preset): preset is TextPreset => preset !== null) : [];
  } catch {
    return [];
  }
}

export function saveUserTextPreset(preset: TextPreset): TextPreset[] {
  const presets = loadUserTextPresets();
  const normalized = normalizeUserPreset(preset);
  if (normalized === null) return presets;
  const next = [normalized, ...presets.filter((item) => item.presetId !== normalized.presetId)];
  persistUserTextPresets(next);
  return next;
}

export function deleteUserTextPreset(presetId: string): TextPreset[] {
  const next = loadUserTextPresets().filter((preset) => preset.presetId !== presetId);
  persistUserTextPresets(next);
  return next;
}

export function updateUserTextPreset(preset: TextPreset): TextPreset[] {
  const normalized = normalizeUserPreset(preset);
  if (normalized === null) return loadUserTextPresets();
  const presets = loadUserTextPresets();
  const next = presets.some((item) => item.presetId === normalized.presetId)
    ? presets.map((item) => (item.presetId === normalized.presetId ? normalized : item))
    : [normalized, ...presets];
  persistUserTextPresets(next);
  return next;
}

export function extractTextStylePatch(layer: TextLayer): TextStylePatch {
  return cloneStylePatch({
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
    fontStyle: layer.fontStyle,
    fontSize: layer.fontSize,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
    color: layer.color,
    fillOpacity: layer.fillOpacity,
    stroke: layer.stroke,
    shadow: layer.shadow,
    gradient: layer.gradient,
    effects: layer.effects
  });
}

export function applyTextStylePatch(layer: TextLayer, patch: TextStylePatch): TextLayer {
  const next = cloneStylePatch(patch);
  // Pasting a style/FX must never resize the target text.
  delete next.fontSize;
  return {
    ...layer,
    ...next,
    effects: cloneEffects(patch.effects ?? layer.effects),
    textEffects: cloneEffects(patch.effects ?? layer.effects)
  };
}

function cloneStylePatch(patch: TextStylePatch): TextStylePatch {
  return {
    ...patch,
    stroke: patch.stroke === undefined ? undefined : { ...patch.stroke, dash: patch.stroke.dash === undefined ? undefined : [...patch.stroke.dash] },
    shadow: patch.shadow === undefined ? undefined : { ...patch.shadow },
    gradient:
      patch.gradient === undefined
        ? undefined
        : {
            ...patch.gradient,
            stops: patch.gradient.stops.map((stop) => ({ ...stop }))
          },
    effects: patch.effects === undefined ? undefined : cloneEffects(patch.effects)
  };
}

function cloneEffects(effects: TextEffect[]): TextEffect[] {
  return effects.map((item) => ({
    ...item,
    params: cloneEffectParams(item.params)
  }));
}

function cloneEffectParams(params: TextEffect["params"]): TextEffect["params"] {
  if (typeof structuredClone === "function") {
    return structuredClone(params);
  }
  return JSON.parse(JSON.stringify(params)) as TextEffect["params"];
}

function persistUserTextPresets(presets: TextPreset[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(USER_TEXT_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore storage failures; the current edit should keep working
  }
}

function normalizeUserPreset(value: TextPreset): TextPreset | null {
  if (typeof value !== "object" || value === null || typeof value.presetId !== "string") return null;
  return {
    version: 1,
    presetId: value.presetId,
    name: typeof value.name === "string" && value.name.trim() ? value.name : "Custom text preset",
    category: "user",
    includesTypography: true,
    isBuiltin: false,
    isFavourite: value.isFavourite === true,
    folder: "user",
    style: cloneStylePatch(value.style ?? {}),
    effects: cloneEffects(Array.isArray(value.effects) ? value.effects : [])
  };
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

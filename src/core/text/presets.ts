import type { TextLayer } from "@/types/layers";
import type { GradientStyle, ShadowStyle, StrokeStyle } from "@/types/primitives";
import type { TextEffect, TextPreset, TextStylePatch } from "@/types/text";

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
      effect("gold_stroke", "stroke", { color: "#4d3105", width: 2, position: "center", opacity: 0.95 }),
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
    effects: [effect("outlined_white_stroke", "stroke", { color: "#15131a", width: 3, position: "center", opacity: 1 })]
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
  })
];

export function applyTextPresetToLayer(layer: TextLayer, preset: TextPreset): TextLayer {
  return {
    ...layer,
    ...cloneStylePatch(preset.style),
    effects: cloneEffects(preset.effects),
    textEffects: cloneEffects(preset.effects)
  };
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
  return {
    ...layer,
    ...cloneStylePatch(patch),
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
    params: { ...item.params }
  }));
}

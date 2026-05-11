import type { GradientStyle, ID, ShadowStyle, StrokeStyle, VersionedEntity } from "./primitives";

export type TextDirection = "auto" | "ltr" | "rtl";
export type TextAlignment = "left" | "center" | "right" | "justify";
export type OverflowPolicy = "auto_shrink" | "clip" | "warn";
export type AnchorPoint =
  | "top_left"
  | "top_center"
  | "top_right"
  | "mid_left"
  | "center"
  | "mid_right"
  | "bot_left"
  | "bot_center"
  | "bot_right";

export type WarpType =
  | "none"
  | "arc"
  | "arc_lower"
  | "arc_upper"
  | "arch"
  | "bulge"
  | "shell_lower"
  | "shell_upper"
  | "flag"
  | "wave"
  | "fish"
  | "rise"
  | "fisheye"
  | "inflate"
  | "squeeze"
  | "twist";

export interface AutoContrastConfig extends VersionedEntity {
  enabled: boolean;
  lightBgColor: string;
  darkBgColor: string;
  minContrastRatio: number;
}

export type TextEffectType =
  | "fill"
  | "stroke"
  | "drop_shadow"
  | "inner_shadow"
  | "outer_glow"
  | "inner_glow"
  | "bevel_emboss"
  | "gradient_map"
  | "pattern_overlay"
  | "color_overlay"
  | "satin";

export interface FillEffectParams {
  fillType: "solid" | "gradient" | "pattern" | "image";
  color?: string;
  gradient?: GradientStyle;
  opacity?: number;
}

export interface StrokeEffectParams {
  color: string;
  width: number;
  position: "inside" | "center" | "outside";
  opacity: number;
}

export interface ShadowEffectParams {
  color: string;
  opacity: number;
  angle: number;
  distance: number;
  blur: number;
  spread?: number;
}

export interface BevelEmbossParams {
  style: "inner_bevel" | "outer_bevel" | "emboss" | "pillow_emboss";
  technique: "smooth" | "chisel_hard" | "chisel_soft";
  depth: number;
  size: number;
  soften: number;
  highlightColor: string;
  shadowColor: string;
}

export type TextEffectParams =
  | FillEffectParams
  | StrokeEffectParams
  | ShadowEffectParams
  | BevelEmbossParams
  | Record<string, string | number | boolean | GradientStyle | undefined>;

export interface TextEffect extends VersionedEntity {
  id: ID;
  effectId: ID;
  effectType: TextEffectType;
  enabled: boolean;
  opacity: number;
  blendMode: "normal" | "multiply" | "screen" | "overlay";
  params: TextEffectParams;
}

export interface TextStylePatch {
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  color?: string;
  fillOpacity?: number;
  stroke?: StrokeStyle;
  shadow?: ShadowStyle;
  gradient?: GradientStyle;
  effects?: TextEffect[];
}

export type TextPresetCategory =
  | "favourites"
  | "3d"
  | "neon"
  | "metal"
  | "modern"
  | "retro"
  | "minimal"
  | "hebrew"
  | "user";

export interface TextPreset extends VersionedEntity {
  presetId: string;
  name: string;
  category: TextPresetCategory;
  effects: TextEffect[];
  style: TextStylePatch;
  includesTypography: boolean;
  isBuiltin: boolean;
  isFavourite: boolean;
  folder: string;
}

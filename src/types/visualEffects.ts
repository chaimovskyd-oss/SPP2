import type { ID, VersionedEntity } from "./primitives";
import type { BlendMode } from "./layers";

// ─── Effect param shapes ──────────────────────────────────────────────────────

export interface StrokeEffect {
  type: "stroke";
  color: string;
  width: number;
  position: "inside" | "outside" | "center";
  opacity: number;
}

export interface DropShadowEffect {
  type: "dropShadow";
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

export interface OuterGlowEffect {
  type: "outerGlow";
  color: string;
  opacity: number;
  blur: number;
  spread: number;
}

export interface SoftEdgeEffect {
  type: "softEdge";
  radius: number;
  shape: "uniform" | "horizontal" | "vertical";
}

export interface ColorOverlayEffect {
  type: "colorOverlay";
  color: string;
  opacity: number;
  blendMode: BlendMode;
}

export interface VisualGradientStop {
  color: string;
  position: number;
}

export interface GradientOverlayEffect {
  type: "gradientOverlay";
  gradientType: "linear" | "radial";
  stops: VisualGradientStop[];
  angle: number;
  opacity: number;
  blendMode: BlendMode;
}

export interface InnerShadowEffect {
  type: "innerShadow";
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  blur: number;
}

export interface InnerGlowEffect {
  type: "innerGlow";
  color: string;
  opacity: number;
  blur: number;
}

export type VisualEffectParams =
  | StrokeEffect
  | DropShadowEffect
  | OuterGlowEffect
  | SoftEdgeEffect
  | ColorOverlayEffect
  | GradientOverlayEffect
  | InnerShadowEffect
  | InnerGlowEffect;

// ─── Stack model ──────────────────────────────────────────────────────────────

export interface VisualEffect extends VersionedEntity {
  id: ID;
  enabled: boolean;
  params: VisualEffectParams;
}

export interface VisualEffectStack extends VersionedEntity {
  enabled: boolean;
  effects: VisualEffect[];
}

// ─── Preset model ─────────────────────────────────────────────────────────────

export interface VisualEffectPreset {
  id: string;
  name: string;
  stack: VisualEffectStack;
}

// ─── Built-in presets ─────────────────────────────────────────────────────────

export const VISUAL_EFFECT_PRESETS: VisualEffectPreset[] = [
  {
    id: "soft_shadow",
    name: "צל רך",
    stack: {
      version: 1,
      enabled: true,
      effects: [
        {
          version: 1,
          id: "p_shadow",
          enabled: true,
          params: { type: "dropShadow", color: "#000000", opacity: 0.3, offsetX: 0, offsetY: 8, blur: 16, spread: 0 }
        }
      ]
    }
  },
  {
    id: "bold_shadow",
    name: "צל מודגש",
    stack: {
      version: 1,
      enabled: true,
      effects: [
        {
          version: 1,
          id: "p_bold_shadow",
          enabled: true,
          params: { type: "dropShadow", color: "#000000", opacity: 0.6, offsetX: 4, offsetY: 8, blur: 12, spread: 0 }
        }
      ]
    }
  },
  {
    id: "sticker_glow",
    name: "זוהר מדבקה",
    stack: {
      version: 1,
      enabled: true,
      effects: [
        {
          version: 1,
          id: "p_stroke",
          enabled: true,
          params: { type: "stroke", color: "#ffffff", width: 6, position: "outside", opacity: 1 }
        },
        {
          version: 1,
          id: "p_glow",
          enabled: true,
          params: { type: "outerGlow", color: "#ffffff", opacity: 0.7, blur: 20, spread: 0 }
        }
      ]
    }
  },
  {
    id: "soft_edge",
    name: "קצוות רכות",
    stack: {
      version: 1,
      enabled: true,
      effects: [
        {
          version: 1,
          id: "p_soft",
          enabled: true,
          params: { type: "softEdge", radius: 20, shape: "uniform" }
        }
      ]
    }
  },
  {
    id: "dark_overlay",
    name: "כיסוי כהה",
    stack: {
      version: 1,
      enabled: true,
      effects: [
        {
          version: 1,
          id: "p_overlay",
          enabled: true,
          params: { type: "colorOverlay", color: "#000000", opacity: 0.4, blendMode: "normal" }
        }
      ]
    }
  },
  {
    id: "golden_border",
    name: "מסגרת זהב",
    stack: {
      version: 1,
      enabled: true,
      effects: [
        {
          version: 1,
          id: "p_gold_stroke",
          enabled: true,
          params: { type: "stroke", color: "#d4af37", width: 4, position: "outside", opacity: 1 }
        },
        {
          version: 1,
          id: "p_gold_shadow",
          enabled: true,
          params: { type: "dropShadow", color: "#a07820", opacity: 0.5, offsetX: 0, offsetY: 4, blur: 8, spread: 0 }
        }
      ]
    }
  },
  {
    id: "gradient_warm",
    name: "גרדיאנט חם",
    stack: {
      version: 1,
      enabled: true,
      effects: [
        {
          version: 1,
          id: "p_grad",
          enabled: true,
          params: {
            type: "gradientOverlay",
            gradientType: "linear",
            stops: [{ color: "#ff6b35", position: 0 }, { color: "#f7c59f", position: 1 }],
            angle: 135,
            opacity: 0.6,
            blendMode: "overlay"
          }
        }
      ]
    }
  }
];

// ─── Label map ────────────────────────────────────────────────────────────────

export const VISUAL_EFFECT_LABELS: Record<string, string> = {
  stroke: "Stroke — מסגרת",
  dropShadow: "Drop Shadow — צל",
  outerGlow: "Outer Glow — זוהר חיצוני",
  softEdge: "Soft Edge — קצוות רכות",
  colorOverlay: "Color Overlay — כיסוי צבע",
  gradientOverlay: "Gradient Overlay — גרדיאנט",
  innerShadow: "Inner Shadow — צל פנימי",
  innerGlow: "Inner Glow — זוהר פנימי"
};

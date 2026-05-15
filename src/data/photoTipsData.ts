import PHOTO_TIPS_RAW from "./photo_tips.json";

export interface PhotoTip {
  id: string;
  category: string;
  title: string;
  problem: string;
  symptoms: string[];
  recommended_steps: { tool: string; action: string; suggested_range: string }[];
  warnings: string[];
  future_auto_fix: { enabled: boolean; params: Record<string, unknown> };
}

export const PHOTO_TIPS = PHOTO_TIPS_RAW as PhotoTip[];
export const TIP_CATEGORIES = [...new Set(PHOTO_TIPS.map((t) => t.category))];

export const CATEGORY_LABELS: Record<string, string> = {
  Light: "אור",
  Color: "צבע",
  Faces: "פנים",
  Detail: "פרטים",
  Composition: "קומפוזיציה"
};

// Maps tip param keys to SPP2 ImageLayer adjustment fields
export const PARAM_MAP: Record<string, { field: "adj" | "extra"; key: string; scale?: number }> = {
  brightness:  { field: "adj",   key: "brightness" },
  contrast:    { field: "adj",   key: "contrast" },
  saturation:  { field: "adj",   key: "saturation" },
  temperature: { field: "adj",   key: "temperature" },
  tint:        { field: "adj",   key: "tint" },
  exposure:    { field: "extra", key: "exposure",  scale: 50 },
  shadows:     { field: "extra", key: "shadows" },
  highlights:  { field: "extra", key: "highlights" },
  vibrance:    { field: "extra", key: "vibrance" },
  clarity:     { field: "extra", key: "clarity" },
  sharpness:   { field: "extra", key: "sharpen" },
  texture:     { field: "extra", key: "sharpen" },
};

// Maps tip param keys to CollageImageAssignment.colorAdjustments fields
// Collage fields use multiplier scale (1 = neutral) or EV for exposure
export const COLLAGE_PARAM_MAP: Record<string, { key: string; fromDelta: (v: number) => number }> = {
  brightness:  { key: "brightness",  fromDelta: (v) => Math.max(0.2, Math.min(2, 1 + v / 100)) },
  contrast:    { key: "contrast",    fromDelta: (v) => Math.max(0.2, Math.min(2, 1 + v / 100)) },
  saturation:  { key: "saturation",  fromDelta: (v) => Math.max(0, Math.min(2, 1 + v / 100)) },
  exposure:    { key: "exposureEV",  fromDelta: (v) => Math.max(-3, Math.min(3, v * 3 / 100)) },
};

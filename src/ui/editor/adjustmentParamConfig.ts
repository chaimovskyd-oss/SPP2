/**
 * Shared slider/label configuration for the raw Image Adjustment tools.
 *
 * Extracted from ImageAdjustmentsPanel so the Tool Library can render the SAME
 * editable controls for a tool before it is applied. Pure data (no React).
 */

import type { ImageAdjustmentType } from "@/types/imageAdjustments";

export interface SliderConfig {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  /** Render under a collapsible "מתקדם" section instead of the main list. */
  advanced?: boolean;
}

export const ADJUSTMENT_LABELS: Record<ImageAdjustmentType, string> = {
  basicTone: "טון בסיסי",
  highlightsShadows: "אורות וצללים",
  shadowHighlights: "צללים / אורות (מקומי)",
  color: "צבע",
  detail: "פרטים וחדות",
  blackWhite: "שחור־לבן",
  curves: "עקומות",
  threshold: "סף (Threshold)",
  gradientMap: "מיפוי גרדיאנט",
  sepia: "ספיה",
  invert: "היפוך"
};

export const PARAM_CONFIG: Record<ImageAdjustmentType, SliderConfig[]> = {
  basicTone: [
    { key: "brightness", label: "בהירות", min: -100, max: 100 },
    { key: "contrast", label: "קונטרסט", min: -100, max: 100 },
    { key: "exposure", label: "חשיפה", min: -3, max: 3, step: 0.05 },
    { key: "gamma", label: "גמא", min: 0.1, max: 3, step: 0.01 },
    { key: "offset", label: "היסט", min: -1, max: 1, step: 0.01 }
  ],
  highlightsShadows: [
    { key: "highlights", label: "אורות", min: -100, max: 100 },
    { key: "shadows", label: "צללים", min: -100, max: 100 },
    { key: "whites", label: "לבנים", min: -100, max: 100 },
    { key: "blacks", label: "שחורים", min: -100, max: 100 }
  ],
  shadowHighlights: [
    { key: "shadows", label: "צללים", min: 0, max: 100 },
    { key: "highlights", label: "אורות", min: 0, max: 100 },
    { key: "radius", label: "רדיוס", min: 0, max: 200, advanced: true },
    { key: "localContrast", label: "קונטרסט מקומי", min: 0, max: 100, advanced: true },
    { key: "colorCorrection", label: "תיקון צבע", min: -50, max: 50, advanced: true },
    { key: "midtoneContrast", label: "קונטרסט גוונים", min: -50, max: 50, advanced: true }
  ],
  color: [
    { key: "saturation", label: "רוויה", min: -100, max: 100 },
    { key: "vibrance", label: "חיות", min: -100, max: 100 },
    { key: "temperature", label: "טמפרטורה", min: -100, max: 100 },
    { key: "tint", label: "גוון (Tint)", min: -100, max: 100 },
    { key: "hue", label: "גוון (Hue)", min: -180, max: 180 }
  ],
  detail: [
    { key: "sharpness", label: "חדות", min: 0, max: 100 },
    { key: "sharpnessRadius", label: "רדיוס חדות", min: 0, max: 5, step: 0.5 },
    { key: "clarity", label: "בהירות מקומית", min: -100, max: 100 },
    { key: "noiseReduction", label: "הפחתת רעש", min: 0, max: 100 }
  ],
  blackWhite: [
    { key: "strength", label: "עוצמה", min: 0, max: 100 },
    { key: "red", label: "אדום", min: -100, max: 100 },
    { key: "yellow", label: "צהוב", min: -100, max: 100 },
    { key: "green", label: "ירוק", min: -100, max: 100 },
    { key: "cyan", label: "טורקיז", min: -100, max: 100 },
    { key: "blue", label: "כחול", min: -100, max: 100 },
    { key: "magenta", label: "מג'נטה", min: -100, max: 100 }
  ],
  threshold: [
    { key: "level", label: "סף", min: 0, max: 255 },
    { key: "smoothing", label: "ריכוך", min: 0, max: 100 }
  ],
  sepia: [
    { key: "intensity", label: "עוצמה", min: 0, max: 100 },
    { key: "warmth", label: "חמימות", min: 0, max: 100 }
  ],
  invert: [{ key: "strength", label: "עוצמה", min: 0, max: 100 }],
  curves: [],
  gradientMap: []
};

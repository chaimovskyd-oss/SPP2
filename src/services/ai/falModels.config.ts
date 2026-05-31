export const FAL_MODELS = {
  expand: {
    default: "fal-ai/bria/expand",
    creative: "fal-ai/flux-pro/v1/fill",
  },
  erase: {
    default: "fal-ai/bria/eraser",
  },
  fill: {
    default: "fal-ai/bria/genfill",
    creative: "fal-ai/flux-pro/v1/fill",
  },
  upscale: {
    quality: "fal-ai/topaz/upscale/image",
    fast: "fal-ai/esrgan",
  },
  restore: {
    quality: "fal-ai/topaz/upscale/image",
    fast: "fal-ai/esrgan",
  },
} as const;

export const TOPAZ_MODELS = [
  { id: "Standard V2", labelHe: "Standard V2 - כללי (ברירת מחדל)" },
  { id: "Low Resolution V2", labelHe: "Low Resolution V2 - תמונות קטנות (<300px)" },
  { id: "CGI", labelHe: "CGI - איורים ותמונות AI" },
  { id: "High Fidelity V2", labelHe: "High Fidelity V2 - שמירת פרטים מקסימלית" },
  { id: "Text Refine", labelHe: "Text Refine - תמונות עם טקסט ומסמכים" },
] as const;

export type TopazModelId = (typeof TOPAZ_MODELS)[number]["id"];

/** Cost estimates per call in USD. Used only for cost-warning threshold. */
export const MODEL_COST_ESTIMATE: Record<string, number> = {
  "fal-ai/bria/expand": 0.05,
  "fal-ai/bria/eraser": 0.04,
  "fal-ai/bria/genfill": 0.04,
  "fal-ai/flux-pro/v1/fill": 0.05,
  "fal-ai/topaz/upscale/image": 0.05,
  "fal-ai/esrgan": 0.008,
};

export const COST_WARNING_THRESHOLD = 0.10;

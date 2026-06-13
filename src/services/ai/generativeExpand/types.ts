/**
 * Generative Expand ("הרחבה חכמה") provider abstraction.
 *
 * Unlike the legacy fal-only "הרחבת תמונה" (manual margin drag), Smart Canvas
 * Fill auto-detects the empty canvas area around an image and outpaints it. The
 * same input image + binary mask (white = fill, black = keep) is sent to one of
 * three providers, so they share this single request/result shape.
 */

export type GenerativeExpandModel =
  | "local-sd-fast"
  | "local-sdxl-quality"
  | "fal-ai-expand"
  | "mock";

export interface GenerativeExpandRequest {
  /** Canvas-sized PNG data URL: the rendered layer on a white background. */
  inputImageDataUrl: string;
  /** Canvas-sized PNG data URL: white where empty (fill), black where image (keep). */
  maskDataUrl: string;
  /** Same mask encoded in the ALPHA channel (alpha=255 → fill). Required by the
   *  local Python sidecar, whose decode_mask reads alpha rather than luminance. */
  maskAlphaDataUrl?: string;
  width: number;
  height: number;
  /**
   * Geometry for purpose-built expand APIs (Bria): the image alone, cropped to
   * its footprint, plus its placement inside the canvas. Only provided when the
   * footprint is a clean rectangle (unrotated, no transparency); providers fall
   * back to the image+mask path when absent.
   */
  layerImageDataUrl?: string;
  placement?: { x: number; y: number; width: number; height: number };
  prompt: string;
  negativePrompt: string;
  /** How much the model may invent beyond pure background continuation.
   *  Maps to prompt/negative-prompt/guidance per provider. Default "balanced".
   *  Note: the Bria geometry path (Ultra) has no creativity knob — it is
   *  inherently conservative; this affects local tiers and the flux fallback. */
  creativity?: ExpandCreativity;
  seed?: number;
  strength?: number;
  guidance?: number;
}

export type ExpandCreativity = "conservative" | "balanced" | "creative";

export interface GenerativeExpandResult {
  /** Full canvas-sized PNG data URL of the expanded image. */
  resultDataUrl: string;
  modelId: string;
  modelVersion?: string;
  fallback?: boolean;
}

export interface GenerativeExpandProvider {
  id: GenerativeExpandModel;
  /** Cheap availability probe (model installed / online account configured). */
  isAvailable(): Promise<boolean>;
  generateExpand(
    req: GenerativeExpandRequest,
    onProgress: (pct: number) => void,
    signal: AbortSignal,
  ): Promise<GenerativeExpandResult>;
}

export const DEFAULT_EXPAND_PROMPT =
  "Extend the image naturally beyond its borders. Continue the existing background, lighting, perspective, colors and texture. Keep the result realistic and seamless. Do not add text, logos or new main subjects.";

/** SD-family models respond to descriptive captions, not instructions — the
 *  instruction-style default above actively hurts them. */
export const LOCAL_EXPAND_PROMPT =
  "seamless continuation of the same scene and background, consistent lighting, colors, perspective and texture, photorealistic, high detail";

/** Per-creativity captions for the local SD/SDXL tiers. */
export const LOCAL_EXPAND_PROMPTS: Record<ExpandCreativity, string> = {
  conservative:
    "seamless continuation of the existing background only, plain simple background, same walls, floor, colors and texture, consistent lighting, photorealistic, high detail",
  balanced: LOCAL_EXPAND_PROMPT,
  creative:
    "natural extension of the scene with additional matching background elements, consistent lighting, colors, perspective and texture, photorealistic, high detail",
};

/** Instruction-style prompts for the flux fallback path. */
export const FLUX_EXPAND_PROMPTS: Record<ExpandCreativity, string> = {
  conservative:
    "Extend only the existing background beyond the image borders. Continue the walls, floor, colors, lighting and texture exactly. Do not add any new objects, people, faces, furniture or elements.",
  balanced: DEFAULT_EXPAND_PROMPT,
  creative:
    "Extend the image naturally beyond its borders, continuing the scene with matching background elements, consistent lighting, perspective, colors and texture. Keep the result realistic and seamless. Do not add text or logos.",
};

/** Appended to the negative prompt in conservative mode — negatives only bite
 *  when guidance is high enough, so conservative keeps a moderate CFG. */
export const CONSERVATIVE_NEGATIVE_EXTRA =
  "people, face, person, hands, body, animals, objects, furniture, props, decorations, new elements";

export function buildNegativePrompt(creativity: ExpandCreativity, custom: string): string {
  if (custom.trim() !== "") return custom.trim();
  return creativity === "conservative"
    ? `${DEFAULT_EXPAND_NEGATIVE_PROMPT}, ${CONSERVATIVE_NEGATIVE_EXTRA}`
    : DEFAULT_EXPAND_NEGATIVE_PROMPT;
}

export const DEFAULT_EXPAND_NEGATIVE_PROMPT =
  "distorted body, extra fingers, bad anatomy, text, watermark, logo, blurry, low quality, duplicated face";

/** Appended to the prompt when faces/people are detected near the edge (future). */
export const PRESERVE_PEOPLE_PROMPT =
  "Preserve the existing people and do not change their faces.";

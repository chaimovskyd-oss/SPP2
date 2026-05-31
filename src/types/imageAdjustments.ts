/**
 * Non-destructive per-image adjustment model (Smart Presets architecture).
 *
 * An ImageAdjustment is a single tool (tone, color, detail, …) applied to one
 * ImageLayer. Multiple adjustments form an ordered `stack` rendered both live
 * (Konva filters, see konvaCustomFilters.ts) and on export (pixel pipeline, see
 * adjustmentPipeline.ts). Both paths MUST produce the same result.
 *
 * Value-range conventions (so live ↔ export stay in sync):
 *  - brightness/contrast/highlights/shadows/whites/blacks/saturation/vibrance/
 *    temperature/tint/sharpness/clarity/noiseReduction/blackWhite channel mix:
 *    -100..100, 0 = neutral.
 *  - exposure: stops, -3..3, 0 = neutral.
 *  - gamma: 0.1..9.99, 1 = neutral.
 *  - offset: -1..1, 0 = neutral.
 *  - hue: degrees, -180..180, 0 = neutral.
 *  - threshold level: 0..255; smoothing 0..100.
 *  - curve points / LUT inputs are 0..255.
 *  - gradientMap stop.position: 0..1.
 *  - sepia intensity/warmth: 0..100.
 */

import { createId } from "@/core/ids";

// ─── Curve / gradient primitives ──────────────────────────────────────────────

export type CurveChannel = "rgb" | "r" | "g" | "b";

export const CURVE_PRESET_IDS = [
  "linear",
  "sCurve",
  "softSCurve",
  "strongSCurve",
  "liftBlacks",
  "compress",
  "softHighlightCompression",
  "levelsApprox",
  "fadeFilm",
  "matte"
] as const;

export type CurvePresetId = (typeof CURVE_PRESET_IDS)[number];

export interface CurvePoint {
  /** input 0..255 */
  x: number;
  /** output 0..255 */
  y: number;
}

export interface GradientStop {
  /** 0..1 along the luminance axis */
  position: number;
  /** hex color, e.g. "#8b5a2b" */
  color: string;
}

// ─── Per-tool parameter blocks ────────────────────────────────────────────────

export interface BasicToneParams {
  brightness: number;
  contrast: number;
  exposure: number;
  gamma: number;
  offset: number;
}

export interface HighlightsShadowsParams {
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

export interface ColorParams {
  saturation: number;
  vibrance: number;
  temperature: number;
  tint: number;
  hue: number;
}

export interface DetailParams {
  sharpness: number;
  /** unsharp-mask radius in pixels, >= 0 */
  sharpnessRadius: number;
  clarity: number;
  noiseReduction: number;
}

export interface BlackWhiteParams {
  /** blend toward the channel-mixed grayscale, -100..100 (typically 0..100) */
  strength: number;
  red: number;
  yellow: number;
  green: number;
  cyan: number;
  blue: number;
  magenta: number;
}

export interface CurvesParams {
  preset?: CurvePresetId;
  /** explicit control points (overrides preset when present) */
  points?: CurvePoint[];
  channel?: CurveChannel;
}

export interface ThresholdParams {
  /** cutover luminance 0..255 */
  level: number;
  /** soft edge width 0..100 (0 = hard threshold) */
  smoothing: number;
}

export interface GradientMapParams {
  stops: GradientStop[];
}

export interface SepiaParams {
  intensity: number;
  warmth: number;
}

export interface InvertParams {
  /** 0..100 blend toward inverted */
  strength: number;
}

// ─── Discriminated union ──────────────────────────────────────────────────────

interface AdjustmentMeta {
  id: string;
  enabled: boolean;
}

export type BasicToneAdjustment = AdjustmentMeta & { type: "basicTone" } & BasicToneParams;
export type HighlightsShadowsAdjustment = AdjustmentMeta & { type: "highlightsShadows" } & HighlightsShadowsParams;
export type ColorAdjustment = AdjustmentMeta & { type: "color" } & ColorParams;
export type DetailAdjustment = AdjustmentMeta & { type: "detail" } & DetailParams;
export type BlackWhiteAdjustment = AdjustmentMeta & { type: "blackWhite" } & BlackWhiteParams;
export type CurvesAdjustment = AdjustmentMeta & { type: "curves" } & CurvesParams;
export type ThresholdAdjustment = AdjustmentMeta & { type: "threshold" } & ThresholdParams;
export type GradientMapAdjustment = AdjustmentMeta & { type: "gradientMap" } & GradientMapParams;
export type SepiaAdjustment = AdjustmentMeta & { type: "sepia" } & SepiaParams;
export type InvertAdjustment = AdjustmentMeta & { type: "invert" } & InvertParams;

export type ImageAdjustment =
  | BasicToneAdjustment
  | HighlightsShadowsAdjustment
  | ColorAdjustment
  | DetailAdjustment
  | BlackWhiteAdjustment
  | CurvesAdjustment
  | ThresholdAdjustment
  | GradientMapAdjustment
  | SepiaAdjustment
  | InvertAdjustment;

export type ImageAdjustmentType = ImageAdjustment["type"];

// ─── Defaults (neutral / identity values per tool) ────────────────────────────

export const IMAGE_ADJUSTMENT_DEFAULTS: {
  basicTone: BasicToneParams;
  highlightsShadows: HighlightsShadowsParams;
  color: ColorParams;
  detail: DetailParams;
  blackWhite: BlackWhiteParams;
  curves: Required<Pick<CurvesParams, "channel">> & CurvesParams;
  threshold: ThresholdParams;
  gradientMap: GradientMapParams;
  sepia: SepiaParams;
  invert: InvertParams;
} = {
  basicTone: { brightness: 0, contrast: 0, exposure: 0, gamma: 1, offset: 0 },
  highlightsShadows: { highlights: 0, shadows: 0, whites: 0, blacks: 0 },
  color: { saturation: 0, vibrance: 0, temperature: 0, tint: 0, hue: 0 },
  detail: { sharpness: 0, sharpnessRadius: 1, clarity: 0, noiseReduction: 0 },
  blackWhite: { strength: 0, red: 0, yellow: 0, green: 0, cyan: 0, blue: 0, magenta: 0 },
  curves: { channel: "rgb", preset: "linear" },
  threshold: { level: 128, smoothing: 0 },
  gradientMap: { stops: [{ position: 0, color: "#000000" }, { position: 1, color: "#ffffff" }] },
  sepia: { intensity: 0, warmth: 70 },
  invert: { strength: 0 }
};

/**
 * Template form used by preset catalog entries: tool type plus any subset of
 * its params (defaults fill the rest). `enabled` defaults to true.
 */
export type ImageAdjustmentTemplate =
  | ({ type: "basicTone"; enabled?: boolean } & Partial<BasicToneParams>)
  | ({ type: "highlightsShadows"; enabled?: boolean } & Partial<HighlightsShadowsParams>)
  | ({ type: "color"; enabled?: boolean } & Partial<ColorParams>)
  | ({ type: "detail"; enabled?: boolean } & Partial<DetailParams>)
  | ({ type: "blackWhite"; enabled?: boolean } & Partial<BlackWhiteParams>)
  | ({ type: "curves"; enabled?: boolean } & CurvesParams)
  | ({ type: "threshold"; enabled?: boolean } & Partial<ThresholdParams>)
  | ({ type: "gradientMap"; enabled?: boolean } & Partial<GradientMapParams>)
  | ({ type: "sepia"; enabled?: boolean } & Partial<SepiaParams>)
  | ({ type: "invert"; enabled?: boolean } & Partial<InvertParams>);

/** Instantiate a full ImageAdjustment from a template, filling defaults + id. */
export function createImageAdjustment(template: ImageAdjustmentTemplate): ImageAdjustment {
  const id = createId("adj");
  const enabled = template.enabled ?? true;
  switch (template.type) {
    case "basicTone":
      return { id, type: "basicTone", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.basicTone, ...stripMeta(template) };
    case "highlightsShadows":
      return { id, type: "highlightsShadows", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.highlightsShadows, ...stripMeta(template) };
    case "color":
      return { id, type: "color", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.color, ...stripMeta(template) };
    case "detail":
      return { id, type: "detail", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.detail, ...stripMeta(template) };
    case "blackWhite":
      return { id, type: "blackWhite", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.blackWhite, ...stripMeta(template) };
    case "curves":
      return { id, type: "curves", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.curves, ...stripMeta(template) };
    case "threshold":
      return { id, type: "threshold", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.threshold, ...stripMeta(template) };
    case "gradientMap":
      return { id, type: "gradientMap", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.gradientMap, ...stripMeta(template) };
    case "sepia":
      return { id, type: "sepia", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.sepia, ...stripMeta(template) };
    case "invert":
      return { id, type: "invert", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.invert, ...stripMeta(template) };
    default: {
      const exhaustive: never = template;
      throw new Error(`Unknown adjustment template: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function stripMeta<T extends { type: string; enabled?: boolean }>(template: T): Omit<T, "type" | "enabled"> {
  const { type: _type, enabled: _enabled, ...rest } = template;
  return rest;
}

// ─── Applied preset bookkeeping (used from Phase 3 onward) ────────────────────

export type ApplyMode = "singleImage" | "selectedImages" | "allImagesOnPage" | "pageLook";

export interface AppliedPresetInstance {
  id: string;
  presetId: string;
  name: string;
  appliedAt: number;
  strength: number;
  targetMode: "singleImage" | "selectedImages" | "allImagesOnPage";
  editable: boolean;
  /** ids of the ImageAdjustment entries this preset generated inside the stack */
  generatedAdjustments: string[];
}

export interface ImageAdjustmentStack {
  enabled: boolean;
  stack: ImageAdjustment[];
  presetInstances?: AppliedPresetInstance[];
}

// ─── Page Look effects (Phase 1.3 / Phase 4) ──────────────────────────────────

export type PageLookBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "hard-light"
  | "lighten"
  | "darken";

export type PageLookEffect =
  | { kind: "colorOverlay"; color: string; opacity: number; blendMode: PageLookBlendMode }
  | { kind: "gradientOverlay"; stops: GradientStop[]; angle: number; gradientType: "linear" | "radial"; opacity: number; blendMode: PageLookBlendMode }
  | { kind: "vignette"; color: string; amount: number; softness: number; roundness: number }
  | { kind: "grain"; amount: number; size: number; monochrome: boolean }
  | { kind: "wash"; color: string; opacity: number; blendMode: PageLookBlendMode };

export type PageLookEffectKind = PageLookEffect["kind"];

/** Template form for page-look effects inside preset catalog entries. */
export type PageLookEffectTemplate =
  | ({ kind: "colorOverlay" } & Partial<{ color: string; opacity: number; blendMode: PageLookBlendMode }>)
  | ({ kind: "gradientOverlay" } & Partial<{ stops: GradientStop[]; angle: number; gradientType: "linear" | "radial"; opacity: number; blendMode: PageLookBlendMode }>)
  | ({ kind: "vignette" } & Partial<{ color: string; amount: number; softness: number; roundness: number }>)
  | ({ kind: "grain" } & Partial<{ amount: number; size: number; monochrome: boolean }>)
  | ({ kind: "wash" } & Partial<{ color: string; opacity: number; blendMode: PageLookBlendMode }>);

export const PAGE_LOOK_EFFECT_DEFAULTS: {
  colorOverlay: { color: string; opacity: number; blendMode: PageLookBlendMode };
  gradientOverlay: { stops: GradientStop[]; angle: number; gradientType: "linear" | "radial"; opacity: number; blendMode: PageLookBlendMode };
  vignette: { color: string; amount: number; softness: number; roundness: number };
  grain: { amount: number; size: number; monochrome: boolean };
  wash: { color: string; opacity: number; blendMode: PageLookBlendMode };
} = {
  colorOverlay: { color: "#000000", opacity: 0.2, blendMode: "normal" },
  gradientOverlay: {
    stops: [{ position: 0, color: "#00000000" }, { position: 1, color: "#000000" }],
    angle: 90,
    gradientType: "linear",
    opacity: 0.4,
    blendMode: "normal"
  },
  vignette: { color: "#000000", amount: 0.4, softness: 0.6, roundness: 0.5 },
  grain: { amount: 0.25, size: 1, monochrome: true },
  wash: { color: "#ffffff", opacity: 0.2, blendMode: "soft-light" }
};

export function createPageLookEffect(template: PageLookEffectTemplate): PageLookEffect {
  switch (template.kind) {
    case "colorOverlay":
      return { kind: "colorOverlay", ...PAGE_LOOK_EFFECT_DEFAULTS.colorOverlay, ...stripKind(template) };
    case "gradientOverlay":
      return { kind: "gradientOverlay", ...PAGE_LOOK_EFFECT_DEFAULTS.gradientOverlay, ...stripKind(template) };
    case "vignette":
      return { kind: "vignette", ...PAGE_LOOK_EFFECT_DEFAULTS.vignette, ...stripKind(template) };
    case "grain":
      return { kind: "grain", ...PAGE_LOOK_EFFECT_DEFAULTS.grain, ...stripKind(template) };
    case "wash":
      return { kind: "wash", ...PAGE_LOOK_EFFECT_DEFAULTS.wash, ...stripKind(template) };
    default: {
      const exhaustive: never = template;
      throw new Error(`Unknown page-look template: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function stripKind<T extends { kind: string }>(template: T): Omit<T, "kind"> {
  const { kind: _kind, ...rest } = template;
  return rest;
}

// ─── Page Look layer (Phase 4) ────────────────────────────────────────────────

/**
 * An always-top atmospheric overlay for a whole page. Page Looks live in a
 * page-level array (page.pageLooks), NOT in the layer stack — they are rendered
 * above every layer with no full-page cache of the content beneath. The same
 * renderPageLookEffect implementation drives both the live preview overlay and
 * the export, so what you see is what prints.
 */
export interface PageLookLayer {
  id: string;
  name: string;
  enabled: boolean;
  locked?: boolean;
  /** 0..1 overlay opacity multiplier */
  opacity: number;
  /** 0..1 master strength (multiplies opacity at render time) */
  strength: number;
  effect: PageLookEffect;
  /** preset this look was created from, if any */
  presetId?: string;
}

/** Effective render alpha contributed by a page look's master controls. */
export function pageLookMaster(look: Pick<PageLookLayer, "opacity" | "strength">): number {
  const clamp = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  return clamp(look.opacity) * clamp(look.strength);
}

let pageLookCounter = 0;

export function createPageLookLayer(
  effectTemplate: PageLookEffectTemplate,
  options: { name?: string; opacity?: number; strength?: number; presetId?: string; enabled?: boolean } = {}
): PageLookLayer {
  pageLookCounter += 1;
  return {
    id: createId("pagelook"),
    name: options.name ?? defaultPageLookName(effectTemplate.kind, pageLookCounter),
    enabled: options.enabled ?? true,
    opacity: options.opacity ?? 1,
    strength: options.strength ?? 1,
    effect: createPageLookEffect(effectTemplate),
    ...(options.presetId === undefined ? {} : { presetId: options.presetId })
  };
}

function defaultPageLookName(kind: PageLookEffectKind, index: number): string {
  const base: Record<PageLookEffectKind, string> = {
    colorOverlay: "Color Overlay",
    gradientOverlay: "Gradient Overlay",
    vignette: "Vignette",
    grain: "Grain",
    wash: "Wash"
  };
  return `${base[kind]} ${index}`;
}

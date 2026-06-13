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

/** Full set of control points for the multi-channel Curves editor. */
export interface CurveChannelPoints {
  rgb: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

/** Identity (do-nothing) curve: a straight 0→0 … 255→255 diagonal. */
export const DEFAULT_CURVE_POINTS: readonly CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 255, y: 255 }
];

/** Fresh, fully-neutral channel set for a new Curves adjustment. */
export function createDefaultCurveChannels(): CurveChannelPoints {
  const diag = (): CurvePoint[] => [
    { x: 0, y: 0 },
    { x: 255, y: 255 }
  ];
  return { rgb: diag(), r: diag(), g: diag(), b: diag() };
}

/**
 * A curve is the identity transform when every control point lies on the y=x
 * diagonal. The editor locks endpoints at x=0 / x=255, so checking x===y on all
 * points (including any diagonal mid-points the user added then never moved) is
 * sufficient to detect "no effect".
 */
export function isIdentityCurvePoints(points: CurvePoint[] | undefined): boolean {
  if (points === undefined || points.length < 2) return true;
  return points.every((p) => p.x === p.y);
}

/** True when none of the four channel curves changes the image. */
export function isIdentityCurveChannels(channels: CurveChannelPoints | undefined): boolean {
  if (channels === undefined) return true;
  return (
    isIdentityCurvePoints(channels.rgb) &&
    isIdentityCurvePoints(channels.r) &&
    isIdentityCurvePoints(channels.g) &&
    isIdentityCurvePoints(channels.b)
  );
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

/**
 * Photoshop-style LOCAL Shadow/Highlights recovery (distinct from the pointwise
 * HighlightsShadows tool above). It uses a blurred luminance "surround" map to
 * decide, per region, how much to lift shadows / pull highlights — so dark faces
 * brighten while already-bright backgrounds stay put, edges are protected from
 * halos, and endpoints (true black/white) are preserved to avoid wash-out.
 *
 * Ranges:
 *  - shadows / highlights: 0..100, 0 = off (amount of recovery).
 *  - radius: 0..200 — local neighborhood size, resolution-relative so live
 *    preview matches export. Small = stronger/local; large = smoother.
 *  - localContrast: 0..100 — re-injects high-frequency detail lost to recovery.
 *  - colorCorrection: -50..50 — saturation compensation in corrected regions.
 *  - midtoneContrast: -50..50 — contrast around mid-grey to restore "punch".
 *
 * Smart V2/V3 (optional, all backward-compatible — absent ⇒ pure V1 behaviour):
 * a REGION-AWARE correction layered on the V1 engine. `smart` is the master
 * toggle. Shadow lift is no longer one global amount — it is composed per pixel:
 *   Face Shadows (inside soft, bright-protected face masks)
 *   > Visible-skin lift (skin-like pixels outside faces)
 *   > Global Shadows (everywhere, weak)
 *   > Clothing (dark non-face/non-skin areas, strongly limited so blacks stay black)
 * then gated by a highlight-protection mask (white shirts / sky / bright faces),
 * desaturated in deep shadow (no blue/magenta cast) and held in a natural skin
 * band. `faceRegions` + `noiseScore` are an analysis CACHE so the deterministic
 * pixel pipeline reproduces the result on export/print/reload (live == export).
 */
export interface ShadowHighlightsParams {
  /** Global Shadows — weak base lift everywhere (0..100). */
  shadows: number;
  /** Highlight Recovery — pull very bright areas down to recover detail (0..100). */
  highlights: number;
  radius: number;
  localContrast: number;
  colorCorrection: number;
  midtoneContrast: number;
  // ── Smart V2/V3 region-aware controls (optional) ──
  /** Master switch for scene-aware processing. Absent/false ⇒ pure V1. */
  smart?: boolean;
  /** When true, settings were derived by Auto Smart Shadows from analysis. */
  auto?: boolean;
  /** Face Shadows / Face Boost — extra lift inside face masks, ×per-face need (0..100). */
  faceShadows?: number;
  /** Protect Bright Faces — cut face shadow lift for already-bright faces (0..100). */
  protectBrightFaces?: number;
  /** Protect Highlights — block shadow lift in near-clipping areas (shirts/sky/faces) (0..100). */
  protectHighlights?: number;
  /** Preserve Skin Tones / Skin-tone guard — hold lifted skin in a natural band (0..100). */
  preserveSkinTones?: number;
  /** Shadow Saturation — reduce saturation in lifted shadows, prevents casts (-50..0). */
  shadowSaturation?: number;
  /** Clothing Protection — keep dark non-face/non-skin areas dark (0..100). */
  clothingProtection?: number;
  /** @deprecated superseded by faceShadows. Gate for the face layer. */
  prioritizeFaces?: boolean;
  /** @deprecated superseded by preserveSkinTones. */
  protectSkin?: boolean;
  /** Scale back shadow recovery where the image is noisy. */
  noiseProtection?: boolean;
  /** Preserve sky colour/contrast instead of flattening it to grey. */
  protectSky?: boolean;
  /** Detected face boxes in normalised 0..1 coords (analysis cache). */
  faceRegions?: SmartFaceRegion[];
  /** Estimated sensor-noise score 0..100 (analysis cache). */
  noiseScore?: number;
}

/**
 * A detected face box (normalised 0..1) plus per-face recovery diagnostics.
 *
 * Each face is evaluated INDEPENDENTLY — there is no cross-face comparison, no
 * global/average brightness target and no skin-tone normalisation. The renderer
 * only needs `recoveryStrength` (how much soft shadow recovery this face asked
 * for, 0..1) and `noiseScore`; the rest is diagnostics.
 */
export interface SmartFaceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0..100 FaceUnderexposureScore (shadow density, range compression, lack of highlights, …). */
  underexposureScore?: number;
  /** 0..1 soft recovery amount derived from the score's tier (renderer weight). */
  recoveryStrength?: number;
  /** 0..100 noise estimated WITHIN this face (scales its recovery down). */
  noiseScore?: number;
  /** Median luminance inside the face 0..1 (drives Protect Bright Faces). */
  medianLuma?: number;
  /** Fraction of face pixels already very bright 0..1 (drives per-face highlight recovery). */
  highlightRatio?: number;
  /** Per-face MANUAL shadow lift 0..100 (numbered-face fine-tuning); applies only inside this face. */
  shadows?: number;
  /** Per-face MANUAL highlight recovery 0..100 (numbered-face fine-tuning); applies only inside this face. */
  highlights?: number;
  /** @deprecated legacy median-based score; kept for back-compat. Use underexposureScore. */
  exposureScore?: number;
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
  /**
   * Full multi-channel control points authored in the Curves editor. When
   * present this takes priority over preset/points/channel: the `rgb` curve is
   * applied to every channel first, then the per-channel r/g/b curves.
   */
  channels?: CurveChannelPoints;
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
export type ShadowHighlightsAdjustment = AdjustmentMeta & { type: "shadowHighlights" } & ShadowHighlightsParams;
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
  | ShadowHighlightsAdjustment
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
  shadowHighlights: ShadowHighlightsParams;
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
  shadowHighlights: {
    // Lift amounts are neutral at the factory (the modal seeds the recommended
    // values); the protection values sit at their safe recommended defaults but
    // only do anything once there is lift, so a neutral tool stays a no-op.
    shadows: 0, highlights: 0, radius: 40, localContrast: 20, colorCorrection: 0, midtoneContrast: 0,
    smart: false, auto: false,
    faceShadows: 0, protectBrightFaces: 80, protectHighlights: 75, preserveSkinTones: 60,
    shadowSaturation: -10, clothingProtection: 80,
    prioritizeFaces: true, protectSkin: true, noiseProtection: true, protectSky: true
  },
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
  | ({ type: "shadowHighlights"; enabled?: boolean } & Partial<ShadowHighlightsParams>)
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
    case "shadowHighlights":
      return { id, type: "shadowHighlights", enabled, ...IMAGE_ADJUSTMENT_DEFAULTS.shadowHighlights, ...stripMeta(template) };
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

/** Which Auto Fix recipe produced the current adjustments. */
export type AutoFixMode = "full" | "color" | "contrast" | "exposure";

/**
 * Bookkeeping written by the Auto Fix tool (Photoshop-style Auto/Curves, no
 * generative AI). It marks the layer as auto-fixed and snapshots the stack as it
 * existed BEFORE the first Auto Fix, so re-opening the modal blends from the
 * original (never stacks aggressively) and "Revert Auto Fix" restores cleanly.
 */
export interface AutoFixMeta {
  applied: boolean;
  /** schema/algorithm version, bump when the engine changes meaningfully. */
  version: number;
  mode: AutoFixMode;
  /** 0..100 intensity the user committed at. */
  intensity: number;
  /** the adjustment list that existed before Auto Fix was first applied. */
  previousStack: ImageAdjustment[];
  /** the stack `enabled` flag before Auto Fix was first applied. */
  previousEnabled: boolean;
}

export interface ImageAdjustmentStack {
  enabled: boolean;
  stack: ImageAdjustment[];
  presetInstances?: AppliedPresetInstance[];
  /** Present only while the layer carries an Auto Fix result. */
  autoFix?: AutoFixMeta;
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

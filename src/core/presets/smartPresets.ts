/**
 * Smart Preset engine (Phase 3).
 *
 * A Smart Preset is a named recipe of one or more ImageAdjustment templates plus
 * metadata (category, recommended/allowed apply modes, requirements, warnings).
 * Applying a preset instantiates its templates into concrete ImageAdjustment
 * entries (fresh ids) scaled by a master `strength`, and records an
 * AppliedPresetInstance so the application can later be re-strengthened or
 * removed as a unit.
 *
 * Page-look presets are deferred to Phase 4; this catalog only carries image
 * presets (imageAdjustments). The engine here is pure — store wiring lives in
 * documentStore.ts.
 */

import {
  IMAGE_ADJUSTMENT_DEFAULTS,
  createImageAdjustment,
  type ApplyMode,
  type ImageAdjustment,
  type ImageAdjustmentTemplate,
  type PageLookEffectTemplate
} from "@/types/imageAdjustments";

export type SmartPresetCategory =
  | "Photo Rescue"
  | "HDR / Detail / Product"
  | "Portrait"
  | "Print"
  | "Looks"
  | "Duotone"
  | "Creative"
  | "Basic"
  | "Advanced"
  | "Custom";

export type SmartPresetApplyMode = "singleImage" | "selectedImages" | "allImagesOnPage" | "pageLook";

export interface SmartPresetDefinition {
  id: string;
  name: string;
  /** short emoji/icon shown in the picker card */
  icon?: string;
  category: SmartPresetCategory;
  description: string;
  /** 0..1 master mix used when the user has not overridden it */
  defaultStrength: number;
  recommendedApplyMode: SmartPresetApplyMode;
  allowedApplyModes: SmartPresetApplyMode[];
  requires: string[];
  optionalRequires: string[];
  /** image-level recipe; instantiated into the layer's adjustment stack. Empty for pure page-look presets. */
  imageAdjustments: ImageAdjustmentTemplate[];
  /** page-look overlay recipe; present when the preset can be applied as a Page Look. */
  pageLookEffect?: PageLookEffectTemplate;
  notRecommendedAsPageLook?: boolean;
  notRecommendedForText?: boolean;
  printWarnings?: string[];
}

// ─── Master-strength scaling ──────────────────────────────────────────────────

/**
 * Numeric params that are NOT mixed toward neutral by master strength.
 * These are structural/selector values (radii, smoothing widths) that should be
 * applied as-authored regardless of strength.
 */
const NON_SCALED_KEYS = new Set<string>(["sharpnessRadius", "smoothing", "level", "warmth"]);

function neutralFor(type: ImageAdjustmentTemplate["type"], key: string): number {
  const defaults = IMAGE_ADJUSTMENT_DEFAULTS[type] as unknown as Record<string, unknown>;
  const value = defaults[key];
  return typeof value === "number" ? value : 0;
}

/**
 * Scale a preset template toward its neutral baseline by `strength` (0..1).
 *   scaled = neutral + (value - neutral) * strength
 * Non-numeric params (curve preset/channel/points, gradient stops, booleans) and
 * structural numeric keys (radius/smoothing/level) pass through unchanged.
 */
export function scaleTemplate(template: ImageAdjustmentTemplate, strength: number): ImageAdjustmentTemplate {
  const clamped = Math.max(0, Math.min(1, strength));
  const scaled: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    if (key === "type" || key === "enabled") {
      scaled[key] = value;
      continue;
    }
    if (typeof value === "number" && !NON_SCALED_KEYS.has(key)) {
      const neutral = neutralFor(template.type, key);
      scaled[key] = neutral + (value - neutral) * clamped;
      continue;
    }
    scaled[key] = value;
  }
  return scaled as ImageAdjustmentTemplate;
}

/**
 * Instantiate a preset's recipe into concrete ImageAdjustment entries (fresh ids)
 * scaled by `strength`. Pure — does not touch the store.
 */
export function instantiatePresetAdjustments(
  def: SmartPresetDefinition,
  strength: number
): ImageAdjustment[] {
  return def.imageAdjustments.map((template) => createImageAdjustment(scaleTemplate(template, strength)));
}

// ─── Custom preset registry (user-saved presets) ──────────────────────────────

/**
 * User-saved custom presets. Kept in a module-level array (synced from the
 * persistent customPresetStore) so that the PURE lookup functions below resolve
 * custom presets exactly like built-in ones — apply/preview/strength-edit/reload
 * all work through the same `getPreset` path with zero special-casing.
 */
let CUSTOM_PRESETS: SmartPresetDefinition[] = [];

/** Replace the custom-preset registry (called by the store on change/hydrate). */
export function setCustomPresets(presets: SmartPresetDefinition[]): void {
  CUSTOM_PRESETS = presets;
}

/** The id prefix that marks a preset as user-defined. */
export const CUSTOM_PRESET_PREFIX = "custom:";

export function isCustomPresetId(id: string): boolean {
  return id.startsWith(CUSTOM_PRESET_PREFIX);
}

// ─── Catalog lookup ───────────────────────────────────────────────────────────

export function getPreset(id: string): SmartPresetDefinition | undefined {
  return SMART_PRESET_CATALOG.find((preset) => preset.id === id) ?? CUSTOM_PRESETS.find((preset) => preset.id === id);
}

export function listPresets(): SmartPresetDefinition[] {
  return [...SMART_PRESET_CATALOG, ...CUSTOM_PRESETS];
}

export function listPresetsByCategory(category: SmartPresetCategory): SmartPresetDefinition[] {
  return listPresets().filter((preset) => preset.category === category);
}

export const SMART_PRESET_CATEGORIES: SmartPresetCategory[] = [
  "Photo Rescue",
  "HDR / Detail / Product",
  "Portrait",
  "Print",
  "Looks",
  "Duotone",
  "Creative",
  "Basic",
  "Advanced",
  "Custom"
];

/** Does this apply mode write image-level adjustments (vs. a page-look layer)? */
export function isImageApplyMode(mode: ApplyMode): mode is "singleImage" | "selectedImages" | "allImagesOnPage" {
  return mode === "singleImage" || mode === "selectedImages" || mode === "allImagesOnPage";
}

// ─── Catalog (image presets, from plan §8 recipes) ────────────────────────────

const IMAGE_RESCUE_REQUIRES = ["basicTone", "highlightsShadows", "color"];

export const SMART_PRESET_CATALOG: SmartPresetDefinition[] = [
  // ── Photo Rescue ──────────────────────────────────────────────────────────
  {
    id: "sun_rescue",
    name: "Sun Rescue",
    icon: "☀",
    category: "Photo Rescue",
    description: "מתקן שמש חזקה, Highlights שרופים וצללים קשים.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: IMAGE_RESCUE_REQUIRES,
    optionalRequires: ["faceDetection"],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "highlightsShadows", highlights: -55, whites: -25, shadows: 22, blacks: 0 },
      { type: "basicTone", exposure: -0.1, contrast: 4, gamma: 1.02 },
      { type: "color", vibrance: 12, saturation: -3 },
      { type: "curves", preset: "softHighlightCompression" }
    ]
  },
  {
    id: "dark_photo_fix",
    name: "Dark Photo Fix",
    icon: "🌙",
    category: "Photo Rescue",
    description: "לתמונות כהות, צילום ערב או חדר חשוך.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: IMAGE_RESCUE_REQUIRES,
    optionalRequires: [],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "basicTone", exposure: 0.35, gamma: 1.04 },
      { type: "highlightsShadows", shadows: 45, blacks: 8 },
      { type: "detail", noiseReduction: 20, clarity: 8 },
      { type: "color", vibrance: 10 }
    ]
  },
  {
    id: "backlight_rescue",
    name: "Backlight Rescue",
    icon: "🌤",
    category: "Photo Rescue",
    description: "צילום מול חלון/שמש, פנים כהות ורקע בהיר.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: IMAGE_RESCUE_REQUIRES,
    optionalRequires: ["faceDetection"],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "highlightsShadows", shadows: 60, highlights: -35 },
      { type: "basicTone", exposure: 0.08, contrast: -8 },
      { type: "curves", preset: "liftBlacks" }
    ]
  },
  {
    id: "indoor_light_fix",
    name: "Indoor Light Fix",
    icon: "💡",
    category: "Photo Rescue",
    description: "תאורת בית/גן צהובה, ירוקה או לא טבעית.",
    defaultStrength: 0.7,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["color", "basicTone"],
    optionalRequires: [],
    imageAdjustments: [
      { type: "color", temperature: -18, tint: 8, vibrance: 8, saturation: -3 },
      { type: "basicTone", exposure: 0.1 }
    ]
  },
  {
    id: "whatsapp_recovery",
    name: "WhatsApp Recovery",
    icon: "📱",
    category: "Photo Rescue",
    description: "תמונות דחוסות, רכות ואפרוריות שהגיעו בוואטסאפ.",
    defaultStrength: 0.7,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["detail", "color", "basicTone"],
    optionalRequires: [],
    imageAdjustments: [
      { type: "detail", sharpness: 18, clarity: 12, noiseReduction: 10 },
      { type: "color", vibrance: 12 },
      { type: "basicTone", contrast: 8 }
    ]
  },
  {
    id: "haze_removal",
    name: "Haze Removal",
    icon: "🌫",
    category: "Photo Rescue",
    description: "תמונה שטוחה, מסונוורת או עם ערפל.",
    defaultStrength: 0.7,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["detail", "basicTone", "highlightsShadows", "color"],
    optionalRequires: [],
    imageAdjustments: [
      { type: "detail", clarity: 20 },
      { type: "basicTone", contrast: 10 },
      { type: "highlightsShadows", blacks: -6, highlights: -8 },
      { type: "color", vibrance: 8 }
    ]
  },

  {
    id: "hdr_pop",
    name: "HDR Pop",
    icon: "HDR",
    category: "HDR / Detail / Product",
    description: "Boosts detail, contrast, clarity, and color for a punchy HDR-like result without fake halos.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["highlightsShadows", "detail", "basicTone", "color"],
    optionalRequires: [],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "highlightsShadows", highlights: -20, shadows: 25 },
      { type: "detail", clarity: 25, sharpness: 12 },
      { type: "basicTone", contrast: 15 },
      { type: "color", vibrance: 10 }
    ]
  },
  {
    id: "soft_hdr",
    name: "Soft HDR",
    icon: "HDR",
    category: "HDR / Detail / Product",
    description: "A softer, more natural HDR-style enhancement for portraits, family images, and safer photo cleanup.",
    defaultStrength: 0.7,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["highlightsShadows", "detail", "basicTone", "color"],
    optionalRequires: [],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "highlightsShadows", highlights: -12, shadows: 15 },
      { type: "detail", clarity: 10, sharpness: 6 },
      { type: "basicTone", contrast: 8 },
      { type: "color", vibrance: 6 }
    ]
  },
  {
    id: "hyper_detail",
    name: "Hyper Detail",
    icon: "DTL",
    category: "HDR / Detail / Product",
    description: "Strong detail boost for textures, objects, dramatic imagery, and non-face subjects.",
    defaultStrength: 0.65,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages"],
    requires: ["detail", "basicTone", "highlightsShadows", "color"],
    optionalRequires: [],
    notRecommendedAsPageLook: true,
    notRecommendedForText: true,
    printWarnings: ["Use with care on portraits; clarity and sharpness are intentionally aggressive."],
    imageAdjustments: [
      { type: "detail", clarity: 32, sharpness: 18 },
      { type: "basicTone", contrast: 16 },
      { type: "highlightsShadows", highlights: -10, shadows: 12 },
      { type: "color", vibrance: 6 }
    ]
  },
  {
    id: "product_punch",
    name: "Product Punch",
    icon: "BOX",
    category: "HDR / Detail / Product",
    description: "Enhances product and object photos with crisp contrast, clean detail, and richer color.",
    defaultStrength: 0.72,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["basicTone", "detail", "color", "highlightsShadows"],
    optionalRequires: [],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "basicTone", contrast: 14 },
      { type: "detail", clarity: 14, sharpness: 14 },
      { type: "color", vibrance: 8, saturation: 4 },
      { type: "highlightsShadows", highlights: -6, shadows: 6 }
    ]
  },
  {
    id: "landscape_boost",
    name: "Landscape Boost",
    icon: "LAND",
    category: "HDR / Detail / Product",
    description: "Enhances scenery with stronger color, detail, depth, and a slight warm outdoor lift.",
    defaultStrength: 0.72,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages"],
    requires: ["color", "detail", "basicTone", "highlightsShadows"],
    optionalRequires: [],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "color", vibrance: 18, saturation: 6, temperature: 2 },
      { type: "detail", clarity: 18 },
      { type: "basicTone", contrast: 10 },
      { type: "highlightsShadows", highlights: -12, shadows: 10 }
    ]
  },

  // ── Color Cast Rescue (extreme colored lighting) ────────────────────────────
  // Goal: not to neutralize the WHOLE image, but to pull skin/tones back toward a
  // believable natural look while the background may stay somewhat colored. Skin
  // mask / face detection are conceptual (optionalRequires); the engine here uses
  // global white-balance + selective-saturation + tone primitives as a best-effort
  // approximation. Strength keeps the correction editable.
  {
    id: "red_cast_rescue",
    name: "Red Cast Rescue",
    icon: "🟥",
    category: "Photo Rescue",
    description: "תאורה אדומה/ורודה קיצונית — מחזיר גוון עור סביר בלי לאפס את כל התמונה.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: IMAGE_RESCUE_REQUIRES,
    optionalRequires: ["faceDetection", "skinMask"],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "color", temperature: -30, tint: -10, saturation: -12, vibrance: 14 },
      { type: "highlightsShadows", shadows: 22, highlights: -8 },
      { type: "curves", preset: "softSCurve" }
    ]
  },
  {
    id: "yellow_cast_rescue",
    name: "Yellow Cast Rescue",
    icon: "🟨",
    category: "Photo Rescue",
    description: "תאורה צהובה/כתומה (מנהרה, נורות חמות) — מקרר ומחזיר חיות לעור.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: IMAGE_RESCUE_REQUIRES,
    optionalRequires: ["faceDetection", "skinMask"],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "color", temperature: -35, tint: 6, saturation: -18, vibrance: 12 },
      { type: "highlightsShadows", shadows: 18, highlights: -8 },
      { type: "curves", preset: "softSCurve" }
    ]
  },
  {
    id: "blue_cast_rescue",
    name: "Blue Cast Rescue",
    icon: "🟦",
    category: "Photo Rescue",
    description: "תאורה כחולה/קרה (צל, LED קר) — מחמם בעדינות בלי לשרוף את הצבע.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: IMAGE_RESCUE_REQUIRES,
    optionalRequires: ["faceDetection", "skinMask"],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "color", temperature: 35, tint: 6, saturation: -5, vibrance: 10 },
      { type: "highlightsShadows", shadows: 12 },
      { type: "curves", preset: "softSCurve" }
    ]
  },
  {
    id: "green_cast_rescue",
    name: "Green Cast Rescue",
    icon: "🟩",
    category: "Photo Rescue",
    description: "תאורה ירקרקה (פלורסנט, צמחייה) — דוחף לכיוון מג'נטה לעור טבעי.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: IMAGE_RESCUE_REQUIRES,
    optionalRequires: ["faceDetection", "skinMask"],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "color", tint: 30, temperature: 5, saturation: -8, vibrance: 8 },
      { type: "highlightsShadows", shadows: 12 },
      { type: "curves", preset: "softSCurve" }
    ]
  },
  {
    id: "mixed_tunnel_rescue",
    name: "Mixed Tunnel Rescue",
    icon: "🌀",
    category: "Photo Rescue",
    description: "אור צבעוני חזק + פנים חשוכות + פתח אור מאחור (מנהרה/מתקן משחקים). מאיר פנים, מגן על אורות ומרכך את הצבע הדומיננטי.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: IMAGE_RESCUE_REQUIRES,
    optionalRequires: ["faceDetection", "skinMask"],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "highlightsShadows", shadows: 35, highlights: -30, whites: -18 },
      { type: "color", temperature: -20, saturation: -10, vibrance: 12 },
      { type: "basicTone", contrast: 4 },
      { type: "curves", preset: "softSCurve" }
    ]
  },

  // ── Portrait ──────────────────────────────────────────────────────────────
  {
    id: "soft_portrait",
    name: "Soft Portrait",
    icon: "🙂",
    category: "Portrait",
    description: "מראה עדין ונעים לפנים, בלי \"איפור AI\".",
    defaultStrength: 0.7,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["basicTone", "highlightsShadows", "color"],
    optionalRequires: ["faceDetection"],
    notRecommendedForText: true,
    imageAdjustments: [
      { type: "basicTone", contrast: -5 },
      { type: "highlightsShadows", highlights: -10, shadows: 8 },
      { type: "color", temperature: 4, vibrance: 4 },
      { type: "detail", clarity: -5 }
    ]
  },
  {
    id: "flash_fix",
    name: "Flash Fix",
    icon: "⚡",
    category: "Portrait",
    description: "הפחתת פלאש קשוח ואזורים לבנים מדי.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["highlightsShadows", "basicTone", "color"],
    optionalRequires: [],
    imageAdjustments: [
      { type: "highlightsShadows", highlights: -45, whites: -30, shadows: 8 },
      { type: "basicTone", contrast: -8 },
      { type: "color", temperature: 3 }
    ]
  },

  // ── Print ─────────────────────────────────────────────────────────────────
  {
    id: "sublimation_boost",
    name: "Sublimation Boost",
    icon: "🖨",
    category: "Print",
    description: "חיזוק צבעים וקונטרסט לסובלימציה בלי לשבור עור.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["color", "basicTone", "detail"],
    optionalRequires: ["printerProfile"],
    printWarnings: ["יש לבדוק תוצאה בהדפסת ניסיון לפי סוג דיו/נייר/מוצר."],
    imageAdjustments: [
      { type: "color", vibrance: 18, saturation: 8 },
      { type: "basicTone", contrast: 8 },
      { type: "detail", sharpness: 6, clarity: 4 }
    ]
  },
  {
    id: "canvas_punch",
    name: "Canvas Punch",
    icon: "🖼",
    category: "Print",
    description: "הכנה לקנבס שבולע צבע ופרטים.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["color", "basicTone", "detail", "highlightsShadows"],
    optionalRequires: [],
    printWarnings: ["להיזהר מעור מוגזם."],
    imageAdjustments: [
      { type: "basicTone", contrast: 12 },
      { type: "color", vibrance: 10 },
      { type: "detail", sharpness: 15, clarity: 8 },
      { type: "highlightsShadows", shadows: 4 }
    ]
  },
  {
    id: "wood_print_prep",
    name: "Wood Print Prep",
    icon: "🪵",
    category: "Print",
    description: "הכנה להדפסה על עץ/סטיקווד.",
    defaultStrength: 0.75,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["basicTone", "highlightsShadows", "color", "detail"],
    optionalRequires: [],
    imageAdjustments: [
      { type: "basicTone", contrast: 12 },
      { type: "highlightsShadows", shadows: 10 },
      { type: "color", temperature: 5, vibrance: 5 },
      { type: "detail", sharpness: 8 }
    ]
  },
  {
    id: "laser_ready",
    name: "Laser Ready",
    icon: "🔥",
    category: "Print",
    description: "הכנה לחריטה בלייזר — שחור-לבן עם קונטרסט גבוה.",
    defaultStrength: 0.85,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["blackWhite", "basicTone", "detail"],
    optionalRequires: ["threshold"],
    printWarnings: ["יש לכוון Threshold ידנית לפי החומר."],
    imageAdjustments: [
      { type: "blackWhite", strength: 100 },
      { type: "basicTone", contrast: 25 },
      { type: "detail", sharpness: 12, noiseReduction: 8 }
    ]
  },

  // ── Looks / Creative ──────────────────────────────────────────────────────
  {
    id: "vintage_film",
    name: "Vintage Film",
    icon: "🎞",
    category: "Looks",
    description: "מראה פילם ישן, שחורים מורמים, חום עדין.",
    defaultStrength: 0.65,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["curves", "color", "basicTone"],
    optionalRequires: [],
    imageAdjustments: [
      { type: "curves", preset: "fadeFilm" },
      { type: "color", saturation: -12, temperature: 8 },
      { type: "basicTone", contrast: -5 }
    ]
  },
  {
    id: "gold_noir",
    name: "Gold Noir",
    icon: "GOLD",
    category: "Duotone",
    description: "Luxury black and gold duotone look for posters, gifts, and premium designs.",
    defaultStrength: 0.8,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["blackWhite", "gradientMap", "basicTone"],
    optionalRequires: [],
    imageAdjustments: [
      { type: "blackWhite", strength: 100 },
      { type: "gradientMap", stops: [
        { position: 0, color: "#080604" },
        { position: 0.5, color: "#B8860B" },
        { position: 1, color: "#FFF1B8" }
      ] },
      { type: "basicTone", contrast: 18 },
      { type: "curves", preset: "strongSCurve" }
    ]
  },
  {
    id: "neon_duo",
    name: "Neon Duo",
    icon: "NEON",
    category: "Duotone",
    description: "Bold neon duotone with vibrant poster-like contrast.",
    defaultStrength: 0.78,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages"],
    requires: ["blackWhite", "gradientMap", "basicTone", "color"],
    optionalRequires: [],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "blackWhite", strength: 100 },
      { type: "basicTone", contrast: 14 },
      { type: "gradientMap", stops: [
        { position: 0, color: "#0A1026" },
        { position: 0.5, color: "#7C3AED" },
        { position: 1, color: "#FF4FD8" }
      ] },
      { type: "color", vibrance: 8 }
    ]
  },
  {
    id: "sunset_duo",
    name: "Sunset Duo",
    icon: "SUN",
    category: "Duotone",
    description: "Warm sunset duotone using dark shadows and orange-pink highlights.",
    defaultStrength: 0.78,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["blackWhite", "gradientMap", "basicTone"],
    optionalRequires: [],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "blackWhite", strength: 100 },
      { type: "basicTone", contrast: 12 },
      { type: "gradientMap", stops: [
        { position: 0, color: "#2B0A0A" },
        { position: 0.5, color: "#C2410C" },
        { position: 1, color: "#FDBA74" }
      ] }
    ]
  },
  {
    id: "ice_duo",
    name: "Ice Duo",
    icon: "ICE",
    category: "Duotone",
    description: "Cool blue and cyan duotone with icy contrast.",
    defaultStrength: 0.78,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages"],
    requires: ["blackWhite", "gradientMap", "basicTone"],
    optionalRequires: [],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "blackWhite", strength: 100 },
      { type: "basicTone", contrast: 12 },
      { type: "gradientMap", stops: [
        { position: 0, color: "#081018" },
        { position: 0.5, color: "#0EA5E9" },
        { position: 1, color: "#E0F7FF" }
      ] }
    ]
  },
  {
    id: "blue_poster",
    name: "Blue Poster",
    icon: "BLUE",
    category: "Duotone",
    description: "Simple blue duotone poster effect, cleaner and quieter than Neon Duo.",
    defaultStrength: 0.76,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["blackWhite", "gradientMap", "basicTone"],
    optionalRequires: [],
    notRecommendedAsPageLook: true,
    imageAdjustments: [
      { type: "blackWhite", strength: 100 },
      { type: "basicTone", contrast: 10 },
      { type: "gradientMap", stops: [
        { position: 0, color: "#0B132B" },
        { position: 0.5, color: "#1D4ED8" },
        { position: 1, color: "#DBEAFE" }
      ] }
    ]
  },
  {
    id: "hollywood_teal_orange",
    name: "Hollywood Teal & Orange",
    icon: "🎬",
    category: "Looks",
    description: "מראה קולנועי עם צללים טורקיז וגוונים חמים.",
    defaultStrength: 0.7,
    recommendedApplyMode: "selectedImages",
    allowedApplyModes: ["singleImage", "selectedImages", "allImagesOnPage"],
    requires: ["curves", "color", "basicTone"],
    optionalRequires: [],
    imageAdjustments: [
      { type: "curves", preset: "softSCurve" },
      { type: "color", saturation: -6, vibrance: 10, temperature: 6 },
      { type: "basicTone", contrast: 10 }
    ]
  },

  // ── Page Look presets (Phase 4) ─────────────────────────────────────────────
  {
    id: "vintage_page_wash",
    name: "Vintage Page Wash",
    icon: "🎞",
    category: "Looks",
    description: "שכבת אווירה עליונה שנותנת מראה וינטג' חם לכל העמוד.",
    defaultStrength: 0.55,
    recommendedApplyMode: "pageLook",
    allowedApplyModes: ["pageLook"],
    requires: ["pageLookOverlay"],
    optionalRequires: [],
    imageAdjustments: [],
    pageLookEffect: { kind: "wash", color: "#8b5a2b", opacity: 0.4, blendMode: "soft-light" }
  },
  {
    id: "sepia_memories",
    name: "Sepia Memories",
    icon: "🟤",
    category: "Looks",
    description: "ספיה נוסטלגית כשכבת אווירה עליונה.",
    defaultStrength: 0.55,
    recommendedApplyMode: "pageLook",
    allowedApplyModes: ["pageLook"],
    requires: ["pageLookOverlay"],
    optionalRequires: [],
    imageAdjustments: [],
    pageLookEffect: { kind: "colorOverlay", color: "#8b5a2b", opacity: 0.45, blendMode: "multiply" }
  },
  {
    id: "soft_glow",
    name: "Soft Glow",
    icon: "✨",
    category: "Creative",
    description: "הילה לבנה רכה לעמוד/עיצוב.",
    defaultStrength: 0.5,
    recommendedApplyMode: "pageLook",
    allowedApplyModes: ["pageLook"],
    requires: ["pageLookOverlay"],
    optionalRequires: [],
    imageAdjustments: [],
    pageLookEffect: { kind: "wash", color: "#ffffff", opacity: 0.25, blendMode: "soft-light" }
  },
  {
    id: "moody_dark",
    name: "Moody Dark",
    icon: "🌚",
    category: "Creative",
    description: "החשכה דרמטית עם וינייטה מסביב לעמוד.",
    defaultStrength: 0.6,
    recommendedApplyMode: "pageLook",
    allowedApplyModes: ["pageLook"],
    requires: ["pageLookOverlay"],
    optionalRequires: [],
    imageAdjustments: [],
    pageLookEffect: { kind: "vignette", color: "#000000", amount: 0.55, softness: 0.55, roundness: 0.4 }
  },
  {
    id: "dream_pastel",
    name: "Dream Pastel",
    icon: "☁",
    category: "Creative",
    description: "מראה בהיר ורך בגוון פסטל לכל העמוד.",
    defaultStrength: 0.5,
    recommendedApplyMode: "pageLook",
    allowedApplyModes: ["pageLook"],
    requires: ["pageLookOverlay"],
    optionalRequires: [],
    imageAdjustments: [],
    pageLookEffect: { kind: "colorOverlay", color: "#ffd6e8", opacity: 0.3, blendMode: "screen" }
  }
];

/** True if the preset carries a page-look recipe and allows the pageLook apply mode. */
export function canApplyAsPageLook(def: SmartPresetDefinition): boolean {
  return def.pageLookEffect !== undefined && def.allowedApplyModes.includes("pageLook");
}

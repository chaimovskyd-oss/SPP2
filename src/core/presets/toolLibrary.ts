/**
 * Unified Tool Library model (plan שלב 4).
 *
 * Replaces the old flat "+" add-menu with a searchable, categorized catalog that
 * spans every way of adding an effect:
 *   - raw image-adjustment tools (basicTone, color, …)
 *   - manual page-look effect kinds (vignette, grain, …)
 *   - Smart Presets applied to the image
 *   - Smart Presets applied as a Page Look
 *
 * This module is PURE (no React, no store). The ToolLibrary component renders it;
 * the panels translate a picked item into the matching store action.
 */

import type { ImageAdjustmentType, PageLookEffectKind } from "@/types/imageAdjustments";
import type { AiToolVariant } from "@/core/analysis/autoEnhance";
import {
  canApplyAsPageLook,
  listPresets,
  type SmartPresetApplyMode,
  type SmartPresetCategory,
  type SmartPresetDefinition
} from "@/core/presets/smartPresets";

export type LibraryItemKind = "tool" | "effect" | "imagePreset" | "pageLookPreset" | "aiTool";

/** Where the library was opened from — drives Recommended and which items show. */
export type LibraryContext = "image" | "page";

export interface LibraryItem {
  /** Stable key, also used for Recently-Used persistence. */
  key: string;
  name: string;
  description: string;
  icon?: string;
  /** Display category (Hebrew). */
  category: string;
  /** Short badge describing what kind of thing this is. */
  status: string;
  /** Hebrew label for the recommended apply mode. */
  recommendedMode: string;
  kind: LibraryItemKind;
  toolType?: ImageAdjustmentType;
  effectKind?: PageLookEffectKind;
  presetId?: string;
  aiVariant?: AiToolVariant;
  /** Lowercased searchable blob (name + description + category). */
  keywords: string;
}

// ─── Hebrew labels ──────────────────────────────────────────────────────────────

export const PRESET_CATEGORY_HE: Record<SmartPresetCategory, string> = {
  "Photo Rescue": "הצלת תמונה",
  "HDR / Detail / Product": "HDR / Detail / Product",
  Portrait: "פורטרט",
  Print: "דפוס",
  Looks: "מראות",
  Duotone: "Duotone",
  Creative: "יצירתי",
  Basic: "בסיסי",
  Advanced: "מתקדם",
  Custom: "מותאם אישית"
};

const APPLY_MODE_HE: Record<SmartPresetApplyMode, string> = {
  singleImage: "על התמונה",
  selectedImages: "על התמונות הנבחרות",
  allImagesOnPage: "על כל העמוד",
  pageLook: "כ־Page Look"
};

const TOOL_CATEGORY_HE = "כלים בסיסיים";
const EFFECT_CATEGORY_HE = "אפקטי עמוד";
const AI_CATEGORY_HE = "כלים חכמים (AI)";

const AI_META: Record<AiToolVariant, { name: string; description: string; icon: string }> = {
  autoEnhance: {
    name: "Analyze Photo",
    description: "Analyzes exposure, contrast, color cast, and softness first, then previews a mild suggested correction before apply.",
    icon: "✨"
  },
  faceBrighten: {
    name: "הבהרת פנים",
    description: "מזהה את הפנים ומאיר אותן: בהירות, פתיחת צללים והרמת גוון העור.",
    icon: "🙂"
  },
  autoColor: {
    name: "איזון צבע אוטומטי",
    description: "מזהה נטיית צבע (חם/קר/ירקרק) ומאזן את גוון העור והתמונה.",
    icon: "🎯"
  }
};

const AI_ORDER: AiToolVariant[] = ["autoEnhance", "faceBrighten", "autoColor"];

const TOOL_META: Record<ImageAdjustmentType, { name: string; description: string; icon: string }> = {
  basicTone: { name: "טון בסיסי", description: "בהירות, קונטרסט, חשיפה, גמא והיסט.", icon: "◐" },
  highlightsShadows: { name: "אורות וצללים", description: "שליטה נפרדת באורות, צללים, לבנים ושחורים.", icon: "◑" },
  color: { name: "צבע", description: "רוויה, חיות, טמפרטורה, גוון וטינט.", icon: "🎨" },
  detail: { name: "פרטים וחדות", description: "חידוד, בהירות מקומית והפחתת רעש.", icon: "✦" },
  blackWhite: { name: "שחור־לבן", description: "המרה לגווני אפור עם מיקסר ערוצים.", icon: "◍" },
  curves: { name: "עקומות", description: "עקומת טונים לפי פריסט או נקודות.", icon: "〜" },
  threshold: { name: "סף (Threshold)", description: "הפיכה לשחור־לבן חד לפי סף בהירות.", icon: "◰" },
  gradientMap: { name: "מיפוי גרדיאנט", description: "מיפוי בהירות לגרדיאנט צבעים.", icon: "▦" },
  sepia: { name: "ספיה", description: "גוון חום־חמים קלאסי.", icon: "◔" },
  invert: { name: "היפוך", description: "היפוך צבעי התמונה.", icon: "◌" }
};

const TOOL_ORDER: ImageAdjustmentType[] = [
  "basicTone",
  "highlightsShadows",
  "color",
  "detail",
  "curves",
  "blackWhite",
  "threshold",
  "gradientMap",
  "sepia",
  "invert"
];

const EFFECT_META: Record<PageLookEffectKind, { name: string; description: string; icon: string }> = {
  colorOverlay: { name: "שכבת צבע", description: "שכבת צבע אחידה מעל העמוד.", icon: "▥" },
  wash: { name: "שטיפה", description: "שטיפת צבע עדינה על כל העמוד.", icon: "▤" },
  gradientOverlay: { name: "גרדיאנט", description: "מעבר צבע מכוון מעל העמוד.", icon: "◨" },
  vignette: { name: "וינייטה", description: "החשכה/הבהרה בקצוות העמוד.", icon: "⬭" },
  grain: { name: "גרעיניות", description: "מרקם גרעיני אנלוגי על העמוד.", icon: "▒" }
};

const EFFECT_ORDER: PageLookEffectKind[] = ["colorOverlay", "wash", "gradientOverlay", "vignette", "grain"];

// ─── Item builders ──────────────────────────────────────────────────────────────

function kw(...parts: string[]): string {
  return parts.join(" ").toLowerCase();
}

function toolItem(type: ImageAdjustmentType): LibraryItem {
  const meta = TOOL_META[type];
  return {
    key: `tool:${type}`,
    name: meta.name,
    description: meta.description,
    icon: meta.icon,
    category: TOOL_CATEGORY_HE,
    status: "התאמת תמונה",
    recommendedMode: APPLY_MODE_HE.singleImage,
    kind: "tool",
    toolType: type,
    keywords: kw(meta.name, meta.description, TOOL_CATEGORY_HE, type)
  };
}

function aiItem(variant: AiToolVariant): LibraryItem {
  const meta = AI_META[variant];
  return {
    key: `ai:${variant}`,
    name: meta.name,
    description: meta.description,
    icon: meta.icon,
    category: AI_CATEGORY_HE,
    status: "AI חכם",
    recommendedMode: APPLY_MODE_HE.singleImage,
    kind: "aiTool",
    aiVariant: variant,
    keywords: kw(meta.name, meta.description, AI_CATEGORY_HE, variant, "ai חכם פנים שיפור הבהרה")
  };
}

function effectItem(kind: PageLookEffectKind): LibraryItem {
  const meta = EFFECT_META[kind];
  return {
    key: `effect:${kind}`,
    name: meta.name,
    description: meta.description,
    icon: meta.icon,
    category: EFFECT_CATEGORY_HE,
    status: "אפקט עמוד",
    recommendedMode: APPLY_MODE_HE.pageLook,
    kind: "effect",
    effectKind: kind,
    keywords: kw(meta.name, meta.description, EFFECT_CATEGORY_HE, kind)
  };
}

function imagePresetItem(def: SmartPresetDefinition): LibraryItem {
  const category = PRESET_CATEGORY_HE[def.category];
  return {
    key: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    category,
    status: "פריסט תמונה",
    recommendedMode: APPLY_MODE_HE[def.recommendedApplyMode] ?? APPLY_MODE_HE.singleImage,
    kind: "imagePreset",
    presetId: def.id,
    keywords: kw(def.name, def.description, category, def.id, "preset פריסט")
  };
}

function pageLookPresetItem(def: SmartPresetDefinition): LibraryItem {
  const category = PRESET_CATEGORY_HE[def.category];
  return {
    key: `pagelook:${def.id}`,
    name: def.name,
    description: def.description,
    icon: def.icon,
    category,
    status: "פריסט Page Look",
    recommendedMode: APPLY_MODE_HE.pageLook,
    kind: "pageLookPreset",
    presetId: def.id,
    keywords: kw(def.name, def.description, category, def.id, "preset פריסט page look")
  };
}

/** Build the full item list available in the given context, in display order. */
export function buildLibraryItems(context: LibraryContext): LibraryItem[] {
  const presets = listPresets();
  if (context === "image") {
    const aiTools = AI_ORDER.map(aiItem);
    const tools = TOOL_ORDER.map(toolItem);
    const imagePresets = presets.filter((p) => p.imageAdjustments.length > 0).map(imagePresetItem);
    const lookPresets = presets.filter(canApplyAsPageLook).map(pageLookPresetItem);
    return [...aiTools, ...tools, ...imagePresets, ...lookPresets];
  }
  const effects = EFFECT_ORDER.map(effectItem);
  const lookPresets = presets.filter(canApplyAsPageLook).map(pageLookPresetItem);
  return [...effects, ...lookPresets];
}

/** Distinct display categories present in the item list, in first-seen order. */
export function libraryCategories(items: LibraryItem[]): string[] {
  const seen: string[] = [];
  for (const item of items) if (!seen.includes(item.category)) seen.push(item.category);
  return seen;
}

/** Case-insensitive substring search over name/description/category. */
export function searchLibrary(items: LibraryItem[], query: string): LibraryItem[] {
  const q = query.trim().toLowerCase();
  if (q === "") return items;
  const terms = q.split(/\s+/).filter(Boolean);
  return items.filter((item) => terms.every((term) => item.keywords.includes(term)));
}

/**
 * Recommended items for the current context:
 *   image → Photo Rescue presets (the most common need when an image is selected)
 *   page  → Page Look presets (atmosphere overlays)
 */
export function recommendedItems(context: LibraryContext, items: LibraryItem[]): LibraryItem[] {
  if (context === "image") {
    const recommendedPresetIds = new Set([
      "dark_photo_fix",
      "backlight_rescue",
      "indoor_light_fix",
      "whatsapp_recovery",
      "soft_hdr",
      "hdr_pop",
      "product_punch",
      "landscape_boost",
      "gold_noir",
      "neon_duo",
      "sunset_duo",
      "ice_duo",
      "blue_poster"
    ]);
    return items.filter((item) => item.kind === "imagePreset" && item.presetId !== undefined && recommendedPresetIds.has(item.presetId));
  }
  return items.filter((item) => item.kind === "pageLookPreset");
}

/** Map persisted recent keys back to items in the current context, preserving recency order. */
export function recentItems(recentKeys: string[], items: LibraryItem[]): LibraryItem[] {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const out: LibraryItem[] = [];
  for (const key of recentKeys) {
    const item = byKey.get(key);
    if (item !== undefined) out.push(item);
  }
  return out;
}

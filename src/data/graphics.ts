/**
 * ספריית גרפיקה — שכבת הנתונים המרכזית
 *
 * Architecture:
 *   GraphicPack   → אוסף של קטגוריות (e.g. "אמוג'י", "עיצובים")
 *   GraphicCategory → קבוצת פריטים בתוך חבילה (e.g. "פרצופים", "לבבות")
 *   GraphicItem   → פריט גרפי בודד — SVG או PNG
 *
 * Adding a new pack:
 *   1. Define categories in GRAPHIC_PACKS
 *   2. Push items into GRAPHICS_DATA (or concat a separate array)
 *   3. Put asset files in public/assets/library/{packId}/
 *   Done — the panel auto-discovers it.
 */

import { EMOJI_DATA, getEmojiSvgUrl, getEmojiCdnUrl } from "./openmoji";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GraphicItem {
  id: string;
  name: string;
  pack: string;
  category: string;
  type: "svg" | "png";
  file: string;
  fallbackUrl?: string;
  keywords: string[];
  tags?: string[];
}

export interface GraphicCategory {
  id: string;
  name: string;
  icon: string;
}

export interface GraphicPack {
  id: string;
  name: string;
  icon: string;
  categories: GraphicCategory[];
}

// ─── Pack registry ────────────────────────────────────────────────────────────
// Add new packs here. Categories listed here that have no items are hidden
// automatically in the panel.

export const GRAPHIC_PACKS: GraphicPack[] = [
  {
    id: "openmoji",
    name: "אמוג'י",
    icon: "😀",
    categories: [
      { id: "smileys",     name: "פרצופים",      icon: "😀" },
      { id: "hearts",      name: "לבבות",         icon: "❤️" },
      { id: "celebration", name: "חגיגה",          icon: "🎉" },
      { id: "animals",     name: "חיות",           icon: "🐶" },
      { id: "food",        name: "אוכל",           icon: "🍕" },
      { id: "objects",     name: "חפצים",          icon: "💡" },
      { id: "symbols",     name: "סמלים",          icon: "✅" },
      { id: "weather",     name: "מזג אוויר",      icon: "☀️" },
      { id: "travel",      name: "נסיעות",         icon: "✈️" },
    ],
  },

  // ── Future pack: Decorations ───────────────────────────────────────────────
  // Uncomment and populate to activate.
  //
  // {
  //   id: "decorations",
  //   name: "עיצובים",
  //   icon: "🌸",
  //   categories: [
  //     { id: "flowers",  name: "פרחים",      icon: "🌸" },
  //     { id: "frames",   name: "מסגרות",     icon: "🖼" },
  //     { id: "arrows",   name: "חיצים",      icon: "➡️" },
  //     { id: "labels",   name: "תוויות",     icon: "🏷" },
  //     { id: "lines",    name: "קווים",      icon: "〰️" },
  //   ],
  // },

  // ── Future pack: Occasions ────────────────────────────────────────────────
  // {
  //   id: "occasions",
  //   name: "אירועים",
  //   icon: "🎊",
  //   categories: [
  //     { id: "birthday", name: "יום הולדת",  icon: "🎂" },
  //     { id: "wedding",  name: "חתונה",      icon: "💍" },
  //     { id: "baby",     name: "לידה",       icon: "👶" },
  //     { id: "school",   name: "בית ספר",    icon: "🎒" },
  //   ],
  // },

  // ── Future pack: Icons ───────────────────────────────────────────────────
  // {
  //   id: "icons",
  //   name: "אייקונים",
  //   icon: "🔷",
  //   categories: [
  //     { id: "ui",       name: "ממשק",       icon: "📱" },
  //     { id: "social",   name: "רשתות חברתיות", icon: "📲" },
  //     { id: "business", name: "עסקים",      icon: "💼" },
  //   ],
  // },

  // ── Future pack: Hadish Originals ────────────────────────────────────────
  // {
  //   id: "hadish",
  //   name: "מיוחדים",
  //   icon: "✨",
  //   categories: [
  //     { id: "all",      name: "הכל",        icon: "🎨" },
  //   ],
  // },
];

// ─── Convert existing emoji data → GraphicItem[] ─────────────────────────────
// IDs are preserved unchanged so localStorage favorites/recents keep working.
// Items that lived in the old "favorites" category are remapped to their
// natural category so they appear in the correct tab.

const OLD_FAVORITES_MAP: Record<string, string> = {
  "star":          "symbols",
  "sparkles":      "symbols",
  "heart-red":     "hearts",
  "fire":          "symbols",
  "rainbow":       "weather",
  "party-popper":  "celebration",
  "gift":          "celebration",
  "birthday-cake": "celebration",
  "trophy":        "celebration",
  "crown":         "celebration",
  "sunflower":     "objects",
  "rose":          "objects",
  "balloon":       "celebration",
  "camera":        "objects",
  "100":           "symbols",
};

const OPENMOJI_ITEMS: GraphicItem[] = EMOJI_DATA.map((e) => ({
  id: e.id,
  name: e.name,
  pack: "openmoji",
  category: e.category === "favorites"
    ? (OLD_FAVORITES_MAP[e.id] ?? "symbols")
    : e.category,
  type: "svg" as const,
  file: getEmojiSvgUrl(e.code),
  fallbackUrl: getEmojiCdnUrl(e.code),
  keywords: e.keywords,
}));

// ─── Main data array ──────────────────────────────────────────────────────────
// Add new pack item arrays with spread: [...OPENMOJI_ITEMS, ...DECORATION_ITEMS]

export const GRAPHICS_DATA: GraphicItem[] = [
  ...OPENMOJI_ITEMS,
  // ...DECORATION_ITEMS,
  // ...OCCASION_ITEMS,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** All category IDs that actually have items in a given pack */
export function getActiveCategoriesForPack(packId: string): Set<string> {
  const seen = new Set<string>();
  for (const item of GRAPHICS_DATA) {
    if (item.pack === packId) seen.add(item.category);
  }
  return seen;
}

/** Returns categories for a pack that have at least one item */
export function getPackCategories(packId: string): GraphicCategory[] {
  const pack = GRAPHIC_PACKS.find((p) => p.id === packId);
  if (!pack) return [];
  const active = getActiveCategoriesForPack(packId);
  return pack.categories.filter((c) => active.has(c.id));
}

/** Returns all packs that have at least one item */
export function getActivePacks(): GraphicPack[] {
  const packsWithItems = new Set(GRAPHICS_DATA.map((i) => i.pack));
  return GRAPHIC_PACKS.filter((p) => packsWithItems.has(p.id));
}

/** Search across all packs */
export function searchGraphics(query: string): GraphicItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return GRAPHICS_DATA;
  return GRAPHICS_DATA.filter(
    (item) =>
      item.name.includes(q) ||
      item.keywords.some((k) => k.includes(q)) ||
      item.id.includes(q) ||
      item.category.includes(q) ||
      (item.tags ?? []).some((t) => t.includes(q))
  );
}

/** Get items by pack + category */
export function getItemsByPackCategory(packId: string, categoryId: string): GraphicItem[] {
  return GRAPHICS_DATA.filter(
    (item) => item.pack === packId && item.category === categoryId
  );
}

/** Look up a single item by its id (cross-pack) */
export function getGraphicById(id: string): GraphicItem | undefined {
  return GRAPHICS_DATA.find((item) => item.id === id);
}

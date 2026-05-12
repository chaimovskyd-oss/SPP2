// Font registry: Hebrew-first, with favorites support

export interface FontEntry {
  family: string;
  label: string;
  lang: "he" | "la" | "both";
  weights: number[];
}

// Hebrew fonts come first, then Latin
export const FONT_LIST: FontEntry[] = [
  // ── Hebrew ──────────────────────────────────────────────────────────────────
  { family: "Heebo", label: "הבו — Heebo", lang: "he", weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: "Rubik", label: "רוביק — Rubik", lang: "both", weights: [300, 400, 500, 700, 900] },
  { family: "Assistant", label: "אסיסטנט — Assistant", lang: "he", weights: [300, 400, 600, 700, 800] },
  { family: "Frank Ruhl Libre", label: "פרנק רוהל — Frank Ruhl Libre", lang: "he", weights: [300, 400, 500, 700, 900] },
  { family: "Noto Sans Hebrew", label: "נוטו עברית — Noto Hebrew", lang: "he", weights: [300, 400, 600, 700, 900] },
  { family: "Secular One", label: "סקולר — Secular One", lang: "he", weights: [400] },
  { family: "Alef", label: "אלף — Alef", lang: "he", weights: [400, 700] },
  { family: "David Libre", label: "דוד — David Libre", lang: "he", weights: [400, 500, 700] },
  { family: "Miriam Libre", label: "מרים — Miriam Libre", lang: "he", weights: [400, 700] },
  { family: "Suez One", label: "סואץ — Suez One", lang: "he", weights: [400] },
  { family: "Amatic SC", label: "אמטיק — Amatic SC", lang: "both", weights: [400, 700] },
  // ── Latin ───────────────────────────────────────────────────────────────────
  { family: "DM Sans", label: "DM Sans", lang: "la", weights: [300, 400, 500, 600, 700] },
  { family: "Syne", label: "Syne", lang: "la", weights: [400, 500, 600, 700, 800] },
  { family: "Roboto", label: "Roboto", lang: "la", weights: [300, 400, 700] },
  { family: "Open Sans", label: "Open Sans", lang: "la", weights: [300, 400, 700] },
  { family: "Montserrat", label: "Montserrat", lang: "la", weights: [400, 600, 700, 800, 900] },
  { family: "Poppins", label: "Poppins", lang: "la", weights: [300, 400, 600, 700, 800] },
  { family: "Nunito", label: "Nunito", lang: "la", weights: [300, 400, 600, 700, 800] },
  { family: "Lato", label: "Lato", lang: "la", weights: [300, 400, 700] },
  { family: "Raleway", label: "Raleway", lang: "la", weights: [300, 400, 700, 900] },
  { family: "Oswald", label: "Oswald", lang: "la", weights: [300, 400, 500, 700] },
  { family: "Playfair Display", label: "Playfair Display", lang: "la", weights: [400, 700, 900] },
  { family: "Merriweather", label: "Merriweather", lang: "la", weights: [300, 400, 700] },
  { family: "Ubuntu", label: "Ubuntu", lang: "la", weights: [300, 400, 700] },
  { family: "Anton", label: "Anton", lang: "la", weights: [400] },
  { family: "Bebas Neue", label: "Bebas Neue", lang: "la", weights: [400] },
  { family: "Righteous", label: "Righteous", lang: "la", weights: [400] },
  { family: "Arial", label: "Arial (System)", lang: "both", weights: [400, 700] },
  { family: "Times New Roman", label: "Times New Roman (System)", lang: "both", weights: [400, 700] },
  { family: "Georgia", label: "Georgia (System)", lang: "both", weights: [400, 700] },
];

const FAVORITES_KEY = "spp2_font_favorites";

export function getFontFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw !== null) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore
  }
  return new Set();
}

export function toggleFontFavorite(family: string): Set<string> {
  const favs = getFontFavorites();
  if (favs.has(family)) {
    favs.delete(family);
  } else {
    favs.add(family);
  }
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
  } catch {
    // ignore
  }
  return favs;
}

export interface GroupedFonts {
  favorites: FontEntry[];
  hebrew: FontEntry[];
  latin: FontEntry[];
}

export function getGroupedFonts(favorites: Set<string>, query = ""): GroupedFonts {
  const q = query.trim().toLowerCase();
  const matches = (f: FontEntry): boolean =>
    q === "" ||
    f.family.toLowerCase().includes(q) ||
    f.label.toLowerCase().includes(q);

  const all = FONT_LIST.filter(matches);
  return {
    favorites: all.filter((f) => favorites.has(f.family)),
    hebrew: all.filter((f) => f.lang !== "la" && !favorites.has(f.family)),
    latin: all.filter((f) => f.lang !== "he" && !favorites.has(f.family))
  };
}

export function fontFamilyExists(family: string): boolean {
  return FONT_LIST.some((f) => f.family === family);
}

// Font registry: Hebrew-first, with favorites support

export interface FontEntry {
  family: string;
  label: string;
  lang: "he" | "la" | "both";
  weights: number[];
  source?: "bundled" | "system";
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
  { family: "Arial", label: "Arial", lang: "both", weights: [400, 700] },
  { family: "Times New Roman", label: "Times New Roman", lang: "both", weights: [400, 700] },
  { family: "Georgia", label: "Georgia", lang: "both", weights: [400, 700] },
];

const FAVORITES_KEY = "spp2_font_favorites";
const SYSTEM_FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

let systemFontsCache: FontEntry[] = [];
let systemFontsRequest: Promise<FontEntry[]> | null = null;

function looksHebrew(value: string): boolean {
  return /[\u0590-\u05ff]/.test(value);
}

function normalizeFontFamily(family: string): string {
  return family.trim().replace(/\s+/g, " ");
}

function makeSystemFontEntry(family: string): FontEntry | null {
  const normalized = normalizeFontFamily(family);
  if (normalized.length === 0) return null;
  return {
    family: normalized,
    label: normalized,
    lang: looksHebrew(normalized) ? "he" : "both",
    weights: SYSTEM_FONT_WEIGHTS,
    source: "system"
  };
}

function byFontName(a: FontEntry, b: FontEntry): number {
  return a.family.localeCompare(b.family, ["he", "en"], { sensitivity: "base" });
}

function dedupeFonts(fonts: FontEntry[]): FontEntry[] {
  const byFamily = new Map<string, FontEntry>();
  for (const font of fonts) {
    const key = normalizeFontFamily(font.family).toLowerCase();
    if (!byFamily.has(key)) byFamily.set(key, font);
  }
  return [...byFamily.values()];
}

export function getSystemFonts(): FontEntry[] {
  return systemFontsCache;
}

export function getAllFonts(): FontEntry[] {
  const bundled = FONT_LIST.map((font) => ({ ...font, source: font.source ?? "bundled" as const }));
  const bundledKeys = new Set(bundled.map((font) => normalizeFontFamily(font.family).toLowerCase()));
  const extraSystemFonts = systemFontsCache
    .filter((font) => !bundledKeys.has(normalizeFontFamily(font.family).toLowerCase()))
    .sort(byFontName);
  return dedupeFonts([...bundled, ...extraSystemFonts]);
}

export async function loadSystemFonts(): Promise<FontEntry[]> {
  if (systemFontsRequest !== null) return systemFontsRequest;
  const api = typeof window !== "undefined" ? window.spp : undefined;
  if (api?.listSystemFonts === undefined) {
    systemFontsCache = [];
    return systemFontsCache;
  }

  systemFontsRequest = api.listSystemFonts()
    .then((families) => {
      systemFontsCache = dedupeFonts(
        families
          .map(makeSystemFontEntry)
          .filter((entry): entry is FontEntry => entry !== null)
      ).sort(byFontName);
      return systemFontsCache;
    })
    .catch(() => {
      systemFontsCache = [];
      return systemFontsCache;
    })
    .finally(() => {
      systemFontsRequest = null;
    });

  return systemFontsRequest;
}

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

  const all = getAllFonts().filter(matches);
  return {
    favorites: all.filter((f) => favorites.has(f.family)),
    hebrew: all.filter((f) => f.lang !== "la" && !favorites.has(f.family)),
    latin: all.filter((f) => f.lang !== "he" && !favorites.has(f.family))
  };
}

export function fontFamilyExists(family: string): boolean {
  return getAllFonts().some((f) => f.family === family);
}

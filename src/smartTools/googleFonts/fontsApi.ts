export interface GoogleFontItem {
  family: string;
  category: "serif" | "sans-serif" | "display" | "handwriting" | "monospace";
  subsets: string[];
  variants: string[];
  files: Record<string, string>;
}

export type FontCategory = GoogleFontItem["category"];
export type FontSubset = "all" | "hebrew" | "latin" | "cyrillic";

const FAVORITES_STORAGE_KEY = "spp-google-font-favorites";
const RECENT_STORAGE_KEY = "spp-google-font-recent";
const CACHE_STORAGE_KEY = "spp-google-fonts-cache-v1";
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface FontsCachePayload {
  savedAt: number;
  items: GoogleFontItem[];
}

let memoryFontList: GoogleFontItem[] | null = null;
let pendingFontListRequest: Promise<GoogleFontItem[]> | null = null;

const FALLBACK_FONTS: GoogleFontItem[] = [
  { family: "Rubik", category: "sans-serif", subsets: ["hebrew", "latin"], variants: ["300", "regular", "500", "700", "900"], files: {} },
  { family: "Heebo", category: "sans-serif", subsets: ["hebrew", "latin"], variants: ["300", "regular", "500", "700", "900"], files: {} },
  { family: "Assistant", category: "sans-serif", subsets: ["hebrew", "latin"], variants: ["300", "regular", "600", "700"], files: {} },
  { family: "Alef", category: "sans-serif", subsets: ["hebrew", "latin"], variants: ["regular", "700"], files: {} },
  { family: "Roboto", category: "sans-serif", subsets: ["latin", "cyrillic"], variants: ["300", "regular", "500", "700", "900"], files: {} },
  { family: "Open Sans", category: "sans-serif", subsets: ["latin", "cyrillic"], variants: ["300", "regular", "600", "700", "800"], files: {} },
  { family: "Montserrat", category: "sans-serif", subsets: ["latin", "cyrillic"], variants: ["300", "regular", "500", "700", "900"], files: {} },
  { family: "Noto Sans Hebrew", category: "sans-serif", subsets: ["hebrew", "latin"], variants: ["300", "regular", "700"], files: {} },
  { family: "Noto Sans", category: "sans-serif", subsets: ["latin", "cyrillic"], variants: ["regular", "700"], files: {} },
  { family: "Noto Serif", category: "serif", subsets: ["latin", "cyrillic"], variants: ["regular", "700"], files: {} },
];

function readApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_FONTS_API_KEY ?? "").trim();
}

function readCachedFonts(): GoogleFontItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FontsCachePayload;
    if (!Array.isArray(parsed.items)) return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function saveCachedFonts(items: GoogleFontItem[]): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), items }));
  } catch {
    // Ignore storage errors. The API result can still be used in memory.
  }
}

function normalizeGoogleFontItem(item: GoogleFontItem): GoogleFontItem {
  return {
    family: item.family,
    category: item.category,
    subsets: item.subsets ?? [],
    variants: item.variants ?? [],
    files: item.files ?? {}
  };
}

export async function getFontList(forceRefresh = false): Promise<GoogleFontItem[]> {
  if (!forceRefresh && memoryFontList) return memoryFontList;

  if (!forceRefresh) {
    const cached = readCachedFonts();
    if (cached?.length) {
      memoryFontList = cached;
      return cached;
    }
  }

  if (pendingFontListRequest && !forceRefresh) return pendingFontListRequest;

  const apiKey = readApiKey();
  if (!apiKey) {
    memoryFontList = FALLBACK_FONTS;
    return FALLBACK_FONTS;
  }

  pendingFontListRequest = fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${encodeURIComponent(apiKey)}&sort=popularity`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Google Fonts API failed: ${res.status} ${res.statusText}`);
      const json = await res.json() as { items?: GoogleFontItem[] };
      const items = (json.items ?? []).map(normalizeGoogleFontItem);
      if (!items.length) throw new Error("Google Fonts API returned an empty font list");
      memoryFontList = items;
      saveCachedFonts(items);
      return items;
    })
    .finally(() => {
      pendingFontListRequest = null;
    });

  return pendingFontListRequest;
}

export function filterFonts(
  fonts: GoogleFontItem[],
  query: string,
  category: FontCategory | "all",
  subset: FontSubset
): GoogleFontItem[] {
  const q = query.trim().toLowerCase();

  return fonts.filter((f) => {
    if (q && !f.family.toLowerCase().includes(q)) return false;
    if (category !== "all" && f.category !== category) return false;
    if (subset !== "all" && !f.subsets.includes(subset)) return false;
    return true;
  });
}

function buildGoogleFontsCssUrl(family: string, variants?: string[]): string {
  const usableWeights = (variants ?? [])
    .filter((variant) => /^\d+$/.test(variant))
    .slice(0, 8);

  const weights = usableWeights.length ? usableWeights.join(";") : "400;700";
  const familyParam = encodeURIComponent(family).replace(/%20/g, "+");

  return `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weights}&display=swap`;
}

export function loadGoogleFont(family: string, variants?: string[]): void {
  const id = `gf-${family.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = buildGoogleFontsCssUrl(family, variants);
  document.head.appendChild(link);
}

export function getFontFavoritesStorage(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function toggleFontFavoriteStorage(family: string): string[] {
  const favs = getFontFavoritesStorage();
  const next = favs.includes(family) ? favs.filter((f) => f !== family) : [...favs, family];
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function getRecentFontsStorage(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function addRecentFontStorage(family: string): string[] {
  const next = [family, ...getRecentFontsStorage().filter((f) => f !== family)].slice(0, 20);
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  return next;
}

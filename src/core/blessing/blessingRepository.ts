import type { BlessingItem, BlessingSearchFilters, SourceQuoteItem } from "@/types/blessing";

let blessingsCache: BlessingItem[] | null = null;
let sourcesCache: SourceQuoteItem[] | null = null;
let loadPromise: Promise<void> | null = null;

export async function loadBlessingData(): Promise<void> {
  if (blessingsCache !== null) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [bRes, sRes] = await Promise.all([
      fetch("./data/blessings.json"),
      fetch("./data/sources_quotes.json")
    ]);
    blessingsCache = (await bRes.json()) as BlessingItem[];
    sourcesCache = (await sRes.json()) as SourceQuoteItem[];
  })();

  return loadPromise;
}

export function getAllBlessings(): BlessingItem[] {
  return blessingsCache ?? [];
}

export function getAllSourceQuotes(): SourceQuoteItem[] {
  return sourcesCache ?? [];
}

function matchBlessing(item: BlessingItem, filters: BlessingSearchFilters, favorites: Set<string>): boolean {
  if (filters.event && item.event !== filters.event) return false;
  if (filters.recipient && item.recipient !== filters.recipient) return false;
  if (filters.style && !item.style.includes(filters.style)) return false;
  if (filters.length && item.length !== filters.length) return false;
  if (filters.query) {
    const q = filters.query.toLowerCase();
    const hay = `${item.text} ${item.event} ${item.recipient} ${item.style.join(" ")}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function searchBlessings(filters: BlessingSearchFilters, favorites: Set<string>): BlessingItem[] {
  return (blessingsCache ?? []).filter((item) => matchBlessing(item, filters, favorites));
}

export function searchSourceQuotes(
  filters: Pick<BlessingSearchFilters, "query" | "event" | "style">,
  favorites: Set<string>
): SourceQuoteItem[] {
  return (sourcesCache ?? []).filter((item) => {
    if (filters.event && item.category !== filters.event) return false;
    if (filters.style && !item.style.includes(filters.style)) return false;
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const hay = `${item.text} ${item.category} ${item.source}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function getBlessingFilterOptions(): {
  events: string[];
  recipients: string[];
  styles: string[];
  lengths: string[];
} {
  const blessings = blessingsCache ?? [];
  const events = [...new Set(blessings.map((b) => b.event))].sort();
  const recipients = [...new Set(blessings.map((b) => b.recipient))].sort();
  const styles = [...new Set(blessings.flatMap((b) => b.style))].sort();
  const lengths = [...new Set(blessings.map((b) => b.length))].sort();
  return { events, recipients, styles, lengths };
}

export function getRandomBlessing(filters: BlessingSearchFilters, favorites: Set<string>): BlessingItem | null {
  const results = searchBlessings(filters, favorites);
  if (results.length === 0) return null;
  return results[Math.floor(Math.random() * results.length)];
}

export function getBlessingById(id: string): BlessingItem | undefined {
  return (blessingsCache ?? []).find((b) => b.id === id);
}

export function getSourceQuoteById(id: string): SourceQuoteItem | undefined {
  return (sourcesCache ?? []).find((s) => s.id === id);
}

const BLESS_FAV_KEY = "spp2_blessing_favorites";
const SOURCE_FAV_KEY = "spp2_source_favorites";

function readFavs(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeFavs(key: string, favs: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...favs]));
  } catch {
    // ignore
  }
}

export function getFavoriteBlessingIds(): Set<string> {
  return readFavs(BLESS_FAV_KEY);
}

export function toggleBlessingFavorite(id: string): void {
  const favs = readFavs(BLESS_FAV_KEY);
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  writeFavs(BLESS_FAV_KEY, favs);
}

export function getFavoriteSourceIds(): Set<string> {
  return readFavs(SOURCE_FAV_KEY);
}

export function toggleSourceFavorite(id: string): void {
  const favs = readFavs(SOURCE_FAV_KEY);
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  writeFavs(SOURCE_FAV_KEY, favs);
}

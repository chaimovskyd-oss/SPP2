import type {
  PixabaySearchParams,
  PixabayHit,
  PixabayResult,
  PixabayApiResponse,
  PixabaySearchResult,
  PixabayCache,
} from "@/types/pixabay";

const PIXABAY_API_BASE = "https://pixabay.com/api/";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — required by Pixabay ToS
const CACHE_PREFIX = "spp2_pbcache_";

// ─── Normalisation ────────────────────────────────────────────────────────────

export function normalizePixabayResult(hit: PixabayHit): PixabayResult {
  const w = hit.imageWidth;
  const h = hit.imageHeight;
  let orientation: "horizontal" | "vertical" | "square";
  if (w > h * 1.05) orientation = "horizontal";
  else if (h > w * 1.05) orientation = "vertical";
  else orientation = "square";

  return {
    id: String(hit.id),
    source: "pixabay",
    previewUrl: hit.previewURL,
    thumbnailUrl: hit.previewURL,
    webformatUrl: hit.webformatURL,
    fullUrl: hit.largeImageURL || hit.webformatURL,
    pageUrl: hit.pageURL,
    width: hit.imageWidth,
    height: hit.imageHeight,
    orientation,
    tags: hit.tags,
    user: hit.user,
    userImageURL: hit.userImageURL,
    licenseNote: `Pixabay License · Free for commercial use · ${hit.user}`,
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

export function buildCacheKey(params: PixabaySearchParams): string {
  const { q = "", image_type = "all", orientation = "all", colors = "", page = 1, per_page = 40 } = params;
  const canonical = JSON.stringify({ q, image_type, orientation, colors, page, per_page });
  return CACHE_PREFIX + btoa(unescape(encodeURIComponent(canonical)));
}

export function getCachedSearch(cacheKey: string): PixabaySearchResult | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const entry = JSON.parse(raw) as PixabayCache;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function saveCachedSearch(cacheKey: string, data: PixabaySearchResult): void {
  try {
    const entry: PixabayCache = { timestamp: Date.now(), data };
    localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch {
    // Quota exceeded — cache miss is acceptable, skip silently
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchPixabay(
  params: PixabaySearchParams,
  apiKey: string
): Promise<PixabaySearchResult> {
  if (!apiKey) throw new Error("NO_API_KEY");

  const cacheKey = buildCacheKey(params);
  const cached = getCachedSearch(cacheKey);
  if (cached) return cached;

  const url = new URL(PIXABAY_API_BASE);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", params.q ?? "");
  url.searchParams.set("image_type", params.image_type ?? "all");
  url.searchParams.set("orientation", params.orientation ?? "all");
  url.searchParams.set("safesearch", String(params.safesearch ?? true));
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("per_page", String(params.per_page ?? 40));
  if (params.colors) url.searchParams.set("colors", params.colors);

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new Error("NETWORK_ERROR");
  }

  if (!response.ok) {
    if (response.status === 429) throw new Error("RATE_LIMIT");
    if (response.status === 400) throw new Error("BAD_REQUEST");
    if (response.status === 401 || response.status === 403) throw new Error("INVALID_KEY");
    throw new Error(`HTTP_${response.status}`);
  }

  const json = (await response.json()) as PixabayApiResponse;
  const result: PixabaySearchResult = {
    total: json.total,
    totalHits: json.totalHits,
    results: json.hits.map(normalizePixabayResult),
    page: params.page ?? 1,
  };

  saveCachedSearch(cacheKey, result);
  return result;
}

// ─── Download ─────────────────────────────────────────────────────────────────

export async function downloadPixabayAsset(asset: PixabayResult): Promise<Blob> {
  const url = asset.fullUrl || asset.webformatUrl;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("NETWORK_ERROR");
  }
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.blob();
}

// ─── Error messages (Hebrew) ──────────────────────────────────────────────────

export function getPixabayErrorMessage(error: string): string {
  switch (error) {
    case "NO_API_KEY":   return "לא הוגדר מפתח API. הזן מפתח Pixabay בהגדרות.";
    case "INVALID_KEY":  return "מפתח API לא תקין. בדוק את המפתח בהגדרות.";
    case "RATE_LIMIT":   return "חריגה ממגבלת הבקשות. נסה שוב עוד מספר דקות.";
    case "BAD_REQUEST":  return "בקשה שגויה. נסה מונח חיפוש אחר.";
    case "NETWORK_ERROR": return "שגיאת רשת. בדוק את חיבור האינטרנט.";
    default:             return "שגיאה בחיפוש. נסה שוב.";
  }
}

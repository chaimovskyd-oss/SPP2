import type { Page } from "@/types/document";

// ─── LRU cache for print preview thumbnails ───────────────────────────────────
// Stores low-resolution JPEG data URLs keyed by pageId + content hash.
// IMPORTANT: These thumbnails are intentionally low quality (max 600px, JPEG 0.70).
//            They are ONLY used in the in-app print preview modal.
//            Final print, PDF, and PNG export use a completely separate code path.

const MAX_ENTRIES = 60;

// insertion-order Map gives us free LRU: delete + re-insert bumps to "most recent"
const lruCache = new Map<string, string>();

export function computePagePreviewHash(page: Page): string {
  const layerDigest = page.layers.map((l) => [
    l.id, l.type,
    l.visible ? 1 : 0,
    Math.round(l.x), Math.round(l.y),
    Math.round(l.width), Math.round(l.height),
    l.zIndex,
  ].join(",")).join("|");

  const raw = [
    page.width, page.height,
    JSON.stringify(page.background),
    page.layers.length,
    layerDigest,
  ].join(";");

  // djb2 hash — fast, non-cryptographic, good enough for cache keys
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) ^ raw.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function cacheKey(page: Page): string {
  return `${page.id}-${computePagePreviewHash(page)}`;
}

/** Return the cached preview dataUrl, or null on a miss. */
export function getPreviewCached(page: Page): string | null {
  const key = cacheKey(page);
  const hit = lruCache.get(key);
  if (hit === undefined) return null;
  // bump to most-recent position
  lruCache.delete(key);
  lruCache.set(key, hit);
  return hit;
}

/** Store a preview dataUrl. Evicts the oldest entry when the cache is full. */
export function setPreviewCached(page: Page, dataUrl: string): void {
  const key = cacheKey(page);
  lruCache.delete(key); // remove old position if present
  lruCache.set(key, dataUrl);
  if (lruCache.size > MAX_ENTRIES) {
    // oldest entry is the first key in iteration order
    const oldest = lruCache.keys().next().value;
    if (oldest !== undefined) lruCache.delete(oldest);
  }
}

/** Remove all cached thumbnails for a given page (e.g., after the page is edited). */
export function invalidatePreviewPage(pageId: string): void {
  for (const key of Array.from(lruCache.keys())) {
    if (key.startsWith(`${pageId}-`)) lruCache.delete(key);
  }
}

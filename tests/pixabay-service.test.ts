import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildCacheKey,
  getCachedSearch,
  saveCachedSearch,
  normalizePixabayResult,
  searchPixabay,
  getPixabayErrorMessage,
} from "@/services/pixabayService";
import type { PixabayHit, PixabaySearchResult } from "@/types/pixabay";

// ─── Mock localStorage ────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeHit(overrides: Partial<PixabayHit> = {}): PixabayHit {
  return {
    id: 123456,
    pageURL: "https://pixabay.com/photos/test-123456/",
    type: "photo",
    tags: "nature, green, forest",
    previewURL: "https://cdn.pixabay.com/preview.jpg",
    previewWidth: 150,
    previewHeight: 100,
    webformatURL: "https://cdn.pixabay.com/webformat.jpg",
    webformatWidth: 640,
    webformatHeight: 427,
    largeImageURL: "https://cdn.pixabay.com/large.jpg",
    imageWidth: 5000,
    imageHeight: 3333,
    imageSize: 8_000_000,
    views: 12000,
    downloads: 4000,
    collections: 200,
    likes: 800,
    comments: 50,
    user_id: 9876,
    user: "TestPhotographer",
    userImageURL: "https://cdn.pixabay.com/user.jpg",
    ...overrides,
  };
}

// ─── normalizePixabayResult ───────────────────────────────────────────────────

describe("normalizePixabayResult", () => {
  it("maps raw hit fields to PixabayResult shape", () => {
    const hit = makeHit();
    const result = normalizePixabayResult(hit);

    expect(result.id).toBe("123456");
    expect(result.source).toBe("pixabay");
    expect(result.previewUrl).toBe(hit.previewURL);
    expect(result.thumbnailUrl).toBe(hit.previewURL);
    expect(result.webformatUrl).toBe(hit.webformatURL);
    expect(result.fullUrl).toBe(hit.largeImageURL);
    expect(result.pageUrl).toBe(hit.pageURL);
    expect(result.tags).toBe(hit.tags);
    expect(result.user).toBe("TestPhotographer");
    expect(result.licenseNote).toContain("Pixabay");
  });

  it("falls back to webformatURL when largeImageURL is empty", () => {
    const hit = makeHit({ largeImageURL: "" });
    const result = normalizePixabayResult(hit);
    expect(result.fullUrl).toBe(hit.webformatURL);
  });

  it("determines horizontal orientation when width > height * 1.05", () => {
    const result = normalizePixabayResult(makeHit({ imageWidth: 1920, imageHeight: 1080 }));
    expect(result.orientation).toBe("horizontal");
  });

  it("determines vertical orientation when height > width * 1.05", () => {
    const result = normalizePixabayResult(makeHit({ imageWidth: 1080, imageHeight: 1920 }));
    expect(result.orientation).toBe("vertical");
  });

  it("determines square orientation when dimensions are roughly equal", () => {
    const result = normalizePixabayResult(makeHit({ imageWidth: 1024, imageHeight: 1024 }));
    expect(result.orientation).toBe("square");
  });
});

// ─── buildCacheKey ────────────────────────────────────────────────────────────

describe("buildCacheKey", () => {
  it("returns a string starting with the cache prefix", () => {
    const key = buildCacheKey({ q: "nature", image_type: "photo" });
    expect(typeof key).toBe("string");
    expect(key.startsWith("spp2_pbcache_")).toBe(true);
  });

  it("produces the same key for identical params", () => {
    const a = buildCacheKey({ q: "flowers", image_type: "illustration", page: 2 });
    const b = buildCacheKey({ q: "flowers", image_type: "illustration", page: 2 });
    expect(a).toBe(b);
  });

  it("produces different keys for different queries", () => {
    const a = buildCacheKey({ q: "cat" });
    const b = buildCacheKey({ q: "dog" });
    expect(a).not.toBe(b);
  });

  it("produces different keys for different pages", () => {
    const a = buildCacheKey({ q: "sky", page: 1 });
    const b = buildCacheKey({ q: "sky", page: 2 });
    expect(a).not.toBe(b);
  });

  it("produces different keys for different image types", () => {
    const a = buildCacheKey({ q: "water", image_type: "photo" });
    const b = buildCacheKey({ q: "water", image_type: "vector" });
    expect(a).not.toBe(b);
  });
});

// ─── Cache round-trip ─────────────────────────────────────────────────────────

describe("getCachedSearch / saveCachedSearch", () => {
  beforeEach(() => localStorageMock.clear());

  it("returns null for a missing cache key", () => {
    expect(getCachedSearch("nonexistent_key")).toBeNull();
  });

  it("stores and retrieves a search result within TTL", () => {
    const key = buildCacheKey({ q: "sunset" });
    const data: PixabaySearchResult = {
      total: 1,
      totalHits: 1,
      page: 1,
      results: [normalizePixabayResult(makeHit())],
    };
    saveCachedSearch(key, data);
    const retrieved = getCachedSearch(key);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.total).toBe(1);
    expect(retrieved!.results[0].id).toBe("123456");
  });

  it("returns null for an expired cache entry", () => {
    const key = buildCacheKey({ q: "expired" });
    const data: PixabaySearchResult = { total: 1, totalHits: 1, page: 1, results: [] };

    const past = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    localStorageMock.setItem(key, JSON.stringify({ timestamp: past, data }));

    expect(getCachedSearch(key)).toBeNull();
    expect(localStorageMock.getItem(key)).toBeNull(); // expired entry removed
  });

  it("silently ignores malformed cache entries", () => {
    localStorageMock.setItem("spp2_pbcache_bad", "not-json-{{{");
    expect(() => getCachedSearch("spp2_pbcache_bad")).not.toThrow();
    expect(getCachedSearch("spp2_pbcache_bad")).toBeNull();
  });
});

// ─── searchPixabay ────────────────────────────────────────────────────────────

describe("searchPixabay", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws NO_API_KEY when apiKey is empty", async () => {
    await expect(searchPixabay({ q: "nature" }, "")).rejects.toThrow("NO_API_KEY");
  });

  it("returns cached result without calling fetch", async () => {
    const key = buildCacheKey({ q: "cached-query" });
    const cachedData: PixabaySearchResult = {
      total: 1,
      totalHits: 1,
      page: 1,
      results: [normalizePixabayResult(makeHit())],
    };
    saveCachedSearch(key, cachedData);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await searchPixabay({ q: "cached-query" }, "test-api-key");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.results[0].id).toBe("123456");
  });

  it("throws INVALID_KEY on 403 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 403 })
    );
    await expect(searchPixabay({ q: "nature" }, "bad-key")).rejects.toThrow("INVALID_KEY");
  });

  it("throws RATE_LIMIT on 429 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 429 })
    );
    await expect(searchPixabay({ q: "nature" }, "any-key")).rejects.toThrow("RATE_LIMIT");
  });

  it("throws NETWORK_ERROR when fetch rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(searchPixabay({ q: "nature" }, "any-key")).rejects.toThrow("NETWORK_ERROR");
  });

  it("normalises hits and caches result on success", async () => {
    const apiResponse = {
      total: 1,
      totalHits: 1,
      hits: [makeHit({ id: 999 })],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(apiResponse), { status: 200 })
    );

    const result = await searchPixabay({ q: "mountain" }, "valid-key");

    expect(result.total).toBe(1);
    expect(result.results[0].id).toBe("999");

    const key = buildCacheKey({ q: "mountain" });
    expect(getCachedSearch(key)).not.toBeNull();
  });
});

// ─── getPixabayErrorMessage ───────────────────────────────────────────────────

describe("getPixabayErrorMessage", () => {
  const cases: [string, string][] = [
    ["NO_API_KEY", "מפתח"],
    ["INVALID_KEY", "תקין"],
    ["RATE_LIMIT", "מגבלת"],
    ["BAD_REQUEST", "בקשה"],
    ["NETWORK_ERROR", "רשת"],
    ["HTTP_500", "שגיאה"],
  ];

  it.each(cases)("code %s returns a Hebrew message containing '%s'", (code, substr) => {
    const msg = getPixabayErrorMessage(code);
    expect(msg).toContain(substr);
  });
});

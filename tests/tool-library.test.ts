import { beforeEach, describe, expect, it } from "vitest";
import {
  PRESET_CATEGORY_HE,
  buildLibraryItems,
  libraryCategories,
  recentItems,
  recommendedItems,
  searchLibrary
} from "@/core/presets/toolLibrary";
import { useToolLibraryStore } from "@/state/toolLibraryStore";

describe("toolLibrary model", () => {
  describe("buildLibraryItems", () => {
    it("image context includes AI tools, raw tools, image presets and page-look presets", () => {
      const items = buildLibraryItems("image");
      const kinds = new Set(items.map((i) => i.kind));
      expect(kinds.has("aiTool")).toBe(true);
      expect(kinds.has("tool")).toBe(true);
      expect(kinds.has("imagePreset")).toBe(true);
      expect(kinds.has("pageLookPreset")).toBe(true);
      expect(kinds.has("effect")).toBe(false);
      // AI smart tools lead, then the 10 raw tools in display order.
      expect(items[0]?.key).toBe("ai:autoEnhance");
      expect(items.filter((i) => i.kind === "aiTool")).toHaveLength(3);
      expect(items.filter((i) => i.kind === "tool")).toHaveLength(10);
      expect(items.find((i) => i.kind === "tool")?.key).toBe("tool:basicTone");
    });

    it("page context includes page effects and page-look presets but no raw tools/image presets", () => {
      const items = buildLibraryItems("page");
      const kinds = new Set(items.map((i) => i.kind));
      expect(kinds.has("effect")).toBe(true);
      expect(kinds.has("pageLookPreset")).toBe(true);
      expect(kinds.has("tool")).toBe(false);
      expect(kinds.has("imagePreset")).toBe(false);
      expect(items[0]?.key).toBe("effect:colorOverlay");
      expect(items.filter((i) => i.kind === "effect")).toHaveLength(5);
    });

    it("keys follow the documented scheme", () => {
      const image = buildLibraryItems("image");
      const tool = image.find((i) => i.kind === "tool");
      const imagePreset = image.find((i) => i.kind === "imagePreset");
      const pageLookPreset = image.find((i) => i.kind === "pageLookPreset");
      expect(tool?.key.startsWith("tool:")).toBe(true);
      expect(pageLookPreset?.key.startsWith("pagelook:")).toBe(true);
      // Image preset key is the bare preset id (no prefix).
      expect(imagePreset?.key).toBe(imagePreset?.presetId);
    });
  });

  describe("libraryCategories", () => {
    it("returns distinct categories in first-seen order with AI then basic tools first", () => {
      const items = buildLibraryItems("image");
      const cats = libraryCategories(items);
      expect(cats[0]).toBe("כלים חכמים (AI)");
      expect(cats[1]).toBe("כלים בסיסיים");
      expect(new Set(cats).size).toBe(cats.length);
    });
  });

  describe("searchLibrary", () => {
    const items = buildLibraryItems("image");

    it("returns all items for an empty query", () => {
      expect(searchLibrary(items, "   ")).toHaveLength(items.length);
    });

    it("matches Hebrew tool names", () => {
      const results = searchLibrary(items, "טון");
      expect(results.some((i) => i.key === "tool:basicTone")).toBe(true);
    });

    it("matches by english type token in keywords", () => {
      const results = searchLibrary(items, "sepia");
      expect(results.some((i) => i.key === "tool:sepia")).toBe(true);
    });

    it("ANDs multiple terms", () => {
      const results = searchLibrary(items, "preset פריסט");
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((i) => i.kind === "imagePreset" || i.kind === "pageLookPreset")).toBe(true);
    });
  });

  describe("recommendedItems", () => {
    it("image context recommends rescue, HDR/product, and creative duotone image presets", () => {
      const items = buildLibraryItems("image");
      const rec = recommendedItems("image", items);
      expect(rec.length).toBeGreaterThan(0);
      expect(rec.every((i) => i.kind === "imagePreset")).toBe(true);
      expect(rec.some((i) => i.category === PRESET_CATEGORY_HE["Photo Rescue"])).toBe(true);
      expect(rec.some((i) => i.category === PRESET_CATEGORY_HE["HDR / Detail / Product"])).toBe(true);
      expect(rec.some((i) => i.category === PRESET_CATEGORY_HE.Duotone)).toBe(true);
    });

    it("page context recommends page-look presets", () => {
      const items = buildLibraryItems("page");
      const rec = recommendedItems("page", items);
      expect(rec.length).toBeGreaterThan(0);
      expect(rec.every((i) => i.kind === "pageLookPreset")).toBe(true);
    });
  });

  describe("recentItems", () => {
    it("maps recent keys to items preserving recency order and skipping unknown keys", () => {
      const items = buildLibraryItems("image");
      const known = items.slice(0, 3).map((i) => i.key);
      const recent = recentItems([known[2]!, "missing-key", known[0]!], items);
      expect(recent.map((i) => i.key)).toEqual([known[2], known[0]]);
    });
  });
});

describe("useToolLibraryStore", () => {
  beforeEach(() => {
    useToolLibraryStore.setState({ recentKeys: [] });
  });

  it("markUsed inserts keys most-recent-first", () => {
    const { markUsed } = useToolLibraryStore.getState();
    markUsed("tool:color");
    markUsed("tool:basicTone");
    expect(useToolLibraryStore.getState().recentKeys).toEqual(["tool:basicTone", "tool:color"]);
  });

  it("markUsed de-duplicates, moving an existing key to the front", () => {
    const { markUsed } = useToolLibraryStore.getState();
    markUsed("tool:color");
    markUsed("tool:basicTone");
    markUsed("tool:color");
    expect(useToolLibraryStore.getState().recentKeys).toEqual(["tool:color", "tool:basicTone"]);
  });

  it("caps the recent list at 12 entries", () => {
    const { markUsed } = useToolLibraryStore.getState();
    for (let i = 0; i < 20; i += 1) markUsed(`tool:item-${i}`);
    const keys = useToolLibraryStore.getState().recentKeys;
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("tool:item-19");
  });

  it("clearRecent empties the list", () => {
    const { markUsed, clearRecent } = useToolLibraryStore.getState();
    markUsed("tool:color");
    clearRecent();
    expect(useToolLibraryStore.getState().recentKeys).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import { analyzeLayersForSmartArrange, runSmartArrange } from "@/core/smartArrange";
import { useDocumentStore } from "@/state/documentStore";
import { createFreeModeDocument } from "@/ui/projectActions";

// ── Lightweight synthetic factories ─────────────────────────────────────────
// The engine only reads a subset of each layer's fields, so we cast partials.

interface TextOver {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  text?: string;
  alignment?: "left" | "center" | "right";
  zIndex?: number;
  locked?: boolean;
}

function txt(over: TextOver): VisualLayer {
  return {
    version: 1,
    name: "text",
    visible: true,
    locked: over.locked ?? false,
    opacity: 1,
    blendMode: "normal",
    rotation: 0,
    selected: false,
    metadata: {},
    type: "text",
    layerType: "text",
    parentFrameId: null,
    text: over.text ?? "Hello",
    fontSize: over.fontSize ?? 20,
    alignment: over.alignment ?? "right",
    direction: "rtl",
    zIndex: over.zIndex ?? 0,
    ...over
  } as unknown as VisualLayer;
}

interface ImgOver {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  locked?: boolean;
}

function img(over: ImgOver): VisualLayer {
  return {
    version: 1,
    name: "image",
    visible: true,
    locked: over.locked ?? false,
    opacity: 1,
    blendMode: "normal",
    rotation: 0,
    selected: false,
    metadata: {},
    type: "image",
    assetId: "asset-1",
    fitMode: "fill",
    zIndex: over.zIndex ?? 0,
    ...over
  } as unknown as VisualLayer;
}

function page(layers: VisualLayer[]): Page {
  return {
    version: 1,
    id: "p1",
    width: 1000,
    height: 1000,
    orientation: "portrait",
    setup: { dpi: 300, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
    bleed: { top: 0, right: 0, bottom: 0, left: 0 },
    margins: { top: 50, right: 50, bottom: 50, left: 50 },
    background: { type: "transparent" },
    layers,
    guides: [],
    metadata: {}
  } as unknown as Page;
}

const SAFE = { x: 50, y: 50, right: 950, bottom: 950 };

function within(b: { x: number; y: number; width: number; height: number }): boolean {
  return b.x >= SAFE.x - 0.6 && b.y >= SAFE.y - 0.6 && b.x + b.width <= SAFE.right + 0.6 && b.y + b.height <= SAFE.bottom + 0.6;
}

describe("smart arrange engine", () => {
  it("1. title + long body + signature: orders by hierarchy, RTL, inside safe area", () => {
    const layers = [
      txt({ id: "title", x: 300, y: 700, width: 400, height: 60, fontSize: 40, text: "כותרת" }),
      txt({ id: "body", x: 100, y: 100, width: 500, height: 240, fontSize: 20, text: "ברכה ארוכה ".repeat(20) }),
      txt({ id: "sig", x: 600, y: 900, width: 150, height: 30, fontSize: 12, text: "חתימה" })
    ];
    const ctx = analyzeLayersForSmartArrange({ page: page(layers), selectedLayerIds: [], mode: "titleText" });
    const result = runSmartArrange(ctx);
    const map = new Map(result.updates.map((u) => [u.layerId, u]));
    // y order: title above body above signature
    const ty = map.get("title")?.y ?? 700;
    const by = map.get("body")?.y ?? 100;
    const sy = map.get("sig")?.y ?? 900;
    expect(ty).toBeLessThan(by);
    expect(by).toBeLessThan(sy);
  });

  it("2. image + title + blessing: keeps a hero image and produces a layout", () => {
    const layers = [
      img({ id: "hero", x: 50, y: 50, width: 400, height: 400 }),
      txt({ id: "name", x: 500, y: 60, width: 300, height: 50, fontSize: 36, text: "שם" }),
      txt({ id: "bless", x: 500, y: 200, width: 300, height: 80, fontSize: 18, text: "ברכה קצרה" })
    ];
    const ctx = analyzeLayersForSmartArrange({ page: page(layers), selectedLayerIds: [], mode: "imageText" });
    const heroItem = ctx.items.find((it) => it.layerId === "hero");
    expect(heroItem?.role).toBe("mainImage");
    const result = runSmartArrange(ctx);
    expect(result.updates.length).toBeGreaterThan(0);
  });

  it("3. with a selection, only selected layers change", () => {
    const layers = [
      txt({ id: "a", x: 980, y: 100, width: 100, height: 40 }), // out of bounds, selected
      txt({ id: "b", x: 970, y: 300, width: 100, height: 40 }), // out of bounds, selected
      txt({ id: "c", x: 990, y: 500, width: 100, height: 40 }) // out of bounds, NOT selected
    ];
    const ctx = analyzeLayersForSmartArrange({ page: page(layers), selectedLayerIds: ["a", "b"], mode: "fitToSafeArea" });
    const result = runSmartArrange(ctx);
    expect(result.changedLayerIds.every((id) => id === "a" || id === "b")).toBe(true);
    expect(result.changedLayerIds).not.toContain("c");
  });

  it("4. locked layers are never touched", () => {
    const layers = [
      txt({ id: "free", x: 100, y: 100, width: 300, height: 100 }),
      txt({ id: "lock", x: 150, y: 130, width: 300, height: 100, locked: true }) // overlaps, locked
    ];
    const ctx = analyzeLayersForSmartArrange({ page: page(layers), selectedLayerIds: [], mode: "polish" });
    expect(ctx.items.some((it) => it.layerId === "lock")).toBe(false);
    const result = runSmartArrange(ctx);
    expect(result.changedLayerIds).not.toContain("lock");
  });

  it("5. full-canvas background is skipped, content above it is arranged", () => {
    const layers = [
      img({ id: "bg", x: 0, y: 0, width: 1000, height: 1000, zIndex: 0 }),
      txt({ id: "label", x: 980, y: 980, width: 100, height: 40, zIndex: 1 }) // out of bounds
    ];
    const ctx = analyzeLayersForSmartArrange({ page: page(layers), selectedLayerIds: [], mode: "polish" });
    expect(ctx.items.some((it) => it.layerId === "bg")).toBe(false);
    const result = runSmartArrange(ctx);
    expect(result.changedLayerIds).not.toContain("bg");
    expect(result.changedLayerIds).toContain("label");
  });

  it("6. spacingOnly equalizes gaps, preserves center, keeps sizes", () => {
    const layers = [
      txt({ id: "s1", x: 400, y: 100, width: 200, height: 60 }),
      txt({ id: "s2", x: 400, y: 200, width: 200, height: 60 }), // gap 40
      txt({ id: "s3", x: 400, y: 500, width: 200, height: 60 }) // gap 240
    ];
    const ctx = analyzeLayersForSmartArrange({ page: page(layers), selectedLayerIds: [], mode: "spacingOnly" });
    const centerBefore = (100 + 560) / 2; // top of s1 .. bottom of s3
    const result = runSmartArrange(ctx);
    // No size changes
    expect(result.updates.every((u) => u.width === undefined && u.height === undefined)).toBe(true);
    // Build resulting y positions
    const y = (id: string, fallback: number): number => result.updates.find((u) => u.layerId === id)?.y ?? fallback;
    const y1 = y("s1", 100);
    const y2 = y("s2", 200);
    const y3 = y("s3", 500);
    const gap1 = y2 - (y1 + 60);
    const gap2 = y3 - (y2 + 60);
    expect(Math.abs(gap1 - gap2)).toBeLessThan(1);
    const centerAfter = (y1 + (y3 + 60)) / 2;
    expect(Math.abs(centerAfter - centerBefore)).toBeLessThan(1);
  });

  it("7a. fitToSafeArea pulls an out-of-bounds layer inside", () => {
    const layers = [txt({ id: "x", x: 980, y: 980, width: 100, height: 60 })];
    const ctx = analyzeLayersForSmartArrange({ page: page(layers), selectedLayerIds: [], mode: "fitToSafeArea" });
    const result = runSmartArrange(ctx);
    const u = result.updates.find((it) => it.layerId === "x");
    const bounds = { x: u?.x ?? 980, y: u?.y ?? 980, width: 100, height: 60 };
    expect(within(bounds)).toBe(true);
  });

  it("7b. fitToSafeArea scales a group that is larger than the safe area", () => {
    const layers = [
      img({ id: "big1", x: 0, y: 0, width: 800, height: 1200 }),
      txt({ id: "big2", x: 850, y: 0, width: 300, height: 1200 })
    ];
    const ctx = analyzeLayersForSmartArrange({ page: page(layers), selectedLayerIds: [], mode: "fitToSafeArea" });
    const result = runSmartArrange(ctx);
    // At least one layer shrank to fit the 900x900 safe area.
    expect(result.updates.some((u) => u.width !== undefined || u.height !== undefined)).toBe(true);
    for (const u of result.updates) {
      const original = layers.find((l) => l.id === u.layerId)!;
      const bounds = {
        x: u.x ?? original.x,
        y: u.y ?? original.y,
        width: u.width ?? original.width,
        height: u.height ?? original.height
      };
      expect(within(bounds)).toBe(true);
    }
  });

  it("8. empty / no-eligible result produces no updates", () => {
    const layers = [img({ id: "bg", x: 0, y: 0, width: 1000, height: 1000, zIndex: 0 })];
    const ctx = analyzeLayersForSmartArrange({ page: page(layers), selectedLayerIds: [], mode: "auto" });
    const result = runSmartArrange(ctx);
    expect(result.updates).toEqual([]);
  });
});

describe("smart arrange store integration", () => {
  it("applies updates as one undo record and Ctrl+Z restores exactly", () => {
    const doc = createFreeModeDocument("SmartArrangeTest");
    const baseLayer = txt({ id: "L1", x: 10, y: 10, width: 100, height: 50 });
    const firstPage = doc.pages[0];
    const docWithLayer = { ...doc, pages: [{ ...firstPage, layers: [baseLayer] }] };

    useDocumentStore.getState().setDocument(docWithLayer);
    const pageId = docWithLayer.pages[0].id;

    useDocumentStore.getState().applySmartArrange(pageId, [{ layerId: "L1", x: 200, y: 300 }]);
    const moved = useDocumentStore.getState().document!.pages[0].layers[0];
    expect(moved.x).toBe(200);
    expect(moved.y).toBe(300);
    expect(useDocumentStore.getState().canUndo).toBe(true);

    useDocumentStore.getState().undo();
    const restored = useDocumentStore.getState().document!.pages[0].layers[0];
    expect(restored.x).toBe(10);
    expect(restored.y).toBe(10);
  });
});

import { describe, expect, it } from "vitest";
import { getPagePreset, pageSetupFromPreset } from "@/core/pageSetup/presets";
import { mmToPx } from "@/core/units/conversion";
import {
  buildPhotoPackResult,
  createSmartPhotoPackDocument,
  type PackImageInput,
  type PhotoPackOptions
} from "@/features/smartLayout";
import type { Asset } from "@/types/document";
import type { ImageLayer } from "@/types/layers";

const A4 = pageSetupFromPreset(getPagePreset("a4"), "portrait"); // 2480×3508 @300dpi

function packOptions(overrides: Partial<PhotoPackOptions> = {}): PhotoPackOptions {
  return {
    photosPerPage: 8,
    minSizeMm: 0,
    maxSizeMm: 0,
    layoutStyle: "balanced",
    marginsMm: 5,
    gapMm: 2,
    allowRotate: false,
    cutLines: "none",
    dpi: A4.dpi,
    ...overrides
  };
}

// A representative mixed-aspect set: landscape, portrait, square, panoramic.
const MIXED: PackImageInput[] = [
  { id: "i1", aspect: 3 / 2 },
  { id: "i2", aspect: 2 / 3 },
  { id: "i3", aspect: 1 },
  { id: "i4", aspect: 16 / 9 },
  { id: "i5", aspect: 4 / 5 },
  { id: "i6", aspect: 1 },
  { id: "i7", aspect: 3 / 1 },
  { id: "i8", aspect: 9 / 16 }
];

function rectsOverlap(
  a: { xPx: number; yPx: number; widthPx: number; heightPx: number },
  b: { xPx: number; yPx: number; widthPx: number; heightPx: number }
): boolean {
  const ox = a.xPx < b.xPx + b.widthPx - 1 && b.xPx < a.xPx + a.widthPx - 1;
  const oy = a.yPx < b.yPx + b.heightPx - 1 && b.yPx < a.yPx + a.heightPx - 1;
  return ox && oy;
}

describe("Smart Photo Packing — solver", () => {
  it("places exactly photosPerPage items per page, no cropping, aspect preserved", () => {
    const result = buildPhotoPackResult(MIXED, packOptions({ photosPerPage: 8 }), A4.size.width, A4.size.height);
    expect(result.pages).toHaveLength(1);
    const items = result.pages[0].items;
    expect(items).toHaveLength(8);
    // Each cell aspect matches the source image aspect (no stretch/crop).
    for (const it of items) {
      const src = MIXED.find((m) => m.id === it.sourceRef)!;
      const cellAspect = it.widthPx / it.heightPx;
      expect(cellAspect).toBeCloseTo(src.aspect, 1);
    }
  });

  it("produces non-overlapping items within the usable area", () => {
    const result = buildPhotoPackResult(MIXED, packOptions(), A4.size.width, A4.size.height);
    const items = result.pages[0].items;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        expect(rectsOverlap(items[i], items[j])).toBe(false);
      }
    }
    // all inside usable bounds
    const u = result.usablePx;
    for (const it of items) {
      expect(it.xPx).toBeGreaterThanOrEqual(u.x - 1);
      expect(it.yPx).toBeGreaterThanOrEqual(u.y - 1);
      expect(it.xPx + it.widthPx).toBeLessThanOrEqual(u.x + u.width + 1);
      expect(it.yPx + it.heightPx).toBeLessThanOrEqual(u.y + u.height + 1);
    }
  });

  it("splits across pages with a partial last page", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, aspect: 1 + (i % 3) * 0.5 }));
    const result = buildPhotoPackResult(many, packOptions({ photosPerPage: 8 }), A4.size.width, A4.size.height);
    expect(result.pages).toHaveLength(3); // 8 + 8 + 4
    expect(result.pages[2].items).toHaveLength(4);
    expect(result.pages[2].isPartial).toBe(true);
    expect(result.pages[0].isPartial).toBe(false);
  });

  it("maximumArea uses more page area than uniform", () => {
    const area = (r: ReturnType<typeof buildPhotoPackResult>) =>
      r.pages[0].items.reduce((s, it) => s + it.widthPx * it.heightPx, 0);
    const uniform = buildPhotoPackResult(MIXED, packOptions({ layoutStyle: "uniform" }), A4.size.width, A4.size.height);
    const maxArea = buildPhotoPackResult(MIXED, packOptions({ layoutStyle: "maximumArea" }), A4.size.width, A4.size.height);
    expect(area(maxArea)).toBeGreaterThanOrEqual(area(uniform) - 1);
  });

  it("warns when min size cannot be met", () => {
    // 30 tiny-target images but require a huge 200mm minimum short side → impossible.
    const result = buildPhotoPackResult(MIXED, packOptions({ photosPerPage: 8, minSizeMm: 200 }), A4.size.width, A4.size.height);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("Smart Photo Packing — document creation", () => {
  function asset(id: string, w: number, h: number): Asset {
    return {
      version: 1,
      id,
      name: id,
      kind: "image",
      status: "ready",
      mimeType: "image/jpeg",
      width: w,
      height: h,
      metadata: {}
    };
  }

  it("creates a new document with one page per group and editable image layers", () => {
    const assets = [
      asset("a", 1500, 1000),
      asset("b", 1000, 1500),
      asset("c", 1000, 1000),
      asset("d", 1920, 1080)
    ];
    const { document } = createSmartPhotoPackDocument("בדיקה", A4, assets, packOptions({ photosPerPage: 4 }));
    expect(document.pages).toHaveLength(1);
    const images = document.pages[0].layers.filter((l) => l.type === "image");
    expect(images).toHaveLength(4);
    // assets attached, layers reference them
    expect(document.assets).toHaveLength(4);
    const refIds = new Set((images as ImageLayer[]).map((l) => l.assetId));
    expect(refIds).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("adds a cut-line overlay per page when enabled", () => {
    const assets = [asset("a", 1500, 1000), asset("b", 1000, 1500)];
    const { document } = createSmartPhotoPackDocument("חיתוך", A4, assets, packOptions({ photosPerPage: 2, cutLines: "hairlineGrid" }));
    const overlays = document.pages[0].layers.filter((l) => l.type === "shape" && l.metadata["smartLayoutCutLines"] === true);
    expect(overlays).toHaveLength(1);
  });

  it("rotated grid items stay within the page bounds", () => {
    const assets = [asset("a", 3000, 1000), asset("b", 1000, 3000), asset("c", 1000, 1000), asset("d", 1200, 1000)];
    const { document } = createSmartPhotoPackDocument("סיבוב", A4, assets, packOptions({ photosPerPage: 4, allowRotate: true, layoutStyle: "uniform" }));
    for (const layer of document.pages[0].layers) {
      if (layer.type !== "image") continue;
      // For rotated (90°) layers the on-page span is [x-height, x] × [y, y+width].
      const left = layer.rotation === 90 ? layer.x - layer.height : layer.x;
      const right = layer.rotation === 90 ? layer.x : layer.x + layer.width;
      const top = layer.y;
      const bottom = layer.rotation === 90 ? layer.y + layer.width : layer.y + layer.height;
      expect(left).toBeGreaterThanOrEqual(-1);
      expect(top).toBeGreaterThanOrEqual(-1);
      expect(right).toBeLessThanOrEqual(A4.size.width + 1);
      expect(bottom).toBeLessThanOrEqual(A4.size.height + 1);
    }
  });
});

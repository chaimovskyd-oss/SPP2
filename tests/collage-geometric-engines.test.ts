import { describe, expect, it } from "vitest";
import { LAYOUT_REGISTRY, computeSlots } from "@/core/collage/collageLayoutEngine";
import { polygonArea } from "@/core/collage/collageGeometryUtils";
import type { CollageLayoutFamily, CollageLayoutParams, CollageSlot } from "@/types/collage";

const NEW_FAMILIES: CollageLayoutFamily[] = [
  "hexFlow",
  "diamondGrid",
  "interlocking",
  "ribbonFlow",
  "organicPolygon",
];

// A4-ish portrait and landscape at print resolution + a square page.
const PAGES = [
  { name: "portrait", w: 2480, h: 3508 },
  { name: "landscape", w: 3508, h: 2480 },
  { name: "square", w: 3000, h: 3000 },
];

function params(n: number, w: number, h: number): CollageLayoutParams {
  return { imageCount: n, canvasW: w, canvasH: h, spacingPx: 18, marginPx: 40 };
}

function imageSlots(slots: CollageSlot[]): CollageSlot[] {
  return slots.filter((s) => s.type === "image");
}

describe("geometric collage engines V1", () => {
  it("registers all five new families exactly once", () => {
    for (const family of NEW_FAMILIES) {
      expect(LAYOUT_REGISTRY.filter((d) => d.family === family)).toHaveLength(1);
    }
  });

  for (const family of NEW_FAMILIES) {
    const def = LAYOUT_REGISTRY.find((d) => d.family === family)!;

    describe(family, () => {
      for (const page of PAGES) {
        for (let n = def.minImages; n <= Math.min(def.maxImages, 24); n++) {
          it(`fills ${page.name} with exactly ${n} image cells`, () => {
            const slots = computeSlots(family, params(n, page.w, page.h));
            const images = imageSlots(slots);

            // Exactly one cell per image — no fallback to grid, no dropped cells.
            expect(images).toHaveLength(n);

            for (const slot of images) {
              // Inside the page.
              expect(slot.x).toBeGreaterThanOrEqual(-0.001);
              expect(slot.y).toBeGreaterThanOrEqual(-0.001);
              expect(slot.x + slot.w).toBeLessThanOrEqual(1.001);
              expect(slot.y + slot.h).toBeLessThanOrEqual(1.001);

              // No degenerate / needle cells.
              expect(slot.w).toBeGreaterThan(0.01);
              expect(slot.h).toBeGreaterThan(0.01);
              const aspect = Math.max(slot.w / slot.h, slot.h / slot.w);
              expect(aspect).toBeLessThan(9);

              // Polygon cells must enclose real area.
              if (slot.shapeParams.vertices && slot.shapeParams.vertices.length >= 3) {
                expect(polygonArea(slot.shapeParams.vertices)).toBeGreaterThan(0.02);
              }
            }
          });
        }
      }

      it("promotes a central cell to hero (for image-priority routing)", () => {
        const slots = imageSlots(computeSlots(family, params(Math.max(def.minImages, 5), 3000, 3000)));
        const heroes = slots.filter((s) => s.role === "hero");
        expect(heroes.length).toBe(1);
        // The hero must sit near the page centre.
        const hero = heroes[0]!;
        const cx = hero.x + hero.w / 2;
        const cy = hero.y + hero.h / 2;
        expect(Math.hypot(cx - 0.5, cy - 0.5)).toBeLessThan(0.3);
      });
    });
  }
});

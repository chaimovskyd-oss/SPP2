import { describe, expect, it } from "vitest";
import { createPage } from "@/core/document/factory";
import { createCollageRule, createCollageSlot } from "@/core/collage/collageFactory";
import { focalPointToContentTransform } from "@/core/collage/collageFaceDetect";
import { syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import { clampContentTransformToFillBounds, computeContentRect } from "@/core/rendering/frameFitEngine";
import type { FrameLayer } from "@/types/layers";

describe("Collage mode frame sync", () => {
  it("keeps managed collage frames pointer-interactive while locking their layout by behavior", () => {
    const page = createPage({
      setup: {
        size: { width: 1000, height: 800 },
        dpi: 300
      }
    });
    const slots = [
      createCollageSlot({ x: 0.05, y: 0.05, w: 0.4, h: 0.4 }),
      createCollageSlot({ x: 0.55, y: 0.05, w: 0.4, h: 0.4 })
    ];
    const rule = createCollageRule(page.id, "grid", slots, ["asset-a", "asset-b"]);

    const { page: syncedPage, frameIds } = syncFrameLayersToPage(page, rule, page.width, page.height);
    const frames = syncedPage.layers.filter(
      (layer): layer is FrameLayer => layer.type === "frame" && frameIds.includes(layer.id)
    );

    expect(frames).toHaveLength(2);
    expect(frames.every((frame) => frame.behaviorMode === "layoutLocked")).toBe(true);
    expect(frames.every((frame) => frame.locked === false)).toBe(true);
    expect(frames.every((frame) => frame.lockedContent === false)).toBe(true);
  });

  it("keeps smart-cropped content in fill-scale coordinates instead of double-scaling it", () => {
    const raw = focalPointToContentTransform(
      { x: 0.5, y: 0.2, confidence: "face" },
      1000,
      2000,
      900,
      300
    );
    const transform = clampContentTransformToFillBounds(
      { version: 1, ...raw, rotation: 0 },
      900,
      300,
      1000,
      2000,
      "fill",
      0
    );
    const rect = computeContentRect(900, 300, 1000, 2000, "fill", transform);

    expect(transform.scale).toBe(1);
    expect(rect.width).toBeGreaterThanOrEqual(900);
    expect(rect.height).toBeGreaterThanOrEqual(300);
    expect(rect.x).toBeLessThanOrEqual(0);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(900);
    expect(rect.y).toBeLessThanOrEqual(0);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(300);
  });

  it("keeps fill content covering the entire cell after pan or underscale attempts", () => {
    const transform = clampContentTransformToFillBounds(
      { version: 1, offsetX: 700, offsetY: -700, scale: 0.4, rotation: 0 },
      400,
      300,
      1200,
      600,
      "fill",
      0
    );
    const rect = computeContentRect(400, 300, 1200, 600, "fill", transform);

    expect(transform.scale).toBe(1);
    expect(rect.x).toBeLessThanOrEqual(0);
    expect(rect.y).toBeLessThanOrEqual(0);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(400);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(300);
  });
});

import { describe, expect, it } from "vitest";
import { createPage } from "@/core/document/factory";
import { createCollageRule, createCollageSlot } from "@/core/collage/collageFactory";
import { focalPointToContentTransform } from "@/core/collage/collageFaceDetect";
import { applyLayoutFamily, assignByPoolOrder, mergeLiveFrameEditsIntoCollageRule, syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import { clampContentTransformToFillBounds, computeContentRect } from "@/core/rendering/frameFitEngine";
import type { FrameLayer, ShapeLayer } from "@/types/layers";

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

  it("syncs separate collage margin and spacing colors behind managed frames", () => {
    const page = createPage({
      setup: {
        size: { width: 1000, height: 800 },
        dpi: 300
      }
    });
    const slots = [
      createCollageSlot({ x: 0.1, y: 0.1, w: 0.35, h: 0.8 }),
      createCollageSlot({ x: 0.55, y: 0.1, w: 0.35, h: 0.8 })
    ];
    const rule = {
      ...createCollageRule(page.id, "grid", slots, ["asset-a", "asset-b"], 8, 10),
      canvasSettings: {
        ...createCollageRule(page.id, "grid", slots, ["asset-a", "asset-b"], 8, 10).canvasSettings,
        spacingColor: "#ff00aa",
        marginColor: "#112233"
      }
    };

    const { page: syncedPage, frameIds } = syncFrameLayersToPage(page, rule, page.width, page.height);
    const background = syncedPage.layers.find(
      (layer): layer is ShapeLayer => layer.type === "shape" && (layer.metadata.collageBackground as { kind?: string } | undefined)?.kind === "spacing"
    );

    expect(syncedPage.background).toMatchObject({ type: "color", color: "#112233" });
    expect(background?.fill?.color).toBe("#ff00aa");
    expect(background?.locked).toBe(true);
    expect(background?.zIndex).toBeLessThan(Math.min(...syncedPage.layers.filter((layer) => frameIds.includes(layer.id)).map((layer) => layer.zIndex)));
  });

  it("matches landscape images to landscape slots and group photos to larger cells", () => {
    const largePortrait = createCollageSlot({ x: 0, y: 0, w: 0.45, h: 0.9, role: "hero" });
    const wide = createCollageSlot({ x: 0.5, y: 0, w: 0.5, h: 0.25 });
    const small = createCollageSlot({ x: 0.5, y: 0.3, w: 0.25, h: 0.25 });

    const assignments = assignByPoolOrder(
      ["landscape", "group", "square"],
      [largePortrait, wide, small],
      "rule",
      [],
      [],
      [
        { assetId: "landscape", width: 1800, height: 900 },
        { assetId: "group", width: 900, height: 1400, faceRegions: [{ cx: 0.4, cy: 0.4, w: 0.2, h: 0.2, confidence: 0.9 }, { cx: 0.6, cy: 0.4, w: 0.2, h: 0.2, confidence: 0.9 }] },
        { assetId: "square", width: 1000, height: 1000 },
      ]
    );

    expect(assignments.find((a) => a.slotId === wide.id)?.assetId).toBe("landscape");
    expect(assignments.find((a) => a.slotId === largePortrait.id)?.assetId).toBe("group");
  });

  it("keeps live frame image edits when rebuilding the collage layout", () => {
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
    const { page: syncedPage } = syncFrameLayersToPage(page, rule, page.width, page.height);
    const targetSlotId = rule.imageAssignments.find((assignment) => assignment.assetId === "asset-a")?.slotId;
    expect(targetSlotId).toBeTruthy();

    const editedPage = {
      ...syncedPage,
      layers: syncedPage.layers.map((layer) => {
        if (layer.type !== "frame") return layer;
        const meta = layer.metadata.collageFrame as { slotId?: string } | undefined;
        if (meta?.slotId !== targetSlotId) return layer;
        return {
          ...layer,
          contentTransform: { version: 1, offsetX: 12, offsetY: -8, scale: 1.35, rotation: 0 },
          metadata: {
            ...layer.metadata,
            imageEditParams: { temperature: 24, highlights: -12 },
            collageColorAdj: {
              brightness: 8,
              contrast: 6,
              saturation: -10,
              sharpness: 3,
              isBlackAndWhite: false,
              exposureEV: 0.2,
              vignette: 4
            }
          }
        };
      })
    };

    const liveRule = mergeLiveFrameEditsIntoCollageRule(rule, editedPage);
    const relaidRule = applyLayoutFamily(liveRule, "grid", page.width, page.height, 300);
    const editedAssignment = relaidRule.imageAssignments.find((assignment) => assignment.assetId === "asset-a");

    expect(editedAssignment?.imageEditParams).toMatchObject({ temperature: 24, highlights: -12 });
    expect(editedAssignment?.colorAdjustments).toMatchObject({ brightness: 8, contrast: 6, saturation: -10 });
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

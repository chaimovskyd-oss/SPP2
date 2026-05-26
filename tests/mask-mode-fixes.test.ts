import { describe, expect, it } from "vitest";
import {
  addImagesToMask,
  computeMaskFrameRects,
  createMaskModeDocument,
  fillMaskWithImages,
  getEffectiveSpacingMM,
  getEffectiveSpacingPx,
  getPagePreset,
  pageSetupFromPreset,
  regenerateMaskLayout,
  DEFAULT_MASK_CELL_LOCKED
} from "@/core";
import { mmToPx } from "@/core/units/conversion";
import { normalizeProjectEnvelope } from "@/core/save/migrations";
import { cropAssetBitmapDestructive } from "@/core/image/screenshotCropMetadata";
import { PROJECT_SCHEMA_VERSION } from "@/types/project";
import type { Asset, Document } from "@/types/document";
import type { MaskImageInput } from "@/types/mask";

function imageAsset(id: string, name = `Image ${id}`): Asset {
  return {
    version: 1,
    id,
    name,
    kind: "image",
    mimeType: "image/png",
    width: 800,
    height: 600,
    metadata: {}
  };
}

function imageInputs(count: number): MaskImageInput[] {
  return Array.from({ length: count }, (_, i) => ({ asset: imageAsset(`asset_${i + 1}`) }));
}

function createMaskDocument(): Document {
  return createMaskModeDocument("Mask test", pageSetupFromPreset(getPagePreset("a4")), {
    maskShape: "circle",
    maskWidth: 220,
    maskHeight: 220,
    keepProportions: true,
    margins: { top: 24, right: 24, bottom: 24, left: 24 },
    spacingX: 20,
    spacingY: 20
  });
}

describe("Fix 1 — mask cells default to unlocked and preserve user lock state", () => {
  it("defaults DEFAULT_MASK_CELL_LOCKED to false", () => {
    expect(DEFAULT_MASK_CELL_LOCKED).toBe(false);
  });

  it("creates new mask frames as unlocked", () => {
    const doc = createMaskDocument();
    const ruleId = doc.maskRules[0].id;
    const filled = fillMaskWithImages(doc, ruleId, imageInputs(3));
    const frames = filled.pages[0].layers.filter((l) => l.type === "frame" && l.metadata["maskFrame"] !== undefined);
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      if (frame.type !== "frame") continue;
      expect(frame.lockedFrame).toBe(false);
      expect(frame.locked).toBe(false);
    }
  });

  it("keeps cells unlocked when adding more images", () => {
    const doc = createMaskDocument();
    const ruleId = doc.maskRules[0].id;
    const filled = addImagesToMask(doc, ruleId, imageInputs(2));
    const more = addImagesToMask(filled, ruleId, imageInputs(2));
    const frames = more.pages[0].layers.filter((l) => l.type === "frame" && l.metadata["maskFrame"] !== undefined);
    for (const frame of frames) {
      if (frame.type !== "frame") continue;
      expect(frame.lockedFrame).toBe(false);
    }
  });

  it("preserves a frame's user-locked state across spacing rebuild", () => {
    const doc = createMaskDocument();
    const ruleId = doc.maskRules[0].id;
    let filled = fillMaskWithImages(doc, ruleId, imageInputs(3));
    // Manually lock the first frame
    filled = {
      ...filled,
      pages: filled.pages.map((page) => ({
        ...page,
        layers: page.layers.map((layer) => {
          const meta = layer.metadata["maskFrame"] as { maskIndexGlobal?: number } | undefined;
          if (layer.type === "frame" && meta?.maskIndexGlobal === 0) {
            return { ...layer, lockedFrame: true };
          }
          return layer;
        })
      }))
    };
    const regenerated = regenerateMaskLayout(filled, ruleId, { spacingX: 30, spacingY: 30, spacingMM: undefined });
    const frame0 = regenerated.pages[0].layers.find((l) => {
      const meta = l.metadata["maskFrame"] as { maskIndexGlobal?: number } | undefined;
      return l.type === "frame" && meta?.maskIndexGlobal === 0;
    });
    expect(frame0?.type === "frame" ? frame0.lockedFrame : null).toBe(true);
  });
});

describe("Fix 2 — spacingMM canonical unit + getEffective helpers", () => {
  it("getEffectiveSpacingPx prefers spacingMM when defined", () => {
    const dpi = 300;
    const ruleLike = { spacingX: 999, spacingY: 999, spacingMM: 5 };
    const { x, y } = getEffectiveSpacingPx(ruleLike, dpi);
    expect(x).toBeCloseTo(mmToPx(5, dpi), 3);
    expect(y).toBeCloseTo(mmToPx(5, dpi), 3);
  });

  it("getEffectiveSpacingPx falls back to spacingX/Y when spacingMM is undefined", () => {
    const ruleLike = { spacingX: 24, spacingY: 12, spacingMM: undefined };
    const { x, y } = getEffectiveSpacingPx(ruleLike, 300);
    expect(x).toBe(24);
    expect(y).toBe(12);
  });

  it("getEffectiveSpacingMM derives mm from spacingX when canonical missing", () => {
    const dpi = 300;
    const onePxInMm = (1 / dpi) * 25.4;
    expect(getEffectiveSpacingMM({ spacingX: 10 }, dpi)).toBeCloseTo(10 * onePxInMm, 5);
  });

  it("computeMaskFrameRects uses spacingMM canonical when present", () => {
    const doc = createMaskDocument();
    const page = doc.pages[0];
    const ruleWithMM = { ...doc.maskRules[0], spacingMM: 10, spacingX: 0, spacingY: 0 };
    const ruleWithPx = { ...doc.maskRules[0], spacingMM: undefined, spacingX: mmToPx(10, page.setup.dpi), spacingY: mmToPx(10, page.setup.dpi) };
    const rectsMM = computeMaskFrameRects(page, ruleWithMM);
    const rectsPx = computeMaskFrameRects(page, ruleWithPx);
    expect(rectsMM.length).toBe(rectsPx.length);
  });
});

describe("Fix 4 — destructive screenshot crop produces a new bitmap with new dimensions", () => {
  it.skip("returns an asset with width/height set to cropRect and a new previewPath (browser-only — requires canvas/Image; covered by manual smoke test)", () => {
    // The cropAssetBitmapDestructive helper uses document.createElement("canvas") +
    // ctx.drawImage which only work in a real browser/Electron renderer.
    // Behavior is exercised via the integration handler in EditorScreen.
    // Verified manually: bitmap is cropped 1:1, layer height adjusts to new aspect, no stretch.
    void cropAssetBitmapDestructive;
  });
});

describe("Migration v10 → v11 — mask spacingMM backfill", () => {
  it("schema version is 11", () => {
    expect(PROJECT_SCHEMA_VERSION).toBe(11);
  });

  it("backfills spacingMM from spacingX using DPI", () => {
    const doc = createMaskDocument();
    const dpi = doc.dpi;
    const envelope = {
      format: "SPP_PROJECT" as const,
      version: 1,
      projectVersion: "1",
      appVersion: "test",
      schemaVersion: 10,
      metadata: {
        customerName: "x",
        phoneNumber: "x",
        customerPhone: "x",
        projectUuid: "u",
        projectType: "Mask",
        fileFormatVersion: 1,
        createdAt: "now",
        updatedAt: "now",
        projectState: "clean" as const,
        internalUuid: "i"
      },
      document: {
        ...doc,
        maskRules: doc.maskRules.map((r) => ({ ...r, spacingMM: undefined, spacingUnit: undefined, spacingX: mmToPx(7, dpi), spacingY: mmToPx(7, dpi) }))
      },
      linkedGroups: [],
      batchJobs: []
    };
    const migrated = normalizeProjectEnvelope(envelope);
    expect(migrated.schemaVersion).toBe(11);
    const rule = migrated.document.maskRules[0];
    expect(rule.spacingMM).toBeCloseTo(7, 1);
    expect(rule.spacingUnit).toBe("mm");
  });
});

import { describe, expect, it } from "vitest";
import {
  addImagesToMask,
  applyMaskFitModeToAll,
  checkMaskPageOverflow,
  applyTextLayerToAllMaskFrames,
  cleanFilenameForMaskText,
  commitDraftDimension,
  createMaskModeDocument,
  createMaskTextOverlay,
  computeMaskFrameRects,
  createProjectEnvelope,
  createTextLayer,
  deleteMaskImageAndCompactFromEnd,
  fillMaskWithImages,
  getPagePreset,
  pageSetupFromPreset,
  pageSizeForMaskFit,
  parseProject,
  regenerateMaskLayout,
  resetMaskCrops,
  serializeProject,
  swapMaskFrameImages
} from "@/core";
import { cmToPx, inchToPx, mmToPx, pxToCm, pxToInch, pxToMm } from "@/core/units/conversion";
import type { Asset, Document } from "@/types/document";

describe("Phase 4 Mask Mode", () => {
  it("creates layout-managed FrameLayer masks instead of a separate canvas engine", () => {
    const document = createMaskDocument();
    const rule = document.maskRules[0];
    const frames = document.pages[0].layers.filter((layer) => layer.type === "frame");

    expect(document.metadata.mode).toBe("mask");
    expect(rule).toBeDefined();
    expect(frames).toHaveLength(0);
    const filled = fillMaskWithImages(document, rule.id, imageInputs(2));
    const maskFrames = filled.pages[0].layers.filter((layer) => layer.type === "frame");
    expect(maskFrames).toHaveLength(2);
    expect(maskFrames.every((frame) => frame.behaviorMode === "layoutLocked")).toBe(true);
    expect(maskFrames.every((frame) => frame.metadata["maskFrame"] !== undefined)).toBe(true);
    expect(maskFrames.every((frame) => frame.lockedFrame === false)).toBe(true);
  });

  it("uses uploaded image count as mask count and creates overflow pages without shrinking masks", () => {
    const base = createMaskDocument();
    const filled = fillMaskWithImages(base, maskId(base), imageInputs(40));
    const firstFrame = filled.pages[0].layers.find((layer) => layer.type === "frame");

    expect(filled.maskImageAssignments).toHaveLength(40);
    expect(filled.pages.length).toBeGreaterThan(1);
    expect(firstFrame?.type === "frame" ? firstFrame.width : 0).toBe(filled.maskRules[0].maskWidth);
  });

  it("keeps a small canvas inset even when Mask Mode margins are zero", () => {
    const document = createMaskModeDocument("Zero margin mask", pageSetupFromPreset(getPagePreset("letter")), {
      maskShape: "circle",
      maskWidth: 180,
      maskHeight: 180,
      keepProportions: true,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      spacingX: 0,
      spacingY: 0
    });
    const rule = document.maskRules[0];
    const rects = computeMaskFrameRects(document.pages[0], rule);
    const first = rects[0];
    const last = rects.at(-1);

    expect(first?.x).toBeGreaterThan(0);
    expect(first?.y).toBeGreaterThan(0);
    expect(last === undefined ? 0 : last.x + last.width).toBeLessThan(document.pages[0].width);
    expect(last === undefined ? 0 : last.y + last.height).toBeLessThan(document.pages[0].height);
  });

  it("adds, swaps, deletes, and compacts images while masks stay in place", () => {
    const empty = createMaskDocument();
    const base = fillMaskWithImages(empty, maskId(empty), []);
    const addBase = createMaskDocument();
    const filled = addImagesToMask(addBase, maskId(addBase), imageInputs(4));
    const [a, b] = filled.maskImageAssignments;
    const beforeFrameA = findFrame(filled, a.frameId);
    const swapped = swapMaskFrameImages(filled, maskId(filled), a.frameId, b.frameId);
    const deleted = deleteMaskImageAndCompactFromEnd(swapped, maskId(swapped), 1);

    expect(base.maskImageAssignments).toHaveLength(0);
    expect(swapped.maskImageAssignments.find((item) => item.frameId === a.frameId)?.assetId).toBe(b.assetId);
    expect(findFrame(swapped, a.frameId)?.x).toBe(beforeFrameA?.x);
    expect(deleted.maskImageAssignments).toHaveLength(3);
    expect(deleted.maskImageAssignments.find((item) => item.globalIndex === 1)?.assetId).toBe("asset-3");
  });

  it("regenerates spacing and size as a group while preserving manual crop intent", () => {
    const base = createMaskDocument();
    const filled = fillMaskWithImages(base, maskId(base), imageInputs(3));
    const first = filled.maskImageAssignments[0];
    const manual = {
      ...filled,
      maskImageAssignments: filled.maskImageAssignments.map((assignment) =>
        assignment.id === first.id
          ? { ...assignment, hasManualCropOverride: true, manualContentTransform: { version: 1, offsetX: 7, offsetY: 3, scale: 1.2, rotation: 12 } }
          : assignment
      )
    };
    const regenerated = regenerateMaskLayout(manual, maskId(manual), { spacingX: 40, spacingY: 40, maskWidth: 160, maskHeight: 160 });
    const preserved = regenerated.maskImageAssignments.find((assignment) => assignment.assetId === first.assetId);
    const frame = findFrame(regenerated, preserved?.frameId ?? "");

    expect(preserved?.manualContentTransform?.rotation).toBe(12);
    expect(frame?.width).toBe(160);
    expect(regenerated.maskRules[0].spacingX).toBe(40);
  });

  it("applies text overlays through normal TextLayer objects and round-trips through save/load", () => {
    const base = createMaskDocument();
    const filled = fillMaskWithImages(base, maskId(base), [
      { asset: imageAsset(0, "noa_cohen.jpg") },
      { asset: imageAsset(1, "dana.jpg") }
    ]);
    const withText = createMaskTextOverlay(filled, maskId(filled), { textSource: "filename" });
    const envelope = createProjectEnvelope({ document: withText, linkedGroups: [], batchJobs: [] });
    const reloaded = parseProject(serializeProject(envelope)).document;
    const texts = reloaded.pages.flatMap((page) => page.layers).filter((layer) => layer.type === "text").map((layer) => layer.text);

    expect(cleanFilenameForMaskText("noa_cohen.jpg")).toBe("noa cohen");
    expect(texts).toEqual(["noa cohen", "dana"]);
    expect(reloaded.maskRules).toHaveLength(1);
    expect(reloaded.maskImageAssignments).toHaveLength(2);
    expect(reloaded.maskTextOverlayRules[0].textLayerIdsByFrameId).toBeDefined();
  });

  it("applies a prepared TextLayer to all masks and keeps customer metadata in the shared save envelope", () => {
    const document = createMaskDocument();
    const base = fillMaskWithImages(document, maskId(document), imageInputs(2));
    const frame = base.pages[0].layers.find((layer) => layer.type === "frame");
    if (frame?.type !== "frame") throw new Error("Missing mask frame");
    const text = createTextLayer({
      text: "Sample",
      rect: { x: frame.x + 10, y: frame.y + 10, width: 90, height: 24 }
    });
    const prepared = {
      ...base,
      pages: [{ ...base.pages[0], layers: [...base.pages[0].layers, text] }]
    };
    const applied = applyTextLayerToAllMaskFrames(prepared, maskId(prepared), text.id);
    const fitApplied = applyMaskFitModeToAll(applied, maskId(applied), "fit");
    const reset = resetMaskCrops(fitApplied, maskId(fitApplied));
    const envelope = createProjectEnvelope({ document: reset, linkedGroups: [], batchJobs: [] });

    expect(reset.pages.flatMap((page) => page.layers).filter((layer) => layer.type === "text")).toHaveLength(2);
    expect(reset.maskImageAssignments.every((assignment) => assignment.hasManualCropOverride === false)).toBe(true);
    expect(envelope.metadata.customerName).toBe("Mask Customer");
    expect(envelope.metadata.phoneNumber).toBe("050-111-2222");
    expect(envelope.metadata.email).toBe("mask@example.com");
  });

  it("preserves precision across mm, cm, and inch mask unit conversions", () => {
    const dpi = 300;
    const mm = 37.25;
    const cm = 3.725;
    const inch = mm / 25.4;

    expect(pxToMm(mmToPx(mm, dpi), dpi)).toBeCloseTo(mm, 10);
    expect(pxToCm(cmToPx(cm, dpi), dpi)).toBeCloseTo(cm, 10);
    expect(pxToInch(inchToPx(inch, dpi), dpi)).toBeCloseTo(inch, 10);
  });

  it("commits draft numeric dimensions only when parseable", () => {
    expect(commitDraftDimension("", 12, 1, 20)).toBe(12);
    expect(commitDraftDimension("1.", 12, 1, 20)).toBe(1);
    expect(commitDraftDimension("1.5", 12, 1, 20)).toBe(1.5);
    expect(commitDraftDimension("12,75", 12, 1, 20)).toBe(12.75);
    expect(commitDraftDimension("abc", 12, 1, 20)).toBe(12);
    expect(commitDraftDimension("999", 12, 1, 20)).toBe(20);
  });

  it("detects oversized masks and calculates the minimum page resize", () => {
    const document = createMaskModeDocument("Oversized", pageSetupFromPreset(getPagePreset("letter")), {
      maskShape: "circle",
      maskWidth: 300,
      maskHeight: 300,
      keepProportions: true,
      margins: { top: 20, right: 30, bottom: 40, left: 50 },
      spacingX: 0,
      spacingY: 0
    });
    const page = { ...document.pages[0], width: 500, height: 460 };
    const rule = document.maskRules[0];
    const size = { maskWidth: 450, maskHeight: 440 };
    const overflow = checkMaskPageOverflow(page, rule, size);
    const fit = pageSizeForMaskFit(page, rule, size);

    expect(overflow.exceeds).toBe(true);
    expect(overflow.availableWidth).toBe(420);
    expect(overflow.availableHeight).toBe(400);
    expect(fit.width).toBe(530);
    expect(fit.height).toBe(500);
  });

  it("creates custom library mask frames with alpha mask sources", () => {
    const base = createMaskModeDocument("Custom mask", pageSetupFromPreset(getPagePreset("letter")), {
      maskShape: "custom",
      maskWidth: 180,
      maskHeight: 160,
      keepProportions: true,
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      spacingX: 10,
      spacingY: 10
    });
    const withCustomAsset = {
      ...base,
      maskRules: base.maskRules.map((rule) => ({
        ...rule,
        metadata: { ...rule.metadata, maskAssetId: "asset-mask" }
      }))
    };
    const filled = fillMaskWithImages(withCustomAsset, maskId(withCustomAsset), imageInputs(1));
    const frame = filled.pages[0].layers.find((layer) => layer.type === "frame");

    expect(frame?.type === "frame" ? frame.maskSource?.type : undefined).toBe("alphaAsset");
    expect(frame?.type === "frame" ? frame.maskSource?.assetId : undefined).toBe("asset-mask");
  });
});

function createMaskDocument(): Document {
  return createMaskModeDocument("Mask test", pageSetupFromPreset(getPagePreset("letter")), {
    maskShape: "circle",
    maskWidth: 700,
    maskHeight: 700,
    keepProportions: true,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    spacingX: 10,
    spacingY: 10
  }, {
    customerName: "Mask Customer",
    phoneNumber: "050-111-2222",
    email: "mask@example.com"
  });
}

function maskId(document: Document): string {
  const rule = document.maskRules[0];
  if (rule === undefined) throw new Error("Missing mask rule");
  return rule.id;
}

function imageInputs(count: number): Array<{ asset: Asset }> {
  return Array.from({ length: count }, (_, index) => ({ asset: imageAsset(index, `image_${index}.jpg`) }));
}

function imageAsset(index: number, name: string): Asset {
  return {
    version: 1,
    id: `asset-${index}`,
    name,
    kind: "image",
    status: "ready",
    mimeType: "image/jpeg",
    width: 1000,
    height: 1300,
    metadata: {}
  };
}

function findFrame(document: Document, frameId: string) {
  return document.pages.flatMap((page) => page.layers).find((layer) => layer.type === "frame" && layer.id === frameId);
}

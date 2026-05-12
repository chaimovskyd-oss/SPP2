import { describe, expect, it } from "vitest";
import {
  addImagesToGrid,
  applyGridFitModeToAll,
  applyTextLayerToAllGridCells,
  clampContentTransformToFillBounds,
  cleanFilenameForGridText,
  computeContentRect,
  createGridModeDocument,
  createTextLayer,
  createGridTextOverlay,
  deleteGridImageAndCompactFromEnd,
  fillGridWithImages,
  pageSetupFromPreset,
  parseProject,
  regenerateGrid,
  resetGridCrops,
  serializeProject,
  swapGridCellImages,
  updateGridTextOverlayRule,
  createProjectEnvelope,
  getPagePreset
} from "@/core";
import type { Asset, Document } from "@/types/document";

describe("Phase 3 Grid Mode", () => {
  it("creates a 3x2 grid with FrameLayer cells and persistent grid metadata", () => {
    const document = createGridDocument(3, 2);
    const rule = document.gridRules[0];
    const frames = document.pages[0].layers.filter((layer) => layer.type === "frame");

    expect(rule).toBeDefined();
    expect(frames).toHaveLength(6);
    expect(frames.every((frame) => frame.behaviorMode === "layoutLocked")).toBe(true);
    expect(frames.every((frame) => frame.metadata["gridCell"] !== undefined)).toBe(true);
  });

  it("fills more images than one page by creating one grid entity across pages", () => {
    const base = createGridDocument(3, 2);
    const document = fillGridWithImages(base, gridId(base), imageInputs(30));

    expect(document.gridRules).toHaveLength(1);
    expect(document.pages).toHaveLength(5);
    expect(document.gridImageAssignments).toHaveLength(30);
    expect(document.gridRules[0].pageIds).toHaveLength(5);
  });

  it("appends images to an existing grid without replacing previous assignments", () => {
    const base = createGridDocument(3, 2);
    const firstFill = addImagesToGrid(base, gridId(base), imageInputs(2));
    const appended = addImagesToGrid(firstFill, gridId(firstFill), [
      { asset: imageAsset(20, "append_20.jpg") },
      { asset: imageAsset(21, "append_21.jpg") }
    ]);

    expect(appended.gridImageAssignments.map((assignment) => assignment.assetId)).toEqual(["asset-0", "asset-1", "asset-20", "asset-21"]);
  });

  it("clamps fill panning so image content keeps covering the static cell", () => {
    const clamped = clampContentTransformToFillBounds(
      { version: 1, offsetX: 900, offsetY: -900, scale: 1, rotation: 0 },
      200,
      100,
      400,
      400,
      "fill"
    );
    const rect = computeContentRect(200, 100, 400, 400, "fill", clamped);

    expect(rect.x).toBeLessThanOrEqual(0);
    expect(rect.y).toBeLessThanOrEqual(0);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(200);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(100);
  });

  it("deletes an image and compacts from the last used grid slot", () => {
    const base = createGridDocument(3, 2);
    const filled = fillGridWithImages(base, gridId(base), imageInputs(30));
    const deleted = deleteGridImageAndCompactFromEnd(filled, gridId(filled), 1);
    const assignment = deleted.gridImageAssignments.find((item) => item.globalIndex === 1);

    expect(deleted.gridImageAssignments).toHaveLength(29);
    expect(assignment?.assetId).toBe("asset-29");
  });

  it("swaps images between cells without moving the frames", () => {
    const base = createGridDocument(3, 2);
    const filled = fillGridWithImages(base, gridId(base), imageInputs(6));
    const [a, b] = filled.gridImageAssignments;
    const beforeFrameA = findFrame(filled, a.frameId);
    const swapped = swapGridCellImages(filled, gridId(filled), a.frameId, b.frameId);

    expect(swapped.gridImageAssignments.find((item) => item.frameId === a.frameId)?.assetId).toBe(b.assetId);
    expect(findFrame(swapped, a.frameId)?.x).toBe(beforeFrameA?.x);
    expect(findFrame(swapped, a.frameId)?.y).toBe(beforeFrameA?.y);
  });

  it("preserves manual rotation and crop intent across regenerate", () => {
    const base = createGridDocument(3, 2);
    const filled = fillGridWithImages(base, gridId(base), imageInputs(6));
    const first = filled.gridImageAssignments[0];
    const withManual = {
      ...filled,
      gridImageAssignments: filled.gridImageAssignments.map((assignment) =>
        assignment.id === first.id
          ? {
              ...assignment,
              hasManualCropOverride: true,
              hasManualRotationOverride: true,
              manualContentTransform: { version: 1, offsetX: 8, offsetY: -4, scale: 1.2, rotation: 90 }
            }
          : assignment
      )
    };
    const regenerated = regenerateGrid(withManual, gridId(withManual), { spacingX: 40, spacingY: 40 });
    const preserved = regenerated.gridImageAssignments.find((assignment) => assignment.assetId === first.assetId);

    expect(preserved?.manualContentTransform?.rotation).toBe(90);
    expect(preserved?.manualContentTransform?.offsetX).toBe(8);
  });

  it("applies fit mode without resetting manual crop, then resets crops explicitly", () => {
    const base = createGridDocument(3, 2);
    const filled = fillGridWithImages(base, gridId(base), imageInputs(6));
    const manual = {
      ...filled,
      gridImageAssignments: filled.gridImageAssignments.map((assignment, index) =>
        index === 0 ? { ...assignment, hasManualCropOverride: true, manualContentTransform: { version: 1, offsetX: 4, offsetY: 4, scale: 1.1, rotation: 0 } } : assignment
      )
    };
    const fitApplied = applyGridFitModeToAll(manual, gridId(manual), "fit");
    const reset = resetGridCrops(fitApplied, gridId(fitApplied));

    expect(fitApplied.gridImageAssignments[0].hasManualCropOverride).toBe(true);
    expect(reset.gridImageAssignments.every((assignment) => assignment.hasManualCropOverride === false)).toBe(true);
  });

  it("creates filename text overlays with Hebrew-safe filename cleaning", () => {
    const base = createGridDocument(1, 2);
    const filled = fillGridWithImages(base, gridId(base), [
      { asset: imageAsset(0, "יותם.jpeg") },
      { asset: imageAsset(1, "נועה_כהן.jpeg") }
    ]);
    const withText = createGridTextOverlay(filled, gridId(filled), { textSource: "filename" });
    const texts = withText.pages.flatMap((page) => page.layers).filter((layer) => layer.type === "text").map((layer) => layer.text);

    expect(cleanFilenameForGridText("נועה_כהן.jpeg")).toBe("נועה כהן");
    expect(texts).toEqual(["יותם", "נועה כהן"]);
  });

  it("applies one prepared text layer to every grid cell through the shared text layer engine", () => {
    const base = createGridDocument(1, 2);
    const frame = base.pages[0].layers.find((layer) => layer.type === "frame");
    if (frame?.type !== "frame") throw new Error("Missing frame");
    const text = createTextLayer({
      text: "שם",
      rect: { x: frame.x + 12, y: frame.y + 16, width: 80, height: 24 },
    });
    const styledText = { ...text, fontSize: 18, color: "#222222" };
    const prepared = {
      ...base,
      pages: [{ ...base.pages[0], layers: [...base.pages[0].layers, styledText] }]
    };
    const applied = applyTextLayerToAllGridCells(prepared, gridId(prepared), text.id);
    const textLayers = applied.pages.flatMap((page) => page.layers).filter((layer) => layer.type === "text");

    expect(textLayers).toHaveLength(2);
    expect(textLayers.every((layer) => layer.text === "שם")).toBe(true);
    expect(textLayers.every((layer) => layer.metadata["gridText"] !== undefined)).toBe(true);
  });

  it("round-trips grid rules, assignments, and overlay links through save/load", () => {
    const base = createGridDocument(2, 2);
    const filled = fillGridWithImages(base, gridId(base), imageInputs(5));
    const withText = createGridTextOverlay(filled, gridId(filled), { textSource: "index" });
    const envelope = createProjectEnvelope({ document: withText, linkedGroups: [], batchJobs: [] });
    const reloaded = parseProject(serializeProject(envelope)).document;

    expect(reloaded.gridRules).toHaveLength(1);
    expect(reloaded.gridImageAssignments).toHaveLength(5);
    expect(reloaded.gridTextOverlayRules[0].textLayerIdsByFrameId).toBeDefined();
  });

  it("updates overlay style for all grid texts without overwriting edited cell text", () => {
    const base = createGridDocument(1, 2);
    const filled = fillGridWithImages(base, gridId(base), imageInputs(2));
    const withText = createGridTextOverlay(filled, gridId(filled), { textSource: "index" });
    const overlay = withText.gridTextOverlayRules[0];
    const firstTextId = Object.values(overlay.textLayerIdsByFrameId)[0];
    const edited = {
      ...withText,
      pages: withText.pages.map((page) => ({
        ...page,
        layers: page.layers.map((layer) => layer.id === firstTextId && layer.type === "text" ? { ...layer, text: "ידני" } : layer)
      }))
    };
    const updated = updateGridTextOverlayRule(edited, overlay.id, { textStyle: { color: "#ff0000", fontWeight: 900 } }, { applyStyle: true });
    const textLayers = updated.pages.flatMap((page) => page.layers).filter((layer) => layer.type === "text");

    expect(textLayers.find((layer) => layer.id === firstTextId)?.text).toBe("ידני");
    expect(textLayers.every((layer) => layer.color === "#ff0000")).toBe(true);
  });

  it("auto-rotates imported images to match cell orientation when policy is enabled", () => {
    const base = createGridDocument(1, 1);
    const rule = { ...base.gridRules[0], autoRotatePolicy: "rotateToCellOrientation" as const };
    const prepared = { ...base, gridRules: [rule] };
    const filled = fillGridWithImages(prepared, rule.id, [{ asset: imageAsset(0, "landscape.jpg") }]);
    const frame = filled.pages[0].layers.find((layer) => layer.type === "frame");

    expect(frame?.type === "frame" ? frame.contentTransform.rotation : 0).toBe(90);
  });
});

function createGridDocument(rows: number, columns: number): Document {
  return createGridModeDocument("Grid test", pageSetupFromPreset(getPagePreset("letter")), {
    rows,
    columns,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    spacingX: 10,
    spacingY: 10,
    fillDirection: "ltr"
  });
}

function gridId(document: Document): string {
  const rule = document.gridRules[0];
  if (rule === undefined) throw new Error("Missing grid rule");
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
    width: index % 2 === 0 ? 1200 : 800,
    height: index % 2 === 0 ? 800 : 1200,
    metadata: {}
  };
}

function findFrame(document: Document, frameId: string) {
  return document.pages.flatMap((page) => page.layers).find((layer) => layer.type === "frame" && layer.id === frameId);
}

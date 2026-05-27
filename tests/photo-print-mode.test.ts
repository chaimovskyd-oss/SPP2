import { describe, expect, it } from "vitest";
import {
  computeBestGridForCount,
  createPhotoPrintModeDocument,
  regeneratePhotoPrint
} from "@/core/photoPrint/photoPrintModeEngine";
import { getPagePreset, pageSetupFromPreset } from "@/core";
import type { Asset } from "@/types/document";

describe("Photo Print Mode", () => {
  it("does not recurse forever when grid inputs cannot produce a valid slot", () => {
    expect(computeBestGridForCount(0, 0, 0, 0)).toEqual({ rows: 1, cols: 1 });
    expect(computeBestGridForCount(-100, 200, 0, 4, "portrait")).toEqual({ rows: 1, cols: 4 });
    expect(computeBestGridForCount(100, 100, 1_000, 9, "landscape")).toEqual({ rows: 1, cols: 9 });
  });

  it("keeps photo-print pages and slots stable enough for second-page content edits", () => {
    const setup = pageSetupFromPreset(getPagePreset("photo_10x15"));
    const document = createPhotoPrintModeDocument(
      "Photo print regression",
      setup,
      imageInputs(5),
      {
        printWidthMm: 100,
        printHeightMm: 150,
        targetsPerPage: 2,
        globalCopies: 1,
        fitMode: "fill"
      }
    );

    expect(document.pages).toHaveLength(3);
    expect(document.pages[1]?.layers.filter((layer) => layer.type === "frame")).toHaveLength(2);

    const secondPageFrame = document.pages[1]?.layers.find((layer) => layer.type === "frame");
    expect(secondPageFrame).toBeDefined();
    const secondPageAssignment = document.photoPrintImageAssignments.find((assignment) => assignment.frameId === secondPageFrame?.id);
    expect(secondPageAssignment).toBeDefined();

    const edited = {
      ...document,
      pages: document.pages.map((page) => page.id === document.pages[1]?.id
        ? {
            ...page,
            layers: page.layers.map((layer) => layer.id === secondPageFrame?.id && layer.type === "frame"
              ? {
                  ...layer,
                  contentTransform: {
                    ...layer.contentTransform,
                    offsetX: 12,
                    offsetY: -8
                  }
                }
              : layer)
          }
        : page),
      photoPrintImageAssignments: document.photoPrintImageAssignments.map((assignment) => assignment.frameId === secondPageFrame?.id
        ? {
            ...assignment,
            manualContentTransform: {
              version: 1,
              offsetX: 12,
              offsetY: -8,
              scale: 1,
              rotation: 0
            },
            hasManualCropOverride: true
          }
        : assignment)
    };

    const regenerated = regeneratePhotoPrint(edited, document.photoPrintRules[0]!.id, { frameBorderMm: 4 });
    const matching = regenerated.photoPrintImageAssignments.find((assignment) => assignment.globalIndex === secondPageAssignment?.globalIndex);
    expect(matching?.pageIndex).toBe(1);
    expect(matching?.manualContentTransform?.offsetX).toBe(12);
    expect(matching?.manualContentTransform?.offsetY).toBe(-8);
  });

  it("preserves image adjustment params and visual effects across regenerate", () => {
    const setup = pageSetupFromPreset(getPagePreset("photo_10x15"));
    const visualEffects = {
      version: 1 as const,
      enabled: true,
      effects: [{ version: 1 as const, id: "fx-photo-shadow", enabled: true, params: { type: "dropShadow" as const, color: "#000000", blur: 6, offsetX: 0, offsetY: 2, opacity: 0.35, spread: 0 } }]
    };
    const document = createPhotoPrintModeDocument(
      "Photo print image edits",
      setup,
      [{ ...imageInputs(1)[0], imageEditParams: { saturation: 0.5, hue: 1.3 }, visualEffects }],
      {
        printWidthMm: 100,
        printHeightMm: 150,
        targetsPerPage: 1,
        globalCopies: 1,
        fitMode: "fill"
      }
    );

    const regenerated = regeneratePhotoPrint(document, document.photoPrintRules[0]!.id, { frameBorderMm: 4 });
    const assignment = regenerated.photoPrintImageAssignments[0];
    const frame = regenerated.pages.flatMap((page) => page.layers).find((layer) => layer.type === "frame" && layer.id === assignment?.frameId);

    expect(assignment?.imageEditParams).toMatchObject({ saturation: 0.5, hue: 1.3 });
    expect(frame?.type === "frame" ? frame.metadata.imageEditParams : undefined).toMatchObject({ saturation: 0.5, hue: 1.3 });
    expect(frame?.type === "frame" ? frame.visualEffects?.effects.some((effect) => effect.id === "fx-photo-shadow") : false).toBe(true);
    expect(frame?.type === "frame" ? frame.visualEffects?.effects.some((effect) => effect.params.type === "stroke") : false).toBe(true);
  });
});

function imageInputs(count: number): Array<{ asset: Asset }> {
  return Array.from({ length: count }, (_, index) => ({
    asset: {
      version: 1,
      id: `asset-${index}`,
      name: `image-${index}.jpg`,
      kind: "image",
      originalPath: `memory://image-${index}.jpg`,
      width: index % 2 === 0 ? 1200 : 900,
      height: index % 2 === 0 ? 900 : 1200,
      mimeType: "image/jpeg",
      createdAt: "2026-05-21T00:00:00.000Z",
      metadata: {}
    }
  }));
}

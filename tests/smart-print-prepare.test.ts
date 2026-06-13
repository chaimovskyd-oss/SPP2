import { describe, expect, it } from "vitest";
import { analyzeEffectiveDpi, buildBatchReport, computeTargetCrop, groupFaceBoxes, orientedTargetAspectRatio } from "@/core/smartPrintPrepare";
import type { PrepareFaceBox, PrepareResult } from "@/core/smartPrintPrepare";

function face(x: number, y: number, width: number, height: number, score = 0.9): PrepareFaceBox {
  return { x, y, width, height, score };
}

describe("Smart Print Prepare geometry", () => {
  it("groups all detected faces into one bounding box", () => {
    expect(groupFaceBoxes([face(100, 120, 80, 90), face(260, 110, 70, 95)])).toEqual({
      x: 100,
      y: 110,
      width: 230,
      height: 100
    });
  });

  it("computes a face-aware target crop that contains the full protected face group", () => {
    const result = computeTargetCrop(3000, 2000, 1, [
      face(850, 560, 240, 280),
      face(1780, 520, 250, 300)
    ]);
    expect(result.safe).toBe(true);
    expect(result.source).toBe("faces");
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.rect.width).toBe(result.rect.height);
    expect(result.rect.x).toBeLessThanOrEqual(850);
    expect(result.rect.x + result.rect.width).toBeGreaterThanOrEqual(2030);
  });

  it("centers a single detected face inside the target crop when there is room", () => {
    const result = computeTargetCrop(3000, 2000, 1, [face(1120, 620, 240, 280)]);
    const faceCenterInCrop = 1120 + 120 - result.rect.x;
    expect(result.safe).toBe(true);
    expect(result.source).toBe("faces");
    expect(faceCenterInCrop / result.rect.width).toBeGreaterThan(0.45);
    expect(faceCenterInCrop / result.rect.width).toBeLessThan(0.55);
  });

  it("marks target crop unsafe when the requested ratio cannot contain the face group", () => {
    const result = computeTargetCrop(1000, 1000, 0.35, [
      face(40, 220, 180, 240),
      face(760, 220, 180, 240)
    ]);
    expect(result.safe).toBe(false);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("orients common print sizes to the source image direction", () => {
    const target = { enabled: true, width: 100, height: 150, unit: "mm" as const, dpi: 300 };
    expect(orientedTargetAspectRatio(target, 3000, 2000)).toBeCloseTo(1.5);
    expect(orientedTargetAspectRatio(target, 2000, 3000)).toBeCloseTo(100 / 150);
  });

  it("uses a detected content box before falling back to a blind center crop", () => {
    const result = computeTargetCrop(1400, 1000, 1.5, [], { x: 130, y: 120, width: 1120, height: 560 });
    expect(result.safe).toBe(true);
    expect(result.source).toBe("content");
    expect(result.rect.width / result.rect.height).toBeCloseTo(1.5, 1);
    expect(result.rect.x).toBeLessThanOrEqual(130);
    expect(result.rect.x + result.rect.width).toBeGreaterThanOrEqual(1250);
  });

  it("uses a content focus point to position the crop around the likely subject", () => {
    const result = computeTargetCrop(
      1800,
      1200,
      2 / 3,
      [],
      { x: 0, y: 0, width: 1800, height: 1200 },
      { x: 500, y: 610, confidence: 0.7 }
    );
    const focusXInCrop = 500 - result.rect.x;
    expect(result.safe).toBe(true);
    expect(result.source).toBe("content");
    expect(focusXInCrop / result.rect.width).toBeGreaterThan(0.43);
    expect(focusXInCrop / result.rect.width).toBeLessThan(0.57);
  });
});

describe("Smart Print Prepare print quality", () => {
  it("grades effective DPI by target print size", () => {
    const target = { enabled: true, width: 100, height: 150, unit: "mm" as const, dpi: 300 };
    expect(analyzeEffectiveDpi(1200, 1800, target).tier).toBe("ok");
    expect(analyzeEffectiveDpi(750, 1125, target).tier).toBe("soft_warning");
    expect(analyzeEffectiveDpi(550, 825, target).tier).toBe("strong_warning");
    expect(analyzeEffectiveDpi(300, 450, target).tier).toBe("manual_review");
  });
});

describe("Smart Print Prepare report", () => {
  it("summarizes recipe actions and manual review warnings", () => {
    const base = {
      id: "r1",
      fileName: "a.jpg",
      sourceUrl: "blob:a",
      analysis: {
        width: 1000,
        height: 1500,
        aspectRatio: 2 / 3,
        faces: { boxes: [], backend: "none", groupBox: null },
        colorIssues: [],
        quality: { tier: "ok", message: "ok" }
      },
      recommendedOperations: [],
      recipe: { technicalAdjustments: [], technicalTemplates: [] },
      warnings: [],
      confidence: 1,
      approved: true,
      keepOriginal: false
    } satisfies PrepareResult;
    const report = buildBatchReport([
      {
        ...base,
        recipe: {
          ...base.recipe,
          screenshotCrop: { enabled: true, rect: { x: 0, y: 20, width: 1000, height: 1400 }, confidence: 0.95 },
          targetCrop: { enabled: true, rect: { x: 0, y: 0, width: 1000, height: 1000 }, confidence: 0.92, source: "center" }
        }
      },
      {
        ...base,
        id: "r2",
        fileName: "b.jpg",
        warnings: [{ type: "manual_review_required", message: "review" }]
      }
    ]);
    expect(report.summary.screenshotsCleaned).toBe(1);
    expect(report.summary.croppedToTarget).toBe(1);
    expect(report.summary.manualReviewRequired).toBe(1);
  });
});

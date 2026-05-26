import { describe, expect, it } from "vitest";
import { createFrameLayer } from "@/core/layers/factory";
import {
  getHeadHeightPercentRange,
  isPassportPrintPreset,
  PASSPORT_REQUIREMENTS,
  resolvePassportRequirementForRule,
  resolvePassportSizeForRule
} from "@/core/passport/passportRequirements";
import {
  aggregatePassportValidations,
  autoCropPassportTransform,
  validatePassportFrame,
  type PassportValidationResult
} from "@/core/passport/passportValidationService";
import { PRINT_SIZE_PRESETS, type PhotoPrintRule } from "@/types/photoPrint";
import type { Asset } from "@/types/document";
import type { PassportDetectionResult } from "@/core/passport/passportDetectionService";

function rule(patch: Partial<PhotoPrintRule> = {}): PhotoPrintRule {
  return {
    version: 1,
    id: "pp_1",
    name: "Photo print",
    pageIds: ["page_1"],
    frameIds: ["frame_1"],
    printWidthMm: 35,
    printHeightMm: 45,
    frameBorderEnabled: false,
    frameBorderMm: 0,
    frameBorderColor: "#fff",
    cutLineEnabled: false,
    cutLineWidthPx: 1,
    cutLineColor: "#000",
    fitMode: "fill",
    autoRotatePolicy: "rotateToSlotOrientation",
    autoRotateOnSheet: true,
    sheetMarginsMm: 0,
    gapBetweenPrintsMm: 0,
    slotsPerRow: 1,
    slotsPerColumn: 1,
    slotsRotatedOnSheet: false,
    targetsPerPage: 0,
    orientationPolicy: "auto",
    faceDetectionEnabled: false,
    globalCopies: 1,
    perImageCopies: {},
    smartFillEnabled: false,
    metadata: {},
    ...patch
  };
}

const asset: Asset = {
  version: 1,
  id: "asset_1",
  name: "person.jpg",
  kind: "image",
  status: "ready",
  originalPath: "person.jpg",
  previewPath: "person-preview.jpg",
  thumbnailPath: "person-thumb.jpg",
  mimeType: "image/jpeg",
  width: 1200,
  height: 1600,
  metadata: {}
};

const detection: PassportDetectionResult = {
  status: "ok",
  cacheKey: "cache",
  imageWidth: 1200,
  imageHeight: 1600,
  faces: [{
    boundingBox: { x: 0.38, y: 0.18, width: 0.25, height: 0.52 },
    center: { x: 0.505, y: 0.44 },
    leftEye: { x: 0.44, y: 0.4 },
    rightEye: { x: 0.57, y: 0.405 },
    chin: { x: 0.5, y: 0.72 },
    headTop: { x: 0.5, y: 0.16 },
    tiltDegrees: 2,
    confidence: 0.9
  }],
  background: {
    light: true,
    whiteOrOffWhite: true,
    uneven: false,
    colorCast: false,
    strongShadow: false,
    averageLuma: 232
  }
};

describe("passport assistant requirements", () => {
  it("keeps Israeli biometric multi-size support", () => {
    expect(PASSPORT_REQUIREMENTS.israelBiometric.supportedSizes).toEqual([{ width: 35, height: 45 }, { width: 50, height: 50 }]);
    expect(resolvePassportSizeForRule(rule({ passportRequirementId: "israelBiometric", passportSizeMm: { width: 50, height: 50 } }), PASSPORT_REQUIREMENTS.israelBiometric)).toEqual({ width: 50, height: 50 });
  });

  it("maps dedicated and legacy passport presets without regular photo leakage", () => {
    expect(isPassportPrintPreset(PRINT_SIZE_PRESETS.find((preset) => preset.id === "us_visa"))).toBe(true);
    expect(resolvePassportRequirementForRule(rule({ metadata: { printPresetId: "passport_us" } }))?.id).toBe("usPassport");
    expect(resolvePassportRequirementForRule(rule({ metadata: { printPresetId: "10x15" } }))).toBeNull();
  });

  it("derives head percent ranges from mm rules", () => {
    expect(getHeadHeightPercentRange(PASSPORT_REQUIREMENTS.ukPassport, { width: 35, height: 45 })).toEqual({
      min: 64.44444444444444,
      max: 75.55555555555556
    });
  });
});

describe("passport assistant validation and transforms", () => {
  it("aggregates advisory statuses by worst result", () => {
    const base: PassportValidationResult = { status: "ok", checks: [], issues: [], detectionStatus: "ok" };
    expect(aggregatePassportValidations([base, { ...base, status: "review" }])).toBe("review");
    expect(aggregatePassportValidations([base, { ...base, status: "notRecommended" }])).toBe("notRecommended");
  });

  it("validates a clean single-face image as advisory ok or review, never blocking", () => {
    const frame = createFrameLayer({ rect: { x: 0, y: 0, width: 350, height: 450 }, imageAssetId: asset.id, contentType: "image", fitMode: "fill" });
    const result = validatePassportFrame({ frame, asset, detection, requirement: PASSPORT_REQUIREMENTS.usPassport, size: { width: 51, height: 51 } });
    expect(result.checks.some((check) => check.id === "faceDetected" && check.status === "ok")).toBe(true);
    expect(["ok", "review", "notRecommended"]).toContain(result.status);
  });

  it("auto crop changes only content transform values", () => {
    const frame = createFrameLayer({ rect: { x: 10, y: 20, width: 350, height: 450 }, imageAssetId: asset.id, contentType: "image", fitMode: "fill" });
    const next = autoCropPassportTransform({ frame, face: detection.faces[0]!, imageWidth: 1200, imageHeight: 1600, requirement: PASSPORT_REQUIREMENTS.usPassport, size: { width: 51, height: 51 } });
    expect(next.version).toBe(frame.contentTransform.version);
    expect(Number.isFinite(next.scale)).toBe(true);
    expect(Number.isFinite(next.offsetX)).toBe(true);
    expect(Number.isFinite(next.offsetY)).toBe(true);
  });
});

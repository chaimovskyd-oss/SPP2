import { clampContentTransformToFillBounds, computeContentRect } from "@/core/rendering/frameFitEngine";
import type { Asset } from "@/types/document";
import type { ContentTransform, FrameLayer } from "@/types/layers";
import type { FitMode } from "@/types/primitives";
import type { PassportDetectedFace, PassportDetectionResult } from "./passportDetectionService";
import { getHeadHeightPercentRange, passportStatusRank, type PassportRequirement, type PassportSizeMm, type PassportStatus } from "./passportRequirements";

export interface PassportValidationCheck {
  id: string;
  label: string;
  status: PassportStatus;
  message: string;
}

export interface PassportValidationResult {
  status: PassportStatus;
  checks: PassportValidationCheck[];
  issues: PassportValidationCheck[];
  detectionStatus: PassportDetectionResult["status"];
  detectedFace?: PassportDetectedFace;
}

export function validatePassportFrame(input: {
  frame: FrameLayer;
  asset: Asset | undefined;
  detection: PassportDetectionResult | null;
  requirement: PassportRequirement;
  size: PassportSizeMm;
}): PassportValidationResult {
  const checks: PassportValidationCheck[] = [];
  const detection = input.detection;
  const face = detection?.faces[0];
  checks.push(check("faceDetected", "זוהו פנים", face !== undefined ? "ok" : detection?.status === "unavailable" ? "review" : "notRecommended", face !== undefined ? "זוהו פנים" : "לא זוהו פנים"));
  checks.push(check("singleFace", "זוהתה דמות אחת בלבד", detection === null || detection.status === "unavailable" ? "review" : detection.faces.length === 1 ? "ok" : "notRecommended", detection === null || detection.status === "unavailable" ? "זיהוי פנים לא זמין" : detection.faces.length === 1 ? "זוהתה דמות אחת בלבד" : `זוהו ${detection.faces.length} פנים`));

  if (face !== undefined && detection !== null) {
    const headPercent = getFaceHeightPercent(face, input.frame, detection.imageWidth, detection.imageHeight);
    const range = getHeadHeightPercentRange(input.requirement, input.size);
    checks.push(check("headSize", "גודל הראש מתאים", headPercent >= range.min && headPercent <= range.max ? "ok" : "review", headPercent < range.min ? "הראש מעט קטן מדי" : headPercent > range.max ? "הראש מעט גדול מדי" : "גודל הראש בטווח"));
    const centerDx = Math.abs(face.center.x - 0.5);
    checks.push(check("faceCentered", "הפנים ממורכזות", centerDx <= 0.08 ? "ok" : "review", centerDx <= 0.08 ? "הפנים ממורכזות" : "הפנים לא ממורכזות"));
    checks.push(check("eyesLevel", "העיניים ישרות", Math.abs(face.tiltDegrees) <= 5 ? "ok" : "review", Math.abs(face.tiltDegrees) <= 5 ? "הראש ישר" : "הראש מעט מוטה"));
    checks.push(check("topMargin", "מרווח מעל הראש", (face.headTop?.y ?? face.boundingBox.y) > 0.035 ? "ok" : "review", (face.headTop?.y ?? face.boundingBox.y) > 0.035 ? "יש מרווח מעל הראש" : "אין מספיק מרווח מעל הראש"));
    checks.push(check("chinCrop", "הסנטר והראש לא חתוכים", (face.chin?.y ?? face.boundingBox.y + face.boundingBox.height) < 0.985 ? "ok" : "notRecommended", (face.chin?.y ?? 1) < 0.985 ? "הראש והסנטר בתוך התמונה" : "הסנטר או הראש קרובים מדי לחיתוך"));
  } else {
    checks.push(check("headSize", "גודל הראש מתאים", "review", "אין נתוני פנים לבדיקה"));
    checks.push(check("faceCentered", "הפנים ממורכזות", "review", "אין נתוני פנים לבדיקה"));
    checks.push(check("eyesLevel", "העיניים ישרות", "review", "אין נתוני פנים לבדיקה"));
  }

  const bg = detection?.background;
  checks.push(check("background", "הרקע נקי ובהיר", bg === null || bg === undefined ? "review" : bg.light && !bg.uneven && !bg.colorCast && !bg.strongShadow ? "ok" : bg.light ? "review" : "notRecommended", bg === null || bg === undefined ? "לא ניתן לבדוק רקע" : bg.light && !bg.uneven && !bg.colorCast && !bg.strongShadow ? "הרקע נראה בהיר ונקי" : "הרקע לא מספיק לבן/נקי"));

  const resolutionOk = input.asset?.width !== undefined && input.asset?.height !== undefined
    ? input.asset.width >= 600 && input.asset.height >= 600
    : false;
  checks.push(check("resolution", "רזולוציה מספקת", resolutionOk ? "ok" : "review", resolutionOk ? "הרזולוציה נראית מספקת" : "כדאי לבדוק חדות/רזולוציה"));

  const status = checks.reduce<PassportStatus>((worst, item) => passportStatusRank(item.status) > passportStatusRank(worst) ? item.status : worst, "ok");
  return {
    status,
    checks,
    issues: checks.filter((item) => item.status !== "ok"),
    detectionStatus: detection?.status ?? "unavailable",
    detectedFace: face
  };
}

export function aggregatePassportValidations(results: PassportValidationResult[]): PassportStatus {
  if (results.length === 0) return "review";
  return results.reduce<PassportStatus>((worst, result) => passportStatusRank(result.status) > passportStatusRank(worst) ? result.status : worst, "ok");
}

export function centerFaceTransform(input: {
  frame: FrameLayer;
  face: PassportDetectedFace;
  imageWidth: number;
  imageHeight: number;
  fitMode?: FitMode;
}): ContentTransform {
  const current = input.frame.contentTransform;
  const rect = computeContentRect(input.frame.width, input.frame.height, input.imageWidth, input.imageHeight, input.fitMode ?? input.frame.fitMode, current, input.frame.padding);
  const desiredOffsetX = rect.width * (0.5 - input.face.center.x);
  const eyeY = input.face.leftEye !== undefined && input.face.rightEye !== undefined
    ? (input.face.leftEye.y + input.face.rightEye.y) / 2
    : input.face.center.y;
  const desiredOffsetY = rect.height * (0.42 - eyeY);
  return clampContentTransformToFillBounds(
    { ...current, offsetX: desiredOffsetX, offsetY: desiredOffsetY },
    input.frame.width,
    input.frame.height,
    input.imageWidth,
    input.imageHeight,
    input.fitMode ?? input.frame.fitMode,
    input.frame.padding
  );
}

export function fitHeadSizeTransform(input: {
  frame: FrameLayer;
  face: PassportDetectedFace;
  imageWidth: number;
  imageHeight: number;
  requirement: PassportRequirement;
  size: PassportSizeMm;
  fitMode?: FitMode;
}): ContentTransform {
  const range = getHeadHeightPercentRange(input.requirement, input.size);
  const currentPercent = getFaceHeightPercent(input.face, input.frame, input.imageWidth, input.imageHeight);
  const targetPercent = (range.min + range.max) / 2;
  const scaleFactor = currentPercent > 0 ? targetPercent / currentPercent : 1;
  return clampContentTransformToFillBounds(
    { ...input.frame.contentTransform, scale: Math.max(0.5, Math.min(8, input.frame.contentTransform.scale * scaleFactor)) },
    input.frame.width,
    input.frame.height,
    input.imageWidth,
    input.imageHeight,
    input.fitMode ?? input.frame.fitMode,
    input.frame.padding
  );
}

export function autoCropPassportTransform(input: Parameters<typeof fitHeadSizeTransform>[0]): ContentTransform {
  const fitted = fitHeadSizeTransform(input);
  return centerFaceTransform({ ...input, frame: { ...input.frame, contentTransform: fitted } });
}

function getFaceHeightPercent(face: PassportDetectedFace, frame: FrameLayer, imageWidth: number, imageHeight: number): number {
  const pad = frame.padding * 2;
  const visibleHeight = Math.max(1, frame.height - pad);
  const rect = computeContentRect(frame.width, frame.height, imageWidth, imageHeight, frame.fitMode, frame.contentTransform, frame.padding);
  return (face.boundingBox.height * rect.height / visibleHeight) * 100;
}

function check(id: string, label: string, status: PassportStatus, message: string): PassportValidationCheck {
  return { id, label, status, message };
}

import type { PrepareCropRect, PrepareFaceBox, PrepareFocusPoint, PrepareQualityAnalysis, PrepareTargetSize } from "./types";

export function clampRect(rect: PrepareCropRect, width: number, height: number): PrepareCropRect {
  const x = clamp(Math.round(rect.x), 0, Math.max(0, width - 1));
  const y = clamp(Math.round(rect.y), 0, Math.max(0, height - 1));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(rect.width))),
    height: Math.max(1, Math.min(height - y, Math.round(rect.height)))
  };
}

export function groupFaceBoxes(faces: PrepareFaceBox[]): PrepareCropRect | null {
  if (faces.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = 0;
  let bottom = 0;
  for (const face of faces) {
    left = Math.min(left, face.x);
    top = Math.min(top, face.y);
    right = Math.max(right, face.x + face.width);
    bottom = Math.max(bottom, face.y + face.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function computeTargetCrop(
  imageWidth: number,
  imageHeight: number,
  targetRatio: number,
  faces: PrepareFaceBox[],
  contentBox?: PrepareCropRect | null,
  contentFocus?: PrepareFocusPoint | null
): { rect: PrepareCropRect; confidence: number; source: "faces" | "content" | "center"; safe: boolean } {
  if (!Number.isFinite(targetRatio) || targetRatio <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return {
      rect: { x: 0, y: 0, width: imageWidth, height: imageHeight },
      confidence: 0,
      source: "center",
      safe: false
    };
  }

  const fullRatio = imageWidth / imageHeight;
  const crop = fullRatio > targetRatio
    ? { width: Math.round(imageHeight * targetRatio), height: imageHeight }
    : { width: imageWidth, height: Math.round(imageWidth / targetRatio) };

  const maxX = Math.max(0, imageWidth - crop.width);
  const maxY = Math.max(0, imageHeight - crop.height);

  if (faces.length === 0) {
    const focusProtectedBox = contentFocus !== undefined && contentFocus !== null && contentFocus.confidence >= 0.28
      ? clampRect({
        x: contentFocus.x - Math.min(crop.width * 0.32, imageWidth * 0.22),
        y: contentFocus.y - Math.min(crop.height * 0.34, imageHeight * 0.24),
        width: Math.min(crop.width * 0.64, imageWidth * 0.44),
        height: Math.min(crop.height * 0.68, imageHeight * 0.48)
      }, imageWidth, imageHeight)
      : null;
    const baseProtectedBox = focusProtectedBox ?? contentBox;
    if (baseProtectedBox !== undefined && baseProtectedBox !== null) {
      const marginX = Math.max(imageWidth * 0.035, baseProtectedBox.width * 0.06);
      const marginY = Math.max(imageHeight * 0.035, baseProtectedBox.height * 0.08);
      const protectedBox = clampRect({
        x: baseProtectedBox.x - marginX,
        y: baseProtectedBox.y - marginY,
        width: baseProtectedBox.width + marginX * 2,
        height: baseProtectedBox.height + marginY * 2
      }, imageWidth, imageHeight);
      const preferredX = contentFocus !== undefined && contentFocus !== null ? contentFocus.x - crop.width / 2 : null;
      const preferredY = contentFocus !== undefined && contentFocus !== null ? contentFocus.y - crop.height * 0.48 : null;
      const safeConfidence = contentFocus !== undefined && contentFocus !== null
        ? clamp(0.76 + contentFocus.confidence * 0.16, 0.76, 0.9)
        : 0.74;
      const solved = cropAroundProtectedBox(imageWidth, imageHeight, crop, protectedBox, maxX, maxY, preferredX, preferredY, safeConfidence, 0.58);
      return { ...solved, source: "content" };
    }
    return {
      rect: clampRect({
        x: Math.round(maxX / 2),
        y: Math.round(maxY / 2),
        width: crop.width,
        height: crop.height
      }, imageWidth, imageHeight),
      confidence: Math.abs(fullRatio - targetRatio) < 0.02 ? 0.95 : 0.78,
      source: "center",
      safe: true
    };
  }

  const group = groupFaceBoxes(faces);
  if (group === null) {
    return {
      rect: { x: 0, y: 0, width: imageWidth, height: imageHeight },
      confidence: 0,
      source: "faces",
      safe: false
    };
  }

  const avgFaceHeight = faces.reduce((sum, face) => sum + face.height, 0) / faces.length;
  const marginX = Math.max(imageWidth * 0.04, group.width * 0.18);
  const topMargin = Math.max(imageHeight * 0.045, avgFaceHeight * 0.55);
  const bottomMargin = Math.max(imageHeight * 0.055, avgFaceHeight * (faces.length === 1 ? 1.1 : 0.42));
  const protectedBox = clampRect({
    x: group.x - marginX,
    y: group.y - topMargin,
    width: group.width + marginX * 2,
    height: group.height + topMargin + bottomMargin
  }, imageWidth, imageHeight);

  const canContain = protectedBox.width <= crop.width && protectedBox.height <= crop.height;
  const centerX = protectedBox.x + protectedBox.width / 2;
  const faceCenterY = group.y + group.height / 2;
  const desiredY = faces.length === 1 ? faceCenterY - crop.height * 0.43 : centerY(protectedBox) - crop.height / 2;
  const rect = cropAroundProtectedBox(
    imageWidth,
    imageHeight,
    crop,
    protectedBox,
    maxX,
    maxY,
    clamp(centerX - crop.width / 2, 0, maxX),
    clamp(desiredY, 0, maxY),
    0.72 + faces.reduce((sum, face) => sum + face.score, 0) / faces.length * 0.25,
    0.35 + faces.reduce((sum, face) => sum + face.score, 0) / faces.length * 0.25
  ).rect;
  const containsProtected =
    rect.x <= protectedBox.x &&
    rect.y <= protectedBox.y &&
    rect.x + rect.width >= protectedBox.x + protectedBox.width &&
    rect.y + rect.height >= protectedBox.y + protectedBox.height;
  const faceScore = faces.reduce((sum, face) => sum + face.score, 0) / faces.length;
  const confidence = containsProtected && canContain
    ? clamp(0.72 + faceScore * 0.25, 0.72, 0.98)
    : clamp(0.35 + faceScore * 0.25, 0.35, 0.68);

  return { rect, confidence, source: "faces", safe: containsProtected && canContain };
}

function cropAroundProtectedBox(
  imageWidth: number,
  imageHeight: number,
  crop: { width: number; height: number },
  protectedBox: PrepareCropRect,
  maxX: number,
  maxY: number,
  preferredX: number | null,
  preferredY: number | null,
  safeConfidence: number,
  unsafeConfidence: number
): { rect: PrepareCropRect; confidence: number; safe: boolean } {
  const canContain = protectedBox.width <= crop.width && protectedBox.height <= crop.height;
  const centerX = protectedBox.x + protectedBox.width / 2;
  const centerY = protectedBox.y + protectedBox.height / 2;
  let x = clamp(preferredX ?? centerX - crop.width / 2, 0, maxX);
  let y = clamp(preferredY ?? centerY - crop.height / 2, 0, maxY);
  if (canContain) {
    x = clamp(Math.max(protectedBox.x + protectedBox.width - crop.width, Math.min(x, protectedBox.x)), 0, maxX);
    y = clamp(Math.max(protectedBox.y + protectedBox.height - crop.height, Math.min(y, protectedBox.y)), 0, maxY);
  }
  const rect = clampRect({
    x,
    y,
    width: crop.width,
    height: crop.height
  }, imageWidth, imageHeight);
  const containsProtected =
    rect.x <= protectedBox.x &&
    rect.y <= protectedBox.y &&
    rect.x + rect.width >= protectedBox.x + protectedBox.width &&
    rect.y + rect.height >= protectedBox.y + protectedBox.height;
  const safe = containsProtected && canContain;
  return { rect, confidence: safe ? safeConfidence : unsafeConfidence, safe };
}

function centerY(rect: PrepareCropRect): number {
  return rect.y + rect.height / 2;
}

export function targetSizeToPixels(target: PrepareTargetSize): { widthPx: number; heightPx: number } | null {
  if (!target.enabled || target.width <= 0 || target.height <= 0) return null;
  if (target.unit === "px") return { widthPx: target.width, heightPx: target.height };
  const dpi = Math.max(1, target.dpi || 300);
  const widthIn = target.unit === "inch" ? target.width : target.unit === "cm" ? target.width / 2.54 : target.width / 25.4;
  const heightIn = target.unit === "inch" ? target.height : target.unit === "cm" ? target.height / 2.54 : target.height / 25.4;
  return { widthPx: widthIn * dpi, heightPx: heightIn * dpi };
}

export function targetAspectRatio(target: PrepareTargetSize): number | null {
  if (!target.enabled || target.width <= 0 || target.height <= 0) return null;
  return target.width / target.height;
}

export function orientedTargetAspectRatio(target: PrepareTargetSize, imageWidth: number, imageHeight: number): number | null {
  const ratio = targetAspectRatio(target);
  if (ratio === null || ratio <= 0 || imageWidth <= 0 || imageHeight <= 0) return ratio;
  const imageIsLandscape = imageWidth >= imageHeight;
  const targetIsLandscape = ratio >= 1;
  return imageIsLandscape === targetIsLandscape ? ratio : 1 / ratio;
}

export function analyzeEffectiveDpi(
  imageWidth: number,
  imageHeight: number,
  target: PrepareTargetSize
): PrepareQualityAnalysis {
  if (!target.enabled || target.width <= 0 || target.height <= 0) {
    return { tier: "unknown", message: "לא נבחרה מידת יעד לבדיקת DPI." };
  }
  if (target.unit === "px") {
    return imageWidth >= target.width && imageHeight >= target.height
      ? { tier: "ok", message: "הרזולוציה מספיקה למידת הפיקסלים שנבחרה." }
      : { tier: "manual_review", message: "הרזולוציה קטנה ממידת הפיקסלים שנבחרה." };
  }
  const widthIn = target.unit === "inch" ? target.width : target.unit === "cm" ? target.width / 2.54 : target.width / 25.4;
  const heightIn = target.unit === "inch" ? target.height : target.unit === "cm" ? target.height / 2.54 : target.height / 25.4;
  const dpi = Math.min(imageWidth / Math.max(0.01, widthIn), imageHeight / Math.max(0.01, heightIn));
  if (dpi >= 200) return { effectiveDpi: dpi, tier: "ok", message: `${Math.round(dpi)} DPI - תקין לדפוס.` };
  if (dpi >= 150) return { effectiveDpi: dpi, tier: "soft_warning", message: `${Math.round(dpi)} DPI - אזהרה קלה.` };
  if (dpi >= 100) return { effectiveDpi: dpi, tier: "strong_warning", message: `${Math.round(dpi)} DPI - אזהרה חזקה.` };
  return { effectiveDpi: dpi, tier: "manual_review", message: `${Math.round(dpi)} DPI - דורש בדיקה ידנית.` };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

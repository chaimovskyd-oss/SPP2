import type { ContentTransform } from "@/types/layers";
import type { FitMode } from "@/types/primitives";

export interface ContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SmartCropAnchor {
  x: number;
  y: number;
}

/**
 * מחשב את מיקום ומידות התמונה בתוך הפריים, לפי מצב ההתאמה ו-ContentTransform.
 *
 * הקורדינטות מוחזרות בשיטה מקומית של הפריים (0,0 = פינה שמאל-עליונה של הפריים).
 * ה-clip חייב להיות מוחל מחוץ לפונקציה זו.
 */
export function computeContentRect(
  frameWidth: number,
  frameHeight: number,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  fitMode: FitMode,
  contentTransform: ContentTransform,
  padding = 0,
  smartCropAnchor?: SmartCropAnchor
): ContentRect {
  const innerW = Math.max(1, frameWidth - padding * 2);
  const innerH = Math.max(1, frameHeight - padding * 2);

  if (fitMode === "stretch") {
    return {
      x: padding,
      y: padding,
      width: innerW,
      height: innerH
    };
  }

  const imgRatio = imageNaturalWidth / imageNaturalHeight;
  const innerRatio = innerW / innerH;

  let baseScale: number;
  if (fitMode === "fit") {
    baseScale = imgRatio > innerRatio ? innerW / imageNaturalWidth : innerH / imageNaturalHeight;
  } else {
    // fill ו-smartCrop — תמלא את הפריים ותחתוך אם צריך
    baseScale = imgRatio > innerRatio ? innerH / imageNaturalHeight : innerW / imageNaturalWidth;
  }

  const finalScale = baseScale * contentTransform.scale;
  const renderW = imageNaturalWidth * finalScale;
  const renderH = imageNaturalHeight * finalScale;

  // מרכז הפריים הפנימי
  const centerX = padding + innerW / 2;
  const centerY = padding + innerH / 2;

  // בחיתוך חכם — מזיזים לפי עוגן הפנים/תוכן שהגיע מ-Python
  let anchorOffsetX = 0;
  let anchorOffsetY = 0;
  if (fitMode === "smartCrop" && smartCropAnchor !== undefined) {
    const anchorXInRendered = smartCropAnchor.x * renderW;
    const anchorYInRendered = smartCropAnchor.y * renderH;
    anchorOffsetX = innerW / 2 - anchorXInRendered;
    anchorOffsetY = innerH / 2 - anchorYInRendered;
  }

  const x = centerX - renderW / 2 + contentTransform.offsetX + anchorOffsetX;
  const y = centerY - renderH / 2 + contentTransform.offsetY + anchorOffsetY;

  return { x, y, width: renderW, height: renderH };
}

/**
 * מאפס את ContentTransform למצב ה-fit הטבעי (מרכז, ללא זום נוסף).
 */
export function resetContentTransform(): ContentTransform {
  return { version: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
}

/**
 * מגביל את ה-ContentTransform כך שהתמונה לא תצא לגמרי מגבולות הפריים.
 * שומר שתמיד ייראה לפחות 20% מהתמונה בתוך הפריים.
 */
export function clampContentTransform(
  transform: ContentTransform,
  frameWidth: number,
  frameHeight: number,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  fitMode: FitMode,
  padding = 0
): ContentTransform {
  const rect = computeContentRect(frameWidth, frameHeight, imageNaturalWidth, imageNaturalHeight, fitMode, transform, padding);
  const innerW = frameWidth - padding * 2;
  const innerH = frameHeight - padding * 2;
  const minVisible = 0.2;

  const maxOffsetX = rect.width * (1 - minVisible);
  const maxOffsetY = rect.height * (1 - minVisible);
  const minOffsetX = -(innerW - rect.width * minVisible);
  const minOffsetY = -(innerH - rect.height * minVisible);

  return {
    ...transform,
    offsetX: Math.min(maxOffsetX, Math.max(minOffsetX, transform.offsetX)),
    offsetY: Math.min(maxOffsetY, Math.max(minOffsetY, transform.offsetY))
  };
}

/**
 * Strict crop clamp for frame/cell content. In fill-like modes the rendered
 * image must keep covering the inner frame, so panning can never expose a gap.
 */
export function clampContentTransformToFillBounds(
  transform: ContentTransform,
  frameWidth: number,
  frameHeight: number,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  fitMode: FitMode,
  padding = 0
): ContentTransform {
  const next: ContentTransform = {
    ...transform,
    scale: fitMode === "fill" || fitMode === "smartCrop" ? Math.max(1, transform.scale) : transform.scale
  };

  if (fitMode === "stretch") {
    return { ...next, offsetX: 0, offsetY: 0 };
  }

  const rect = computeContentRect(frameWidth, frameHeight, imageNaturalWidth, imageNaturalHeight, fitMode, next, padding);
  const innerX = padding;
  const innerY = padding;
  const innerW = Math.max(1, frameWidth - padding * 2);
  const innerH = Math.max(1, frameHeight - padding * 2);
  const clampedX = clampCoveredAxis(rect.x, rect.width, innerX, innerW);
  const clampedY = clampCoveredAxis(rect.y, rect.height, innerY, innerH);

  return {
    ...next,
    offsetX: next.offsetX + (clampedX - rect.x),
    offsetY: next.offsetY + (clampedY - rect.y)
  };
}

function clampCoveredAxis(rectStart: number, rectSize: number, innerStart: number, innerSize: number): number {
  if (rectSize <= innerSize) {
    return innerStart + (innerSize - rectSize) / 2;
  }

  const minStart = innerStart + innerSize - rectSize;
  const maxStart = innerStart;
  return Math.min(maxStart, Math.max(minStart, rectStart));
}

import type { ContentTransform } from "@/types/layers";
import type { FitMode } from "@/types/primitives";

export interface ContentRect {
  /** Visible (rotated) bounding box top-left, in frame-local coords. */
  x: number;
  y: number;
  /** Visible (rotated) bounding box dimensions. */
  width: number;
  height: number;
  /** Unrotated drawing dimensions (== imageNatural × finalScale). The renderer
   *  must pass these to KonvaImage.width/height. */
  renderWidth: number;
  renderHeight: number;
}

export interface SmartCropAnchor {
  x: number;
  y: number;
}

export interface FillPanBounds {
  canPanX: boolean;
  canPanY: boolean;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  lockedX: number;
  lockedY: number;
}

export function computeFillPanBounds(
  _rectX: number,
  _rectY: number,
  rectWidth: number,
  rectHeight: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  epsilon = 0.5
): FillPanBounds {
  const canPanX = rectWidth > innerWidth + epsilon;
  const canPanY = rectHeight > innerHeight + epsilon;
  const lockedX = innerX + (innerWidth - rectWidth) / 2;
  const lockedY = innerY + (innerHeight - rectHeight) / 2;

  return {
    canPanX,
    canPanY,
    minX: innerX + innerWidth - rectWidth,
    maxX: innerX,
    minY: innerY + innerHeight - rectHeight,
    maxY: innerY,
    lockedX,
    lockedY
  };
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
      height: innerH,
      renderWidth: innerW,
      renderHeight: innerH
    };
  }

  // The visible (rotated) bounding box dimensions of a (W × H) rect rotated
  // by R° are: W·|cos R| + H·|sin R| , W·|sin R| + H·|cos R|.
  // Fit/fill must measure against THIS bbox so the image keeps filling the
  // cell at any rotation (cardinal or otherwise).
  const rad = (((contentTransform.rotation ?? 0) % 360) * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(rad));
  const absSin = Math.abs(Math.sin(rad));
  const bboxW1 = imageNaturalWidth * absCos + imageNaturalHeight * absSin;
  const bboxH1 = imageNaturalWidth * absSin + imageNaturalHeight * absCos;

  const imgRatio = bboxW1 / bboxH1;
  const innerRatio = innerW / innerH;

  let baseScale: number;
  if (fitMode === "fit") {
    baseScale = imgRatio > innerRatio ? innerW / bboxW1 : innerH / bboxH1;
  } else {
    // fill ו-smartCrop — תמלא את הפריים ותחתוך אם צריך
    baseScale = imgRatio > innerRatio ? innerH / bboxH1 : innerW / bboxW1;
  }

  const finalScale = baseScale * contentTransform.scale;
  // Un-rotated drawing dimensions — what we pass to KonvaImage.width/height.
  const renderW = imageNaturalWidth * finalScale;
  const renderH = imageNaturalHeight * finalScale;
  // Rotated bounding box dimensions — what the user actually sees.
  const bboxW = renderW * absCos + renderH * absSin;
  const bboxH = renderW * absSin + renderH * absCos;

  // מרכז הפריים הפנימי
  const centerX = padding + innerW / 2;
  const centerY = padding + innerH / 2;

  // בחיתוך חכם — מזיזים לפי עוגן הפנים/תוכן שהגיע מ-Python
  let anchorOffsetX = 0;
  let anchorOffsetY = 0;
  if (fitMode === "smartCrop" && smartCropAnchor !== undefined) {
    const anchorXInRendered = smartCropAnchor.x * bboxW;
    const anchorYInRendered = smartCropAnchor.y * bboxH;
    anchorOffsetX = innerW / 2 - anchorXInRendered;
    anchorOffsetY = innerH / 2 - anchorYInRendered;
  }

  // (x, y) is the top-left of the *visible* (rotated) bounding box in frame
  // coords. The renderer positions the KonvaImage so its rotated bbox lands
  // here.
  const x = centerX - bboxW / 2 + contentTransform.offsetX + anchorOffsetX;
  const y = centerY - bboxH / 2 + contentTransform.offsetY + anchorOffsetY;

  return { x, y, width: bboxW, height: bboxH, renderWidth: renderW, renderHeight: renderH };
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
  // contentRect already reports the visible (rotated) bbox top-left + dims.
  const bounds = computeFillPanBounds(rect.x, rect.y, rect.width, rect.height, innerX, innerY, innerW, innerH);
  const clampedX = bounds.canPanX
    ? Math.min(bounds.maxX, Math.max(bounds.minX, rect.x))
    : bounds.lockedX;
  const clampedY = bounds.canPanY
    ? Math.min(bounds.maxY, Math.max(bounds.minY, rect.y))
    : bounds.lockedY;

  return {
    ...next,
    offsetX: next.offsetX + (clampedX - rect.x),
    offsetY: next.offsetY + (clampedY - rect.y)
  };
}

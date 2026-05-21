import type { ContentTransform, FaceAnchorData } from "@/types/layers";

export const IDENTITY_TRANSFORM: ContentTransform = {
  version: 1,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
};

export interface SlotDims {
  w: number;
  h: number;
}

export interface AdaptResult {
  transform: ContentTransform;
  hasManual: boolean;
}

const ASPECT_TOLERANCE = 0.3;

function aspect({ w, h }: SlotDims): number {
  if (h <= 0) return 0;
  return w / h;
}

/**
 * Adapt a ContentTransform from an old slot geometry to a new one.
 *
 * Rules:
 * 1. If the user had a manual transform AND the new slot has a similar aspect
 *    ratio (within ASPECT_TOLERANCE), scale the offsets proportionally and
 *    keep scale + rotation. Manual work survives.
 * 2. Otherwise, if a faceAnchor is available, return identity here — the
 *    caller is expected to invoke smart-crop afterwards using the anchor.
 *    We surface `hasManual: false` so smart-crop is free to recompute.
 * 3. Otherwise: identity transform.
 */
export function adaptContentTransform(
  prev: ContentTransform | undefined,
  prevSlot: SlotDims,
  newSlot: SlotDims,
  options: { hasManual?: boolean; faceAnchor?: FaceAnchorData } = {},
): AdaptResult {
  if (!prev || !options.hasManual) {
    return { transform: { ...IDENTITY_TRANSFORM }, hasManual: false };
  }

  const prevAspect = aspect(prevSlot);
  const newAspect = aspect(newSlot);
  if (prevAspect <= 0 || newAspect <= 0) {
    return { transform: { ...IDENTITY_TRANSFORM }, hasManual: false };
  }

  const delta = Math.abs(newAspect - prevAspect) / prevAspect;

  if (delta < ASPECT_TOLERANCE) {
    const sx = prevSlot.w > 0 ? newSlot.w / prevSlot.w : 1;
    const sy = prevSlot.h > 0 ? newSlot.h / prevSlot.h : 1;
    return {
      transform: {
        version: 1,
        offsetX: prev.offsetX * sx,
        offsetY: prev.offsetY * sy,
        scale: prev.scale,
        rotation: prev.rotation,
      },
      hasManual: true,
    };
  }

  // Aspect change too large — fall back to identity. Caller can re-apply
  // smart crop using the faceAnchor (if any) to recenter intelligently.
  return { transform: { ...IDENTITY_TRANSFORM }, hasManual: false };
}

export function aspectChangedSignificantly(prev: SlotDims, next: SlotDims): boolean {
  const a = aspect(prev);
  const b = aspect(next);
  if (a <= 0 || b <= 0) return true;
  return Math.abs(b - a) / a >= ASPECT_TOLERANCE;
}

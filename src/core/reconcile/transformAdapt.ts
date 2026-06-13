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
 * `rotation` is treated as IMAGE-INTRINSIC (e.g. a sideways upload turned
 * upright) and always survives — it is independent of slot geometry. Only the
 * slot-relative pan/zoom (offsetX/offsetY/scale) may be reset.
 *
 * Rules:
 * 1. If the user had a manual transform AND the new slot has a similar aspect
 *    ratio (within ASPECT_TOLERANCE), scale the offsets proportionally and
 *    keep scale + rotation. Manual work survives.
 * 2. Otherwise (no manual pan/zoom, or the aspect changed too much): reset
 *    pan/zoom to identity but KEEP rotation. `hasManual` stays true whenever a
 *    rotation is present, so the rotation keeps surviving future reflows.
 */
export function adaptContentTransform(
  prev: ContentTransform | undefined,
  prevSlot: SlotDims,
  newSlot: SlotDims,
  options: { hasManual?: boolean; faceAnchor?: FaceAnchorData } = {},
): AdaptResult {
  const rotation = prev?.rotation ?? 0;
  const hasRotation = rotation !== 0;
  const resetKeepingRotation: AdaptResult = {
    transform: { ...IDENTITY_TRANSFORM, rotation },
    hasManual: hasRotation,
  };

  if (!prev || !options.hasManual) {
    return resetKeepingRotation;
  }

  const prevAspect = aspect(prevSlot);
  const newAspect = aspect(newSlot);
  if (prevAspect <= 0 || newAspect <= 0) {
    return resetKeepingRotation;
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
        rotation,
      },
      hasManual: true,
    };
  }

  // Aspect change too large — reset pan/zoom but keep the rotation correction.
  return resetKeepingRotation;
}

export function aspectChangedSignificantly(prev: SlotDims, next: SlotDims): boolean {
  const a = aspect(prev);
  const b = aspect(next);
  if (a <= 0 || b <= 0) return true;
  return Math.abs(b - a) / a >= ASPECT_TOLERANCE;
}

import type { Rect } from "@/types/primitives";

/** Common angles the soft snap pulls toward (degrees). */
const SOFT_SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 360];

/** Normalize an angle to the [0, 360) range. */
export function normalizeAngle(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/**
 * Snap a rotation angle.
 *
 * - Without Shift: softly snap to the nearest common angle (0/45/90/…) only when
 *   within `softSnapToleranceDeg`; otherwise return the angle untouched.
 * - With Shift: force the angle to the nearest fixed `forcedStepDeg` increment.
 *
 * The returned value is normalized to [0, 360).
 */
export function snapRotation(
  angleDeg: number,
  options: {
    shiftKey?: boolean;
    softSnapToleranceDeg?: number;
    forcedStepDeg?: number;
  } = {}
): number {
  const { shiftKey = false, softSnapToleranceDeg = 4, forcedStepDeg = 15 } = options;
  const angle = normalizeAngle(angleDeg);

  if (shiftKey) {
    const step = forcedStepDeg > 0 ? forcedStepDeg : 15;
    return normalizeAngle(Math.round(angle / step) * step);
  }

  let best = angle;
  let bestDistance = softSnapToleranceDeg;
  for (const target of SOFT_SNAP_ANGLES) {
    const distance = Math.abs(angle - target);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = target;
    }
  }
  return normalizeAngle(best);
}

/** Build the `rotationSnaps` array Konva's Transformer expects for a fixed step. */
export function buildRotationSnaps(stepDeg: number): number[] {
  const step = stepDeg > 0 ? stepDeg : 15;
  const snaps: number[] = [];
  for (let angle = 0; angle < 360; angle += step) {
    snaps.push(angle);
  }
  return snaps;
}

/** The soft-snap angles (0/45/90/…/315) used when Shift is not held. */
export const SOFT_ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * Pure center-preserving rotation for a node rendered around its top-left
 * origin (Konva's default for rect/text/image/frame). Given an unrotated rect
 * `{x, y, width, height}` currently at rotation `fromDeg`, return the new
 * `{x, y}` so that the visual center stays fixed after rotating to `toDeg`.
 *
 * Konva places the visual center at:  origin + R(theta) · (w/2, h/2)
 * Keeping the center constant gives:  (x,y)' = (x,y) + [R(from) - R(to)] · (w/2, h/2)
 *
 * Used by unit tests and as the reference for the live-node implementation in
 * CanvasStage (which uses Konva client rects as ground truth).
 */
export function rotateKeepingVisualCenter(
  rect: Rect,
  fromDeg: number,
  toDeg: number
): { x: number; y: number } {
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const from = (fromDeg * Math.PI) / 180;
  const to = (toDeg * Math.PI) / 180;

  const rotate = (rad: number): { x: number; y: number } => ({
    x: hw * Math.cos(rad) - hh * Math.sin(rad),
    y: hw * Math.sin(rad) + hh * Math.cos(rad)
  });

  const before = rotate(from);
  const after = rotate(to);
  return {
    x: rect.x + (before.x - after.x),
    y: rect.y + (before.y - after.y)
  };
}

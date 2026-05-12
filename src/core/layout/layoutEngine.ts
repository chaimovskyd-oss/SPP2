import type { FrameLayer, VisualLayer } from "@/types/layers";

export interface OverlapResult {
  hasOverlap: boolean;
  overlappingIds: string[];
}

export interface LayoutConstraintResult {
  allowed: boolean;
  reason?: string;
  suggestedX?: number;
  suggestedY?: number;
}

/**
 * מחזיר את כל הפריימים עם מצב layoutLocked או semiFlexible מתוך רשימת שכבות.
 */
export function getLayoutFrames(layers: VisualLayer[]): FrameLayer[] {
  return layers.filter(
    (layer): layer is FrameLayer =>
      layer.type === "frame" &&
      (layer.behaviorMode === "layoutLocked" || layer.behaviorMode === "semiFlexible")
  );
}

/**
 * בודק האם שני מלבנים חופפים.
 */
function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * בודק האם הזזת פריים לנקודה נתונה תגרום לחפיפה עם פריימים אחרים.
 * מתעלם מהפריים עצמו (לפי ID).
 */
export function checkOverlap(
  movingFrame: FrameLayer,
  candidateX: number,
  candidateY: number,
  allLayers: VisualLayer[]
): OverlapResult {
  const layoutFrames = getLayoutFrames(allLayers);
  const overlappingIds: string[] = [];

  for (const frame of layoutFrames) {
    if (frame.id === movingFrame.id) continue;
    if (rectsOverlap(candidateX, candidateY, movingFrame.width, movingFrame.height, frame.x, frame.y, frame.width, frame.height)) {
      overlappingIds.push(frame.id);
    }
  }

  return { hasOverlap: overlappingIds.length > 0, overlappingIds };
}

/**
 * בודק האם מותר להזיז את הפריים לנקודה הנתונה, לפי מצב ההתנהגות שלו.
 * - layoutLocked: לא מורשה להזיז (אלא בעריכת layout בלבד)
 * - semiFlexible: מורשה אבל לא יכול לחפוף
 * - freeform: הכל מורשה
 */
export function validateFrameMove(
  frame: FrameLayer,
  candidateX: number,
  candidateY: number,
  allLayers: VisualLayer[],
  inLayoutEditMode: boolean
): LayoutConstraintResult {
  if (frame.behaviorMode === "layoutLocked" && !inLayoutEditMode) {
    return { allowed: false, reason: "פריים נעול לתצורה. כנס למצב עריכת פריסה כדי להזיז אותו." };
  }

  if (frame.behaviorMode === "freeform") {
    return { allowed: true };
  }

  const overlap = checkOverlap(frame, candidateX, candidateY, allLayers);
  if (overlap.hasOverlap) {
    return {
      allowed: false,
      reason: "פריימים לא יכולים לחפוף. הסר חפיפה לפני ההזזה.",
      suggestedX: frame.x,
      suggestedY: frame.y
    };
  }

  return { allowed: true };
}

/**
 * מחשב מיקומי גריד עבור n פריימים בתצורת שורות ועמודות.
 * מחזיר מערך של {x, y, width, height} לכל פריים.
 */
export function computeGridLayout(options: {
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  gapX: number;
  gapY: number;
  originX: number;
  originY: number;
}): Array<{ x: number; y: number; width: number; height: number }> {
  const { columns, rows, frameWidth, frameHeight, gapX, gapY, originX, originY } = options;
  const result: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      result.push({
        x: originX + col * (frameWidth + gapX),
        y: originY + row * (frameHeight + gapY),
        width: frameWidth,
        height: frameHeight
      });
    }
  }

  return result;
}

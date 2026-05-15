/**
 * Shaped collage layouts: circle, heart, diamond, cross, frame.
 *
 * KEY PRINCIPLE: boundary checks are done in PIXEL space so shapes look
 * geometrically correct regardless of canvas aspect ratio.
 * Cells are SQUARE in pixel space so circle/heart clips look correct.
 */
import { createCollageSlot } from "./collageFactory";
import type { CollageSlot, CollageSlotShape } from "@/types/collage";

// ─── Pixel-space boundary functions ──────────────────────────────────────────

function isInsideCirclePx(
  px: number, py: number,
  cxPx: number, cyPx: number, radiusPx: number
): boolean {
  return (px - cxPx) ** 2 + (py - cyPx) ** 2 < radiusPx ** 2;
}

function isInsideHeartPx(
  px: number, py: number,
  cxPx: number, cyPx: number, sizePx: number
): boolean {
  // Normalize to parametric heart space. size=half-height of heart.
  const x = (px - cxPx) / (sizePx * 0.78) * 1.3;
  const y = (py - cyPx) / (sizePx * 0.88) * -1.15 + 0.2;
  return (x * x + y * y - 1) ** 3 - x * x * y ** 3 < 0;
}

// ─── Core: grid-in-shape packer ───────────────────────────────────────────────

interface ShapePackResult {
  slots: CollageSlot[];
  cellPx: number;
}

function packCellsInShape(
  imageCount: number,
  cxPx: number, cyPx: number, shapeSizePx: number,
  canvasW: number, canvasH: number, spacingPx: number,
  insideFn: (px: number, py: number) => boolean,
  slotShape: CollageSlotShape
): ShapePackResult {
  // Try different column counts starting from sqrt(n)
  for (let cols = Math.max(2, Math.round(Math.sqrt(imageCount) * 1.3)); cols <= Math.ceil(imageCount * 1.8); cols++) {
    const cellPx = (shapeSizePx - spacingPx * (cols - 1)) / cols;
    if (cellPx < 24) break;

    const rows = Math.ceil(shapeSizePx / (cellPx + spacingPx)) + 2;
    const gridW = cols * cellPx + (cols - 1) * spacingPx;
    const gridH = rows * cellPx + (rows - 1) * spacingPx;
    const startX = cxPx - gridW / 2;
    const startY = cyPx - gridH / 2;

    const candidates: CollageSlot[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellX = startX + c * (cellPx + spacingPx);
        const cellY = startY + r * (cellPx + spacingPx);
        const centerX = cellX + cellPx / 2;
        const centerY = cellY + cellPx / 2;

        if (insideFn(centerX, centerY)) {
          candidates.push(createCollageSlot({
            type: "image",
            shape: slotShape,
            x: cellX / canvasW,
            y: cellY / canvasH,
            w: cellPx / canvasW,
            h: cellPx / canvasH,  // square cells in pixel space
          }));
        }
      }
    }

    if (candidates.length >= imageCount) {
      return { slots: candidates.slice(0, imageCount), cellPx };
    }
  }

  // Fallback: concentric rings
  return { slots: buildConcentricRings(imageCount, cxPx, cyPx, shapeSizePx, canvasW, canvasH, spacingPx, slotShape), cellPx: 0 };
}

// ─── Concentric ring fallback ─────────────────────────────────────────────────

function buildConcentricRings(
  n: number, cxPx: number, cyPx: number, shapeSizePx: number,
  canvasW: number, canvasH: number, spacingPx: number,
  slotShape: CollageSlotShape
): CollageSlot[] {
  const cellPx = Math.max(30, shapeSizePx / (Math.ceil(Math.sqrt(n)) + 1));
  const slots: CollageSlot[] = [];
  let remaining = n;

  // Center
  const cx0 = cxPx - cellPx / 2, cy0 = cyPx - cellPx / 2;
  slots.push(createCollageSlot({
    type: "image", shape: slotShape,
    x: cx0 / canvasW, y: cy0 / canvasH,
    w: cellPx / canvasW, h: cellPx / canvasH
  }));
  remaining--;

  for (let ring = 1; ring <= 5 && remaining > 0; ring++) {
    const ringR = ring * (cellPx + spacingPx);
    const countInRing = Math.min(remaining, Math.max(4, Math.floor(2 * Math.PI * ringR / (cellPx + spacingPx))));
    for (let i = 0; i < countInRing && remaining > 0; i++) {
      const angle = (i / countInRing) * 2 * Math.PI - Math.PI / 2;
      const px = cxPx + Math.cos(angle) * ringR - cellPx / 2;
      const py = cyPx + Math.sin(angle) * ringR - cellPx / 2;
      slots.push(createCollageSlot({
        type: "image", shape: slotShape,
        x: px / canvasW, y: py / canvasH,
        w: cellPx / canvasW, h: cellPx / canvasH
      }));
      remaining--;
    }
  }
  return slots;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildShapedCollageSlots(
  shape: "circle" | "heart",
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx?: number
): CollageSlot[] {
  const mPx = marginPx ?? spacingPx * 3;
  const usableW = canvasW - 2 * mPx;
  const usableH = canvasH - 2 * mPx;
  const cxPx = canvasW / 2;
  const cyPx = canvasH / 2;
  // Shape inscribes into the smaller usable dimension (correct circle on print)
  const shapeSizePx = Math.min(usableW, usableH) * 0.92;

  const slotShape = shape === "circle" ? "circle" as const : "heart" as const;
  const insideFn = shape === "circle"
    ? (px: number, py: number) => isInsideCirclePx(px, py, cxPx, cyPx, shapeSizePx / 2)
    : (px: number, py: number) => isInsideHeartPx(px, py, cxPx, cyPx, shapeSizePx / 2);

  const { slots } = packCellsInShape(
    imageCount, cxPx, cyPx, shapeSizePx,
    canvasW, canvasH, spacingPx, insideFn, slotShape
  );
  return slots;
}

// ─── Diamond center layout ───────────────────────────────────────────────────

/**
 * Central image rotated 45° (diamond) with surrounding rectangular cells.
 * The center diamond appears to "float" above the surrounding grid.
 */
export function buildDiamondCenterSlots(
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount < 2) {
    return [createCollageSlot({ type: "image", x: marginPx / canvasW, y: marginPx / canvasH, w: (canvasW - 2 * marginPx) / canvasW, h: (canvasH - 2 * marginPx) / canvasH })];
  }

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const cxPx = canvasW / 2;
  const cyPx = canvasH / 2;

  // Diamond (rotated square) in the center
  // A square rotated 45° with diagonal = D occupies D×D bounding box
  // Use ~38% of canvas width as the diamond diagonal
  const diamondDiag = Math.min(usableW, usableH) * 0.42;
  const diamondSide = diamondDiag / Math.SQRT2; // side of the actual square before rotation

  const diamondSlot = createCollageSlot({
    type: "image",
    role: "hero",
    x: (cxPx - diamondDiag / 2) / canvasW,
    y: (cyPx - diamondDiag / 2) / canvasH,
    w: diamondDiag / canvasW,
    h: diamondDiag / canvasH,
    rotationDeg: 45,
    zIndex: imageCount, // on top
  });

  if (imageCount === 1) return [diamondSlot];

  // Surrounding cells fill the 4 corners + edges
  // Place 4 triangular/corner zones — use simple grid and take cells that don't
  // overlap too much with the diamond
  const surrounding = imageCount - 1;

  // Simple: place surrounding cells in a grid, the diamond overlaps them visually
  // Use a 2-column grid on each side (left-half, right-half)
  const halfSurrounding = Math.ceil(surrounding / 2);
  const leftCount = halfSurrounding;
  const rightCount = surrounding - leftCount;

  const leftSlots = makeSimpleGridSlots(
    leftCount,
    marginPx, marginPx,
    (cxPx - diamondDiag / 2 - spacingPx) - marginPx, usableH,
    spacingPx, canvasW, canvasH
  );
  const rightSlots = makeSimpleGridSlots(
    rightCount,
    cxPx + diamondDiag / 2 + spacingPx, marginPx,
    canvasW - marginPx - (cxPx + diamondDiag / 2 + spacingPx), usableH,
    spacingPx, canvasW, canvasH
  );

  return [diamondSlot, ...leftSlots, ...rightSlots];
}

/** Simple grid helper for sub-regions (no last-row-stretch, just uniform grid) */
function makeSimpleGridSlots(
  count: number, x0: number, y0: number, availW: number, availH: number,
  spacingPx: number, canvasW: number, canvasH: number
): CollageSlot[] {
  if (count <= 0 || availW < 20 || availH < 20) return [];
  const cols = Math.max(1, count <= 2 ? 1 : 2);
  const rows = Math.ceil(count / cols);
  const cellW = (availW - spacingPx * (cols - 1)) / cols;
  const cellH = (availH - spacingPx * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    return createCollageSlot({
      type: "image",
      x: (x0 + c * (cellW + spacingPx)) / canvasW,
      y: (y0 + r * (cellH + spacingPx)) / canvasH,
      w: cellW / canvasW, h: cellH / canvasH
    });
  });
}

// ─── Frame (border) layout ────────────────────────────────────────────────────

/**
 * Images arranged as a decorative border/frame around the canvas.
 * Center is left empty (for text, QR code, or background).
 */
export function buildFrameCollageSlots(
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount < 4) {
    // Fallback to a simple 2-row grid
    return buildSimpleFrameGrid(imageCount, canvasW, canvasH, spacingPx, marginPx);
  }

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;

  // Determine cell size based on count: evenly distribute around the perimeter
  // Perimeter length (in cells) = 2*cols + 2*(rows-2)
  // We want roughly square cells: cellW ≈ cellH
  const aspect = usableW / usableH;
  // Solve: 2*cols + 2*(ceil(cols/aspect) - 2) = imageCount
  // Approximate: cols ≈ imageCount * aspect / (2 * (1 + aspect))
  const approxCols = Math.max(2, Math.round(imageCount * aspect / (2 * (1 + aspect))));
  const cols = Math.max(2, approxCols);
  const cellW = (usableW - spacingPx * (cols - 1)) / cols;
  const rows = Math.max(2, Math.round(cellW > 0 ? (usableH + spacingPx) / (cellW + spacingPx) : 3));
  const cellH = (usableH - spacingPx * (rows - 1)) / rows;

  const slots: CollageSlot[] = [];
  let idx = 0;

  // Top row (left to right)
  for (let c = 0; c < cols && idx < imageCount; c++, idx++) {
    const x = marginPx + c * (cellW + spacingPx);
    slots.push(createCollageSlot({ type: "image", x: x / canvasW, y: marginPx / canvasH, w: cellW / canvasW, h: cellH / canvasH }));
  }
  // Right column (top to bottom, excluding corners)
  for (let r = 1; r < rows - 1 && idx < imageCount; r++, idx++) {
    const y = marginPx + r * (cellH + spacingPx);
    const x = marginPx + (cols - 1) * (cellW + spacingPx);
    slots.push(createCollageSlot({ type: "image", x: x / canvasW, y: y / canvasH, w: cellW / canvasW, h: cellH / canvasH }));
  }
  // Bottom row (right to left)
  for (let c = cols - 1; c >= 0 && idx < imageCount; c--, idx++) {
    const x = marginPx + c * (cellW + spacingPx);
    const y = marginPx + (rows - 1) * (cellH + spacingPx);
    slots.push(createCollageSlot({ type: "image", x: x / canvasW, y: y / canvasH, w: cellW / canvasW, h: cellH / canvasH }));
  }
  // Left column (bottom to top, excluding corners)
  for (let r = rows - 2; r >= 1 && idx < imageCount; r--, idx++) {
    const y = marginPx + r * (cellH + spacingPx);
    slots.push(createCollageSlot({ type: "image", x: marginPx / canvasW, y: y / canvasH, w: cellW / canvasW, h: cellH / canvasH }));
  }

  return slots;
}

function buildSimpleFrameGrid(
  count: number, canvasW: number, canvasH: number, spacingPx: number, marginPx: number
): CollageSlot[] {
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  const cellW = (usableW - spacingPx * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => createCollageSlot({
    type: "image",
    x: (marginPx + i * (cellW + spacingPx)) / canvasW,
    y: marginPx / canvasH,
    w: cellW / canvasW,
    h: usableH / canvasH
  }));
}

// ─── Plus / cross layout ──────────────────────────────────────────────────────

/**
 * Images arranged in a + (plus/cross) pattern.
 * Center column runs full height; left and right arms extend horizontally.
 */
export function buildPlusCrossSlots(
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount < 5) {
    // Small counts: 3-column layout
    return buildSimpleThreeColumn(imageCount, canvasW, canvasH, spacingPx, marginPx);
  }

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const armH = usableH * 0.30; // height of horizontal arms
  const centerColW = usableW * 0.34;

  // Distribute: center column + top arm + bottom arm
  const centerCount = Math.max(1, Math.round(imageCount * (usableH / (usableH + 2 * armH * (usableW - centerColW) / centerColW))));
  const remaining = imageCount - centerCount;
  const topCount = Math.ceil(remaining / 2);
  const bottomCount = remaining - topCount;

  const centerX = marginPx + (usableW - centerColW) / 2;
  const centerCellH = (usableH - spacingPx * (centerCount - 1)) / centerCount;
  const armY_top = marginPx;
  const armY_bottom = marginPx + usableH - armH;
  const sideW = (usableW - centerColW - 2 * spacingPx) / 2;

  const slots: CollageSlot[] = [];

  // Center column (full height)
  for (let i = 0; i < centerCount; i++) {
    slots.push(createCollageSlot({
      type: "image", role: i === Math.floor(centerCount / 2) ? "hero" : "",
      x: centerX / canvasW,
      y: (marginPx + i * (centerCellH + spacingPx)) / canvasH,
      w: centerColW / canvasW, h: centerCellH / canvasH
    }));
  }

  // Top arm (left side + right side of arm)
  if (topCount > 0) {
    const leftTopCount = Math.ceil(topCount / 2);
    const rightTopCount = topCount - leftTopCount;
    if (leftTopCount > 0) {
      const w = (sideW - spacingPx * (leftTopCount - 1)) / leftTopCount;
      for (let i = 0; i < leftTopCount; i++) {
        slots.push(createCollageSlot({
          type: "image",
          x: (marginPx + i * (w + spacingPx)) / canvasW,
          y: armY_top / canvasH,
          w: w / canvasW, h: armH / canvasH
        }));
      }
    }
    if (rightTopCount > 0) {
      const rxStart = centerX + centerColW + spacingPx;
      const w = (sideW - spacingPx * (rightTopCount - 1)) / rightTopCount;
      for (let i = 0; i < rightTopCount; i++) {
        slots.push(createCollageSlot({
          type: "image",
          x: (rxStart + i * (w + spacingPx)) / canvasW,
          y: armY_top / canvasH,
          w: w / canvasW, h: armH / canvasH
        }));
      }
    }
  }

  // Bottom arm
  if (bottomCount > 0) {
    const leftBotCount = Math.ceil(bottomCount / 2);
    const rightBotCount = bottomCount - leftBotCount;
    if (leftBotCount > 0) {
      const w = (sideW - spacingPx * (leftBotCount - 1)) / leftBotCount;
      for (let i = 0; i < leftBotCount; i++) {
        slots.push(createCollageSlot({
          type: "image",
          x: (marginPx + i * (w + spacingPx)) / canvasW,
          y: armY_bottom / canvasH,
          w: w / canvasW, h: armH / canvasH
        }));
      }
    }
    if (rightBotCount > 0) {
      const rxStart = centerX + centerColW + spacingPx;
      const w = (sideW - spacingPx * (rightBotCount - 1)) / rightBotCount;
      for (let i = 0; i < rightBotCount; i++) {
        slots.push(createCollageSlot({
          type: "image",
          x: (rxStart + i * (w + spacingPx)) / canvasW,
          y: armY_bottom / canvasH,
          w: w / canvasW, h: armH / canvasH
        }));
      }
    }
  }

  return slots;
}

function buildSimpleThreeColumn(
  count: number, canvasW: number, canvasH: number, spacingPx: number, marginPx: number
): CollageSlot[] {
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  const cols = Math.min(count, 3);
  const cellW = (usableW - spacingPx * (cols - 1)) / cols;
  const rows = Math.ceil(count / cols);
  const cellH = (usableH - spacingPx * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    return createCollageSlot({
      type: "image",
      x: (marginPx + c * (cellW + spacingPx)) / canvasW,
      y: (marginPx + r * (cellH + spacingPx)) / canvasH,
      w: cellW / canvasW, h: cellH / canvasH
    });
  });
}

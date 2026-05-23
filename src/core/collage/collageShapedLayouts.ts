/**
 * Shaped collage layouts: circle, heart, diamond, cross, frame.
 *
 * KEY PRINCIPLE: boundary checks are done in PIXEL space so shapes look
 * geometrically correct regardless of canvas aspect ratio.
 * Cells are SQUARE in pixel space so circle/heart clips look correct.
 */
import { createCollageSlot } from "./collageFactory";
import { insetPolygon, polygonToCollageSlot, type Pt } from "./collageGeometryUtils";
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
  // IMPORTANT: Heart/Circle in the old collage app are not “each cell is a
  // heart/circle”. They are a normal/semi-normal grid clipped by ONE global
  // silhouette mask. We therefore generate rectangular internal slots inside
  // the tight mask bounds. The actual heart/circle silhouette is applied later
  // by KonvaLayerNode using metadata.globalMask on each collage frame.
  return buildMaskedShapeGridSlots(shape, imageCount, canvasW, canvasH, spacingPx, marginPx ?? spacingPx * 3);
}

interface ShapeBoundsPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

function buildMaskedShapeGridSlots(
  shape: "circle" | "heart",
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount <= 0) return [];

  const bounds = shape === "circle"
    ? circleMaskBounds(canvasW, canvasH, marginPx)
    : heartMaskBounds(canvasW, canvasH, marginPx);

  // Choose a rows×cols configuration that gives photo-friendly cells.
  // This mirrors the old Python pack_cells_in_shape approach: build a grid
  // inside the tight mask bbox, then the global silhouette clips the outside.
  const targetAR = 4 / 3;
  let bestRows = 1;
  let bestCols = imageCount;
  let bestScore = -Infinity;

  for (let rows = 1; rows <= imageCount; rows++) {
    const cols = Math.ceil(imageCount / rows);
    const cw = (bounds.w - spacingPx * (cols - 1)) / cols;
    const ch = (bounds.h - spacingPx * (rows - 1)) / rows;
    if (cw < 20 || ch < 20) continue;
    const ar = cw / Math.max(1, ch);
    const arScore = Math.exp(-Math.abs(Math.log(ar / targetAR)) * 1.2);
    const densityPenalty = Math.max(0, rows * cols - imageCount) * 0.035;
    const score = arScore - densityPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestRows = rows;
      bestCols = cols;
    }
  }

  const cellW = (bounds.w - spacingPx * (bestCols - 1)) / bestCols;
  const cellH = (bounds.h - spacingPx * (bestRows - 1)) / bestRows;
  const slots: CollageSlot[] = [];
  let placed = 0;

  for (let row = 0; row < bestRows && placed < imageCount; row++) {
    const cellsInRow = Math.min(bestCols, imageCount - placed);
    const rowOffsetX = (bestCols - cellsInRow) * (cellW + spacingPx) / 2;
    for (let col = 0; col < cellsInRow && placed < imageCount; col++) {
      const x = bounds.x + rowOffsetX + col * (cellW + spacingPx);
      const y = bounds.y + row * (cellH + spacingPx);
      slots.push(createCollageSlot({
        type: "image",
        shape: "rect",
        role: placed === 0 && imageCount <= 5 ? "hero" : "standard",
        label: shape === "heart" ? `לב ${placed + 1}` : `עיגול ${placed + 1}`,
        x: x / canvasW,
        y: y / canvasH,
        w: Math.max(1, cellW) / canvasW,
        h: Math.max(1, cellH) / canvasH,
        metadata: { globalMaskShape: shape }
      }));
      placed++;
    }
  }

  return slots;
}

function circleMaskBounds(canvasW: number, canvasH: number, marginPx: number): ShapeBoundsPx {
  const d = Math.max(1, Math.min(canvasW, canvasH) - 2 * marginPx);
  return { x: (canvasW - d) / 2, y: (canvasH - d) / 2, w: d, h: d };
}

function heartMaskBounds(canvasW: number, canvasH: number, marginPx: number): ShapeBoundsPx {
  // Same parametric heart family as the old Python renderer. Sample points,
  // scale to the available canvas, then return the tight pixel bbox.
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 720; i++) {
    const t = (i / 720) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push({ x, y });
  }
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const srcW = Math.max(1, maxX - minX);
  const srcH = Math.max(1, maxY - minY);
  const scale = Math.min((canvasW - 2 * marginPx) / srcW, (canvasH - 2 * marginPx) / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h };
}

// ─── Artistic non-overlapping shaped recipes ─────────────────────────────────

function distributeCounts(total: number, weights: number[]): number[] {
  const counts = weights.map(() => 0);
  if (total <= 0 || weights.length === 0) return counts;
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * total);
  let used = 0;
  for (let i = 0; i < raw.length; i++) {
    counts[i] = Math.floor(raw[i]);
    used += counts[i];
  }
  while (used < total) {
    let best = 0;
    let bestFraction = -1;
    for (let i = 0; i < raw.length; i++) {
      const fraction = raw[i] - Math.floor(raw[i]);
      if (fraction > bestFraction) { bestFraction = fraction; best = i; }
    }
    counts[best]++;
    raw[best] = Math.floor(raw[best]);
    used++;
  }
  return counts;
}

function gridRegion(
  count: number,
  x: number,
  y: number,
  w: number,
  h: number,
  spacingPx: number,
  canvasW: number,
  canvasH: number,
  maxCols?: number
): CollageSlot[] {
  if (count <= 0 || w <= 12 || h <= 12) return [];
  const cols = Math.min(count, Math.max(1, maxCols ?? Math.ceil(Math.sqrt(count * (w / Math.max(h, 1))))));
  const rows = Math.ceil(count / cols);
  const cellW = (w - spacingPx * (cols - 1)) / cols;
  const cellH = (h - spacingPx * (rows - 1)) / rows;
  if (cellW <= 8 || cellH <= 8) return [];
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, count - rowStart);
    const wCell = rowCount < cols ? (w - spacingPx * (rowCount - 1)) / rowCount : cellW;
    const xCell = rowCount < cols ? x + (i - rowStart) * (wCell + spacingPx) : x + (i % cols) * (cellW + spacingPx);
    const yCell = y + row * (cellH + spacingPx);
    return createCollageSlot({ type: "image", x: xCell / canvasW, y: yCell / canvasH, w: wCell / canvasW, h: cellH / canvasH });
  });
}

function buildArtisticHeartSlots(
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount <= 1) {
    return [createCollageSlot({
      type: "image", role: "hero", shape: "heart",
      x: marginPx / canvasW, y: marginPx / canvasH,
      w: (canvasW - 2 * marginPx) / canvasW,
      h: (canvasH - 2 * marginPx) / canvasH
    })];
  }

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const cx = marginPx + usableW / 2;
  const cy = marginPx + usableH / 2;
  const heroW = Math.min(usableW * 0.34, usableH * 0.34);
  const heroH = Math.min(usableH * 0.42, usableW * 0.42);
  const heroX = cx - heroW / 2;
  const heroY = cy - heroH / 2;

  const hero = createCollageSlot({
    type: "image",
    role: "hero",
    shape: "heart",
    x: heroX / canvasW,
    y: heroY / canvasH,
    w: heroW / canvasW,
    h: heroH / canvasH,
    zIndex: 20,
    label: "לב מרכזי"
  });

  const topH = Math.max(0, heroY - marginPx - spacingPx);
  const midH = heroH;
  const bottomY = heroY + heroH + spacingPx;
  const bottomH = Math.max(0, marginPx + usableH - bottomY);
  const leftW = Math.max(0, heroX - marginPx - spacingPx);
  const rightX = heroX + heroW + spacingPx;
  const rightW = Math.max(0, marginPx + usableW - rightX);

  const regions = [
    { x: marginPx, y: marginPx, w: usableW, h: topH, weight: 1.25, cols: 2 },
    { x: marginPx, y: heroY, w: leftW, h: midH, weight: 1.0, cols: 1 },
    { x: rightX, y: heroY, w: rightW, h: midH, weight: 1.0, cols: 1 },
    { x: marginPx, y: bottomY, w: usableW, h: bottomH, weight: 1.45, cols: 3 },
  ].filter((r) => r.w > 16 && r.h > 16);

  const counts = distributeCounts(imageCount - 1, regions.map((r) => r.weight * r.w * r.h));
  const slots: CollageSlot[] = [hero];
  regions.forEach((r, i) => slots.push(...gridRegion(counts[i], r.x, r.y, r.w, r.h, spacingPx, canvasW, canvasH, r.cols)));
  return slots.slice(0, imageCount);
}

function buildArtisticCircleSlots(
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount <= 1) {
    return [createCollageSlot({
      type: "image", role: "hero", shape: "circle",
      x: marginPx / canvasW, y: marginPx / canvasH,
      w: (canvasW - 2 * marginPx) / canvasW,
      h: (canvasH - 2 * marginPx) / canvasH
    })];
  }

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const cx = marginPx + usableW / 2;
  const cy = marginPx + usableH / 2;
  const heroD = Math.min(usableW, usableH) * 0.34;
  const heroX = cx - heroD / 2;
  const heroY = cy - heroD / 2;

  const hero = createCollageSlot({
    type: "image",
    role: "hero",
    shape: "circle",
    x: heroX / canvasW,
    y: heroY / canvasH,
    w: heroD / canvasW,
    h: heroD / canvasH,
    zIndex: 20,
    label: "עיגול מרכזי"
  });

  const topH = Math.max(0, heroY - marginPx - spacingPx);
  const midH = heroD;
  const bottomY = heroY + heroD + spacingPx;
  const bottomH = Math.max(0, marginPx + usableH - bottomY);
  const leftW = Math.max(0, heroX - marginPx - spacingPx);
  const rightX = heroX + heroD + spacingPx;
  const rightW = Math.max(0, marginPx + usableW - rightX);
  const regions = [
    { x: marginPx, y: marginPx, w: usableW, h: topH, weight: 1.1, cols: 3 },
    { x: marginPx, y: heroY, w: leftW, h: midH, weight: 1.0, cols: 1 },
    { x: rightX, y: heroY, w: rightW, h: midH, weight: 1.0, cols: 1 },
    { x: marginPx, y: bottomY, w: usableW, h: bottomH, weight: 1.25, cols: 3 },
  ].filter((r) => r.w > 16 && r.h > 16);

  const counts = distributeCounts(imageCount - 1, regions.map((r) => r.weight * r.w * r.h));
  const slots: CollageSlot[] = [hero];
  regions.forEach((r, i) => slots.push(...gridRegion(counts[i], r.x, r.y, r.w, r.h, spacingPx, canvasW, canvasH, r.cols)));
  return slots.slice(0, imageCount);
}

// ─── Diamond center layout ───────────────────────────────────────────────────

/**
 * Stable centre-diamond composition. Surrounding cells are kept outside the
 * diamond bounding box so photos do not accidentally stack on top of each other.
 */
export function buildDiamondCenterSlots(
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount < 3) {
    return [createCollageSlot({ type: "image", x: marginPx / canvasW, y: marginPx / canvasH, w: (canvasW - 2 * marginPx) / canvasW, h: (canvasH - 2 * marginPx) / canvasH })];
  }

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  if (usableW <= 40 || usableH <= 40) return [];

  const geometry = diamondGeometry(usableW, usableH, marginPx, imageCount);
  const slots = imageCount <= 9
    ? buildClassicDiamondGeometry(imageCount, geometry, canvasW, canvasH, spacingPx)
    : buildHybridDiamondGeometry(imageCount, geometry, canvasW, canvasH, spacingPx);

  return slots.length === imageCount ? slots : buildHybridDiamondGeometry(imageCount, geometry, canvasW, canvasH, spacingPx);
}

interface DiamondGeometry {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
  diamondW: number;
  diamondH: number;
  topPoint: Pt;
  rightPoint: Pt;
  bottomPoint: Pt;
  leftPoint: Pt;
  diamondLeft: number;
  diamondTop: number;
  diamondRight: number;
  diamondBottom: number;
}

function diamondGeometry(usableW: number, usableH: number, marginPx: number, imageCount: number): DiamondGeometry {
  const left = marginPx;
  const top = marginPx;
  const right = marginPx + usableW;
  const bottom = marginPx + usableH;
  const cx = left + usableW / 2;
  const cy = top + usableH / 2;
  const aspect = usableW / Math.max(1, usableH);
  const countScale = imageCount <= 5 ? 1 : imageCount <= 9 ? 0.94 : 0.84;
  const wRatio = clamp(aspect >= 1.2 ? 0.36 : 0.42, 0.3, 0.45) * countScale;
  const hRatio = clamp(aspect >= 1.2 ? 0.38 : 0.32, 0.25, 0.4) * countScale;
  const diamondW = clamp(usableW * wRatio, usableW * 0.30, usableW * 0.45);
  const diamondH = clamp(usableH * hRatio, usableH * 0.25, usableH * 0.40);
  const diamondLeft = cx - diamondW / 2;
  const diamondRight = cx + diamondW / 2;
  const diamondTop = cy - diamondH / 2;
  const diamondBottom = cy + diamondH / 2;

  return {
    left,
    top,
    right,
    bottom,
    cx,
    cy,
    diamondW,
    diamondH,
    topPoint: { x: cx, y: diamondTop },
    rightPoint: { x: diamondRight, y: cy },
    bottomPoint: { x: cx, y: diamondBottom },
    leftPoint: { x: diamondLeft, y: cy },
    diamondLeft,
    diamondTop,
    diamondRight,
    diamondBottom,
  };
}

function buildClassicDiamondGeometry(
  imageCount: number,
  g: DiamondGeometry,
  canvasW: number,
  canvasH: number,
  spacingPx: number
): CollageSlot[] {
  const center = diamondSlot([g.topPoint, g.rightPoint, g.bottomPoint, g.leftPoint], canvasW, canvasH, spacingPx, "יהלום מרכזי", "hero", 30);
  if (!center) return [];

  const corner = {
    topLeft: [pt(g.left, g.top), pt(g.cx, g.top), g.topPoint, g.leftPoint, pt(g.left, g.cy)],
    topRight: [pt(g.cx, g.top), pt(g.right, g.top), pt(g.right, g.cy), g.rightPoint, g.topPoint],
    bottomRight: [pt(g.right, g.cy), pt(g.right, g.bottom), pt(g.cx, g.bottom), g.bottomPoint, g.rightPoint],
    bottomLeft: [pt(g.left, g.cy), g.leftPoint, g.bottomPoint, pt(g.cx, g.bottom), pt(g.left, g.bottom)],
  };

  const split = {
    topLeftTop: [pt(g.left, g.top), pt(g.cx, g.top), g.topPoint],
    topLeftSide: [pt(g.left, g.top), g.topPoint, g.leftPoint, pt(g.left, g.cy)],
    topRightTop: [pt(g.cx, g.top), pt(g.right, g.top), g.topPoint],
    topRightSide: [pt(g.right, g.top), pt(g.right, g.cy), g.rightPoint, g.topPoint],
    bottomRightSide: [pt(g.right, g.cy), pt(g.right, g.bottom), g.bottomPoint, g.rightPoint],
    bottomRightBottom: [g.bottomPoint, pt(g.right, g.bottom), pt(g.cx, g.bottom)],
    bottomLeftBottom: [pt(g.left, g.bottom), pt(g.cx, g.bottom), g.bottomPoint],
    bottomLeftSide: [pt(g.left, g.cy), g.leftPoint, g.bottomPoint, pt(g.left, g.bottom)],
  };

  const recipes: Pt[][] = imageCount === 3
    ? [
        [pt(g.left, g.top), pt(g.right, g.top), pt(g.right, g.cy), g.rightPoint, g.topPoint, g.leftPoint, pt(g.left, g.cy)],
        [pt(g.left, g.cy), g.leftPoint, g.bottomPoint, g.rightPoint, pt(g.right, g.cy), pt(g.right, g.bottom), pt(g.left, g.bottom)],
      ]
    : imageCount === 4
      ? [
          [pt(g.left, g.top), pt(g.right, g.top), pt(g.right, g.cy), g.rightPoint, g.topPoint, g.leftPoint, pt(g.left, g.cy)],
          corner.bottomLeft,
          corner.bottomRight,
        ]
      : imageCount === 5
        ? [corner.topLeft, corner.topRight, corner.bottomLeft, corner.bottomRight]
        : imageCount === 6
          ? [split.topLeftTop, split.topLeftSide, corner.topRight, corner.bottomLeft, corner.bottomRight]
          : imageCount === 7
            ? [split.topLeftTop, split.topLeftSide, split.topRightTop, split.topRightSide, corner.bottomLeft, corner.bottomRight]
            : imageCount === 8
              ? [split.topLeftTop, split.topLeftSide, split.topRightTop, split.topRightSide, split.bottomLeftBottom, split.bottomLeftSide, corner.bottomRight]
              : [
                  split.topLeftTop,
                  split.topLeftSide,
                  split.topRightTop,
                  split.topRightSide,
                  split.bottomLeftSide,
                  split.bottomLeftBottom,
                  split.bottomRightSide,
                  split.bottomRightBottom,
                ];

  const surrounding = recipes.flatMap((polygon, index) => {
    const slot = diamondSlot(polygon, canvasW, canvasH, spacingPx, `יהלום ${index + 2}`, "standard", index);
    return slot ? [slot] : [];
  });

  return [center, ...surrounding].slice(0, imageCount);
}

function buildHybridDiamondGeometry(
  imageCount: number,
  g: DiamondGeometry,
  canvasW: number,
  canvasH: number,
  spacingPx: number
): CollageSlot[] {
  const center = diamondSlot([g.topPoint, g.rightPoint, g.bottomPoint, g.leftPoint], canvasW, canvasH, spacingPx, "יהלום מרכזי", "hero", 30);
  if (!center) return [];

  const fixedCornerPolygons = [
    [pt(g.diamondLeft, g.diamondTop), g.topPoint, g.leftPoint],
    [g.topPoint, pt(g.diamondRight, g.diamondTop), g.rightPoint],
    [g.leftPoint, g.bottomPoint, pt(g.diamondLeft, g.diamondBottom)],
    [g.rightPoint, pt(g.diamondRight, g.diamondBottom), g.bottomPoint],
  ];

  const remaining = imageCount - 1 - fixedCornerPolygons.length;
  const regions = [
    { x: g.left, y: g.top, w: g.right - g.left, h: Math.max(0, g.diamondTop - g.top), weight: (g.right - g.left) * Math.max(0, g.diamondTop - g.top), cols: undefined as number | undefined },
    { x: g.left, y: g.diamondBottom, w: g.right - g.left, h: Math.max(0, g.bottom - g.diamondBottom), weight: (g.right - g.left) * Math.max(0, g.bottom - g.diamondBottom), cols: undefined as number | undefined },
    { x: g.left, y: g.diamondTop, w: Math.max(0, g.diamondLeft - g.left), h: g.diamondH, weight: Math.max(0, g.diamondLeft - g.left) * g.diamondH, cols: 1 },
    { x: g.diamondRight, y: g.diamondTop, w: Math.max(0, g.right - g.diamondRight), h: g.diamondH, weight: Math.max(0, g.right - g.diamondRight) * g.diamondH, cols: 1 },
  ].filter((r) => r.w > 24 && r.h > 24);

  const counts = distributeCounts(Math.max(0, remaining), regions.map((r) => r.weight));
  const slots: CollageSlot[] = [center];
  fixedCornerPolygons.forEach((polygon, index) => {
    const slot = diamondSlot(polygon, canvasW, canvasH, spacingPx, `יהלום פינה ${index + 1}`, "standard", index);
    if (slot) slots.push(slot);
  });
  regions.forEach((region, index) => {
    slots.push(...polygonGridRegion(counts[index], region.x, region.y, region.w, region.h, spacingPx, canvasW, canvasH, region.cols));
  });

  return slots.slice(0, imageCount);
}

function diamondSlot(
  points: Pt[],
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  label: string,
  role: CollageSlot["role"],
  zIndex: number
): CollageSlot | null {
  return polygonToCollageSlot(insetPolygon(points, spacingPx / 2), canvasW, canvasH, {
    shape: "polygon",
    label,
    role,
    zIndex,
  });
}

function polygonGridRegion(
  count: number,
  x: number,
  y: number,
  w: number,
  h: number,
  spacingPx: number,
  canvasW: number,
  canvasH: number,
  maxCols?: number
): CollageSlot[] {
  if (count <= 0 || w <= 12 || h <= 12) return [];
  const cols = Math.min(count, Math.max(1, maxCols ?? Math.ceil(Math.sqrt(count * (w / Math.max(h, 1))))));
  const rows = Math.ceil(count / cols);
  const cellW = (w - spacingPx * (cols - 1)) / cols;
  const cellH = (h - spacingPx * (rows - 1)) / rows;
  if (cellW <= 12 || cellH <= 12) return [];

  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, count - rowStart);
    const wCell = rowCount < cols ? (w - spacingPx * (rowCount - 1)) / rowCount : cellW;
    const xCell = rowCount < cols ? x + (i - rowStart) * (wCell + spacingPx) : x + (i % cols) * (cellW + spacingPx);
    const yCell = y + row * (cellH + spacingPx);
    return diamondSlot(
      [pt(xCell, yCell), pt(xCell + wCell, yCell), pt(xCell + wCell, yCell + cellH), pt(xCell, yCell + cellH)],
      canvasW,
      canvasH,
      0,
      `יהלום פס ${i + 1}`,
      "standard",
      i
    );
  }).filter((slot): slot is CollageSlot => Boolean(slot));
}

function pt(x: number, y: number): Pt {
  return { x, y };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Simple grid helper for sub-regions (no last-row-stretch, just uniform grid) */
function makeSimpleGridSlots(
  count: number, x0: number, y0: number, availW: number, availH: number,
  spacingPx: number, canvasW: number, canvasH: number
): CollageSlot[] {
  return gridRegion(count, x0, y0, availW, availH, spacingPx, canvasW, canvasH);
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
  if (imageCount < 5) {
    // Fallback to a simple 2-row grid
    return buildSimpleFrameGrid(imageCount, canvasW, canvasH, spacingPx, marginPx);
  }

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const ringCount = imageCount - 1;
  const frameThickness = Math.min(usableW, usableH) * (imageCount <= 8 ? 0.22 : 0.18);
  const centerX = marginPx + frameThickness + spacingPx;
  const centerY = marginPx + frameThickness + spacingPx;
  const centerW = usableW - 2 * (frameThickness + spacingPx);
  const centerH = usableH - 2 * (frameThickness + spacingPx);

  if (centerW < 40 || centerH < 40) {
    return buildSimpleFrameGrid(imageCount, canvasW, canvasH, spacingPx, marginPx);
  }

  const hero = createCollageSlot({
    type: "image",
    role: "hero",
    label: "מרכז מסגרת",
    x: centerX / canvasW,
    y: centerY / canvasH,
    w: centerW / canvasW,
    h: centerH / canvasH,
    zIndex: 10,
  });

  const regions = [
    { x: marginPx, y: marginPx, w: usableW, h: frameThickness, weight: usableW, cols: Math.ceil(ringCount / 4) + 1 },
    { x: marginPx, y: centerY + centerH + spacingPx, w: usableW, h: frameThickness, weight: usableW, cols: Math.ceil(ringCount / 4) + 1 },
    { x: marginPx, y: centerY, w: frameThickness, h: centerH, weight: centerH, cols: 1 },
    { x: centerX + centerW + spacingPx, y: centerY, w: frameThickness, h: centerH, weight: centerH, cols: 1 },
  ].filter((region) => region.w > 16 && region.h > 16);

  const counts = distributeCounts(ringCount, regions.map((region) => region.weight));
  const frameSlots: CollageSlot[] = [];
  regions.forEach((region, index) => {
    frameSlots.push(...gridRegion(counts[index], region.x, region.y, region.w, region.h, spacingPx, canvasW, canvasH, region.cols));
  });

  return [hero, ...frameSlots].slice(0, imageCount);
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

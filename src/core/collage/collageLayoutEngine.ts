import { createCollageSlot } from "./collageFactory";
import { computeSplitTreeSlots, buildSplitTree } from "./collageSplitTree";
import { buildDiagonalBands } from "./collageDiagonal";
import { buildShapedCollageSlots, buildDiamondCenterSlots, buildFrameCollageSlots, buildPlusCrossSlots } from "./collageShapedLayouts";
import { buildPuzzleSlots } from "./collagePuzzle";
import { buildSteppedMosaicSlots, buildTrapezoidSplitSlots, buildWaveSplitSlots } from "./collageV6Layouts";
import { buildDynamicCollageSlots } from "./collageDynamicLayouts";
import type { CollageLayoutFamily, CollageLayoutParams, CollageSlot } from "@/types/collage";

// ─── Core building block (port of Python _make_grid_cells) ──────────────────
export function makeGridSlots(
  count: number,
  xPx: number, yPx: number,
  availWPx: number, availHPx: number,
  spacingPx: number, maxCols: number,
  canvasW: number, canvasH: number,
  role: "" | "hero" | "accent" | "standard" = ""
): CollageSlot[] {
  if (count <= 0) return [];
  const cols = Math.min(count, Math.max(1, maxCols));
  const rows = Math.ceil(count / cols);
  const cellW = (availWPx - spacingPx * (cols - 1)) / cols;
  const cellH = (availHPx - spacingPx * (rows - 1)) / rows;

  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, count - rowStart);
    let xCell: number, wCell: number;
    if (rowCount < cols) {
      wCell = (availWPx - spacingPx * (rowCount - 1)) / rowCount;
      xCell = xPx + (i - rowStart) * (wCell + spacingPx);
    } else {
      wCell = cellW;
      xCell = xPx + (i % cols) * (cellW + spacingPx);
    }
    const yCell = yPx + row * (cellH + spacingPx);
    return createCollageSlot({ type: "image", role, x: xCell / canvasW, y: yCell / canvasH, w: wCell / canvasW, h: cellH / canvasH });
  });
}

// Auto-select columns for grid layout (port of Python _grid_layout column selection)
function autoGridCols(n: number): number {
  if (n <= 2) return n;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  if (n <= 16) return 4;
  return 5;
}

// ─── All 20 generators ──────────────────────────────────────────────────────

function generateGridSlots(p: CollageLayoutParams): CollageSlot[] {
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  return makeGridSlots(n, marginPx, marginPx, usableW, usableH, spacingPx, autoGridCols(n), canvasW, canvasH);
}

function generateHeroSlots(p: CollageLayoutParams): CollageSlot[] {
  // Hero top (Python _hero_top_layout)
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  if (n === 1) return [createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: usableW/canvasW, h: usableH/canvasH })];
  const heroH = usableH * 0.55, belowH = usableH - heroH - spacingPx;
  const hero = createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: usableW/canvasW, h: heroH/canvasH });
  const below = makeGridSlots(n - 1, marginPx, marginPx + heroH + spacingPx, usableW, belowH, spacingPx, Math.min(n - 1, 4), canvasW, canvasH);
  return [hero, ...below];
}

function generateHeroBottomSlots(p: CollageLayoutParams): CollageSlot[] {
  // Python _hero_bottom_layout
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  if (n === 1) return [createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: usableW/canvasW, h: usableH/canvasH })];
  const thumbH = usableH * 0.35, heroH = usableH - thumbH - spacingPx;
  const thumbs = makeGridSlots(n - 1, marginPx, marginPx, usableW, thumbH, spacingPx, Math.min(n - 1, 4), canvasW, canvasH);
  const hero = createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: (marginPx + thumbH + spacingPx)/canvasH, w: usableW/canvasW, h: heroH/canvasH });
  return [...thumbs, hero];
}

function generateHeroLeftSlots(p: CollageLayoutParams): CollageSlot[] {
  // Python _feature_left_layout (58% left)
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  if (n === 1) return [createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: usableW/canvasW, h: usableH/canvasH })];
  const leftW = usableW * 0.58, rightW = usableW - leftW - spacingPx;
  const hero = createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: leftW/canvasW, h: usableH/canvasH });
  const right = makeGridSlots(n - 1, marginPx + leftW + spacingPx, marginPx, rightW, usableH, spacingPx, 2, canvasW, canvasH);
  return [hero, ...right];
}

function generateMagazineSlots(p: CollageLayoutParams): CollageSlot[] {
  // Python _magazine_layout (60% left)
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  if (n === 1) return [createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: usableW/canvasW, h: usableH/canvasH })];
  const leftW = usableW * 0.60, rightW = usableW - leftW - spacingPx;
  const hero = createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: leftW/canvasW, h: usableH/canvasH });
  const right = makeGridSlots(n - 1, marginPx + leftW + spacingPx, marginPx, rightW, usableH, spacingPx, 2, canvasW, canvasH);
  return [hero, ...right];
}

function generateMosaicSlots(p: CollageLayoutParams): CollageSlot[] {
  // Python _mosaic_layout: 62%/38% top pair + grid below
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n <= 2) return generateGridSlots(p);
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  const topH = usableH * 0.48, bottomH = usableH - topH - spacingPx;
  const leftW = usableW * 0.62, rightW = usableW - leftW - spacingPx;
  const topLeft = createCollageSlot({ type: "image", x: marginPx/canvasW, y: marginPx/canvasH, w: leftW/canvasW, h: topH/canvasH });
  const topRight = createCollageSlot({ type: "image", x: (marginPx + leftW + spacingPx)/canvasW, y: marginPx/canvasH, w: rightW/canvasW, h: topH/canvasH });
  const below = makeGridSlots(n - 2, marginPx, marginPx + topH + spacingPx, usableW, bottomH, spacingPx, Math.min(n - 2, 3), canvasW, canvasH);
  return [topLeft, topRight, ...below];
}

function generateStripSlots(p: CollageLayoutParams): CollageSlot[] {
  // Python _strip_layout: single row (or wrap to 2 for >6)
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  const cols = n > 6 ? Math.ceil(n / 2) : n;
  return makeGridSlots(n, marginPx, marginPx, usableW, usableH, spacingPx, cols, canvasW, canvasH);
}

function generateDualHeroSlots(p: CollageLayoutParams): CollageSlot[] {
  // Python _dual_hero_layout
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n < 2) return generateGridSlots(p);
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  const heroW = (usableW - spacingPx) / 2;
  if (n === 2) {
    return [
      createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: heroW/canvasW, h: usableH/canvasH }),
      createCollageSlot({ type: "image", role: "hero", x: (marginPx + heroW + spacingPx)/canvasW, y: marginPx/canvasH, w: heroW/canvasW, h: usableH/canvasH }),
    ];
  }
  const heroH = usableH * 0.55, belowH = usableH - heroH - spacingPx;
  const h1 = createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: heroW/canvasW, h: heroH/canvasH });
  const h2 = createCollageSlot({ type: "image", role: "hero", x: (marginPx + heroW + spacingPx)/canvasW, y: marginPx/canvasH, w: heroW/canvasW, h: heroH/canvasH });
  const below = makeGridSlots(n - 2, marginPx, marginPx + heroH + spacingPx, usableW, belowH, spacingPx, Math.min(n - 2, 4), canvasW, canvasH);
  return [h1, h2, ...below];
}

function generateTriptychSlots(p: CollageLayoutParams): CollageSlot[] {
  // Python _triptych_layout
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n < 3) return generateGridSlots(p);
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  const colW = (usableW - 2 * spacingPx) / 3;
  if (n === 3) {
    return [0, 1, 2].map(i => createCollageSlot({ type: "image", x: (marginPx + i * (colW + spacingPx))/canvasW, y: marginPx/canvasH, w: colW/canvasW, h: usableH/canvasH }));
  }
  const triH = usableH * 0.60, belowH = usableH - triH - spacingPx;
  const top = [0, 1, 2].map(i => createCollageSlot({ type: "image", x: (marginPx + i * (colW + spacingPx))/canvasW, y: marginPx/canvasH, w: colW/canvasW, h: triH/canvasH }));
  const below = makeGridSlots(n - 3, marginPx, marginPx + triH + spacingPx, usableW, belowH, spacingPx, Math.min(n - 3, 4), canvasW, canvasH);
  return [...top, ...below];
}

function generateWideBannerSlots(p: CollageLayoutParams): CollageSlot[] {
  // Python _wide_banner_layout
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  if (n === 1) return [createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: usableW/canvasW, h: usableH/canvasH })];
  const bannerH = usableH * 0.30, belowH = usableH - bannerH - spacingPx;
  const banner = createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: usableW/canvasW, h: bannerH/canvasH });
  const below = makeGridSlots(n - 1, marginPx, marginPx + bannerH + spacingPx, usableW, belowH, spacingPx, Math.min(n - 1, 4), canvasW, canvasH);
  return [banner, ...below];
}

function generateStaircaseSlots(p: CollageLayoutParams): CollageSlot[] {
  // Python _cascade_layout: hero top-left + medium top-right + small cells bottom
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n < 3) return generateGridSlots(p);
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  const leftW = usableW * 0.55, rightW = usableW - leftW - spacingPx;
  const topH = usableH * 0.60, bottomH = usableH - topH - spacingPx;
  const rightX = marginPx + leftW + spacingPx;
  const hero = createCollageSlot({ type: "image", role: "hero", x: marginPx/canvasW, y: marginPx/canvasH, w: leftW/canvasW, h: topH/canvasH });
  const topRightCount = Math.min(2, n - 1);
  const topRight = makeGridSlots(topRightCount, rightX, marginPx, rightW, topH, spacingPx, 1, canvasW, canvasH);
  const placed = 1 + topRightCount;
  const remaining = n - placed;
  if (remaining <= 0) return [hero, ...topRight];
  const bottom = makeGridSlots(remaining, marginPx, marginPx + topH + spacingPx, usableW, bottomH, spacingPx, Math.min(remaining, 4), canvasW, canvasH);
  return [hero, ...topRight, ...bottom];
}

function generateFilmStripSlots(p: CollageLayoutParams): CollageSlot[] {
  // Three rows: 36% / 29% / remaining
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n < 3) return generateGridSlots(p);
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  const row1H = usableH * 0.36, row2H = usableH * 0.29, row3H = usableH - row1H - row2H - 2 * spacingPx;
  const perRow = Math.ceil(n / 3);
  const r1Count = Math.min(perRow, n), r2Count = Math.min(perRow, n - r1Count), r3Count = n - r1Count - r2Count;
  const row1 = makeGridSlots(r1Count, marginPx, marginPx, usableW, row1H, spacingPx, r1Count, canvasW, canvasH);
  const row2 = makeGridSlots(r2Count, marginPx, marginPx + row1H + spacingPx, usableW, row2H, spacingPx, r2Count, canvasW, canvasH);
  const row3 = r3Count > 0 ? makeGridSlots(r3Count, marginPx, marginPx + row1H + row2H + 2 * spacingPx, usableW, row3H, spacingPx, r3Count, canvasW, canvasH) : [];
  return [...row1, ...row2, ...row3];
}

function generateRingFocusSlots(p: CollageLayoutParams): CollageSlot[] {
  // Central image ON TOP (highest zIndex), smaller (35%), surrounded by cells in 4 strips
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx } = p;
  if (n < 4) return generateGridSlots(p);
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;

  // Center: 35% of usable area, centered, ON TOP
  const centerW = usableW * 0.35, centerH = usableH * 0.35;
  const centerX = marginPx + (usableW - centerW) / 2;
  const centerY = marginPx + (usableH - centerH) / 2;
  const center = createCollageSlot({
    type: "image", role: "hero",
    x: centerX / canvasW, y: centerY / canvasH,
    w: centerW / canvasW, h: centerH / canvasH,
    zIndex: n,  // rendered LAST = on top
  });

  const surrounding = n - 1;
  // Distribute surrounding cells in 4 strips
  const topH = centerY - marginPx - spacingPx;
  const bottomH = (marginPx + usableH) - (centerY + centerH) - spacingPx;
  const leftW = centerX - marginPx - spacingPx;
  const rightW = (marginPx + usableW) - (centerX + centerW) - spacingPx;

  // Proportional distribution based on strip areas
  const perimeter = 2 * usableW + 2 * centerH;
  const topShare = topH > 10 ? usableW / perimeter : 0;
  const bottomShare = bottomH > 10 ? usableW / perimeter : 0;
  const leftShare = leftW > 10 ? centerH / perimeter : 0;
  const rightShare = rightW > 10 ? centerH / perimeter : 0;
  const total = topShare + bottomShare + leftShare + rightShare || 1;

  const topCount = Math.round(surrounding * topShare / total);
  const bottomCount = Math.round(surrounding * bottomShare / total);
  const leftCount = Math.round(surrounding * leftShare / total);
  const rightCount = surrounding - topCount - bottomCount - leftCount;

  const slots: CollageSlot[] = [center];
  if (topCount > 0 && topH > 20)
    slots.push(...makeGridSlots(topCount, marginPx, marginPx, usableW, topH, spacingPx, topCount, canvasW, canvasH));
  if (bottomCount > 0 && bottomH > 20)
    slots.push(...makeGridSlots(bottomCount, marginPx, centerY + centerH + spacingPx, usableW, bottomH, spacingPx, bottomCount, canvasW, canvasH));
  if (leftCount > 0 && leftW > 20)
    slots.push(...makeGridSlots(leftCount, marginPx, centerY, leftW, centerH, spacingPx, 1, canvasW, canvasH));
  if (rightCount > 0 && rightW > 20)
    slots.push(...makeGridSlots(rightCount, centerX + centerW + spacingPx, centerY, rightW, centerH, spacingPx, 1, canvasW, canvasH));

  return slots;
}

function generateArtisticLayeredSlots(p: CollageLayoutParams): CollageSlot[] {
  // Overlapping rotated cards arranged in a slight spiral
  const { imageCount: n, canvasW, canvasH, marginPx } = p;
  const usableW = canvasW - 2 * marginPx, usableH = canvasH - 2 * marginPx;
  const cardW = usableW * 0.55, cardH = usableH * 0.55;
  const rotations = [-12, -6, 0, 6, 12, -9, 9, -3, 3, 15];
  const positions: Array<{cx: number; cy: number}> = [
    { cx: 0.5, cy: 0.5 },
    { cx: 0.38, cy: 0.42 },
    { cx: 0.62, cy: 0.42 },
    { cx: 0.45, cy: 0.60 },
    { cx: 0.58, cy: 0.58 },
    { cx: 0.30, cy: 0.55 },
    { cx: 0.70, cy: 0.55 },
    { cx: 0.50, cy: 0.30 },
    { cx: 0.35, cy: 0.30 },
    { cx: 0.65, cy: 0.30 },
  ];
  return Array.from({ length: Math.min(n, 10) }, (_, i) => {
    const pos = positions[i] ?? { cx: 0.5, cy: 0.5 };
    return createCollageSlot({
      type: "image",
      x: pos.cx - (cardW / canvasW) / 2,
      y: pos.cy - (cardH / canvasH) / 2,
      w: cardW / canvasW,
      h: cardH / canvasH,
      rotationDeg: rotations[i % rotations.length] ?? 0,
      zIndex: i,
    });
  });
}

function generateSplitTreeSlots(p: CollageLayoutParams): CollageSlot[] {
  const { imageCount: n, canvasW, canvasH, spacingPx, marginPx, splitTree } = p;
  const tree = splitTree ?? buildSplitTree(n);
  return computeSplitTreeSlots(tree, canvasW, canvasH, spacingPx, marginPx);
}

function generateDiagonalBandSlots(p: CollageLayoutParams): CollageSlot[] {
  const { imageCount: n, canvasW, canvasH, spacingPx } = p;
  return buildDiagonalBands(n, 15, canvasW, canvasH, spacingPx);
}

function generateDiagonalHeroSlots(p: CollageLayoutParams): CollageSlot[] {
  // Trapezoid hero on left + column on right — simplified as feature left with diagonal hint
  return generateHeroLeftSlots(p);
}

function generateShapedCircleSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildShapedCollageSlots("circle", p.imageCount, p.canvasW, p.canvasH, p.spacingPx, p.marginPx);
}

function generateShapedHeartSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildShapedCollageSlots("heart", p.imageCount, p.canvasW, p.canvasH, p.spacingPx, p.marginPx);
}

function generateDiamondCenterSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDiamondCenterSlots(p.imageCount, p.canvasW, p.canvasH, p.spacingPx, p.marginPx);
}

function generateFrameCollageSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildFrameCollageSlots(p.imageCount, p.canvasW, p.canvasH, p.spacingPx, p.marginPx);
}

function generatePlusCrossSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildPlusCrossSlots(p.imageCount, p.canvasW, p.canvasH, p.spacingPx, p.marginPx);
}

function generatePuzzleSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildPuzzleSlots({ ...p, seed: 42 });
}

function generateTrapezoidSplitSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildTrapezoidSplitSlots(p.imageCount, p.canvasW, p.canvasH, p.spacingPx, p.marginPx);
}

function generateSteppedMosaicSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildSteppedMosaicSlots(p.imageCount, p.canvasW, p.canvasH, p.spacingPx, p.marginPx);
}

function generateWaveSplitSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildWaveSplitSlots(p.imageCount, p.canvasW, p.canvasH, p.spacingPx, p.marginPx);
}

function generateModularIrregularSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDynamicCollageSlots("modular-irregular-grid", { ...p, seed: `modular-${p.imageCount}-${p.canvasW}x${p.canvasH}` });
}

function generateHeroSupportSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDynamicCollageSlots("hero-support", { ...p, seed: `hero-support-${p.imageCount}-${p.canvasW}x${p.canvasH}` });
}

function generateOrganicFlowSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDynamicCollageSlots("organic-flow", { ...p, seed: `organic-flow-${p.imageCount}-${p.canvasW}x${p.canvasH}` });
}

function generateWaveRibbonsSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDynamicCollageSlots("wave-ribbons", { ...p, seed: `wave-ribbons-${p.imageCount}-${p.canvasW}x${p.canvasH}` });
}

function generateDynamicStripsSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDynamicCollageSlots("dynamic-strips", { ...p, seed: `dynamic-strips-${p.imageCount}-${p.canvasW}x${p.canvasH}` });
}

function generateSoftPolygonsSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDynamicCollageSlots("soft-polygons", { ...p, seed: `soft-polygons-${p.imageCount}-${p.canvasW}x${p.canvasH}` });
}

function generateAmoebaPackSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDynamicCollageSlots("amoeba-pack", { ...p, seed: `amoeba-pack-${p.imageCount}-${p.canvasW}x${p.canvasH}` });
}

function generateRadialHeroSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDynamicCollageSlots("radial-hero", { ...p, seed: `radial-hero-${p.imageCount}-${p.canvasW}x${p.canvasH}` });
}

function generateFreeformClustersSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDynamicCollageSlots("freeform-clusters", { ...p, seed: `freeform-clusters-${p.imageCount}-${p.canvasW}x${p.canvasH}` });
}

function generateSoftVoronoiSlots(p: CollageLayoutParams): CollageSlot[] {
  return buildDynamicCollageSlots("soft-voronoi", { ...p, seed: `soft-voronoi-${p.imageCount}-${p.canvasW}x${p.canvasH}` });
}

function generateRingCollageSlots(p: CollageLayoutParams): CollageSlot[] {
  // Ring segments arranged in a donut
  const { imageCount: n, canvasW, canvasH } = p;
  const cx = canvasW / 2, cy = canvasH / 2;
  const outerR = Math.min(canvasW, canvasH) * 0.42;
  const innerR = outerR * 0.4;
  const anglePer = (2 * Math.PI) / n;
  return Array.from({ length: n }, (_, i) => {
    const midAngle = i * anglePer - Math.PI / 2;
    const midR = (outerR + innerR) / 2;
    const segCx = cx + Math.cos(midAngle) * midR;
    const segCy = cy + Math.sin(midAngle) * midR;
    const segW = (outerR - innerR) * 0.9;
    return createCollageSlot({
      type: "image",
      shape: "circle",
      x: (segCx - segW / 2) / canvasW,
      y: (segCy - segW / 2) / canvasH,
      w: segW / canvasW,
      h: segW / canvasH,
    });
  });
}

function generateCustomMaskShapeSlots(p: CollageLayoutParams): CollageSlot[] {
  return generateGridSlots(p);
}

// ─── LAYOUT_REGISTRY ──────────────────────────────────────────────────────────

export interface CollageLayoutFamilyDef {
  family: CollageLayoutFamily;
  name: string;
  nameHe: string;
  minImages: number;
  maxImages: number;
  mode: "simple" | "creative" | "both";
  generate: (params: CollageLayoutParams) => CollageSlot[];
}

export const LAYOUT_REGISTRY: CollageLayoutFamilyDef[] = [
  { family: "grid",            name: "Grid",            nameHe: "רשת",            minImages: 1,  maxImages: 100, mode: "both",     generate: generateGridSlots },
  { family: "hero",            name: "Hero Top",        nameHe: "גיבור עליון",    minImages: 2,  maxImages: 100, mode: "both",     generate: generateHeroSlots },
  { family: "heroBottom",      name: "Hero Bottom",     nameHe: "גיבור תחתון",    minImages: 2,  maxImages: 100, mode: "simple",   generate: generateHeroBottomSlots },
  { family: "heroLeft",        name: "Feature Left",    nameHe: "גיבור שמאל",     minImages: 2,  maxImages: 100, mode: "simple",   generate: generateHeroLeftSlots },
  { family: "magazine",        name: "Magazine",        nameHe: "מגזין",           minImages: 2,  maxImages: 100, mode: "simple",   generate: generateMagazineSlots },
  { family: "mosaic",          name: "Mosaic",          nameHe: "פסיפס",          minImages: 3,  maxImages: 100, mode: "simple",   generate: generateMosaicSlots },
  { family: "dualHero",        name: "Dual Hero",       nameHe: "שני גיבורים",    minImages: 2,  maxImages: 100, mode: "simple",   generate: generateDualHeroSlots },
  { family: "triptych",        name: "Triptych",        nameHe: "טריפטיך",        minImages: 3,  maxImages: 100, mode: "simple",   generate: generateTriptychSlots },
  { family: "strip",           name: "Strip",           nameHe: "רצועה",          minImages: 2,  maxImages: 8,   mode: "simple",   generate: generateStripSlots },
  { family: "wideBanner",      name: "Wide Banner",     nameHe: "כרזה רחבה",      minImages: 3,  maxImages: 100, mode: "simple",   generate: generateWideBannerSlots },
  { family: "filmStrip",       name: "Film Strip",      nameHe: "סרטי פילם",      minImages: 3,  maxImages: 20,  mode: "creative", generate: generateFilmStripSlots },
  { family: "staircase",       name: "Staircase",       nameHe: "מדרגות",         minImages: 4,  maxImages: 15,  mode: "creative", generate: generateStaircaseSlots },
  { family: "ringFocus",       name: "Ring Focus",      nameHe: "מוקד מרכזי",     minImages: 4,  maxImages: 20,  mode: "creative", generate: generateRingFocusSlots },
  { family: "splitTree",       name: "Split Tree",      nameHe: "עץ חלוקה",       minImages: 2,  maxImages: 8,   mode: "creative", generate: generateSplitTreeSlots },
  { family: "diagonal",        name: "Diagonal",        nameHe: "אלכסון",         minImages: 2,  maxImages: 8,   mode: "creative", generate: generateDiagonalBandSlots },
  { family: "diagonalHero",    name: "Diagonal Hero",   nameHe: "גיבור אלכסוני",  minImages: 3,  maxImages: 8,   mode: "creative", generate: generateDiagonalHeroSlots },
  { family: "shapedCircle",    name: "Circle",          nameHe: "⬤ עיגול",       minImages: 4,  maxImages: 24,  mode: "creative", generate: generateShapedCircleSlots },
  { family: "shapedHeart",     name: "Heart",           nameHe: "♥ לב",           minImages: 4,  maxImages: 24,  mode: "creative", generate: generateShapedHeartSlots },
  { family: "ringCollage",     name: "Ring",            nameHe: "טבעת",           minImages: 4,  maxImages: 16,  mode: "creative", generate: generateRingCollageSlots },
  { family: "artisticLayered", name: "Artistic",        nameHe: "אמנותי",         minImages: 3,  maxImages: 10,  mode: "creative", generate: generateArtisticLayeredSlots },
  { family: "diamondCenter",   name: "Diamond",         nameHe: "יהלום",          minImages: 3,  maxImages: 30,  mode: "creative", generate: generateDiamondCenterSlots },
  { family: "frameCollage",    name: "Frame",           nameHe: "מסגרת",          minImages: 5,  maxImages: 12,  mode: "creative", generate: generateFrameCollageSlots },
  { family: "plusCross",       name: "Plus / Cross",    nameHe: "צלב",            minImages: 5,  maxImages: 9,   mode: "creative", generate: generatePlusCrossSlots },
  { family: "trapezoidSplit",  name: "Trapezoid Split", nameHe: "טרפזים",         minImages: 3,  maxImages: 8,   mode: "creative", generate: generateTrapezoidSplitSlots },
  { family: "steppedMosaic",   name: "Stepped Mosaic",  nameHe: "פסיפס מדורג",    minImages: 4,  maxImages: 16,  mode: "creative", generate: generateSteppedMosaicSlots },
  { family: "waveSplit",       name: "Wave Split",      nameHe: "גל",             minImages: 2,  maxImages: 30,  mode: "creative", generate: generateWaveSplitSlots },
  { family: "puzzle",          name: "Puzzle",          nameHe: "פאזל",            minImages: 1,  maxImages: 50,  mode: "both",     generate: generatePuzzleSlots },
  { family: "modularIrregular", name: "Modular Irregular", nameHe: "מודולרי דינמי", minImages: 2,  maxImages: 80,  mode: "creative", generate: generateModularIrregularSlots },
  { family: "heroSupport",     name: "Hero + Support",  nameHe: "גיבור ותמיכות",   minImages: 3,  maxImages: 40,  mode: "creative", generate: generateHeroSupportSlots },
  { family: "organicFlow",     name: "Organic Flow",    nameHe: "זרימה אורגנית",   minImages: 4,  maxImages: 24,  mode: "creative", generate: generateOrganicFlowSlots },
  { family: "waveRibbons",     name: "Wave Ribbons",    nameHe: "רצועות גל",       minImages: 4,  maxImages: 30,  mode: "creative", generate: generateWaveRibbonsSlots },
  { family: "dynamicStrips",   name: "Dynamic Strips",  nameHe: "סטריפים דינמיים", minImages: 3,  maxImages: 40,  mode: "creative", generate: generateDynamicStripsSlots },
  { family: "softPolygons",    name: "Soft Polygons",   nameHe: "פוליגונים רכים",  minImages: 5,  maxImages: 24,  mode: "creative", generate: generateSoftPolygonsSlots },
  { family: "amoebaPack",      name: "Amoeba Pack",     nameHe: "אמבה",            minImages: 4,  maxImages: 18,  mode: "creative", generate: generateAmoebaPackSlots },
  { family: "radialHero",      name: "Radial Hero",     nameHe: "גיבור רדיאלי",       minImages: 4,  maxImages: 20,  mode: "creative", generate: generateRadialHeroSlots },
  { family: "freeformClusters", name: "Freeform Clusters", nameHe: "קבוצות חופשיות",   minImages: 8,  maxImages: 60,  mode: "creative", generate: generateFreeformClustersSlots },
  { family: "softVoronoi",     name: "Soft Voronoi",    nameHe: "וורונוי רך",         minImages: 5,  maxImages: 28,  mode: "creative", generate: generateSoftVoronoiSlots },
  { family: "customMaskShape", name: "Shape Template", nameHe: "תבנית צורה", minImages: 1, maxImages: 80, mode: "creative", generate: generateCustomMaskShapeSlots },
];

export function computeSlots(family: CollageLayoutFamily, params: CollageLayoutParams): CollageSlot[] {
  const def = LAYOUT_REGISTRY.find(d => d.family === family);
  if (!def) return generateGridSlots(params);
  if (params.imageCount < def.minImages || params.imageCount > def.maxImages) {
    return generateGridSlots(params);
  }

  const slots = def.generate(params);
  if (slots.filter((slot) => slot.type === "image").length < params.imageCount) {
    return generateGridSlots(params);
  }

  return slots;
}

export { generateSplitTreeSlots };

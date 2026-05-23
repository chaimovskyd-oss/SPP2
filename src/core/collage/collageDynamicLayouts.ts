import {
  createDynamicLayoutResult,
  dynamicCellsToSlots,
  makeCell,
  seededRandom,
  validateDynamicLayout,
  type DynamicCollageCell,
  type DynamicCollageLayoutStyle,
  type LayoutGenerator,
  type LayoutGeneratorOptions,
} from "./collageDynamicEngine";
import { polygonBBox, type Pt } from "./collageGeometryUtils";
import type { CollageSlot } from "@/types/collage";

type ImplementedDynamicStyle = Extract<
  DynamicCollageLayoutStyle,
  | "modular-irregular-grid"
  | "hero-support"
  | "organic-flow"
  | "wave-ribbons"
  | "dynamic-strips"
  | "soft-polygons"
  | "amoeba-pack"
  | "radial-hero"
  | "freeform-clusters"
  | "soft-voronoi"
>;

export const DYNAMIC_LAYOUT_GENERATORS: LayoutGenerator[] = [
  {
    style: "modular-irregular-grid",
    name: "Modular Irregular Grid",
    capability: { minImages: 2, idealMin: 4, idealMax: 60, maxImages: 80 },
    generate: generateModularIrregularGrid,
  },
  {
    style: "hero-support",
    name: "Hero + Support",
    capability: { minImages: 3, idealMin: 4, idealMax: 18, maxImages: 40, fallbackStyle: "modular-irregular-grid" },
    generate: generateHeroSupport,
  },
  {
    style: "organic-flow",
    name: "Organic Flow",
    capability: { minImages: 4, idealMin: 4, idealMax: 16, maxImages: 24, fallbackStyle: "modular-irregular-grid" },
    generate: generateOrganicFlow,
  },
  {
    style: "wave-ribbons",
    name: "Wave Ribbons",
    capability: { minImages: 4, idealMin: 6, idealMax: 20, maxImages: 30, fallbackStyle: "organic-flow" },
    generate: generateWaveRibbons,
  },
  {
    style: "dynamic-strips",
    name: "Dynamic Strips",
    capability: { minImages: 3, idealMin: 5, idealMax: 28, maxImages: 40, fallbackStyle: "modular-irregular-grid" },
    generate: generateDynamicStrips,
  },
  {
    style: "soft-polygons",
    name: "Soft Polygons",
    capability: { minImages: 5, idealMin: 6, idealMax: 18, maxImages: 24, fallbackStyle: "organic-flow" },
    generate: generateSoftPolygons,
  },
  {
    style: "amoeba-pack",
    name: "Amoeba Pack",
    capability: { minImages: 4, idealMin: 6, idealMax: 16, maxImages: 18, fallbackStyle: "soft-polygons" },
    generate: generateAmoebaPack,
  },
  {
    style: "radial-hero",
    name: "Radial Hero",
    capability: { minImages: 4, idealMin: 5, idealMax: 14, maxImages: 20, fallbackStyle: "hero-support" },
    generate: generateRadialHero,
  },
  {
    style: "freeform-clusters",
    name: "Freeform Clusters",
    capability: { minImages: 8, idealMin: 10, idealMax: 42, maxImages: 60, fallbackStyle: "modular-irregular-grid" },
    generate: generateFreeformClusters,
  },
  {
    style: "soft-voronoi",
    name: "Soft Voronoi",
    capability: { minImages: 5, idealMin: 6, idealMax: 18, maxImages: 28, fallbackStyle: "soft-polygons" },
    generate: generateSoftVoronoi,
  },
];

export function buildDynamicCollageSlots(style: ImplementedDynamicStyle, options: LayoutGeneratorOptions): CollageSlot[] {
  const generator = DYNAMIC_LAYOUT_GENERATORS.find((item) => item.style === style);
  if (!generator) return [];
  if (options.imageCount < generator.capability.minImages || options.imageCount > generator.capability.maxImages) return [];
  const result = generator.generate(options);
  const isDenseGrid = style === "modular-irregular-grid";
  const isStripBased = style === "dynamic-strips" || style === "radial-hero";
  const isOrganicPolygon = style === "organic-flow" || style === "wave-ribbons" || style === "soft-polygons" || style === "amoeba-pack" || style === "radial-hero" || style === "soft-voronoi";
  const warnings = validateDynamicLayout(result, {
    allowStripCells: isDenseGrid || isStripBased,
    minAreaRatio: isDenseGrid ? 0.004 : isStripBased ? 0.006 : isOrganicPolygon ? 0.007 : 0.012,
    minSideRatio: isDenseGrid ? 0.02 : isStripBased ? 0.018 : 0.028,
  });
  if (warnings.length > Math.max(2, options.imageCount * 0.35)) return [];
  const slots = dynamicCellsToSlots({ ...result, warnings }, options.spacingPx);
  return slots.length === options.imageCount ? slots : [];
}

function generateModularIrregularGrid(options: LayoutGeneratorOptions) {
  const { canvasW, canvasH, imageCount, spacingPx, marginPx } = options;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const cells: DynamicCollageCell[] = [];
  const cols = Math.max(2, Math.ceil(Math.sqrt(imageCount * (usableW / Math.max(1, usableH)))));
  const heroExtraCapacity = imageCount >= 6 && cols >= 2 ? 3 : 0;
  const rows = Math.ceil((imageCount + heroExtraCapacity) / cols);
  const cellW = (usableW - spacingPx * (cols - 1)) / cols;
  const cellH = (usableH - spacingPx * (rows - 1)) / rows;
  const occupied = new Set<string>();
  const rand = seededRandom(options.seed ?? `modular-${imageCount}-${canvasW}x${canvasH}`);

  const addRect = (col: number, row: number, colSpan: number, rowSpan: number, role: DynamicCollageCell["role"]): void => {
    for (let r = row; r < row + rowSpan; r++) for (let c = col; c < col + colSpan; c++) occupied.add(`${c}:${r}`);
    cells.push(makeCell({
      role,
      shape: role === "hero" || rand() > 0.45 ? "rounded-rect" : "rect",
      x: marginPx + col * (cellW + spacingPx),
      y: marginPx + row * (cellH + spacingPx),
      width: cellW * colSpan + spacingPx * (colSpan - 1),
      height: cellH * rowSpan + spacingPx * (rowSpan - 1),
      weight: role === "hero" ? 4 : role === "primary" ? 2 : 1,
      cropPriority: role === "hero" ? "face" : "auto",
      borderRadius: 0.06,
      gapPx: spacingPx,
    }));
  };

  if (imageCount >= 6 && rows >= 2 && cols >= 2) addRect(0, 0, 2, 2, "hero");
  else addRect(0, 0, 1, 1, "primary");

  for (let row = 0; row < rows && cells.length < imageCount; row++) {
    for (let col = 0; col < cols && cells.length < imageCount; col++) {
      if (occupied.has(`${col}:${row}`)) continue;
      addRect(col, row, 1, 1, cells.length < 3 ? "primary" : "support");
    }
  }

  return createDynamicLayoutResult("modular-irregular-grid", options, cells.slice(0, imageCount));
}

function generateHeroSupport(options: LayoutGeneratorOptions) {
  const { canvasW, canvasH, imageCount, spacingPx, marginPx } = options;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const landscape = usableW >= usableH;
  const heroStrength = options.heroStrength ?? (imageCount <= 6 ? 0.52 : imageCount <= 14 ? 0.42 : 0.34);
  const cells: DynamicCollageCell[] = [];

  const heroW = landscape ? usableW * heroStrength : usableW;
  const heroH = landscape ? usableH : usableH * heroStrength;
  cells.push(makeCell({
    role: "hero",
    shape: "rounded-rect",
    x: marginPx,
    y: marginPx,
    width: heroW,
    height: heroH,
    weight: 5,
    cropPriority: "face",
    borderRadius: 0.05,
    gapPx: spacingPx,
  }));

  const supportX = landscape ? marginPx + heroW + spacingPx : marginPx;
  const supportY = landscape ? marginPx : marginPx + heroH + spacingPx;
  const supportW = landscape ? usableW - heroW - spacingPx : usableW;
  const supportH = landscape ? usableH : usableH - heroH - spacingPx;
  cells.push(...rectGridCells(imageCount - 1, supportX, supportY, supportW, supportH, spacingPx, landscape ? 2 : Math.min(imageCount - 1, 4), "support"));

  return createDynamicLayoutResult("hero-support", options, cells.slice(0, imageCount));
}

function generateOrganicFlow(options: LayoutGeneratorOptions) {
  const { canvasW, canvasH, imageCount, spacingPx, marginPx } = options;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const rows = imageCount <= 6 ? 2 : imageCount <= 12 ? 3 : 4;
  const rowCounts = distributeCount(imageCount, rows);
  const cells: DynamicCollageCell[] = [];
  const rowH = (usableH - spacingPx * (rows - 1)) / rows;
  const organicness = options.organicness ?? 0.42;

  rowCounts.forEach((count, row) => {
    const y = marginPx + row * (rowH + spacingPx);
    const cellW = (usableW - spacingPx * (count - 1)) / count;
    for (let col = 0; col < count; col++) {
      const x = marginPx + col * (cellW + spacingPx);
      const amp = Math.min(cellW, rowH) * 0.16 * organicness;
      const leftWave = col === 0 ? 0 : Math.sin((row + col) * 1.7) * amp;
      const rightWave = col === count - 1 ? 0 : Math.cos((row + col) * 1.4) * amp;
      const polygon = [
        { x, y },
        { x: x + cellW, y },
        { x: x + cellW + rightWave, y: y + rowH * 0.35 },
        { x: x + cellW - rightWave, y: y + rowH },
        { x, y: y + rowH },
        { x: x + leftWave, y: y + rowH * 0.55 },
      ];
      cells.push(makeCell({
        role: cells.length === 0 && imageCount <= 8 ? "hero" : cells.length < 3 ? "primary" : "support",
        shape: "wave-region",
        x,
        y,
        width: cellW,
        height: rowH,
        polygon,
        weight: cells.length === 0 ? 3 : 1,
        cropPriority: cells.length === 0 ? "face" : "auto",
        gapPx: spacingPx,
      }));
    }
  });

  return createDynamicLayoutResult("organic-flow", options, cells.slice(0, imageCount));
}

function generateWaveRibbons(options: LayoutGeneratorOptions) {
  const { canvasW, canvasH, imageCount, spacingPx, marginPx } = options;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const rows = imageCount <= 7 ? 2 : imageCount <= 18 ? 3 : 4;
  const rowCounts = distributeCount(imageCount, rows);
  const rowH = (usableH - spacingPx * (rows - 1)) / rows;
  const cells: DynamicCollageCell[] = [];
  const organicness = options.organicness ?? 0.55;

  rowCounts.forEach((count, row) => {
    const y = marginPx + row * (rowH + spacingPx);
    const cellW = (usableW - spacingPx * (count - 1)) / count;
    for (let col = 0; col < count; col++) {
      const x = marginPx + col * (cellW + spacingPx);
      const phase = (row + 1) * 0.9 + col * 0.45;
      const amp = Math.min(rowH * 0.16, cellW * 0.12) * organicness;
      const topA = row === 0 ? 0 : Math.sin(phase) * amp;
      const topB = row === 0 ? 0 : Math.sin(phase + 0.9) * amp;
      const botA = row === rows - 1 ? 0 : Math.cos(phase + 0.35) * amp;
      const botB = row === rows - 1 ? 0 : Math.cos(phase + 1.15) * amp;
      const side = Math.min(cellW, rowH) * 0.08 * organicness;
      const polygon = [
        { x, y: y + topA },
        { x: x + cellW * 0.48, y: y + topB },
        { x: x + cellW, y: y + topB * 0.65 },
        { x: x + cellW - side, y: y + rowH * 0.52 },
        { x: x + cellW, y: y + rowH + botB * 0.65 },
        { x: x + cellW * 0.52, y: y + rowH + botB },
        { x, y: y + rowH + botA },
        { x: x + side, y: y + rowH * 0.48 },
      ];
      cells.push(makeCell({
        role: cells.length === 0 && imageCount <= 10 ? "hero" : cells.length < 4 ? "primary" : "support",
        shape: "wave-region",
        x,
        y,
        width: cellW,
        height: rowH,
        polygon,
        weight: row === 0 && col === 0 ? 3 : 1,
        cropPriority: cells.length === 0 ? "face" : "auto",
        gapPx: spacingPx,
      }));
    }
  });

  return createDynamicLayoutResult("wave-ribbons", options, cells.slice(0, imageCount));
}

function generateDynamicStrips(options: LayoutGeneratorOptions) {
  const { canvasW, canvasH, imageCount, spacingPx, marginPx } = options;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const landscape = usableW >= usableH;
  const stripCount = Math.max(2, Math.min(6, Math.round(Math.sqrt(imageCount))));
  const stripCounts = distributeCount(imageCount, stripCount);
  const cells: DynamicCollageCell[] = [];

  if (landscape) {
    const stripH = (usableH - spacingPx * (stripCount - 1)) / stripCount;
    stripCounts.forEach((count, strip) => {
      const y = marginPx + strip * (stripH + spacingPx);
      const weights = Array.from({ length: count }, (_, index) => 1 + ((index + strip) % 3 === 0 ? 0.45 : 0));
      const totalWeight = weights.reduce((sum, value) => sum + value, 0);
      let x = marginPx;
      weights.forEach((weight, index) => {
        const w = (usableW - spacingPx * (count - 1)) * (weight / totalWeight);
        cells.push(makeCell({
          role: cells.length === 0 && imageCount <= 10 ? "hero" : cells.length < 3 ? "primary" : "support",
          shape: "rounded-rect",
          x,
          y,
          width: w,
          height: stripH,
          weight: weight > 1 ? 2 : 1,
          cropPriority: cells.length === 0 ? "face" : "auto",
          borderRadius: 0.035,
          gapPx: spacingPx,
        }));
        x += w + spacingPx;
      });
    });
  } else {
    const stripW = (usableW - spacingPx * (stripCount - 1)) / stripCount;
    stripCounts.forEach((count, strip) => {
      const x = marginPx + strip * (stripW + spacingPx);
      const weights = Array.from({ length: count }, (_, index) => 1 + ((index + strip) % 3 === 1 ? 0.45 : 0));
      const totalWeight = weights.reduce((sum, value) => sum + value, 0);
      let y = marginPx;
      weights.forEach((weight) => {
        const h = (usableH - spacingPx * (count - 1)) * (weight / totalWeight);
        cells.push(makeCell({
          role: cells.length === 0 && imageCount <= 10 ? "hero" : cells.length < 3 ? "primary" : "support",
          shape: "rounded-rect",
          x,
          y,
          width: stripW,
          height: h,
          weight: weight > 1 ? 2 : 1,
          cropPriority: cells.length === 0 ? "face" : "auto",
          borderRadius: 0.035,
          gapPx: spacingPx,
        }));
        y += h + spacingPx;
      });
    });
  }

  return createDynamicLayoutResult("dynamic-strips", options, cells.slice(0, imageCount));
}

function generateSoftPolygons(options: LayoutGeneratorOptions) {
  const { canvasW, canvasH, imageCount, spacingPx, marginPx } = options;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const cols = Math.max(2, Math.ceil(Math.sqrt(imageCount * (usableW / Math.max(1, usableH)))));
  const rows = Math.ceil(imageCount / cols);
  const cellW = (usableW - spacingPx * (cols - 1)) / cols;
  const cellH = (usableH - spacingPx * (rows - 1)) / rows;
  const rand = seededRandom(options.seed ?? `soft-polygons-${imageCount}-${canvasW}x${canvasH}`);
  const cells: DynamicCollageCell[] = [];

  for (let index = 0; index < imageCount; index++) {
    const row = Math.floor(index / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, imageCount - rowStart);
    const w = rowCount < cols ? (usableW - spacingPx * (rowCount - 1)) / rowCount : cellW;
    const h = cellH;
    const x = marginPx + (index - rowStart) * (w + spacingPx);
    const y = marginPx + row * (cellH + spacingPx);
    cells.push(makeCell({
      role: index === 0 && imageCount <= 9 ? "hero" : index < 3 ? "primary" : "support",
      shape: "soft-polygon",
      x,
      y,
      width: w,
      height: h,
      polygon: jitteredRectPolygon(x, y, w, h, Math.min(w, h) * 0.1, rand),
      weight: index === 0 ? 3 : 1,
      cropPriority: index === 0 ? "face" : "auto",
      gapPx: spacingPx,
    }));
  }

  return createDynamicLayoutResult("soft-polygons", options, cells);
}

function generateAmoebaPack(options: LayoutGeneratorOptions) {
  const { canvasW, canvasH, imageCount, spacingPx, marginPx } = options;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const cols = Math.max(2, Math.ceil(Math.sqrt(imageCount * (usableW / Math.max(1, usableH)))));
  const rows = Math.ceil(imageCount / cols);
  const cellW = (usableW - spacingPx * (cols - 1)) / cols;
  const cellH = (usableH - spacingPx * (rows - 1)) / rows;
  const rand = seededRandom(options.seed ?? `amoeba-pack-${imageCount}-${canvasW}x${canvasH}`);
  const cells: DynamicCollageCell[] = [];

  for (let index = 0; index < imageCount; index++) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = marginPx + col * (cellW + spacingPx);
    const y = marginPx + row * (cellH + spacingPx);
    cells.push(makeCell({
      role: index === 0 && imageCount <= 8 ? "hero" : index < 3 ? "primary" : "support",
      shape: "soft-polygon",
      x,
      y,
      width: cellW,
      height: cellH,
      polygon: amoebaPolygon(x, y, cellW, cellH, rand),
      weight: index === 0 ? 3 : 1,
      cropPriority: index === 0 ? "face" : "auto",
      gapPx: spacingPx,
    }));
  }

  return createDynamicLayoutResult("amoeba-pack", options, cells);
}

function generateRadialHero(options: LayoutGeneratorOptions) {
  const { canvasW, canvasH, imageCount, spacingPx, marginPx } = options;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const cx = marginPx + usableW / 2;
  const cy = marginPx + usableH / 2;
  const minSide = Math.min(usableW, usableH);
  const heroR = minSide * (imageCount <= 8 ? 0.24 : imageCount <= 14 ? 0.225 : 0.18);
  const outerRx = usableW * 0.49;
  const outerRy = usableH * 0.49;
  const innerRx = heroR * (usableW >= usableH ? 1.26 : 1.12);
  const innerRy = heroR * (usableW >= usableH ? 1.08 : 1.24);
  const rand = seededRandom(options.seed ?? `radial-hero-${imageCount}-${canvasW}x${canvasH}`);
  const cells: DynamicCollageCell[] = [
    makeCell({
      role: "hero",
      shape: "soft-polygon",
      x: cx - heroR,
      y: cy - heroR,
      width: heroR * 2,
      height: heroR * 2,
      polygon: amoebaPolygon(cx - heroR, cy - heroR, heroR * 2, heroR * 2, rand),
      weight: 5,
      cropPriority: "face",
      gapPx: spacingPx,
    })
  ];

  const ringCount = imageCount - 1;
  const angleStep = (Math.PI * 2) / ringCount;
  for (let index = 0; index < ringCount; index++) {
    const start = -Math.PI / 2 + index * angleStep;
    const end = start + angleStep;
    const polygon = annularSegmentPolygon(cx, cy, innerRx, innerRy, outerRx, outerRy, start, end, ringCount <= 8 ? 3 : 2);
    const bbox = polygonBBox(polygon);
    cells.push(makeCell({
      role: index < 2 ? "primary" : "support",
      shape: "soft-polygon",
      x: bbox.x,
      y: bbox.y,
      width: bbox.w,
      height: bbox.h,
      polygon,
      weight: index < 2 ? 2 : 1,
      cropPriority: "center",
      gapPx: spacingPx,
    }));
  }

  return createDynamicLayoutResult("radial-hero", options, cells);
}

function generateFreeformClusters(options: LayoutGeneratorOptions) {
  const { canvasW, canvasH, imageCount, spacingPx, marginPx } = options;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const clusterCount = imageCount <= 15 ? 2 : imageCount <= 30 ? 3 : imageCount <= 45 ? 4 : 5;
  const clusterGap = Math.max(spacingPx * 2.2, Math.min(canvasW, canvasH) * 0.014);
  const clusterRects = splitClusterRects(marginPx, marginPx, usableW, usableH, clusterCount, clusterGap);
  const clusterCounts = distributeCount(imageCount, clusterRects.length);
  const cells: DynamicCollageCell[] = [];

  clusterRects.forEach((rect, clusterIndex) => {
    const count = clusterCounts[clusterIndex] ?? 0;
    const role = clusterIndex === 0 ? "primary" : "support";
    const innerSpacing = Math.max(1, spacingPx * (clusterIndex % 2 === 0 ? 1 : 1.35));
    const maxCols = Math.max(1, Math.ceil(Math.sqrt(count * (rect.w / Math.max(1, rect.h)))));
    const clusterCells = rectGridCells(count, rect.x, rect.y, rect.w, rect.h, innerSpacing, maxCols, role).map((cell, index) => ({
      ...cell,
      role: (clusterIndex === 0 && index === 0 ? "hero" : index === 0 ? "primary" : cell.role) as DynamicCollageCell["role"],
      weight: index === 0 ? 3 : cell.weight,
      cropPriority: index === 0 ? "face" as const : cell.cropPriority,
      borderRadius: index === 0 ? 0.07 : 0.04,
    }));
    cells.push(...clusterCells);
  });

  return createDynamicLayoutResult("freeform-clusters", options, cells.slice(0, imageCount));
}

function generateSoftVoronoi(options: LayoutGeneratorOptions) {
  const { canvasW, canvasH, imageCount, spacingPx, marginPx } = options;
  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const rand = seededRandom(options.seed ?? `soft-voronoi-${imageCount}-${canvasW}x${canvasH}`);
  const points = distributedPoints(imageCount, marginPx, marginPx, usableW, usableH, rand);
  const bounds = [
    { x: marginPx, y: marginPx },
    { x: marginPx + usableW, y: marginPx },
    { x: marginPx + usableW, y: marginPx + usableH },
    { x: marginPx, y: marginPx + usableH },
  ];
  const cells: DynamicCollageCell[] = [];

  points.forEach((point, index) => {
    let polygon = bounds;
    for (let otherIndex = 0; otherIndex < points.length && polygon.length >= 3; otherIndex++) {
      if (otherIndex === index) continue;
      polygon = clipToCloserHalfPlane(polygon, point, points[otherIndex]);
    }
    if (polygon.length < 3) return;
    const softened = softenPolygon(polygon, 0.18);
    const bbox = polygonBBox(softened);
    cells.push(makeCell({
      role: index === 0 && imageCount <= 12 ? "hero" : index < 3 ? "primary" : "support",
      shape: "soft-polygon",
      x: bbox.x,
      y: bbox.y,
      width: bbox.w,
      height: bbox.h,
      polygon: softened,
      weight: index === 0 ? 3 : 1,
      cropPriority: index === 0 ? "face" : "center",
      gapPx: spacingPx,
    }));
  });

  return createDynamicLayoutResult("soft-voronoi", options, cells.slice(0, imageCount));
}

function rectGridCells(count: number, x: number, y: number, w: number, h: number, spacingPx: number, maxCols: number, role: DynamicCollageCell["role"]): DynamicCollageCell[] {
  if (count <= 0 || w <= 0 || h <= 0) return [];
  const cols = Math.min(count, Math.max(1, maxCols));
  const rows = Math.ceil(count / cols);
  const cellW = (w - spacingPx * (cols - 1)) / cols;
  const cellH = (h - spacingPx * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, count - rowStart);
    const wCell = rowCount < cols ? (w - spacingPx * (rowCount - 1)) / rowCount : cellW;
    const xCell = rowCount < cols ? x + (index - rowStart) * (wCell + spacingPx) : x + (index % cols) * (cellW + spacingPx);
    return makeCell({
      role,
      shape: "rounded-rect",
      x: xCell,
      y: y + row * (cellH + spacingPx),
      width: wCell,
      height: cellH,
      weight: role === "primary" ? 2 : 1,
      cropPriority: "auto",
      borderRadius: 0.04,
      gapPx: spacingPx,
    });
  });
}

function distributeCount(total: number, buckets: number): number[] {
  const counts = Array.from({ length: buckets }, () => Math.floor(total / buckets));
  for (let i = 0; i < total % buckets; i++) counts[i]++;
  return counts.filter((count) => count > 0);
}

function jitteredRectPolygon(x: number, y: number, w: number, h: number, amount: number, rand: () => number) {
  const jitter = () => (rand() - 0.5) * amount;
  return [
    { x, y: y + h * 0.08 + jitter() },
    { x: x + w * 0.34, y: y + jitter() },
    { x: x + w * 0.68, y: y + jitter() },
    { x: x + w, y: y + h * 0.1 + jitter() },
    { x: x + w + jitter(), y: y + h * 0.52 },
    { x: x + w, y: y + h * 0.9 + jitter() },
    { x: x + w * 0.66, y: y + h + jitter() },
    { x: x + w * 0.32, y: y + h + jitter() },
    { x, y: y + h * 0.9 + jitter() },
    { x: x + jitter(), y: y + h * 0.48 },
  ].map((point) => clampPointToRect(point, x, y, w, h));
}

function amoebaPolygon(x: number, y: number, w: number, h: number, rand: () => number) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w * 0.48;
  const ry = h * 0.48;
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index / 10) * Math.PI * 2;
    const wobble = 0.82 + rand() * 0.18;
    return {
      x: cx + Math.cos(angle) * rx * wobble,
      y: cy + Math.sin(angle) * ry * wobble,
    };
  });
}

function annularSegmentPolygon(
  cx: number,
  cy: number,
  innerRx: number,
  innerRy: number,
  outerRx: number,
  outerRy: number,
  start: number,
  end: number,
  steps: number
): Pt[] {
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + (end - start) * (i / steps);
    outer.push({ x: cx + Math.cos(t) * outerRx, y: cy + Math.sin(t) * outerRy });
    inner.push({ x: cx + Math.cos(t) * innerRx, y: cy + Math.sin(t) * innerRy });
  }
  return [...outer, ...inner.reverse()];
}

function splitClusterRects(x: number, y: number, w: number, h: number, count: number, gap: number) {
  if (count <= 2) {
    const landscape = w >= h;
    if (landscape) {
      const leftW = (w - gap) * 0.56;
      return [
        { x, y, w: leftW, h },
        { x: x + leftW + gap, y, w: w - leftW - gap, h },
      ];
    }
    const topH = (h - gap) * 0.56;
    return [
      { x, y, w, h: topH },
      { x, y: y + topH + gap, w, h: h - topH - gap },
    ];
  }
  if (count === 3) {
    const landscape = w >= h;
    if (landscape) {
      const heroW = (w - gap) * 0.48;
      const sideH = (h - gap) / 2;
      return [
        { x, y, w: heroW, h },
        { x: x + heroW + gap, y, w: w - heroW - gap, h: sideH },
        { x: x + heroW + gap, y: y + sideH + gap, w: w - heroW - gap, h: sideH },
      ];
    }
    const heroH = (h - gap) * 0.48;
    const sideW = (w - gap) / 2;
    return [
      { x, y, w, h: heroH },
      { x, y: y + heroH + gap, w: sideW, h: h - heroH - gap },
      { x: x + sideW + gap, y: y + heroH + gap, w: sideW, h: h - heroH - gap },
    ];
  }
  const cols = count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const cellW = (w - gap * (cols - 1)) / cols;
  const cellH = (h - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, count - rowStart);
    const actualW = rowCount < cols ? (w - gap * (rowCount - 1)) / rowCount : cellW;
    return {
      x: x + (index - rowStart) * (actualW + gap),
      y: y + row * (cellH + gap),
      w: actualW,
      h: cellH,
    };
  });
}

function distributedPoints(count: number, x: number, y: number, w: number, h: number, rand: () => number): Pt[] {
  const cols = Math.max(2, Math.ceil(Math.sqrt(count * (w / Math.max(1, h)))));
  const rows = Math.ceil(count / cols);
  const cellW = w / cols;
  const cellH = h / rows;
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const jitterX = (rand() - 0.5) * cellW * 0.34;
    const jitterY = (rand() - 0.5) * cellH * 0.34;
    return {
      x: Math.min(x + w - cellW * 0.18, Math.max(x + cellW * 0.18, x + col * cellW + cellW / 2 + jitterX)),
      y: Math.min(y + h - cellH * 0.18, Math.max(y + cellH * 0.18, y + row * cellH + cellH / 2 + jitterY)),
    };
  });
}

function clipToCloserHalfPlane(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const normal = { x: b.x - a.x, y: b.y - a.y };
  const inside = (p: Pt) => (p.x - mid.x) * normal.x + (p.y - mid.y) * normal.y <= 0;
  const intersection = (p1: Pt, p2: Pt): Pt => {
    const d1 = (p1.x - mid.x) * normal.x + (p1.y - mid.y) * normal.y;
    const d2 = (p2.x - mid.x) * normal.x + (p2.y - mid.y) * normal.y;
    const t = d1 / (d1 - d2 || 1);
    return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
  };
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const currInside = inside(curr);
    const prevInside = inside(prev);
    if (currInside) {
      if (!prevInside) out.push(intersection(prev, curr));
      out.push(curr);
    } else if (prevInside) {
      out.push(intersection(prev, curr));
    }
  }
  return out;
}

function softenPolygon(poly: Pt[], amount: number): Pt[] {
  if (poly.length <= 3) return poly;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curr = poly[i];
    const next = poly[(i + 1) % poly.length];
    out.push({
      x: curr.x * (1 - amount) + prev.x * amount,
      y: curr.y * (1 - amount) + prev.y * amount,
    });
    out.push({
      x: curr.x * (1 - amount) + next.x * amount,
      y: curr.y * (1 - amount) + next.y * amount,
    });
  }
  return out.slice(0, 12);
}

function clampPointToRect(point: { x: number; y: number }, x: number, y: number, w: number, h: number) {
  return {
    x: Math.min(x + w, Math.max(x, point.x)),
    y: Math.min(y + h, Math.max(y, point.y)),
  };
}

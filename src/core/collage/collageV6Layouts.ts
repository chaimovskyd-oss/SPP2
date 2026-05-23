import { createCollageSlot } from "./collageFactory";
import { clipPolyToRect, insetPolygon, polygonToCollageSlot } from "./collageGeometryUtils";
import type { CollageSlot } from "@/types/collage";

export function buildTrapezoidSplitSlots(
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount < 3 || imageCount > 8) return [];

  const rect = { x: marginPx, y: marginPx, w: canvasW - 2 * marginPx, h: canvasH - 2 * marginPx };
  const slots: CollageSlot[] = [];
  const bandW = rect.w / imageCount;
  const shearPx = Math.min(rect.w * 0.07, Math.max(24, bandW * 0.25));

  for (let i = 0; i < imageCount; i++) {
    const left = rect.x + i * bandW;
    const right = rect.x + (i + 1) * bandW;
    const topShift = i % 2 === 0 ? -shearPx * 0.35 : shearPx * 0.25;
    const bottomShift = i % 2 === 0 ? shearPx * 0.45 : -shearPx * 0.30;
    const polygon = [
      { x: left + topShift, y: rect.y },
      { x: right + topShift, y: rect.y },
      { x: right + bottomShift, y: rect.y + rect.h },
      { x: left + bottomShift, y: rect.y + rect.h },
    ];
    const clipped = clipPolyToRect(polygon, rect);
    const slot = polygonToCollageSlot(insetPolygon(clipped, spacingPx / 2), canvasW, canvasH, {
      shape: "diagonalPolygon",
      role: i === 0 ? "hero" : "standard",
      label: `Trapezoid ${i + 1}`,
    });
    if (slot) slots.push(slot);
  }

  return slots.length === imageCount ? slots : [];
}

export function buildSteppedMosaicSlots(
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount < 4 || imageCount > 16) return [];

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  const heroW = imageCount <= 6 ? usableW * 0.54 : usableW * 0.46;
  const heroH = imageCount <= 8 ? usableH * 0.58 : usableH * 0.52;
  const rightW = usableW - heroW - spacingPx;
  const bottomH = usableH - heroH - spacingPx;
  const remaining = imageCount - 1;

  const hero = createCollageSlot({
    type: "image",
    role: "hero",
    label: "Stepped hero",
    x: marginPx / canvasW,
    y: marginPx / canvasH,
    w: heroW / canvasW,
    h: heroH / canvasH,
  });

  const regions = [
    { x: marginPx + heroW + spacingPx, y: marginPx, w: rightW, h: heroH * 0.55, weight: rightW * heroH * 0.55, cols: 1 },
    { x: marginPx + heroW + spacingPx, y: marginPx + heroH * 0.55 + spacingPx, w: rightW, h: heroH * 0.45 - spacingPx, weight: rightW * heroH * 0.45, cols: 2 },
    { x: marginPx, y: marginPx + heroH + spacingPx, w: usableW, h: bottomH, weight: usableW * bottomH * 1.25, cols: Math.min(5, Math.ceil(Math.sqrt(remaining) + 1)) },
  ].filter((region) => region.w > 20 && region.h > 20);

  const counts = distributeCounts(remaining, regions.map((region) => region.weight));
  const slots: CollageSlot[] = [hero];
  regions.forEach((region, index) => {
    slots.push(...gridRegion(counts[index], region.x, region.y, region.w, region.h, spacingPx, canvasW, canvasH, region.cols));
  });

  return slots.slice(0, imageCount);
}

export function buildWaveSplitSlots(
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount < 2 || imageCount > 30) return [];

  const usableW = canvasW - 2 * marginPx;
  const usableH = canvasH - 2 * marginPx;
  if (usableW <= 0 || usableH <= 0) return [];

  if (imageCount > 5) {
    return buildWaveBlockGrid(imageCount, marginPx, marginPx, usableW, usableH, canvasW, canvasH, spacingPx);
  }

  const waveH = imageCount <= 2 ? usableH : usableH * 0.62;
  const waveSlots = buildTwoPartWave(marginPx, marginPx, usableW, waveH, canvasW, canvasH, spacingPx);
  if (imageCount <= 2) return waveSlots.slice(0, imageCount);

  const bottomY = marginPx + waveH + spacingPx;
  const bottomH = usableH - waveH - spacingPx;
  const bottom = gridRegion(imageCount - 2, marginPx, bottomY, usableW, bottomH, spacingPx, canvasW, canvasH, imageCount - 2);
  return [...waveSlots, ...bottom].slice(0, imageCount);
}

function buildWaveBlockGrid(
  imageCount: number,
  x: number,
  y: number,
  w: number,
  h: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number
): CollageSlot[] {
  const blockCount = Math.ceil(imageCount / 2);
  const { cols, rows } = chooseWaveBlockGrid(blockCount, w, h, spacingPx);
  const blockW = (w - spacingPx * (cols - 1)) / cols;
  const blockH = (h - spacingPx * (rows - 1)) / rows;
  if (blockW <= 24 || blockH <= 24) return [];

  const slots: CollageSlot[] = [];
  let remaining = imageCount;
  let blockIndex = 0;

  for (let row = 0; row < rows && remaining > 0; row++) {
    const blocksInRow = Math.min(cols, blockCount - row * cols);
    const rowOffsetX = (cols - blocksInRow) * (blockW + spacingPx) / 2;
    for (let col = 0; col < blocksInRow && remaining > 0; col++) {
      const bx = x + rowOffsetX + col * (blockW + spacingPx);
      const by = y + row * (blockH + spacingPx);
      const countInBlock = Math.min(2, remaining);
      const blockSlots = countInBlock === 2
        ? buildTwoPartWave(bx, by, blockW, blockH, canvasW, canvasH, spacingPx)
        : buildSingleWaveCell(bx, by, blockW, blockH, canvasW, canvasH, spacingPx);
      blockSlots.forEach((slot, index) => {
        slots.push({
          ...slot,
          role: slots.length === 0 ? "hero" : "standard",
          label: `Wave ${blockIndex + 1}.${index + 1}`,
        });
      });
      remaining -= blockSlots.length;
      blockIndex++;
    }
  }

  return slots.length === imageCount ? slots : [];
}

function chooseWaveBlockGrid(blockCount: number, w: number, h: number, spacingPx: number): { cols: number; rows: number } {
  let best = { cols: 1, rows: blockCount };
  let bestScore = -Infinity;
  const pageAspect = w / Math.max(1, h);

  for (let cols = 1; cols <= blockCount; cols++) {
    const rows = Math.ceil(blockCount / cols);
    const blockW = (w - spacingPx * (cols - 1)) / cols;
    const blockH = (h - spacingPx * (rows - 1)) / rows;
    if (blockW <= 80 || blockH <= 70) continue;

    const blockAspect = blockW / Math.max(1, blockH);
    const targetAspect = pageAspect >= 1 ? 1.45 : 1.15;
    const aspectScore = -Math.abs(Math.log(blockAspect / targetAspect));
    const emptyPenalty = (cols * rows - blockCount) * 0.08;
    const sizeScore = Math.log(Math.max(1, Math.min(blockW, blockH))) * 0.04;
    const score = aspectScore + sizeScore - emptyPenalty;

    if (score > bestScore) {
      bestScore = score;
      best = { cols, rows };
    }
  }

  return best;
}

function buildTwoPartWave(
  x: number,
  y: number,
  w: number,
  h: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number
): CollageSlot[] {
  const samples = 24;
  const amplitude = w * 0.08;
  const centerX = x + w * 0.5;
  const wave: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    wave.push({
      x: centerX + Math.sin((t - 0.15) * Math.PI * 2) * amplitude,
      y: y + t * h,
    });
  }

  const leftPoly = [{ x, y }, ...wave, { x, y: y + h }];
  const rightPoly = [{ x: x + w, y }, { x: x + w, y: y + h }, ...[...wave].reverse()];
  const rect = { x, y, w, h };
  const left = polygonToCollageSlot(insetPolygon(clipPolyToRect(leftPoly, rect), spacingPx / 2), canvasW, canvasH, {
    shape: "polygon",
    role: "hero",
    label: "Wave 1",
  });
  const right = polygonToCollageSlot(insetPolygon(clipPolyToRect(rightPoly, rect), spacingPx / 2), canvasW, canvasH, {
    shape: "polygon",
    role: "standard",
    label: "Wave 2",
  });

  return [left, right].filter((slot): slot is CollageSlot => Boolean(slot));
}

function buildSingleWaveCell(
  x: number,
  y: number,
  w: number,
  h: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number
): CollageSlot[] {
  const samples = 24;
  const amplitude = w * 0.06;
  const rightX = x + w - Math.max(2, spacingPx / 2);
  const wave: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    wave.push({
      x: rightX + Math.sin((t + 0.1) * Math.PI * 2) * amplitude,
      y: y + t * h,
    });
  }

  const polygon = [
    { x, y },
    { x: x + w, y },
    ...wave,
    { x, y: y + h },
  ];
  const rect = { x, y, w, h };
  const slot = polygonToCollageSlot(insetPolygon(clipPolyToRect(polygon, rect), spacingPx / 2), canvasW, canvasH, {
    shape: "polygon",
    role: "standard",
    label: "Wave",
  });

  return slot ? [slot] : [];
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
    return createCollageSlot({
      type: "image",
      role: "standard",
      x: xCell / canvasW,
      y: yCell / canvasH,
      w: wCell / canvasW,
      h: cellH / canvasH,
    });
  });
}

function distributeCounts(total: number, weights: number[]): number[] {
  const counts = weights.map(() => 0);
  if (total <= 0 || weights.length === 0) return counts;

  const sum = weights.reduce((acc, weight) => acc + weight, 0) || 1;
  const raw = weights.map((weight) => (weight / sum) * total);
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
      if (fraction > bestFraction) {
        best = i;
        bestFraction = fraction;
      }
    }
    counts[best]++;
    raw[best] = Math.floor(raw[best]);
    used++;
  }

  return counts;
}

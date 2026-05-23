import { createCollageSlot } from "./collageFactory";
import { makeGridSlots } from "./collageLayoutEngine";
import type { CollageShapeTemplate, CollageShapeTemplateMaskMode, CollageSlot } from "@/types/collage";
import type { JsonValue } from "@/types/primitives";

export interface CollageMaskSnapshot {
  version: 1;
  templateId: string;
  name: string;
  sourceType: CollageShapeTemplate["sourceType"];
  fileDataUrl: string;
  thumbnailDataUrl?: string;
  maskAssetId?: string;
  maskMode: CollageShapeTemplateMaskMode;
  threshold: number;
  alphaThreshold: number;
  feather: number;
  invert: boolean;
  width: number;
  height: number;
  analysis?: CollageMaskAnalysis;
}

export interface CollageMaskAnalysis {
  version: 1;
  width: number;
  height: number;
  activePixels: number;
  activeRatio: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
  disconnectedComponents: number;
  thinness: number;
  warnings: string[];
}

export interface MaskAlphaResult {
  dataUrl: string;
  width: number;
  height: number;
  analysis: CollageMaskAnalysis;
}

export function collageMaskSnapshotToJson(snapshot: CollageMaskSnapshot): JsonValue {
  return snapshot as unknown as JsonValue;
}

export function readCollageMaskSnapshot(value: unknown): CollageMaskSnapshot | null {
  if (value == null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.fileDataUrl !== "string") return null;
  return record as unknown as CollageMaskSnapshot;
}

export function createCollageMaskSnapshot(template: CollageShapeTemplate, maskAssetId?: string, analysis?: CollageMaskAnalysis): CollageMaskSnapshot {
  return {
    version: 1,
    templateId: template.id,
    name: template.name,
    sourceType: template.sourceType,
    fileDataUrl: template.fileDataUrl,
    thumbnailDataUrl: template.thumbnailDataUrl,
    maskAssetId,
    maskMode: template.maskMode,
    threshold: template.threshold,
    alphaThreshold: template.alphaThreshold,
    feather: template.feather,
    invert: template.invert,
    width: template.defaultWidth,
    height: template.defaultHeight,
    analysis
  };
}

export async function renderTemplateToAlphaMask(template: CollageShapeTemplate, maxSize = 768): Promise<MaskAlphaResult> {
  const image = await loadImage(template.fileDataUrl);
  const scale = Math.min(1, maxSize / Math.max(1, image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width || template.defaultWidth || 1) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height || template.defaultHeight || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) throw new Error("Cannot render mask template");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  applyMaskModeToImageData(imageData, template.maskMode, template.threshold, template.alphaThreshold, template.invert);
  ctx.putImageData(imageData, 0, 0);
  const alpha = extractAlpha(imageData);
  const analysis = analyzeMaskAlpha(alpha, width, height);
  return { dataUrl: canvas.toDataURL("image/png"), width, height, analysis };
}

export function analyzeMaskAlpha(alpha: Uint8Array, width: number, height: number): CollageMaskAnalysis {
  let activePixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] <= 0) continue;
      activePixels++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const bounds = maxX >= minX && maxY >= minY
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;
  const activeRatio = activePixels / Math.max(1, width * height);
  const components = countComponents(alpha, width, height, 32);
  const thinness = bounds === null ? 0 : Math.min(bounds.width, bounds.height) / Math.max(1, Math.max(bounds.width, bounds.height));
  const warnings: string[] = [];
  if (activeRatio < 0.035) warnings.push("Mask active area is very small.");
  if (bounds === null) warnings.push("Mask has no active pixels.");
  if (bounds !== null && (bounds.width < width * 0.08 || bounds.height < height * 0.08)) warnings.push("Mask bounds are too thin.");
  if (components > 8) warnings.push("Mask has many disconnected regions.");
  return { version: 1, width, height, activePixels, activeRatio, bounds, disconnectedComponents: components, thinness, warnings };
}

export function buildMaskAwareSlotsFromAnalysis(
  analysis: CollageMaskAnalysis | undefined,
  imageCount: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number
): CollageSlot[] {
  if (imageCount <= 0) return [];
  if (!analysis?.bounds || analysis.activeRatio < 0.025) {
    return safeGrid(imageCount, canvasW, canvasH, spacingPx, marginPx);
  }

  const bounds = scaleMaskBoundsToCanvas(analysis.bounds, analysis.width, analysis.height, canvasW, canvasH, marginPx);
  const grid = chooseCoverageGrid(imageCount, bounds.w, bounds.h);
  const rowCounts = distributeCountsAcrossRows(imageCount, grid.rows);
  const rows = rowCounts.length;
  const slots: CollageSlot[] = [];
  const rowH = (bounds.h - spacingPx * (rows - 1)) / rows;
  if (rowH < Math.min(canvasW, canvasH) * 0.035) return safeGrid(imageCount, canvasW, canvasH, spacingPx, marginPx);

  let placed = 0;
  for (let row = 0; row < rows; row++) {
    const count = rowCounts[row] ?? 0;
    if (count <= 0) continue;
    const spanW = bounds.w;
    const spanX = bounds.x;
    const y = bounds.y + row * (rowH + spacingPx);
    const cellW = (spanW - spacingPx * (count - 1)) / count;
    if (cellW < Math.min(canvasW, canvasH) * 0.035) return safeGrid(imageCount, canvasW, canvasH, spacingPx, marginPx);
    for (let col = 0; col < count; col++) {
      slots.push(createCollageSlot({
        type: "image",
        role: placed === 0 && imageCount <= 8 ? "hero" : "standard",
        shape: "rounded",
        shapeParams: { cornerRadius: 0.04 },
        x: (spanX + col * (cellW + spacingPx)) / canvasW,
        y: y / canvasH,
        w: cellW / canvasW,
        h: rowH / canvasH,
        label: `Shape ${placed + 1}`,
        zIndex: placed
      }));
      placed++;
    }
  }

  return slots.length >= imageCount ? slots.slice(0, imageCount) : safeGrid(imageCount, canvasW, canvasH, spacingPx, marginPx);
}

function applyMaskModeToImageData(
  imageData: ImageData,
  mode: CollageShapeTemplateMaskMode,
  threshold: number,
  alphaThreshold: number,
  invert: boolean
): void {
  const data = imageData.data;
  const effectiveMode = mode === "auto" ? detectMaskMode(data) : mode;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 0;
    const brightness = (r + g + b) / 3;
    let active = false;
    if (effectiveMode === "alpha") active = a > alphaThreshold;
    else if (effectiveMode === "blackOnWhite") active = a > alphaThreshold && brightness < threshold;
    else active = a > alphaThreshold && brightness > threshold;
    if (invert) active = !active;
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = active ? 255 : 0;
  }
}

function detectMaskMode(data: Uint8ClampedArray): CollageShapeTemplateMaskMode {
  let transparent = 0;
  let samples = 0;
  let edgeBrightness = 0;
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 245) transparent++;
  }
  if (transparent / Math.max(1, pixelCount) > 0.02) return "alpha";
  const sampleCount = Math.min(pixelCount, 300);
  for (let p = 0; p < sampleCount; p++) {
    const i = Math.floor((p / sampleCount) * pixelCount) * 4;
    edgeBrightness += ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
    samples++;
  }
  return edgeBrightness / Math.max(1, samples) > 128 ? "blackOnWhite" : "whiteOnBlack";
}

function extractAlpha(imageData: ImageData): Uint8Array {
  const alpha = new Uint8Array(imageData.width * imageData.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = imageData.data[i * 4 + 3] ?? 0;
  return alpha;
}

function countComponents(alpha: Uint8Array, width: number, height: number, minPixels: number): number {
  const seen = new Uint8Array(alpha.length);
  let count = 0;
  const queue: number[] = [];
  for (let i = 0; i < alpha.length; i++) {
    if (seen[i] || alpha[i] === 0) continue;
    let size = 0;
    seen[i] = 1;
    queue.push(i);
    while (queue.length > 0) {
      const current = queue.pop()!;
      size++;
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y < height - 1 ? current + width : -1
      ];
      for (const n of neighbors) {
        if (n < 0 || seen[n] || alpha[n] === 0) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    if (size >= minPixels) count++;
  }
  return count;
}

function scaleMaskBoundsToCanvas(
  bounds: NonNullable<CollageMaskAnalysis["bounds"]>,
  maskW: number,
  maskH: number,
  canvasW: number,
  canvasH: number,
  marginPx: number
) {
  const usableW = Math.max(1, canvasW - marginPx * 2);
  const usableH = Math.max(1, canvasH - marginPx * 2);
  const scale = Math.min(usableW / Math.max(1, maskW), usableH / Math.max(1, maskH));
  const fittedW = maskW * scale;
  const fittedH = maskH * scale;
  const offsetX = (canvasW - fittedW) / 2;
  const offsetY = (canvasH - fittedH) / 2;
  return {
    x: offsetX + bounds.x * scale,
    y: offsetY + bounds.y * scale,
    w: bounds.width * scale,
    h: bounds.height * scale
  };
}

function chooseCoverageGrid(count: number, w: number, h: number): { rows: number; cols: number } {
  let best = { rows: 1, cols: count };
  let bestScore = Infinity;
  const targetCellAspect = 1.35;
  const aspect = w / Math.max(1, h);
  for (let rows = 1; rows <= count; rows++) {
    const cols = Math.ceil(count / rows);
    const cellAspect = aspect * (rows / cols);
    const emptyCells = rows * cols - count;
    const score =
      Math.abs(Math.log(Math.max(0.05, cellAspect) / targetCellAspect)) +
      emptyCells * 0.22 +
      (rows > cols ? 0.35 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { rows, cols };
    }
  }
  return best;
}

function distributeCountsAcrossRows(total: number, rows: number): number[] {
  const counts = Array.from({ length: rows }, () => Math.floor(total / rows));
  let remaining = total - counts.reduce((acc, count) => acc + count, 0);
  let cursor = Math.floor(rows / 2);
  let direction = -1;
  let distance = 0;
  while (remaining > 0) {
    counts[cursor] = (counts[cursor] ?? 0) + 1;
    remaining--;
    if (direction < 0) {
      cursor = Math.max(0, Math.floor(rows / 2) - distance - 1);
      direction = 1;
    } else {
      distance++;
      cursor = Math.min(rows - 1, Math.floor(rows / 2) + distance);
      direction = -1;
    }
  }
  return counts.filter((count) => count > 0);
}

function safeGrid(imageCount: number, canvasW: number, canvasH: number, spacingPx: number, marginPx: number): CollageSlot[] {
  const usableW = Math.max(1, canvasW - marginPx * 2);
  const usableH = Math.max(1, canvasH - marginPx * 2);
  const cols = imageCount <= 2 ? imageCount : imageCount <= 4 ? 2 : imageCount <= 9 ? 3 : imageCount <= 16 ? 4 : 5;
  return makeGridSlots(imageCount, marginPx, marginPx, usableW, usableH, spacingPx, cols, canvasW, canvasH);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load mask image"));
    image.src = src;
  });
}

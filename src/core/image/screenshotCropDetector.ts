export interface ScreenshotCropAnalysis {
  isSuspicious: boolean;
  confidence: number;
  reasons: string[];
  cropRect: { x: number; y: number; width: number; height: number } | null;
  removedPixels: { top: number; bottom: number; left: number; right: number };
}

export interface ScreenshotCropOptions {
  maxAnalysisSize?: number;
  darkThreshold?: number;
  uniformTolerance?: number;
  minCropPercent?: number;
  maxCropPercent?: number;
  confidenceThreshold?: number;
}

interface EdgeStats {
  darkRatio: number;
  uniformRatio: number;
  mean: [number, number, number];
  variance: number;
}

const DEFAULT_OPTIONS: Required<ScreenshotCropOptions> = {
  maxAnalysisSize: 600,
  darkThreshold: 32,
  uniformTolerance: 10,
  minCropPercent: 0.02,
  maxCropPercent: 0.35,
  confidenceThreshold: 0.62
};

export async function analyzeScreenshotCrop(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  options: ScreenshotCropOptions = {}
): Promise<ScreenshotCropAnalysis> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sourceWidth = getSourceWidth(source);
  const sourceHeight = getSourceHeight(source);
  const empty = emptyAnalysis(sourceWidth, sourceHeight);
  if (sourceWidth <= 8 || sourceHeight <= 8 || typeof document === "undefined") {
    return empty;
  }

  const scale = Math.min(1, opts.maxAnalysisSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return empty;
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;

  const top = scanTop(pixels, width, height, opts);
  const bottom = scanBottom(pixels, width, height, opts);
  const left = scanLeft(pixels, width, height, opts, top, bottom);
  const right = scanRight(pixels, width, height, opts, top, bottom);

  const cropX = Math.min(left, width - 1);
  const cropY = Math.min(top, height - 1);
  const cropRight = Math.max(cropX + 1, width - right);
  const cropBottom = Math.max(cropY + 1, height - bottom);
  const cropWidth = cropRight - cropX;
  const cropHeight = cropBottom - cropY;
  const removedArea = 1 - (cropWidth * cropHeight) / (width * height);
  const maxSideCrop = Math.max(top / height, bottom / height, left / width, right / width);
  const minSideCrop = Math.min(
    top > 0 ? top / height : 1,
    bottom > 0 ? bottom / height : 1,
    left > 0 ? left / width : 1,
    right > 0 ? right / width : 1
  );

  const reasons: string[] = [];
  const edgeBands = [
    top > 0 ? averageRows(pixels, width, height, 0, Math.max(1, top)) : null,
    bottom > 0 ? averageRows(pixels, width, height, height - bottom, height) : null,
    left > 0 ? averageCols(pixels, width, height, 0, Math.max(1, left), top, bottom) : null,
    right > 0 ? averageCols(pixels, width, height, width - right, width, top, bottom) : null
  ].filter((item): item is EdgeStats => item !== null);

  const darkMarginScore = edgeBands.length === 0
    ? 0
    : edgeBands.reduce((sum, band) => sum + Math.max(band.darkRatio, band.uniformRatio * 0.7), 0) / edgeBands.length;
  const phoneRatioScore = phoneLikeAspectRatio(sourceWidth, sourceHeight) ? 0.16 : 0;
  if (phoneRatioScore > 0) reasons.push("phone-like aspect ratio");
  if (darkMarginScore > 0.75) reasons.push("dark or uniform empty border");

  const verticalSymmetry = symmetryScore(top, bottom, height);
  const horizontalSymmetry = symmetryScore(left, right, width);
  const symmetry = Math.max(verticalSymmetry, horizontalSymmetry);
  if (symmetry > 0.6) reasons.push("symmetrical margins");

  const contentContrast = sampleContentContrast(pixels, width, height, cropX, cropY, cropWidth, cropHeight, edgeBands);
  if (contentContrast > 0.12) reasons.push("clear border/content difference");

  if (removedArea >= opts.minCropPercent) reasons.push("meaningful crop area");
  if (minSideCrop < 0.01 && maxSideCrop > 0.06) reasons.push("one-sided screenshot margin");

  const confidence = clamp01(
    darkMarginScore * 0.43 +
    Math.min(removedArea / 0.18, 1) * 0.22 +
    symmetry * 0.12 +
    contentContrast * 0.17 +
    phoneRatioScore
  );

  const removesTooLittle = removedArea < opts.minCropPercent;
  const removesTooMuch = maxSideCrop > opts.maxCropPercent;
  const sameAsOriginal = cropX <= 1 && cropY <= 1 && cropRight >= width - 1 && cropBottom >= height - 1;
  const isSuspicious = !removesTooLittle && !removesTooMuch && !sameAsOriginal && confidence >= opts.confidenceThreshold;
  if (removesTooMuch) reasons.push("crop exceeds safe automatic review limit");
  if (!isSuspicious && confidence < opts.confidenceThreshold) reasons.push("confidence below threshold");

  const scaledRect = {
    x: Math.round(cropX / scale),
    y: Math.round(cropY / scale),
    width: Math.round(cropWidth / scale),
    height: Math.round(cropHeight / scale)
  };

  return {
    isSuspicious,
    confidence: Number(confidence.toFixed(3)),
    reasons,
    cropRect: isSuspicious ? clampRectToSource(scaledRect, sourceWidth, sourceHeight) : null,
    removedPixels: {
      top: Math.round(top / scale),
      bottom: Math.round(bottom / scale),
      left: Math.round(left / scale),
      right: Math.round(right / scale)
    }
  };
}

function scanTop(data: Uint8ClampedArray, width: number, height: number, opts: Required<ScreenshotCropOptions>): number {
  let y = 0;
  for (; y < height; y += 1) {
    if (!isRemovable(averageRows(data, width, height, y, y + 1), opts)) break;
  }
  return y;
}

function scanBottom(data: Uint8ClampedArray, width: number, height: number, opts: Required<ScreenshotCropOptions>): number {
  let count = 0;
  for (let y = height - 1; y >= 0; y -= 1) {
    if (!isRemovable(averageRows(data, width, height, y, y + 1), opts)) break;
    count += 1;
  }
  return count;
}

function scanLeft(data: Uint8ClampedArray, width: number, height: number, opts: Required<ScreenshotCropOptions>, top: number, bottom: number): number {
  let x = 0;
  for (; x < width; x += 1) {
    if (!isRemovable(averageCols(data, width, height, x, x + 1, top, bottom), opts)) break;
  }
  return x;
}

function scanRight(data: Uint8ClampedArray, width: number, height: number, opts: Required<ScreenshotCropOptions>, top: number, bottom: number): number {
  let count = 0;
  for (let x = width - 1; x >= 0; x -= 1) {
    if (!isRemovable(averageCols(data, width, height, x, x + 1, top, bottom), opts)) break;
    count += 1;
  }
  return count;
}

function isRemovable(stats: EdgeStats, opts: Required<ScreenshotCropOptions>): boolean {
  return stats.darkRatio >= 0.9 || (stats.uniformRatio >= 0.94 && stats.variance <= opts.uniformTolerance * opts.uniformTolerance);
}

function averageRows(data: Uint8ClampedArray, width: number, height: number, yStart: number, yEnd: number): EdgeStats {
  return averageRegion(data, width, height, 0, yStart, width, Math.min(height, yEnd));
}

function averageCols(data: Uint8ClampedArray, width: number, height: number, xStart: number, xEnd: number, top = 0, bottom = 0): EdgeStats {
  return averageRegion(data, width, height, xStart, Math.min(height - 1, top), Math.min(width, xEnd), Math.max(top + 1, height - bottom));
}

function averageRegion(data: Uint8ClampedArray, width: number, height: number, xStart: number, yStart: number, xEnd: number, yEnd: number): EdgeStats {
  let count = 0;
  let dark = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const colors: number[] = [];
  for (let y = Math.max(0, yStart); y < Math.min(height, yEnd); y += 1) {
    for (let x = Math.max(0, xStart); x < Math.min(width, xEnd); x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      sumR += r;
      sumG += g;
      sumB += b;
      colors.push((r + g + b) / 3);
      if (r <= DEFAULT_OPTIONS.darkThreshold && g <= DEFAULT_OPTIONS.darkThreshold && b <= DEFAULT_OPTIONS.darkThreshold) dark += 1;
      count += 1;
    }
  }
  if (count === 0) return { darkRatio: 0, uniformRatio: 0, mean: [0, 0, 0], variance: Number.POSITIVE_INFINITY };
  const meanGray = colors.reduce((sum, value) => sum + value, 0) / count;
  const variance = colors.reduce((sum, value) => sum + (value - meanGray) ** 2, 0) / count;
  const tolerance = DEFAULT_OPTIONS.uniformTolerance;
  const uniform = colors.filter((value) => Math.abs(value - meanGray) <= tolerance).length;
  return {
    darkRatio: dark / count,
    uniformRatio: uniform / count,
    mean: [sumR / count, sumG / count, sumB / count],
    variance
  };
}

function sampleContentContrast(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cropX: number,
  cropY: number,
  cropWidth: number,
  cropHeight: number,
  edgeBands: EdgeStats[]
): number {
  if (edgeBands.length === 0) return 0;
  const content = averageRegion(
    data,
    width,
    height,
    cropX + Math.floor(cropWidth * 0.1),
    cropY + Math.floor(cropHeight * 0.1),
    cropX + Math.ceil(cropWidth * 0.9),
    cropY + Math.ceil(cropHeight * 0.9)
  );
  const edgeMean = edgeBands.reduce((sum, band) => sum + luminance(band.mean), 0) / edgeBands.length;
  return Math.min(1, Math.abs(luminance(content.mean) - edgeMean) / 255);
}

function luminance(rgb: [number, number, number]): number {
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function symmetryScore(a: number, b: number, total: number): number {
  if (a <= 0 && b <= 0) return 0;
  const max = Math.max(a, b);
  if (max <= total * 0.01) return 0;
  return 1 - Math.min(1, Math.abs(a - b) / Math.max(1, max));
}

function phoneLikeAspectRatio(width: number, height: number): boolean {
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  return ratio >= 1.65 && ratio <= 2.35;
}

function getSourceWidth(source: HTMLImageElement | HTMLCanvasElement | ImageBitmap): number {
  return "naturalWidth" in source ? source.naturalWidth || source.width : source.width;
}

function getSourceHeight(source: HTMLImageElement | HTMLCanvasElement | ImageBitmap): number {
  return "naturalHeight" in source ? source.naturalHeight || source.height : source.height;
}

function emptyAnalysis(width: number, height: number): ScreenshotCropAnalysis {
  return {
    isSuspicious: false,
    confidence: 0,
    reasons: [],
    cropRect: null,
    removedPixels: { top: 0, bottom: 0, left: 0, right: 0 }
  };
}

function clampRectToSource(rect: { x: number; y: number; width: number; height: number }, width: number, height: number): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.min(width - 1, rect.x));
  const y = Math.max(0, Math.min(height - 1, rect.y));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, rect.width)),
    height: Math.max(1, Math.min(height - y, rect.height))
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

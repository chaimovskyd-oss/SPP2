import { applyImageAdjustmentStack } from "@/core/rendering/imageAdjustmentPipeline";
import type { ImageAdjustment } from "@/types/imageAdjustments";
import type { PreparedRenderResult, PrepareCropRect, PrepareRecipe, PrepareResult } from "./types";

export async function renderPrepared(result: PrepareResult, mode: "preview" | "export" = "preview"): Promise<PreparedRenderResult> {
  return renderPreparedFromSource(result.sourceUrl, result.recipe, mode);
}

export async function renderPreparedFromSource(
  sourceUrl: string,
  recipe: PrepareRecipe,
  mode: "preview" | "export" = "preview"
): Promise<PreparedRenderResult> {
  const image = await loadImage(sourceUrl);
  let current = drawCrop(image, { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight });

  if (recipe.screenshotCrop?.enabled) {
    current = cropCanvas(current, recipe.screenshotCrop.rect);
  }
  if (recipe.targetCrop?.enabled) {
    current = cropCanvas(current, recipe.targetCrop.rect);
  }

  current = applyAdjustmentStackSafely(current, recipe.technicalAdjustments);
  if (recipe.designPreset?.enabled) {
    current = applyAdjustmentStackSafely(current, recipe.designPreset.adjustments);
  }

  if (mode === "preview") {
    current = downscaleForPreview(current, 900);
  }

  return {
    dataUrl: current.toDataURL("image/jpeg", mode === "export" ? 0.94 : 0.86),
    width: current.width,
    height: current.height
  };
}

function applyAdjustmentStackSafely(source: HTMLCanvasElement, stack: ImageAdjustment[]): HTMLCanvasElement {
  if (stack.length === 0) return source;
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return source;
  const beforeAdjustments = cloneCanvas(source);
  const data = ctx.getImageData(0, 0, source.width, source.height);
  const beforeBrightness = estimateBrightness(data);
  applyImageAdjustmentStack(data, stack, 1);
  const afterBrightness = estimateBrightness(data);
  if (!Number.isFinite(afterBrightness) || (beforeBrightness > 8 && afterBrightness < 2)) {
    return beforeAdjustments;
  }
  ctx.putImageData(data, 0, 0);
  return source;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load image"));
    image.src = src;
  });
}

function drawCrop(image: HTMLImageElement, rect: PrepareCropRect): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function cropCanvas(source: HTMLCanvasElement, rect: PrepareCropRect): HTMLCanvasElement {
  const safe = normalizeCropRect(source.width, source.height, rect);
  const canvas = document.createElement("canvas");
  canvas.width = safe.width;
  canvas.height = safe.height;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, safe.width, safe.height);
    ctx.drawImage(source, safe.x, safe.y, safe.width, safe.height, 0, 0, safe.width, safe.height);
  }
  return canvas;
}

function normalizeCropRect(sourceWidth: number, sourceHeight: number, rect: PrepareCropRect): PrepareCropRect {
  const fallback = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 2 ||
    height < 2 ||
    sourceWidth < 2 ||
    sourceHeight < 2
  ) {
    return fallback;
  }
  const x = Math.round(Math.max(0, Math.min(sourceWidth - 1, rect.x)));
  const y = Math.round(Math.max(0, Math.min(sourceHeight - 1, rect.y)));
  const safeWidth = Math.max(1, Math.min(sourceWidth - x, width));
  const safeHeight = Math.max(1, Math.min(sourceHeight - y, height));
  if (safeWidth < Math.min(24, sourceWidth) || safeHeight < Math.min(24, sourceHeight)) {
    return fallback;
  }
  return { x, y, width: safeWidth, height: safeHeight };
}

function downscaleForPreview(source: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const edge = Math.max(source.width, source.height);
  if (edge <= maxEdge) return source;
  const scale = maxEdge / edge;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.drawImage(source, 0, 0);
  }
  return canvas;
}

function estimateBrightness(imageData: ImageData): number {
  const data = imageData.data;
  if (data.length === 0) return 0;
  const step = Math.max(4, Math.floor(data.length / 4000 / 4) * 4);
  let total = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += step) {
    total += data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

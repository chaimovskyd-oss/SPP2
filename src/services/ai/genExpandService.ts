import { callFalApi, toFalImageUrl, imageUrlToDataUrl } from "./falAiService";
import { FAL_MODELS } from "./falModels.config";

const FAL_MAX_DIMENSION = 5000;
const FAL_MAX_AREA = 25_000_000;
const LOCAL_RESIZE_MAX_AREA = 67_000_000;

export interface ExpansionAmounts {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface BriaExpandInput {
  image_url: string;
  canvas_size: [number, number];
  original_image_size: [number, number];
  original_image_location: [number, number];
}

interface BriaExpandOutput {
  image: { url: string };
}

interface FluxFillOutput {
  images: Array<{ url: string }>;
}

interface LoadedImage {
  element: HTMLImageElement;
  width: number;
  height: number;
}

function loadImage(imageDataUrl: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () =>
      resolve({
        element: el,
        width: el.naturalWidth,
        height: el.naturalHeight,
      });
    el.onerror = reject;
    el.src = imageDataUrl;
  });
}

function getExpandedCanvasSize(
  width: number,
  height: number,
  exp: ExpansionAmounts
): { totalW: number; totalH: number } {
  const totalW = width + exp.left + exp.right;
  const totalH = height + exp.top + exp.bottom;
  if (totalW <= 0 || totalH <= 0) {
    throw new Error("FAL_EXPAND_INVALID_CANVAS");
  }
  return { totalW, totalH };
}

function getFalScale(width: number, height: number): number {
  return Math.min(
    1,
    FAL_MAX_DIMENSION / width,
    FAL_MAX_DIMENSION / height,
    Math.sqrt(FAL_MAX_AREA / (width * height))
  );
}

function scaleExpansion(exp: ExpansionAmounts, scale: number): ExpansionAmounts {
  return {
    top: Math.max(0, Math.floor(exp.top * scale)),
    right: Math.max(0, Math.floor(exp.right * scale)),
    bottom: Math.max(0, Math.floor(exp.bottom * scale)),
    left: Math.max(0, Math.floor(exp.left * scale)),
  };
}

function drawImageToDataUrl(img: HTMLImageElement, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("FAL_EXPAND_RESIZE_CONTEXT_MISSING");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

async function resizeDataUrl(imageDataUrl: string, width: number, height: number): Promise<string> {
  const img = await loadImage(imageDataUrl);
  if (img.width === width && img.height === height) return imageDataUrl;
  return drawImageToDataUrl(img.element, width, height);
}

async function restoreRequestedSize(
  resultDataUrl: string,
  width: number,
  height: number
): Promise<string> {
  const result = await loadImage(resultDataUrl);
  if (result.width === width && result.height === height) return resultDataUrl;
  if (width * height > LOCAL_RESIZE_MAX_AREA) return resultDataUrl;
  return drawImageToDataUrl(result.element, width, height);
}

async function buildOutpaintInputs(
  imageDataUrl: string,
  exp: ExpansionAmounts
): Promise<{ paddedDataUrl: string; maskDataUrl: string }> {
  const img = await loadImage(imageDataUrl);
  const { totalW, totalH } = getExpandedCanvasSize(img.width, img.height, exp);

  const padCanvas = document.createElement("canvas");
  padCanvas.width = totalW;
  padCanvas.height = totalH;
  const padCtx = padCanvas.getContext("2d");
  if (!padCtx) throw new Error("FAL_EXPAND_CANVAS_CONTEXT_MISSING");
  padCtx.fillStyle = "#ffffff";
  padCtx.fillRect(0, 0, totalW, totalH);
  padCtx.drawImage(img.element, exp.left, exp.top, img.width, img.height);
  const paddedDataUrl = padCanvas.toDataURL("image/png");

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = totalW;
  maskCanvas.height = totalH;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("FAL_EXPAND_MASK_CONTEXT_MISSING");
  maskCtx.fillStyle = "#ffffff";
  maskCtx.fillRect(0, 0, totalW, totalH);
  maskCtx.fillStyle = "#000000";
  maskCtx.fillRect(exp.left, exp.top, img.width, img.height);
  const maskDataUrl = maskCanvas.toDataURL("image/png");

  return { paddedDataUrl, maskDataUrl };
}

/**
 * Expand an image outward using fal.ai.
 *
 * Bria Expand expects the original image plus target canvas geometry. Flux Fill
 * expects a padded image and a binary mask, so the two paths intentionally build
 * different payloads.
 */
export async function runGenExpand(
  imageDataUrl: string,
  expansion: ExpansionAmounts,
  prompt: string,
  useCreative: boolean,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<string> {
  onProgress(5);
  const originalImage = await loadImage(imageDataUrl);
  const requested = getExpandedCanvasSize(originalImage.width, originalImage.height, expansion);
  const scale = getFalScale(requested.totalW, requested.totalH);
  const apiExpansion = scaleExpansion(expansion, scale);
  const apiImageWidth = Math.max(1, Math.floor(originalImage.width * scale));
  const apiImageHeight = Math.max(1, Math.floor(originalImage.height * scale));
  const apiImageDataUrl =
    scale < 1 ? await resizeDataUrl(imageDataUrl, apiImageWidth, apiImageHeight) : imageDataUrl;

  if (useCreative) {
    const { paddedDataUrl, maskDataUrl } = await buildOutpaintInputs(apiImageDataUrl, apiExpansion);

    onProgress(10);

    const [paddedUrl, maskUrl] = await Promise.all([
      toFalImageUrl(paddedDataUrl, signal),
      toFalImageUrl(maskDataUrl, signal),
    ]);

    onProgress(15);

    const result = await callFalApi<
      { image_url: string; mask_url: string; prompt?: string },
      FluxFillOutput
    >(
      FAL_MODELS.expand.creative,
      {
        image_url: paddedUrl,
        mask_url: maskUrl,
        ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
      },
      (pct) => onProgress(15 + Math.round(pct * 0.85)),
      signal
    );
    onProgress(100);
    const outputUrl = result.images?.[0]?.url;
    if (!outputUrl) throw new Error("FAL_EXPAND_NO_OUTPUT");
    const resultDataUrl = await imageUrlToDataUrl(outputUrl, signal);
    return restoreRequestedSize(resultDataUrl, requested.totalW, requested.totalH);
  }

  const apiCanvas = getExpandedCanvasSize(apiImageWidth, apiImageHeight, apiExpansion);

  onProgress(10);

  const imageUrl = await toFalImageUrl(apiImageDataUrl, signal);

  onProgress(15);

  const input: BriaExpandInput = {
    image_url: imageUrl,
    canvas_size: [apiCanvas.totalW, apiCanvas.totalH],
    original_image_size: [apiImageWidth, apiImageHeight],
    original_image_location: [apiExpansion.left, apiExpansion.top],
  };

  const result = await callFalApi<BriaExpandInput, BriaExpandOutput>(
    FAL_MODELS.expand.default,
    input,
    (pct) => onProgress(15 + Math.round(pct * 0.85)),
    signal
  );
  onProgress(100);
  const resultDataUrl = await imageUrlToDataUrl(result.image.url, signal);
  return restoreRequestedSize(resultDataUrl, requested.totalW, requested.totalH);
}

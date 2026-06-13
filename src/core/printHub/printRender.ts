// Renders a source image to the EXACT pixel size a preset requires (gap G5) with
// auto-rotation to the source orientation (gap G6) and cover-fit cropping.
//
// The pixel-size math is split out as a pure function so it can be unit-tested without a canvas.

import type { PrintPreset } from "@/types/printHub";

const MM_PER_INCH = 25.4;

export interface PrintPixelSize {
  width: number;
  height: number;
  /** True when the target was rotated relative to the preset's native (long×short) orientation. */
  rotated: boolean;
}

function mmToPx(mm: number, dpi: number): number {
  return Math.max(1, Math.round((mm / MM_PER_INCH) * dpi));
}

/**
 * Computes the target canvas size in pixels for a preset, oriented to match the source image
 * (photo-lab behaviour: a portrait photo prints portrait even on a landscape-native preset).
 */
export function computePrintPixelSize(preset: PrintPreset, sourceWidth: number, sourceHeight: number): PrintPixelSize {
  const bleed = Math.max(0, preset.bleedMm);
  const wMm = preset.widthMm + 2 * bleed;
  const hMm = preset.heightMm + 2 * bleed;
  const longPx = mmToPx(Math.max(wMm, hMm), preset.dpi);
  const shortPx = mmToPx(Math.min(wMm, hMm), preset.dpi);

  const presetLandscape = preset.widthMm >= preset.heightMm;
  const sourceLandscape = sourceWidth >= sourceHeight;

  const width = sourceLandscape ? longPx : shortPx;
  const height = sourceLandscape ? shortPx : longPx;
  return { width, height, rotated: sourceLandscape !== presetLandscape };
}

/** Cover-fit source rect: largest centred crop of the source matching the target aspect. */
export function computeCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): { x: number; y: number; width: number; height: number } {
  const targetAspect = targetWidth / targetHeight;
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > targetAspect) {
    const width = Math.round(sourceHeight * targetAspect);
    return { x: Math.round((sourceWidth - width) / 2), y: 0, width, height: sourceHeight };
  }
  const height = Math.round(sourceWidth / targetAspect);
  return { x: 0, y: Math.round((sourceHeight - height) / 2), width: sourceWidth, height };
}

export interface RenderedPrintImage {
  dataUrl: string;
  width: number;
  height: number;
  rotated: boolean;
}

/** Renders sourceUrl to a print-ready JPEG sized for the preset. Browser/renderer only (uses canvas). */
export async function renderImageForPreset(sourceUrl: string, preset: PrintPreset): Promise<RenderedPrintImage> {
  const image = await loadImage(sourceUrl);
  const target = computePrintPixelSize(preset, image.naturalWidth, image.naturalHeight);
  const crop = computeCoverCrop(image.naturalWidth, image.naturalHeight, target.width, target.height);

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, target.width, target.height);
  }
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.95),
    width: target.width,
    height: target.height,
    rotated: target.rotated
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load image for print render"));
    image.src = src;
  });
}

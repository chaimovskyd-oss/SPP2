/**
 * Auto Fix service (browser glue).
 *
 * Loads an image by src/data-URL, downscales it (≤ 768px on the long edge — well
 * under full resolution so large images never freeze the canvas), samples a
 * skin region via the EXISTING face detection (graceful fallback), and runs the
 * pure Auto Fix engine. Fallback-safe: returns null when analysis can't run (no
 * DOM, tainted canvas, unloadable image) so the caller shows "could not improve".
 */

import { detectFocalPoint, type FocalPoint } from "@/core/collage/collageFaceDetect";
import type { NormRect } from "@/core/analysis/imageAutoAnalysis";
import {
  computeAutoFixStats,
  computeAutoFixCorrection,
  isMeaningfulCorrection,
  type AutoFixResult
} from "@/core/analysis/autoFix";

/** Long-edge cap for the analysis bitmap (512–1024 per the plan). */
const MAX_SAMPLE_EDGE = 768;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Box (normalized 0..1) around a focal point, sized by detection confidence. */
function skinRegionAround(focal: FocalPoint): NormRect | null {
  if (focal.confidence === "center") return null;
  const half = focal.confidence === "face" ? 0.1 : 0.16;
  const x = Math.max(0, Math.min(1 - 2 * half, focal.x - half));
  const y = Math.max(0, Math.min(1 - 2 * half, focal.y - half));
  return { x, y, width: half * 2, height: half * 2 };
}

/**
 * Analyse an image (by src/data-URL) and compute its full-strength Auto Fix
 * correction. Returns null when analysis cannot run.
 */
export async function analyzeImageForAutoFix(src: string | undefined): Promise<AutoFixResult | null> {
  if (src === undefined || src.length === 0) return null;
  if (typeof document === "undefined") return null;

  const img = await loadImage(src);
  if (img === null) return null;

  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  if (natW === 0 || natH === 0) return null;
  const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(natW, natH));
  const w = Math.max(1, Math.round(natW * scale));
  const h = Math.max(1, Math.round(natH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return null;

  try {
    ctx.drawImage(img, 0, 0, w, h);
  } catch {
    return null;
  }

  let rgba: Uint8ClampedArray;
  try {
    rgba = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; // tainted canvas (CORS)
  }

  let focal: FocalPoint = { x: 0.5, y: 0.5, confidence: "center" };
  try {
    focal = await detectFocalPoint(img, src);
  } catch {
    /* fall back to center */
  }

  const stats = computeAutoFixStats(rgba, w, h, {
    skinRegion: skinRegionAround(focal),
    hasFace: focal.confidence === "face"
  });
  const correction = computeAutoFixCorrection(stats);
  return { stats, correction, improved: isMeaningfulCorrection(correction) };
}

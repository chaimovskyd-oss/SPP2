/**
 * Suggested Fixes service (שלב 6 — Smart / AI, light pass).
 *
 * Browser-side glue that turns a loaded image into an `ImageAutoAnalysis` by:
 *   1. Reusing the EXISTING face detection (`detectFocalPoint`) to locate the
 *      subject — sidecar MediaPipe → Web FaceDetector → saliency → center.
 *   2. Sampling skin-region pixels (around the focal point) and whole-image
 *      pixels into `RegionStats`.
 *   3. Running the pure analyser, which recommends EXISTING Smart Presets.
 *
 * Fallback-safe per the plan: with no DOM / no canvas / unloadable image it
 * returns null and the caller simply shows nothing. No heavy models are loaded
 * here — face detection degrades gracefully through the existing chain.
 */

import { detectFocalPoint, type FocalPoint } from "@/core/collage/collageFaceDetect";
import {
  analyzeImageStats,
  computeRegionStats,
  type ImageAutoAnalysis,
  type NormRect
} from "@/core/analysis/imageAutoAnalysis";

const SAMPLE_SIZE = 96; // downsample grid edge — cheap, plenty for colour/exposure stats

/** Load an image element from a src/data-URL. Resolves null on failure. */
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

/** Box (normalized 0..1) around a focal point, sized by confidence. */
function skinRegionAround(focal: FocalPoint): NormRect | null {
  if (focal.confidence === "center") return null;
  const half = focal.confidence === "face" ? 0.12 : 0.18;
  const x = Math.max(0, Math.min(1 - 2 * half, focal.x - half));
  const y = Math.max(0, Math.min(1 - 2 * half, focal.y - half));
  return { x, y, width: half * 2, height: half * 2 };
}

/**
 * Analyse an image (by src/data-URL) and return suggested existing presets.
 * Returns null when analysis can't run (no DOM, unloadable image, no canvas).
 */
export async function analyzeImageForFixes(src: string | undefined): Promise<ImageAutoAnalysis | null> {
  if (src === undefined || src.length === 0) return null;
  if (typeof document === "undefined") return null;

  const img = await loadImage(src);
  if (img === null) return null;

  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return null;

  try {
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  } catch {
    return null; // tainted canvas or draw failure
  }

  let rgba: Uint8ClampedArray;
  try {
    rgba = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    return null; // tainted canvas (CORS)
  }

  // Reuse the existing face mechanism (with its own internal fallbacks).
  let focal: FocalPoint = { x: 0.5, y: 0.5, confidence: "center" };
  try {
    focal = await detectFocalPoint(img, src);
  } catch {
    /* fall back to center */
  }

  const whole = computeRegionStats(rgba, SAMPLE_SIZE, SAMPLE_SIZE);
  const region = skinRegionAround(focal);
  const skin = region ? computeRegionStats(rgba, SAMPLE_SIZE, SAMPLE_SIZE, region) : null;

  return analyzeImageStats({ whole, skin, hasFace: focal.confidence === "face" });
}

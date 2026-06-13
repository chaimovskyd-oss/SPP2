/**
 * Smart Shadow/Highlights V2 — analysis service.
 *
 * Runs ONCE on a downscaled copy of an image to produce the small set of cached
 * inputs the deterministic render pipeline needs to reproduce a scene-aware
 * correction: detected face boxes (with exposure diagnostics) and a global noise
 * score. It does NOT compute the correction itself — the pipeline does that from
 * these inputs, so live preview, export and print stay identical.
 *
 * Designed for headless / batch reuse (Batch Assistant, Photo Prints Wizard,
 * kindergarten workflows): it takes a plain `src` string and opens no UI.
 *
 * No generative AI, no cloud — only the existing SCRFD/MediaPipe face detector
 * plus luminance heuristics from core/analysis/smartShadowHighlights.
 */

import { loadDownscaledImageData } from "@/core/rendering/histogram";
import { detectAllFacesForAsset } from "@/core/classPhoto/classPhotoFaceDetect";
import {
  analyzeFaceLuma,
  estimateGlobalTone,
  estimateNoiseScore,
  estimateSceneCoverage,
  lumaMapFromRgba,
  suggestAutoShadowHighlights
} from "@/core/analysis/smartShadowHighlights";
import type { SmartFaceRegion } from "@/types/imageAdjustments";

/** Longest-edge size of the analysis image. Spec: 512–1024px. */
const ANALYSIS_MAX_DIM = 1024;

/** A face at/above this FaceUnderexposureScore needs recovery (spec tier ≥ 30). */
export const FACE_UNDEREXPOSED_THRESHOLD = 30;

export interface SmartShadowHighlightsOptions {
  prioritizeFaces?: boolean;
  noiseProtection?: boolean;
}

export interface SmartShadowHighlightsAnalysis {
  /** Detected faces (normalised) with per-face recovery diagnostics. */
  faceRegions: SmartFaceRegion[];
  /** Estimated whole-image sensor-noise score 0..100. */
  noiseScore: number;
  /** Auto Smart Shadows recommendation — a natural, conservative control set. */
  suggested: ReturnType<typeof suggestAutoShadowHighlights>;
  /** Wall-clock analysis time in ms (perf budget: < 300ms on preview res). */
  analysisMs: number;
  /** Internal diagnostics — NOT shown to users yet (spec §quality metrics). */
  diagnostics: SmartShadowHighlightsDiagnostics;
}

export interface SmartShadowHighlightsDiagnostics {
  faceCount: number;
  /** Faces whose FaceUnderexposureScore crosses the recovery threshold. */
  underexposedFaces: number;
  /** Highest per-face underexposure score (0..100). */
  maxUnderexposureScore: number;
  noiseScore: number;
  /** Fraction of the image (0..1) that reads as sky — what "Protect Sky" acts on. */
  skyCoverage: number;
  /** Fraction of the image (0..1) that reads as skin — what "Protect Skin" acts on. */
  skinCoverage: number;
  analysisDim: { width: number; height: number };
}

/**
 * Analyse an image for Smart Shadow/Highlights V2. Each face is scored
 * INDEPENDENTLY (no cross-face comparison, no skin-tone normalisation) via
 * analyzeFaceRecovery. Returns null only when the image can't be loaded/sampled
 * (caller then keeps pure V1 behaviour).
 */
export async function analyzeSmartShadowHighlights(
  src: string | undefined,
  options: SmartShadowHighlightsOptions = {}
): Promise<SmartShadowHighlightsAnalysis | null> {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const img = await loadDownscaledImageData(src, ANALYSIS_MAX_DIM);
  if (img === null) return null;

  const luma = lumaMapFromRgba(img.data, img.width, img.height);

  const noiseScore = options.noiseProtection === false ? 0 : estimateNoiseScore(luma, img.width, img.height);

  let faceRegions: SmartFaceRegion[] = [];
  if (options.prioritizeFaces !== false && src !== undefined) {
    const boxes = await detectAllFacesForAsset(src);
    faceRegions = boxes.map((b) => {
      const a = analyzeFaceLuma(luma, img.width, img.height, b);
      return {
        x: b.x, y: b.y, width: b.width, height: b.height,
        underexposureScore: a.underexposureScore,
        recoveryStrength: a.recoveryStrength,
        noiseScore: a.noiseScore,
        medianLuma: a.medianLuminance,
        highlightRatio: a.highlightRatio
      };
    });
  }

  const scores = faceRegions.map((f) => f.underexposureScore ?? 0);
  const underexposedFaces = scores.filter((s) => s >= FACE_UNDEREXPOSED_THRESHOLD).length;
  const maxUnderexposureScore = scores.length > 0 ? Math.max(...scores) : 0;
  const coverage = estimateSceneCoverage(img.data, img.width, img.height);
  const tone = estimateGlobalTone(luma);
  const suggested = suggestAutoShadowHighlights({ faces: faceRegions, coverage, tone });

  const analysisMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;

  return {
    faceRegions,
    noiseScore,
    suggested,
    analysisMs,
    diagnostics: {
      faceCount: faceRegions.length,
      underexposedFaces,
      maxUnderexposureScore,
      noiseScore,
      skyCoverage: coverage.sky,
      skinCoverage: coverage.skin,
      analysisDim: { width: img.width, height: img.height }
    }
  };
}

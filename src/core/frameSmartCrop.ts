import { detectFocalPoint, type FocalPoint } from "@/core/collage/collageFaceDetect";
import { detectFaceForAsset } from "@/core/classPhoto/classPhotoFaceDetect";
import { clampContentTransformToFillBounds, computeContentRect } from "@/core/rendering/frameFitEngine";
import type { Asset } from "@/types/document";
import type { ContentTransform, FaceAnchorData, FrameLayer } from "@/types/layers";

export interface FrameFaceSizingAnalysis {
  transform: ContentTransform;
  faceRatio: number;
  hasDetectedFace: boolean;
}

// Minimum confidence for a face to count as a real detection. The portrait
// heuristic fallback returns 0.3, so anything at or below this is not a real
// face. `knownFace` stored during the wizard is often this heuristic value
// (wizard detection runs on blob: URLs, which can't reach the Python sidecar),
// so we must NOT trust it blindly — re-detect against the asset's data URL,
// which the sidecar can reach.
const REAL_FACE_MIN_CONFIDENCE = 0.31;

async function resolveRealFace(
  src: string,
  knownFace?: FaceAnchorData
): Promise<FaceAnchorData | null> {
  if (knownFace !== undefined && knownFace.confidence > REAL_FACE_MIN_CONFIDENCE) {
    return knownFace;
  }
  const detected = await detectFaceForAsset(src);
  // Prefer a real fresh detection; otherwise fall back to whatever we were
  // handed (even a low-confidence heuristic) so the caller can decide.
  if (detected !== null && detected.confidence > REAL_FACE_MIN_CONFIDENCE) {
    return detected;
  }
  return detected ?? knownFace ?? null;
}

export async function computeFaceCenteredTransformForFrame(
  asset: Asset,
  frame: Pick<FrameLayer, "width" | "height" | "fitMode" | "padding" | "contentTransform">
): Promise<ContentTransform> {
  const src = asset.previewPath ?? asset.originalPath ?? "";
  if (src.length === 0) return frame.contentTransform;

  try {
    const image = await loadHtmlImage(src);
    const focal = await detectFocalPoint(image, src);
    return focalToCenteringTransform(
      focal,
      frame.contentTransform,
      frame.width,
      frame.height,
      image.naturalWidth,
      image.naturalHeight,
      frame.fitMode,
      frame.padding
    );
  } catch {
    return frame.contentTransform;
  }
}

export async function analyzeFaceSizingForFrame(
  asset: Asset,
  frame: Pick<FrameLayer, "width" | "height" | "fitMode" | "padding" | "contentTransform">,
  knownFace?: FaceAnchorData
): Promise<FrameFaceSizingAnalysis | null> {
  const src = asset.previewPath ?? asset.originalPath ?? "";
  if (src.length === 0) return null;

  try {
    const image = await loadHtmlImage(src);
    const face = await resolveRealFace(src, knownFace);
    if (face === null || face.confidence <= REAL_FACE_MIN_CONFIDENCE) return null;
    const faceRatio = computeRenderedFaceRatio(face, frame, image.naturalWidth, image.naturalHeight);
    const focal: FocalPoint = {
      x: face.faceBox.x + face.faceBox.width / 2,
      y: face.faceBox.y + face.faceBox.height / 2,
      confidence: "face"
    };
    return {
      transform: focalToCenteringTransform(
        focal,
        frame.contentTransform,
        frame.width,
        frame.height,
        image.naturalWidth,
        image.naturalHeight,
        frame.fitMode,
        frame.padding
      ),
      faceRatio,
      hasDetectedFace: face.confidence >= 0.5
    };
  } catch {
    return null;
  }
}

export async function computeFaceSizeMatchedTransformForFrame(
  asset: Asset,
  frame: Pick<FrameLayer, "width" | "height" | "fitMode" | "padding" | "contentTransform">,
  targetFaceRatio: number,
  knownFace?: FaceAnchorData
): Promise<ContentTransform> {
  const src = asset.previewPath ?? asset.originalPath ?? "";
  if (src.length === 0 || !Number.isFinite(targetFaceRatio) || targetFaceRatio <= 0) return frame.contentTransform;

  try {
    const image = await loadHtmlImage(src);
    const face = await resolveRealFace(src, knownFace);
    if (face === null || face.confidence <= REAL_FACE_MIN_CONFIDENCE || face.faceBox.height <= 0) return frame.contentTransform;
    return faceToSizeMatchedTransform(face, frame, image.naturalWidth, image.naturalHeight, targetFaceRatio);
  } catch {
    return frame.contentTransform;
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function focalToCenteringTransform(
  focal: FocalPoint,
  current: ContentTransform,
  frameWidth: number,
  frameHeight: number,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  fitMode: FrameLayer["fitMode"],
  padding: number
): ContentTransform {
  const probe = computeContentRect(
    frameWidth,
    frameHeight,
    imageNaturalWidth,
    imageNaturalHeight,
    fitMode,
    { ...current, offsetX: 0, offsetY: 0 },
    padding
  );

  const rad = ((current.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ax = focal.x - 0.5;
  const ay = focal.y - 0.5;
  const aBbox = 0.5 + ax * cos - ay * sin;
  const bBbox = 0.5 + ax * sin + ay * cos;

  return clampContentTransformToFillBounds(
    {
      ...current,
      offsetX: probe.width * (0.5 - aBbox),
      offsetY: probe.height * (0.5 - bBbox)
    },
    frameWidth,
    frameHeight,
    imageNaturalWidth,
    imageNaturalHeight,
    fitMode,
    padding
  );
}

function computeRenderedFaceRatio(
  face: FaceAnchorData,
  frame: Pick<FrameLayer, "width" | "height" | "fitMode" | "padding" | "contentTransform">,
  imageNaturalWidth: number,
  imageNaturalHeight: number
): number {
  const rect = computeContentRect(
    frame.width,
    frame.height,
    imageNaturalWidth,
    imageNaturalHeight,
    frame.fitMode,
    frame.contentTransform,
    frame.padding
  );
  const innerH = Math.max(1, frame.height - frame.padding * 2);
  return (face.faceBox.height * rect.renderHeight) / innerH;
}

function faceToSizeMatchedTransform(
  face: FaceAnchorData,
  frame: Pick<FrameLayer, "width" | "height" | "fitMode" | "padding" | "contentTransform">,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  targetFaceRatio: number
): ContentTransform {
  const innerH = Math.max(1, frame.height - frame.padding * 2);
  const baseRect = computeContentRect(
    frame.width,
    frame.height,
    imageNaturalWidth,
    imageNaturalHeight,
    frame.fitMode,
    { ...frame.contentTransform, offsetX: 0, offsetY: 0, scale: 1 },
    frame.padding
  );
  const rawScale = (targetFaceRatio * innerH) / Math.max(1, face.faceBox.height * baseRect.renderHeight);
  const currentScale = Math.max(1, frame.contentTransform.scale || 1);
  const scale = Math.max(
    Math.max(1, currentScale * 0.7),
    Math.min(Math.min(4, currentScale * 1.45), rawScale)
  );
  const focal: FocalPoint = {
    x: face.faceBox.x + face.faceBox.width / 2,
    y: face.faceBox.y + face.faceBox.height / 2,
    confidence: "face"
  };

  return focalToCenteringTransform(
    focal,
    { ...frame.contentTransform, scale },
    frame.width,
    frame.height,
    imageNaturalWidth,
    imageNaturalHeight,
    frame.fitMode,
    frame.padding
  );
}

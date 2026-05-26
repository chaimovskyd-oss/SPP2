import { resolveCanvasAssetPath } from "@/core/assets/assetManager";
import type { Asset } from "@/types/document";

export interface PassportDetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number };
  leftEye?: { x: number; y: number };
  rightEye?: { x: number; y: number };
  chin?: { x: number; y: number };
  headTop?: { x: number; y: number };
  center: { x: number; y: number };
  tiltDegrees: number;
  confidence: number;
}

export interface PassportBackgroundAnalysis {
  light: boolean;
  whiteOrOffWhite: boolean;
  uneven: boolean;
  colorCast: boolean;
  strongShadow: boolean;
  averageLuma: number;
}

export interface PassportDetectionResult {
  status: "ok" | "unavailable" | "error";
  cacheKey: string;
  imageWidth: number;
  imageHeight: number;
  faces: PassportDetectedFace[];
  background: PassportBackgroundAnalysis | null;
  message?: string;
}

let faceLandmarkerPromise: Promise<unknown | null> | null = null;
const detectionCache = new Map<string, Promise<PassportDetectionResult>>();

export function clearPassportDetectionCache(): void {
  detectionCache.clear();
}

export async function detectPassportImage(asset: Asset): Promise<PassportDetectionResult> {
  const src = resolveCanvasAssetPath(asset);
  const cacheKey = [
    asset.id,
    asset.hash ?? asset.checksum ?? "",
    asset.width ?? 0,
    asset.height ?? 0,
    src ?? ""
  ].join("|");
  const cached = detectionCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const promise = runDetection(asset, src, cacheKey);
  detectionCache.set(cacheKey, promise);
  return promise;
}

async function runDetection(asset: Asset, src: string | undefined, cacheKey: string): Promise<PassportDetectionResult> {
  if (src === undefined) {
    return emptyResult("error", cacheKey, asset.width ?? 0, asset.height ?? 0, "No image source");
  }
  try {
    const image = await loadImage(src);
    const background = analyzeBackground(image);
    const landmarker = await getFaceLandmarker();
    if (landmarker === null) {
      return { ...emptyResult("unavailable", cacheKey, image.naturalWidth, image.naturalHeight, "MediaPipe Face Landmarker unavailable"), background };
    }
    const result = detectWithLandmarker(landmarker, image);
    return {
      status: "ok",
      cacheKey,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      faces: result,
      background
    };
  } catch (error) {
    return emptyResult("error", cacheKey, asset.width ?? 0, asset.height ?? 0, error instanceof Error ? error.message : String(error));
  }
}

async function getFaceLandmarker(): Promise<unknown | null> {
  if (faceLandmarkerPromise !== null) return faceLandmarkerPromise;
  faceLandmarkerPromise = (async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
      return vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "IMAGE",
        numFaces: 4
      });
    } catch {
      return null;
    }
  })();
  return faceLandmarkerPromise;
}

function detectWithLandmarker(landmarker: unknown, image: HTMLImageElement): PassportDetectedFace[] {
  const detector = landmarker as { detect: (img: HTMLImageElement) => { faceLandmarks?: Array<Array<{ x: number; y: number }>> } };
  const result = detector.detect(image);
  return (result.faceLandmarks ?? []).map((landmarks) => landmarksToFace(landmarks)).filter((face): face is PassportDetectedFace => face !== null);
}

function landmarksToFace(landmarks: Array<{ x: number; y: number }>): PassportDetectedFace | null {
  if (landmarks.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of landmarks) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const leftEye = averageLandmarks(landmarks, [33, 133, 159, 145]);
  const rightEye = averageLandmarks(landmarks, [263, 362, 386, 374]);
  const chin = landmarks[152] ?? { x: (minX + maxX) / 2, y: maxY };
  const headTop = { x: (minX + maxX) / 2, y: minY };
  const tiltDegrees = leftEye !== undefined && rightEye !== undefined
    ? Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI
    : 0;
  return {
    boundingBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    leftEye,
    rightEye,
    chin,
    headTop,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    tiltDegrees,
    confidence: 0.85
  };
}

function averageLandmarks(landmarks: Array<{ x: number; y: number }>, indices: number[]): { x: number; y: number } | undefined {
  const points = indices.flatMap((index) => landmarks[index] === undefined ? [] : [landmarks[index]]);
  if (points.length === 0) return undefined;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function analyzeBackground(image: HTMLImageElement): PassportBackgroundAnalysis {
  const canvas = document.createElement("canvas");
  const maxSide = 320;
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) {
    return { light: false, whiteOrOffWhite: false, uneven: true, colorCast: false, strongShadow: false, averageLuma: 0 };
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const samples = sampleBackgroundPixels(ctx, canvas.width, canvas.height);
  const lumas = samples.map(({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b);
  const avgLuma = lumas.reduce((sum, luma) => sum + luma, 0) / Math.max(1, lumas.length);
  const minLuma = Math.min(...lumas);
  const maxLuma = Math.max(...lumas);
  const avgR = samples.reduce((sum, p) => sum + p.r, 0) / Math.max(1, samples.length);
  const avgG = samples.reduce((sum, p) => sum + p.g, 0) / Math.max(1, samples.length);
  const avgB = samples.reduce((sum, p) => sum + p.b, 0) / Math.max(1, samples.length);
  const channelSpread = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB);
  return {
    light: avgLuma >= 190,
    whiteOrOffWhite: avgLuma >= 205 && channelSpread <= 28,
    uneven: maxLuma - minLuma > 58,
    colorCast: channelSpread > 34,
    strongShadow: minLuma < 145 && maxLuma - minLuma > 70,
    averageLuma: avgLuma
  };
}

function sampleBackgroundPixels(ctx: CanvasRenderingContext2D, width: number, height: number): Array<{ r: number; g: number; b: number }> {
  const data = ctx.getImageData(0, 0, width, height).data;
  const samples: Array<{ r: number; g: number; b: number }> = [];
  const edge = Math.max(2, Math.round(Math.min(width, height) * 0.12));
  const step = Math.max(1, Math.round(Math.min(width, height) / 48));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const isEdge = x < edge || y < edge || x >= width - edge || y >= height - edge;
      if (!isEdge) continue;
      const i = (y * width + x) * 4;
      samples.push({ r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 });
    }
  }
  return samples;
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

function emptyResult(status: PassportDetectionResult["status"], cacheKey: string, imageWidth: number, imageHeight: number, message: string): PassportDetectionResult {
  return { status, cacheKey, imageWidth, imageHeight, faces: [], background: null, message };
}

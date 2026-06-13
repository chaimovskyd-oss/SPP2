/**
 * Face/content focal-point detection for collage + photo-print smart crop.
 *
 * Priority (first available wins):
 * 1. Python sidecar (SCRFD_2.5G_KPS → MediaPipe BlazeFace → OpenCV Haar). Real face detection,
 *    requires Electron with the smart-selection sidecar running.
 * 2. window.FaceDetector — experimental Web API (Chrome flag only). Inactive
 *    in stock Electron.
 * 3. Canvas pixel saliency heuristic — samples skin-tone/saturation/brightness.
 *    Not real face detection; bright/colorful objects can outscore faces.
 * 4. Image center (0.5, 0.5) — last resort.
 *
 * Returns a focal point [0..1, 0..1] within the image — used to compute
 * contentTransform so the focal area is centered inside the frame.
 */

export interface FocalPoint {
  x: number; // 0..1
  y: number; // 0..1
  confidence: "face" | "saliency" | "center";
}

const FOCAL_CACHE_LIMIT = 256;
const focalPointCache = new Map<string, FocalPoint>();

function rememberFocalPoint(key: string, value: FocalPoint): FocalPoint {
  if (focalPointCache.size >= FOCAL_CACHE_LIMIT) {
    const firstKey = focalPointCache.keys().next().value;
    if (firstKey !== undefined) focalPointCache.delete(firstKey);
  }
  focalPointCache.set(key, value);
  return value;
}

export function clearFocalPointCache(): void {
  focalPointCache.clear();
}

/**
 * Detect face/content focal point from an image element.
 *
 * @param img   The loaded image (used for dimensions and Web-API fallback).
 * @param src   Optional source path or data URL. If provided AND the Electron
 *              sidecar is reachable, real face detection runs in Python.
 */
export async function detectFocalPoint(
  img: HTMLImageElement,
  src?: string
): Promise<FocalPoint> {
  const cacheKey = src !== undefined && src.length > 0
    ? `${src}|${img.naturalWidth}x${img.naturalHeight}`
    : null;
  if (cacheKey !== null) {
    const cached = focalPointCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }

  // 1. Try the Python sidecar via Electron IPC (real face detection).
  if (src) {
    const sidecarFocal = await tryDetectViaSidecar(src, img.naturalWidth, img.naturalHeight);
    if (sidecarFocal !== null) {
      return cacheKey !== null ? rememberFocalPoint(cacheKey, sidecarFocal) : sidecarFocal;
    }
  }

  // 2. Try Face Detection API
  if ("FaceDetector" in window) {
    try {
      // @ts-ignore — FaceDetector is not in standard TS lib yet
      const detector = new (window as any).FaceDetector({ fastMode: true });
      const faces: Array<{ boundingBox: DOMRect }> = await detector.detect(img);
      if (faces.length > 0) {
        // Use centroid of all detected faces, weighted by area
        let totalArea = 0;
        let cx = 0;
        let cy = 0;
        for (const face of faces) {
          const bb = face.boundingBox;
          const area = bb.width * bb.height;
          cx += (bb.x + bb.width / 2) / img.naturalWidth * area;
          cy += (bb.y + bb.height / 2) / img.naturalHeight * area;
          totalArea += area;
        }
        if (totalArea > 0) {
          const focal: FocalPoint = { x: cx / totalArea, y: cy / totalArea, confidence: "face" };
          return cacheKey !== null ? rememberFocalPoint(cacheKey, focal) : focal;
        }
      }
    } catch { /* FaceDetector not available or failed */ }
  }

  // 3. Canvas saliency: find brightest/most-saturated region
  const saliencyFocal = computeSaliencyFocalPoint(img);
  return cacheKey !== null ? rememberFocalPoint(cacheKey, saliencyFocal) : saliencyFocal;
}

/**
 * Attempt face detection via the Python sidecar (SCRFD first, with MediaPipe/Haar fallback).
 * Returns null if
 * the sidecar is unreachable, the image cannot be loaded, or no faces are
 * found — caller falls back to the next strategy.
 */
async function tryDetectViaSidecar(
  src: string,
  imgWidth: number,
  imgHeight: number
): Promise<FocalPoint | null> {
  const spp = (typeof window !== "undefined"
    ? (window as unknown as { spp?: SppFaceBridge }).spp
    : undefined);
  if (!spp?.smartSelection?.detectFaces || !spp.smartSelection.loadImage) return null;

  try {
    const imagePath = await resolveImagePathForSidecar(src, spp);
    if (imagePath === null) return null;

    const imageId = `face-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const loaded = await spp.smartSelection.loadImage(imageId, imagePath, imageId);
    if (!loaded?.ok) return null;

    try {
      const result = await spp.smartSelection.detectFaces(imageId);
      if (!result?.ok || !result.faces || result.faces.length === 0) return null;

      // Area-weighted centroid of all detected faces, normalized to [0..1].
      const w = result.width || imgWidth;
      const h = result.height || imgHeight;
      let totalArea = 0;
      let cx = 0;
      let cy = 0;
      for (const face of result.faces) {
        const area = face.width * face.height;
        cx += ((face.x + face.width / 2) / w) * area;
        cy += ((face.y + face.height / 2) / h) * area;
        totalArea += area;
      }
      if (totalArea <= 0) return null;
      return { x: cx / totalArea, y: cy / totalArea, confidence: "face" };
    } finally {
      // Best-effort unload — ignore failures.
      spp.smartSelection.unloadImage?.(imageId).catch(() => undefined);
    }
  } catch {
    return null;
  }
}

async function resolveImagePathForSidecar(
  src: string,
  spp: SppFaceBridge
): Promise<string | null> {
  // file:// URL → strip the protocol.
  if (src.startsWith("file://")) {
    return decodeURIComponent(src.replace(/^file:\/\//, ""));
  }
  // Absolute filesystem path (Windows drive or POSIX root).
  if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith("/")) {
    return src;
  }
  // Data URL → write to temp file via Electron.
  if (src.startsWith("data:")) {
    if (!spp.writeTempImage) return null;
    const match = /^data:image\/(png|jpeg|jpg|webp|bmp);/i.exec(src);
    const ext = match ? match[1].toLowerCase().replace("jpeg", "jpg") : "png";
    try {
      return await spp.writeTempImage(src, ext);
    } catch {
      return null;
    }
  }
  // Unknown source (e.g., http(s)) — sidecar can't reach it; skip.
  return null;
}

interface SppFaceBridge {
  writeTempImage?: (dataUrl: string, ext: string) => Promise<string>;
  smartSelection?: {
    loadImage: (imageId: string, path: string, sourceHash: string) => Promise<{ ok?: boolean }>;
    unloadImage?: (imageId: string) => Promise<{ ok: boolean }>;
    detectFaces: (imageId: string) => Promise<{
      ok: boolean;
      width: number;
      height: number;
      backend: "scrfd_2.5g_kps" | "mediapipe" | "haar" | "none";
      faces: { x: number; y: number; width: number; height: number; score: number; landmarks?: { x: number; y: number }[] }[];
    }>;
  };
}

function computeSaliencyFocalPoint(img: HTMLImageElement): FocalPoint {
  const size = 64; // downsampled grid
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { x: 0.5, y: 0.5, confidence: "center" };

  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  let maxSaliency = 0;
  let bestX = 0.5;
  let bestY = 0.5;

  // Compute saliency per pixel = saturation + mild brightness penalty for extremes
  const scores = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const brightness = (r + g + b) / 3;
    // Faces tend to be mid-brightness, high saturation (skin tones)
    const brightnessPenalty = Math.abs(brightness - 0.55);
    scores[i] = saturation * 0.7 + (1 - brightnessPenalty) * 0.3;
  }

  // Find weighted centroid of top-scoring pixels (top 20%)
  const sorted = Array.from(scores).sort((a, b) => b - a);
  const threshold = sorted[Math.floor(size * size * 0.2)] ?? 0;

  let totalWeight = 0;
  let wX = 0;
  let wY = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = scores[y * size + x] ?? 0;
      if (s >= threshold) {
        wX += (x / size + 0.5 / size) * s;
        wY += (y / size + 0.5 / size) * s;
        totalWeight += s;
      }
    }
  }

  if (totalWeight > 0) {
    bestX = wX / totalWeight;
    bestY = wY / totalWeight;
    return { x: bestX, y: bestY, confidence: "saliency" };
  }

  // Portrait heuristic: for tall images, focus upper-center
  if (img.naturalHeight > img.naturalWidth * 1.2) {
    return { x: 0.5, y: 0.35, confidence: "center" };
  }
  return { x: 0.5, y: 0.5, confidence: "center" };
}

/**
 * Compute a ContentTransform that centers the focal point within the frame.
 * The renderer already computes the natural fill scale. The returned transform
 * therefore uses scale=1 and offsets only the delta from that centered fill.
 */
export function focalPointToContentTransform(
  focal: FocalPoint,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number
): { offsetX: number; offsetY: number; scale: number } {
  const fillScale = Math.max(frameW / imgW, frameH / imgH);
  const scaledW = imgW * fillScale;
  const scaledH = imgH * fillScale;

  return {
    offsetX: (0.5 - focal.x) * scaledW,
    offsetY: (0.5 - focal.y) * scaledH,
    scale: 1
  };
}

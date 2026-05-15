/**
 * Browser-side face/content detection for collage smart crop.
 *
 * Priority:
 * 1. FaceDetector Web API (Chrome 74+, Edge, experimental)
 * 2. Canvas pixel saliency heuristic (fast, works everywhere)
 * 3. Center fallback
 *
 * Returns a focal point [0..1, 0..1] within the image — used to compute contentTransform.
 */

export interface FocalPoint {
  x: number; // 0..1
  y: number; // 0..1
  confidence: "face" | "saliency" | "center";
}

/** Detect face/content focal point from an image element */
export async function detectFocalPoint(
  img: HTMLImageElement
): Promise<FocalPoint> {
  // 1. Try Face Detection API
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
          return { x: cx / totalArea, y: cy / totalArea, confidence: "face" };
        }
      }
    } catch { /* FaceDetector not available or failed */ }
  }

  // 2. Canvas saliency: find brightest/most-saturated region
  return computeSaliencyFocalPoint(img);
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
 * The image is scaled to fill the frame (fill mode), then offset so the focal point is centered.
 */
export function focalPointToContentTransform(
  focal: FocalPoint,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number
): { offsetX: number; offsetY: number; scale: number } {
  // Fill scale
  const scale = Math.max(frameW / imgW, frameH / imgH);
  const scaledW = imgW * scale;
  const scaledH = imgH * scale;

  // Position so focal point lands at frame center
  const offsetX = frameW / 2 - focal.x * scaledW;
  const offsetY = frameH / 2 - focal.y * scaledH;

  // Clamp so image covers the frame entirely
  const minOffX = frameW - scaledW;
  const minOffY = frameH - scaledH;
  const clampedX = Math.max(minOffX, Math.min(0, offsetX));
  const clampedY = Math.max(minOffY, Math.min(0, offsetY));

  return { offsetX: clampedX, offsetY: clampedY, scale };
}

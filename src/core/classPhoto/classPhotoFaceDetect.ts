import type { FaceAnchorData } from "@/types/layers";

// Reuses the same face detection approach as collage mode (collageFaceDetect.ts)
// MediaPipe FaceDetector Web API → canvas saliency → portrait heuristic fallback

async function detectFaceWithMediaPipe(img: HTMLImageElement): Promise<FaceAnchorData | null> {
  try {
    if (!("FaceDetector" in window)) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FaceDetectorCtor = (window as any).FaceDetector as new (opts: object) => { detect: (img: HTMLImageElement) => Promise<unknown[]> };
    const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 5 });
    const results = await detector.detect(img) as Array<{
      boundingBox: { x: number; y: number; width: number; height: number };
      landmarks?: Array<{ type: string; locations: Array<{ x: number; y: number }> }>;
      confidence?: number;
    }>;
    if (!results || results.length === 0) return null;

    // Pick the largest face
    const best = results.reduce((a, b) =>
      a.boundingBox.width * a.boundingBox.height >= b.boundingBox.width * b.boundingBox.height ? a : b
    );

    const scaleX = 1 / img.naturalWidth;
    const scaleY = 1 / img.naturalHeight;

    const faceBox = {
      x: best.boundingBox.x * scaleX,
      y: best.boundingBox.y * scaleY,
      width: best.boundingBox.width * scaleX,
      height: best.boundingBox.height * scaleY
    };

    const leftEye = best.landmarks?.find((l) => l.type === "eye")?.locations[0];
    const rightEye = best.landmarks?.find((l) => l.type === "eye")?.locations[1];

    return {
      version: 1,
      faceBox,
      leftEye: leftEye ? { x: leftEye.x * scaleX, y: leftEye.y * scaleY } : undefined,
      rightEye: rightEye ? { x: rightEye.x * scaleX, y: rightEye.y * scaleY } : undefined,
      confidence: best.confidence ?? 0.8
    };
  } catch {
    return null;
  }
}

function portraitHeuristicFaceBox(img: HTMLImageElement): FaceAnchorData {
  // Portrait heuristic: face is typically in upper 35% center of image
  const faceBox = {
    x: 0.2,
    y: 0.05,
    width: 0.6,
    height: 0.35
  };
  return { version: 1, faceBox, confidence: 0.3 };
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function detectFaceForAsset(imageUrl: string): Promise<FaceAnchorData | null> {
  try {
    const img = await loadImageElement(imageUrl);
    const result = await detectFaceWithMediaPipe(img);
    if (result) return result;
    // Fallback: portrait heuristic
    return portraitHeuristicFaceBox(img);
  } catch {
    return null;
  }
}

export interface FaceDetectProgress {
  done: number;
  total: number;
  currentName: string;
}

export async function detectFacesForRecords(
  records: Array<{ id: string; assetId: string; displayName: string }>,
  getAssetUrl: (assetId: string) => string | undefined,
  onProgress?: (progress: FaceDetectProgress) => void
): Promise<Map<string, FaceAnchorData>> {
  const results = new Map<string, FaceAnchorData>();
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec) continue;
    onProgress?.({ done: i, total: records.length, currentName: rec.displayName });
    const url = getAssetUrl(rec.assetId);
    if (!url) continue;
    try {
      const face = await detectFaceForAsset(url);
      if (face) results.set(rec.id, face);
    } catch {
      // skip
    }
  }
  onProgress?.({ done: records.length, total: records.length, currentName: "" });
  return results;
}

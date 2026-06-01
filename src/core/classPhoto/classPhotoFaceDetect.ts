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

async function detectFaceWithSidecar(imageUrl: string, img: HTMLImageElement): Promise<FaceAnchorData | null> {
  const spp = (typeof window !== "undefined"
    ? (window as unknown as { spp?: SppFaceBridge }).spp
    : undefined);
  if (!spp?.smartSelection?.detectFaces || !spp.smartSelection.loadImage) return null;

  try {
    const imagePath = await resolveImagePathForSidecar(imageUrl, spp);
    if (imagePath === null) return null;

    const imageId = `class-face-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const loaded = await spp.smartSelection.loadImage(imageId, imagePath, imageId);
    if (!loaded?.ok) return null;

    try {
      const result = await spp.smartSelection.detectFaces(imageId);
      if (!result?.ok || !Array.isArray(result.faces) || result.faces.length === 0) return null;
      const best = result.faces.reduce((a, b) =>
        a.width * a.height >= b.width * b.height ? a : b
      );
      const w = result.width || img.naturalWidth || 1;
      const h = result.height || img.naturalHeight || 1;
      return {
        version: 1,
        faceBox: {
          x: best.x / w,
          y: best.y / h,
          width: best.width / w,
          height: best.height / h
        },
        confidence: best.score ?? 0.8
      };
    } finally {
      spp.smartSelection.unloadImage?.(imageId).catch(() => undefined);
    }
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
    const sidecar = await detectFaceWithSidecar(imageUrl, img);
    if (sidecar) return sidecar;
    const result = await detectFaceWithMediaPipe(img);
    if (result) return result;
    // Fallback: portrait heuristic
    return portraitHeuristicFaceBox(img);
  } catch {
    return null;
  }
}

async function resolveImagePathForSidecar(src: string, spp: SppFaceBridge): Promise<string | null> {
  if (src.startsWith("file://")) return decodeURIComponent(src.replace(/^file:\/\//, ""));
  if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith("/")) return src;
  if (src.startsWith("data:")) {
    if (!spp.writeTempImage) return null;
    const match = /^data:image\/(png|jpeg|jpg|webp|bmp);/i.exec(src);
    const ext = match ? match[1].toLowerCase().replace("jpeg", "jpg") : "png";
    return spp.writeTempImage(src, ext);
  }
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
      backend: string;
      faces: { x: number; y: number; width: number; height: number; score: number }[];
    }>;
  };
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

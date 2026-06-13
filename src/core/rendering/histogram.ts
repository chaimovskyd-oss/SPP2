/**
 * Image histogram computation for the Curves editor.
 *
 * The histogram is purely informational (drawn behind the curve graph), so it is
 * computed from a heavily downscaled copy of the image — a few hundred pixels on
 * the long edge is plenty to show tonal distribution and keeps the modal snappy
 * even for very large photos.
 */

export interface ImageHistogram {
  /** 256-bin counts for the luminance (Rec. 709) channel. */
  luma: number[];
  /** 256-bin counts per colour channel. */
  r: number[];
  g: number[];
  b: number[];
  /** Per-channel peak count, used to normalise bar heights when drawing. */
  max: { luma: number; r: number; g: number; b: number };
}

/** A downscaled RGBA snapshot of an image, used for histogram + pixel sampling. */
export interface DownscaledImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Sample the RGB at fractional coordinates (0..1) of a downscaled image. */
export function sampleDownscaled(
  img: DownscaledImage,
  fracX: number,
  fracY: number
): { r: number; g: number; b: number } {
  const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  const x = Math.min(img.width - 1, Math.floor(clamp01(fracX) * img.width));
  const y = Math.min(img.height - 1, Math.floor(clamp01(fracY) * img.height));
  const i = (y * img.width + x) * 4;
  return { r: img.data[i]!, g: img.data[i + 1]!, b: img.data[i + 2]! };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Cannot load image: ${src}`));
    img.src = src;
  });
}

function emptyHistogram(): ImageHistogram {
  return {
    luma: new Array<number>(256).fill(0),
    r: new Array<number>(256).fill(0),
    g: new Array<number>(256).fill(0),
    b: new Array<number>(256).fill(0),
    max: { luma: 1, r: 1, g: 1, b: 1 }
  };
}

/**
 * Load `src` into a downscaled RGBA buffer (long edge ≤ `maxDim`). Returns null
 * if the image can't be loaded or the canvas is tainted (cross-origin).
 */
export async function loadDownscaledImageData(
  src: string | undefined,
  maxDim = 320
): Promise<DownscaledImage | null> {
  if (src === undefined || src === "") return null;

  let img: HTMLImageElement;
  try {
    img = await loadImage(src);
  } catch {
    return null;
  }

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (iw === 0 || ih === 0) return null;

  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return null;
  ctx.drawImage(img, 0, 0, w, h);

  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    return { data, width: w, height: h };
  } catch {
    // Tainted canvas — can't read pixels.
    return null;
  }
}

/** Build a histogram from an already-downscaled RGBA buffer. */
export function histogramFromImageData(img: DownscaledImage): ImageHistogram {
  const { data } = img;
  const hist = emptyHistogram();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a === 0) continue; // ignore fully transparent pixels
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    hist.r[r] += 1;
    hist.g[g] += 1;
    hist.b[b] += 1;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
    hist.luma[lum] += 1;
  }

  // Ignore pure-black/white spikes (index 0 and 255) when finding the peak so a
  // big flat background doesn't crush the rest of the curve into the baseline.
  const peak = (arr: number[]): number => {
    let m = 1;
    for (let v = 1; v < 255; v += 1) if (arr[v]! > m) m = arr[v]!;
    return m;
  };
  hist.max = {
    luma: peak(hist.luma),
    r: peak(hist.r),
    g: peak(hist.g),
    b: peak(hist.b)
  };

  return hist;
}

/**
 * Convenience: load `src` downscaled and compute its histogram in one call.
 * Returns null if the image can't be loaded / sampled.
 */
export async function computeImageHistogram(
  src: string | undefined,
  maxDim = 320
): Promise<ImageHistogram | null> {
  const img = await loadDownscaledImageData(src, maxDim);
  return img === null ? null : histogramFromImageData(img);
}

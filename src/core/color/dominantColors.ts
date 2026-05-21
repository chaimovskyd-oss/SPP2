import { rgbaToHex } from "@/state/colorStore";

const SAMPLE_SIZE = 128;
const ALPHA_CUTOFF = 200;
const MERGE_DISTANCE = 12; // RGB euclidean

function bucketKey(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

function bucketCenter(key: number): { r: number; g: number; b: number } {
  const r = ((key >> 8) & 0xf) << 4;
  const g = ((key >> 4) & 0xf) << 4;
  const b = (key & 0xf) << 4;
  return { r: r + 8, g: g + 8, b: b + 8 };
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function extractDominantColors(source: HTMLCanvasElement, count = 6): string[] {
  if (source.width === 0 || source.height === 0) return [];

  const tmp = window.document.createElement("canvas");
  tmp.width = SAMPLE_SIZE;
  tmp.height = SAMPLE_SIZE;
  const ctx = tmp.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return [];
  ctx.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  } catch {
    return [];
  }
  const px = imageData.data;

  const counts = new Map<number, number>();
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] ?? 0;
    if (a < ALPHA_CUTOFF) continue;
    const r = px[i] ?? 0;
    const g = px[i + 1] ?? 0;
    const b = px[i + 2] ?? 0;
    const key = bucketKey(r, g, b);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.max(20, count * 4));

  const accepted: Array<{ key: number; center: { r: number; g: number; b: number } }> = [];
  for (const [key] of sorted) {
    const center = bucketCenter(key);
    let tooClose = false;
    for (const a of accepted) {
      if (colorDistance(center, a.center) < MERGE_DISTANCE) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      accepted.push({ key, center });
      if (accepted.length >= count) break;
    }
  }

  if (accepted.length === 0) return [];

  // Second pass: compute average RGB per accepted bucket for higher fidelity
  const sums = accepted.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
  const keyToIdx = new Map<number, number>();
  accepted.forEach((a, i) => keyToIdx.set(a.key, i));

  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] ?? 0;
    if (a < ALPHA_CUTOFF) continue;
    const r = px[i] ?? 0;
    const g = px[i + 1] ?? 0;
    const b = px[i + 2] ?? 0;
    const idx = keyToIdx.get(bucketKey(r, g, b));
    if (idx === undefined) continue;
    const s = sums[idx]!;
    s.r += r;
    s.g += g;
    s.b += b;
    s.n += 1;
  }

  return sums.map((s) => {
    if (s.n === 0) return "#000000";
    return rgbaToHex(s.r / s.n, s.g / s.n, s.b / s.n);
  });
}

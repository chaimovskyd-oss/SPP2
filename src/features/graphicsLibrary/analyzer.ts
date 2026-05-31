import type { GraphicColorName, GraphicOrientation, ImageAnalysis } from "./types";

// ─── Color naming ─────────────────────────────────────────────────────────────

export function mapColorToName(rgbStr: string): GraphicColorName {
  const m = rgbStr.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return "gray";
  const r = +m[1], g = +m[2], b = +m[3];

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  if (chroma < 28) {
    if (luma > 205) return "white";
    if (luma < 55)  return "black";
    return "gray";
  }

  let hue: number;
  if (max === r)      hue = ((g - b) / chroma + 6) % 6 * 60;
  else if (max === g) hue = ((b - r) / chroma + 2) * 60;
  else                hue = ((r - g) / chroma + 4) * 60;

  const saturation = chroma / max;

  // Brown: warm, low-saturation, low-to-mid luma
  if (hue < 45 && saturation < 0.55 && luma < 120) return "brown";
  // Gold: warm yellow with moderate saturation and mid luma
  if (hue >= 35 && hue < 65 && saturation > 0.45 && luma > 110 && luma < 210) return "gold";

  if (hue < 15 || hue >= 345) return "red";
  if (hue < 40)               return "orange";
  if (hue < 75)               return "yellow";
  if (hue < 165)              return "green";
  if (hue < 260)              return "blue";
  if (hue < 290)              return "purple";
  if (hue < 345)              return "pink";
  return "red";
}

// ─── Image analysis (runs in renderer via Canvas API) ─────────────────────────

const SAMPLE_PX = 64; // sample grid size for color/transparency detection

export function analyzeImageDataUrl(
  dataUrl: string,
  isSvg: boolean
): Promise<ImageAnalysis> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const natW = isSvg ? (img.naturalWidth  || 512) : img.naturalWidth;
      const natH = isSvg ? (img.naturalHeight || 512) : img.naturalHeight;

      const sw = Math.min(natW, SAMPLE_PX);
      const sh = Math.min(natH, SAMPLE_PX);
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(fallback(natW, natH, isSvg));
        return;
      }
      ctx.drawImage(img, 0, 0, sw, sh);

      const { data } = ctx.getImageData(0, 0, sw, sh);
      let hasTransparency = isSvg;
      const buckets = new Map<string, number>();

      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 10) { hasTransparency = true; continue; }
        if (a < 200) hasTransparency = true;
        // Quantize to 32-step buckets for colour extraction
        const r = Math.round(data[i]     / 32) * 32;
        const g = Math.round(data[i + 1] / 32) * 32;
        const b = Math.round(data[i + 2] / 32) * 32;
        const key = `${r},${g},${b}`;
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }

      const top5 = [...buckets.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key]) => {
          const [r, g, bv] = key.split(",").map(Number);
          return `rgb(${r},${g},${bv})`;
        });

      const colorNames = [...new Set(top5.map(mapColorToName))].slice(0, 3) as GraphicColorName[];

      const orientation: GraphicOrientation =
        natW > natH * 1.1 ? "landscape" : natH > natW * 1.1 ? "portrait" : "square";

      resolve({ width: natW, height: natH, orientation, hasTransparency, dominantColors: top5, colorNames });
    };
    img.onerror = () => resolve(fallback(0, 0, isSvg));
    img.src = dataUrl;
  });
}

function fallback(w: number, h: number, isSvg: boolean): ImageAnalysis {
  return {
    width: w, height: h,
    orientation: "square",
    hasTransparency: isSvg,
    dominantColors: [],
    colorNames: [],
  };
}

// ─── Thumbnail generation (renderer Canvas API) ───────────────────────────────

const THUMB_MAX = 220;

export function generateThumbnailDataUrl(
  dataUrl: string,
  isSvg: boolean,
  maxSize = THUMB_MAX
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const natW = isSvg ? (img.naturalWidth  || 512) : img.naturalWidth;
      const natH = isSvg ? (img.naturalHeight || 512) : img.naturalHeight;
      const scale = Math.min(maxSize / natW, maxSize / natH, 1);
      const w = Math.max(1, Math.round(natW * scale));
      const h = Math.max(1, Math.round(natH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      if (!isSvg) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}

// ─── Tag extraction from filename + folders ───────────────────────────────────

export function extractTags(
  fileName: string,
  folders: string[],
  existingTags?: string[]
): string[] {
  const tags = new Set<string>();
  const base = fileName.replace(/\.[^.]+$/, "");
  base.split(/[-_\s.]+/).forEach((t) => {
    const c = t.toLowerCase().trim();
    if (c.length > 2 && !/^\d+$/.test(c)) tags.add(c);
  });
  folders.forEach((f) => {
    const c = f.toLowerCase().trim();
    if (c.length > 2) tags.add(c);
  });
  existingTags?.forEach((t) => tags.add(t.toLowerCase().trim()));
  return [...tags];
}

// ─── Stable ID from relative path ─────────────────────────────────────────────

export function stableAssetId(relativePath: string): string {
  let h = 2166136261;
  for (let i = 0; i < relativePath.length; i++) {
    h ^= relativePath.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `ga_${h.toString(36)}`;
}

export function getFileType(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "png";
}

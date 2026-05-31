import type { AdjustmentLayer, AdjustmentOperation } from "@/types/layers";

export function hasActiveAdjustment(layer: AdjustmentLayer): boolean {
  if (layer.visible === false || layer.opacity <= 0) return false;
  return layer.adjustments.some((op) => isActiveAdjustmentOperation(op));
}

export function isActiveAdjustmentOperation(op: AdjustmentOperation): boolean {
  if (op.type === "brightnessContrast") return Math.abs(op.brightness) > 0.001 || Math.abs(op.contrast) > 0.001;
  if (op.type === "exposure") return Math.abs(op.exposure) > 0.001 || Math.abs(op.offset) > 0.001 || Math.abs(op.gamma - 1) > 0.001;
  if (op.type === "hueSaturation") return Math.abs(op.hue) > 0.001 || Math.abs(op.saturation) > 0.001 || Math.abs(op.lightness) > 0.001;
  if (op.type === "blackWhite") return op.enabled;
  if (op.type === "invert") return op.enabled;
  if (op.type === "levels") return op.black > 0 || Math.abs(op.mid - 1) > 0.001 || op.white < 255;
  if (op.type === "sepia") return op.intensity > 0.001;
  return false;
}

export function applyAdjustmentImageData(imageData: ImageData, adjustments: AdjustmentOperation[], strength: number): void {
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    let r = data[index] ?? 0;
    let g = data[index + 1] ?? 0;
    let b = data[index + 2] ?? 0;

    for (const op of adjustments) {
      if (!isActiveAdjustmentOperation(op)) continue;
      if (op.type === "brightnessContrast") {
        const brightness = op.brightness * strength * 2.55;
        const contrastValue = Math.max(-254, Math.min(254, op.contrast * strength * 2.55));
        const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
        r = contrastFactor * (r - 128) + 128 + brightness;
        g = contrastFactor * (g - 128) + 128 + brightness;
        b = contrastFactor * (b - 128) + 128 + brightness;
      } else if (op.type === "exposure") {
        const factor = 2 ** (op.exposure * strength);
        const gamma = Math.max(0.1, op.gamma);
        const offset = op.offset * strength;
        r = ((clampUnit((r / 255) * factor + offset)) ** (1 / gamma)) * 255;
        g = ((clampUnit((g / 255) * factor + offset)) ** (1 / gamma)) * 255;
        b = ((clampUnit((b / 255) * factor + offset)) ** (1 / gamma)) * 255;
      } else if (op.type === "hueSaturation") {
        const [h, s, l] = rgbToHsl(r, g, b);
        [r, g, b] = hslToRgb(
          h + op.hue * strength,
          clampUnit(s * (1 + (op.saturation / 100) * strength)),
          clampUnit(l + (op.lightness / 100) * strength)
        );
      } else if (op.type === "blackWhite" && op.enabled) {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = r + (gray - r) * strength;
        g = g + (gray - g) * strength;
        b = b + (gray - b) * strength;
      } else if (op.type === "invert" && op.enabled) {
        r = r + (255 - r - r) * strength;
        g = g + (255 - g - g) * strength;
        b = b + (255 - b - b) * strength;
      } else if (op.type === "levels") {
        const black = Math.max(0, Math.min(254, op.black));
        const white = Math.max(black + 1, Math.min(255, op.white));
        const mid = Math.max(0.1, Math.min(9.99, op.mid));
        const applyLevel = (value: number): number => {
          const normalized = clampUnit((value - black) / (white - black));
          return (normalized ** (1 / mid)) * 255;
        };
        r = r + (applyLevel(r) - r) * strength;
        g = g + (applyLevel(g) - g) * strength;
        b = b + (applyLevel(b) - b) * strength;
      } else if (op.type === "sepia") {
        // warmth=0 → monochrome grayscale; warmth=100 → classic vintage sepia
        const warmBlend = clampUnit(op.warmth / 100);
        const intensityBlend = clampUnit(op.intensity / 100) * strength;
        // ITU-R BT.709 luminance (grayscale base)
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // Classic warm sepia matrix target per channel
        const sr = clampByte(r * 0.393 + g * 0.769 + b * 0.189);
        const sg = clampByte(r * 0.349 + g * 0.686 + b * 0.168);
        const sb = clampByte(r * 0.272 + g * 0.534 + b * 0.131);
        // Blend grayscale → warm sepia according to warmth
        const tr = gray + (sr - gray) * warmBlend;
        const tg = gray + (sg - gray) * warmBlend;
        const tb = gray + (sb - gray) * warmBlend;
        // Apply effect intensity (blend from original to the toned target)
        r = r + (tr - r) * intensityBlend;
        g = g + (tg - g) * intensityBlend;
        b = b + (tb - b) * intensityBlend;
      }
    }

    data[index] = clampByte(r);
    data[index + 1] = clampByte(g);
    data[index + 2] = clampByte(b);
  }
}

export function createAdjustmentPixelFilter(adjustments: AdjustmentOperation[], strength: number): (imageData: ImageData) => void {
  return (imageData: ImageData): void => applyAdjustmentImageData(imageData, adjustments, strength);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hueToRgb(p: number, q: number, tInput: number): number {
  let t = tInput;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s <= 0) {
    const gray = l * 255;
    return [gray, gray, gray];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgb(p, q, hn + 1 / 3) * 255,
    hueToRgb(p, q, hn) * 255,
    hueToRgb(p, q, hn - 1 / 3) * 255
  ];
}

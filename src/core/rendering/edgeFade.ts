import type { EdgeFadeSettings, EdgeFadeShape } from "@/types/layers";
import { DEFAULT_EDGE_FADE_SETTINGS } from "@/types/layers";

export function normalizeEdgeFade(settings: EdgeFadeSettings | undefined): EdgeFadeSettings {
  return {
    ...DEFAULT_EDGE_FADE_SETTINGS,
    ...(settings ?? {}),
    depth: clamp01(settings?.depth ?? DEFAULT_EDGE_FADE_SETTINGS.depth),
    softness: clamp01(settings?.softness ?? DEFAULT_EDGE_FADE_SETTINGS.softness),
    strength: clamp01(settings?.strength ?? DEFAULT_EDGE_FADE_SETTINGS.strength),
    shape: normalizeShape(settings?.shape)
  };
}

export function hasActiveEdgeFade(settings: EdgeFadeSettings | undefined): boolean {
  const fade = normalizeEdgeFade(settings);
  return fade.enabled && fade.depth > 0.001 && fade.strength > 0.001;
}

export function createEdgeFadeMaskCanvas(width: number, height: number, settings: EdgeFadeSettings | undefined): HTMLCanvasElement | null {
  const fade = normalizeEdgeFade(settings);
  if (!hasActiveEdgeFade(fade)) return null;

  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  if (context === null) return null;

  const imageData = context.createImageData(w, h);
  const data = imageData.data;
  const depthPx = Math.max(1, Math.min(w, h) * fade.depth);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const alpha = edgeFadeAlphaAt(x + 0.5, y + 0.5, w, h, depthPx, fade);
      const index = (y * w + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 255);
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

export function applyEdgeFadeToImageData(imageData: ImageData, settings: EdgeFadeSettings | undefined): void {
  const fade = normalizeEdgeFade(settings);
  if (!hasActiveEdgeFade(fade)) return;

  const { width, height, data } = imageData;
  const depthPx = Math.max(1, Math.min(width, height) * fade.depth);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const factor = edgeFadeAlphaAt(x + 0.5, y + 0.5, width, height, depthPx, fade);
      const alphaIndex = (y * width + x) * 4 + 3;
      data[alphaIndex] = Math.round(data[alphaIndex] * factor);
    }
  }
}

function edgeFadeAlphaAt(x: number, y: number, width: number, height: number, depthPx: number, settings: EdgeFadeSettings): number {
  const inwardDistance = inwardDistanceForShape(x, y, width, height, settings.shape);
  if (inwardDistance < 0) return 0;
  const t = clamp01(inwardDistance / depthPx);
  const eased = easeFade(t, settings.softness);
  return 1 - settings.strength * (1 - eased);
}

function inwardDistanceForShape(x: number, y: number, width: number, height: number, shape: EdgeFadeShape): number {
  if (shape === "ellipse") {
    const rx = Math.max(0.5, width / 2);
    const ry = Math.max(0.5, height / 2);
    const nx = (x - width / 2) / rx;
    const ny = (y - height / 2) / ry;
    const distanceFromCenter = Math.sqrt(nx * nx + ny * ny);
    return (1 - distanceFromCenter) * Math.min(rx, ry);
  }

  if (shape === "roundedRect") {
    const radius = Math.min(width, height) * 0.16;
    return -roundedRectSignedDistance(x - width / 2, y - height / 2, width / 2 - radius, height / 2 - radius, radius);
  }

  return Math.min(x, y, width - x, height - y);
}

function roundedRectSignedDistance(x: number, y: number, halfWidthMinusRadius: number, halfHeightMinusRadius: number, radius: number): number {
  const qx = Math.abs(x) - Math.max(0, halfWidthMinusRadius);
  const qy = Math.abs(y) - Math.max(0, halfHeightMinusRadius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

function easeFade(t: number, softness: number): number {
  const fast = Math.pow(t, 0.35);
  const smooth = t * t * (3 - 2 * t);
  return fast * (1 - softness) + smooth * softness;
}

function normalizeShape(shape: EdgeFadeShape | undefined): EdgeFadeShape {
  return shape === "roundedRect" || shape === "ellipse" || shape === "rect" ? shape : DEFAULT_EDGE_FADE_SETTINGS.shape;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Page Look effects — atmospheric overlays drawn ABOVE all page layers.
 *
 * Each effect renders into a 2D canvas context. The export path draws directly
 * onto the final canvas; the live path renders the same effect into an
 * offscreen canvas that is shown as a single top-most Konva.Image overlay (see
 * Phase 4 wiring in CanvasStage). Sharing one implementation keeps live preview
 * and export identical. There is deliberately NO full-page cache of the layers
 * beneath — the overlay is independent.
 */

import type { GradientStop, PageLookBlendMode, PageLookEffect } from "@/types/imageAdjustments";

export function mapPageLookBlend(mode: PageLookBlendMode): GlobalCompositeOperation {
  switch (mode) {
    case "multiply": return "multiply";
    case "screen": return "screen";
    case "overlay": return "overlay";
    case "soft-light": return "soft-light";
    case "hard-light": return "hard-light";
    case "lighten": return "lighten";
    case "darken": return "darken";
    case "normal":
    default: return "source-over";
  }
}

/**
 * Draw one page-look effect onto a context covering [0,0,width,height].
 * `master` (0..1) scales the overall effect opacity (layer opacity × strength).
 */
export function renderPageLookEffect(
  ctx: CanvasRenderingContext2D,
  effect: PageLookEffect,
  width: number,
  height: number,
  master = 1
): void {
  const m = clamp01(master);
  if (m <= 0) return;
  ctx.save();
  switch (effect.kind) {
    case "colorOverlay":
    case "wash": {
      ctx.globalAlpha = clamp01(effect.opacity) * m;
      ctx.globalCompositeOperation = mapPageLookBlend(effect.blendMode);
      ctx.fillStyle = effect.color;
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case "gradientOverlay": {
      ctx.globalAlpha = clamp01(effect.opacity) * m;
      ctx.globalCompositeOperation = mapPageLookBlend(effect.blendMode);
      ctx.fillStyle = buildGradient(ctx, effect.stops, effect.angle, effect.gradientType, width, height);
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case "vignette": {
      ctx.globalAlpha = m;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = buildVignetteGradient(ctx, effect.color, effect.amount, effect.softness, effect.roundness, width, height);
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case "grain": {
      const pattern = createGrainPatternCanvas(Math.max(1, Math.round(effect.size * 100)), effect.monochrome);
      ctx.globalAlpha = clamp01(effect.amount) * m;
      ctx.globalCompositeOperation = "overlay";
      const ptn = ctx.createPattern(pattern, "repeat");
      if (ptn !== null) {
        ctx.fillStyle = ptn;
        ctx.fillRect(0, 0, width, height);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** Render an effect into a fresh offscreen canvas (used by live Konva overlay). */
export function renderPageLookToCanvas(effect: PageLookEffect, width: number, height: number, master = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (ctx !== null) renderPageLookEffect(ctx, effect, canvas.width, canvas.height, master);
  return canvas;
}

// ─── gradients ────────────────────────────────────────────────────────────────

function buildGradient(
  ctx: CanvasRenderingContext2D,
  stops: GradientStop[],
  angleDeg: number,
  type: "linear" | "radial",
  width: number,
  height: number
): CanvasGradient {
  let grad: CanvasGradient;
  if (type === "radial") {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.hypot(width, height) / 2;
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  } else {
    const angle = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const halfLen = (Math.abs(dx) * width + Math.abs(dy) * height) / 2;
    const cx = width / 2;
    const cy = height / 2;
    grad = ctx.createLinearGradient(cx - dx * halfLen, cy - dy * halfLen, cx + dx * halfLen, cy + dy * halfLen);
  }
  for (const stop of [...stops].sort((a, b) => a.position - b.position)) {
    grad.addColorStop(clamp01(stop.position), stop.color);
  }
  return grad;
}

function buildVignetteGradient(
  ctx: CanvasRenderingContext2D,
  color: string,
  amount: number,
  softness: number,
  roundness: number,
  width: number,
  height: number
): CanvasGradient {
  const cx = width / 2;
  const cy = height / 2;
  // roundness blends between an ellipse following the page (0) and a circle (1).
  const base = Math.max(width, height) / 2;
  const ellipse = Math.hypot(width, height) / 2;
  const outer = base + (ellipse - base) * clamp01(roundness);
  const inner = outer * (1 - clamp01(softness));
  const grad = ctx.createRadialGradient(cx, cy, Math.max(0, inner), cx, cy, Math.max(1, outer));
  grad.addColorStop(0, withAlpha(color, 0));
  grad.addColorStop(1, withAlpha(color, clamp01(amount)));
  return grad;
}

// ─── grain ────────────────────────────────────────────────────────────────────

const grainCache = new Map<string, HTMLCanvasElement>();

/** Deterministic noise tile, cached by (tileSize, monochrome). */
export function createGrainPatternCanvas(tileSize: number, monochrome: boolean): HTMLCanvasElement {
  const size = clampInt(tileSize, 16, 256);
  const key = `${size}:${monochrome ? 1 : 0}`;
  const cached = grainCache.get(key);
  if (cached !== undefined) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    let seed = 0x9e3779b9 ^ size ^ (monochrome ? 0x55 : 0xaa);
    const rand = (): number => {
      // xorshift32 — deterministic so live and export grain match.
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return ((seed >>> 0) % 256);
    };
    for (let i = 0; i < data.length; i += 4) {
      if (monochrome) {
        const v = rand();
        data[i] = v; data[i + 1] = v; data[i + 2] = v;
      } else {
        data[i] = rand(); data[i + 1] = rand(); data[i + 2] = rand();
      }
      data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  grainCache.set(key, canvas);
  return canvas;
}

export function clearGrainCacheForTests(): void {
  grainCache.clear();
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function parseColor(color: string): [number, number, number] {
  let h = color.trim();
  if (h.startsWith("#")) {
    h = h.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length === 6 && !/[^0-9a-fA-F]/.test(h)) {
      const n = parseInt(h, 16);
      return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    }
  }
  return [0, 0, 0];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : Math.round(v);
}

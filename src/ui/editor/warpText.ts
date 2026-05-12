/**
 * Canvas-based text renderer.
 *
 * Entry point: renderTextToCanvas(layer)
 *   – returns HTMLCanvasElement when warp, inner-shadow, or bevel is active
 *   – returns null  when only native Konva rendering is needed (fast path)
 *
 * All warp types work correctly with RTL (Hebrew) text.
 */

import type { TextLayer } from "@/types/layers";

const PAD = 28;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a canvas when any complex effect requires off-screen rendering,
 * null when native Konva Text is sufficient.
 */
export function renderTextToCanvas(layer: TextLayer): HTMLCanvasElement | null {
  const hasWarp = layer.warpSettings.enabled && layer.warpSettings.type !== "none";
  const innerShadowEffect = layer.effects.find((e) => e.enabled && e.effectType === "inner_shadow");
  const bevelEffect = layer.effects.find((e) => e.enabled && e.effectType === "bevel_emboss");

  if (!hasWarp && innerShadowEffect === undefined && bevelEffect === undefined) return null;

  // Step 1: base text (with or without warp)
  let canvas: HTMLCanvasElement | null;
  if (hasWarp) {
    canvas = renderWarpedText(layer);
  } else {
    canvas = renderStraightText(layer);
  }
  if (canvas === null) return null;

  // Step 2: inner shadow
  if (innerShadowEffect !== undefined) {
    const p = innerShadowEffect.params as Record<string, unknown>;
    canvas = applyInnerShadow(canvas, {
      color: typeof p["color"] === "string" ? p["color"] : "#000000",
      blur: typeof p["blur"] === "number" ? p["blur"] : 6,
      angle: typeof p["angle"] === "number" ? p["angle"] : 135,
      distance: typeof p["distance"] === "number" ? p["distance"] : 4,
      opacity: innerShadowEffect.opacity
    });
  }

  // Step 3: bevel & emboss
  if (bevelEffect !== undefined) {
    const p = bevelEffect.params as Record<string, unknown>;
    canvas = applyBevelPreview(canvas, {
      highlightColor: typeof p["highlightColor"] === "string" ? p["highlightColor"] : "#ffffff",
      shadowColor: typeof p["shadowColor"] === "string" ? p["shadowColor"] : "#000000",
      depth: typeof p["depth"] === "number" ? p["depth"] : 5,
      size: typeof p["size"] === "number" ? p["size"] : 5
    });
  }

  return canvas;
}

// Keep the old export so existing callers don't break
export { renderWarpedText };

// ─── RTL detection ────────────────────────────────────────────────────────────

/** Returns true when text should be rendered right-to-left. */
function isRTLText(layer: TextLayer, text: string): boolean {
  if (layer.direction === "ltr") return false;
  if (layer.direction === "rtl") return true;
  // "auto": detect from the first Hebrew / Arabic character in the string
  return /[֐-׿؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFontString(layer: TextLayer): string {
  const parts: string[] = [];
  if (layer.fontStyle === "italic") parts.push("italic");
  parts.push(String(layer.fontWeight));
  parts.push(`${layer.fontSize}px`);
  parts.push(`"${layer.fontFamily}", sans-serif`);
  return parts.join(" ");
}

function hexToRgba(hex: string, opacity: number): string {
  if (!hex.startsWith("#")) return hex;
  const h =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  if (h.length !== 7) return hex;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, opacity))})`;
}

function setupCtx(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  fontStr: string
): void {
  ctx.font = fontStr;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = hexToRgba(layer.color, layer.fillOpacity);
  // Reset shadow (canvas shadow persists after resize)
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  if (layer.shadow !== undefined) {
    ctx.shadowColor = hexToRgba(layer.shadow.color, layer.shadow.opacity);
    ctx.shadowBlur = layer.shadow.blur;
    ctx.shadowOffsetX = layer.shadow.offsetX;
    ctx.shadowOffsetY = layer.shadow.offsetY;
  }
}

function resizeCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layer: TextLayer,
  fontStr: string
): void {
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  setupCtx(ctx, layer, fontStr);
}

/** Draw char centered at (0,0) — used for rotated warp chars. */
function drawChar(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  char: string,
  halfW: number
): void {
  if (layer.stroke !== undefined && layer.stroke.width > 0 && layer.stroke.opacity > 0) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(layer.stroke.color, layer.stroke.opacity);
    ctx.lineWidth = layer.stroke.width * 2;
    ctx.lineJoin = "round";
    ctx.shadowColor = "transparent";
    ctx.strokeText(char, -halfW, 0);
    ctx.restore();
  }
  ctx.fillText(char, -halfW, 0);
}

/** Draw char left-aligned at (0,0) — used for straight/wave chars. */
function drawCharLeft(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  char: string
): void {
  if (layer.stroke !== undefined && layer.stroke.width > 0 && layer.stroke.opacity > 0) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(layer.stroke.color, layer.stroke.opacity);
    ctx.lineWidth = layer.stroke.width * 2;
    ctx.lineJoin = "round";
    ctx.shadowColor = "transparent";
    ctx.strokeText(char, 0, 0);
    ctx.restore();
  }
  ctx.fillText(char, 0, 0);
}

// ─── Straight text (no warp, but needs canvas for post-effects) ───────────────

function renderStraightText(layer: TextLayer): HTMLCanvasElement | null {
  if (!layer.text.trim()) return null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;

  const text = layer.text.split("\n")[0] ?? "";
  const fontStr = buildFontString(layer);
  ctx.font = fontStr;
  ctx.textBaseline = "alphabetic";

  const chars = [...text];
  const charWidths = chars.map((c) => ctx.measureText(c).width);

  if (isRTLText(layer, text)) {
    chars.reverse();
    charWidths.reverse();
  }

  const totalWidth =
    charWidths.reduce((s, w) => s + w, 0) +
    Math.max(0, chars.length - 1) * layer.letterSpacing;
  const fontSize = layer.fontSize;

  const strokePad = (layer.stroke?.width ?? 0) + (layer.shadow?.blur ?? 0) * 0.5;
  const ep = PAD + strokePad;

  resizeCanvas(canvas, ctx, totalWidth + ep * 2, fontSize + ep * 2, layer, fontStr);

  const ascent = fontSize * 0.82;
  let x = ep;
  for (let i = 0; i < chars.length; i++) {
    ctx.save();
    ctx.translate(x, ep + ascent);
    drawCharLeft(ctx, layer, chars[i]);
    ctx.restore();
    x += charWidths[i] + layer.letterSpacing;
  }
  return canvas;
}

// ─── Warp entry point ─────────────────────────────────────────────────────────

function renderWarpedText(layer: TextLayer): HTMLCanvasElement | null {
  const { warpSettings } = layer;
  if (!warpSettings.enabled || warpSettings.type === "none") return null;
  if (!layer.text.trim()) return null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;

  const text = layer.text.split("\n")[0] ?? "";
  if (text.length === 0) return null;

  const amount = warpSettings.amount;
  const hDist = warpSettings.horizontalDistortion;
  const fontStr = buildFontString(layer);

  ctx.font = fontStr;
  ctx.textBaseline = "alphabetic";

  // Unicode-safe character split
  const chars = [...text];
  const charWidths = chars.map((c) => ctx.measureText(c).width);

  // ── RTL FIX: reverse character order for right-to-left text ──
  // For Hebrew/Arabic the string stores chars in logical order (first char
  // is visually rightmost). Reversing gives correct left→right rendering
  // order that our warp geometry expects.
  if (isRTLText(layer, text)) {
    chars.reverse();
    charWidths.reverse();
  }

  const totalWidth =
    charWidths.reduce((s, w) => s + w, 0) +
    Math.max(0, chars.length - 1) * layer.letterSpacing;
  const fontSize = layer.fontSize;

  switch (warpSettings.type) {
    case "arc":
    case "arc_upper":
    case "arc_lower":
    case "arch":
      return drawArcWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, fontStr);
    case "wave":
      return drawWaveWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, hDist, fontStr);
    case "bulge":
      return drawBulgeWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, fontStr);
    case "inflate":
      return drawInflateWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, fontStr);
    case "squeeze":
      return drawSqueezeWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, fontStr);
    case "rise":
      return drawRiseWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, fontStr);
    case "flag":
      return drawFlagWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, hDist, fontStr);
    case "fisheye":
      return drawFisheyeWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, fontStr);
    case "shell_lower":
    case "shell_upper":
      return drawShellWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, warpSettings.type === "shell_upper", fontStr);
    case "fish":
      return drawFishWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, fontStr);
    case "twist":
      return drawTwistWarp(canvas, ctx, layer, chars, charWidths, totalWidth, fontSize, amount, fontStr);
    default:
      return null;
  }
}

// ─── Post-processing: Inner Shadow ────────────────────────────────────────────
//
// Algorithm:
//   1. Create inverted mask: opaque shadow-color everywhere EXCEPT where text is.
//   2. Draw inverted mask onto temp canvas WITH a drop shadow; the shadow bleeds
//      into the transparent "text hole".
//   3. Composite temp canvas onto original using source-atop so only pixels
//      inside the original text shape receive the inner shadow.
//
// The angle/distance determine where inside the text the shadow falls:
//   angle = 135° → shadow at bottom-right of each letter's interior.

function applyInnerShadow(
  canvas: HTMLCanvasElement,
  params: {
    color: string;
    blur: number;
    angle: number;
    distance: number;
    opacity: number;
  }
): HTMLCanvasElement {
  const { color, blur, angle, distance, opacity } = params;
  const w = canvas.width;
  const h = canvas.height;

  // Extra space so the shadow from outside the canvas can still bleed in
  const extra = Math.ceil(blur + distance + 4);
  const tw = w + extra * 2;
  const th = h + extra * 2;

  const angleRad = (angle * Math.PI) / 180;
  // For the inverted mask, the shadow cast goes INWARD.
  // Negate offsets so the shadow falls in the expected interior direction.
  const offsetX = -Math.cos(angleRad) * distance;
  const offsetY = -Math.sin(angleRad) * distance;

  // ── Step 1: inverted mask ────────────────────────────────────────────────
  const invertCanvas = document.createElement("canvas");
  invertCanvas.width = tw;
  invertCanvas.height = th;
  const iCtx = invertCanvas.getContext("2d");
  if (iCtx === null) return canvas;

  iCtx.fillStyle = color;
  iCtx.fillRect(0, 0, tw, th);
  iCtx.globalCompositeOperation = "destination-out";
  iCtx.drawImage(canvas, extra, extra); // punched-out text shape
  iCtx.globalCompositeOperation = "source-over";

  // ── Step 2: shadow of inverted mask (bleeds into text hole) ─────────────
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = tw;
  tempCanvas.height = th;
  const tCtx = tempCanvas.getContext("2d");
  if (tCtx === null) return canvas;

  tCtx.shadowColor = color;
  tCtx.shadowBlur = blur;
  tCtx.shadowOffsetX = offsetX;
  tCtx.shadowOffsetY = offsetY;
  tCtx.drawImage(invertCanvas, 0, 0);

  // ── Step 3: composite inner shadow onto original ─────────────────────────
  const result = document.createElement("canvas");
  result.width = w;
  result.height = h;
  const rCtx = result.getContext("2d");
  if (rCtx === null) return canvas;

  rCtx.drawImage(canvas, 0, 0); // original text
  rCtx.save();
  rCtx.globalCompositeOperation = "source-atop"; // only inside text pixels
  rCtx.globalAlpha = Math.max(0, Math.min(1, opacity));
  rCtx.drawImage(tempCanvas, -extra, -extra); // offset to align with canvas
  rCtx.restore();

  return result;
}

// ─── Post-processing: Bevel & Emboss (preview quality) ───────────────────────
//
// Approximation: two inner-shadow passes at opposing angles
// (light direction = highlight, opposite = shadow).

function applyBevelPreview(
  canvas: HTMLCanvasElement,
  params: {
    highlightColor: string;
    shadowColor: string;
    depth: number;
    size: number;
  }
): HTMLCanvasElement {
  const lightAngle = 135; // top-left light source
  const shadowAngle = lightAngle + 180; // 315° — bottom-right

  // Highlight pass
  let result = applyInnerShadow(canvas, {
    color: params.highlightColor,
    blur: params.size,
    angle: lightAngle,
    distance: params.depth * 0.55,
    opacity: 0.72
  });

  // Shadow pass
  result = applyInnerShadow(result, {
    color: params.shadowColor,
    blur: params.size,
    angle: shadowAngle,
    distance: params.depth * 0.55,
    opacity: 0.72
  });

  return result;
}

// ─── Arc / Arch Warp ─────────────────────────────────────────────────────────

function drawArcWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  fontStr: string
): HTMLCanvasElement {
  const absAmt = Math.abs(amount);
  const sign = amount >= 0 ? 1 : -1;
  const ascent = fontSize * 0.82;

  if (absAmt < 1) {
    const ep = PAD;
    resizeCanvas(canvas, ctx, totalWidth + ep * 2, fontSize + ep * 2, layer, fontStr);
    let x = ep;
    chars.forEach((c, i) => {
      ctx.save();
      ctx.translate(x, ep + ascent);
      drawCharLeft(ctx, layer, c);
      ctx.restore();
      x += charWidths[i] + layer.letterSpacing;
    });
    return canvas;
  }

  const arcSpanRad = (absAmt / 100) * Math.PI * 0.75; // max ~135°
  const radius = totalWidth / arcSpanRad;
  const arcVertExtent = radius * (1 - Math.cos(arcSpanRad / 2));

  const strokePad = (layer.stroke?.width ?? 0) + (layer.shadow?.blur ?? 0) * 0.5;
  const ep = PAD + strokePad;

  const canvasW = Math.ceil(totalWidth + ep * 2);
  const canvasH = Math.ceil(arcVertExtent + fontSize + ep * 2);

  resizeCanvas(canvas, ctx, canvasW, canvasH, layer, fontStr);

  const centerX = canvasW / 2;
  // Centre character baseline Y
  // Upward (sign>0): centre char at TOP  → small y
  // Downward (sign<0): centre char at BOTTOM → large y
  const refY = sign > 0 ? ep + ascent : ep + arcVertExtent + ascent;

  let xCum = 0;
  for (let i = 0; i < chars.length; i++) {
    const cw = charWidths[i];
    const offset = xCum + cw / 2 - totalWidth / 2;
    const theta = offset / radius;
    const dx = radius * Math.sin(theta);
    const dy = sign * radius * (1 - Math.cos(theta));

    ctx.save();
    ctx.translate(centerX + dx, refY + dy);
    ctx.rotate(theta * sign);
    drawChar(ctx, layer, chars[i], cw / 2);
    ctx.restore();

    xCum += cw + layer.letterSpacing;
  }
  return canvas;
}

// ─── Wave Warp ───────────────────────────────────────────────────────────────

function drawWaveWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  hDist: number,
  fontStr: string
): HTMLCanvasElement {
  const amplitude = (Math.abs(amount) / 100) * fontSize * 0.7;
  const sign = amount >= 0 ? 1 : -1;
  const cycles = 1 + Math.abs(hDist) / 100;
  const ascent = fontSize * 0.82;

  const strokePad = (layer.stroke?.width ?? 0) + (layer.shadow?.blur ?? 0) * 0.5;
  const ep = PAD + strokePad;

  resizeCanvas(canvas, ctx, totalWidth + ep * 2, fontSize + amplitude * 2 + ep * 2, layer, fontStr);

  const baseY = ep + ascent + amplitude;
  let x = ep;
  for (let i = 0; i < chars.length; i++) {
    const cw = charWidths[i];
    const t = totalWidth > 0 ? (x - ep + cw / 2) / totalWidth : 0;
    const dy = sign * amplitude * Math.sin(t * Math.PI * 2 * cycles);
    ctx.save();
    ctx.translate(x, baseY + dy);
    drawCharLeft(ctx, layer, chars[i]);
    ctx.restore();
    x += cw + layer.letterSpacing;
  }
  return canvas;
}

// ─── Bulge Warp ───────────────────────────────────────────────────────────────

function drawBulgeWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  fontStr: string
): HTMLCanvasElement {
  const maxDisp = (Math.abs(amount) / 100) * fontSize * 0.65;
  const sign = amount >= 0 ? 1 : -1;
  const ascent = fontSize * 0.82;

  const ep = PAD + (layer.stroke?.width ?? 0);
  resizeCanvas(canvas, ctx, totalWidth + ep * 2, fontSize + maxDisp + ep * 2, layer, fontStr);

  const baseY = sign > 0 ? ep + ascent : ep + maxDisp + ascent;
  let x = ep;
  for (let i = 0; i < chars.length; i++) {
    const cw = charWidths[i];
    const t = totalWidth > 0 ? (x - ep + cw / 2) / totalWidth : 0;
    const n = t * 2 - 1;
    const dy = sign * (1 - n * n) * maxDisp;
    ctx.save();
    ctx.translate(x, baseY + dy);
    drawCharLeft(ctx, layer, chars[i]);
    ctx.restore();
    x += cw + layer.letterSpacing;
  }
  return canvas;
}

// ─── Inflate Warp ─────────────────────────────────────────────────────────────

function drawInflateWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  fontStr: string
): HTMLCanvasElement {
  const maxScale = 1 + (Math.abs(amount) / 100) * 0.8;
  const sign = amount >= 0 ? 1 : -1;
  const ascent = fontSize * 0.82;
  const ep = PAD;

  resizeCanvas(canvas, ctx, totalWidth + ep * 2, fontSize * maxScale + ep * 2, layer, fontStr);

  const baseY = ep + ascent * maxScale;
  let x = ep;
  for (let i = 0; i < chars.length; i++) {
    const cw = charWidths[i];
    const t = totalWidth > 0 ? (x - ep + cw / 2) / totalWidth : 0;
    const n = t * 2 - 1;
    const scaleY = 1 + sign * (1 - n * n) * (maxScale - 1);
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(1, scaleY);
    drawCharLeft(ctx, layer, chars[i]);
    ctx.restore();
    x += cw + layer.letterSpacing;
  }
  return canvas;
}

// ─── Squeeze Warp ────────────────────────────────────────────────────────────

function drawSqueezeWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  fontStr: string
): HTMLCanvasElement {
  const maxScale = 1 + (Math.abs(amount) / 100) * 0.8;
  const sign = amount >= 0 ? 1 : -1;
  const ascent = fontSize * 0.82;
  const ep = PAD;

  resizeCanvas(canvas, ctx, totalWidth + ep * 2, fontSize * maxScale + ep * 2, layer, fontStr);

  const baseY = ep + ascent * maxScale;
  let x = ep;
  for (let i = 0; i < chars.length; i++) {
    const cw = charWidths[i];
    const t = totalWidth > 0 ? (x - ep + cw / 2) / totalWidth : 0;
    const n = t * 2 - 1;
    const scaleY = 1 + sign * (n * n) * (maxScale - 1);
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(1, scaleY);
    drawCharLeft(ctx, layer, chars[i]);
    ctx.restore();
    x += cw + layer.letterSpacing;
  }
  return canvas;
}

// ─── Rise Warp ───────────────────────────────────────────────────────────────

function drawRiseWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  fontStr: string
): HTMLCanvasElement {
  const maxScale = 1 + (Math.abs(amount) / 100) * 1.2;
  const sign = amount >= 0 ? 1 : -1;
  const ascent = fontSize * 0.82;
  const ep = PAD;

  resizeCanvas(canvas, ctx, totalWidth + ep * 2, fontSize * maxScale + ep * 2, layer, fontStr);

  const baseY = ep + ascent * maxScale;
  let x = ep;
  for (let i = 0; i < chars.length; i++) {
    const cw = charWidths[i];
    const t = totalWidth > 0 ? (x - ep + cw / 2) / totalWidth : 0;
    const scaleY = 1 + sign * t * (maxScale - 1);
    ctx.save();
    ctx.translate(x, baseY);
    ctx.scale(1, scaleY);
    drawCharLeft(ctx, layer, chars[i]);
    ctx.restore();
    x += cw + layer.letterSpacing;
  }
  return canvas;
}

// ─── Flag Warp ───────────────────────────────────────────────────────────────

function drawFlagWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  hDist: number,
  fontStr: string
): HTMLCanvasElement {
  const amplitude = (Math.abs(amount) / 100) * fontSize * 0.8;
  const sign = amount >= 0 ? 1 : -1;
  const cycles = 1 + Math.abs(hDist) / 100;
  const ascent = fontSize * 0.82;
  const ep = PAD;

  resizeCanvas(canvas, ctx, totalWidth + ep * 2, fontSize + amplitude * 2 + ep * 2, layer, fontStr);

  const baseY = ep + ascent + amplitude;
  let x = ep;
  for (let i = 0; i < chars.length; i++) {
    const cw = charWidths[i];
    const t = totalWidth > 0 ? (x - ep + cw / 2) / totalWidth : 0;
    const phase = t * Math.PI * 2 * cycles;
    const dy = sign * amplitude * Math.sin(phase);
    const rot = sign * (Math.abs(amount) / 100) * 0.25 * Math.cos(phase);
    ctx.save();
    ctx.translate(x + cw / 2, baseY + dy);
    ctx.rotate(rot);
    drawChar(ctx, layer, chars[i], cw / 2);
    ctx.restore();
    x += cw + layer.letterSpacing;
  }
  return canvas;
}

// ─── Fisheye Warp ────────────────────────────────────────────────────────────

function drawFisheyeWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  fontStr: string
): HTMLCanvasElement {
  const maxScale = 1 + (Math.abs(amount) / 100) * 1.5;
  const sign = amount >= 0 ? 1 : -1;
  const ascent = fontSize * 0.82;
  const ep = PAD;

  const xScales = chars.map((_, i) => {
    const cumW = charWidths.slice(0, i).reduce((s, w) => s + w, 0) + charWidths[i] / 2;
    const t = totalWidth > 0 ? cumW / totalWidth : 0;
    const n = t * 2 - 1;
    return 1 + sign * (1 - n * n) * (maxScale - 1);
  });

  let totalScaled = 0;
  for (let i = 0; i < chars.length; i++) {
    totalScaled += charWidths[i] * xScales[i] + layer.letterSpacing;
  }
  totalScaled -= layer.letterSpacing;

  const canvasW = Math.ceil(Math.max(totalWidth, totalScaled) + ep * 2);
  resizeCanvas(canvas, ctx, canvasW, fontSize * maxScale + ep * 2, layer, fontStr);

  const baseY = ep + ascent * maxScale;
  const centerX = canvasW / 2;

  const positions: number[] = [];
  let xp = centerX - totalScaled / 2;
  for (let i = 0; i < chars.length; i++) {
    positions.push(xp);
    xp += charWidths[i] * xScales[i] + layer.letterSpacing;
  }

  for (let i = 0; i < chars.length; i++) {
    ctx.save();
    ctx.translate(positions[i], baseY);
    ctx.scale(xScales[i], xScales[i]);
    drawCharLeft(ctx, layer, chars[i]);
    ctx.restore();
  }
  return canvas;
}

// ─── Shell Warp ──────────────────────────────────────────────────────────────

function drawShellWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  upper: boolean,
  fontStr: string
): HTMLCanvasElement {
  const arcSpanRad = (Math.abs(amount) / 100) * Math.PI * 0.65;
  const radius = totalWidth / Math.max(arcSpanRad, 0.01);
  const arcVertExtent = radius * (1 - Math.cos(arcSpanRad / 2));
  const sign = (amount >= 0 ? 1 : -1) * (upper ? -1 : 1);
  const ascent = fontSize * 0.82;
  const ep = PAD;

  resizeCanvas(canvas, ctx, totalWidth + ep * 2, arcVertExtent + fontSize * 1.6 + ep * 2, layer, fontStr);

  const centerX = canvas.width / 2;
  const refY = sign > 0 ? ep + ascent : ep + arcVertExtent + ascent;

  let xCum = 0;
  for (let i = 0; i < chars.length; i++) {
    const cw = charWidths[i];
    const offset = xCum + cw / 2 - totalWidth / 2;
    const theta = offset / radius;
    const t = (xCum + cw / 2) / totalWidth;
    const perspScale = upper ? 0.5 + t * 0.8 : 1.3 - t * 0.8;
    const dx = radius * Math.sin(theta);
    const dy = sign * radius * (1 - Math.cos(theta));
    ctx.save();
    ctx.translate(centerX + dx, refY + dy);
    ctx.rotate(theta * sign);
    ctx.scale(1, perspScale);
    drawChar(ctx, layer, chars[i], cw / 2);
    ctx.restore();
    xCum += cw + layer.letterSpacing;
  }
  return canvas;
}

// ─── Fish Warp ───────────────────────────────────────────────────────────────

function drawFishWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  fontStr: string
): HTMLCanvasElement {
  const amplitude = (Math.abs(amount) / 100) * fontSize * 0.7;
  const sign = amount >= 0 ? 1 : -1;
  const ascent = fontSize * 0.82;
  const ep = PAD;

  resizeCanvas(canvas, ctx, totalWidth + ep * 2, fontSize + amplitude * 2 + ep * 2, layer, fontStr);

  const baseY = ep + ascent + amplitude;
  let x = ep;
  for (let i = 0; i < chars.length; i++) {
    const cw = charWidths[i];
    const t = totalWidth > 0 ? (x - ep + cw / 2) / totalWidth : 0;
    const dy = sign * amplitude * Math.sin(t * Math.PI);
    ctx.save();
    ctx.translate(x, baseY + dy);
    drawCharLeft(ctx, layer, chars[i]);
    ctx.restore();
    x += cw + layer.letterSpacing;
  }
  return canvas;
}

// ─── Twist Warp ──────────────────────────────────────────────────────────────

function drawTwistWarp(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  chars: string[],
  charWidths: number[],
  totalWidth: number,
  fontSize: number,
  amount: number,
  fontStr: string
): HTMLCanvasElement {
  const maxRot = (amount / 100) * Math.PI * 0.6;
  const ascent = fontSize * 0.82;
  const ep = PAD;

  resizeCanvas(canvas, ctx, totalWidth + ep * 2, fontSize + ep * 2, layer, fontStr);

  let x = ep;
  for (let i = 0; i < chars.length; i++) {
    const cw = charWidths[i];
    const t = totalWidth > 0 ? (x - ep + cw / 2) / totalWidth : 0;
    ctx.save();
    ctx.translate(x + cw / 2, ep + ascent);
    ctx.rotate(t * maxRot);
    drawChar(ctx, layer, chars[i], cw / 2);
    ctx.restore();
    x += cw + layer.letterSpacing;
  }
  return canvas;
}

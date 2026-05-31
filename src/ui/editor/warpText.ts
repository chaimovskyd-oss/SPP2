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
const patternImageCache = new Map<string, HTMLImageElement>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a canvas when any complex effect requires off-screen rendering,
 * null when native Konva Text is sufficient.
 */
export function renderTextToCanvas(layer: TextLayer): HTMLCanvasElement | null {
  const hasWarp = layer.warpSettings.enabled && layer.warpSettings.type !== "none";
  const innerShadowEffect = layer.effects.find((e) => e.enabled && e.effectType === "inner_shadow");
  const bevelEffect = layer.effects.find((e) => e.enabled && e.effectType === "bevel_emboss");
  const outerGlowEffect = layer.effects.find((e) => e.enabled && e.effectType === "outer_glow");
  const patternEffect = layer.effects.find((e) => e.enabled && e.effectType === "pattern_overlay");
  const sparkleEffect = layer.effects.find((e) => e.enabled && e.effectType === "sparkle");
  const extrudeEffect = layer.effects.find((e) => e.enabled && e.effectType === "extrude_3d");
  const hasInsideStroke = layer.stroke !== undefined && (layer.stroke.position ?? "outside") === "inside";

  if (
    !hasWarp &&
    !hasInsideStroke &&
    innerShadowEffect === undefined &&
    bevelEffect === undefined &&
    outerGlowEffect === undefined &&
    patternEffect === undefined &&
    sparkleEffect === undefined &&
    extrudeEffect === undefined
  ) {
    return null;
  }

  if (outerGlowEffect !== undefined) {
    // eslint-disable-next-line no-console
    console.log("[outer_glow] rendering text layer", {
      layerId: layer.id,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      color: layer.color,
      params: outerGlowEffect.params,
      opacity: outerGlowEffect.opacity
    });
  }

  // Step 1: base text (with or without warp)
  let canvas: HTMLCanvasElement | null;
  if (hasWarp) {
    canvas = renderWarpedText(layer);
  } else {
    canvas = renderStraightText(layer);
  }
  if (canvas === null) return null;

  if (extrudeEffect !== undefined) {
    const p = extrudeEffect.params as Record<string, unknown>;
    canvas = applyExtrude3D(canvas, {
      color: stringParam(p, "color", "#333333"),
      depth: numberParam(p, "depth", 10),
      offsetX: numberParam(p, "offsetX", 1),
      offsetY: numberParam(p, "offsetY", 1),
      steps: numberParam(p, "steps", 10),
      opacity: numberParam(p, "opacity", extrudeEffect.opacity)
    });
  }

  if (patternEffect !== undefined) {
    const p = patternEffect.params as Record<string, unknown>;
    const applyTo = (typeof p["applyTo"] === "string" ? p["applyTo"] : "fill_only") as "fill_only" | "stroke_only" | "all";
    canvas = applyWithScope(canvas, layer, hasWarp, applyTo, (input) =>
      applyPatternOverlay(input, {
        patternType: stringParam(p, "patternType", "stripes"),
        foreground: stringParam(p, "foreground", "#ffffff"),
        background: typeof p["background"] === "string" ? p["background"] : undefined,
        opacity: numberParam(p, "opacity", patternEffect.opacity),
        scale: numberParam(p, "scale", 1),
        rotation: numberParam(p, "rotation", 0),
        spacing: numberParam(p, "spacing", 10),
        imageDataUrl: typeof p["imageDataUrl"] === "string" ? p["imageDataUrl"] : undefined
      })
    );
  }

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

  if (sparkleEffect !== undefined) {
    const p = sparkleEffect.params as Record<string, unknown>;
    const applyTo = (typeof p["applyTo"] === "string" ? p["applyTo"] : "fill_only") as "fill_only" | "stroke_only" | "all";
    canvas = applyWithScope(canvas, layer, hasWarp, applyTo, (input) =>
      applySparkle(input, {
        density: numberParam(p, "density", 0.16),
        size: numberParam(p, "size", 4),
        color: stringParam(p, "color", "#ffffff"),
        seed: numberParam(p, "seed", 1),
        opacity: numberParam(p, "opacity", sparkleEffect.opacity),
        rays: numberParam(p, "rays", 8),
        glint: numberParam(p, "glint", 0.55),
        halo: numberParam(p, "halo", 0.65)
      })
    );
  }

  if (outerGlowEffect !== undefined) {
    const p = outerGlowEffect.params as Record<string, unknown>;
    canvas = applyOuterGlow(canvas, {
      color: stringParam(p, "color", "#ffffff"),
      innerColor: typeof p["innerColor"] === "string" ? p["innerColor"] : undefined,
      outerColor: typeof p["outerColor"] === "string" ? p["outerColor"] : undefined,
      blur: numberParam(p, "blur", 20),
      spread: numberParam(p, "spread", 0),
      passes: numberParam(p, "passes", 3),
      opacity: numberParam(p, "opacity", outerGlowEffect.opacity)
    });
  }

  return canvas;
}

export function renderTextToAlphaCanvas(layer: TextLayer): HTMLCanvasElement | null {
  return renderTextToCanvas(layer) ?? renderStraightText(layer);
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
  ctx.fillStyle = buildCanvasFill(ctx, layer);
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

function buildCanvasFill(ctx: CanvasRenderingContext2D, layer: TextLayer): string | CanvasGradient {
  if (layer.gradient === undefined || layer.gradient.stops.length === 0) {
    return hexToRgba(layer.color, layer.fillOpacity);
  }
  const w = Math.max(1, ctx.canvas.width);
  const h = Math.max(1, ctx.canvas.height);
  if (layer.gradient.type === "radial") {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
    layer.gradient.stops.forEach((stop) => g.addColorStop(clamp(stop.offset, 0, 1), hexToRgba(stop.color, stop.opacity * layer.fillOpacity)));
    return g;
  }
  const radians = ((layer.gradient.angle ?? 0) * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const dx = Math.cos(radians) * w * 0.5;
  const dy = Math.sin(radians) * h * 0.5;
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  layer.gradient.stops.forEach((stop) => g.addColorStop(clamp(stop.offset, 0, 1), hexToRgba(stop.color, stop.opacity * layer.fillOpacity)));
  return g;
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
  drawCharAt(ctx, layer, char, -halfW, 0);
}

/** Draw char left-aligned at (0,0) — used for straight/wave chars. */
function drawCharLeft(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  char: string
): void {
  drawCharAt(ctx, layer, char, 0, 0);
}

function drawCharAt(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  char: string,
  x: number,
  y: number
): void {
  const stroke = layer.stroke;
  const hasStroke = stroke !== undefined && stroke.width > 0 && stroke.opacity > 0;
  const skipFill = (layer as TextLayer & { __sppSkipFill?: boolean }).__sppSkipFill === true;
  const skipStroke = (layer as TextLayer & { __sppSkipStroke?: boolean }).__sppSkipStroke === true;

  if (!hasStroke || skipStroke) {
    if (!skipFill) ctx.fillText(char, x, y);
    return;
  }

  const position = stroke!.position ?? "outside";
  const strokeColor = hexToRgba(stroke!.color, stroke!.opacity);

  if (position === "outside") {
    if (!skipFill) {
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = stroke!.width * 2;
      ctx.lineJoin = "round";
      ctx.shadowColor = "transparent";
      ctx.strokeText(char, x, y);
      ctx.restore();
      ctx.fillText(char, x, y);
    } else {
      // stroke-only render: draw the *visible* outside-stroke region.
      // Trick: wide stroke then clear the fill region using destination-out.
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = stroke!.width * 2;
      ctx.lineJoin = "round";
      ctx.shadowColor = "transparent";
      ctx.strokeText(char, x, y);
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      ctx.fillText(char, x, y);
      ctx.restore();
    }
  } else if (position === "center") {
    if (!skipFill) ctx.fillText(char, x, y);
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = stroke!.width;
    ctx.lineJoin = "round";
    ctx.shadowColor = "transparent";
    ctx.strokeText(char, x, y);
    ctx.restore();
  } else {
    // inside: fill first, then stroke clipped to fill via source-atop
    if (!skipFill) {
      ctx.fillText(char, x, y);
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = stroke!.width * 2;
      ctx.lineJoin = "round";
      ctx.shadowColor = "transparent";
      ctx.strokeText(char, x, y);
      ctx.restore();
    } else {
      // stroke-only render for "inside": draw text shape, then wide stroke source-atop, then erase the unstamped fill area.
      ctx.save();
      ctx.fillStyle = "#000";
      ctx.fillText(char, x, y);
      ctx.globalCompositeOperation = "source-atop";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = stroke!.width * 2;
      ctx.lineJoin = "round";
      ctx.shadowColor = "transparent";
      ctx.strokeText(char, x, y);
      // remove the placeholder fill pixels: keep only stroked pixels
      // (Approximation acceptable; minor fill bleed is fine for overlay use.)
      ctx.restore();
    }
  }
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
  setCanvasOffset(canvas, ep, ep);
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

function applyExtrude3D(
  canvas: HTMLCanvasElement,
  params: { color: string; depth: number; offsetX: number; offsetY: number; steps: number; opacity: number }
): HTMLCanvasElement {
  const steps = Math.max(1, Math.round(params.steps));
  const depth = Math.max(0, params.depth);
  const maxShiftX = params.offsetX * depth;
  const maxShiftY = params.offsetY * depth;
  // Grow the canvas toward the extrusion direction so the depth (and the outline
  // baked into the base canvas) is never clipped, regardless of offset sign.
  const padLeft = Math.ceil(Math.max(0, -maxShiftX));
  const padTop = Math.ceil(Math.max(0, -maxShiftY));
  const padRight = Math.ceil(Math.max(0, maxShiftX));
  const padBottom = Math.ceil(Math.max(0, maxShiftY));

  const result = document.createElement("canvas");
  result.width = canvas.width + padLeft + padRight;
  result.height = canvas.height + padTop + padBottom;
  const ctx = result.getContext("2d");
  if (ctx === null) return canvas;

  const tinted = tintAlpha(canvas, params.color);
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    ctx.save();
    ctx.globalAlpha = clamp(params.opacity * (0.35 + t * 0.65), 0, 1);
    ctx.drawImage(tinted, padLeft + maxShiftX * t, padTop + maxShiftY * t);
    ctx.restore();
  }
  ctx.drawImage(canvas, padLeft, padTop);
  copyCanvasOffset(canvas, result, padLeft, padTop);
  return result;
}

function applyOuterGlow(
  canvas: HTMLCanvasElement,
  params: {
    color: string;
    innerColor?: string;
    outerColor?: string;
    blur: number;
    spread: number;
    passes: number;
    opacity: number;
  }
): HTMLCanvasElement {
  const blur = Math.max(0, params.blur);
  const spread = Math.max(0, params.spread);
  const pad = Math.ceil(blur * 1.8 + spread + 8);
  const result = document.createElement("canvas");
  result.width = canvas.width + pad * 2;
  result.height = canvas.height + pad * 2;
  const ctx = result.getContext("2d");
  if (ctx === null) return canvas;

  const passes = Math.max(1, Math.round(params.passes));
  for (let i = passes; i >= 1; i--) {
    const t = i / passes;
    const passColor = i === passes && params.outerColor !== undefined ? params.outerColor : params.color;
    ctx.save();
    ctx.globalAlpha = clamp(params.opacity * (0.28 + t * 0.72), 0, 1);
    ctx.shadowColor = hexToRgba(passColor, 1);
    ctx.shadowBlur = blur * (0.35 + t * 0.75) + spread * t;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.drawImage(tintAlpha(canvas, params.innerColor ?? params.color), pad, pad);
    ctx.restore();
  }
  ctx.drawImage(canvas, pad, pad);
  copyCanvasOffset(canvas, result, pad, pad);
  return result;
}

/**
 * Apply an effect to only the fill region, only the stroke region, or both.
 * Strategy:
 *  - "all": just run the effect on the canvas as-is.
 *  - "fill_only": run effect, then composite a stroke-only render back on top.
 *  - "stroke_only": run effect, then composite a fill-only render back on top.
 * If the layer has no stroke, scoping is a no-op.
 */
function applyWithScope(
  canvas: HTMLCanvasElement,
  layer: TextLayer,
  hasWarp: boolean,
  applyTo: "fill_only" | "stroke_only" | "all",
  apply: (input: HTMLCanvasElement) => HTMLCanvasElement
): HTMLCanvasElement {
  const hasStroke = layer.stroke !== undefined && layer.stroke.width > 0 && layer.stroke.opacity > 0;
  if (applyTo === "all" || !hasStroke) return apply(canvas);

  const overlay = applyTo === "fill_only"
    ? renderTextVariant(layer, hasWarp, { skipFill: true })
    : renderTextVariant(layer, hasWarp, { skipStroke: true });

  const processed = apply(canvas);
  if (overlay === null) return processed;

  // Overlay must align with processed canvas. If sizes differ (post-effects can pad),
  // draw overlay centered using the stored sppTextOffset values.
  const procMeta = processed as HTMLCanvasElement & { sppTextOffsetX?: number; sppTextOffsetY?: number };
  const overMeta = overlay as HTMLCanvasElement & { sppTextOffsetX?: number; sppTextOffsetY?: number };
  const dx = (procMeta.sppTextOffsetX ?? 0) - (overMeta.sppTextOffsetX ?? 0);
  const dy = (procMeta.sppTextOffsetY ?? 0) - (overMeta.sppTextOffsetY ?? 0);

  const ctx = processed.getContext("2d");
  if (ctx === null) return processed;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(overlay, dx, dy);
  ctx.restore();
  return processed;
}

function renderTextVariant(
  layer: TextLayer,
  hasWarp: boolean,
  flags: { skipFill?: boolean; skipStroke?: boolean }
): HTMLCanvasElement | null {
  // Drop shadow on the variant to avoid double-shadow when composited back on top.
  const variant = {
    ...layer,
    shadow: undefined,
    __sppSkipFill: flags.skipFill === true,
    __sppSkipStroke: flags.skipStroke === true
  } as TextLayer & { __sppSkipFill: boolean; __sppSkipStroke: boolean };
  return hasWarp ? renderWarpedText(variant) : renderStraightText(variant);
}

function applyPatternOverlay(
  canvas: HTMLCanvasElement,
  params: {
    patternType: string;
    foreground: string;
    background?: string;
    opacity: number;
    scale: number;
    rotation: number;
    spacing: number;
    imageDataUrl?: string;
  }
): HTMLCanvasElement {
  const result = cloneCanvas(canvas);
  const ctx = result.getContext("2d");
  if (ctx === null) return canvas;
  const pattern = createPatternCanvas(params);
  const fill = ctx.createPattern(pattern, "repeat");
  if (fill === null) return canvas;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = clamp(params.opacity, 0, 1);
  ctx.translate(result.width / 2, result.height / 2);
  ctx.rotate((params.rotation * Math.PI) / 180);
  ctx.translate(-result.width / 2, -result.height / 2);
  ctx.fillStyle = fill;
  ctx.fillRect(-result.width, -result.height, result.width * 3, result.height * 3);
  ctx.restore();
  return result;
}

function createPatternCanvas(params: {
  patternType: string;
  foreground: string;
  background?: string;
  scale: number;
  spacing: number;
  imageDataUrl?: string;
}): HTMLCanvasElement {
  const spacing = Math.max(4, params.spacing * Math.max(0.25, params.scale));
  const size = Math.ceil(spacing * 2);
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext("2d");
  if (ctx === null) return tile;

  const uploaded = params.patternType === "uploaded_image" ? resolvePatternImage(params.imageDataUrl) : null;
  if (uploaded !== null) {
    const target = Math.max(8, Math.ceil(params.spacing * Math.max(0.35, params.scale) * 5));
    tile.width = target;
    tile.height = target;
    const imageCtx = tile.getContext("2d");
    if (imageCtx === null) return tile;
    if (params.background !== undefined) {
      imageCtx.fillStyle = params.background;
      imageCtx.fillRect(0, 0, target, target);
    }
    imageCtx.drawImage(uploaded, 0, 0, target, target);
    return tile;
  }

  if (params.background !== undefined) {
    ctx.fillStyle = params.background;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.fillStyle = params.foreground;
  ctx.strokeStyle = params.foreground;
  ctx.lineCap = "round";

  if (params.patternType === "dots") {
    ctx.beginPath();
    ctx.arc(spacing / 2, spacing / 2, Math.max(1, spacing * 0.14), 0, Math.PI * 2);
    ctx.arc(spacing * 1.5, spacing * 1.5, Math.max(1, spacing * 0.14), 0, Math.PI * 2);
    ctx.fill();
  } else if (params.patternType === "checker") {
    ctx.fillRect(0, 0, spacing, spacing);
    ctx.fillRect(spacing, spacing, spacing, spacing);
  } else if (params.patternType === "diagonal_shine") {
    const gradient = ctx.createLinearGradient(0, size, size, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.45, params.foreground);
    gradient.addColorStop(0.58, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  } else if (params.patternType === "noise") {
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = pseudoRandom(i + size) > 0.52 ? 255 : 0;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = v > 0 ? 70 : 0;
    }
    ctx.putImageData(image, 0, 0);
  } else if (params.patternType === "halftone") {
    for (let y = spacing * 0.4; y < size; y += spacing * 0.8) {
      for (let x = spacing * 0.4; x < size; x += spacing * 0.8) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, spacing * 0.12 + ((x + y) % spacing) * 0.04), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (params.patternType === "brushed_metal") {
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y += 2) {
      ctx.globalAlpha = 0.25 + pseudoRandom(y + size) * 0.55;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(size, y + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.lineWidth = Math.max(1, spacing * 0.18);
    for (let x = -size; x < size * 2; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, size);
      ctx.lineTo(x + size, 0);
      ctx.stroke();
    }
  }
  return tile;
}

function applySparkle(canvas: HTMLCanvasElement, params: { density: number; size: number; color: string; seed: number; opacity: number; rays: number; glint: number; halo: number }): HTMLCanvasElement {
  const result = cloneCanvas(canvas);
  const ctx = result.getContext("2d");
  if (ctx === null) return canvas;
  const density = clamp(params.density, 0.02, 1);
  const count = Math.max(2, Math.round((result.width * result.height * density) / 5200));
  const opacity = clamp(params.opacity, 0, 1);
  const glint = clamp(params.glint, 0, 1);
  const halo = clamp(params.halo, 0, 1);
  const rays = Math.max(4, Math.round(params.rays));
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  for (let i = 0; i < count; i++) {
    const r1 = seededRandom(params.seed + i * 31);
    const r2 = seededRandom(params.seed + i * 47);
    const r3 = seededRandom(params.seed + i * 59);
    const r4 = seededRandom(params.seed + i * 71);
    const x = r1 * result.width;
    const y = r2 * result.height;
    const s = Math.max(2, params.size * (0.7 + r3 * 1.25));
    if (halo > 0) {
      const radial = ctx.createRadialGradient(x, y, 0, x, y, s * 2.4);
      radial.addColorStop(0, hexToRgba(params.color, opacity * halo * 0.48));
      radial.addColorStop(0.42, hexToRgba(params.color, opacity * halo * 0.16));
      radial.addColorStop(1, hexToRgba(params.color, 0));
      ctx.fillStyle = radial;
      ctx.fillRect(x - s * 2.4, y - s * 2.4, s * 4.8, s * 4.8);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r4 * Math.PI);
    ctx.strokeStyle = hexToRgba(params.color, opacity);
    ctx.lineCap = "round";
    for (let ray = 0; ray < rays; ray++) {
      const angle = (ray / rays) * Math.PI * 2;
      const longRay = ray % 2 === 0;
      const length = s * (longRay ? 1.95 : 0.78);
      ctx.globalAlpha = opacity * (longRay ? 1 : 0.62);
      ctx.lineWidth = Math.max(0.7, s * (longRay ? 0.115 : 0.07));
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * s * 0.18, Math.sin(angle) * s * 0.18);
      ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
      ctx.stroke();
    }
    ctx.globalAlpha = opacity;
    ctx.fillStyle = hexToRgba("#ffffff", Math.min(1, opacity + 0.18));
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.8, s * 0.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (glint > 0) {
    const glintCount = Math.max(1, Math.round(count * 0.38));
    ctx.globalAlpha = opacity * glint;
    ctx.strokeStyle = hexToRgba(params.color, 1);
    ctx.lineCap = "round";
    for (let i = 0; i < glintCount; i++) {
      const x = seededRandom(params.seed + i * 97) * result.width;
      const y = seededRandom(params.seed + i * 109) * result.height;
      const len = params.size * (3.8 + seededRandom(params.seed + i * 131) * 4.2);
      ctx.lineWidth = Math.max(0.8, params.size * 0.12);
      ctx.beginPath();
      ctx.moveTo(x - len, y + len * 0.45);
      ctx.lineTo(x + len, y - len * 0.45);
      ctx.stroke();
    }
  }
  ctx.restore();
  return result;
}

function resolvePatternImage(imageDataUrl: string | undefined): HTMLImageElement | null {
  if (imageDataUrl === undefined || imageDataUrl.length === 0) return null;
  const cached = patternImageCache.get(imageDataUrl);
  if (cached !== undefined) return cached.complete && cached.naturalWidth > 0 ? cached : null;
  const image = new Image();
  image.onload = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("spp2:text-pattern-ready"));
    }
  };
  image.src = imageDataUrl;
  patternImageCache.set(imageDataUrl, image);
  return image.complete && image.naturalWidth > 0 ? image : null;
}

function tintAlpha(canvas: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const tinted = document.createElement("canvas");
  tinted.width = canvas.width;
  tinted.height = canvas.height;
  const ctx = tinted.getContext("2d");
  if (ctx === null) return canvas;
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, tinted.width, tinted.height);
  return tinted;
}

function cloneCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext("2d");
  if (ctx !== null) ctx.drawImage(canvas, 0, 0);
  copyCanvasOffset(canvas, copy);
  return copy;
}

function setCanvasOffset(canvas: HTMLCanvasElement, x: number, y: number): void {
  (canvas as HTMLCanvasElement & { sppTextOffsetX?: number; sppTextOffsetY?: number }).sppTextOffsetX = x;
  (canvas as HTMLCanvasElement & { sppTextOffsetX?: number; sppTextOffsetY?: number }).sppTextOffsetY = y;
}

function copyCanvasOffset(source: HTMLCanvasElement, target: HTMLCanvasElement, addX = 0, addY = 0): void {
  const meta = source as HTMLCanvasElement & { sppTextOffsetX?: number; sppTextOffsetY?: number };
  setCanvasOffset(target, (meta.sppTextOffsetX ?? 0) + addX, (meta.sppTextOffsetY ?? 0) + addY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function numberParam(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringParam(params: Record<string, unknown>, key: string, fallback: string): string {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 78.233) * 12345.6789;
  return x - Math.floor(x);
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

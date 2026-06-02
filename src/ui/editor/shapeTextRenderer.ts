import type { TextLayer } from "@/types/layers";
import type { ShapeFittedLine, ShapeTextFitResult } from "@/core/text/shapeTextFit";
import { buildOccupancyFromAlpha, fitTextInShape } from "@/core/text/shapeTextFit";
import { fitTextToBox } from "@/core/text/smartTextFit";
import { buildFontString, drawCharAt, isRTLText, setupCtx } from "./warpText";

/** Cap occupancy sampling resolution so per-line scanning stays cheap; layout is scaled back up. */
const MAX_OCCUPANCY_DIM = 360;

export interface FrameTextRenderInput {
  /** Frame content rect size in page pixels (text is drawn in this local space). */
  width: number;
  height: number;
  padding: number;
  mode: "fitBox" | "fitInsideShape";
  density?: "relaxed" | "normal" | "tight";
  verticalAlign?: "top" | "center" | "bottom";
  /** fitInsideShape: trace + fill the shape region for occupancy (same path the frame clips with). */
  drawClip?: (ctx: CanvasRenderingContext2D) => void;
  /** fitInsideShape: alpha mask image — takes priority over drawClip when present. */
  maskImage?: CanvasImageSource | null;
}

/**
 * Render a frame's text content (fitBox or fitInsideShape) to a canvas sized to the frame's
 * content rect. The caller draws the result inside the frame's clip/mask group.
 */
export function renderFrameTextToCanvas(layer: TextLayer, input: FrameTextRenderInput): HTMLCanvasElement | null {
  if (!layer.text.trim()) return null;
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const pad = Math.max(0, input.padding);

  if (input.mode === "fitBox") {
    const layout = buildBoxLayout(layer, width, height, pad, input.verticalAlign ?? "center");
    return layout === null ? null : renderShapeFittedTextToCanvas(layer, layout, width, height);
  }

  const occInfo = buildFrameOccupancy(width, height, input);
  if (occInfo === null) return null;
  const { occupancy, scale } = occInfo;
  const fitted = fitTextInShape(layer, occupancy, {
    padding: pad * scale,
    density: input.density,
    verticalAlign: input.verticalAlign
  });
  if (fitted.lines.length === 0) return null;
  const scaled = scaleLayout(fitted, 1 / scale);
  return renderShapeFittedTextToCanvas(layer, scaled, width, height);
}

function buildBoxLayout(
  layer: TextLayer,
  width: number,
  height: number,
  pad: number,
  verticalAlign: "top" | "center" | "bottom"
): ShapeTextFitResult | null {
  const contentW = Math.max(1, width - pad * 2);
  const contentH = Math.max(1, height - pad * 2);
  const fit = fitTextToBox(layer, contentW, contentH, { padding: 0 });
  if (fit.lines.length === 0) return null;
  const lineHeight = Math.max(1, fit.fontSize * layer.lineHeight);
  const totalHeight = fit.lines.length * lineHeight;
  let top = pad;
  const slack = contentH - totalHeight;
  if (slack > 0) {
    if (verticalAlign === "center") top = pad + slack / 2;
    else if (verticalAlign === "bottom") top = pad + slack;
  }
  const lines: ShapeFittedLine[] = fit.lines.map((text, index) => ({
    text,
    x: pad,
    y: top + index * lineHeight,
    maxWidth: contentW
  }));
  return { fontSize: fit.fontSize, lineHeight, lines, overflows: fit.overflows };
}

function scaleLayout(layout: ShapeTextFitResult, factor: number): ShapeTextFitResult {
  if (factor === 1) return layout;
  return {
    fontSize: layout.fontSize * factor,
    lineHeight: layout.lineHeight * factor,
    overflows: layout.overflows,
    lines: layout.lines.map((line) => ({
      text: line.text,
      x: line.x * factor,
      y: line.y * factor,
      maxWidth: line.maxWidth * factor
    }))
  };
}

function buildFrameOccupancy(
  width: number,
  height: number,
  input: FrameTextRenderInput
): { occupancy: ReturnType<typeof buildOccupancyFromAlpha>; scale: number } | null {
  const scale = Math.min(1, MAX_OCCUPANCY_DIM / Math.max(width, height));
  const occW = Math.max(1, Math.round(width * scale));
  const occH = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = occW;
  canvas.height = occH;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;
  ctx.scale(scale, scale);

  if (input.maskImage != null) {
    try {
      ctx.drawImage(input.maskImage, 0, 0, width, height);
    } catch {
      return null;
    }
  } else if (input.drawClip !== undefined) {
    ctx.fillStyle = "#000";
    ctx.beginPath();
    input.drawClip(ctx);
    ctx.fill();
  } else {
    // No shape info — treat the whole rect as inside.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
  }

  const imageData = ctx.getImageData(0, 0, occW, occH);
  return { occupancy: buildOccupancyFromAlpha(imageData.data, occW, occH), scale };
}

/**
 * Render a shape-fitted text layout (from fitTextInShape) onto a canvas sized to the host
 * frame's content rect. Coordinates in `layout` are in the same pixel space as `width`/`height`.
 * V1 supports fill / stroke / shadow (reusing warpText's drawCharAt); post effects are skipped.
 *
 * The returned canvas is meant to be drawn inside the frame's existing clip/mask group, so it
 * does not need to clip to the shape itself.
 */
export function renderShapeFittedTextToCanvas(
  layer: TextLayer,
  layout: ShapeTextFitResult,
  width: number,
  height: number
): HTMLCanvasElement | null {
  if (layout.lines.length === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;

  // Render every line at the fitted font size by cloning the layer's font metrics.
  const sizedLayer: TextLayer = { ...layer, fontSize: layout.fontSize };
  const fontStr = buildFontString(sizedLayer);
  setupCtx(ctx, sizedLayer, fontStr);
  ctx.textBaseline = "middle";

  const rtl = isRTLText(layer, layer.text);
  const canvasAlign = resolveAlign(layer.alignment, rtl);
  ctx.textAlign = canvasAlign;
  ctx.direction = rtl ? "rtl" : "ltr";

  for (const line of layout.lines) {
    const baselineY = line.y + layout.lineHeight / 2;
    let anchorX: number;
    if (canvasAlign === "left") {
      anchorX = line.x;
    } else if (canvasAlign === "right") {
      anchorX = line.x + line.maxWidth;
    } else {
      anchorX = line.x + line.maxWidth / 2;
    }
    drawCharAt(ctx, sizedLayer, line.text, anchorX, baselineY);
  }

  return canvas;
}

function resolveAlign(alignment: TextLayer["alignment"], rtl: boolean): "left" | "right" | "center" {
  switch (alignment) {
    case "center":
      return "center";
    case "left":
      return "left";
    case "right":
      return "right";
    default:
      return rtl ? "right" : "left";
  }
}

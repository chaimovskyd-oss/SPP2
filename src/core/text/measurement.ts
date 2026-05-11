import type { TextLayer, VisualLayer } from "@/types/layers";
import type { Rect } from "@/types/primitives";

const MIN_TEXT_WIDTH = 18;
const MIN_TEXT_HEIGHT = 18;

export function measureTextLayerSize(layer: TextLayer, text = layer.text): { width: number; height: number } {
  const lines = (text || " ").split(/\r?\n/);
  const fontSize = Math.max(1, layer.fontSize);
  const lineHeightPx = fontSize * layer.lineHeight;
  const padding = Math.max(4, (layer.stroke?.width ?? 0) * 2 + (layer.shadow?.blur ?? 0) * 0.25);
  const measuredWidths = lines.map((line) => measureLineWidth(line || " ", layer));
  const width = Math.ceil(Math.max(MIN_TEXT_WIDTH, ...measuredWidths) + padding * 2);
  const height = Math.ceil(Math.max(MIN_TEXT_HEIGHT, lines.length * lineHeightPx) + padding * 2);
  return { width, height };
}

export function getVisualLayerBounds(layer: VisualLayer): Rect {
  if (layer.type === "text") {
    const size = measureTextLayerSize(layer);
    return {
      x: layer.x,
      y: layer.y,
      width: size.width,
      height: size.height
    };
  }
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function normalizeRect(start: { x: number; y: number }, end: { x: number; y: number }): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function measureLineWidth(text: string, layer: TextLayer): number {
  const canvas = getMeasureCanvas();
  if (canvas !== null) {
    const context = canvas.getContext("2d");
    if (context !== null) {
      context.font = `${layer.fontStyle} ${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
      context.direction = layer.direction === "ltr" ? "ltr" : "rtl";
      return context.measureText(text).width + Math.max(0, text.length - 1) * layer.letterSpacing;
    }
  }
  return text.length * layer.fontSize * 0.58 + Math.max(0, text.length - 1) * layer.letterSpacing;
}

function getMeasureCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.createElement("canvas");
}

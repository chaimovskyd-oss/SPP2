import type { TextLayer, VisualLayer } from "@/types/layers";
import type { Rect } from "@/types/primitives";
import { hasRichText, richTextSegmentsForRange } from "./richText";
import { layoutSmartTextBlock } from "./smartTextBlock";
import { measureLineWidth as measureStyledLineWidth } from "./smartTextFit";

const MIN_TEXT_WIDTH = 18;
const MIN_TEXT_HEIGHT = 18;

export function measureTextLayerSize(layer: TextLayer, text = layer.text): { width: number; height: number } {
  if (text === layer.text) {
    const smartBlock = layoutSmartTextBlock(layer);
    if (smartBlock !== null) {
      return { width: smartBlock.width, height: smartBlock.height };
    }
    if (hasRichText(layer)) {
      return measureRichTextLayerSize(layer);
    }
  }
  const lines = (text || " ").split(/\r?\n/);
  const fontSize = Math.max(1, layer.fontSize);
  const lineHeightPx = fontSize * layer.lineHeight;
  const padding = Math.max(4, (layer.stroke?.width ?? 0) * 2 + (layer.shadow?.blur ?? 0) * 0.25);
  const measuredWidths = lines.map((line) => measureLineWidth(line || " ", layer));
  const width = Math.ceil(Math.max(MIN_TEXT_WIDTH, ...measuredWidths) + padding * 2);
  const height = Math.ceil(Math.max(MIN_TEXT_HEIGHT, lines.length * lineHeightPx) + padding * 2);
  return { width, height };
}

function measureRichTextLayerSize(layer: TextLayer): { width: number; height: number } {
  let offset = 0;
  const lines = (layer.text || " ").split(/\r?\n/).map((text) => {
    const start = offset;
    const end = start + text.length;
    offset = end + 1;
    return { text, start, end };
  });
  const padding = Math.max(4, (layer.stroke?.width ?? 0) * 2 + (layer.shadow?.blur ?? 0) * 0.25);
  const measured = lines.map((line) => {
    const segments = richTextSegmentsForRange(layer, line.start, line.end);
    if (segments.length === 0) {
      return { width: measureLineWidth(line.text || " ", layer), height: layer.fontSize * layer.lineHeight };
    }
    const width = segments.reduce((sum, segment) => {
      const segLayer: TextLayer = {
        ...layer,
        fontFamily: segment.style.fontFamily ?? layer.fontFamily,
        fontWeight: segment.style.fontWeight ?? layer.fontWeight,
        fontStyle: segment.style.fontStyle ?? layer.fontStyle,
        fontSize: segment.style.fontSize ?? layer.fontSize,
        letterSpacing: segment.style.letterSpacing ?? layer.letterSpacing
      };
      return sum + measureStyledLineWidth(segment.text || " ", segLayer, segLayer.fontSize);
    }, 0);
    const tallest = Math.max(
      layer.fontSize,
      ...segments.map((segment) => segment.style.fontSize ?? layer.fontSize)
    );
    return { width, height: tallest * layer.lineHeight };
  });
  const width = Math.ceil(Math.max(MIN_TEXT_WIDTH, ...measured.map((line) => line.width)) + padding * 2);
  const height = Math.ceil(Math.max(MIN_TEXT_HEIGHT, measured.reduce((sum, line) => sum + line.height, 0)) + padding * 2);
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

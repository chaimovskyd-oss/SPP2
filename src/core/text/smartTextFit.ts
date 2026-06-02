import type { Page } from "@/types/document";
import type { TextLayer } from "@/types/layers";

export type SmartTextFitMode = "wrap" | "shrink" | "balanced";

export interface TextFitSafeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextOverflowResult {
  overflows: boolean;
  outsidePage: boolean;
  contentOverflows: boolean;
  measuredWidth: number;
  measuredHeight: number;
  lineCount: number;
  safeRect: TextFitSafeRect;
}

export interface TextFitResult {
  layer: TextLayer;
  overflows: boolean;
  measuredWidth: number;
  measuredHeight: number;
  lineCount: number;
  mode: SmartTextFitMode;
}

export interface FitTextToBoxOptions {
  /** Inner padding subtracted from the usable width/height. Defaults to BOX_PADDING. */
  padding?: number;
  minFontSize?: number;
  maxFontSize?: number;
}

export interface FitTextToBoxResult {
  fontSize: number;
  lines: string[];
  widestLine: number;
  totalHeight: number;
  overflows: boolean;
}

interface MeasureResult {
  measuredWidth: number;
  measuredHeight: number;
  lineCount: number;
  widestLine: number;
  lines: string[];
}

const MIN_FONT_SIZE = 10;
const DEFAULT_MAX_FONT_SIZE = 90;
const SAFE_MARGIN_RATIO = 0.06;
const SAFE_MARGIN_MIN = 24;
const BOX_PADDING = 12;

export function getTextFitSafeRect(page: Pick<Page, "width" | "height">): TextFitSafeRect {
  const marginX = Math.max(SAFE_MARGIN_MIN, Math.round(page.width * SAFE_MARGIN_RATIO));
  const marginY = Math.max(SAFE_MARGIN_MIN, Math.round(page.height * SAFE_MARGIN_RATIO));
  return {
    x: marginX,
    y: marginY,
    width: Math.max(1, page.width - marginX * 2),
    height: Math.max(1, page.height - marginY * 2)
  };
}

/**
 * Generic box fit: shrink the font (binary search) so the layer's text wraps inside an
 * arbitrary boxWidth × boxHeight rectangle. Container-agnostic — used by frame "fitBox" mode.
 * Does not mutate the layer; returns the chosen font size and wrapped lines.
 */
export function fitTextToBox(
  layer: TextLayer,
  boxWidth: number,
  boxHeight: number,
  options: FitTextToBoxOptions = {}
): FitTextToBoxResult {
  const padding = Math.max(0, options.padding ?? BOX_PADDING);
  const minFontSize = Math.max(1, options.minFontSize ?? MIN_FONT_SIZE);
  const maxFontSize = Math.max(minFontSize, options.maxFontSize ?? Math.max(layer.fontSize, DEFAULT_MAX_FONT_SIZE));
  const width = Math.max(1, boxWidth);
  const height = Math.max(1, boxHeight);
  const fitted = fitFontSize(layer, width, height, minFontSize, maxFontSize, padding);
  return {
    fontSize: fitted.fontSize,
    lines: fitted.measure.lines,
    widestLine: fitted.measure.widestLine,
    totalHeight: fitted.measure.measuredHeight,
    overflows: fitted.overflows
  };
}

export function detectTextOverflow(layer: TextLayer, page: Pick<Page, "width" | "height">): TextOverflowResult {
  const safeRect = getTextFitSafeRect(page);
  const boxWidth = Math.max(1, layer.width);
  const boxHeight = Math.max(1, layer.height);
  const measured = measureTextInBox(layer, boxWidth, layer.fontSize);
  const outsidePage =
    layer.x < safeRect.x ||
    layer.y < safeRect.y ||
    layer.x + boxWidth > safeRect.x + safeRect.width ||
    layer.y + boxHeight > safeRect.y + safeRect.height;
  const contentOverflows = measured.measuredHeight > boxHeight || measured.widestLine > Math.max(1, boxWidth - BOX_PADDING * 2);

  return {
    overflows: outsidePage || contentOverflows,
    outsidePage,
    contentOverflows,
    measuredWidth: measured.measuredWidth,
    measuredHeight: measured.measuredHeight,
    lineCount: measured.lineCount,
    safeRect
  };
}

export function fitTextToPageBox(
  layer: TextLayer,
  page: Pick<Page, "width" | "height">,
  mode: SmartTextFitMode
): TextFitResult {
  const safeRect = getTextFitSafeRect(page);
  const minFontSize = MIN_FONT_SIZE;
  const maxFontSize = Math.max(minFontSize, Math.min(240, Math.max(layer.fontSize, DEFAULT_MAX_FONT_SIZE)));

  if (mode === "shrink") {
    const box = clampBoxToSafeRect(
      { x: layer.x, y: layer.y, width: Math.min(layer.width, safeRect.width), height: Math.min(layer.height, safeRect.height) },
      safeRect
    );
    const fitted = fitFontSize(layer, box.width, box.height, minFontSize, Math.min(layer.fontSize, maxFontSize));
    return resultFor(layer, box, fitted.fontSize, fitted.measure, fitted.overflows, mode);
  }

  if (mode === "wrap") {
    const box = {
      x: safeRect.x,
      y: safeRect.y,
      width: safeRect.width,
      height: safeRect.height
    };
    const atCurrentSize = measureTextInBox(layer, box.width, layer.fontSize);
    const needsShrink = atCurrentSize.measuredHeight > box.height || atCurrentSize.widestLine > box.width - BOX_PADDING * 2;
    const fontSize = needsShrink
      ? fitFontSize(layer, box.width, box.height, minFontSize, Math.min(layer.fontSize, maxFontSize)).fontSize
      : layer.fontSize;
    const measure = measureTextInBox(layer, box.width, fontSize);
    const overflows = measure.measuredHeight > box.height || measure.widestLine > box.width - BOX_PADDING * 2;
    return resultFor(layer, centerMeasuredBox(box, measure), fontSize, measure, overflows, mode, true);
  }

  const widthRatios = [0.5, 0.58, 0.66, 0.74, 0.82, 0.9, 1];
  let best: { box: TextFitSafeRect; fontSize: number; measure: MeasureResult; overflows: boolean; score: number } | null = null;

  for (const ratio of widthRatios) {
    const width = Math.max(1, Math.round(safeRect.width * ratio));
    const fitted = fitFontSize(layer, width, safeRect.height, minFontSize, maxFontSize);
    const linePenalty = Math.abs(fitted.measure.lineCount - idealLineCount(layer.text));
    const widthPenalty = Math.abs(ratio - 0.82) * 8;
    const overflowPenalty = fitted.overflows ? 10000 : 0;
    const score = fitted.fontSize * 100 - linePenalty * 4 - widthPenalty - overflowPenalty;
    const boxHeight = Math.min(safeRect.height, Math.max(1, Math.ceil(fitted.measure.measuredHeight)));
    const box = {
      x: Math.round(safeRect.x + (safeRect.width - width) / 2),
      y: Math.round(safeRect.y + (safeRect.height - boxHeight) / 2),
      width,
      height: boxHeight
    };
    if (best === null || score > best.score) {
      best = { box, fontSize: fitted.fontSize, measure: fitted.measure, overflows: fitted.overflows, score };
    }
  }

  const selected = best ?? {
    box: safeRect,
    fontSize: minFontSize,
    measure: measureTextInBox(layer, safeRect.width, minFontSize),
    overflows: true,
    score: Number.NEGATIVE_INFINITY
  };
  return resultFor(layer, selected.box, selected.fontSize, selected.measure, selected.overflows, mode, true);
}

function resultFor(
  layer: TextLayer,
  box: TextFitSafeRect,
  fontSize: number,
  measure: MeasureResult,
  overflows: boolean,
  mode: SmartTextFitMode,
  applyLineBreaks = false
): TextFitResult {
  return {
    layer: {
      ...layer,
      text: applyLineBreaks ? measure.lines.join("\n") : layer.text,
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      fontSize,
      overflowPolicy: "auto_shrink"
    },
    overflows,
    measuredWidth: measure.measuredWidth,
    measuredHeight: measure.measuredHeight,
    lineCount: measure.lineCount,
    mode
  };
}

function fitFontSize(
  layer: TextLayer,
  boxWidth: number,
  boxHeight: number,
  minFontSize: number,
  maxFontSize: number,
  padding = BOX_PADDING
): { fontSize: number; measure: MeasureResult; overflows: boolean } {
  let lo = minFontSize;
  let hi = Math.max(minFontSize, Math.round(maxFontSize));
  let bestFont = minFontSize;
  let bestMeasure = measureTextInBox(layer, boxWidth, minFontSize, padding);

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const measure = measureTextInBox(layer, boxWidth, mid, padding);
    const fits = measure.measuredHeight <= boxHeight && measure.widestLine <= Math.max(1, boxWidth - padding * 2);
    if (fits) {
      bestFont = mid;
      bestMeasure = measure;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const overflows = bestMeasure.measuredHeight > boxHeight || bestMeasure.widestLine > Math.max(1, boxWidth - padding * 2);
  return { fontSize: bestFont, measure: bestMeasure, overflows };
}

function measureTextInBox(layer: TextLayer, boxWidth: number, fontSize: number, padding = BOX_PADDING): MeasureResult {
  const usableWidth = Math.max(1, boxWidth - padding * 2);
  const lines = wrapText(layer.text, layer, fontSize, usableWidth);
  const widths = lines.map((line) => measureLineWidth(line || " ", layer, fontSize));
  const widestLine = Math.max(0, ...widths);
  return {
    measuredWidth: Math.ceil(widestLine + padding * 2),
    measuredHeight: Math.ceil(lines.length * fontSize * layer.lineHeight + padding * 2),
    lineCount: lines.length,
    widestLine,
    lines
  };
}

function wrapText(text: string, layer: TextLayer, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = (text || " ").split(/\r?\n/);

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      const pieces = splitLongWord(word, layer, fontSize, maxWidth);
      for (const piece of pieces) {
        const candidate = current ? `${current} ${piece}` : piece;
        if (measureLineWidth(candidate, layer, fontSize) <= maxWidth || current.length === 0) {
          current = candidate;
        } else {
          lines.push(current);
          current = piece;
        }
      }
    }
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function splitLongWord(word: string, layer: TextLayer, fontSize: number, maxWidth: number): string[] {
  if (measureLineWidth(word, layer, fontSize) <= maxWidth) return [word];
  const chars = Array.from(word);
  const pieces: string[] = [];
  let current = "";
  for (const char of chars) {
    const candidate = current + char;
    if (current.length > 0 && measureLineWidth(candidate, layer, fontSize) > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) pieces.push(current);
  return pieces.length > 0 ? pieces : [word];
}

export function measureLineWidth(text: string, layer: TextLayer, fontSize: number): number {
  const canvas = getMeasureCanvas();
  if (canvas !== null) {
    const context = canvas.getContext("2d");
    if (context !== null) {
      context.font = `${layer.fontStyle} ${layer.fontWeight} ${fontSize}px ${layer.fontFamily}`;
      context.direction = layer.direction === "ltr" ? "ltr" : "rtl";
      return context.measureText(text).width + Math.max(0, text.length - 1) * layer.letterSpacing;
    }
  }
  return text.length * fontSize * 0.58 + Math.max(0, text.length - 1) * layer.letterSpacing;
}

function clampBoxToSafeRect(box: TextFitSafeRect, safeRect: TextFitSafeRect): TextFitSafeRect {
  const width = Math.min(box.width, safeRect.width);
  const height = Math.min(box.height, safeRect.height);
  return {
    x: Math.min(safeRect.x + safeRect.width - width, Math.max(safeRect.x, box.x)),
    y: Math.min(safeRect.y + safeRect.height - height, Math.max(safeRect.y, box.y)),
    width,
    height
  };
}

function centerMeasuredBox(box: TextFitSafeRect, measure: MeasureResult): TextFitSafeRect {
  const width = box.width;
  const height = Math.min(box.height, Math.max(1, Math.ceil(measure.measuredHeight)));
  return {
    x: Math.round(box.x + (box.width - width) / 2),
    y: Math.round(box.y + (box.height - height) / 2),
    width,
    height
  };
}

function idealLineCount(text: string): number {
  const length = text.trim().length;
  if (length < 120) return 4;
  if (length < 300) return 7;
  if (length < 650) return 11;
  return 16;
}

function getMeasureCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  return document.createElement("canvas");
}

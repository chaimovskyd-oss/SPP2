import type { TextLayer } from "@/types/layers";
import type { RichTextInlineStyle, RichTextRange } from "@/types/text";

export interface TextSelectionRange {
  start: number;
  end: number;
}

export interface RichTextSegment {
  start: number;
  end: number;
  text: string;
  style: RichTextInlineStyle;
}

type RichStyleKey = keyof RichTextInlineStyle;

const INLINE_STYLE_KEYS: RichStyleKey[] = [
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "fontSize",
  "letterSpacing",
  "color",
  "fillOpacity"
];

export function hasRichText(layer: TextLayer): boolean {
  return normalizeRichTextRanges(layer).length > 0;
}

export function clampTextSelection(selection: TextSelectionRange, textLength: number): TextSelectionRange | null {
  const start = clampIndex(Math.min(selection.start, selection.end), textLength);
  const end = clampIndex(Math.max(selection.start, selection.end), textLength);
  return end > start ? { start, end } : null;
}

export function applyRichTextStyleToRange(
  layer: TextLayer,
  selection: TextSelectionRange,
  patch: RichTextInlineStyle
): TextLayer {
  const range = clampTextSelection(selection, layer.text.length);
  if (range === null) return layer;

  const boundaries = new Set<number>([0, layer.text.length, range.start, range.end]);
  for (const existing of normalizeRichTextRanges(layer)) {
    boundaries.add(existing.start);
    boundaries.add(existing.end);
  }
  const points = [...boundaries].filter((point) => point >= 0 && point <= layer.text.length).sort((a, b) => a - b);
  const nextRanges: RichTextRange[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index] ?? 0;
    const end = points[index + 1] ?? start;
    if (end <= start) continue;
    const current = styleAt(layer, start);
    const style = rangesOverlap({ start, end }, range) ? { ...current, ...patch } : current;
    const diff = diffFromLayerBase(layer, style);
    if (Object.keys(diff).length > 0) {
      const previous = nextRanges[nextRanges.length - 1];
      if (previous !== undefined && previous.end === start && sameInlineStyle(previous.style, diff)) {
        previous.end = end;
      } else {
        nextRanges.push({ version: 1, start, end, style: diff });
      }
    }
  }

  return {
    ...layer,
    richText: {
      version: 1,
      ranges: nextRanges
    }
  };
}

export function pruneRichTextForText(layer: TextLayer): TextLayer {
  const ranges = normalizeRichTextRanges(layer);
  if (ranges.length === 0) return { ...layer, richText: undefined };
  return { ...layer, richText: { version: 1, ranges } };
}

export function richTextSegmentsForRange(layer: TextLayer, start: number, end: number): RichTextSegment[] {
  const range = clampTextSelection({ start, end }, layer.text.length);
  if (range === null) return [];
  const boundaries = new Set<number>([range.start, range.end]);
  for (const existing of normalizeRichTextRanges(layer)) {
    const s = Math.max(range.start, existing.start);
    const e = Math.min(range.end, existing.end);
    if (e > s) {
      boundaries.add(s);
      boundaries.add(e);
    }
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const segments: RichTextSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const s = points[index] ?? 0;
    const e = points[index + 1] ?? s;
    if (e <= s) continue;
    segments.push({
      start: s,
      end: e,
      text: layer.text.slice(s, e),
      style: styleAt(layer, s)
    });
  }
  return segments;
}

export function normalizeRichTextRanges(layer: TextLayer): RichTextRange[] {
  const textLength = layer.text.length;
  const raw = layer.richText?.ranges ?? [];
  return raw
    .map((range) => ({
      version: 1 as const,
      start: clampIndex(range.start, textLength),
      end: clampIndex(range.end, textLength),
      style: cleanInlineStyle(range.style)
    }))
    .filter((range) => range.end > range.start && Object.keys(range.style).length > 0)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function styleAt(layer: TextLayer, index: number): RichTextInlineStyle {
  const style: RichTextInlineStyle = {};
  for (const range of normalizeRichTextRanges(layer)) {
    if (range.start <= index && index < range.end) Object.assign(style, range.style);
  }
  return {
    fontFamily: style.fontFamily ?? layer.fontFamily,
    fontWeight: style.fontWeight ?? layer.fontWeight,
    fontStyle: style.fontStyle ?? layer.fontStyle,
    fontSize: style.fontSize ?? layer.fontSize,
    letterSpacing: style.letterSpacing ?? layer.letterSpacing,
    color: style.color ?? layer.color,
    fillOpacity: style.fillOpacity ?? layer.fillOpacity
  };
}

function diffFromLayerBase(layer: TextLayer, style: RichTextInlineStyle): RichTextInlineStyle {
  const diff: RichTextInlineStyle = {};
  if (style.fontFamily !== undefined && style.fontFamily !== layer.fontFamily) diff.fontFamily = style.fontFamily;
  if (style.fontWeight !== undefined && style.fontWeight !== layer.fontWeight) diff.fontWeight = style.fontWeight;
  if (style.fontStyle !== undefined && style.fontStyle !== layer.fontStyle) diff.fontStyle = style.fontStyle;
  if (style.fontSize !== undefined && style.fontSize !== layer.fontSize) diff.fontSize = style.fontSize;
  if (style.letterSpacing !== undefined && style.letterSpacing !== layer.letterSpacing) diff.letterSpacing = style.letterSpacing;
  if (style.color !== undefined && style.color !== layer.color) diff.color = style.color;
  if (style.fillOpacity !== undefined && style.fillOpacity !== layer.fillOpacity) diff.fillOpacity = style.fillOpacity;
  return diff;
}

function cleanInlineStyle(style: RichTextInlineStyle): RichTextInlineStyle {
  const clean: RichTextInlineStyle = {};
  for (const key of INLINE_STYLE_KEYS) {
    const value = style[key];
    if (value !== undefined) {
      (clean as Record<RichStyleKey, RichTextInlineStyle[RichStyleKey]>)[key] = value;
    }
  }
  return clean;
}

function sameInlineStyle(a: RichTextInlineStyle, b: RichTextInlineStyle): boolean {
  return INLINE_STYLE_KEYS.every((key) => a[key] === b[key]);
}

function rangesOverlap(a: TextSelectionRange, b: TextSelectionRange): boolean {
  return a.start < b.end && b.start < a.end;
}

function clampIndex(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
}

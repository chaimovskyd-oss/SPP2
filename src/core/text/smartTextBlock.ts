import type { TextLayer } from "@/types/layers";
import type { JsonValue } from "@/types/primitives";
import { measureLineWidth } from "./smartTextFit";

export interface SmartTextBlockSettings {
  version: 1;
  enabled: boolean;
  strength: number;
  autoEmphasis: boolean;
  minScale: number;
  maxScale: number;
}

export interface SmartTextBlockLineLayout {
  text: string;
  start: number;
  end: number;
  fontSize: number;
  letterSpacing: number;
  width: number;
  x: number;
  y: number;
  height: number;
  blank: boolean;
}

export interface SmartTextBlockLayout {
  lines: SmartTextBlockLineLayout[];
  width: number;
  height: number;
  targetWidth: number;
  settings: SmartTextBlockSettings;
}

export const SMART_TEXT_BLOCK_METADATA_KEY = "smartTextBlock";

export const DEFAULT_SMART_TEXT_BLOCK_SETTINGS: SmartTextBlockSettings = {
  version: 1,
  enabled: true,
  strength: 75,
  autoEmphasis: false,
  minScale: 0.6,
  maxScale: 3
};

const MIN_BLOCK_WIDTH = 18;
const MIN_BLOCK_HEIGHT = 18;
const TEXT_PADDING = 6;

export function readSmartTextBlockSettings(layer: TextLayer): SmartTextBlockSettings | null {
  const raw = layer.metadata?.[SMART_TEXT_BLOCK_METADATA_KEY];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, JsonValue>;
  return {
    version: 1,
    enabled: record.enabled !== false,
    strength: clampNumber(typeof record.strength === "number" ? record.strength : DEFAULT_SMART_TEXT_BLOCK_SETTINGS.strength, 0, 100),
    autoEmphasis: record.autoEmphasis === true,
    minScale: clampNumber(typeof record.minScale === "number" ? record.minScale : DEFAULT_SMART_TEXT_BLOCK_SETTINGS.minScale, 0.1, 1),
    maxScale: clampNumber(typeof record.maxScale === "number" ? record.maxScale : DEFAULT_SMART_TEXT_BLOCK_SETTINGS.maxScale, 1, 8)
  };
}

export function isSmartTextBlockEnabled(layer: TextLayer): boolean {
  return readSmartTextBlockSettings(layer)?.enabled === true;
}

export function withSmartTextBlockSettings(
  layer: TextLayer,
  patch: Partial<SmartTextBlockSettings> = {}
): TextLayer {
  const current = readSmartTextBlockSettings(layer) ?? DEFAULT_SMART_TEXT_BLOCK_SETTINGS;
  const settings: SmartTextBlockSettings = {
    ...current,
    ...patch,
    version: 1,
    enabled: patch.enabled ?? true,
    strength: clampNumber(patch.strength ?? current.strength, 0, 100),
    minScale: clampNumber(patch.minScale ?? current.minScale, 0.1, 1),
    maxScale: clampNumber(patch.maxScale ?? current.maxScale, 1, 8)
  };
  return {
    ...layer,
    alignment: "center",
    metadata: {
      ...layer.metadata,
      [SMART_TEXT_BLOCK_METADATA_KEY]: settings as unknown as JsonValue
    }
  };
}

export function withoutSmartTextBlock(layer: TextLayer): TextLayer {
  const { [SMART_TEXT_BLOCK_METADATA_KEY]: _smartTextBlock, ...metadata } = layer.metadata;
  void _smartTextBlock;
  return { ...layer, metadata };
}

export function layoutSmartTextBlock(layer: TextLayer): SmartTextBlockLayout | null {
  const settings = readSmartTextBlockSettings(layer);
  if (settings === null || !settings.enabled) return null;

  const rawLines = (layer.text || " ").split(/\r?\n/);
  const baseFontSize = Math.max(1, layer.fontSize);
  const strength = settings.strength / 100;
  let offset = 0;
  const measured = rawLines.map((text) => {
    const start = offset;
    const end = start + text.length;
    offset = end + 1;
    return {
      text,
      start,
      end,
      blank: text.trim().length === 0,
      width: text.trim().length === 0 ? 0 : measureLineWidth(text, layer, baseFontSize)
    };
  });
  const nonBlankWidths = measured.filter((line) => !line.blank).map((line) => line.width);
  const targetWidth = Math.max(1, ...nonBlankWidths);
  const minScale = Math.min(settings.minScale, settings.maxScale);
  const maxScale = Math.max(settings.maxScale, minScale);

  const planned = measured.map((line) => {
    if (line.blank) {
      const height = Math.max(4, baseFontSize * layer.lineHeight * 0.45);
      return { text: "", start: line.start, end: line.end, fontSize: baseFontSize, letterSpacing: layer.letterSpacing, width: 0, height, blank: true };
    }
    const rawScale = targetWidth / Math.max(1, line.width);
    const shortness = 1 - Math.min(1, line.width / targetWidth);
    const emphasisBoost = settings.autoEmphasis ? 1 + Math.min(0.25, shortness * 0.28) : 1;
    const desiredScale = clampNumber(rawScale * emphasisBoost, minScale, maxScale);
    const desiredWidth = line.width * (1 + (desiredScale - 1) * strength);
    const charCount = Array.from(line.text).filter((char) => !/\s/.test(char)).length;
    const fontShare = fontShareForLine(charCount, shortness);
    const scale = 1 + (desiredScale - 1) * strength * fontShare;
    const fontSize = Math.max(1, baseFontSize * scale);
    const naturalWidth = measureLineWidth(line.text, layer, fontSize);
    const gapCount = Math.max(0, Array.from(line.text).length - 1);
    const letterSpacing = resolveLineLetterSpacing({
      baseLetterSpacing: layer.letterSpacing,
      desiredWidth,
      fontSize,
      gapCount,
      naturalWidth,
      strength
    });
    const width = measureLineWidthWithSpacing(line.text, layer, fontSize, letterSpacing);
    const height = fontSize * layer.lineHeight;
    return { text: line.text, start: line.start, end: line.end, fontSize, letterSpacing, width, height, blank: false };
  });

  const visibleWidths = planned.filter((line) => !line.blank).map((line) => line.width);
  const width = Math.ceil(Math.max(MIN_BLOCK_WIDTH, ...visibleWidths) + TEXT_PADDING * 2);
  const avgFont = average(planned.filter((line) => !line.blank).map((line) => line.fontSize)) ?? baseFontSize;
  let cursorY = TEXT_PADDING;
  const lines: SmartTextBlockLineLayout[] = [];

  for (let index = 0; index < planned.length; index += 1) {
    const line = planned[index];
    if (index > 0) {
      const previous = planned[index - 1];
      const rhythm = line.blank || previous?.blank
        ? avgFont * 0.12
        : (Math.max(previous?.fontSize ?? avgFont, line.fontSize) / avgFont) * baseFontSize * 0.08 * strength;
      cursorY += Math.max(0, rhythm);
    }
    lines.push({
      ...line,
      fontSize: Math.round(line.fontSize * 100) / 100,
      letterSpacing: Math.round(line.letterSpacing * 100) / 100,
      width: Math.round(line.width * 100) / 100,
      height: Math.round(line.height * 100) / 100,
      x: Math.round(((width - line.width) / 2) * 100) / 100,
      y: Math.round(cursorY * 100) / 100
    });
    cursorY += line.height;
  }

  return {
    lines,
    width,
    height: Math.ceil(Math.max(MIN_BLOCK_HEIGHT, cursorY + TEXT_PADDING)),
    targetWidth,
    settings
  };
}

function fontShareForLine(charCount: number, shortness: number): number {
  if (charCount <= 2) return 0.92;
  if (charCount <= 4) return 0.84;
  if (charCount <= 7) return 0.74;
  return clampNumber(0.68 - shortness * 0.08, 0.58, 0.72);
}

function resolveLineLetterSpacing(input: {
  baseLetterSpacing: number;
  desiredWidth: number;
  fontSize: number;
  gapCount: number;
  naturalWidth: number;
  strength: number;
}): number {
  if (input.gapCount <= 0 || input.strength <= 0) return input.baseLetterSpacing;
  const neededExtra = (input.desiredWidth - input.naturalWidth) / input.gapCount;
  const maxExtraEm = input.gapCount <= 2 ? 0.12 : input.gapCount <= 5 ? 0.16 : 0.19;
  const maxExtra = Math.min(22, input.fontSize * maxExtraEm) * input.strength;
  const minTotal = -input.fontSize * 0.035;
  const maxTotal = Math.min(24, input.fontSize * 0.24);
  const extra = clampNumber(neededExtra, -Math.max(0, input.baseLetterSpacing - minTotal), maxExtra);
  return clampNumber(input.baseLetterSpacing + extra, minTotal, maxTotal);
}

function measureLineWidthWithSpacing(text: string, layer: TextLayer, fontSize: number, letterSpacing: number): number {
  if (letterSpacing === layer.letterSpacing) return measureLineWidth(text, layer, fontSize);
  return measureLineWidth(text, { ...layer, letterSpacing }, fontSize);
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

import type { TextLayer } from "@/types/layers";
import { measureLineWidth } from "./smartTextFit";

/**
 * Per-line shape fitting: flow text into an arbitrary shape (heart, star, cloud, alpha mask…)
 * by computing the free horizontal span available on each text row and wrapping words to it.
 *
 * The engine is container-agnostic: it consumes a sampled occupancy grid (one byte per cell,
 * value > 0 = inside the shape) in the same pixel coordinate space as the desired output. The
 * caller builds that grid by rendering its existing clip shape / alpha mask to an offscreen
 * canvas — so there is no duplicate shape math and the visual clip and the fit stay in sync.
 */
export interface ShapeOccupancy {
  width: number;
  height: number;
  /** Row-major, one byte per cell. Value > 0 means the cell is inside the shape. */
  data: Uint8ClampedArray;
}

export interface ShapeTextFitOptions {
  /** Inner inset (px) kept clear on every side of each line. */
  padding?: number;
  density?: "relaxed" | "normal" | "tight";
  verticalAlign?: "top" | "center" | "bottom";
  minFontSize?: number;
  maxFontSize?: number;
}

export interface ShapeFittedLine {
  text: string;
  /** Left edge of the line's available span, in occupancy pixel coords. */
  x: number;
  /** Top of the line band, in occupancy pixel coords. */
  y: number;
  /** Available width of the span the line was fitted into. */
  maxWidth: number;
}

export interface ShapeTextFitResult {
  fontSize: number;
  /** Vertical advance between line tops, in px. */
  lineHeight: number;
  lines: ShapeFittedLine[];
  overflows: boolean;
}

const DEFAULT_MIN_FONT = 8;
const DEFAULT_MAX_FONT = 240;
const DEFAULT_PADDING = 8;
const BAND_SAMPLES: number = 5;

const DENSITY_FACTOR: Record<NonNullable<ShapeTextFitOptions["density"]>, number> = {
  relaxed: 1.18,
  normal: 1,
  tight: 0.86
};

/** Build an occupancy grid from a canvas ImageData alpha channel (alpha > threshold = inside). */
export function buildOccupancyFromAlpha(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 8
): ShapeOccupancy {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i += 1) {
    data[i] = (alpha[i * 4 + 3] ?? 0) > threshold ? 1 : 0;
  }
  return { width, height, data };
}

export function fitTextInShape(
  layer: TextLayer,
  occupancy: ShapeOccupancy,
  options: ShapeTextFitOptions = {}
): ShapeTextFitResult {
  const padding = Math.max(0, options.padding ?? DEFAULT_PADDING);
  const minFont = Math.max(1, options.minFontSize ?? DEFAULT_MIN_FONT);
  const maxFont = Math.max(minFont, options.maxFontSize ?? DEFAULT_MAX_FONT);
  const densityFactor = DENSITY_FACTOR[options.density ?? "normal"];
  const verticalAlign = options.verticalAlign ?? "center";

  const words = tokenize(layer.text);

  // Binary search the largest font size that flows all words inside the shape.
  let lo = minFont;
  let hi = Math.round(maxFont);
  let best: ShapeTextFitResult | null = null;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const attempt = layoutAtFontSize(layer, occupancy, words, mid, padding, densityFactor, verticalAlign);
    if (!attempt.overflows) {
      best = attempt;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best !== null) {
    return best;
  }

  // Nothing fit cleanly — return the smallest size laid out as far as it goes.
  return layoutAtFontSize(layer, occupancy, words, minFont, padding, densityFactor, verticalAlign);
}

function layoutAtFontSize(
  layer: TextLayer,
  occupancy: ShapeOccupancy,
  words: string[],
  fontSize: number,
  padding: number,
  densityFactor: number,
  verticalAlign: NonNullable<ShapeTextFitOptions["verticalAlign"]>
): ShapeTextFitResult {
  const lineHeight = Math.max(1, fontSize * layer.lineHeight * densityFactor);
  const vExtent = verticalExtent(occupancy);

  if (vExtent === null) {
    return { fontSize, lineHeight, lines: [], overflows: words.length > 0 };
  }

  const shapeTop = vExtent.top;
  const shapeBottom = vExtent.bottom;
  const usableHeight = shapeBottom - shapeTop;
  const rowCapacity = Math.max(0, Math.floor(usableHeight / lineHeight));

  if (rowCapacity === 0) {
    return { fontSize, lineHeight, lines: [], overflows: words.length > 0 };
  }

  // Pass 1: top-aligned wrap to learn how many rows the text actually uses.
  const firstPass = wrapIntoRows(layer, occupancy, words, fontSize, padding, lineHeight, shapeTop, rowCapacity);

  // Pass 2: re-anchor vertically (center/bottom) and re-wrap so spans match the new row positions.
  const usedRows = Math.max(1, firstPass.lines.length);
  let offsetTop = shapeTop;
  if (!firstPass.overflows) {
    const slack = usableHeight - usedRows * lineHeight;
    if (verticalAlign === "center") {
      offsetTop = shapeTop + slack / 2;
    } else if (verticalAlign === "bottom") {
      offsetTop = shapeTop + slack;
    }
  }

  const finalPass =
    offsetTop === shapeTop
      ? firstPass
      : wrapIntoRows(layer, occupancy, words, fontSize, padding, lineHeight, offsetTop, rowCapacity);

  return { fontSize, lineHeight, lines: finalPass.lines, overflows: finalPass.overflows };
}

function wrapIntoRows(
  layer: TextLayer,
  occupancy: ShapeOccupancy,
  words: string[],
  fontSize: number,
  padding: number,
  lineHeight: number,
  topOffset: number,
  rowCapacity: number
): { lines: ShapeFittedLine[]; overflows: boolean } {
  const lines: ShapeFittedLine[] = [];
  let wordIndex = 0;

  for (let row = 0; row < rowCapacity && wordIndex < words.length; row += 1) {
    const bandTop = topOffset + row * lineHeight;
    const span = bandSpan(occupancy, bandTop, bandTop + lineHeight, padding);
    if (span === null || span.width < 1) {
      continue;
    }

    let current = "";
    while (wordIndex < words.length) {
      const candidate = current.length > 0 ? `${current} ${words[wordIndex]}` : words[wordIndex]!;
      if (measureLineWidth(candidate, layer, fontSize) <= span.width || current.length === 0) {
        current = candidate;
        wordIndex += 1;
      } else {
        break;
      }
    }

    if (current.length === 0) {
      // A single word is wider than this row's span — let outer loop try a wider row,
      // but if no row can hold it the font is too big (handled via overflow below).
      continue;
    }

    lines.push({ text: current, x: span.xStart, y: bandTop, maxWidth: span.width });
  }

  return { lines, overflows: wordIndex < words.length };
}

function tokenize(text: string): string[] {
  return (text || "").split(/\s+/).filter((token) => token.length > 0);
}

function verticalExtent(occ: ShapeOccupancy): { top: number; bottom: number } | null {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < occ.height; y += 1) {
    if (rowHasInside(occ, y)) {
      if (top === -1) top = y;
      bottom = y;
    }
  }
  return top === -1 ? null : { top, bottom: bottom + 1 };
}

function rowHasInside(occ: ShapeOccupancy, y: number): boolean {
  const base = y * occ.width;
  for (let x = 0; x < occ.width; x += 1) {
    if (occ.data[base + x]! > 0) return true;
  }
  return false;
}

/**
 * Conservative free span for a horizontal band: sample several scanlines across the band,
 * take the widest contiguous inside-run on each, then intersect them so glyphs never poke
 * outside the shape. Padding is applied on both sides.
 */
function bandSpan(
  occ: ShapeOccupancy,
  yTop: number,
  yBottom: number,
  padding: number
): { xStart: number; xEnd: number; width: number } | null {
  const top = Math.max(0, Math.floor(yTop));
  const bottom = Math.min(occ.height - 1, Math.ceil(yBottom) - 1);
  if (bottom < top) return null;

  let innerStart = Number.NEGATIVE_INFINITY;
  let innerEnd = Number.POSITIVE_INFINITY;
  let sampled = 0;

  for (let s = 0; s < BAND_SAMPLES; s += 1) {
    const y = BAND_SAMPLES === 1 ? top : Math.round(top + ((bottom - top) * s) / (BAND_SAMPLES - 1));
    const run = widestRun(occ, y);
    if (run === null) {
      // A sampled scanline is fully outside → the band cannot safely hold a full-width line.
      return null;
    }
    innerStart = Math.max(innerStart, run.xStart);
    innerEnd = Math.min(innerEnd, run.xEnd);
    sampled += 1;
  }

  if (sampled === 0) return null;
  const xStart = innerStart + padding;
  const xEnd = innerEnd - padding;
  const width = xEnd - xStart;
  return width > 0 ? { xStart, xEnd, width } : null;
}

/** Longest contiguous run of inside cells on scanline y, returned as [xStart, xEnd). */
function widestRun(occ: ShapeOccupancy, y: number): { xStart: number; xEnd: number } | null {
  const base = y * occ.width;
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  for (let x = 0; x <= occ.width; x += 1) {
    const inside = x < occ.width && occ.data[base + x]! > 0;
    if (inside) {
      if (curStart === -1) curStart = x;
    } else if (curStart !== -1) {
      const len = x - curStart;
      if (len > bestLen) {
        bestLen = len;
        bestStart = curStart;
      }
      curStart = -1;
    }
  }
  return bestLen > 0 ? { xStart: bestStart, xEnd: bestStart + bestLen } : null;
}

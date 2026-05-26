export interface TextAutoFitOptions {
  text: string;
  fontFamily: string;
  fontWeight: number;
  lineHeight: number;
  containerWidthPx: number;
  containerHeightPx: number;
  maxFontSize: number;
  minFontSize?: number;
  paddingPx?: number;
}

export interface TextAutoFitResult {
  fittedFontSize: number;
  overflows: boolean;
  measuredHeightPx: number;
  lineCount: number;
}

function getCanvas(): HTMLCanvasElement {
  return document.createElement("canvas");
}

export function wrapTextLines(
  text: string,
  fontFamily: string,
  fontWeight: number,
  fontSize: number,
  containerWidthPx: number
): string[] {
  const canvas = getCanvas();
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.direction = "rtl";

  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= containerWidthPx || current.length === 0) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function measureLineWidth(
  text: string,
  fontFamily: string,
  fontWeight: number,
  fontSize: number
): number {
  const canvas = getCanvas();
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.direction = "rtl";
  return ctx.measureText(text).width;
}

export function maxReadableBlessingFontSize(containerWidthPx: number, containerHeightPx: number): number {
  return Math.max(
    28,
    Math.round(Math.min(containerWidthPx * 0.14, containerHeightPx * 0.18))
  );
}

export function fitTextToContainer(opts: TextAutoFitOptions): TextAutoFitResult {
  const {
    text,
    fontFamily,
    fontWeight,
    lineHeight,
    containerWidthPx,
    containerHeightPx,
    maxFontSize,
    minFontSize = 12,
    paddingPx = 16
  } = opts;

  const usableW = Math.max(1, containerWidthPx - paddingPx * 2);
  const usableH = Math.max(1, containerHeightPx - paddingPx * 2);

  let lo = minFontSize;
  let hi = maxFontSize;
  let best = minFontSize;

  for (let i = 0; i < 12; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const lines = wrapTextLines(text, fontFamily, fontWeight, mid, usableW);
    const height = lines.length * mid * lineHeight;
    const widestLine = Math.max(...lines.map((line) => measureLineWidth(line, fontFamily, fontWeight, mid)));
    if (height <= usableH && widestLine <= usableW) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const finalLines = wrapTextLines(text, fontFamily, fontWeight, best, usableW);
  const measuredHeightPx = finalLines.length * best * lineHeight;
  const widestFinalLine = Math.max(...finalLines.map((line) => measureLineWidth(line, fontFamily, fontWeight, best)));
  const overflows = (measuredHeightPx > usableH || widestFinalLine > usableW) && best === minFontSize;

  return { fittedFontSize: best, overflows, measuredHeightPx, lineCount: finalLines.length };
}

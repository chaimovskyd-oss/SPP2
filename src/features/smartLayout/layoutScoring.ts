import { mmToPx } from "@/core/units/conversion";
import type { Rect } from "@/types/primitives";
import type { LayoutStyle, PhotoPackOptions, PlacedItem } from "./types";

/**
 * Score a packed page. Higher is better. Rewards page-area usage, optionally
 * rewards size uniformity, and heavily penalises min/max size violations.
 * `layoutStyle` re-weights area-vs-uniformity.
 */
export function scorePackedPage(items: PlacedItem[], usable: Rect, opts: PhotoPackOptions): number {
  if (items.length === 0) return -Infinity;
  const usableArea = Math.max(1, usable.width * usable.height);
  const areas = items.map((it) => it.widthPx * it.heightPx);
  const usedArea = areas.reduce((s, a) => s + a, 0) / usableArea;

  const mean = areas.reduce((s, a) => s + a, 0) / areas.length;
  const variance = areas.reduce((s, a) => s + (a - mean) ** 2, 0) / areas.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  const minPx = opts.minSizeMm > 0 ? mmToPx(opts.minSizeMm, opts.dpi) : 0;
  const maxPx = opts.maxSizeMm > 0 ? mmToPx(opts.maxSizeMm, opts.dpi) : Infinity;
  let minViol = 0;
  let maxViol = 0;
  for (const it of items) {
    const shortSide = Math.min(it.widthPx, it.heightPx);
    const longSide = Math.max(it.widthPx, it.heightPx);
    if (shortSide < minPx) minViol += 1;
    if (longSide > maxPx) maxViol += 1;
  }
  minViol /= items.length;
  maxViol /= items.length;

  const w = weightsFor(opts.layoutStyle);
  return w.area * usedArea - w.balance * cv - 6 * minViol - 6 * maxViol;
}

function weightsFor(style: LayoutStyle): { area: number; balance: number } {
  if (style === "uniform") return { area: 1.0, balance: 2.5 };
  if (style === "maximumArea") return { area: 3.0, balance: 0.2 };
  return { area: 1.6, balance: 1.0 }; // balanced
}

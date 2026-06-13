import { mmToPx } from "@/core/units/conversion";
import type { CellFeatherSettings } from "@/types/collage";

export const DEFAULT_CELL_FEATHER: CellFeatherSettings = {
  enabled: false,
  amountMm: 3,
  softness: 0.7
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function maxCellFeatherMm(shortestSideMm: number): number {
  return clamp(Math.min(20, shortestSideMm * 0.35), 0, 20);
}

export function normalizeCellFeather(
  input: Partial<CellFeatherSettings> | null | undefined,
  shortestSideMm = Number.POSITIVE_INFINITY
): CellFeatherSettings {
  const maxAmount = Number.isFinite(shortestSideMm) ? maxCellFeatherMm(shortestSideMm) : 20;
  return {
    enabled: input?.enabled === true,
    amountMm: clamp(finiteOr(input?.amountMm, DEFAULT_CELL_FEATHER.amountMm), 0, maxAmount),
    softness: clamp(finiteOr(input?.softness, DEFAULT_CELL_FEATHER.softness), 0, 1)
  };
}

export function cellFeatherAmountPx(settings: CellFeatherSettings, dpi: number): number {
  if (!settings.enabled || settings.amountMm <= 0) return 0;
  return mmToPx(settings.amountMm, dpi);
}

export function autoImageContinuityOverscanMm(featherMm: number, shortestSideMm: number): number {
  const maxAutoOverscanMm = Math.min(8, Math.max(0, shortestSideMm) * 0.12);
  return clamp(featherMm * 1.25, 0, maxAutoOverscanMm);
}

export function cellFeatherBlurPx(amountPx: number, softness: number): number {
  if (amountPx <= 0) return 0;
  return Math.max(0.25, amountPx * (0.35 + clamp(softness, 0, 1) * 0.9));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

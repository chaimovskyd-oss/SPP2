import type { Unit } from "@/types/primitives";

export type MaskDimensionUnit = Extract<Unit, "mm" | "cm" | "inch">;

export const MASK_DIMENSION_UNITS: MaskDimensionUnit[] = ["mm", "cm", "inch"];

export const MASK_DIMENSION_LABELS: Record<MaskDimensionUnit, string> = {
  mm: "מ״מ",
  cm: "ס״מ",
  inch: "אינץ'"
};

export function normalizeDecimalInput(value: string): string {
  return value.trim().replace(",", ".");
}

export function parseDraftDimension(value: string): number | null {
  const normalized = normalizeDecimalInput(value);
  if (normalized === "" || normalized === "." || normalized === "-" || normalized === "-.") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clampDimension(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function formatDimension(value: number, unit: MaskDimensionUnit): string {
  const decimals = unit === "inch" ? 3 : unit === "cm" ? 2 : 1;
  return Number(value.toFixed(decimals)).toString();
}

export function commitDraftDimension(value: string, fallback: number, min: number, max: number): number {
  const parsed = parseDraftDimension(value);
  if (parsed === null) return clampDimension(fallback, min, max);
  return clampDimension(parsed, min, max);
}

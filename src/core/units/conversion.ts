import type { Margins, Unit } from "@/types/primitives";

export const MM_PER_INCH = 25.4;

export function inchToPx(inches: number, dpi: number): number {
  return inches * dpi;
}

export function pxToInch(px: number, dpi: number): number {
  return px / dpi;
}

export function mmToPx(mm: number, dpi: number): number {
  return inchToPx(mm / MM_PER_INCH, dpi);
}

export function pxToMm(px: number, dpi: number): number {
  return pxToInch(px, dpi) * MM_PER_INCH;
}

export function cmToPx(cm: number, dpi: number): number {
  return mmToPx(cm * 10, dpi);
}

export function pxToCm(px: number, dpi: number): number {
  return pxToMm(px, dpi) / 10;
}

export function unitToPx(value: number, unit: Unit, dpi: number): number {
  if (unit === "px") {
    return value;
  }
  if (unit === "inch") {
    return inchToPx(value, dpi);
  }
  if (unit === "cm") {
    return cmToPx(value, dpi);
  }
  return mmToPx(value, dpi);
}

export function pxToUnit(px: number, unit: Unit, dpi: number): number {
  if (unit === "px") {
    return px;
  }
  if (unit === "inch") {
    return pxToInch(px, dpi);
  }
  if (unit === "cm") {
    return pxToCm(px, dpi);
  }
  return pxToMm(px, dpi);
}

export function marginsToPx(margins: Margins, unit: Unit, dpi: number): Margins {
  return {
    top: unitToPx(margins.top, unit, dpi),
    right: unitToPx(margins.right, unit, dpi),
    bottom: unitToPx(margins.bottom, unit, dpi),
    left: unitToPx(margins.left, unit, dpi)
  };
}

export function roundPx(value: number): number {
  return Math.round(value * 1000) / 1000;
}

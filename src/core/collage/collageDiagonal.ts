import { clipPolyToRect, insetPolygon, polygonToCollageSlot } from "./collageGeometryUtils";
import type { CollageSlot } from "@/types/collage";

export function buildDiagonalBands(
  n: number,
  shearAngleDeg: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number
): CollageSlot[] {
  if (n === 0) return [];
  const shear = Math.tan((shearAngleDeg * Math.PI) / 180);
  const rect = { x: 0, y: 0, w: canvasW, h: canvasH };

  return Array.from({ length: n }, (_, i) => {
    const xLeft = (i / n - shear / 2) * canvasW;
    const xRight = ((i + 1) / n - shear / 2) * canvasW;
    const shearPx = shear * canvasW;

    const vertices = [
      { x: xLeft, y: 0 },
      { x: xRight, y: 0 },
      { x: xRight + shearPx, y: canvasH },
      { x: xLeft + shearPx, y: canvasH }
    ];
    const clipped = clipPolyToRect(vertices, rect);
    const spaced = insetPolygon(clipped, spacingPx / 2);

    return polygonToCollageSlot(spaced, canvasW, canvasH, {
      shape: "diagonalPolygon",
    });
  }).filter((slot): slot is CollageSlot => Boolean(slot));
}

export function buildDiagonalLayouts(
  n: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number
): Array<{ name: string; slots: CollageSlot[] }> {
  if (n < 2) return [];
  return [
    { name: `סרטים אלכסוניים 12°`, slots: buildDiagonalBands(n, 12, canvasW, canvasH, spacingPx) },
    { name: `סרטים אלכסוניים 20°`, slots: buildDiagonalBands(n, 20, canvasW, canvasH, spacingPx) }
  ];
}

import { createCollageSlot } from "./collageFactory";
import type { CollageSlot } from "@/types/collage";

export function buildDiagonalBands(
  n: number,
  shearAngleDeg: number,
  canvasW: number,
  canvasH: number,
  spacingPx: number
): CollageSlot[] {
  if (n === 0) return [];
  const sX = spacingPx / canvasW;
  const shear = Math.tan((shearAngleDeg * Math.PI) / 180);

  return Array.from({ length: n }, (_, i) => {
    const xLeft = i / n - shear / 2;
    const xRight = (i + 1) / n - shear / 2;

    const vertices = [
      { x: clamp01(xLeft), y: 0 },
      { x: clamp01(xRight), y: 0 },
      { x: clamp01(xRight + shear), y: 1 },
      { x: clamp01(xLeft + shear), y: 1 }
    ];

    // Bounding box of vertices. Store vertices LOCAL to the slot bbox, not global page coords.
    // KonvaLayerNode expects normalized vertices inside the FrameLayer bounds.
    const xs = vertices.map((v) => v.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const x = minX;
    const w = Math.max(0.001, maxX - minX);
    const localVertices = vertices.map((v) => ({
      x: (v.x - minX) / w,
      y: v.y,
    }));

    return createCollageSlot({
      x,
      y: 0,
      w,
      h: 1,
      shape: "diagonalPolygon",
      shapeParams: { vertices: localVertices }
    });
  });
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
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

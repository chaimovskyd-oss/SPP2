import { createId } from "@/core/ids";
import { createCollageSlot } from "./collageFactory";
import { insetPolygon, isReadablePolygon, polygonToCollageSlot, type Pt } from "./collageGeometryUtils";
import type { CollageSlot } from "@/types/collage";

export type DynamicCollageLayoutStyle =
  | "modular-irregular-grid"
  | "hero-support"
  | "organic-flow"
  | "wave-ribbons"
  | "dynamic-strips"
  | "soft-polygons"
  | "amoeba-pack"
  | "radial-hero"
  | "freeform-clusters"
  | "soft-voronoi";

export type DynamicCollageCellRole = "hero" | "primary" | "support" | "accent" | "background";
export type DynamicCollageCellShape = "rect" | "rounded-rect" | "polygon" | "soft-polygon" | "wave-region" | "circle" | "capsule" | "custom-path";
export type DynamicCropPriority = "face" | "center" | "full-body" | "landscape" | "auto";

export interface LayoutStyleCapability {
  minImages: number;
  idealMin: number;
  idealMax: number;
  maxImages: number;
  fallbackStyle?: DynamicCollageLayoutStyle;
}

export interface DynamicCollageCell {
  id: string;
  role: DynamicCollageCellRole;
  shape: DynamicCollageCellShape;
  x: number;
  y: number;
  width: number;
  height: number;
  polygon?: Pt[];
  weight: number;
  preferredAspect?: number;
  minFaceScale?: number;
  cropPriority?: DynamicCropPriority;
  gapPx: number;
  borderRadius?: number;
  safeInsetPx?: number;
  locked?: boolean;
  editable?: boolean;
}

export interface DynamicCollageLayoutResult {
  style: DynamicCollageLayoutStyle;
  canvasWidth: number;
  canvasHeight: number;
  cells: DynamicCollageCell[];
  seed: string;
  warnings: string[];
  metadata: {
    imageCount: number;
    heroCount: number;
    averageCellArea: number;
    minCellArea: number;
    complexityScore: number;
  };
}

export interface LayoutGeneratorOptions {
  canvasW: number;
  canvasH: number;
  imageCount: number;
  spacingPx: number;
  marginPx: number;
  seed?: string;
  organicness?: number;
  heroStrength?: number;
  sizeVariation?: number;
}

export interface LayoutGenerator {
  style: DynamicCollageLayoutStyle;
  name: string;
  capability: LayoutStyleCapability;
  generate: (options: LayoutGeneratorOptions) => DynamicCollageLayoutResult;
}

export interface ValidationOptions {
  allowStripCells?: boolean;
  minAreaRatio?: number;
  minSideRatio?: number;
}

export function createDynamicLayoutResult(
  style: DynamicCollageLayoutStyle,
  options: LayoutGeneratorOptions,
  cells: DynamicCollageCell[],
  warnings: string[] = []
): DynamicCollageLayoutResult {
  const areas = cells.map((cell) => cell.width * cell.height);
  const totalArea = areas.reduce((sum, area) => sum + area, 0);
  const minCellArea = areas.length > 0 ? Math.min(...areas) : 0;
  return {
    style,
    canvasWidth: options.canvasW,
    canvasHeight: options.canvasH,
    cells,
    seed: options.seed ?? "default",
    warnings,
    metadata: {
      imageCount: options.imageCount,
      heroCount: cells.filter((cell) => cell.role === "hero").length,
      averageCellArea: areas.length > 0 ? totalArea / areas.length : 0,
      minCellArea,
      complexityScore: cells.reduce((score, cell) => score + (cell.polygon?.length ?? 4), 0),
    },
  };
}

export function validateDynamicLayout(result: DynamicCollageLayoutResult, options: ValidationOptions = {}): string[] {
  const warnings = [...result.warnings];
  const canvasArea = Math.max(1, result.canvasWidth * result.canvasHeight);
  const minAreaRatio = options.minAreaRatio ?? 0.012;
  const minSideRatio = options.minSideRatio ?? 0.035;

  for (const cell of result.cells) {
    if (![cell.x, cell.y, cell.width, cell.height].every(Number.isFinite)) {
      warnings.push(`Cell ${cell.id} has non-finite geometry.`);
      continue;
    }
    if (cell.width <= 0 || cell.height <= 0) warnings.push(`Cell ${cell.id} has empty bounds.`);
    if (cell.width / result.canvasWidth < minSideRatio || cell.height / result.canvasHeight < minSideRatio) {
      warnings.push(`Cell ${cell.id} is below minimum readable side size.`);
    }
    const areaRatio = (cell.width * cell.height) / canvasArea;
    if (cell.role !== "accent" && areaRatio < minAreaRatio) warnings.push(`Cell ${cell.id} is too small.`);
    const ar = Math.max(cell.width / Math.max(1, cell.height), cell.height / Math.max(1, cell.width));
    if (!options.allowStripCells && ar > 5) warnings.push(`Cell ${cell.id} has an extreme aspect ratio.`);
    if (cell.polygon && !isReadablePolygon(cell.polygon, { minAreaPx: canvasArea * minAreaRatio * 0.35, maxAspectRatio: options.allowStripCells ? 12 : 6 })) {
      warnings.push(`Cell ${cell.id} polygon is not readable.`);
    }
  }

  return warnings;
}

export function dynamicCellsToSlots(result: DynamicCollageLayoutResult, spacingPx: number): CollageSlot[] {
  return result.cells
    .map((cell, index) => dynamicCellToSlot(cell, result.canvasWidth, result.canvasHeight, spacingPx, index))
    .filter((slot): slot is CollageSlot => Boolean(slot));
}

export function dynamicCellToSlot(
  cell: DynamicCollageCell,
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  index: number
): CollageSlot | null {
  const common: Partial<CollageSlot> = {
    role: cell.role === "primary" ? "standard" : cell.role === "support" ? "standard" : cell.role === "background" ? "accent" : cell.role,
    label: cell.role,
    zIndex: cell.role === "hero" ? 20 : index,
    metadata: {
      dynamicStyle: cell.shape,
      weight: cell.weight,
      cropPriority: cell.cropPriority ?? "auto",
      preferredAspect: cell.preferredAspect ?? cell.width / Math.max(1, cell.height),
      safeInsetPx: cell.safeInsetPx ?? spacingPx,
    },
  };

  if (cell.polygon && cell.polygon.length >= 3) {
    return polygonToCollageSlot(insetPolygon(cell.polygon, spacingPx / 2), canvasW, canvasH, {
      ...common,
      shape: cell.shape === "wave-region" || cell.shape === "soft-polygon" ? "polygon" : "diagonalPolygon",
    });
  }

  return createCollageSlot({
    ...common,
    type: "image",
    shape: cell.shape === "rounded-rect" ? "rounded" : "rect",
    shapeParams: cell.shape === "rounded-rect" ? { cornerRadius: cell.borderRadius ?? 0.08 } : {},
    x: cell.x / canvasW,
    y: cell.y / canvasH,
    w: cell.width / canvasW,
    h: cell.height / canvasH,
  });
}

export function makeCell(partial: Omit<DynamicCollageCell, "id" | "gapPx" | "editable"> & { id?: string; gapPx?: number; editable?: boolean }): DynamicCollageCell {
  return {
    id: partial.id ?? createId("dcell"),
    gapPx: partial.gapPx ?? 0,
    editable: partial.editable ?? true,
    ...partial,
  };
}

export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += h << 13; h ^= h >>> 7;
    h += h << 3; h ^= h >>> 17;
    h += h << 5;
    return ((h >>> 0) % 1000000) / 1000000;
  };
}

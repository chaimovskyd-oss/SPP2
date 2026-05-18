import type { Template } from "./template";
import type { ExportSettings, ID, Margins, Metadata, PrintSpec, Rect, Size, VersionedEntity } from "./primitives";
import type { MaskThresholdSettings } from "./mask";

export interface MaskDefinition extends VersionedEntity {
  id: ID;
  name: string;
  type: "shape" | "svg" | "png";
  pathData?: string;
  assetId?: ID;
}

export interface ProductMockup extends VersionedEntity {
  id: ID;
  name: string;
  assetId: ID;
  placement: Rect;
}

// ── Phase 7 additions ─────────────────────────────────────────────────────────

export interface ProductPrintZone {
  id: ID;
  name: string;
  side: "front" | "back" | "inner" | "custom";
  /** Bounds in product units (mm), relative to canvas origin (top-left of bleed area). */
  bounds: Rect;
  safeArea?: Rect;
  bleed?: Margins;
  maskPresetId?: string;
  editable: boolean;
  metadata?: Metadata;
}

export interface ProductInstructionSet {
  printerType?: string;
  requiresHeatPress?: boolean;
  heatPressTemperature?: number;
  heatPressTimeSeconds?: number;
  heatPressPressure?: "light" | "medium" | "heavy";
  requiresMirrorPrint?: boolean;
  // Textile / washing instructions
  washTemperatureCelsius?: number;
  doNotTumbleDry?: boolean;
  ironingAllowed?: boolean;
  dryCleanOnly?: boolean;
  notes?: string;
}

/** Product-level mask boundary (distinct from MaskLayer image-editing masks). */
export interface ProductMaskDefinition {
  id: ID;
  name: string;
  type: "svg" | "png" | "pngThreshold" | "builtInShape";
  /** Base64-encoded asset data or file path. */
  assetData?: string;
  thresholdSettings?: MaskThresholdSettings;
  /** Print zone IDs this mask applies to. Empty = applies to all zones. */
  appliesTo?: ID[];
}

export interface ProductGuideVisibility {
  bleed: boolean;
  safeArea: boolean;
  maskOverlay: boolean;
  nonPrintableArea: boolean;
  printZones: boolean;
}

/** Stored in page.metadata.productContext for save/load restoration. */
export interface ProductPageContext {
  productId: ID;
  bleed: Margins;
  /** Trim size = product physical size (without bleed). */
  trimSize: Size;
  safeArea?: Rect;
  printZones: ProductPrintZone[];
  masks?: ProductMaskDefinition[];
  guideVisibility: ProductGuideVisibility;
}

// ── Core product definition ───────────────────────────────────────────────────

export interface ProductDefinition extends VersionedEntity {
  id: ID;
  name: string;
  category: string;
  printSpec: PrintSpec;
  /** Physical product size (trim, without bleed). */
  canvasSize: Size;
  safeArea: Rect;
  bleed: Margins;
  templates: Template[];
  masks: MaskDefinition[];
  mockups: ProductMockup[];
  defaultExportSettings: ExportSettings;
  metadata: Metadata;
  // Phase 7 additions (all optional for backwards compatibility)
  printZones?: ProductPrintZone[];
  productionType?: "photo" | "sublimation" | "laser" | "uv" | "print" | "vinyl" | "engraving" | "other";
  instructions?: ProductInstructionSet;
  recommendedDPI?: number;
  tags?: string[];
  /** Product-level clip/shape masks (distinct from per-frame MaskLayer masks). */
  productMasks?: ProductMaskDefinition[];
}

/**
 * Product Library Python bridge — thin wrappers over window.spp.productLibrary IPC.
 *
 * The actual Electron IPC handlers live in the main process / preload.
 * This module provides typed call functions and the Python↔TypeScript
 * ProductDefinition conversion layer.
 */

import type {
  ProductDefinition,
  ProductInstructionSet,
  ProductMaskDefinition,
  ProductPrintZone
} from "@/types/product";
import type { ExportSettings, Margins, PrintSpec, Rect, Size } from "@/types/primitives";

// ── Wire-format type (mirrors Python Product.to_dict()) ──────────────────────

export interface PythonProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  width_cm: number;
  height_cm: number;
  orientation: string;
  material: string;
  audience: string[];
  mounting_options: string[];
  tips: string;
  image_url: string;
  mockup_image_url: string;
  mask_path: string;
  active: boolean;
  // Phase 7
  bleed_mm: number;
  safe_area: { top: number; right: number; bottom: number; left: number } | null;
  print_zones: Array<Record<string, unknown>>;
  production_type: string | null;
  instructions: Record<string, unknown> | null;
  recommended_dpi: number | null;
  tags: string[];
}

// ── Conversion helpers ────────────────────────────────────────────────────────

const DEFAULT_DPI = 300;
const DEFAULT_SAFE_AREA_INSET_MM = 3;

function makeBleedMargins(bleedMm: number): Margins {
  return { top: bleedMm, right: bleedMm, bottom: bleedMm, left: bleedMm };
}

function makeSafeAreaRect(
  safeArea: PythonProduct["safe_area"],
  trimSizeMm: Size
): Rect {
  if (safeArea) {
    return {
      x: safeArea.left,
      y: safeArea.top,
      width: trimSizeMm.width - safeArea.left - safeArea.right,
      height: trimSizeMm.height - safeArea.top - safeArea.bottom
    };
  }
  const inset = DEFAULT_SAFE_AREA_INSET_MM;
  return {
    x: inset,
    y: inset,
    width: trimSizeMm.width - 2 * inset,
    height: trimSizeMm.height - 2 * inset
  };
}

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  version: 1,
  format: "png",
  dpi: DEFAULT_DPI,
  includeBleed: false,
  colorProfile: "sRGB"
};

/** Convert a Python product dict to the TypeScript ProductDefinition. */
export function pythonProductToDefinition(p: PythonProduct): ProductDefinition {
  const trimSizeMm: Size = { width: p.width_cm * 10, height: p.height_cm * 10 };
  const bleed = makeBleedMargins(p.bleed_mm ?? 2);
  const safeArea = makeSafeAreaRect(p.safe_area, trimSizeMm);
  const dpi = p.recommended_dpi ?? DEFAULT_DPI;

  const printSpec: PrintSpec = {
    version: 1,
    id: `ps_${p.id}`,
    dpi,
    colorProfile: "sRGB",
    bleed,
    safeArea,
    output: "png"
  };

  const productMasks: ProductMaskDefinition[] | undefined =
    p.mask_path
      ? [
          {
            id: `mask_${p.id}`,
            name: "Product mask",
            type: p.mask_path.endsWith(".svg") ? "svg" : "png",
            assetData: p.mask_path,
            appliesTo: []
          }
        ]
      : undefined;

  const instructions: ProductInstructionSet | undefined = p.instructions
    ? (p.instructions as unknown as ProductInstructionSet)
    : undefined;

  const printZones: ProductPrintZone[] | undefined =
    p.print_zones.length > 0
      ? (p.print_zones as unknown as ProductPrintZone[])
      : undefined;


  return {
    version: 1,
    id: p.id,
    name: p.name,
    category: p.category,
    printSpec,
    canvasSize: trimSizeMm,
    safeArea,
    bleed,
    templates: [],
    masks: [],
    mockups: [],
    defaultExportSettings: DEFAULT_EXPORT_SETTINGS,
    metadata: {
      price: p.price,
      material: p.material,
      audience: p.audience,
      mountingOptions: p.mounting_options,
      tips: p.tips,
      imageUrl: p.image_url,
      mockupImageUrl: p.mockup_image_url,
      orientation: p.orientation,
      active: p.active
    },
    productionType: p.production_type as ProductDefinition["productionType"] ?? undefined,
    instructions,
    recommendedDPI: p.recommended_dpi ?? undefined,
    tags: p.tags,
    printZones,
    productMasks
  };
}

/** Convert a TypeScript ProductDefinition back to the Python wire format. */
export function definitionToPythonProduct(def: ProductDefinition): PythonProduct {
  const meta = def.metadata as Record<string, unknown>;
  const bleedMm =
    def.bleed
      ? (def.bleed.top + def.bleed.right + def.bleed.bottom + def.bleed.left) / 4
      : 2;

  const safeAreaDict = def.safeArea
    ? {
        top: def.safeArea.y,
        right: def.canvasSize.width - def.safeArea.x - def.safeArea.width,
        bottom: def.canvasSize.height - def.safeArea.y - def.safeArea.height,
        left: def.safeArea.x
      }
    : null;

  return {
    id: def.id,
    name: def.name,
    category: def.category,
    price: (meta.price as number) ?? 0,
    width_cm: def.canvasSize.width / 10,
    height_cm: def.canvasSize.height / 10,
    orientation: (meta.orientation as string) ?? "any",
    material: (meta.material as string) ?? "",
    audience: (meta.audience as string[]) ?? [],
    mounting_options: (meta.mountingOptions as string[]) ?? [],
    tips: (meta.tips as string) ?? "",
    image_url: (meta.imageUrl as string) ?? "",
    mockup_image_url: (meta.mockupImageUrl as string) ?? "",
    mask_path: def.productMasks?.[0]?.assetData ?? "",
    active: (meta.active as boolean) ?? true,
    bleed_mm: bleedMm,
    safe_area: safeAreaDict,
    print_zones: (def.printZones ?? []) as unknown as Array<Record<string, unknown>>,
    production_type: def.productionType ?? null,
    instructions: def.instructions ? (def.instructions as unknown as Record<string, unknown>) : null,
    recommended_dpi: def.recommendedDPI ?? null,
    tags: def.tags ?? []
  };
}

// ── Bridge functions ──────────────────────────────────────────────────────────

function api(): SppProductLibraryAPI {
  const spp = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>).spp : undefined;
  const lib = spp ? (spp as Record<string, unknown>).productLibrary as SppProductLibraryAPI | undefined : undefined;
  if (!lib) throw new Error("Product library IPC not available — run inside Electron");
  return lib;
}

export function isProductBridgeAvailable(): boolean {
  try {
    api();
    return true;
  } catch {
    return false;
  }
}

/** Load all products from the Python library. */
export async function loadProductLibrary(): Promise<ProductDefinition[]> {
  const raw = await api().loadAll();
  return raw.map(pythonProductToDefinition);
}

/** Save an edited product back to the Python JSON library. */
export async function saveProductDefinition(def: ProductDefinition): Promise<void> {
  const pyProduct = definitionToPythonProduct(def);
  await api().saveOne(pyProduct);
}

/** Upload a mask file (base64-encoded SVG or PNG) to the product library. */
export async function uploadProductMask(
  productId: string,
  maskDataBase64: string,
  fileName: string
): Promise<string> {
  return api().uploadMask(productId, maskDataBase64, fileName);
}

/** Reload a single product definition from the Python library. */
export async function reloadProductDefinition(
  productId: string
): Promise<ProductDefinition | null> {
  const raw = await api().reloadOne(productId);
  if (!raw) return null;
  return pythonProductToDefinition(raw);
}

// ── IPC type declaration (implemented in Electron preload / main) ────────────

export interface SppProductLibraryAPI {
  loadAll(): Promise<PythonProduct[]>;
  saveOne(product: PythonProduct): Promise<void>;
  uploadMask(productId: string, maskDataBase64: string, fileName: string): Promise<string>;
  reloadOne(productId: string): Promise<PythonProduct | null>;
}

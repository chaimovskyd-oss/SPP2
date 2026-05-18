import { createDocument, createPage } from "../document/factory";
import { createFrameLayer, createShapeLayer } from "../layers/factory";
import { createId } from "../ids";
import { mmToPx } from "../units/conversion";
import type { Document } from "@/types/document";
import type {
  ProductDefinition,
  ProductPageContext,
  ProductPrintZone
} from "@/types/product";
import type { Margins, Rect, Size } from "@/types/primitives";

const DEFAULT_BLEED: Margins = { top: 2, right: 2, bottom: 2, left: 2 };

function resolveBleed(bleed: Margins | undefined): Margins {
  if (!bleed) return DEFAULT_BLEED;
  const { top = 0, right = 0, bottom = 0, left = 0 } = bleed;
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return DEFAULT_BLEED;
  return bleed;
}

/** Canvas size (px) = trim size + bleed on all sides, converted from mm at the given DPI. */
function canvasSizePxWithBleed(trimSizeMm: Size, bleed: Margins, dpi: number): Size {
  return {
    width: mmToPx(trimSizeMm.width + bleed.left + bleed.right, dpi),
    height: mmToPx(trimSizeMm.height + bleed.top + bleed.bottom, dpi)
  };
}

/**
 * Offset a rect defined relative to the trim area so it sits correctly on the
 * larger canvas that includes the bleed zone at its edges — returned in px.
 */
function safeAreaToPx(safeArea: Rect, bleed: Margins, dpi: number): Rect {
  return {
    x: mmToPx(safeArea.x + bleed.left, dpi),
    y: mmToPx(safeArea.y + bleed.top, dpi),
    width: mmToPx(safeArea.width, dpi),
    height: mmToPx(safeArea.height, dpi)
  };
}

/**
 * Return a copy of the product with canvasSize (and safeArea) swapped to match
 * the requested orientation.  No-op if the product is already in that orientation.
 * canvasSize and safeArea are kept in mm (ProductDefinition convention).
 */
export function applyOrientationToProduct(
  product: ProductDefinition,
  orientation: "portrait" | "landscape"
): ProductDefinition {
  const { width, height } = product.canvasSize;
  const isPortrait = height >= width;
  const wantPortrait = orientation === "portrait";
  if (isPortrait === wantPortrait) return product;
  return {
    ...product,
    canvasSize: { width: height, height: width },
    safeArea: {
      x: product.safeArea.x,
      y: product.safeArea.y,
      width: product.safeArea.height,
      height: product.safeArea.width
    }
  };
}

export function createDocumentFromProduct(
  product: ProductDefinition,
  now = new Date().toISOString()
): Document {
  const bleed = resolveBleed(product.bleed);
  const trimSizeMm = product.canvasSize; // stored in mm
  const dpi = product.recommendedDPI ?? product.printSpec.dpi;

  // All pixel values derived from mm here — this is the single conversion point.
  const canvasSizePx = canvasSizePxWithBleed(trimSizeMm, bleed, dpi);
  const safeAreaPx = safeAreaToPx(product.safeArea, bleed, dpi);

  const safeAreaGuide = createShapeLayer({
    name: "Safe area",
    shape: "rect",
    locked: true,
    rect: safeAreaPx,
    metadata: {
      role: "safeAreaGuide",
      productId: product.id
    }
  });

  const editableFrame = createFrameLayer({
    name: "Editable product zone",
    rect: safeAreaPx,
    contentType: "empty",
    fitMode: "fill",
    lockedFrame: false,
    metadata: {
      role: "editableZone",
      productId: product.id
    }
  });

  // Default single print zone (px) covering the trim area inset from canvas origin by bleed.
  const defaultZone: ProductPrintZone = {
    id: createId("zone"),
    name: "Print Area",
    side: "front",
    bounds: {
      x: mmToPx(bleed.left, dpi),
      y: mmToPx(bleed.top, dpi),
      width: mmToPx(trimSizeMm.width, dpi),
      height: mmToPx(trimSizeMm.height, dpi)
    },
    safeArea: safeAreaPx,
    bleed, // kept in mm — used by print/export metadata, not canvas layout
    editable: true
  };

  const printZones =
    product.printZones && product.printZones.length > 0
      ? product.printZones
      : [defaultZone];

  // ProductPageContext is consumed by ProductGuidesOverlay which uses these values
  // directly as Konva pixel coordinates — convert to px here.
  const bleedPx: Margins = {
    top: mmToPx(bleed.top, dpi),
    right: mmToPx(bleed.right, dpi),
    bottom: mmToPx(bleed.bottom, dpi),
    left: mmToPx(bleed.left, dpi)
  };
  const trimSizePx: Size = {
    width: mmToPx(trimSizeMm.width, dpi),
    height: mmToPx(trimSizeMm.height, dpi)
  };

  const productContext: ProductPageContext = {
    productId: product.id,
    bleed: bleedPx,         // px — used as Konva offsets in ProductGuidesOverlay
    trimSize: trimSizePx,   // px — used as Konva dimensions in ProductGuidesOverlay
    safeArea: safeAreaPx,   // px — overlay/guide rendering
    printZones,
    masks: product.productMasks,
    guideVisibility: {
      bleed: true,
      safeArea: true,
      maskOverlay: true,
      nonPrintableArea: true,
      printZones: true
    }
  };

  const page = createPage({
    name: product.name,
    setup: {
      size: canvasSizePx, // px — page.width / page.height will be in pixels
      bleed,              // mm — PageSetup.bleed convention matches other modes
      margins: {
        top: safeAreaPx.y,
        right: canvasSizePx.width - safeAreaPx.x - safeAreaPx.width,
        bottom: canvasSizePx.height - safeAreaPx.y - safeAreaPx.height,
        left: safeAreaPx.x
      }
    },
    layers: [safeAreaGuide, editableFrame],
    metadata: {
      productId: product.id,
      printSpec: product.printSpec.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      productContext: productContext as any
    }
  });

  return {
    ...createDocument({
      name: product.name,
      now,
      dpi,
      colorProfile: product.printSpec.colorProfile,
      metadata: {
        source: "product",
        mode: "product",
        productId: product.id
      }
    }),
    pages: [page],
    presets: []
  };
}

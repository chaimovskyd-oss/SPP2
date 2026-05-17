import { createDocument, createPage } from "../document/factory";
import { createFrameLayer, createShapeLayer } from "../layers/factory";
import { createId } from "../ids";
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

/** Actual page/canvas size = product trim size + bleed on all sides. */
function canvasSizeWithBleed(trimSize: Size, bleed: Margins): Size {
  return {
    width: trimSize.width + bleed.left + bleed.right,
    height: trimSize.height + bleed.top + bleed.bottom
  };
}

/**
 * Offset a rect defined relative to the trim area so it sits correctly on the
 * larger canvas that includes the bleed zone at its edges.
 */
function offsetRectByBleed(rect: Rect, bleed: Margins): Rect {
  return {
    x: rect.x + bleed.left,
    y: rect.y + bleed.top,
    width: rect.width,
    height: rect.height
  };
}

export function createDocumentFromProduct(
  product: ProductDefinition,
  now = new Date().toISOString()
): Document {
  const bleed = resolveBleed(product.bleed);
  const trimSize = product.canvasSize;
  const actualCanvasSize = canvasSizeWithBleed(trimSize, bleed);

  // safeArea from product is measured from the trim edge — offset onto the full canvas.
  const safeAreaOnCanvas = offsetRectByBleed(product.safeArea, bleed);

  const safeAreaGuide = createShapeLayer({
    name: "Safe area",
    shape: "rect",
    locked: true,
    rect: safeAreaOnCanvas,
    metadata: {
      role: "safeAreaGuide",
      productId: product.id
    }
  });

  const editableFrame = createFrameLayer({
    name: "Editable product zone",
    rect: safeAreaOnCanvas,
    contentType: "empty",
    fitMode: "fill",
    lockedFrame: false,
    metadata: {
      role: "editableZone",
      productId: product.id
    }
  });

  // Default single print zone covering the trim area (inset from canvas origin by bleed).
  const defaultZone: ProductPrintZone = {
    id: createId("zone"),
    name: "Print Area",
    side: "front",
    bounds: {
      x: bleed.left,
      y: bleed.top,
      width: trimSize.width,
      height: trimSize.height
    },
    safeArea: safeAreaOnCanvas,
    bleed,
    editable: true
  };

  const printZones =
    product.printZones && product.printZones.length > 0
      ? product.printZones
      : [defaultZone];

  const productContext: ProductPageContext = {
    productId: product.id,
    bleed,
    trimSize,
    safeArea: safeAreaOnCanvas,
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
      size: actualCanvasSize,
      bleed,
      margins: {
        top: safeAreaOnCanvas.y,
        right: actualCanvasSize.width - safeAreaOnCanvas.x - safeAreaOnCanvas.width,
        bottom: actualCanvasSize.height - safeAreaOnCanvas.y - safeAreaOnCanvas.height,
        left: safeAreaOnCanvas.x
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
      dpi: product.recommendedDPI ?? product.printSpec.dpi,
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

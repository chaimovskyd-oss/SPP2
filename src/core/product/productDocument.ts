import { createDocument, createPage } from "../document/factory";
import { createFrameLayer, createShapeLayer } from "../layers/factory";
import { createId } from "../ids";
import { mmToPx } from "../units/conversion";
import type { Asset, Document } from "@/types/document";
import type {
  ProductDefinition,
  ProductMaskDefinition,
  ProductPageContext,
  ProductPrintZone
} from "@/types/product";
import type { Margins, Rect, Size } from "@/types/primitives";

const DEFAULT_BLEED: Margins = { top: 2, right: 2, bottom: 2, left: 2 };
const DEFAULT_MASK_THRESHOLD = 28;

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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function thresholdTableValues(tolerance: number): string {
  const threshold = Math.max(0, Math.min(255, tolerance)) / 255;
  const steps = 32;
  const values: string[] = [];
  for (let index = 0; index <= steps; index += 1) {
    values.push(index / steps <= threshold ? "0" : "1");
  }
  return values.join(" ");
}

function base64EncodeUtf8(value: string): string {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(value)));
  }
  return Buffer.from(value, "utf-8").toString("base64");
}

function createMaskSvgDataUrl(mask: ProductMaskDefinition, width: number, height: number): string {
  const source = mask.assetDataUrl ?? mask.assetData ?? mask.assetPath ?? "";
  const tolerance = mask.thresholdSettings?.tolerance ?? DEFAULT_MASK_THRESHOLD;
  if (source.startsWith("data:")) {
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      "<defs>",
      `<filter id="white-threshold" color-interpolation-filters="sRGB">`,
      `<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -0.333 -0.333 -0.333 1 0" result="alpha"/>`,
      `<feComponentTransfer in="alpha"><feFuncA type="discrete" tableValues="${thresholdTableValues(tolerance)}"/></feComponentTransfer>`,
      "</filter>",
      "</defs>",
      `<image href="${escapeXml(source)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" filter="url(#white-threshold)"/>`,
      "</svg>"
    ].join("");
    return `data:image/svg+xml;base64,${base64EncodeUtf8(svg)}`;
  }
  return source;
}

function createProductMaskAsset(mask: ProductMaskDefinition, width: number, height: number): Asset {
  const dataUrl = createMaskSvgDataUrl(mask, width, height);
  return {
    version: 1,
    id: createId("asset"),
    name: mask.name || "Product mask",
    kind: "image",
    status: "ready",
    originalPath: dataUrl,
    previewPath: dataUrl,
    thumbnailPath: dataUrl,
    mimeType: dataUrl.startsWith("data:image/svg") ? "image/svg+xml" : "image/png",
    width,
    height,
    fileSize: dataUrl.length,
    metadata: {
      isMask: true,
      productMaskId: mask.id,
      sourcePath: mask.assetPath ?? mask.assetData ?? "",
      threshold: mask.thresholdSettings?.tolerance ?? DEFAULT_MASK_THRESHOLD
    }
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
    zIndex: 1,
    metadata: {
      role: "safeAreaGuide",
      productId: product.id
    }
  });

  const primaryProductMask = product.productMasks?.[0];
  const productMaskAsset = primaryProductMask
    ? createProductMaskAsset(primaryProductMask, canvasSizePx.width, canvasSizePx.height)
    : null;
  const editableFrameRect = productMaskAsset
    ? { x: 0, y: 0, width: canvasSizePx.width, height: canvasSizePx.height }
    : safeAreaPx;

  const editableFrame = createFrameLayer({
    name: "Editable product zone",
    rect: editableFrameRect,
    contentType: "empty",
    fitMode: "fill",
    lockedFrame: false,
    shape: productMaskAsset ? "customMask" : "rect",
    maskSource: productMaskAsset
      ? {
          version: 1,
          type: "alphaAsset",
          assetId: productMaskAsset.id,
          width: canvasSizePx.width,
          height: canvasSizePx.height
        }
      : undefined,
    metadata: {
      role: "editableZone",
      productId: product.id,
      ...(productMaskAsset && primaryProductMask ? {
        productMask: {
          maskId: primaryProductMask.id,
          threshold: primaryProductMask.thresholdSettings?.tolerance ?? DEFAULT_MASK_THRESHOLD,
          targetArea: "canvasWithBleed"
        }
      } : {})
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
    layers: [editableFrame, safeAreaGuide],
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
    assets: productMaskAsset ? [productMaskAsset] : [],
    presets: []
  };
}

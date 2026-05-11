import { createDocument, createPage } from "../document/factory";
import { createFrameLayer, createShapeLayer } from "../layers/factory";
import type { Document } from "@/types/document";
import type { ProductDefinition } from "@/types/product";

export function createDocumentFromProduct(product: ProductDefinition, now = new Date().toISOString()): Document {
  const safeAreaGuide = createShapeLayer({
    name: "Safe area",
    shape: "rect",
    locked: true,
    rect: product.safeArea,
    metadata: {
      role: "safeAreaGuide",
      productId: product.id
    }
  });

  const editableFrame = createFrameLayer({
    name: "Editable product zone",
    rect: product.safeArea,
    contentType: "empty",
    fitMode: "fill",
    lockedFrame: false,
    metadata: {
      role: "editableZone",
      productId: product.id
    }
  });

  const page = createPage({
    name: product.name,
    setup: {
      size: product.canvasSize,
      bleed: product.bleed,
      margins: {
        top: product.safeArea.y,
        right: product.canvasSize.width - product.safeArea.x - product.safeArea.width,
        bottom: product.canvasSize.height - product.safeArea.y - product.safeArea.height,
        left: product.safeArea.x
      }
    },
    layers: [safeAreaGuide, editableFrame],
    metadata: {
      productId: product.id,
      printSpec: product.printSpec.id
    }
  });

  return {
    ...createDocument({
      name: product.name,
      now,
      dpi: product.printSpec.dpi,
      colorProfile: product.printSpec.colorProfile,
      metadata: {
        source: "product",
        productId: product.id
      }
    }),
    pages: [page],
    presets: []
  };
}

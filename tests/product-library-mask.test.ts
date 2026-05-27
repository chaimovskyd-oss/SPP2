import { describe, expect, it } from "vitest";
import { createDocumentFromProduct } from "@/core/product/productDocument";
import { definitionToPythonProduct, pythonProductToDefinition, type PythonProduct } from "@/services/python_bridge/productBridge";
import type { ProductDefinition } from "@/types/product";

function basePythonProduct(overrides: Partial<PythonProduct> = {}): PythonProduct {
  return {
    id: "product-mask-test",
    name: "Mask Test Product",
    category: "test",
    price: 10,
    width_cm: 10,
    height_cm: 6,
    orientation: "landscape",
    material: "",
    audience: [],
    mounting_options: [],
    tips: "",
    image_url: "",
    mockup_image_url: "",
    mask_path: "",
    active: true,
    bleed_mm: 2,
    safe_area: null,
    print_zones: [],
    production_type: null,
    instructions: null,
    recommended_dpi: 300,
    tags: [],
    ...overrides
  };
}

function productWithMask(): ProductDefinition {
  return pythonProductToDefinition(basePythonProduct({
    mask_path: "masks\\product-mask-test.png",
    mask_threshold: 42,
    mask_data_base64: "iVBORw0KGgo=",
    mask_mime_type: "image/png",
    mask_file_name: "mask.png"
  }));
}

describe("product library masks", () => {
  it("converts mask_path and mask_threshold into a product mask definition", () => {
    const product = productWithMask();
    const mask = product.productMasks?.[0];

    expect(product.maskThreshold).toBe(42);
    expect(mask?.assetPath).toBe("masks\\product-mask-test.png");
    expect(mask?.assetData).toBe("masks\\product-mask-test.png");
    expect(mask?.assetDataUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(mask?.thresholdSettings?.tolerance).toBe(42);
    expect(mask?.type).toBe("pngThreshold");
  });

  it("persists the mask path and threshold without writing transient data URLs", () => {
    const product = productWithMask();
    const saved = definitionToPythonProduct(product);

    expect(saved.mask_path).toBe("masks\\product-mask-test.png");
    expect(saved.mask_threshold).toBe(42);
    expect(saved.mask_data_base64).toBeUndefined();
  });

  it("creates a full-page masked editable frame when a product mask exists", () => {
    const product = productWithMask();
    const document = createDocumentFromProduct(product);
    const page = document.pages[0]!;
    const editableFrame = page.layers.find((layer) => layer.metadata.role === "editableZone");
    const safeAreaGuide = page.layers.find((layer) => layer.metadata.role === "safeAreaGuide");

    expect(document.assets).toHaveLength(1);
    expect(document.assets[0]?.width).toBe(page.width);
    expect(document.assets[0]?.height).toBe(page.height);
    expect(document.assets[0]?.metadata.threshold).toBe(42);
    expect(editableFrame?.type).toBe("frame");
    expect(editableFrame?.x).toBe(0);
    expect(editableFrame?.y).toBe(0);
    expect(editableFrame?.width).toBe(page.width);
    expect(editableFrame?.height).toBe(page.height);
    expect(editableFrame?.type === "frame" ? editableFrame.maskSource?.type : undefined).toBe("alphaAsset");
    expect(safeAreaGuide?.locked).toBe(true);
    expect(page.metadata.productContext).toMatchObject({
      productId: product.id,
      masks: [
        expect.objectContaining({
          thresholdSettings: expect.objectContaining({ tolerance: 42 })
        })
      ]
    });
  });

  it("keeps the existing safe-area editable frame when no mask exists", () => {
    const product = pythonProductToDefinition(basePythonProduct());
    const document = createDocumentFromProduct(product);
    const page = document.pages[0]!;
    const editableFrame = page.layers.find((layer) => layer.metadata.role === "editableZone");

    expect(document.assets).toHaveLength(0);
    expect(editableFrame?.type).toBe("frame");
    expect(editableFrame?.x).toBeGreaterThan(0);
    expect(editableFrame?.y).toBeGreaterThan(0);
    expect(editableFrame?.type === "frame" ? editableFrame.maskSource : undefined).toBeUndefined();
  });
});

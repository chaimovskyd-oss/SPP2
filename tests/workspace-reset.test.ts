import { describe, expect, it } from "vitest";
import { pageSetupFromPreset, getPagePreset, createMaskModeDocument } from "@/core";
import { createDocument, createPage } from "@/core/document/factory";
import { createCollageModeDocument } from "@/core/collage/collageFactory";
import { resetWorkspaceForHome } from "@/state/workspaceReset";
import { useBatchStore } from "@/state/batchStore";
import { useDocumentStore } from "@/state/documentStore";
import { useDrawingToolsStore } from "@/state/drawingToolsStore";
import { useImageEditStore } from "@/state/imageEditStore";
import { useMaskContentEditStore } from "@/state/maskContentEditStore";
import { useProductStore } from "@/state/productStore";
import { useProjectLifecycleStore } from "@/state/projectLifecycleStore";
import { useSelectionStore } from "@/state/selectionStore";
import { useViewportStore } from "@/state/viewportStore";
import type { ProductDefinition } from "@/types/product";

describe("workspace reset on return home", () => {
  it("clears product workflow state before starting a new project", () => {
    const product = testProduct();
    const doc = createFreeDocument("Product session", { mode: "product" });

    useProductStore.getState().setActiveProduct(product);
    useProjectLifecycleStore.setState({
      projectUuid: "project-product",
      currentFilePath: "product.spp2",
      originalFilePath: "product.spp2",
      projectState: "modified",
      isDirty: true,
      lastSavedAt: null,
      lastAutosavedAt: null,
      lastError: null
    });
    useDocumentStore.getState().setDocument(doc);
    useSelectionStore.getState().setSelection(["layer-product"]);
    useSelectionStore.getState().enterLayoutEditMode();
    useViewportStore.getState().panBy(100, 50);

    resetWorkspaceForHome();
    startNewFreeProject();

    expect(useProductStore.getState().activeProduct).toBeNull();
    expect(useDocumentStore.getState().document?.metadata.mode).toBe("free");
    expect(useSelectionStore.getState().selectedLayerIds).toEqual([]);
    expect(useSelectionStore.getState().layoutEditMode).toBe(false);
    expect(useProjectLifecycleStore.getState().currentFilePath).toBeNull();
  });

  it("clears mask/editor overlays before starting a new project", () => {
    const doc = createMaskModeDocument("Mask session", pageSetupFromPreset(getPagePreset("letter")), {
      maskShape: "circle",
      maskWidth: 180,
      maskHeight: 180,
      keepProportions: true,
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      spacingX: 10,
      spacingY: 10
    });

    useDocumentStore.getState().setDocument(doc);
    useImageEditStore.getState().enterImageEditMode("mask-frame");
    useImageEditStore.getState().setSelectionMask({ data: new Uint8Array([255]), width: 1, height: 1 });
    useMaskContentEditStore.getState().enter("mask-frame");
    useDrawingToolsStore.getState().setActiveTool("brush");

    resetWorkspaceForHome();
    startNewFreeProject();

    expect(useImageEditStore.getState().imageEditMode).toBe(false);
    expect(useImageEditStore.getState().selectionMask).toBeNull();
    expect(useMaskContentEditStore.getState().active).toBe(false);
    expect(useDrawingToolsStore.getState().activeTool).toBeNull();
    expect(useDocumentStore.getState().document?.maskRules).toHaveLength(0);
  });

  it("clears collage wizard/product context and temporary jobs before starting a new project", () => {
    const page = createPage({ setup: pageSetupFromPreset(getPagePreset("a4")) });
    const doc = createCollageModeDocument("Collage session", page, "grid", [], [], 4, 8);

    useDocumentStore.getState().setDocument(doc);
    useProductStore.getState().setActiveProduct(testProduct());
    useProductStore.getState().setCollageContext({ product: testProduct("product-collage") });
    useBatchStore.getState().upsertJob({
      version: 1,
      id: "job-1",
      type: "fillFrames",
      status: "running",
      progress: 0.5,
      totalItems: 2,
      completedItems: 1,
      errors: [],
      cancellable: true,
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z"
    });

    resetWorkspaceForHome();
    startNewFreeProject();

    expect(useProductStore.getState().collageContext).toBeNull();
    expect(useBatchStore.getState().jobs).toEqual([]);
    expect(useDocumentStore.getState().document?.collageRules).toHaveLength(0);
    expect(useDocumentStore.getState().canUndo).toBe(false);
  });
});

function startNewFreeProject(): void {
  const doc = createFreeDocument("New project");
  useDocumentStore.getState().setDocument(doc);
}

function createFreeDocument(name: string, metadata = { mode: "free" }) {
  return createDocument({
    name,
    pages: [createPage({ setup: pageSetupFromPreset(getPagePreset("a4")) })],
    metadata
  });
}

function testProduct(id = "product-1"): ProductDefinition {
  return {
    version: 1,
    id,
    name: "Test product",
    category: "test",
    printSpec: {
      version: 1,
      id: "print-spec-1",
      dpi: 300,
      colorProfile: "sRGB",
      bleed: { top: 0, right: 0, bottom: 0, left: 0 },
      safeArea: { x: 0, y: 0, width: 1000, height: 800 },
      output: "png"
    },
    canvasSize: { width: 1000, height: 800 },
    safeArea: { x: 0, y: 0, width: 1000, height: 800 },
    bleed: { top: 0, right: 0, bottom: 0, left: 0 },
    templates: [],
    masks: [],
    mockups: [],
    defaultExportSettings: { version: 1, format: "png", dpi: 300, includeBleed: true, colorProfile: "sRGB" },
    metadata: {}
  };
}

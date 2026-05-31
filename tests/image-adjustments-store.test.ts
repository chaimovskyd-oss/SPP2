import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentStore } from "@/state/documentStore";
import { createImageLayer } from "@/core";
import { createFreeModeDocument } from "@/ui/projectActions";
import { getOffscreenRenderWarnings } from "@/core/rendering/offscreenPageRenderer";
import type { ImageLayer } from "@/types/layers";

function seedDocumentWithImages(count: number): { pageId: string; layerIds: string[] } {
  const document = createFreeModeDocument("Adjustments");
  const page = document.pages[0];
  if (page === undefined) throw new Error("missing page");
  const layers = Array.from({ length: count }, (_, i) =>
    createImageLayer({ assetId: `asset-${i}`, rect: { x: 0, y: 0, width: 100, height: 80 }, zIndex: i })
  );
  useDocumentStore.getState().setDocument({ ...document, pages: [{ ...page, layers }] });
  return { pageId: page.id, layerIds: layers.map((l) => l.id) };
}

function readLayer(pageId: string, layerId: string): ImageLayer {
  const layer = useDocumentStore
    .getState()
    .document?.pages.find((p) => p.id === pageId)
    ?.layers.find((l) => l.id === layerId);
  if (layer?.type !== "image") throw new Error("expected image layer");
  return layer;
}

describe("image adjustment store actions", () => {
  beforeEach(() => {
    useDocumentStore.getState().clearDocument();
  });

  it("adding then updating an adjustment isolates the target layer", () => {
    const { pageId, layerIds } = seedDocumentWithImages(2);
    const store = useDocumentStore.getState();
    const [a, b] = layerIds as [string, string];

    store.addImageAdjustment(pageId, a, { type: "basicTone" });
    const adjId = readLayer(pageId, a).imageAdjustments!.stack[0]!.id;
    store.updateImageAdjustment(pageId, a, adjId, { brightness: 40 });

    const updated = readLayer(pageId, a).imageAdjustments!.stack[0]!;
    expect(updated.type === "basicTone" && updated.brightness).toBe(40);
    expect(readLayer(pageId, b).imageAdjustments).toBeUndefined();
  });

  it("toggle disables an adjustment; remove deletes it", () => {
    const { pageId, layerIds } = seedDocumentWithImages(1);
    const store = useDocumentStore.getState();
    const a = layerIds[0]!;

    store.addImageAdjustment(pageId, a, { type: "color" });
    const adjId = readLayer(pageId, a).imageAdjustments!.stack[0]!.id;

    store.toggleImageAdjustment(pageId, a, adjId);
    expect(readLayer(pageId, a).imageAdjustments!.stack[0]!.enabled).toBe(false);

    store.removeImageAdjustment(pageId, a, adjId);
    expect(readLayer(pageId, a).imageAdjustments!.stack).toHaveLength(0);
  });

  it("reset restores the layer to no adjustments", () => {
    const { pageId, layerIds } = seedDocumentWithImages(1);
    const store = useDocumentStore.getState();
    const a = layerIds[0]!;

    store.addImageAdjustment(pageId, a, { type: "sepia", intensity: 80 });
    expect(readLayer(pageId, a).imageAdjustments).toBeDefined();

    store.resetImageAdjustments(pageId, a);
    expect(readLayer(pageId, a).imageAdjustments).toBeUndefined();
  });

  it("copy then paste clones the stack with fresh ids", () => {
    const { pageId, layerIds } = seedDocumentWithImages(2);
    const store = useDocumentStore.getState();
    const [a, b] = layerIds as [string, string];

    store.addImageAdjustment(pageId, a, { type: "basicTone", contrast: 25 });
    const srcId = readLayer(pageId, a).imageAdjustments!.stack[0]!.id;

    store.copyImageAdjustments(pageId, a);
    store.pasteImageAdjustments(pageId, [b]);

    const pasted = readLayer(pageId, b).imageAdjustments!.stack[0]!;
    expect(pasted.type === "basicTone" && pasted.contrast).toBe(25);
    expect(pasted.id).not.toBe(srcId);
  });

  it("applying to all images on the page is a single undo record", () => {
    const { pageId, layerIds } = seedDocumentWithImages(3);
    const store = useDocumentStore.getState();
    const before = useDocumentStore.getState().meaningfulActionCount;

    store.applyAdjustmentToAllImagesOnPage(pageId, { type: "color", saturation: 30 });

    for (const id of layerIds) {
      expect(readLayer(pageId, id).imageAdjustments!.stack).toHaveLength(1);
    }
    expect(useDocumentStore.getState().meaningfulActionCount).toBe(before + 1);
    expect(useDocumentStore.getState().canUndo).toBe(true);

    useDocumentStore.getState().undo();
    for (const id of layerIds) {
      expect(readLayer(pageId, id).imageAdjustments).toBeUndefined();
    }
  });

  it("applyAdjustmentToImages targets only the listed layers", () => {
    const { pageId, layerIds } = seedDocumentWithImages(3);
    const store = useDocumentStore.getState();
    const [a, , c] = layerIds as [string, string, string];

    store.applyAdjustmentToImages(pageId, [a, c], { type: "invert", strength: 100 });

    expect(readLayer(pageId, a).imageAdjustments!.stack).toHaveLength(1);
    expect(readLayer(pageId, layerIds[1]!).imageAdjustments).toBeUndefined();
    expect(readLayer(pageId, c).imageAdjustments!.stack).toHaveLength(1);
  });

  it("an image layer carrying adjustments stays eligible for offscreen export", () => {
    const { pageId, layerIds } = seedDocumentWithImages(1);
    const store = useDocumentStore.getState();
    store.addImageAdjustment(pageId, layerIds[0]!, { type: "basicTone", brightness: 20 });
    const page = useDocumentStore.getState().document!.pages.find((p) => p.id === pageId)!;
    expect(getOffscreenRenderWarnings(page)).toEqual([]);
  });
});

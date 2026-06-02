import { beforeEach, describe, expect, it } from "vitest";
import {
  createDocument,
  createFrameLayer,
  createPage,
  createProjectEnvelope,
  createTextLayer,
  parseProject,
  serializeProject
} from "@/core";
import { useDocumentStore } from "@/state/documentStore";
import type { FrameLayer, TextLayer } from "@/types/layers";

function setupFrameAndText() {
  const frame = createFrameLayer({
    name: "Heart",
    rect: { x: 100, y: 100, width: 200, height: 200 },
    shape: "svgPath",
    metadata: { maskFrame: { isMaskFrame: true } }
  });
  const text = createTextLayer({ text: "מזל טוב", rect: { x: 120, y: 120, width: 80, height: 40 } });
  const page = createPage({ name: "Page", layers: [frame, text] });
  const document = { ...createDocument({ name: "Frame text" }), pages: [page] };
  useDocumentStore.getState().setDocument(document);
  return { pageId: page.id, frameId: frame.id, textId: text.id };
}

describe("text flow inside frame", () => {
  beforeEach(() => {
    useDocumentStore.getState().clearDocument();
  });

  it("attaches a text layer to a frame as one undoable action", () => {
    const { pageId, frameId, textId } = setupFrameAndText();
    useDocumentStore.getState().attachTextToFrame(pageId, frameId, textId);

    const after = useDocumentStore.getState().document?.pages[0]?.layers ?? [];
    const frame = after.find((l) => l.id === frameId) as FrameLayer;
    const text = after.find((l) => l.id === textId) as TextLayer;
    expect(frame.contentType).toBe("text");
    expect(frame.textLayerId).toBe(textId);
    expect(text.parentFrameId).toBe(frameId);
    expect(text.textFlow?.mode).toBe("fitInsideShape");

    // Single undo reverts both layers.
    useDocumentStore.getState().undo();
    const reverted = useDocumentStore.getState().document?.pages[0]?.layers ?? [];
    const revFrame = reverted.find((l) => l.id === frameId) as FrameLayer;
    const revText = reverted.find((l) => l.id === textId) as TextLayer;
    expect(revFrame.contentType).not.toBe("text");
    expect(revFrame.textLayerId).toBeUndefined();
    expect(revText.parentFrameId).toBeNull();
  });

  it("detaches a text frame back to a free text layer in one action", () => {
    const { pageId, frameId, textId } = setupFrameAndText();
    useDocumentStore.getState().attachTextToFrame(pageId, frameId, textId);
    useDocumentStore.getState().detachTextFromFrame(pageId, frameId);

    const after = useDocumentStore.getState().document?.pages[0]?.layers ?? [];
    const frame = after.find((l) => l.id === frameId) as FrameLayer;
    const text = after.find((l) => l.id === textId) as TextLayer;
    expect(frame.contentType).toBe("empty");
    expect(frame.textLayerId).toBeUndefined();
    expect(text.parentFrameId).toBeNull();
    expect(text.textFlow?.mode).toBe("normal");
  });

  it("makes a frame that already holds an image 'mixed', and detach restores 'image'", () => {
    const frame = createFrameLayer({
      name: "Heart photo",
      rect: { x: 0, y: 0, width: 200, height: 200 },
      shape: "customMask",
      contentType: "image",
      imageAssetId: "asset_heart",
      maskSource: { version: 1, type: "alphaAsset", assetId: "asset_heart", width: 200, height: 200 }
    });
    const text = createTextLayer({ text: "מזל טוב", rect: { x: 10, y: 10, width: 80, height: 40 } });
    const page = createPage({ name: "Page", layers: [frame, text] });
    useDocumentStore.getState().setDocument({ ...createDocument({ name: "Mixed" }), pages: [page] });

    useDocumentStore.getState().attachTextToFrame(page.id, frame.id, text.id);
    let frameAfter = useDocumentStore.getState().document?.pages[0]?.layers.find((l) => l.id === frame.id) as FrameLayer;
    expect(frameAfter.contentType).toBe("mixed");
    expect(frameAfter.imageAssetId).toBe("asset_heart");
    expect(frameAfter.textLayerId).toBe(text.id);

    useDocumentStore.getState().detachTextFromFrame(page.id, frame.id);
    frameAfter = useDocumentStore.getState().document?.pages[0]?.layers.find((l) => l.id === frame.id) as FrameLayer;
    expect(frameAfter.contentType).toBe("image");
    expect(frameAfter.imageAssetId).toBe("asset_heart");
    expect(frameAfter.textLayerId).toBeUndefined();
  });

  it("round-trips textFlow and pathText through project serialization", () => {
    const text: TextLayer = {
      ...createTextLayer({ text: "על מסלול", rect: { x: 0, y: 0, width: 120, height: 60 } }),
      textFlow: { mode: "fitInsideShape", padding: 6, density: "tight", verticalAlign: "bottom" },
      pathText: {
        enabled: true,
        pathDataSnapshot: "M 0 0 L 100 0",
        align: "center",
        side: "above",
        offset: 4,
        letterSpacingMode: "normal",
        reverseDirection: false,
        keepGlyphsUpright: true
      }
    };
    const envelope = createProjectEnvelope({
      document: { ...createDocument({ name: "Flow" }), pages: [createPage({ name: "P", layers: [text] })] },
      linkedGroups: [],
      batchJobs: []
    });

    const parsed = parseProject(serializeProject(envelope));
    const restored = parsed.document.pages[0]?.layers[0] as TextLayer;
    expect(restored.textFlow).toEqual(text.textFlow);
    expect(restored.pathText).toEqual(text.pathText);
  });
});

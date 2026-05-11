import { describe, expect, it, beforeEach } from "vitest";
import {
  applyLinkedGroupPatch,
  createDocument,
  createDocumentFromProduct,
  createFrameLayer,
  createLinkedGroup,
  createPage,
  createProjectEnvelope,
  createTextLayer,
  filenameToDisplayName,
  generateGridPages,
  parseProject,
  resetIdSequenceForTests,
  serializeProject,
  withMemberOverride
} from "@/core";
import type { Asset, Document, Page } from "@/types/document";
import type { FrameLayer, LinkedGroup, TextLayer, VisualLayer } from "@/types/layers";
import type { ProductDefinition } from "@/types/product";

const now = "2026-05-11T00:00:00.000Z";

function asset(id: string, name: string): Asset {
  return {
    version: 1,
    id,
    name,
    kind: "image",
    mimeType: "image/jpeg",
    originalPath: `assets/${name}`,
    previewPath: `previews/${name}`,
    metadata: {}
  };
}

function roundTrip(document: Document, linkedGroups: LinkedGroup[] = []): Document {
  const envelope = createProjectEnvelope({
    document,
    linkedGroups,
    batchJobs: []
  });
  const parsed = parseProject(serializeProject(envelope));
  return parsed.document;
}

describe("Phase 0 model scenarios", () => {
  beforeEach(() => {
    resetIdSequenceForTests();
  });

  it("Scenario A: 40 circle masks share size while keeping per-frame crop overrides", () => {
    const linkedGroupId = "linked_circle_masks";
    const frames = Array.from({ length: 40 }).map((_, index) =>
      createFrameLayer({
        name: `Circle ${index + 1}`,
        rect: {
          x: (index % 8) * 140,
          y: Math.floor(index / 8) * 140,
          width: 120,
          height: 120
        },
        shape: "circle",
        contentType: "image",
        imageAssetId: `asset_${index + 1}`,
        fitMode: "smartCrop",
        linkedGroup: linkedGroupId,
        batchIndex: index,
        smartCropMode: "face"
      })
    );
    const masterFrame = frames[0];
    const group = createLinkedGroup({
      id: linkedGroupId,
      name: "Circle mask sizing",
      type: "size",
      memberIds: frames.map((frame) => frame.id),
      masterFrameId: masterFrame.id,
      overridable: true
    });

    const groupWithOverride = withMemberOverride(group, frames[10].id, {
      crop: {
        x: 0.15,
        y: 0.1,
        width: 0.7,
        height: 0.75
      }
    });
    const resized = applyLinkedGroupPatch(frames, groupWithOverride, {
      width: 96,
      height: 96
    }) as FrameLayer[];

    expect(resized).toHaveLength(40);
    expect(resized.every((frame) => frame.type === "frame" && frame.shape === "circle")).toBe(true);
    expect(resized.every((frame) => frame.linkedGroup === linkedGroupId)).toBe(true);
    expect(resized.every((frame) => frame.width === 96 && frame.height === 96)).toBe(true);
    expect(resized[10].crop).toEqual({
      x: 0.15,
      y: 0.1,
      width: 0.7,
      height: 0.75
    });
  });

  it("Scenario B: class photo keeps student frames and Hebrew names as linked but individually editable layers", () => {
    const frameGroupId = "linked_student_frames";
    const nameStyleGroupId = "linked_student_names";
    const filenames = Array.from({ length: 35 }).map((_, index) =>
      index === 0 ? "יותם_כהן.jpeg" : `student_${index + 1}.jpg`
    );
    const frameLayers = filenames.map((filename, index) =>
      createFrameLayer({
        name: `Student frame ${index + 1}`,
        rect: {
          x: (index % 7) * 160,
          y: Math.floor(index / 7) * 190,
          width: 128,
          height: 128
        },
        shape: "circle",
        contentType: "image",
        imageAssetId: `asset_${index + 1}`,
        linkedGroup: frameGroupId,
        batchIndex: index,
        smartCropMode: "face"
      })
    );
    const nameLayers = filenames.map((filename, index) =>
      createTextLayer({
        name: `Student name ${index + 1}`,
        text: filenameToDisplayName(filename),
        linkedGroup: nameStyleGroupId,
        linkedSlotId: frameLayers[index].id,
        rect: {
          x: frameLayers[index].x,
          y: frameLayers[index].y + 138,
          width: frameLayers[index].width,
          height: 34
        }
      })
    );
    const title = createTextLayer({
      name: "Editable title",
      text: "Class Photo",
      rect: {
        x: 200,
        y: 40,
        width: 600,
        height: 80
      }
    });
    const page = createPage({
      name: "Class photo",
      layers: [...frameLayers, ...nameLayers, title]
    });

    const textStyleGroup = createLinkedGroup({
      id: nameStyleGroupId,
      name: "Student name style",
      type: "textStyle",
      memberIds: nameLayers.map((layer) => layer.id),
      overridable: true
    });
    const updated = applyLinkedGroupPatch(page.layers, textStyleGroup, {
      fontSize: 28,
      color: "#222222"
    }) as VisualLayer[];
    const updatedNames = updated.filter((layer): layer is TextLayer => layer.type === "text" && layer.linkedGroup === nameStyleGroupId);

    expect(frameLayers).toHaveLength(35);
    expect(nameLayers).toHaveLength(35);
    expect(nameLayers[0].text).toBe("יותם כהן");
    expect(updatedNames.every((layer) => layer.fontSize === 28 && layer.color === "#222222")).toBe(true);
    expect(title.linkedGroup).toBeUndefined();
  });

  it("Scenario C: grid mode creates auto pages with shared rules and exact save/load round-trip", () => {
    const linkedGroupId = "linked_grid_rules";
    const assets = Array.from({ length: 80 }).map((_, index) => asset(`asset_${index + 1}`, `image_${index + 1}.jpg`));
    const pages = generateGridPages({
      assetIds: assets.map((item) => item.id),
      linkedGroupId,
      template: {
        pageSize: {
          width: 2400,
          height: 3600
        },
        margins: {
          top: 100,
          right: 100,
          bottom: 100,
          left: 100
        },
        rows: 4,
        columns: 6,
        spacing: 24,
        fillMode: "byRowsColumns",
        fitMode: "fill",
        autoCreatePages: true
      }
    });
    const document = {
      ...createDocument({ name: "80 image grid", now }),
      pages,
      assets
    };
    const gridGroup = createLinkedGroup({
      id: linkedGroupId,
      name: "Grid global fit",
      type: "fitMode",
      memberIds: pages.flatMap((page) => page.layers.map((layer) => layer.id)),
      overridable: true
    });
    const reloaded = roundTrip(document, [gridGroup]);

    expect(pages).toHaveLength(4);
    expect(pages[0].layers).toHaveLength(24);
    expect(pages[3].layers.filter((layer) => layer.type === "frame" && layer.contentType === "image")).toHaveLength(8);
    expect(pages.flatMap((page) => page.layers).every((layer) => layer.type === "frame" && layer.linkedGroup === linkedGroupId)).toBe(true);
    expect(reloaded).toEqual(document);
  });

  it("Scenario D: product definition creates safe-area guides, locked layers, editable zones, and print spec metadata", () => {
    const product: ProductDefinition = {
      version: 1,
      id: "product_a2_poster",
      name: "A2 Poster",
      category: "posters",
      canvasSize: {
        width: 4961,
        height: 7016
      },
      safeArea: {
        x: 120,
        y: 120,
        width: 4721,
        height: 6776
      },
      bleed: {
        top: 35,
        right: 35,
        bottom: 35,
        left: 35
      },
      printSpec: {
        version: 1,
        id: "print_a2_300dpi",
        dpi: 300,
        colorProfile: "FOGRA39",
        bleed: {
          top: 35,
          right: 35,
          bottom: 35,
          left: 35
        },
        safeArea: {
          x: 120,
          y: 120,
          width: 4721,
          height: 6776
        },
        output: "pdf"
      },
      templates: [],
      masks: [],
      mockups: [],
      defaultExportSettings: {
        version: 1,
        format: "pdf",
        dpi: 300,
        includeBleed: true,
        colorProfile: "FOGRA39"
      },
      metadata: {}
    };

    const document = createDocumentFromProduct(product, now);
    const page = document.pages[0] as Page;
    const safeAreaLayer = page.layers.find((layer) => layer.metadata.role === "safeAreaGuide");
    const editableZone = page.layers.find((layer) => layer.metadata.role === "editableZone");

    expect(document.dpi).toBe(300);
    expect(document.colorProfile).toBe("FOGRA39");
    expect(page.width).toBe(product.canvasSize.width);
    expect(page.bleed).toEqual(product.bleed);
    expect(safeAreaLayer?.locked).toBe(true);
    expect(editableZone?.type).toBe("frame");
    expect(page.metadata.productId).toBe(product.id);
    expect(roundTrip(document)).toEqual(document);
  });
});

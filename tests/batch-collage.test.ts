import { describe, expect, it } from "vitest";
import { createPage } from "@/core/document/factory";
import { createBatchCollageDocument, filterBatchSuggestions } from "@/core/collage/batchCollageBuilder";
import type { Asset } from "@/types/document";
import type { BatchCollageAssetGroup, BatchCollageSettings } from "@/types/batchCollage";
import type { ScoredLayoutSuggestion } from "@/types/collage";

describe("Batch Collages MVP", () => {
  it("creates one normal collage page per valid group", async () => {
    const settings = testSettings();
    const groups: BatchCollageAssetGroup[] = [
      { id: "g1", name: "Noam", assets: [asset("a1", 1200, 800), asset("a2", 800, 1200), asset("a3", 1000, 1000)] },
      { id: "g2", name: "Maya", assets: [asset("b1", 1600, 900), asset("b2", 900, 1600), asset("b3", 1200, 1200), asset("b4", 1000, 700)] },
      { id: "g3", name: "Ari", assets: [asset("c1", 1000, 800), asset("c2", 800, 1000)] },
    ];

    const result = await createBatchCollageDocument({ name: "Batch", groups, settings });

    expect(result.createdCount).toBe(3);
    expect(result.document.pages).toHaveLength(3);
    expect(result.document.collageRules).toHaveLength(3);
    expect(new Set(result.document.collageRules.map((rule) => rule.pageId)).size).toBe(3);
    for (const rule of result.document.collageRules) {
      const page = result.document.pages.find((item) => item.id === rule.pageId);
      expect(page).toBeDefined();
      expect(page?.layers.filter((layer) => layer.type === "frame" && (layer.metadata.collageFrame as { collageRuleId?: string } | undefined)?.collageRuleId === rule.id).length)
        .toBe(rule.imageAssignments.length);
      expect(rule.frameIds.length).toBe(rule.imageAssignments.length);
    }
  });

  it("skips empty groups with a warning instead of aborting the batch", async () => {
    const result = await createBatchCollageDocument({
      name: "Batch",
      settings: testSettings(),
      groups: [
        { id: "empty", name: "Empty", assets: [] },
        { id: "full", name: "Full", assets: [asset("a1", 1200, 800), asset("a2", 800, 1200)] },
      ],
    });

    expect(result.createdCount).toBe(1);
    expect(result.document.pages).toHaveLength(1);
    expect(result.warnings.some((warning) => warning.groupId === "empty")).toBe(true);
  });

  it("uses safe layout filtering by default and expands when all layouts is enabled", () => {
    const suggestions: ScoredLayoutSuggestion[] = [
      suggestion("shapedHeart"),
      suggestion("grid"),
      suggestion("heroSupport"),
      suggestion("softVoronoi"),
    ];

    expect(filterBatchSuggestions(suggestions, "safeOnly").map((item) => item.family))
      .toEqual(["grid", "heroSupport"]);
    expect(filterBatchSuggestions(suggestions, "allLayouts").map((item) => item.family))
      .toEqual(["shapedHeart", "grid", "heroSupport", "softVoronoi"]);
  });
});

function testSettings(): BatchCollageSettings {
  const page = createPage({ setup: { size: { width: 1000, height: 800 }, dpi: 300 } });
  return {
    pageSetup: page.setup,
    spacingMm: 1,
    marginMm: 2,
    allowedLayoutMode: "safeOnly",
    smartCropEnabled: false,
    maxCollages: 50,
  };
}

function asset(id: string, width: number, height: number): Asset {
  return {
    version: 1,
    id,
    name: `${id}.jpg`,
    kind: "image",
    status: "ready",
    originalPath: `data:image/jpeg;base64,${id}`,
    previewPath: `data:image/jpeg;base64,${id}`,
    thumbnailPath: `data:image/jpeg;base64,${id}`,
    mimeType: "image/jpeg",
    width,
    height,
    fileSize: 100,
    metadata: {},
  };
}

function suggestion(family: ScoredLayoutSuggestion["family"]): ScoredLayoutSuggestion {
  return {
    family,
    name: family,
    nameHe: family,
    slots: [{ version: 1, id: `${family}-slot`, type: "image", x: 0, y: 0, w: 1, h: 1, shape: "rect", shapeParams: {}, role: "", label: "", groupId: "", rotationDeg: 0, zIndex: 0, metadata: {} }],
    score: 1,
    scoreBreakdown: { aspectRatioScore: 1, faceSafetyScore: 1, balanceScore: 1, diversityScore: 1 },
  };
}

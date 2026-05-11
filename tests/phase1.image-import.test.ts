import { describe, expect, it } from "vitest";
import { createImageFrameLayer } from "@/ui/projectActions";
import type { Asset } from "@/types/document";

function imageAsset(width: number, height: number): Asset {
  return {
    version: 1,
    id: `asset_${width}_${height}`,
    name: "image.jpg",
    kind: "image",
    mimeType: "image/jpeg",
    width,
    height,
    metadata: {}
  };
}

describe("Phase 1 image import sizing", () => {
  it("keeps portrait images portrait and fully fitted by default", () => {
    const layer = createImageFrameLayer(imageAsset(1000, 2000), 1240, 1748);

    expect(layer.fitMode).toBe("fit");
    expect(layer.height).toBeGreaterThan(layer.width);
    expect(layer.width / layer.height).toBeCloseTo(0.5, 2);
  });

  it("keeps landscape images landscape and fully fitted by default", () => {
    const layer = createImageFrameLayer(imageAsset(2400, 1200), 1240, 1748);

    expect(layer.fitMode).toBe("fit");
    expect(layer.width).toBeGreaterThan(layer.height);
    expect(layer.width / layer.height).toBeCloseTo(2, 2);
  });
});

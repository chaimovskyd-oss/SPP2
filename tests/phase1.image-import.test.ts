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
  it("פריים פריסה (layout frame) — תמונה פורטרט שומרת יחס ומשתמשת ב-fill", () => {
    const layer = createImageFrameLayer(imageAsset(1000, 2000), 1240, 1748);

    // FrameLayer לפריסה משתמש ב-fill (ממלא את תא הפריסה)
    expect(layer.fitMode).toBe("fill");
    expect(layer.type).toBe("frame");
    expect(layer.height).toBeGreaterThan(layer.width);
    expect(layer.width / layer.height).toBeCloseTo(0.5, 2);
  });

  it("פריים פריסה (layout frame) — תמונה לנדסקייפ שומרת יחס ומשתמשת ב-fill", () => {
    const layer = createImageFrameLayer(imageAsset(2400, 1200), 1240, 1748);

    expect(layer.fitMode).toBe("fill");
    expect(layer.type).toBe("frame");
    expect(layer.width).toBeGreaterThan(layer.height);
    expect(layer.width / layer.height).toBeCloseTo(2, 2);
  });
});

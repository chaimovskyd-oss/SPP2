import { describe, expect, it } from "vitest";
import { createTextLayer, getVisualLayerBounds, measureTextLayerSize, normalizeRect, rectsIntersect } from "@/core";

describe("Free text and marquee selection geometry", () => {
  it("grows measured text bounds from content instead of clipping to a fixed box", () => {
    const layer = createTextLayer({
      text: "שלום",
      rect: {
        x: 10,
        y: 20,
        width: 40,
        height: 20
      }
    });

    const shortSize = measureTextLayerSize(layer);
    const longSize = measureTextLayerSize(layer, "שלום\nשורה שניה ארוכה מאוד");

    expect(longSize.height).toBeGreaterThan(shortSize.height);
    expect(longSize.width).toBeGreaterThan(shortSize.width);
  });

  it("uses visual text bounds for marquee intersection", () => {
    const textLayer = createTextLayer({
      text: "טקסט לבחירה",
      rect: {
        x: 100,
        y: 100,
        width: 10,
        height: 10
      }
    });
    const marquee = normalizeRect({ x: 90, y: 90 }, { x: 260, y: 180 });

    expect(getVisualLayerBounds(textLayer).width).toBeGreaterThan(textLayer.width);
    expect(rectsIntersect(getVisualLayerBounds(textLayer), marquee)).toBe(true);
  });
});

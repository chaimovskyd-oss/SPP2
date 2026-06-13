import { describe, expect, it } from "vitest";
import { applyRichTextStyleToRange, createTextLayer, measureTextLayerSize, richTextSegmentsForRange } from "@/core";

describe("rich text ranges", () => {
  it("applies inline style only to the selected text range", () => {
    const layer = createTextLayer({
      text: "MAKE THE MOVE",
      rect: { x: 0, y: 0, width: 220, height: 80 }
    });

    const next = applyRichTextStyleToRange(layer, { start: 5, end: 8 }, { color: "#ff0000", fontWeight: 800 });
    const segments = richTextSegmentsForRange(next, 0, next.text.length);

    expect(next.richText?.ranges).toHaveLength(1);
    expect(next.richText?.ranges[0]).toMatchObject({ start: 5, end: 8, style: { color: "#ff0000", fontWeight: 800 } });
    expect(segments.map((segment) => segment.text)).toEqual(["MAKE ", "THE", " MOVE"]);
    expect(segments[1]?.style.color).toBe("#ff0000");
    expect(segments[0]?.style.color).toBe(layer.color);
  });

  it("uses inline font size when measuring text bounds", () => {
    const layer = createTextLayer({
      text: "small BIG small",
      rect: { x: 0, y: 0, width: 160, height: 60 }
    });
    const normal = measureTextLayerSize(layer);
    const rich = applyRichTextStyleToRange(layer, { start: 6, end: 9 }, { fontSize: layer.fontSize * 1.6 });
    const richSize = measureTextLayerSize(rich);

    expect(richSize.width).toBeGreaterThan(normal.width);
    expect(richSize.height).toBeGreaterThanOrEqual(normal.height);
  });
});

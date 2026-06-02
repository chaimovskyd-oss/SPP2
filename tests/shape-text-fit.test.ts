import { describe, expect, it } from "vitest";
import { buildOccupancyFromAlpha, createTextLayer, fitTextInShape, measureLineWidth, type ShapeOccupancy } from "@/core";

function makeTextLayer(text: string) {
  return createTextLayer({ text, rect: { x: 0, y: 0, width: 200, height: 200 } });
}

/** Diamond occupancy: widest at the vertical center, narrow at the top/bottom tips. */
function diamond(width: number, height: number): ShapeOccupancy {
  const data = new Uint8ClampedArray(width * height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = Math.abs(x - cx) / (width / 2) + Math.abs(y - cy) / (height / 2) <= 1;
      data[y * width + x] = inside ? 1 : 0;
    }
  }
  return { width, height, data };
}

describe("shape text fit", () => {
  it("builds occupancy from an alpha channel using the threshold", () => {
    // 2x1 image: first pixel transparent, second opaque.
    const alpha = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]);
    const occ = buildOccupancyFromAlpha(alpha, 2, 1, 8);
    expect(Array.from(occ.data)).toEqual([0, 1]);
  });

  it("flows text into a diamond with rows wider in the middle than at the tips", () => {
    const layer = makeTextLayer("מזל טוב לכל המשפחה היקרה שלנו ביום הגדול הזה");
    const result = fitTextInShape(layer, diamond(220, 220), { padding: 4, verticalAlign: "center" });

    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.fontSize).toBeGreaterThanOrEqual(8);

    const widths = result.lines.map((line) => line.maxWidth);
    const widest = Math.max(...widths);
    const narrowest = Math.min(...widths);
    // The diamond tapers, so available widths must vary across rows.
    expect(widest).toBeGreaterThan(narrowest);

    // The widest available row should sit nearer the vertical center than the narrowest.
    const cy = 110;
    const widestLine = result.lines.find((line) => line.maxWidth === widest)!;
    const narrowestLine = result.lines.find((line) => line.maxWidth === narrowest)!;
    expect(Math.abs(widestLine.y - cy)).toBeLessThan(Math.abs(narrowestLine.y - cy));
  });

  it("never lays a line wider than the row's available span", () => {
    const layer = makeTextLayer("aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll");
    const result = fitTextInShape(layer, diamond(200, 200), { padding: 2 });
    for (const line of result.lines) {
      expect(measureLineWidth(line.text, { ...layer, fontSize: result.fontSize }, result.fontSize)).toBeLessThanOrEqual(line.maxWidth + 0.5);
    }
  });

  it("preserves left-to-right word order when wrapping (Hebrew/RTL safe)", () => {
    const words = ["אחת", "שתיים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה"];
    const layer = makeTextLayer(words.join(" "));
    const result = fitTextInShape(layer, diamond(240, 240), { padding: 2 });
    const flattened = result.lines.map((line) => line.text).join(" ").split(/\s+/);
    expect(flattened).toEqual(words);
  });

  it("skips regions too narrow for a word and places text only where it fits", () => {
    // Top half is a 2px sliver; bottom half is full width.
    const width = 200;
    const height = 200;
    const data = new Uint8ClampedArray(width * height);
    const cx = (width - 1) / 2;
    for (let y = 0; y < height; y += 1) {
      const rowWidth = y < height / 2 ? 2 : width;
      for (let x = 0; x < width; x += 1) {
        data[y * width + x] = Math.abs(x - cx) <= rowWidth / 2 ? 1 : 0;
      }
    }
    const occ: ShapeOccupancy = { width, height, data };
    const layer = makeTextLayer("ברכהארוכהללארווח");
    const result = fitTextInShape(layer, occ, { padding: 2 });

    expect(result.lines.length).toBeGreaterThan(0);
    // No line may land in the narrow top sliver.
    for (const line of result.lines) {
      expect(line.y).toBeGreaterThanOrEqual(height / 2 - result.lineHeight);
    }
  });

  it("reports overflow when there is no room for the text", () => {
    const layer = makeTextLayer("טקסט ארוך מאוד ".repeat(40));
    const tiny: ShapeOccupancy = { width: 12, height: 12, data: new Uint8ClampedArray(12 * 12).fill(1) };
    const result = fitTextInShape(layer, tiny, { padding: 1, minFontSize: 8 });
    expect(result.overflows).toBe(true);
  });
});

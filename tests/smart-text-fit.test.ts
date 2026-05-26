import { describe, expect, it } from "vitest";
import { createTextLayer, detectTextOverflow, fitTextToPageBox } from "@/core";
import type { Page } from "@/types/document";

const page = {
  width: 1000,
  height: 700
} as Page;

function makeTextLayer(text: string) {
  return createTextLayer({
    text,
    rect: {
      x: 420,
      y: 300,
      width: 180,
      height: 80
    }
  });
}

describe("smart text fit", () => {
  it("fits long Hebrew text to the page in balanced mode", () => {
    const layer = makeTextLayer("ברכה ארוכה מאוד ".repeat(42));

    const result = fitTextToPageBox(layer, page, "balanced");
    const overflow = detectTextOverflow(result.layer, page);

    expect(result.overflows).toBe(false);
    expect(overflow.overflows).toBe(false);
    expect(result.layer.overflowPolicy).toBe("auto_shrink");
    expect(result.layer.fontSize).toBeGreaterThanOrEqual(10);
  });

  it("shrink mode keeps the existing box size and reduces only the font", () => {
    const layer = makeTextLayer("טקסט ארוך ".repeat(34));

    const result = fitTextToPageBox(layer, page, "shrink");

    expect(result.layer.width).toBe(layer.width);
    expect(result.layer.height).toBe(layer.height);
    expect(result.layer.fontSize).toBeLessThanOrEqual(layer.fontSize);
  });

  it("centers the fitted box inside the page safe area", () => {
    const layer = makeTextLayer("Centered text ".repeat(36));

    const result = fitTextToPageBox(layer, page, "balanced");
    const centerX = result.layer.x + result.layer.width / 2;
    const centerY = result.layer.y + result.layer.height / 2;

    expect(centerX).toBeCloseTo(page.width / 2, 0);
    expect(centerY).toBeCloseTo(page.height / 2, 0);
  });

  it("writes line breaks in balanced mode so long pasted text remains editable as arranged lines", () => {
    const layer = makeTextLayer("long editable text that should become multiple arranged lines ".repeat(12));

    const result = fitTextToPageBox(layer, page, "balanced");

    expect(result.layer.text.split(/\r?\n/).length).toBeGreaterThan(1);
    expect(result.layer.text).not.toBe(layer.text);
  });

  it("wrap mode uses the page width before shrinking readable text", () => {
    const layer = makeTextLayer("ברכה נעימה ".repeat(4));

    const result = fitTextToPageBox(layer, page, "wrap");

    expect(result.layer.width).toBeGreaterThan(layer.width);
    expect(result.layer.fontSize).toBe(layer.fontSize);
    expect(result.overflows).toBe(false);
  });

  it("returns a stable best effort for text that is still too long", () => {
    const layer = makeTextLayer("מילהארוכהמאודבלי רווחים ".repeat(1000));

    const result = fitTextToPageBox(layer, page, "balanced");

    expect(result.layer.fontSize).toBe(10);
    expect(result.overflows).toBe(true);
    expect(Number.isFinite(result.measuredHeight)).toBe(true);
  });
});

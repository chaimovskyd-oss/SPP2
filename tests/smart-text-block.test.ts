import { describe, expect, it } from "vitest";
import {
  createTextLayer,
  isSmartTextBlockEnabled,
  layoutSmartTextBlock,
  measureTextLayerSize,
  withSmartTextBlockSettings,
  withoutSmartTextBlock
} from "@/core";

function makePosterText() {
  return createTextLayer({
    text: "MAKE\nTHE MOVE\nOR\nLOSE\nTHE CHANCE",
    rect: { x: 100, y: 120, width: 220, height: 120 }
  });
}

describe("smart text block", () => {
  it("stores the feature on a normal text layer and creates per-line sizes", () => {
    const layer = withSmartTextBlockSettings(makePosterText());
    const layout = layoutSmartTextBlock(layer);

    expect(layer.type).toBe("text");
    expect(isSmartTextBlockEnabled(layer)).toBe(true);
    expect(layout).not.toBeNull();
    expect(layout?.lines.filter((line) => !line.blank)).toHaveLength(5);
    expect(new Set(layout?.lines.filter((line) => !line.blank).map((line) => line.fontSize)).size).toBeGreaterThan(1);
  });

  it("uses strength to move short lines toward the target width", () => {
    const subtle = layoutSmartTextBlock(withSmartTextBlockSettings(makePosterText(), { strength: 0 }));
    const strong = layoutSmartTextBlock(withSmartTextBlockSettings(makePosterText(), { strength: 100 }));
    const subtleOr = subtle?.lines.find((line) => line.text === "OR");
    const strongOr = strong?.lines.find((line) => line.text === "OR");

    expect(strongOr?.fontSize).toBeGreaterThan(subtleOr?.fontSize ?? 0);
    expect(strongOr?.width).toBeGreaterThan(subtleOr?.width ?? 0);
  });

  it("balances lines with controlled per-line letter spacing", () => {
    const layout = layoutSmartTextBlock(withSmartTextBlockSettings(makePosterText(), { strength: 100 }));
    const move = layout?.lines.find((line) => line.text === "THE MOVE");
    const chance = layout?.lines.find((line) => line.text === "THE CHANCE");
    const or = layout?.lines.find((line) => line.text === "OR");

    expect(move).toBeDefined();
    expect(chance).toBeDefined();
    expect(or).toBeDefined();
    expect(move?.letterSpacing).toBeGreaterThan(chance?.letterSpacing ?? Number.POSITIVE_INFINITY);
    expect(move?.letterSpacing).toBeLessThan((move?.fontSize ?? 0) * 0.24);
    expect(or?.letterSpacing).toBeLessThan((or?.fontSize ?? 0) * 0.13);
  });

  it("feeds smart layout dimensions into normal text measurement and can be removed", () => {
    const layer = makePosterText();
    const smart = withSmartTextBlockSettings(layer);
    const smartSize = measureTextLayerSize(smart);
    const removed = withoutSmartTextBlock(smart);
    const normalSize = measureTextLayerSize(removed);

    expect(smartSize.width).not.toBe(normalSize.width);
    expect(isSmartTextBlockEnabled(removed)).toBe(false);
  });
});

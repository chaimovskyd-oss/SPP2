import { describe, expect, it } from "vitest";
import { createPageLookEffect } from "@/types/imageAdjustments";
import { mapPageLookBlend } from "@/core/rendering/pageLookEffects";

describe("page look effect templates", () => {
  it("fills defaults for a color overlay", () => {
    const effect = createPageLookEffect({ kind: "colorOverlay", color: "#8b5a2b", blendMode: "soft-light" });
    expect(effect).toEqual({ kind: "colorOverlay", color: "#8b5a2b", opacity: 0.2, blendMode: "soft-light" });
  });

  it("fills defaults for a vignette", () => {
    const effect = createPageLookEffect({ kind: "vignette", amount: 0.6 });
    if (effect.kind !== "vignette") throw new Error("kind");
    expect(effect.amount).toBe(0.6);
    expect(effect.color).toBe("#000000");
    expect(effect.softness).toBeGreaterThan(0);
  });
});

describe("mapPageLookBlend", () => {
  it("maps named modes to canvas composite operations", () => {
    expect(mapPageLookBlend("soft-light")).toBe("soft-light");
    expect(mapPageLookBlend("multiply")).toBe("multiply");
    expect(mapPageLookBlend("normal")).toBe("source-over");
  });
});

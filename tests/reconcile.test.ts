import { describe, expect, it } from "vitest";
import {
  adaptContentTransform,
  aspectChangedSignificantly,
  drainOverflow,
  pushOverflow,
  readOverflow,
  writeOverflow,
} from "@/core/reconcile";
import type { ContentTransform } from "@/types/layers";

const T = (partial: Partial<ContentTransform> = {}): ContentTransform => ({
  version: 1,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
  ...partial,
});

describe("adaptContentTransform", () => {
  it("returns identity when no prior transform exists", () => {
    const { transform, hasManual } = adaptContentTransform(undefined, { w: 100, h: 100 }, { w: 50, h: 50 });
    expect(transform).toEqual(T());
    expect(hasManual).toBe(false);
  });

  it("returns identity when transform was not manual", () => {
    const prev = T({ offsetX: 20, offsetY: -10, scale: 1.4 });
    const { transform, hasManual } = adaptContentTransform(
      prev,
      { w: 100, h: 100 },
      { w: 80, h: 80 },
      { hasManual: false },
    );
    expect(transform).toEqual(T());
    expect(hasManual).toBe(false);
  });

  it("scales manual offsets when aspect ratio is preserved", () => {
    const prev = T({ offsetX: 20, offsetY: -10, scale: 1.4, rotation: 5 });
    const result = adaptContentTransform(
      prev,
      { w: 100, h: 100 },
      { w: 50, h: 50 },
      { hasManual: true },
    );
    expect(result.hasManual).toBe(true);
    expect(result.transform.offsetX).toBeCloseTo(10);
    expect(result.transform.offsetY).toBeCloseTo(-5);
    expect(result.transform.scale).toBe(1.4);
    expect(result.transform.rotation).toBe(5);
  });

  it("keeps manual transform when aspect change is small (under tolerance)", () => {
    const prev = T({ offsetX: 10, offsetY: 10, scale: 1.2 });
    // 100x100 → 100x80: aspect 1 → 1.25 → delta 0.25 (under 0.3 tolerance)
    const result = adaptContentTransform(
      prev,
      { w: 100, h: 100 },
      { w: 100, h: 80 },
      { hasManual: true },
    );
    expect(result.hasManual).toBe(true);
    expect(result.transform.offsetY).toBeCloseTo(8); // 10 * (80/100)
  });

  it("falls back to identity when aspect change exceeds tolerance", () => {
    const prev = T({ offsetX: 30, offsetY: 30, scale: 1.5 });
    // 100x100 → 200x50: aspect 1 → 4 → delta 3 (well over tolerance)
    const result = adaptContentTransform(
      prev,
      { w: 100, h: 100 },
      { w: 200, h: 50 },
      { hasManual: true },
    );
    expect(result.hasManual).toBe(false);
    expect(result.transform).toEqual(T());
  });

  it("preserves rotation across a large aspect change (rotation is image-intrinsic)", () => {
    const prev = T({ offsetX: 30, offsetY: 30, scale: 1.5, rotation: 90 });
    // Large aspect change resets pan/zoom, but the 90° correction must survive.
    const result = adaptContentTransform(
      prev,
      { w: 100, h: 100 },
      { w: 200, h: 50 },
      { hasManual: true },
    );
    expect(result.transform.rotation).toBe(90);
    expect(result.transform.offsetX).toBe(0);
    expect(result.transform.offsetY).toBe(0);
    expect(result.transform.scale).toBe(1);
    // Stays "manual" so the rotation keeps surviving subsequent reflows.
    expect(result.hasManual).toBe(true);
  });

  it("preserves rotation even with no manual pan/zoom", () => {
    const prev = T({ rotation: 270 });
    const result = adaptContentTransform(
      prev,
      { w: 100, h: 100 },
      { w: 50, h: 50 },
      { hasManual: false },
    );
    expect(result.transform.rotation).toBe(270);
    expect(result.hasManual).toBe(true);
  });
});

describe("aspectChangedSignificantly", () => {
  it("returns false for identical aspects", () => {
    expect(aspectChangedSignificantly({ w: 100, h: 100 }, { w: 50, h: 50 })).toBe(false);
  });
  it("returns true for very different aspects", () => {
    expect(aspectChangedSignificantly({ w: 100, h: 100 }, { w: 300, h: 50 })).toBe(true);
  });
});

describe("overflow pool", () => {
  it("reads empty overflow from missing metadata", () => {
    expect(readOverflow(undefined)).toEqual({ hidden: [], lastChangedAt: 0 });
    expect(readOverflow({})).toEqual({ hidden: [], lastChangedAt: 0 });
  });

  it("round-trips through write/read", () => {
    const written = writeOverflow({}, { hidden: ["a", "b"], lastChangedAt: 123 });
    const read = readOverflow(written);
    expect(read.hidden).toEqual(["a", "b"]);
    expect(read.lastChangedAt).toBe(123);
  });

  it("pushOverflow stashes removed ids without duplicating", () => {
    const prev = { hidden: ["x"], lastChangedAt: 0 };
    const { newOverflow, pushed } = pushOverflow(["a", "b", "c"], ["a"], prev);
    expect(pushed).toEqual(["b", "c"]);
    expect(newOverflow.hidden).toEqual(["x", "b", "c"]);
  });

  it("pushOverflow is a no-op when nothing was removed", () => {
    const prev = { hidden: ["x"], lastChangedAt: 0 };
    const { newOverflow, pushed } = pushOverflow(["a"], ["a"], prev);
    expect(pushed).toEqual([]);
    expect(newOverflow).toBe(prev);
  });

  it("drainOverflow fills available capacity in order", () => {
    const prev = { hidden: ["x", "y", "z"], lastChangedAt: 0 };
    const result = drainOverflow(["a", "b"], prev, 4);
    expect(result.drained).toEqual(["x", "y"]);
    expect(result.pool).toEqual(["a", "b", "x", "y"]);
    expect(result.newOverflow.hidden).toEqual(["z"]);
  });

  it("drainOverflow is a no-op when pool already at capacity", () => {
    const prev = { hidden: ["x"], lastChangedAt: 0 };
    const result = drainOverflow(["a", "b"], prev, 2);
    expect(result.drained).toEqual([]);
    expect(result.pool).toEqual(["a", "b"]);
  });
});

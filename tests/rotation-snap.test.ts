import { describe, expect, it } from "vitest";
import {
  buildRotationSnaps,
  normalizeAngle,
  rotateKeepingVisualCenter,
  snapRotation
} from "@/core/transform/rotationSnap";
import type { Rect } from "@/types/primitives";

describe("normalizeAngle", () => {
  it("wraps into [0, 360)", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(361)).toBe(1);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(-1)).toBe(359);
  });
});

describe("snapRotation (soft, no Shift)", () => {
  it("snaps when within tolerance of a common angle", () => {
    expect(snapRotation(88, {})).toBe(90);
    expect(snapRotation(93, {})).toBe(90);
    expect(snapRotation(44, {})).toBe(45);
  });

  it("leaves angles outside tolerance untouched", () => {
    expect(snapRotation(82, {})).toBe(82);
    expect(snapRotation(60, {})).toBe(60);
  });

  it("snaps 359 cleanly to 0", () => {
    expect(snapRotation(359, {})).toBe(0);
  });
});

describe("snapRotation (Shift forced step)", () => {
  it("forces the nearest fixed increment", () => {
    expect(snapRotation(82, { shiftKey: true, forcedStepDeg: 15 })).toBe(75);
    expect(snapRotation(88, { shiftKey: true, forcedStepDeg: 15 })).toBe(90);
    expect(snapRotation(7, { shiftKey: true, forcedStepDeg: 15 })).toBe(0);
    expect(snapRotation(8, { shiftKey: true, forcedStepDeg: 15 })).toBe(15);
  });
});

describe("buildRotationSnaps", () => {
  it("produces evenly spaced snaps across the circle", () => {
    expect(buildRotationSnaps(90)).toEqual([0, 90, 180, 270]);
    expect(buildRotationSnaps(45)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });
});

describe("rotateKeepingVisualCenter", () => {
  const rect: Rect = { x: 100, y: 50, width: 80, height: 40 };
  const center = (r: Rect, deg: number): { x: number; y: number } => {
    const rad = (deg * Math.PI) / 180;
    const hw = r.width / 2;
    const hh = r.height / 2;
    return {
      x: r.x + hw * Math.cos(rad) - hh * Math.sin(rad),
      y: r.y + hw * Math.sin(rad) + hh * Math.cos(rad)
    };
  };

  it("keeps the visual center fixed across a single 90° rotation", () => {
    const before = center(rect, 0);
    const next = rotateKeepingVisualCenter(rect, 0, 90);
    const after = center({ ...rect, ...next }, 90);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("returns to the exact same position after 4×90°", () => {
    let r = { ...rect };
    let rot = 0;
    for (let i = 0; i < 4; i += 1) {
      const next = rotateKeepingVisualCenter(r, rot, normalizeAngle(rot + 90));
      r = { ...r, x: next.x, y: next.y };
      rot = normalizeAngle(rot + 90);
    }
    expect(r.x).toBeCloseTo(rect.x, 6);
    expect(r.y).toBeCloseTo(rect.y, 6);
    expect(rot).toBe(0);
  });

  it("returns to the exact same position after 2×180°", () => {
    const a = rotateKeepingVisualCenter(rect, 0, 180);
    const b = rotateKeepingVisualCenter({ ...rect, ...a }, 180, 0);
    expect(b.x).toBeCloseTo(rect.x, 6);
    expect(b.y).toBeCloseTo(rect.y, 6);
  });
});

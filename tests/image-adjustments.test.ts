import { describe, expect, it } from "vitest";
import {
  applyImageAdjustmentStack,
  isActiveImageAdjustment
} from "@/core/rendering/imageAdjustmentPipeline";
import { buildAdjustmentFilters, stackNeedsFilters } from "@/core/rendering/konvaCustomFilters";
import { applyCurveLUT, buildCurveLUT } from "@/core/rendering/curveUtils";
import {
  createImageAdjustment,
  type CurvePoint,
  type ImageAdjustment
} from "@/types/imageAdjustments";

// Minimal ImageData shim — the pipeline only reads .data/.width/.height.
function makeImageData(width: number, height: number, fill?: (i: number) => [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, i = 0; i < data.length; i += 4, p += 1) {
    const [r, g, b] = fill ? fill(p) : [128, 128, 128];
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width, height, colorSpace: "srgb" } as unknown as ImageData;
}

function px(img: ImageData, index: number): [number, number, number] {
  const i = index * 4;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
}

function alpha(img: ImageData, index: number): number {
  return img.data[index * 4 + 3]!;
}

describe("createImageAdjustment", () => {
  it("fills neutral defaults and assigns an id", () => {
    const adj = createImageAdjustment({ type: "basicTone" });
    expect(adj.type).toBe("basicTone");
    expect(adj.id).toMatch(/^adj_/);
    expect(adj.enabled).toBe(true);
    if (adj.type !== "basicTone") throw new Error("type");
    expect(adj).toMatchObject({ brightness: 0, contrast: 0, exposure: 0, gamma: 1, offset: 0 });
  });

  it("merges partial template values over defaults", () => {
    const adj = createImageAdjustment({ type: "highlightsShadows", highlights: -55, whites: -25 });
    if (adj.type !== "highlightsShadows") throw new Error("type");
    expect(adj.highlights).toBe(-55);
    expect(adj.whites).toBe(-25);
    expect(adj.shadows).toBe(0);
    expect(adj.blacks).toBe(0);
  });
});

describe("isActiveImageAdjustment", () => {
  it("treats neutral tools as inactive", () => {
    expect(isActiveImageAdjustment(createImageAdjustment({ type: "basicTone" }))).toBe(false);
    expect(isActiveImageAdjustment(createImageAdjustment({ type: "color" }))).toBe(false);
    expect(isActiveImageAdjustment(createImageAdjustment({ type: "curves", preset: "linear" }))).toBe(false);
  });

  it("ignores disabled adjustments", () => {
    const adj = createImageAdjustment({ type: "basicTone", brightness: 40, enabled: false });
    expect(isActiveImageAdjustment(adj)).toBe(false);
  });

  it("detects active tools", () => {
    expect(isActiveImageAdjustment(createImageAdjustment({ type: "basicTone", brightness: 10 }))).toBe(true);
    expect(isActiveImageAdjustment(createImageAdjustment({ type: "invert", strength: 100 }))).toBe(true);
    expect(isActiveImageAdjustment(createImageAdjustment({ type: "curves", preset: "sCurve" }))).toBe(true);
  });
});

describe("pixel pipeline — pointwise tools", () => {
  it("brightness raises channel values", () => {
    const img = makeImageData(1, 1);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "basicTone", brightness: 40 })]);
    const [r] = px(img, 0);
    expect(r).toBeGreaterThan(128);
  });

  it("invert at full strength mirrors values", () => {
    const img = makeImageData(3, 1, (p) => [[0, 100, 255][p]!, [0, 100, 255][p]!, [0, 100, 255][p]!]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "invert", strength: 100 })]);
    expect(px(img, 0)[0]).toBe(255);
    expect(px(img, 1)[0]).toBe(155);
    expect(px(img, 2)[0]).toBe(0);
  });

  it("black & white at full strength equalizes channels to luminance", () => {
    const img = makeImageData(1, 1, () => [200, 100, 50]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "blackWhite", strength: 100 })]);
    const [r, g, b] = px(img, 0);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("adjusts visible pixels while preserving transparent holes", () => {
    const img = makeImageData(2, 1, (p) => (p === 0 ? [200, 80, 40] : [10, 20, 30]));
    img.data[7] = 0;

    applyImageAdjustmentStack(img, [
      createImageAdjustment({ type: "blackWhite", strength: 100 }),
      createImageAdjustment({ type: "basicTone", brightness: 25 })
    ]);

    const [r, g, b] = px(img, 0);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThan(80);
    expect(alpha(img, 0)).toBe(255);
    expect(alpha(img, 1)).toBe(0);
  });

  it("threshold with no smoothing produces pure black/white", () => {
    const img = makeImageData(2, 1, (p) => (p === 0 ? [40, 40, 40] : [220, 220, 220]));
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "threshold", level: 128, smoothing: 0 })]);
    expect(px(img, 0)).toEqual([0, 0, 0]);
    expect(px(img, 1)).toEqual([255, 255, 255]);
  });

  it("temperature warms (more red, less blue)", () => {
    const img = makeImageData(1, 1, () => [128, 128, 128]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "color", temperature: 100 })]);
    const [r, , b] = px(img, 0);
    expect(r).toBeGreaterThan(128);
    expect(b).toBeLessThan(128);
  });

  it("sepia warms a gray image", () => {
    const img = makeImageData(1, 1, () => [128, 128, 128]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "sepia", intensity: 100, warmth: 100 })]);
    const [r, , b] = px(img, 0);
    expect(r).toBeGreaterThan(b);
  });

  it("gradient map (black→white) returns a gray equal to luminance", () => {
    const img = makeImageData(1, 1, () => [200, 100, 50]);
    const lum = Math.round(0.2126 * 200 + 0.7152 * 100 + 0.0722 * 50);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "gradientMap" })]);
    const [r, g, b] = px(img, 0);
    expect(Math.abs(r - lum)).toBeLessThanOrEqual(1);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });
});

describe("pixel pipeline — spatial tools", () => {
  it("sharpness leaves a flat image unchanged", () => {
    const img = makeImageData(8, 8, () => [120, 120, 120]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "detail", sharpness: 80, sharpnessRadius: 1 })]);
    for (let i = 0; i < 64; i += 1) expect(px(img, i)).toEqual([120, 120, 120]);
  });

  it("noise reduction leaves a flat image unchanged", () => {
    const img = makeImageData(8, 8, () => [90, 90, 90]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "detail", noiseReduction: 100 })]);
    for (let i = 0; i < 64; i += 1) expect(px(img, i)).toEqual([90, 90, 90]);
  });

  it("never produces NaN or out-of-range bytes", () => {
    const img = makeImageData(4, 4, (p) => [p * 7 % 256, p * 13 % 256, p * 29 % 256]);
    applyImageAdjustmentStack(img, [
      createImageAdjustment({ type: "basicTone", brightness: 30, contrast: 40, exposure: 0.3, gamma: 1.2 }),
      createImageAdjustment({ type: "highlightsShadows", highlights: -40, shadows: 30, whites: -20, blacks: 10 }),
      createImageAdjustment({ type: "color", saturation: 20, vibrance: 30, temperature: 15 }),
      createImageAdjustment({ type: "detail", sharpness: 50, clarity: 40 })
    ]);
    for (let i = 0; i < img.data.length; i += 1) {
      expect(Number.isNaN(img.data[i])).toBe(false);
      expect(img.data[i]).toBeGreaterThanOrEqual(0);
      expect(img.data[i]).toBeLessThanOrEqual(255);
    }
  });
});

describe("per-channel LUT fusion", () => {
  // Applying [a,b,c] in one stack uses the fused single-pass path; applying them
  // one stack at a time uses the original per-op routines. They must match bit-for-bit.
  const fill = (p: number): [number, number, number] => [p * 11 % 256, p * 17 % 256, p * 23 % 256];

  it("fused run equals sequential single ops (basicTone → curves → invert)", () => {
    const ops: ImageAdjustment[] = [
      createImageAdjustment({ type: "basicTone", brightness: 22, contrast: 35, exposure: 0.3, gamma: 1.15, offset: 0.05 }),
      createImageAdjustment({ type: "curves", preset: "sCurve" }),
      createImageAdjustment({ type: "invert", strength: 40 })
    ];
    const fused = makeImageData(8, 8, fill);
    applyImageAdjustmentStack(fused, ops);

    const sequential = makeImageData(8, 8, fill);
    for (const op of ops) applyImageAdjustmentStack(sequential, [op]);

    expect(Array.from(fused.data)).toEqual(Array.from(sequential.data));
  });

  it("fusion preserves order around a non-fusible op (basicTone → color → curves)", () => {
    const ops: ImageAdjustment[] = [
      createImageAdjustment({ type: "basicTone", contrast: 30 }),
      createImageAdjustment({ type: "color", saturation: 25, temperature: 12 }),
      createImageAdjustment({ type: "curves", preset: "softSCurve" })
    ];
    const oneCall = makeImageData(8, 8, fill);
    applyImageAdjustmentStack(oneCall, ops);

    const stepwise = makeImageData(8, 8, fill);
    for (const op of ops) applyImageAdjustmentStack(stepwise, [op]);

    expect(Array.from(oneCall.data)).toEqual(Array.from(stepwise.data));
  });

  it("single per-channel op is unaffected by the fusion path", () => {
    const op = createImageAdjustment({ type: "curves", preset: "sCurve" });
    const a = makeImageData(4, 4, fill);
    const b = makeImageData(4, 4, fill);
    applyImageAdjustmentStack(a, [op]);
    applyImageAdjustmentStack(b, [op]);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});

describe("curve LUT", () => {
  it("linear preset is identity", () => {
    const lut = buildCurveLUT({ preset: "linear" });
    for (let i = 0; i < 256; i += 1) expect(applyCurveLUT(i, lut)).toBe(i);
  });

  it("s-curve darkens shadows and brightens highlights, stays monotonic", () => {
    const lut = buildCurveLUT({ preset: "sCurve" });
    expect(applyCurveLUT(64, lut)).toBeLessThan(64);
    expect(applyCurveLUT(192, lut)).toBeGreaterThan(192);
    for (let i = 1; i < 256; i += 1) expect(applyCurveLUT(i, lut)).toBeGreaterThanOrEqual(applyCurveLUT(i - 1, lut));
  });
});

describe("multi-channel curves (Curves editor)", () => {
  const diag = (): CurvePoint[] => [{ x: 0, y: 0 }, { x: 255, y: 255 }];
  const channels = (over: Partial<Record<"rgb" | "r" | "g" | "b", CurvePoint[]>>): {
    rgb: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[];
  } => ({ rgb: diag(), r: diag(), g: diag(), b: diag(), ...over });

  it("an all-identity channel set is inactive", () => {
    const adj = createImageAdjustment({ type: "curves", channels: channels({}) });
    expect(isActiveImageAdjustment(adj)).toBe(false);
  });

  it("a non-identity channel set is active", () => {
    const adj = createImageAdjustment({ type: "curves", channels: channels({ rgb: [{ x: 0, y: 0 }, { x: 128, y: 160 }, { x: 255, y: 255 }] }) });
    expect(isActiveImageAdjustment(adj)).toBe(true);
  });

  it("RGB midpoint up brightens; midpoint down darkens (tests 2 & 3)", () => {
    const up = makeImageData(1, 1, () => [128, 128, 128]);
    applyImageAdjustmentStack(up, [createImageAdjustment({ type: "curves", channels: channels({ rgb: [{ x: 0, y: 0 }, { x: 128, y: 170 }, { x: 255, y: 255 }] }) })]);
    expect(px(up, 0)[0]).toBeGreaterThan(128);

    const down = makeImageData(1, 1, () => [128, 128, 128]);
    applyImageAdjustmentStack(down, [createImageAdjustment({ type: "curves", channels: channels({ rgb: [{ x: 0, y: 0 }, { x: 128, y: 90 }, { x: 255, y: 255 }] }) })]);
    expect(px(down, 0)[0]).toBeLessThan(128);
  });

  it("RGB S-curve increases contrast (test 1)", () => {
    const img = makeImageData(2, 1, (p) => (p === 0 ? [64, 64, 64] : [192, 192, 192]));
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "curves", channels: channels({ rgb: [{ x: 0, y: 0 }, { x: 64, y: 44 }, { x: 192, y: 212 }, { x: 255, y: 255 }] }) })]);
    expect(px(img, 0)[0]).toBeLessThan(64); // shadows darker
    expect(px(img, 1)[0]).toBeGreaterThan(192); // highlights brighter
  });

  it("the red channel curve affects only red (test 4)", () => {
    const img = makeImageData(1, 1, () => [128, 128, 128]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "curves", channels: channels({ r: [{ x: 0, y: 0 }, { x: 128, y: 180 }, { x: 255, y: 255 }] }) })]);
    const [r, g, b] = px(img, 0);
    expect(r).toBeGreaterThan(128);
    expect(g).toBe(128);
    expect(b).toBe(128);
  });

  it("pulling the blue channel down warms the image (test 5)", () => {
    const img = makeImageData(1, 1, () => [128, 128, 128]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "curves", channels: channels({ b: [{ x: 0, y: 0 }, { x: 128, y: 80 }, { x: 255, y: 255 }] }) })]);
    const [r, , b] = px(img, 0);
    expect(b).toBeLessThan(128); // less blue → warmer/yellower
    expect(r).toBe(128);
  });

  it("RGB curve is applied before the per-channel curve", () => {
    // rgb maps 128→200, then r maps 200→100. Net: red 128→100.
    const img = makeImageData(1, 1, () => [128, 128, 128]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "curves", channels: channels({
      rgb: [{ x: 0, y: 0 }, { x: 128, y: 200 }, { x: 255, y: 255 }],
      r: [{ x: 0, y: 0 }, { x: 200, y: 100 }, { x: 255, y: 255 }]
    }) })]);
    const [r, g] = px(img, 0);
    expect(Math.abs(r - 100)).toBeLessThanOrEqual(3);
    expect(g).toBeGreaterThan(150); // green only got the rgb lift
  });

  it("fused path matches the single-op path for channel curves (test 10)", () => {
    const fill = (p: number): [number, number, number] => [p * 11 % 256, p * 17 % 256, p * 23 % 256];
    const ch = channels({ rgb: [{ x: 0, y: 0 }, { x: 96, y: 70 }, { x: 255, y: 255 }], b: [{ x: 0, y: 0 }, { x: 128, y: 150 }, { x: 255, y: 255 }] });
    const ops: ImageAdjustment[] = [
      createImageAdjustment({ type: "basicTone", contrast: 25 }),
      createImageAdjustment({ type: "curves", channels: ch }),
      createImageAdjustment({ type: "invert", strength: 20 })
    ];
    const fused = makeImageData(8, 8, fill);
    applyImageAdjustmentStack(fused, ops);
    const sequential = makeImageData(8, 8, fill);
    for (const op of ops) applyImageAdjustmentStack(sequential, [op]);
    expect(Array.from(fused.data)).toEqual(Array.from(sequential.data));
  });

  it("live Konva filter matches export for channel curves (test 8)", () => {
    const fill = (p: number): [number, number, number] => [p * 11 % 256, p * 17 % 256, p * 23 % 256];
    const stack = [createImageAdjustment({ type: "curves", channels: channels({
      rgb: [{ x: 0, y: 0 }, { x: 128, y: 150 }, { x: 255, y: 255 }],
      g: [{ x: 0, y: 0 }, { x: 128, y: 110 }, { x: 255, y: 255 }]
    }) })];
    const live = makeImageData(6, 6, fill);
    const exported = makeImageData(6, 6, fill);
    buildAdjustmentFilters(stack)[0]!(live);
    applyImageAdjustmentStack(exported, stack, 1);
    expect(Array.from(live.data)).toEqual(Array.from(exported.data));
  });
});

describe("built-in curve presets", () => {
  it("every built-in preset is a real (non-identity) adjustment", async () => {
    const { BUILTIN_CURVE_PRESETS } = await import("@/core/presets/curveChannelPresets");
    expect(BUILTIN_CURVE_PRESETS.length).toBeGreaterThan(0);
    for (const preset of BUILTIN_CURVE_PRESETS) {
      const adj = createImageAdjustment({ type: "curves", channels: preset.channels });
      expect(isActiveImageAdjustment(adj)).toBe(true);
    }
  });

  it("warm-highlights preset adds red and removes blue at a bright pixel", async () => {
    const { BUILTIN_CURVE_PRESETS } = await import("@/core/presets/curveChannelPresets");
    const warm = BUILTIN_CURVE_PRESETS.find((p) => p.id === "warmHighlights")!;
    const img = makeImageData(1, 1, () => [160, 160, 160]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "curves", channels: warm.channels })]);
    const [r, , b] = px(img, 0);
    expect(r).toBeGreaterThan(160);
    expect(b).toBeLessThan(160);
  });
});

describe("Konva ↔ pixel parity", () => {
  const stack: ImageAdjustment[] = [
    createImageAdjustment({ type: "basicTone", brightness: 25, contrast: 30, exposure: 0.2 }),
    createImageAdjustment({ type: "color", saturation: 30, vibrance: 20, temperature: 10, hue: 12 }),
    createImageAdjustment({ type: "curves", preset: "softSCurve" }),
    createImageAdjustment({ type: "detail", sharpness: 40, sharpnessRadius: 2 })
  ];

  it("the live filter yields identical pixels to the export pipeline", () => {
    const fill = (p: number): [number, number, number] => [p * 11 % 256, p * 17 % 256, p * 23 % 256];
    const live = makeImageData(6, 6, fill);
    const exported = makeImageData(6, 6, fill);

    const filters = buildAdjustmentFilters(stack);
    expect(filters).toHaveLength(1);
    filters[0]!(live);
    applyImageAdjustmentStack(exported, stack, 1);

    expect(Array.from(live.data)).toEqual(Array.from(exported.data));
  });

  it("reduceEffects drops heavy detail filters", () => {
    expect(stackNeedsFilters([createImageAdjustment({ type: "detail", sharpness: 50 })], true)).toBe(false);
    expect(stackNeedsFilters([createImageAdjustment({ type: "detail", sharpness: 50 })], false)).toBe(true);
    expect(stackNeedsFilters([createImageAdjustment({ type: "basicTone", brightness: 20 })], true)).toBe(true);
  });
});

describe("shadowHighlights (local Photoshop-style recovery)", () => {
  // 40-wide split: left half dark (luma≈30), right half bright (luma≈230).
  const W = 40;
  const H = 8;
  const split = (p: number): [number, number, number] =>
    (p % W) < W / 2 ? [30, 30, 30] : [230, 230, 230];
  const lumaOf = ([r, g, b]: [number, number, number]): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const DARK_IDX = 4; // well inside the dark half
  const BRIGHT_IDX = W - 5; // well inside the bright half

  it("is inactive only when every control is neutral", () => {
    expect(
      isActiveImageAdjustment(
        createImageAdjustment({ type: "shadowHighlights", shadows: 0, highlights: 0, localContrast: 0, colorCorrection: 0, midtoneContrast: 0 })
      )
    ).toBe(false);
    expect(isActiveImageAdjustment(createImageAdjustment({ type: "shadowHighlights", shadows: 50 }))).toBe(true);
  });

  it("lifts dark regions while leaving bright regions essentially unchanged", () => {
    const img = makeImageData(W, H, split);
    applyImageAdjustmentStack(
      img,
      [createImageAdjustment({ type: "shadowHighlights", shadows: 100, highlights: 0, localContrast: 0 })],
      1
    );
    expect(lumaOf(px(img, DARK_IDX))).toBeGreaterThan(80); // 30 → noticeably brighter
    expect(Math.abs(lumaOf(px(img, BRIGHT_IDX)) - 230)).toBeLessThan(8); // bright untouched
  });

  it("pulls bright regions while leaving dark regions essentially unchanged", () => {
    const img = makeImageData(W, H, split);
    applyImageAdjustmentStack(
      img,
      [createImageAdjustment({ type: "shadowHighlights", shadows: 0, highlights: 100, localContrast: 0 })],
      1
    );
    expect(lumaOf(px(img, BRIGHT_IDX))).toBeLessThan(205); // 230 → recovered
    expect(Math.abs(lumaOf(px(img, DARK_IDX)) - 30)).toBeLessThan(8); // shadows untouched
  });

  it("preserves true black (gamma lift keeps the endpoint)", () => {
    const img = makeImageData(W, H, () => [0, 0, 0]);
    applyImageAdjustmentStack(img, [createImageAdjustment({ type: "shadowHighlights", shadows: 100 })], 1);
    expect(lumaOf(px(img, DARK_IDX))).toBeLessThan(2);
  });

  it("is treated as a heavy spatial filter (dropped during drag/zoom)", () => {
    const stack = [createImageAdjustment({ type: "shadowHighlights", shadows: 60 })];
    expect(stackNeedsFilters(stack, true)).toBe(false);
    expect(stackNeedsFilters(stack, false)).toBe(true);
  });

  it("live filter matches the export pipeline pixel-for-pixel", () => {
    const stack = [createImageAdjustment({ type: "shadowHighlights", shadows: 70, highlights: 40, localContrast: 30, colorCorrection: 20, midtoneContrast: 15 })];
    const live = makeImageData(W, H, split);
    const exported = makeImageData(W, H, split);
    const filters = buildAdjustmentFilters(stack);
    expect(filters).toHaveLength(1);
    filters[0]!(live);
    applyImageAdjustmentStack(exported, stack, 1);
    expect(Array.from(live.data)).toEqual(Array.from(exported.data));
  });
});

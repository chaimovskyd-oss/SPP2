import { describe, expect, it } from "vitest";
import {
  analyzeFaceLuma,
  analyzeFaceRecovery,
  buildFaceInfluence,
  estimateGlobalTone,
  estimateNoiseScore,
  estimateSceneCoverage,
  faceExposureScore,
  noiseScaleFromScore,
  recoveryStrengthFromScore,
  skinConfidence,
  skyConfidence,
  specularFactor,
  suggestAutoShadowHighlights
} from "@/core/analysis/smartShadowHighlights";
import { applyImageAdjustmentStack } from "@/core/rendering/imageAdjustmentPipeline";
import { buildAdjustmentFilters } from "@/core/rendering/konvaCustomFilters";
import { createImageAdjustment, type ShadowHighlightsParams } from "@/types/imageAdjustments";

// ── ImageData shim (pipeline only reads .data/.width/.height) ──
function makeImageData(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0, p = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, p += 4) {
      const [r, g, b] = fill(x, y);
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
  }
  return { data, width, height, colorSpace: "srgb" } as unknown as ImageData;
}
function lumaAt(img: ImageData, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return 0.2126 * img.data[i]! + 0.7152 * img.data[i + 1]! + 0.0722 * img.data[i + 2]!;
}
function satAt(img: ImageData, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!;
  const max = Math.max(r, g, b);
  return max <= 0 ? 0 : (max - Math.min(r, g, b)) / max;
}
function sh(params: Partial<ShadowHighlightsParams>): ReturnType<typeof createImageAdjustment> {
  return createImageAdjustment({ type: "shadowHighlights", ...params });
}

describe("smart helpers — skin / sky / noise / faces", () => {
  it("skinConfidence is high on warm skin and zero on blue/grey", () => {
    expect(skinConfidence(200, 150, 120)).toBeGreaterThan(0.7);
    expect(skinConfidence(100, 75, 60)).toBeGreaterThan(0.7);
    expect(skinConfidence(60, 90, 150)).toBe(0); // blue
    expect(skinConfidence(128, 128, 128)).toBe(0); // grey
  });

  it("skyConfidence needs blue + bright + low texture + up-top", () => {
    const blue = skyConfidence(0.05, 70, 110, 200, 1);
    expect(blue).toBeGreaterThan(0.2);
    // Same pixel lower in the frame is weaker.
    expect(skyConfidence(0.9, 70, 110, 200, 1)).toBeLessThan(blue);
    // High local texture (clouds/foliage edges) suppresses it.
    expect(skyConfidence(0.05, 70, 110, 200, 0)).toBe(0);
    // Non-blue is never sky.
    expect(skyConfidence(0.05, 200, 150, 120, 1)).toBe(0);
  });

  it("noiseScaleFromScore follows the spec tiers and is monotonic", () => {
    expect(noiseScaleFromScore(10)).toBe(1);
    expect(noiseScaleFromScore(30)).toBeCloseTo(1, 5);
    expect(noiseScaleFromScore(60)).toBeCloseTo(0.85, 5);
    expect(noiseScaleFromScore(80)).toBeCloseTo(0.7, 5);
    expect(noiseScaleFromScore(100)).toBeCloseTo(0.5, 5);
    expect(noiseScaleFromScore(45)).toBeLessThan(1);
    expect(noiseScaleFromScore(45)).toBeGreaterThan(0.85);
  });

  it("faceExposureScore flags dark faces (<50) and passes well-exposed ones", () => {
    expect(faceExposureScore(0.08, 0.5)).toBeLessThan(50); // very dark + crushed
    expect(faceExposureScore(0.3, 0.1)).toBeLessThan(50); // underexposed
    expect(faceExposureScore(0.6, 0)).toBeGreaterThanOrEqual(75); // well exposed
  });

  it("estimateNoiseScore rates a noisy dark map higher than a clean one", () => {
    const w = 32, h = 32;
    const clean = new Float32Array(w * h).fill(0.15);
    const noisy = new Float32Array(w * h);
    let seed = 1;
    for (let i = 0; i < noisy.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noisy[i] = 0.15 + ((seed / 0x7fffffff) - 0.5) * 0.18; // ±0.09 noise
    }
    expect(estimateNoiseScore(clean, w, h)).toBeLessThan(10);
    expect(estimateNoiseScore(noisy, w, h)).toBeGreaterThan(estimateNoiseScore(clean, w, h) + 30);
  });

  it("estimateSceneCoverage finds sky and skin where they exist, ~0 where they don't", () => {
    const w = 20, h = 20;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        // Top half flat blue sky, bottom half warm skin.
        const [r, g, b] = y < h / 2 ? [70, 110, 190] : [200, 150, 120];
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
      }
    }
    const cov = estimateSceneCoverage(rgba, w, h);
    expect(cov.sky).toBeGreaterThan(0.2); // sky detected
    expect(cov.skin).toBeGreaterThan(0.2); // skin detected

    // An all-grey image has neither.
    const grey = new Uint8ClampedArray(w * h * 4).fill(128);
    for (let i = 3; i < grey.length; i += 4) grey[i] = 255;
    const none = estimateSceneCoverage(grey, w, h);
    expect(none.sky).toBe(0);
    expect(none.skin).toBe(0);
  });

  it("estimateGlobalTone reports clipping and darkness", () => {
    const w = 16, h = 16;
    const dark = new Float32Array(w * h).fill(0.03); // all crushed
    const t1 = estimateGlobalTone(dark);
    expect(t1.shadowClip).toBeGreaterThan(0.9);
    expect(t1.darkFraction).toBeGreaterThan(0.9);
    const bright = new Float32Array(w * h).fill(0.98);
    expect(estimateGlobalTone(bright).highlightClip).toBeGreaterThan(0.9);
  });

  it("suggestAutoShadowHighlights is conservative and scene-driven", () => {
    const darkFace = { x: 0, y: 0, width: 0.2, height: 0.2, underexposureScore: 85, medianLuma: 0.18 };
    const brightFace = { x: 0.5, y: 0, width: 0.2, height: 0.2, underexposureScore: 5, medianLuma: 0.72 };
    const tone = { shadowClip: 0.05, highlightClip: 0.2, medianLuma: 0.3, darkFraction: 0.5 };

    const withDark = suggestAutoShadowHighlights({ faces: [darkFace], coverage: { sky: 0.2, skin: 0.1 }, tone });
    expect(withDark.faceShadows).toBeGreaterThan(40); // dark face ⇒ real face lift
    expect(withDark.shadows).toBeLessThanOrEqual(28); // global stays gentle
    expect(withDark.highlights).toBeGreaterThan(28); // clipping ⇒ more recovery

    const withBright = suggestAutoShadowHighlights({ faces: [brightFace], coverage: { sky: 0, skin: 0.1 }, tone });
    expect(withBright.protectBrightFaces).toBeGreaterThanOrEqual(90); // bright face ⇒ strong protection
    expect(withBright.faceShadows).toBeLessThan(withDark.faceShadows);

    const noFaces = suggestAutoShadowHighlights({ faces: [], coverage: { sky: 0, skin: 0 }, tone });
    expect(noFaces.faceShadows).toBe(0);
  });

  it("buildFaceInfluence is 1 inside the face, feathers out, 0 far away", () => {
    const w = 100, h = 60;
    const map = buildFaceInfluence([{ x: 0.4, y: 0.2, width: 0.12, height: 0.2 }], w, h);
    const at = (x: number, y: number): number => map[y * w + x]!;
    expect(at(46, 18)).toBeCloseTo(1, 5); // centre of the face box
    expect(at(95, 55)).toBe(0); // far corner — outside influence
    const edge = at(53, 18); // in the feathered surround
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });

  it("buildFaceInfluence reaches further DOWN (head & shoulders) than up", () => {
    const w = 60, h = 80;
    const map = buildFaceInfluence([{ x: 0.4, y: 0.4, width: 0.2, height: 0.2 }], w, h);
    const cx = Math.round(0.5 * w);
    const cy = Math.round(0.5 * h);
    const at = (x: number, y: number): number => map[y * w + x]!;
    // Same pixel distance above vs below the centre: below (shoulders) keeps more.
    const dist = 18;
    expect(at(cx, cy + dist)).toBeGreaterThan(at(cx, cy - dist));
  });
});

describe("V2 pipeline modulation", () => {
  const W = 60, H = 40;
  const darkGray = (): ImageData => makeImageData(W, H, () => [40, 40, 40]);

  it("face shadows lift the face region (×per-face need) more than the rest", () => {
    const faceLeft = sh({
      shadows: 0, faceShadows: 80, clothingProtection: 0, smart: true, prioritizeFaces: true, protectSky: false, noiseProtection: false,
      faceRegions: [{ x: 0.05, y: 0.3, width: 0.15, height: 0.3, recoveryStrength: 1, medianLuma: 0.15 }]
    });
    const img = darkGray();
    applyImageAdjustmentStack(img, [faceLeft], 1);
    expect(lumaAt(img, 8, 18)).toBeGreaterThan(lumaAt(img, 56, 18) + 6); // face brighter than far corner
  });

  it("a face that needs no recovery gets no boost (uniform result)", () => {
    const img = darkGray();
    applyImageAdjustmentStack(img, [sh({
      shadows: 0, faceShadows: 80, clothingProtection: 0, smart: true, prioritizeFaces: true, protectSky: false, noiseProtection: false,
      faceRegions: [{ x: 0.05, y: 0.3, width: 0.15, height: 0.3, recoveryStrength: 0, medianLuma: 0.15 }]
    })], 1);
    expect(Math.abs(lumaAt(img, 8, 18) - lumaAt(img, 56, 18))).toBeLessThan(1);
  });

  it("noise protection scales the shadow lift down", () => {
    const low = darkGray();
    const high = darkGray();
    const base = { shadows: 60, clothingProtection: 0, smart: true, protectSky: false, noiseProtection: true } as const;
    applyImageAdjustmentStack(low, [sh({ ...base, noiseScore: 0 })], 1);
    applyImageAdjustmentStack(high, [sh({ ...base, noiseScore: 90 })], 1);
    expect(lumaAt(high, 20, 6)).toBeLessThan(lumaAt(low, 20, 6) - 4); // noisier ⇒ recovered less
  });

  it("protect sky reduces lifting on blue sky but not on matched grey", () => {
    // Top rows blue (sky candidate), flat so texture is low.
    const blue = (): ImageData => makeImageData(W, H, () => [70, 110, 180]);
    const grey = (): ImageData => makeImageData(W, H, () => [120, 120, 120]);
    const skyOn = blue();
    const skyOff = blue();
    applyImageAdjustmentStack(skyOn, [sh({ shadows: 60, smart: true, protectSky: true, protectSkin: false, noiseProtection: false })], 1);
    applyImageAdjustmentStack(skyOff, [sh({ shadows: 60, smart: true, protectSky: false, protectSkin: false, noiseProtection: false })], 1);
    expect(lumaAt(skyOn, 20, 0)).toBeLessThan(lumaAt(skyOff, 20, 0) - 2); // sky lifted less

    // A grey region of similar luma is unaffected by sky protection.
    const gOn = grey();
    const gOff = grey();
    applyImageAdjustmentStack(gOn, [sh({ shadows: 60, smart: true, protectSky: true, protectSkin: false, noiseProtection: false })], 1);
    applyImageAdjustmentStack(gOff, [sh({ shadows: 60, smart: true, protectSky: false, protectSkin: false, noiseProtection: false })], 1);
    expect(Math.abs(lumaAt(gOn, 20, 0) - lumaAt(gOff, 20, 0))).toBeLessThan(0.5);
  });

  it("preserve skin tones caps the saturation boost on skin pixels (high colorCorrection)", () => {
    const skin = (): ImageData => makeImageData(W, H, () => [100, 75, 60]);
    const on = skin();
    const off = skin();
    const base = { shadows: 40, colorCorrection: 50, clothingProtection: 0, smart: true, protectSky: false, noiseProtection: false } as const;
    applyImageAdjustmentStack(on, [sh({ ...base, preserveSkinTones: 70 })], 1);
    applyImageAdjustmentStack(off, [sh({ ...base, preserveSkinTones: 0 })], 1);
    expect(satAt(on, 30, 18)).toBeLessThan(satAt(off, 30, 18)); // protected from over-saturation
  });

  it("preserve skin tones keeps skin colourful at colorCorrection 0 (no flat/grey skin)", () => {
    const skin = (): ImageData => makeImageData(W, H, () => [100, 75, 60]);
    const on = skin();
    const off = skin();
    const base = { shadows: 50, colorCorrection: 0, clothingProtection: 0, smart: true, protectSky: false, noiseProtection: false } as const;
    applyImageAdjustmentStack(on, [sh({ ...base, preserveSkinTones: 60 })], 1);
    applyImageAdjustmentStack(off, [sh({ ...base, preserveSkinTones: 0 })], 1);
    expect(satAt(on, 30, 18)).toBeGreaterThan(satAt(off, 30, 18)); // keeps skin colour
  });

  it("per-face manual lift targets ONLY the selected face, not other faces or background", () => {
    const img = darkGray();
    applyImageAdjustmentStack(img, [sh({
      shadows: 0, smart: true, prioritizeFaces: true, protectSkin: false, protectSky: false, noiseProtection: false,
      faceRegions: [
        { x: 0.05, y: 0.3, width: 0.15, height: 0.3, shadows: 90 }, // face #1 tuned
        { x: 0.7, y: 0.3, width: 0.15, height: 0.3, shadows: 0 } // face #2 untouched
      ]
    })], 1);
    const lit = lumaAt(img, 8, 18); // inside face #1
    const otherFace = lumaAt(img, 47, 18); // inside face #2
    const background = lumaAt(img, 30, 2); // top middle, no face
    expect(lit).toBeGreaterThan(40 + 10); // selected face lifted
    expect(Math.abs(otherFace - 40)).toBeLessThan(3); // other face untouched
    expect(Math.abs(background - 40)).toBeLessThan(3); // clothing/background untouched
  });

  it("per-face manual keeps the tool active even when global sliders are all 0", () => {
    const img = darkGray();
    applyImageAdjustmentStack(img, [sh({
      shadows: 0, highlights: 0, localContrast: 0, smart: true,
      faceRegions: [{ x: 0.05, y: 0.3, width: 0.15, height: 0.3, shadows: 80 }]
    })], 1);
    expect(lumaAt(img, 8, 18)).toBeGreaterThan(40 + 8);
  });

  it("deep-shadow desaturation tames the 'blue dark clothing' artifact", () => {
    const inSat = (25 - 15) / 25; // not used directly; documents the input cast
    void inSat;
    const img = makeImageData(W, H, () => [15, 18, 40]); // near-black bluish clothing
    applyImageAdjustmentStack(img, [sh({ shadows: 80 })], 1);
    const i = (18 * W + 30) * 4;
    const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!;
    const outSat = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
    expect(b).toBeGreaterThanOrEqual(r); // still slightly cool, but…
    expect(outSat).toBeLessThan((40 - 15) / 40); // …much less saturated than the input (0.625)
    expect(outSat).toBeLessThan(0.45);
  });

  it("smart off ⇒ identical to pure V1 (face regions ignored)", () => {
    const a = darkGray();
    const b = darkGray();
    applyImageAdjustmentStack(a, [sh({ shadows: 50 })], 1);
    applyImageAdjustmentStack(b, [sh({
      shadows: 50, smart: false, prioritizeFaces: true,
      faceRegions: [{ x: 0, y: 0, width: 0.5, height: 1, exposureScore: 0 }]
    })], 1);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("eye safety: a bright low-saturation patch inside a face stays put while the face lifts", () => {
    // Dark face with a white 'eye/teeth' block; recovery must lift the dark skin
    // but leave the bright specular block essentially unchanged.
    const img = makeImageData(W, H, (x, y) =>
      x >= 20 && x <= 24 && y >= 16 && y <= 20 ? [250, 250, 250] : [60, 60, 60]
    );
    applyImageAdjustmentStack(img, [sh({
      shadows: 60, smart: true, prioritizeFaces: true, protectSkin: true, protectSky: false, noiseProtection: false,
      faceRegions: [{ x: 0.2, y: 0.2, width: 0.5, height: 0.6, recoveryStrength: 1 }]
    })], 1);
    expect(lumaAt(img, 22, 18)).toBeGreaterThan(244); // bright block preserved
    expect(lumaAt(img, 10, 18)).toBeGreaterThan(60 + 8); // dark skin lifted
  });

  it("no artificial whitening / greying of skin under strong recovery", () => {
    const img = makeImageData(W, H, () => [80, 60, 48]); // uniform dark skin
    applyImageAdjustmentStack(img, [sh({
      shadows: 80, smart: true, prioritizeFaces: true, protectSkin: true, protectSky: false, noiseProtection: false,
      faceRegions: [{ x: 0, y: 0, width: 1, height: 1, recoveryStrength: 1 }]
    })], 1);
    const i = (18 * W + 30) * 4;
    const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b); // skin hue order preserved (not greyed)
    expect(lumaAt(img, 30, 18)).toBeLessThan(225); // not blown toward white
    expect((Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b)).toBeGreaterThan(0.18); // saturation kept
  });

  it("clothing protection keeps dark clothes dark", () => {
    const protectedImg = darkGray(); // dark, low-sat, non-face → reads as clothing
    const openImg = darkGray();
    const base = { shadows: 70, smart: true, protectSky: false, noiseProtection: false } as const;
    applyImageAdjustmentStack(protectedImg, [sh({ ...base, clothingProtection: 90 })], 1);
    applyImageAdjustmentStack(openImg, [sh({ ...base, clothingProtection: 0 })], 1);
    expect(lumaAt(protectedImg, 20, 18)).toBeLessThan(lumaAt(openImg, 20, 18) - 5);
  });

  it("protect bright faces cuts the face shadow lift on an already-bright face", () => {
    // Liftable pixels (luma ≈ 0.27) but the face is *reported* bright (median 0.7).
    const mk = (): ImageData => makeImageData(W, H, () => [70, 70, 70]);
    const guarded = mk();
    const open = mk();
    const base: Partial<ShadowHighlightsParams> = {
      shadows: 0, faceShadows: 80, clothingProtection: 0, smart: true, protectSky: false, noiseProtection: false,
      faceRegions: [{ x: 0.05, y: 0.3, width: 0.2, height: 0.4, recoveryStrength: 1, medianLuma: 0.7 }]
    };
    applyImageAdjustmentStack(guarded, [sh({ ...base, protectBrightFaces: 100 })], 1);
    applyImageAdjustmentStack(open, [sh({ ...base, protectBrightFaces: 0 })], 1);
    expect(lumaAt(guarded, 9, 18)).toBeLessThan(lumaAt(open, 9, 18) - 5); // bright face lifted less
  });

  it("protect highlights stops a bright patch (in dark surround) from being lifted further", () => {
    const mk = (): ImageData => makeImageData(W, H, (x, y) =>
      x >= 30 && x <= 31 && y >= 19 && y <= 20 ? [230, 230, 230] : [40, 40, 40]
    );
    const guarded = mk();
    const open = mk();
    // localContrast:0 so the only difference is the highlight-protection mask.
    const base = { shadows: 80, localContrast: 0, clothingProtection: 0, smart: true, protectSky: false, noiseProtection: false } as const;
    applyImageAdjustmentStack(guarded, [sh({ ...base, protectHighlights: 90 })], 1);
    applyImageAdjustmentStack(open, [sh({ ...base, protectHighlights: 0 })], 1);
    expect(lumaAt(open, 30, 19)).toBeGreaterThan(lumaAt(guarded, 30, 19) + 4); // protected stays put
  });

  it("shadow saturation reduces colour in lifted shadows", () => {
    const mk = (): ImageData => makeImageData(W, H, () => [45, 32, 85]); // dark saturated violet
    const strong = mk();
    const mild = mk();
    const base = { shadows: 80, clothingProtection: 0, preserveSkinTones: 0, smart: true, protectSky: false, noiseProtection: false } as const;
    applyImageAdjustmentStack(strong, [sh({ ...base, shadowSaturation: -50 })], 1);
    applyImageAdjustmentStack(mild, [sh({ ...base, shadowSaturation: 0 })], 1);
    expect(satAt(strong, 30, 18)).toBeLessThan(satAt(mild, 30, 18));
  });

  it("smart live filter matches the export pipeline pixel-for-pixel", () => {
    const stack = [sh({
      shadows: 55, highlights: 30, smart: true, prioritizeFaces: true, protectSkin: true, protectSky: true,
      noiseProtection: true, noiseScore: 65, faceRegions: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.5, exposureScore: 20 }]
    })];
    const live = makeImageData(W, H, (x) => [40 + x, 60, 90]);
    const exported = makeImageData(W, H, (x) => [40 + x, 60, 90]);
    const filters = buildAdjustmentFilters(stack);
    expect(filters).toHaveLength(1);
    filters[0]!(live);
    applyImageAdjustmentStack(exported, stack, 1);
    expect(Array.from(live.data)).toEqual(Array.from(exported.data));
  });
});

describe("per-face underexposure analysis (skin-tone independent)", () => {
  // Build a luma map (Float32) whose face box holds a luminance RAMP min..max, and
  // whose surround is a flat level — so percentiles/range are well defined.
  const FW = 40, FH = 40;
  const FACE = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  function faceLumaMap(min: number, max: number, surround: number): Float32Array {
    const m = new Float32Array(FW * FH).fill(surround);
    const x0 = Math.floor(FACE.x * FW), x1 = Math.ceil((FACE.x + FACE.width) * FW);
    const y0 = Math.floor(FACE.y * FH), y1 = Math.ceil((FACE.y + FACE.height) * FH);
    const span = x1 - 1 - x0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        m[y * FW + x] = min + (max - min) * ((x - x0) / span);
      }
    }
    return m;
  }
  const score = (min: number, max: number, surround: number): number =>
    analyzeFaceLuma(faceLumaMap(min, max, surround), FW, FH, FACE).underexposureScore;

  it("shadowed faces score higher than well-lit ones — for BOTH light and dark skin", () => {
    const lightWellLit = score(0.30, 0.90, 0.6);
    const lightShadow = score(0.05, 0.28, 0.45);
    const darkWellLit = score(0.08, 0.50, 0.29);
    const darkShadow = score(0.01, 0.14, 0.4);

    expect(lightShadow).toBeGreaterThan(lightWellLit + 25);
    expect(darkShadow).toBeGreaterThan(darkWellLit + 25);
    // Both shadowed faces are flagged for recovery regardless of skin tone.
    expect(lightShadow).toBeGreaterThanOrEqual(30);
    expect(darkShadow).toBeGreaterThanOrEqual(30);
  });

  it("a well-lit DARK-skin face is NOT flagged just for being dark", () => {
    const darkWellLit = score(0.08, 0.50, 0.29);
    expect(darkWellLit).toBeLessThan(35);
    expect(recoveryStrengthFromScore(darkWellLit)).toBeLessThan(0.2);
  });

  it("recoveryStrengthFromScore follows the spec tiers", () => {
    expect(recoveryStrengthFromScore(20)).toBe(0); // none
    expect(recoveryStrengthFromScore(45)).toBeGreaterThan(0); // mild
    expect(recoveryStrengthFromScore(45)).toBeLessThan(0.5);
    expect(recoveryStrengthFromScore(70)).toBeGreaterThan(0.45); // moderate
    expect(recoveryStrengthFromScore(70)).toBeLessThan(0.75);
    expect(recoveryStrengthFromScore(95)).toBeGreaterThan(0.75); // strong
    expect(recoveryStrengthFromScore(100)).toBeCloseTo(1, 5);
  });

  it("specularFactor flags bright low-sat pixels, not skin or darks", () => {
    expect(specularFactor(255, 255, 255)).toBeGreaterThan(0.8); // eye white / teeth
    expect(specularFactor(200, 150, 120)).toBeLessThan(0.2); // skin
    expect(specularFactor(40, 40, 40)).toBe(0); // dark
  });

  it("analyzeFaceRecovery is batch-friendly: returns recovery data per box", () => {
    const map = faceLumaMap(0.01, 0.14, 0.4);
    const regions = analyzeFaceRecovery(map, FW, FH, [FACE]);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.recoveryStrength).toBeGreaterThan(0);
    expect(regions[0]!.underexposureScore).toBeGreaterThanOrEqual(30);
    expect(typeof regions[0]!.noiseScore).toBe("number");
  });
});

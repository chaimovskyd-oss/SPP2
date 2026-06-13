import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the canvas-dependent helpers so the test does not need a real <canvas> in jsdom.
vi.mock("@/services/ai/smartSelectionService", () => ({
  makeSmartSelectionInput: (asset: { id: string }) => ({
    imageId: asset.id,
    imagePath: "/tmp/img.png",
    sourceHash: "hash",
    layer: { width: 100, height: 100, crop: { x: 0, y: 0, width: 1, height: 1 } },
    prompts: []
  }),
  selectionMaskToPngBase64: (_data: Uint8Array, _w: number, _h: number) => "MASKB64"
}));

import { runContentAwareFill } from "@/services/ai/contentAwareFillService";

const asset = { id: "asset-1", name: "x.png" } as never;
const layer = { id: "layer-1", width: 100, height: 100 } as never;
const mask = { data: new Uint8Array(100 * 100), width: 100, height: 100 };

function stubSidecar(impl: (imageId: string, options: Record<string, unknown>) => unknown): ReturnType<typeof vi.fn> {
  const inpaintRemove = vi.fn(impl);
  (globalThis as { window?: unknown }).window = {
    spp: { smartSelection: { inpaintRemove, loadImage: vi.fn(async () => ({ ok: true })) } }
  };
  return inpaintRemove;
}

const okResult = { ok: true, patchPngBase64: "PATCH", roi: { x: 0, y: 0, width: 10, height: 10 }, message: "ok" };

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe("runContentAwareFill", () => {
  it("passes the requested engine and target mask through to the sidecar", async () => {
    const inpaintRemove = stubSidecar(() => okResult);
    await runContentAwareFill({ asset, layer, targetMask: mask, renderedImageDataUrl: "data:image/png;base64,AAA", engine: "quick_heal" });
    expect(inpaintRemove).toHaveBeenCalledTimes(1);
    const [, options] = inpaintRemove.mock.calls[0];
    expect(options.engine).toBe("quick_heal");
    expect(options.maskPngBase64).toBe("MASKB64");
    expect(options.imagePngBase64).toBe("AAA");
  });

  it("defaults engine to auto and omits sampling masks when not provided", async () => {
    const inpaintRemove = stubSidecar(() => okResult);
    await runContentAwareFill({ asset, layer, targetMask: mask, renderedImageDataUrl: "data:image/png;base64,AAA" });
    const [, options] = inpaintRemove.mock.calls[0];
    expect(options.engine).toBe("auto");
    expect(options).not.toHaveProperty("samplingIncludeMaskPngBase64");
    expect(options).not.toHaveProperty("preview");
  });

  it("includes sampling masks and preview flag for Texture Fill", async () => {
    const inpaintRemove = stubSidecar(() => okResult);
    await runContentAwareFill({
      asset, layer, targetMask: mask, renderedImageDataUrl: "data:image/png;base64,AAA",
      engine: "texture_fill", preview: true,
      samplingInclude: mask, samplingExclude: mask, preserveLines: true
    });
    const [, options] = inpaintRemove.mock.calls[0];
    expect(options.engine).toBe("texture_fill");
    expect(options.preview).toBe(true);
    expect(options.preserveLines).toBe(true);
    expect(options.samplingIncludeMaskPngBase64).toBe("MASKB64");
    expect(options.samplingExcludeMaskPngBase64).toBe("MASKB64");
  });

  it("throws the sidecar error message when the fill fails", async () => {
    stubSidecar(() => ({ ok: false, error: "selection_too_large" }));
    await expect(
      runContentAwareFill({ asset, layer, targetMask: mask, renderedImageDataUrl: "data:image/png;base64,AAA" })
    ).rejects.toThrow("selection_too_large");
  });
});

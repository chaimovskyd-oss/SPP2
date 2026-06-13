import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/printHub/printRender", () => ({
  renderImageForPreset: vi.fn(async () => ({
    dataUrl: "data:image/jpeg;base64,AAAA",
    width: 1772,
    height: 1181,
    rotated: false
  }))
}));

import { buildAndSubmitJob } from "@/core/printHub/jobBuilder";
import type { PrintPreset } from "@/types/printHub";

const preset: PrintPreset = {
  id: "dnp_10x15_glossy", name: "10x15 Glossy", widthMm: 100, heightMm: 150, dpi: 300,
  bleedMm: 0, finish: "glossy", borderMode: "borderless", copies: 1
};

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe("buildAndSubmitJob", () => {
  it("renders each source and submits a complete manifest", async () => {
    const submitJob = vi.fn(async (p: { manifest: { jobId: string } }) => ({
      success: true, jobId: p.manifest.jobId, destination: "incoming" as const
    }));
    (globalThis as { window?: unknown }).window = { spp: { printHub: { submitJob } } };

    const result = await buildAndSubmitJob({
      hubRoot: "\\\\PRINT-PC\\SPP_PrintQueue",
      sources: [
        { sourceUrl: "blob:1", fileName: "a.jpg" },
        { sourceUrl: "blob:2", fileName: "b.jpg", copies: 2 }
      ],
      preset,
      size: "10x15",
      source: "spp2_editor",
      sourceComputer: "DESK-2",
      copies: 1
    });

    expect(result.success).toBe(true);
    expect(submitJob).toHaveBeenCalledTimes(1);
    const payload = submitJob.mock.calls[0][0] as unknown as { hubRoot: string; images: unknown[]; manifest: { files: Array<{ path: string; copies: number; renderedWidthPx?: number; renderedHeightPx?: number }> } };
    expect(payload.hubRoot).toBe("\\\\PRINT-PC\\SPP_PrintQueue");
    expect(payload.images).toHaveLength(2);
    expect(payload.manifest.files[0].path).toBe("images/001.jpg");
    expect(payload.manifest.files[0].renderedWidthPx).toBe(1772);
    expect(payload.manifest.files[0].renderedHeightPx).toBe(1181);
    expect(payload.manifest.files[1].copies).toBe(2);
  });

  it("fails gracefully when the bridge is unavailable", async () => {
    (globalThis as { window?: unknown }).window = { spp: {} };
    const result = await buildAndSubmitJob({
      hubRoot: "x", sources: [{ sourceUrl: "blob:1", fileName: "a.jpg" }], preset,
      size: "10x15", source: "spp2_editor", sourceComputer: "DESK-2"
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/bridge/i);
  });
});

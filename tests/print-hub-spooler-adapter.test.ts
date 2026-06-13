import { describe, expect, it, vi } from "vitest";

import { createSpoolerAdapter, type PrintImageOptions } from "@/core/printHub/adapters/spoolerAdapter";
import type { PrintRequest } from "@/core/printHub/driverAdapter";
import type { PrintPreset } from "@/types/printHub";

const preset: PrintPreset = {
  id: "p", name: "10x15", widthMm: 100, heightMm: 150, dpi: 300, bleedMm: 0,
  finish: "glossy", borderMode: "borderless", copies: 1
};

function req(images: PrintRequest["images"]): PrintRequest {
  return { jobId: "J", preset, windowsPrinterName: "DNP DS-RX1HS", images };
}

describe("createSpoolerAdapter", () => {
  it("prints each image x its copies with page size in microns", async () => {
    const calls: Array<{ file: string; opts: PrintImageOptions }> = [];
    const adapter = createSpoolerAdapter(async (file, opts) => {
      calls.push({ file, opts });
    });
    const result = await adapter.print(req([
      { filePath: "/a.jpg", copies: 1 },
      { filePath: "/b.jpg", copies: 2 }
    ]));

    expect(result.success).toBe(true);
    expect(result.printedFiles).toEqual(["/a.jpg", "/b.jpg"]);
    expect(calls).toHaveLength(3); // 1 + 2
    expect(calls[0].opts.printerName).toBe("DNP DS-RX1HS");
    expect(calls[0].opts.pageWidthMicrons).toBe(100_000);
    expect(calls[0].opts.pageHeightMicrons).toBe(150_000);
    expect(calls[0].opts.borderless).toBe(true);
  });

  it("reports partial progress and stops on a print error (enables resume)", async () => {
    const printImage = vi.fn(async (file: string) => {
      if (file === "/b.jpg") throw new Error("spooler offline");
    });
    const adapter = createSpoolerAdapter(printImage);
    const result = await adapter.print(req([
      { filePath: "/a.jpg", copies: 1 },
      { filePath: "/b.jpg", copies: 1 }
    ]));

    expect(result.success).toBe(false);
    expect(result.printedFiles).toEqual(["/a.jpg"]);
    expect(result.error).toMatch(/offline/);
  });

  it("lets a rendered image override the preset page orientation", async () => {
    const calls: Array<{ file: string; opts: PrintImageOptions }> = [];
    const adapter = createSpoolerAdapter(async (file, opts) => {
      calls.push({ file, opts });
    });
    await adapter.print(req([{ filePath: "/landscape.jpg", copies: 1, pageWidthMicrons: 150_000, pageHeightMicrons: 100_000 }]));

    expect(calls[0].opts.pageWidthMicrons).toBe(150_000);
    expect(calls[0].opts.pageHeightMicrons).toBe(100_000);
  });
});

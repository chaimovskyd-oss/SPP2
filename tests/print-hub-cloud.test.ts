import { describe, expect, it, vi } from "vitest";

import { submitJobToCloud } from "@/services/cloud/cloudQueueClient";
import { buildJobManifest } from "@/core/printHub/jobPackage";

const manifest = buildJobManifest({
  source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
  borderMode: "borderless", copies: 1, jobId: "JOBC", files: [{ path: "images/001.jpg", copies: 1 }]
});

describe("submitJobToCloud", () => {
  it("POSTs to the print-jobs endpoint and returns the cloud job id", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.example.com/print-jobs");
      expect(init?.method).toBe("POST");
      return { ok: true, status: 200, json: async () => ({ jobId: "cloud-123" }) };
    });
    const res = await submitJobToCloud("https://api.example.com/", manifest, [{ path: "images/001.jpg", dataUrl: "data:," }], fetchImpl);
    expect(res.success).toBe(true);
    expect(res.destination).toBe("cloud");
    expect(res.jobId).toBe("cloud-123");
  });

  it("reports a non-2xx response as an error", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const res = await submitJobToCloud("https://api.example.com", manifest, [], fetchImpl);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/503/);
  });

  it("fails fast when no API url is configured", async () => {
    const res = await submitJobToCloud("", manifest, []);
    expect(res.success).toBe(false);
  });
});

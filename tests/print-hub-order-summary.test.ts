import { describe, expect, it } from "vitest";

import { buildOrderSummary, orderSummaryFromFields, summaryLines, summaryQrPayload } from "@/core/printHub/orderSummary";
import { buildJobManifest } from "@/core/printHub/jobPackage";

const manifest = buildJobManifest({
  source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
  borderMode: "borderless", copies: 2, jobId: "2026-06-05_153012_ABC123",
  createdAt: "2026-06-05T15:30:12+03:00",
  files: [{ path: "images/001.jpg", copies: 1 }, { path: "images/002.jpg", copies: 1 }],
  customer: { name: "ישראל ישראלי", phone: "050-0000000", note: "דחוף" }
});

describe("buildOrderSummary", () => {
  it("maps a manifest into summary data", () => {
    const data = buildOrderSummary(manifest);
    expect(data.orderId).toBe("2026-06-05_153012_ABC123");
    expect(data.imageCount).toBe(2);
    expect(data.copies).toBe(2);
    expect(data.sizeLabel).toBe("10×15 ס״מ (4×6″)");
    expect(data.customerName).toBe("ישראל ישראלי");
  });
});

describe("summaryQrPayload", () => {
  it("encodes a compact scannable order id", () => {
    const payload = summaryQrPayload(buildOrderSummary(manifest));
    expect(payload).toContain("SPP2|2026-06-05_153012_ABC123");
    expect(payload).toContain("2x10x15");
    expect(payload).toContain("c2");
  });
});

describe("summaryLines", () => {
  it("renders Hebrew label/value rows including formatted date", () => {
    const lines = summaryLines(buildOrderSummary(manifest));
    const labels = lines.map((l) => l.label);
    expect(labels).toContain("מספר הזמנה");
    expect(labels).toContain("לקוח");
    expect(labels).toContain("כמות");
    expect(lines.find((l) => l.label === "תאריך")?.value).toMatch(/05\/06\/2026/);
  });
});

describe("orderSummaryFromFields", () => {
  it("builds equivalent data without a manifest", () => {
    const data = orderSummaryFromFields({
      orderId: "X1", createdAt: "2026-06-05T10:00:00Z", customerName: "א", customerPhone: "1",
      note: "", imageCount: 3, copies: 1, size: "15x20", finish: "matte", borderMode: "borderless", station: "DESK-2"
    });
    expect(data.sizeLabel).toBe("15×20 ס״מ (6×8″)");
    expect(data.imageCount).toBe(3);
  });
});

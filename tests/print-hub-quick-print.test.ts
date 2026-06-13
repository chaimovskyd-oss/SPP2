import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { extractQuickPrintFiles } = require("../electron/printHubQuickPrint.cjs") as {
  extractQuickPrintFiles: (argv: string[]) => string[];
};

describe("extractQuickPrintFiles", () => {
  it("collects paths after --quick-print", () => {
    const files = extractQuickPrintFiles(["electron.exe", "--quick-print", "C:/a.jpg", "C:/b.png"]);
    expect(files).toEqual(["C:/a.jpg", "C:/b.png"]);
  });

  it("stops at the next flag", () => {
    const files = extractQuickPrintFiles(["exe", "--quick-print", "C:/a.jpg", "--other", "x"]);
    expect(files).toEqual(["C:/a.jpg"]);
  });

  it("falls back to bare image args", () => {
    const files = extractQuickPrintFiles(["exe", "C:/photo.JPEG", "C:/doc.txt", "C:/pic.png"]);
    expect(files).toEqual(["C:/photo.JPEG", "C:/pic.png"]);
  });

  it("returns empty when there are no images", () => {
    expect(extractQuickPrintFiles(["exe", "--foo", "bar"]).length).toBe(0);
  });
});

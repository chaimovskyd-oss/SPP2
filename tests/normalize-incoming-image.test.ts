import { describe, expect, it, vi } from "vitest";
import { isHeicFile, normalizeIncomingImage } from "@/core/image/normalizeIncomingImage";

const heic2anyMock = vi.hoisted(() => vi.fn(async () => new Blob(["converted"], { type: "image/png" })));

vi.mock("heic2any", () => ({
  default: heic2anyMock
}));

function makeFile(name: string, type: string): File {
  return new File(["source"], name, { type, lastModified: 123 });
}

describe("normalizeIncomingImage", () => {
  it("detects HEIC and HEIF by extension or MIME type", () => {
    expect(isHeicFile(makeFile("photo.heic", ""))).toBe(true);
    expect(isHeicFile(makeFile("photo.HEIF", ""))).toBe(true);
    expect(isHeicFile(makeFile("photo.bin", "image/heic"))).toBe(true);
    expect(isHeicFile(makeFile("photo.bin", "image/heif"))).toBe(true);
    expect(isHeicFile(makeFile("photo.jpg", "image/jpeg"))).toBe(false);
  });

  it("returns existing supported formats unchanged", async () => {
    for (const file of [
      makeFile("photo.jpg", "image/jpeg"),
      makeFile("photo.png", "image/png"),
      makeFile("photo.webp", "image/webp"),
      makeFile("shape.svg", "image/svg+xml")
    ]) {
      await expect(normalizeIncomingImage(file)).resolves.toBe(file);
    }
    expect(heic2anyMock).not.toHaveBeenCalled();
  });

  it("converts only HEIC/HEIF files to PNG files", async () => {
    const file = makeFile("photo.heic", "image/heic");
    const normalized = await normalizeIncomingImage(file);

    expect(heic2anyMock).toHaveBeenCalledWith({
      blob: file,
      toType: "image/png",
      quality: 0.95
    });
    expect(normalized.name).toBe("photo.png");
    expect(normalized.type).toBe("image/png");
    expect(normalized.lastModified).toBe(123);
  });
});

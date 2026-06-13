import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isHeicFile,
  isRawFile,
  isSupportedIncomingImageFile,
  normalizeIncomingImage,
  RAW_INSTALL_CANCELLED_MESSAGE,
  RAW_UNSUPPORTED_MESSAGE
} from "@/core/image/normalizeIncomingImage";

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

describe("RAW import", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects common RAW extensions case-insensitively", () => {
    expect(isRawFile(makeFile("DSC0001.CR2", ""))).toBe(true);
    expect(isRawFile(makeFile("photo.nef", ""))).toBe(true);
    expect(isRawFile(makeFile("clip.arw", ""))).toBe(true);
    expect(isRawFile(makeFile("scan.dng", ""))).toBe(true);
    expect(isRawFile(makeFile("photo.jpg", "image/jpeg"))).toBe(false);
    expect(isRawFile(makeFile("photo.heic", "image/heic"))).toBe(false);
  });

  it("treats RAW files as supported incoming images", () => {
    expect(isSupportedIncomingImageFile(makeFile("a.cr3", ""))).toBe(true);
    expect(isSupportedIncomingImageFile(makeFile("a.bin", ""))).toBe(false);
  });

  it("develops a RAW file into a JPEG via the desktop bridge", async () => {
    const decode = vi.fn(async (_bytes: Uint8Array, _fileName: string) => ({
      ok: true,
      bytes: new Uint8Array([1, 2, 3]),
      width: 4000,
      height: 3000,
      format: "JPEG"
    }));
    vi.stubGlobal("window", { spp: { raw: { decode } } });

    const file = makeFile("DSC0001.NEF", "");
    const normalized = await normalizeIncomingImage(file);

    expect(decode).toHaveBeenCalledOnce();
    expect(decode.mock.calls[0][1]).toBe("DSC0001.NEF");
    expect(normalized.name).toBe("DSC0001.jpg");
    expect(normalized.type).toBe("image/jpeg");
    expect(normalized.lastModified).toBe(123);
  });

  it("throws a clear message when RAW support is unavailable", async () => {
    await expect(normalizeIncomingImage(makeFile("x.cr2", ""))).rejects.toThrow(RAW_UNSUPPORTED_MESSAGE);
  });

  it("surfaces a cancellation message when the user declines the install", async () => {
    const decode = vi.fn(async () => ({ ok: false, cancelled: true }));
    vi.stubGlobal("window", { spp: { raw: { decode } } });
    await expect(normalizeIncomingImage(makeFile("x.cr2", ""))).rejects.toThrow(RAW_INSTALL_CANCELLED_MESSAGE);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  abortIngest,
  beginIngest,
  finalizeIngest,
  isDuplicateJob,
  markReceived,
  missingFiles,
  resolvePart,
  sanitizeJobRelPath
} from "@/core/printHub/lanIngest";
import { jobDir, listReadyJobIds, transitionJobFolder } from "@/core/printHub/atomicIo";
import { buildJobManifest } from "@/core/printHub/jobPackage";
import { imagesSentForBytes } from "@/services/lan/lanQueueClient";

let hubRoot: string;

beforeEach(() => {
  hubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spp-lan-"));
});
afterEach(() => {
  fs.rmSync(hubRoot, { recursive: true, force: true });
});

function manifestFor(jobId: string, files = [{ path: "images/001.jpg", copies: 1 }]) {
  return buildJobManifest({
    source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
    borderMode: "borderless", copies: 1, jobId, files
  });
}

describe("LAN ingest path sanitization", () => {
  it("accepts only images/ and previews/ single segments", () => {
    expect(sanitizeJobRelPath("images/001.jpg")).toBe("images/001.jpg");
    expect(sanitizeJobRelPath("previews/001.jpg")).toBe("previews/001.jpg");
  });
  it("rejects traversal, absolute, nested, and unknown roots", () => {
    expect(sanitizeJobRelPath("../secret")).toBeNull();
    expect(sanitizeJobRelPath("/etc/passwd")).toBeNull();
    expect(sanitizeJobRelPath("images/../../x")).toBeNull();
    expect(sanitizeJobRelPath("images/sub/001.jpg")).toBeNull();
    expect(sanitizeJobRelPath("config/printers.json")).toBeNull();
    expect(sanitizeJobRelPath("images\\001.jpg")).toBeNull();
  });
});

describe("LAN ingest staging → finalize", () => {
  it("publishes a job into Incoming only after all files arrive + finalize", () => {
    const manifest = manifestFor("LANJOB", [
      { path: "images/001.jpg", copies: 1 },
      { path: "images/002.jpg", copies: 1 }
    ]);
    const handle = beginIngest(hubRoot, manifest);

    // Not visible before finalize.
    expect(listReadyJobIds(hubRoot)).toEqual([]);

    for (const rel of ["images/001.jpg", "images/002.jpg"]) {
      const part = resolvePart(handle, rel);
      expect(part).not.toBeNull();
      fs.writeFileSync(part!.absPath, "jpegbytes");
      markReceived(handle, part!.rel);
    }
    expect(missingFiles(handle)).toEqual([]);

    const { dest } = finalizeIngest(handle, manifest);
    expect(fs.existsSync(path.join(dest, "READY"))).toBe(true);
    expect(listReadyJobIds(hubRoot)).toEqual(["LANJOB"]);
    expect(fs.readFileSync(path.join(dest, "images", "001.jpg"), "utf-8")).toBe("jpegbytes");
  });

  it("refuses to finalize when a declared image is missing", () => {
    const manifest = manifestFor("MISS", [
      { path: "images/001.jpg", copies: 1 },
      { path: "images/002.jpg", copies: 1 }
    ]);
    const handle = beginIngest(hubRoot, manifest);
    const part = resolvePart(handle, "images/001.jpg");
    fs.writeFileSync(part!.absPath, "x");
    markReceived(handle, part!.rel);

    expect(missingFiles(handle)).toEqual(["images/002.jpg"]);
    expect(() => finalizeIngest(handle, manifest)).toThrow(/missing image parts/);
    expect(listReadyJobIds(hubRoot)).toEqual([]);
  });

  it("abort removes the staging folder", () => {
    const manifest = manifestFor("AB");
    const handle = beginIngest(hubRoot, manifest);
    expect(fs.existsSync(handle.stagingDir)).toBe(true);
    abortIngest(handle);
    expect(fs.existsSync(handle.stagingDir)).toBe(false);
  });

  it("detects a duplicate fingerprint already in Done", () => {
    const manifest = manifestFor("DUP");
    const handle = beginIngest(hubRoot, manifest);
    const part = resolvePart(handle, "images/001.jpg");
    fs.writeFileSync(part!.absPath, "x");
    markReceived(handle, part!.rel);
    finalizeIngest(handle, manifest);
    transitionJobFolder(hubRoot, "DUP", "incoming", "done");

    // A second job with identical content + params shares the fingerprint.
    const again = manifestFor("DUP2");
    expect(again.jobFingerprint).toBe(manifest.jobFingerprint);
    expect(isDuplicateJob(hubRoot, again)).toBe(true);
  });

  it("does not flag a never-printed job as duplicate", () => {
    expect(isDuplicateJob(hubRoot, manifestFor("FRESH"))).toBe(false);
    expect(fs.existsSync(jobDir(hubRoot, "incoming", "FRESH"))).toBe(false);
  });
});

describe("upload progress mapping", () => {
  it("counts fully-uploaded images from cumulative byte offsets", () => {
    const cumulative = [100, 250, 400]; // three images ending at these byte offsets
    expect(imagesSentForBytes(cumulative, 0)).toBe(0);
    expect(imagesSentForBytes(cumulative, 99)).toBe(0);
    expect(imagesSentForBytes(cumulative, 100)).toBe(1);
    expect(imagesSentForBytes(cumulative, 260)).toBe(2);
    expect(imagesSentForBytes(cumulative, 400)).toBe(3);
  });
});

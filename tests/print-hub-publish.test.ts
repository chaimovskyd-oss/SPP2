// Validates the runtime main-process publish + outbox logic (gaps G2, G10).
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const printHubMain = require("../electron/printHubMain.cjs") as {
  publishJobPackage: (hubRoot: string, manifest: unknown, images: unknown[], previews?: unknown[]) => string;
  writeToOutbox: (userDataDir: string, hubRoot: string, manifest: unknown, images: unknown[], previews?: unknown[]) => string;
  listOutbox: (userDataDir: string) => string[];
  flushOutbox: (userDataDir: string) => { flushed: number; failed: number };
};

const PNG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

function manifest(jobId: string) {
  return { jobId, jobSchemaVersion: 1, files: [{ path: "images/001.jpg", copies: 1 }] };
}

let hubRoot: string;
let userData: string;

beforeEach(() => {
  hubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spp-hub-pub-"));
  userData = fs.mkdtempSync(path.join(os.tmpdir(), "spp-ud-"));
});

afterEach(() => {
  fs.rmSync(hubRoot, { recursive: true, force: true });
  fs.rmSync(userData, { recursive: true, force: true });
});

describe("publishJobPackage", () => {
  it("publishes an atomic, READY-marked job into Incoming (G2)", () => {
    const dest = printHubMain.publishJobPackage(hubRoot, manifest("JOB1"), [{ path: "images/001.jpg", dataUrl: PNG }]);
    expect(fs.existsSync(path.join(dest, "READY"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "job.json"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "images", "001.jpg"))).toBe(true);
    // staging area must be empty after publish
    expect(fs.readdirSync(path.join(hubRoot, "Incoming", ".staging"))).toEqual([]);
  });
});

describe("outbox (G10)", () => {
  it("queues to outbox then flushes to the hub when reachable", () => {
    printHubMain.writeToOutbox(userData, hubRoot, manifest("JOB2"), [{ path: "images/001.jpg", dataUrl: PNG }]);
    expect(printHubMain.listOutbox(userData)).toHaveLength(1);

    const res = printHubMain.flushOutbox(userData);
    expect(res.flushed).toBe(1);
    expect(res.failed).toBe(0);
    expect(printHubMain.listOutbox(userData)).toHaveLength(0);
    expect(fs.existsSync(path.join(hubRoot, "Incoming", "JOB2", "READY"))).toBe(true);
  });
});

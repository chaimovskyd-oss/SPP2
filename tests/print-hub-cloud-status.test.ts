import { describe, expect, it } from "vitest";

import {
  buildListUrl,
  buildUpsertUrl,
  decodeJwtUserId,
  manifestToStatusRow
} from "@/core/printHub/cloudStatus";
import { buildJobManifest } from "@/core/printHub/jobPackage";

function jwtWithSub(sub: string): string {
  const b64url = (o: unknown): string =>
    Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub, role: "authenticated" })}.sig`;
}

describe("decodeJwtUserId", () => {
  it("extracts the sub claim", () => {
    expect(decodeJwtUserId(jwtWithSub("user-123"))).toBe("user-123");
  });
  it("returns null on garbage", () => {
    expect(decodeJwtUserId("not-a-jwt")).toBeNull();
    expect(decodeJwtUserId("")).toBeNull();
  });
});

describe("manifestToStatusRow", () => {
  const manifest = buildJobManifest({
    source: "spp2_editor", sourceComputer: "DESK-2", size: "10x15", finish: "glossy",
    borderMode: "borderless", copies: 2, jobId: "JOB1",
    files: [{ path: "images/001.jpg", copies: 1 }, { path: "images/002.jpg", copies: 1 }],
    customer: { name: "דני", phone: "", note: "" }
  });

  it("maps manifest fields to the status row", () => {
    const row = manifestToStatusRow("user-9", "PRINT-PC", "printing", manifest);
    expect(row).toMatchObject({
      user_id: "user-9",
      job_id: "JOB1",
      source_computer: "DESK-2",
      target_computer: "PRINT-PC",
      customer_name: "דני",
      size: "10x15",
      finish: "glossy",
      border_mode: "borderless",
      copies: 2,
      image_count: 2,
      state: "printing",
      error: null
    });
  });

  it("captures the failure note only on the failed state", () => {
    const failed = {
      ...manifest,
      statusHistory: [...manifest.statusHistory, { state: "failed" as const, at: new Date().toISOString(), by: "PRINT-PC", note: "מדפסת לא נמצאה" }]
    };
    expect(manifestToStatusRow("u", "PRINT-PC", "failed", failed).error).toBe("מדפסת לא נמצאה");
    expect(manifestToStatusRow("u", "PRINT-PC", "printing", failed).error).toBeNull();
  });
});

describe("REST url builders", () => {
  it("builds an upsert url with the conflict target", () => {
    expect(buildUpsertUrl("https://x.supabase.co/")).toBe("https://x.supabase.co/rest/v1/print_jobs?on_conflict=user_id,job_id");
  });
  it("builds a list url ordered by updated_at", () => {
    expect(buildListUrl("https://x.supabase.co", 50)).toBe("https://x.supabase.co/rest/v1/print_jobs?select=*&order=updated_at.desc&limit=50");
  });
});

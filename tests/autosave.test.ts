import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDocument,
  createPage,
  createProjectEnvelope,
  getLatestRecoveryRecord,
  getRecoveryRecords,
  isQuotaExceededError,
  restoreRecoveryRecord,
  saveRecoveryRecord
} from "@/core";
import { serializeProject } from "@/core/save/projectFormat";

const STORAGE_KEY = "spp.test.recovery";

function makeProject(name = "Autosave test") {
  const document = createDocument({
    name,
    pages: [createPage({ name: "Page 1" })],
    metadata: { mode: "free" }
  });
  return createProjectEnvelope({ document, linkedGroups: [], batchJobs: [] });
}

function makeStorage(options: { throwOnSet?: boolean } = {}): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => {
      if (options.throwOnSet) {
        throw new DOMException("quota", "QuotaExceededError");
      }
      values.set(key, value);
    })
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("autosave recovery safety", () => {
  it("returns a quota result without throwing or overwriting the previous recovery", async () => {
    const project = makeProject();
    const first = await saveRecoveryRecord(project, "unsaved", { storageKey: STORAGE_KEY });
    expect(first.ok).toBe(true);
    const before = localStorage.getItem(STORAGE_KEY);

    vi.stubGlobal("localStorage", {
      ...makeStorage({ throwOnSet: true }),
      getItem: vi.fn((key: string) => (key === STORAGE_KEY ? before : null))
    });

    const result = await saveRecoveryRecord(project, "unsaved", { storageKey: STORAGE_KEY });
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.reason : undefined).toBe("quota-exceeded");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("skips invalid latest recovery records instead of restoring an empty project", () => {
    const project = makeProject("Valid recovery");
    const validRecord = {
      id: "valid",
      projectId: project.metadata.internalUuid,
      projectName: project.document.name,
      savedAt: new Date().toISOString(),
      metadata: project.metadata,
      kind: "unsaved" as const,
      payload: serializeProject(project)
    };
    const invalidRecord = {
      ...validRecord,
      id: "invalid",
      payload: JSON.stringify({ format: "SPP_PROJECT", document: { pages: [] }, metadata: {} })
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify([invalidRecord, validRecord]));

    expect(getRecoveryRecords(STORAGE_KEY).map((record) => record.id)).toEqual(["valid"]);
    expect(getLatestRecoveryRecord(undefined, STORAGE_KEY)?.id).toBe("valid");
    expect(restoreRecoveryRecord(validRecord).document.pages).toHaveLength(1);
  });

  it("detects browser quota exceptions", () => {
    expect(isQuotaExceededError(new DOMException("quota", "QuotaExceededError"))).toBe(true);
    expect(isQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaExceededError(new Error("other"))).toBe(false);
  });
});

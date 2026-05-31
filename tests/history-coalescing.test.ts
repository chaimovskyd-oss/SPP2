import { describe, expect, it } from "vitest";
import {
  applyDocumentAction,
  createHistoryState,
  undoDocumentAction,
  type DocumentAction,
  type HistoryState
} from "@/core/history/actions";
import type { Document } from "@/types/document";

// Minimal Document stand-in: the actions below only read/write a numeric `value`.
function doc(value: number): Document {
  return { value } as unknown as Document;
}
function valueOf(document: Document): number {
  return (document as unknown as { value: number }).value;
}

function setValue(from: number, to: number, mergeKey: string, coalesce: boolean, createdAt: string): DocumentAction {
  return {
    id: `${createdAt}-${to}`,
    type: "SetValue",
    createdAt,
    mergeKey,
    coalesce,
    apply: (document) => ({ ...(document as object), value: to } as unknown as Document),
    undo: (document) => ({ ...(document as object), value: from } as unknown as Document)
  };
}

function run(history: HistoryState, document: Document, action: DocumentAction): { history: HistoryState; document: Document } {
  const result = applyDocumentAction(document, history, action);
  return { history: result.history, document: result.document };
}

describe("history coalescing", () => {
  it("merges consecutive same-key actions within the window into one undo step", () => {
    let history = createHistoryState();
    let document = doc(0);

    ({ history, document } = run(history, document, setValue(0, 5, "slider", true, "2026-01-01T00:00:00.000Z")));
    ({ history, document } = run(history, document, setValue(5, 8, "slider", true, "2026-01-01T00:00:00.200Z")));
    ({ history, document } = run(history, document, setValue(8, 13, "slider", true, "2026-01-01T00:00:00.400Z")));

    expect(history.undoStack).toHaveLength(1);
    expect(valueOf(document)).toBe(13);

    const undone = undoDocumentAction(document, history);
    expect(undone).not.toBeNull();
    // A single undo returns to the value BEFORE the gesture began, not just one tick back.
    expect(valueOf(undone!.document)).toBe(0);
  });

  it("does not merge when the gap exceeds the coalesce window", () => {
    let history = createHistoryState();
    let document = doc(0);
    ({ history, document } = run(history, document, setValue(0, 5, "slider", true, "2026-01-01T00:00:00.000Z")));
    ({ history, document } = run(history, document, setValue(5, 8, "slider", true, "2026-01-01T00:00:02.000Z")));
    expect(history.undoStack).toHaveLength(2);
  });

  it("does not merge when coalesce is false", () => {
    let history = createHistoryState();
    let document = doc(0);
    ({ history, document } = run(history, document, setValue(0, 5, "slider", false, "2026-01-01T00:00:00.000Z")));
    ({ history, document } = run(history, document, setValue(5, 8, "slider", false, "2026-01-01T00:00:00.100Z")));
    expect(history.undoStack).toHaveLength(2);
  });

  it("does not merge across different merge keys", () => {
    let history = createHistoryState();
    let document = doc(0);
    ({ history, document } = run(history, document, setValue(0, 5, "brightness", true, "2026-01-01T00:00:00.000Z")));
    ({ history, document } = run(history, document, setValue(5, 8, "contrast", true, "2026-01-01T00:00:00.100Z")));
    expect(history.undoStack).toHaveLength(2);
  });
});

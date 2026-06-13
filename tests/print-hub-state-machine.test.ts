import { describe, expect, it } from "vitest";

import {
  allowedTransitions,
  canTransition,
  currentState,
  IllegalTransitionError,
  TERMINAL_STATES,
  transition
} from "@/core/printHub/stateMachine";

describe("Print Hub state machine", () => {
  it("allows the canonical happy path", () => {
    expect(canTransition("incoming", "validating")).toBe(true);
    expect(canTransition("validating", "waiting_approval")).toBe(true);
    expect(canTransition("validating", "printing")).toBe(true);
    expect(canTransition("waiting_approval", "printing")).toBe(true);
    expect(canTransition("printing", "done")).toBe(true);
    expect(canTransition("done", "archived")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("incoming", "printing")).toBe(false);
    expect(canTransition("done", "printing")).toBe(false);
    expect(canTransition("archived", "incoming")).toBe(false);
  });

  it("permits retry of a failed job", () => {
    expect(canTransition("failed", "printing")).toBe(true);
  });

  it("transition() returns a history entry and throws on illegal", () => {
    const entry = transition("printing", "done", "PRINT-PC", undefined, "2026-06-05T16:00:00Z");
    expect(entry).toEqual({ state: "done", at: "2026-06-05T16:00:00Z", by: "PRINT-PC" });
    expect(() => transition("incoming", "done", "PRINT-PC")).toThrow(IllegalTransitionError);
  });

  it("derives current state from history", () => {
    expect(currentState([])).toBe("incoming");
    expect(currentState([{ state: "incoming", at: "", by: "x" }, { state: "printing", at: "", by: "x" }])).toBe("printing");
  });

  it("marks terminal states", () => {
    expect(TERMINAL_STATES.has("done")).toBe(true);
    expect(TERMINAL_STATES.has("printing")).toBe(false);
    expect(allowedTransitions("archived")).toEqual([]);
  });
});

// Canonical Print Job state machine (gap G3). Pure / no Node deps so it can run in the
// renderer and be unit-tested. The folder a job lives in is the authoritative state (gap G7);
// these helpers only validate which transitions are legal and produce history entries.

import type { JobStatusHistoryEntry, PrintJobState } from "@/types/printHub";

const TRANSITIONS: Record<PrintJobState, PrintJobState[]> = {
  incoming: ["validating", "canceled"],
  validating: ["waiting_approval", "printing", "failed", "canceled"],
  waiting_approval: ["printing", "rejected", "canceled"],
  printing: ["done", "failed", "canceled"],
  done: ["archived"],
  failed: ["printing", "archived", "canceled"], // failed jobs may be retried (printing) or archived
  rejected: ["archived"],
  canceled: ["archived"],
  archived: []
};

/** Terminal states a job can rest in (before optional archival). */
export const TERMINAL_STATES: ReadonlySet<PrintJobState> = new Set<PrintJobState>([
  "done",
  "failed",
  "canceled",
  "rejected",
  "archived"
]);

export function canTransition(from: PrintJobState, to: PrintJobState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: PrintJobState): PrintJobState[] {
  return [...(TRANSITIONS[from] ?? [])];
}

export class IllegalTransitionError extends Error {
  constructor(public readonly from: PrintJobState, public readonly to: PrintJobState) {
    super(`Illegal Print Hub transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * Validates a transition and returns a history entry to append to the manifest.
 * Throws IllegalTransitionError when the transition is not allowed.
 */
export function transition(
  from: PrintJobState,
  to: PrintJobState,
  by: string,
  note?: string,
  now: string = new Date().toISOString()
): JobStatusHistoryEntry {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  return { state: to, at: now, by, ...(note ? { note } : {}) };
}

/** Derives the current state from a status history (last entry), defaulting to incoming. */
export function currentState(history: JobStatusHistoryEntry[]): PrintJobState {
  return history.length > 0 ? history[history.length - 1].state : "incoming";
}

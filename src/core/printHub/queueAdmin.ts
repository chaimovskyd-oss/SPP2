// Queue inspection + management actions (TS, NODE-ONLY) used by the standalone Print Hub Server
// tray window. Mirrors electron/printHubMain.cjs (which serves the same API to the SPP2 editor —
// the two runtimes can't share code, so this is the bundled-server twin). Printing stays in the
// engine; these helpers only inspect and move job folders.

import fs from "node:fs";
import path from "node:path";

import { STATE_FOLDERS, type PrintJobState } from "@/types/printHub";

export interface QueueJobSummary {
  jobId: string;
  state: PrintJobState;
  size?: string;
  finish?: string;
  borderMode?: string;
  copies?: number;
  fileCount: number;
  customer: { name: string; phone: string; note: string };
  createdAt?: string;
  priority?: string;
  approval?: { mode: string; state: string | null };
  source?: string;
  sourceComputer?: string;
  lastNote?: string;
  error?: string;
}

export type QueueActionName = "cancel" | "reject" | "approve" | "retry" | "archive" | "delete";

function readSummary(jobFolder: string, state: PrintJobState): QueueJobSummary {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(jobFolder, "job.json"), "utf-8"));
    const history = Array.isArray(m.statusHistory) ? m.statusHistory : [];
    const last = history[history.length - 1] ?? {};
    return {
      jobId: m.jobId,
      state,
      size: m.requestedOutput?.size,
      finish: m.requestedOutput?.finish,
      borderMode: m.requestedOutput?.borderMode,
      copies: m.requestedOutput?.copies,
      fileCount: Array.isArray(m.files) ? m.files.length : 0,
      customer: m.customer ?? { name: "", phone: "", note: "" },
      createdAt: m.createdAt,
      priority: m.routing?.priority,
      approval: m.approval ?? { mode: "auto", state: null },
      source: m.source,
      sourceComputer: m.sourceComputer,
      lastNote: last.note ?? ""
    };
  } catch {
    return { jobId: path.basename(jobFolder), state, fileCount: 0, error: "unreadable", customer: { name: "", phone: "", note: "" } };
  }
}

export function listQueue(hubRoot: string): QueueJobSummary[] {
  const out: QueueJobSummary[] = [];
  for (const stateKey of Object.keys(STATE_FOLDERS) as PrintJobState[]) {
    const dir = path.join(hubRoot, STATE_FOLDERS[stateKey]);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      out.push(readSummary(path.join(dir, entry.name), stateKey));
    }
  }
  return out;
}

export function findJobLocation(hubRoot: string, jobId: string): { state: PrintJobState; dir: string } | null {
  for (const stateKey of Object.keys(STATE_FOLDERS) as PrintJobState[]) {
    const dir = path.join(hubRoot, STATE_FOLDERS[stateKey], jobId);
    if (fs.existsSync(dir)) return { state: stateKey, dir };
  }
  return null;
}

function move(hubRoot: string, jobId: string, from: PrintJobState, to: PrintJobState): void {
  const src = path.join(hubRoot, STATE_FOLDERS[from], jobId);
  const dest = path.join(hubRoot, STATE_FOLDERS[to], jobId);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(src, dest);
}

function setApproval(jobFolder: string, state: string): void {
  const file = path.join(jobFolder, "job.json");
  const m = JSON.parse(fs.readFileSync(file, "utf-8"));
  m.approval = { ...(m.approval ?? { mode: "require_approval" }), state };
  fs.writeFileSync(file, JSON.stringify(m, null, 2), "utf-8");
}

export function jobAction(hubRoot: string, jobId: string, action: QueueActionName): { success: boolean; error?: string } {
  const loc = findJobLocation(hubRoot, jobId);
  if (!loc) return { success: false, error: "job not found" };
  switch (action) {
    case "cancel":
      // Only cancel jobs still in flight (never a finished/printing one we'd re-process).
      if (!["incoming", "validating", "waiting_approval"].includes(loc.state)) return { success: false, error: "העבודה כבר אינה בתור" };
      move(hubRoot, jobId, loc.state, "canceled");
      return { success: true };
    case "reject":
      // Approve/Reject only act on a job that is genuinely waiting (prevents accidental re-print).
      if (loc.state !== "waiting_approval") return { success: false, error: "העבודה אינה ממתינה לאישור" };
      setApproval(loc.dir, "rejected");
      move(hubRoot, jobId, loc.state, "rejected");
      return { success: true };
    case "approve":
      if (loc.state !== "waiting_approval") return { success: false, error: "העבודה אינה ממתינה לאישור" };
      setApproval(loc.dir, "approved");
      move(hubRoot, jobId, loc.state, "incoming");
      return { success: true };
    case "retry":
      if (loc.state !== "failed") return { success: false, error: "ניתן להדפיס שוב רק עבודה שנכשלה" };
      move(hubRoot, jobId, loc.state, "incoming");
      return { success: true };
    case "archive":
      move(hubRoot, jobId, loc.state, "archived");
      return { success: true };
    case "delete":
      fs.rmSync(loc.dir, { recursive: true, force: true });
      return { success: true };
    default:
      return { success: false, error: `unknown action: ${String(action)}` };
  }
}

// Print Hub data model.
//
// IMPORTANT (gap G8): a Print Job is an OUTBOUND artifact, not part of a saved design
// document. It carries its own `jobSchemaVersion`, fully independent of the project
// PROJECT_SCHEMA_VERSION. Never fold these together.

export const JOB_SCHEMA_VERSION = 1;

/** Canonical job lifecycle states (gap G3). The folder a job lives in is the source of truth (gap G7). */
export type PrintJobState =
  | "incoming"
  | "validating"
  | "waiting_approval"
  | "printing"
  | "done"
  | "failed"
  | "canceled"
  | "rejected"
  | "archived";

/** On-disk folder name per state, under the hub root (e.g. C:\SPP_PrintHub\<folder>). */
export const STATE_FOLDERS: Record<PrintJobState, string> = {
  incoming: "Incoming",
  validating: "Validating",
  waiting_approval: "WaitingApproval",
  printing: "Printing",
  done: "Done",
  failed: "Failed",
  canceled: "Canceled",
  rejected: "Rejected",
  archived: "Archive"
};

export type PrintProductType = "photo_print";
export type PrintFinish = "glossy" | "matte";
export type BorderMode = "borderless" | "white_border";
export type JobPriority = "normal" | "high" | "waiting_customer";
export type ApprovalMode = "auto" | "require_approval";
export type ApprovalState = "pending" | "approved" | "rejected" | null;
export type JobSource = "spp2_editor" | "windows_explorer_quick_print";
export type StationRole = "designer" | "operator" | "admin" | "trusted";

export interface RequestedOutput {
  /** Free-form preset size key, e.g. "10x15", "15x20". Resolved to a concrete preset on the server. */
  size: string;
  finish: PrintFinish;
  borderMode: BorderMode;
  copies: number;
}

export interface JobRouting {
  targetDeviceRole: string;
  preferredDeviceId: string | null;
  priority: JobPriority;
}

export interface JobApproval {
  mode: ApprovalMode;
  state: ApprovalState;
}

export interface JobCustomer {
  name: string;
  phone: string;
  note: string;
}

export interface MediaCheck {
  enabled: boolean;
  requiredUnits: number;
  unitType: string;
  allowSmartSplit: boolean;
  onInsufficientMedia: "ask_admin" | "auto_split" | "fail";
}

export interface SplitInfo {
  isSplitJob: boolean;
  parentJobId: string | null;
  partIndex: number | null;
  partCount: number | null;
}

export interface OrderSummaryConfig {
  enabled: boolean;
  printReceipt: boolean;
  receiptPrinterPreset: string | null;
  includeQr: boolean;
  template: string;
}

export interface JobFile {
  /** Relative path inside the job folder, e.g. "images/001.jpg". */
  path: string;
  copies: number;
  /** Pixel dimensions of the already-rendered printable file, used to preserve final orientation. */
  renderedWidthPx?: number;
  renderedHeightPx?: number;
  /** Strong per-file content hash, fed into the fingerprint (gap G9). Optional for callers that cannot compute it. */
  contentHash?: string;
}

export interface JobStatusHistoryEntry {
  state: PrintJobState;
  at: string;
  by: string;
  note?: string;
}

/** The full `job.json` manifest. */
export interface PrintJobManifest {
  jobSchemaVersion: number;
  jobId: string;
  createdAt: string;
  source: JobSource;
  sourceComputer: string;
  productType: PrintProductType;
  requestedOutput: RequestedOutput;
  routing: JobRouting;
  approval: JobApproval;
  customer: JobCustomer;
  mediaCheck: MediaCheck;
  splitInfo: SplitInfo;
  orderSummary: OrderSummaryConfig;
  /** Stable idempotency key derived from files + output params (gap G9). */
  jobFingerprint: string;
  /** When true, print only the first image (test print, spec §18#3). Optional/back-compatible. */
  testPrintFirstOnly?: boolean;
  files: JobFile[];
  statusHistory: JobStatusHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Printer profiles & presets (Phase 3, gaps G4/G5)
// ---------------------------------------------------------------------------

export interface PrintPreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  bleedMm: number;
  finish: PrintFinish;
  borderMode: BorderMode;
  /** Optional ICC profile path; when absent the renderer targets sRGB (gap G4). */
  iccProfilePath?: string;
  /** Admin-set seconds to print one image on this preset, for order time estimates. */
  secondsPerPrint?: number;
  copies: number;
}

export interface PrinterProfile {
  deviceId: string;
  windowsPrinterName: string;
  displayName: string;
  supportedProducts: PrintProductType[];
  supportedSizes: string[];
  supportedFinishes: PrintFinish[];
  presets: PrintPreset[];
}

// ---------------------------------------------------------------------------
// Stations & media (Phases 6/7, gaps G14/G15)
// ---------------------------------------------------------------------------

export interface Station {
  computerName: string;
  displayName: string;
  role: StationRole;
  trusted: boolean;
}

export interface MediaItem {
  presetId: string;
  /** Advisory only in V1 — not synced from printer hardware (gap G14). */
  remainingUnits: number;
  unitType: string;
}

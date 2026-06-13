// Build / parse / validate of the job.json manifest, plus the idempotency fingerprint.
// Pure (no Node deps) so it can run in the renderer and be unit-tested.

import {
  JOB_SCHEMA_VERSION,
  type ApprovalMode,
  type BorderMode,
  type JobCustomer,
  type JobFile,
  type JobPriority,
  type JobSource,
  type PrintFinish,
  type PrintJobManifest
} from "@/types/printHub";

export const JOB_FOLDER_PREFIX = "job_";
export const JOB_MANIFEST_NAME = "job.json";

/** Deterministic 128-bit hash (cyrb128) rendered as hex. Used to combine strong per-file
 * hashes + output params into a stable idempotency key (gap G9). Not cryptographic — the
 * per-file content hashes (sha256) carry the cryptographic strength. */
export function stableHashHex(input: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i += 1) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1, h2, h3, h4].map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("");
}

export interface JobFingerprintInput {
  files: JobFile[];
  size: string;
  finish: PrintFinish;
  borderMode: BorderMode;
  copies: number;
}

/** Stable fingerprint over the printable content + output params. Order-independent on files. */
export function computeJobFingerprint(input: JobFingerprintInput): string {
  const fileTokens = input.files
    .map((f) => `${f.path}|${f.copies}|${f.contentHash ?? ""}`)
    .sort()
    .join(";");
  const canonical = [
    `sz=${input.size}`,
    `fin=${input.finish}`,
    `bm=${input.borderMode}`,
    `cp=${input.copies}`,
    `files=${fileTokens}`
  ].join("&");
  return `fp1:${stableHashHex(canonical)}`;
}

/** Generates a sortable job id: <YYYY-MM-DD_HHMMSS>_<RAND>. */
export function generateJobId(now: Date = new Date(), random: string = randomSuffix()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}_${time}_${random}`;
}

function randomSuffix(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export interface BuildJobManifestInput {
  source: JobSource;
  sourceComputer: string;
  size: string;
  finish: PrintFinish;
  borderMode: BorderMode;
  copies: number;
  files: JobFile[];
  priority?: JobPriority;
  approvalMode?: ApprovalMode;
  customer?: Partial<JobCustomer>;
  preferredDeviceId?: string | null;
  jobId?: string;
  createdAt?: string;
  testPrintFirstOnly?: boolean;
}

/** Builds a complete, valid manifest with sensible defaults and a computed fingerprint. */
export function buildJobManifest(input: BuildJobManifestInput): PrintJobManifest {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const jobId = input.jobId ?? generateJobId();
  const fingerprint = computeJobFingerprint({
    files: input.files,
    size: input.size,
    finish: input.finish,
    borderMode: input.borderMode,
    copies: input.copies
  });
  return {
    jobSchemaVersion: JOB_SCHEMA_VERSION,
    jobId,
    createdAt,
    source: input.source,
    sourceComputer: input.sourceComputer,
    productType: "photo_print",
    requestedOutput: {
      size: input.size,
      finish: input.finish,
      borderMode: input.borderMode,
      copies: input.copies
    },
    routing: {
      targetDeviceRole: "photo_printer",
      preferredDeviceId: input.preferredDeviceId ?? null,
      priority: input.priority ?? "normal"
    },
    approval: {
      mode: input.approvalMode ?? "auto",
      state: input.approvalMode === "require_approval" ? "pending" : null
    },
    customer: {
      name: input.customer?.name ?? "",
      phone: input.customer?.phone ?? "",
      note: input.customer?.note ?? ""
    },
    mediaCheck: {
      enabled: true,
      requiredUnits: estimateRequiredUnits(input.files, input.copies),
      unitType: `${input.size}_prints`,
      allowSmartSplit: true,
      onInsufficientMedia: "ask_admin"
    },
    splitInfo: {
      isSplitJob: false,
      parentJobId: null,
      partIndex: null,
      partCount: null
    },
    orderSummary: {
      enabled: false,
      printReceipt: false,
      receiptPrinterPreset: null,
      includeQr: true,
      template: "photo_order_summary_he"
    },
    jobFingerprint: fingerprint,
    ...(input.testPrintFirstOnly ? { testPrintFirstOnly: true } : {}),
    files: input.files,
    statusHistory: [{ state: "incoming", at: createdAt, by: input.sourceComputer }]
  };
}

/** Total printed units = sum(file.copies) * job copies (gap G5 unit accounting). */
export function estimateRequiredUnits(files: JobFile[], jobCopies: number): number {
  const perPass = files.reduce((sum, f) => sum + Math.max(1, f.copies), 0);
  return perPass * Math.max(1, jobCopies);
}

export function serializeManifest(manifest: PrintJobManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export class InvalidManifestError extends Error {
  constructor(message: string) {
    super(`Invalid job.json: ${message}`);
    this.name = "InvalidManifestError";
  }
}

/** Parses + structurally validates a manifest, throwing InvalidManifestError on any problem. */
export function parseManifest(json: string): PrintJobManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new InvalidManifestError("not valid JSON");
  }
  return validateManifest(raw);
}

export function validateManifest(raw: unknown): PrintJobManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new InvalidManifestError("not an object");
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.jobSchemaVersion !== "number") {
    throw new InvalidManifestError("missing jobSchemaVersion");
  }
  if (m.jobSchemaVersion > JOB_SCHEMA_VERSION) {
    throw new InvalidManifestError(`unsupported jobSchemaVersion ${m.jobSchemaVersion}`);
  }
  if (typeof m.jobId !== "string" || m.jobId.length === 0) {
    throw new InvalidManifestError("missing jobId");
  }
  if (!Array.isArray(m.files) || m.files.length === 0) {
    throw new InvalidManifestError("files must be a non-empty array");
  }
  for (const f of m.files as unknown[]) {
    if (typeof f !== "object" || f === null || typeof (f as JobFile).path !== "string") {
      throw new InvalidManifestError("each file needs a path");
    }
  }
  const out = raw as PrintJobManifest;
  if (typeof out.requestedOutput?.size !== "string") {
    throw new InvalidManifestError("missing requestedOutput.size");
  }
  return out;
}

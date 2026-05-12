import { captureError, writeLog } from "@/core/logging/logger";

export interface Job {
  id: string;
  type: string;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  progress: number;
  priority: number;
  cancellable: boolean;
  createdAt: string;
  updatedAt: string;
  error?: string;
  itemErrors?: Array<{ itemId: string; error: string }>;
}

export interface JobContext {
  signal: AbortSignal;
  updateProgress: (progress: number) => void;
  addItemError: (itemId: string, error: string) => void;
}

export type JobRunner<TPayload = unknown> = (payload: TPayload, context: JobContext) => Promise<void>;

interface QueueItem {
  job: Job;
  payload: unknown;
  runner: JobRunner;
  controller: AbortController;
}

export class JobQueue {
  private readonly items = new Map<string, QueueItem>();
  private running = 0;

  constructor(private readonly concurrency = 2, private readonly onChange: (jobs: Job[]) => void = () => undefined) {}

  enqueue<TPayload>(type: string, payload: TPayload, runner: JobRunner<TPayload>, options: { priority?: number; cancellable?: boolean } = {}): Job {
    const now = new Date().toISOString();
    const job: Job = {
      id: crypto.randomUUID(),
      type,
      status: "pending",
      progress: 0,
      priority: options.priority ?? 0,
      cancellable: options.cancellable ?? true,
      createdAt: now,
      updatedAt: now
    };
    this.items.set(job.id, {
      job,
      payload,
      runner: runner as JobRunner,
      controller: new AbortController()
    });
    writeLog("job", "info", "עבודה נוספה לתור", { jobId: job.id, type });
    this.emit();
    void this.drain();
    return job;
  }

  list(): Job[] {
    return [...this.items.values()].map((item) => item.job);
  }

  cancel(jobId: string): void {
    const item = this.items.get(jobId);
    if (item === undefined || !item.job.cancellable) {
      return;
    }
    item.controller.abort();
    this.patch(jobId, { status: "cancelled", updatedAt: new Date().toISOString() });
  }

  retry(jobId: string): void {
    const item = this.items.get(jobId);
    if (item === undefined || item.job.status !== "failed") {
      return;
    }
    item.controller = new AbortController();
    item.job = { ...item.job, status: "pending", progress: 0, error: undefined, updatedAt: new Date().toISOString() };
    this.emit();
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running >= this.concurrency) {
      return;
    }
    const next = [...this.items.values()]
      .filter((item) => item.job.status === "pending")
      .sort((a, b) => b.job.priority - a.job.priority || a.job.createdAt.localeCompare(b.job.createdAt))[0];
    if (next === undefined) {
      return;
    }
    this.running += 1;
    this.patch(next.job.id, { status: "running", updatedAt: new Date().toISOString() });
    try {
      await next.runner(next.payload, {
        signal: next.controller.signal,
        updateProgress: (progress) => this.patch(next.job.id, { progress: clamp(progress), updatedAt: new Date().toISOString() }),
        addItemError: (itemId, error) => {
          const job = this.items.get(next.job.id)?.job;
          this.patch(next.job.id, { itemErrors: [...(job?.itemErrors ?? []), { itemId, error }], updatedAt: new Date().toISOString() });
        }
      });
      if (next.controller.signal.aborted) {
        this.patch(next.job.id, { status: "cancelled", updatedAt: new Date().toISOString() });
      } else {
        this.patch(next.job.id, { status: "completed", progress: 1, updatedAt: new Date().toISOString() });
      }
    } catch (error) {
      if (next.controller.signal.aborted) {
        this.patch(next.job.id, { status: "cancelled", updatedAt: new Date().toISOString() });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        captureError("job", error, { jobId: next.job.id, type: next.job.type });
        this.patch(next.job.id, { status: "failed", error: message, updatedAt: new Date().toISOString() });
      }
    } finally {
      this.running -= 1;
      void this.drain();
    }
  }

  private patch(jobId: string, patch: Partial<Job>): void {
    const item = this.items.get(jobId);
    if (item === undefined) {
      return;
    }
    item.job = { ...item.job, ...patch };
    this.emit();
  }

  private emit(): void {
    this.onChange(this.list());
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

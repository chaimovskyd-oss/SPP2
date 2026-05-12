import type { Job, JobContext, JobRunner } from "@/core/jobs/jobQueue";

export interface WorkerProgressEvent {
  jobId: string;
  progress: number;
  message?: string;
}

export interface WorkerBridge<TPayload = unknown> {
  run: JobRunner<TPayload>;
  supportsCancellation: boolean;
}

export function createTypeScriptWorkerBridge<TPayload>(
  handler: (payload: TPayload, context: JobContext) => Promise<void>
): WorkerBridge<TPayload> {
  return {
    supportsCancellation: true,
    run: handler
  };
}

export function createPythonBridgePlaceholder<TPayload>(type: string): WorkerBridge<TPayload> {
  return {
    supportsCancellation: true,
    run: async (_payload, context) => {
      context.updateProgress(0);
      throw new Error(`Python bridge is not connected yet for ${type}`);
    }
  };
}

export function jobCanRunInBackground(job: Job): boolean {
  return job.status === "pending" || job.status === "running" || job.status === "paused";
}

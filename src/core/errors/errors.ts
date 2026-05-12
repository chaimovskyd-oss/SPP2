import { captureError } from "@/core/logging/logger";
import type { LogChannel } from "@/core/logging/logger";

export type AppErrorCode =
  | "ASSET_IMPORT_FAILED"
  | "ASSET_MISSING"
  | "EXPORT_FAILED"
  | "WORKER_FAILED"
  | "RECOVERY_FAILED"
  | "PROJECT_MIGRATION_FAILED";

export interface AppError {
  code: AppErrorCode;
  message: string;
  channel: LogChannel;
  recoverable: boolean;
  cause?: unknown;
  context?: Record<string, unknown>;
}

export function createAppError(input: AppError): AppError {
  captureError(input.channel, input.cause ?? input.message, {
    code: input.code,
    recoverable: input.recoverable,
    ...(input.context ?? {})
  });
  return input;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

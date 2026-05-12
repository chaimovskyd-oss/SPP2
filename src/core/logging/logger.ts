export type LogChannel = "app" | "job" | "import" | "export" | "recovery" | "error" | "smartCrop" | "fillFrames";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppLogEntry {
  id: string;
  channel: LogChannel;
  level: LogLevel;
  message: string;
  createdAt: string;
  context?: Record<string, unknown>;
}

const MAX_LOGS = 500;
const logs: AppLogEntry[] = [];

export function writeLog(channel: LogChannel, level: LogLevel, message: string, context?: Record<string, unknown>): AppLogEntry {
  const entry: AppLogEntry = {
    id: crypto.randomUUID(),
    channel,
    level,
    message,
    createdAt: new Date().toISOString(),
    context
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  return entry;
}

export function getLogs(channel?: LogChannel): AppLogEntry[] {
  return channel === undefined ? [...logs] : logs.filter((entry) => entry.channel === channel);
}

export function clearLogs(): void {
  logs.length = 0;
}

export function captureError(channel: LogChannel, error: unknown, context?: Record<string, unknown>): AppLogEntry {
  const message = error instanceof Error ? error.message : String(error);
  return writeLog(channel, "error", message, context);
}

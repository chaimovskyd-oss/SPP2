export interface ProgressEvent {
  jobId: string;
  progress: number;
  message?: string;
}

export interface PythonService<TInput, TOutput> {
  call(input: TInput): Promise<TOutput>;
  callBatch(inputs: TInput[]): Promise<TOutput[]>;
  cancel(jobId: string): Promise<void>;
}

export interface PythonBridge {
  call<TOutput>(service: string, method: string, params: Record<string, unknown>): Promise<TOutput>;
  callStreaming<TOutput>(
    service: string,
    method: string,
    params: Record<string, unknown>,
    onProgress: (progress: ProgressEvent) => void
  ): Promise<TOutput>;
  cancel(jobId: string): Promise<void>;
}

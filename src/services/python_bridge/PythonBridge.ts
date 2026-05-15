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

// ─── Collage-specific bridge types ───────────────────────────────────────────

export interface CollageAnalyzeRequest {
  imagePaths: string[];
}

export interface CollageFaceRegion {
  cx: number; cy: number; w: number; h: number; confidence: number;
}

export interface CollageAnalyzeResult {
  results: Array<{
    assetId: string;
    width: number;
    height: number;
    faceRegions: CollageFaceRegion[];
    analysisScore: number;
    imageType: "noPeople" | "singlePortrait" | "group" | "fullBody";
  }>;
}

export interface CollageExportRequest {
  collageRuleJson: string;
  imageAssignmentsJson: string;
  imagePaths: Record<string, string>;
  outputPath: string;
  format: "jpg" | "png" | "pdf";
  dpi: number;
  includeBleed: boolean;
}

export interface CollageExportResult {
  success: boolean;
  outputPath: string;
  fileSizeBytes: number;
}

/** Thin wrappers — require PythonBridge instance injected at startup */
let _bridge: PythonBridge | null = null;
export function setCollagePythonBridge(bridge: PythonBridge): void { _bridge = bridge; }

export function analyzeCollageImages(request: CollageAnalyzeRequest): Promise<CollageAnalyzeResult> {
  if (!_bridge) return Promise.reject(new Error("Python bridge unavailable"));
  return _bridge.call<CollageAnalyzeResult>("collage", "analyze", request as unknown as Record<string, unknown>);
}

export function exportCollage(request: CollageExportRequest): Promise<CollageExportResult> {
  if (!_bridge) return Promise.reject(new Error("Python bridge unavailable"));
  return _bridge.call<CollageExportResult>("collage", "export", request as unknown as Record<string, unknown>);
}

export function isPythonBridgeAvailable(): boolean { return _bridge !== null; }

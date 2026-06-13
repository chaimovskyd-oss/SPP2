// Driver Adapter abstraction (gap G1). The actual print backend for V1 is the local Windows
// spooler (running ONLY on the print-server machine), but every concrete backend is hidden
// behind this interface so it can be swapped (hot-folder transport, Python preprocessing, a
// future printer SDK) without touching the queue engine.
//
// This module is pure (interface + registry). Concrete adapters that touch Node/Electron APIs
// live in the server process (Phase 2) and register themselves here.

import type { PrintPreset } from "@/types/printHub";

export interface PrintableImage {
  /** Absolute path to a render-ready image already sized for the preset (gap G5/G6). */
  filePath: string;
  copies: number;
  /** Optional per-file physical page size. When absent, the preset's native size is used. */
  pageWidthMicrons?: number;
  pageHeightMicrons?: number;
}

export interface PrintRequest {
  jobId: string;
  preset: PrintPreset;
  windowsPrinterName: string;
  images: PrintableImage[];
}

export interface PrintProgress {
  printedImages: number;
  totalImages: number;
}

export interface PrintResult {
  success: boolean;
  /** Paths (relative job paths or filePaths) that were confirmed printed — enables resume (gap G13). */
  printedFiles: string[];
  error?: string;
}

export interface DriverAdapter {
  readonly id: string;
  /** Whether this adapter can service the given printer/preset. */
  supports(request: PrintRequest): boolean;
  print(request: PrintRequest, onProgress?: (p: PrintProgress) => void): Promise<PrintResult>;
}

const registry = new Map<string, DriverAdapter>();

export function registerDriverAdapter(adapter: DriverAdapter): void {
  registry.set(adapter.id, adapter);
}

export function listDriverAdapters(): DriverAdapter[] {
  return [...registry.values()];
}

/** Resolves the first registered adapter that supports the request. */
export function resolveDriverAdapter(request: PrintRequest): DriverAdapter | undefined {
  return listDriverAdapters().find((adapter) => adapter.supports(request));
}

/** Test/reset hook. */
export function clearDriverAdapters(): void {
  registry.clear();
}

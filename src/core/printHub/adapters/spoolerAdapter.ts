// Windows-spooler DriverAdapter (gap G1). V1 print backend: render-ready images are printed
// locally on the print-server machine through the installed Windows driver. The actual print
// syscall is injected (`PrintImageFn`) so the adapter stays platform-agnostic and unit-testable;
// the Electron tray supplies the real implementation (hidden BrowserWindow + webContents.print).

import type { DriverAdapter, PrintProgress, PrintRequest, PrintResult } from "../driverAdapter";

export interface PrintImageOptions {
  printerName: string;
  /** Physical page size in microns — derived from the preset (gap G5). */
  pageWidthMicrons: number;
  pageHeightMicrons: number;
  borderless: boolean;
}

export type PrintImageFn = (filePath: string, options: PrintImageOptions) => Promise<void>;

const MICRONS_PER_MM = 1000;

export function createSpoolerAdapter(printImage: PrintImageFn): DriverAdapter {
  return {
    id: "windows_spooler",
    supports: (request: PrintRequest): boolean => request.windowsPrinterName.length > 0,
    async print(request: PrintRequest, onProgress?: (p: PrintProgress) => void): Promise<PrintResult> {
      const printed: string[] = [];
      const totalImages = request.images.length;
      const bleed = Math.max(0, request.preset.bleedMm);
      const options: Omit<PrintImageOptions, "printerName"> = {
        pageWidthMicrons: Math.round((request.preset.widthMm + 2 * bleed) * MICRONS_PER_MM),
        pageHeightMicrons: Math.round((request.preset.heightMm + 2 * bleed) * MICRONS_PER_MM),
        borderless: request.preset.borderMode === "borderless"
      };
      try {
        for (let i = 0; i < request.images.length; i += 1) {
          const img = request.images[i];
          const pageOptions = {
            ...options,
            pageWidthMicrons: img.pageWidthMicrons ?? options.pageWidthMicrons,
            pageHeightMicrons: img.pageHeightMicrons ?? options.pageHeightMicrons
          };
          for (let copy = 0; copy < Math.max(1, img.copies); copy += 1) {
            await printImage(img.filePath, { printerName: request.windowsPrinterName, ...pageOptions });
          }
          printed.push(img.filePath);
          onProgress?.({ printedImages: i + 1, totalImages });
        }
        return { success: true, printedFiles: printed };
      } catch (err) {
        return { success: false, printedFiles: printed, error: err instanceof Error ? err.message : String(err) };
      }
    }
  };
}

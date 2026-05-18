export type PdfPageSourceType = "pdf" | "image" | "office-converted" | "blank";

export type PdfPageRotation = 0 | 90 | 180 | 270;

export type PdfResizeBehavior = "fit" | "fill" | "stretch" | "center" | "fit-width" | "fit-height";

export type PdfApplyScope = "current" | "selected" | "all" | "from-current";

export type PdfUnit = "mm" | "cm" | "in";

export type PdfOrientationMode = "source" | "portrait" | "landscape";

export interface PdfStudioSourceFile {
  id: string;
  name: string;
  sourceType: "pdf" | "office-converted";
  bytes: Uint8Array;
}

export interface PdfPageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: boolean;
}

export type PdfOverlayObject =
  | {
      id: string;
      type: "text";
      x: number;
      y: number;
      width: number;
      height: number;
      rotation?: number;
      text: string;
      fontFamily: string;
      fontSize: number;
      color: string;
    }
  | {
      id: string;
      type: "image";
      x: number;
      y: number;
      width: number;
      height: number;
      rotation?: number;
      dataUrl: string;
    }
  | {
      id: string;
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rotation?: number;
      stroke: string;
      fill?: string;
      strokeWidth: number;
    }
  | {
      id: string;
      type: "line";
      x: number;
      y: number;
      width: number;
      height: number;
      stroke: string;
      strokeWidth: number;
    };

export interface PdfStudioPage {
  id: string;
  sourceType: PdfPageSourceType;
  title: string;
  sourceFileId?: string;
  sourcePageIndex?: number;
  imageBytes?: Uint8Array;
  imageMime?: string;
  imageDataUrl?: string;
  widthPt: number;
  heightPt: number;
  originalWidthPt: number;
  originalHeightPt: number;
  rotation: PdfPageRotation;
  resizeBehavior: PdfResizeBehavior;
  overlayObjects: PdfOverlayObject[];
  adjustments: PdfPageAdjustments;
  flattened: boolean;
}

export interface PdfStudioDocument {
  id: string;
  title: string;
  files: Record<string, PdfStudioSourceFile>;
  pages: PdfStudioPage[];
  selectedPageIds: string[];
  activePageId?: string;
}

export interface PdfPageRenderInput {
  page: PdfStudioPage;
  source?: PdfStudioSourceFile;
  scale: number;
  rotation?: PdfPageRotation;
}

export interface PdfRenderedPage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

export const DEFAULT_ADJUSTMENTS: PdfPageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  grayscale: false
};

export const DEFAULT_RESIZE_BEHAVIOR: PdfResizeBehavior = "fit";

export const PT_TO_MM = 25.4 / 72;
export const MM_TO_PT = 72 / 25.4;

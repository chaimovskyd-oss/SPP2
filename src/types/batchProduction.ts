import type { ID } from "./primitives";

export type BatchVariableField =
  | {
      id: string;
      type: "image";
      layerId: ID;
      label: string;
      fitMode: "cover" | "contain" | "fill";
      smartCrop: boolean;
      preserveMask: boolean;
      applyImageAdjustmentsByDefault: boolean;
    }
  | {
      id: string;
      type: "text";
      layerId: ID;
      label: string;
      sourceField: "name" | string;
      preserveTextStyle?: boolean;
      autoResize: boolean;
      minFontScale: number;
    };

export interface BatchProductionDocMeta {
  isTemplate: boolean;
  templateId: string;
  templateName: string;
  description?: string;
  tags?: string[];
  compatibleProductIds?: string[];
  canvas: {
    widthPx: number;
    heightPx: number;
    widthMm?: number;
    heightMm?: number;
    dpi: number;
    unit: "mm" | "px";
    orientation: "portrait" | "landscape" | "square";
    ratio: number;
  };
  variableFields: BatchVariableField[];
  createdAt: string;
  updatedAt: string;
}

export const BATCH_PRODUCTION_META_KEY = "batchProduction" as const;

/** Narrowed type for text-only variable fields. */
export type BatchTextVariableField = Extract<BatchVariableField, { type: "text" }>;

// ─── Wizard record ────────────────────────────────────────────────────────────

export interface BatchRecord {
  id: string;
  file: File;
  previewUrl: string; // URL.createObjectURL — revoke on cleanup
  /** fieldId → value. One entry per variable text field. */
  fields: Record<string, string>;
  originalFilename: string;
  status: "ready" | "warning"; // warning = at least one text field is empty
}

export interface BatchWizardResult {
  templateId: string;
  templateName: string;
  records: BatchRecord[];
}

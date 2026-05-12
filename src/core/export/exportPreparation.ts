import { buildRenderModel } from "@/core/rendering/renderModel";
import type { Document, Page } from "@/types/document";

export interface ExportValidationIssue {
  code: "MISSING_ASSET" | "INVALID_DPI" | "INVALID_PAGE" | "MISSING_FONT";
  message: string;
  pageId?: string;
  layerId?: string;
  assetId?: string;
}

export interface ExportJobPlan {
  id: string;
  documentId: string;
  pageIds: string[];
  format: "png" | "jpg" | "pdf";
  issues: ExportValidationIssue[];
}

export function validatePageForExport(page: Page): ExportValidationIssue[] {
  const issues: ExportValidationIssue[] = [];
  if (page.width <= 0 || page.height <= 0) {
    issues.push({ code: "INVALID_PAGE", pageId: page.id, message: "מידות העמוד אינן תקינות" });
  }
  if (page.setup.dpi <= 0) {
    issues.push({ code: "INVALID_DPI", pageId: page.id, message: "DPI אינו תקין" });
  }
  return issues;
}

export function validateDocumentForExport(document: Document, pageIds = document.pages.map((page) => page.id)): ExportValidationIssue[] {
  const assetById = new Map(document.assets.map((asset) => [asset.id, asset]));
  return document.pages
    .filter((page) => pageIds.includes(page.id))
    .flatMap((page) => {
      const renderModel = buildRenderModel(page, document.assets, "export");
      const missingAssets = renderModel.layers.flatMap((renderLayer) =>
        renderLayer.asset?.missing === true
          ? [{ code: "MISSING_ASSET" as const, message: "נכס חסר לייצוא", pageId: page.id, layerId: renderLayer.layer.id, assetId: renderLayer.asset.assetId }]
          : []
      );
      const missingFonts = page.layers.flatMap((layer) =>
        layer.type === "text" && layer.fontFamily.length === 0
          ? [{ code: "MISSING_FONT" as const, message: "חסר פונט לשכבת טקסט", pageId: page.id, layerId: layer.id }]
          : []
      );
      const missingAssetRecords = document.assets
        .filter((asset) => asset.status === "missing" && assetById.has(asset.id))
        .map((asset) => ({ code: "MISSING_ASSET" as const, message: "נכס חסר בפרויקט", assetId: asset.id }));
      return [...validatePageForExport(page), ...missingAssets, ...missingFonts, ...missingAssetRecords];
    });
}

export function createExportJobPlan(document: Document, format: ExportJobPlan["format"], pageIds = document.pages.map((page) => page.id)): ExportJobPlan {
  return {
    id: crypto.randomUUID(),
    documentId: document.id,
    pageIds,
    format,
    issues: validateDocumentForExport(document, pageIds)
  };
}

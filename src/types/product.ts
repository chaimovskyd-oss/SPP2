import type { Template } from "./template";
import type { ExportSettings, ID, Metadata, PrintSpec, Rect, Size, VersionedEntity } from "./primitives";

export interface MaskDefinition extends VersionedEntity {
  id: ID;
  name: string;
  type: "shape" | "svg" | "png";
  pathData?: string;
  assetId?: ID;
}

export interface ProductMockup extends VersionedEntity {
  id: ID;
  name: string;
  assetId: ID;
  placement: Rect;
}

export interface ProductDefinition extends VersionedEntity {
  id: ID;
  name: string;
  category: string;
  printSpec: PrintSpec;
  canvasSize: Size;
  safeArea: Rect;
  bleed: PrintSpec["bleed"];
  templates: Template[];
  masks: MaskDefinition[];
  mockups: ProductMockup[];
  defaultExportSettings: ExportSettings;
  metadata: Metadata;
}

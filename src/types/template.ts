import type { TextLayer } from "./layers";
import type { ExportSettings, FitMode, ID, Metadata, PageSetup, PrintSpec, VersionedEntity } from "./primitives";

export type ModeType =
  | "free"
  | "grid"
  | "mask"
  | "class_photo"
  | "photo_print"
  | "product"
  | "collage"
  | "pdf_tools"
  | "batch_production";

export interface TextStyle extends VersionedEntity {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  alignment: TextLayer["alignment"];
  direction: TextLayer["direction"];
}

export interface TemplatePage extends VersionedEntity {
  id: ID;
  pageSetup: PageSetup;
  layerIds: ID[];
}

export interface TemplateSlot extends VersionedEntity {
  id: ID;
  pageId: ID;
  type: "image" | "text" | "mixed";
  frameId: ID;
  batchIndex?: number;
  linkedGroup?: ID;
  required: boolean;
  defaultFitMode: FitMode;
  allowedContentTypes: string[];
  metadata: Metadata;
}

export interface TemplateTextZone extends VersionedEntity {
  id: ID;
  pageId: ID;
  role: "title" | "subtitle" | "name" | "caption" | "footer" | "custom";
  linkedGroup?: ID;
  defaultTextStyle: TextStyle;
  editable: boolean;
  batchConnectedToSlot?: ID;
}

export interface AutoFillRule extends VersionedEntity {
  id: ID;
  source: "assetOrder" | "filename" | "metadata";
  targetSlotIds: ID[];
}

export interface SmartArrangeRule extends VersionedEntity {
  id: ID;
  type: "grid" | "circle" | "manual" | "balanced";
  params: Record<string, string | number | boolean>;
}

export interface Template extends VersionedEntity {
  id: ID;
  name: string;
  mode: ModeType;
  pageSetup: PageSetup;
  pages: TemplatePage[];
  slots: TemplateSlot[];
  textZones: TemplateTextZone[];
  lockedLayers: ID[];
  editableLayers: ID[];
  autoFillRules: AutoFillRule[];
  smartArrangeRules: SmartArrangeRule[];
  printSpec: PrintSpec;
  defaultExportSettings?: ExportSettings;
  metadata: Metadata;
}

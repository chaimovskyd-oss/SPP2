import type { VisualLayer } from "./layers";
import type { ID, Guide, Margins, Metadata, VersionedEntity } from "./primitives";
import type { Preset } from "./preset";

export interface Asset extends VersionedEntity {
  id: ID;
  name: string;
  kind: "image" | "font" | "pdf" | "external";
  originalPath?: string;
  previewPath?: string;
  mimeType: string;
  width?: number;
  height?: number;
  checksum?: string;
  metadata: Metadata;
}

export interface Background extends VersionedEntity {
  type: "transparent" | "color" | "asset";
  color?: string;
  assetId?: ID;
}

export interface Page extends VersionedEntity {
  id: ID;
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  bleed: Margins;
  margins: Margins;
  background: Background;
  layers: VisualLayer[];
  guides: Guide[];
  metadata: Metadata;
}

export interface Document extends VersionedEntity {
  id: ID;
  name: string;
  createdAt: string;
  modifiedAt: string;
  dpi: number;
  colorProfile: string;
  pages: Page[];
  assets: Asset[];
  presets: Preset[];
  metadata: Metadata;
}

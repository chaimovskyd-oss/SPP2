import type { VisualLayer } from "./layers";
import type { ID, Guide, Margins, Metadata, PageSetup, VersionedEntity, ViewportState } from "./primitives";
import type { Preset } from "./preset";
import type { GridImageAssignment, GridLayoutRule, GridTextOverlayRule } from "./grid";
import type { MaskImageAssignment, MaskLayoutRule, MaskPreset, MaskTextOverlayRule } from "./mask";
import type { CollageRule } from "./collage";
import type { PhotoPrintImageAssignment, PhotoPrintRule } from "./photoPrint";
import type { ClassPhotoLayoutRule } from "./classPhoto";

export interface Asset extends VersionedEntity {
  id: ID;
  name: string;
  kind: "image" | "font" | "pdf" | "external";
  status?: "ready" | "missing" | "processing" | "failed";
  originalPath?: string;
  previewPath?: string;
  thumbnailPath?: string;
  mimeType: string;
  width?: number;
  height?: number;
  fileSize?: number;
  hash?: string;
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
  setup: PageSetup;
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
  gridRules: GridLayoutRule[];
  gridImageAssignments: GridImageAssignment[];
  gridTextOverlayRules: GridTextOverlayRule[];
  maskRules: MaskLayoutRule[];
  maskImageAssignments: MaskImageAssignment[];
  maskTextOverlayRules: MaskTextOverlayRule[];
  maskPresets: MaskPreset[];
  collageRules: CollageRule[];
  photoPrintRules: PhotoPrintRule[];
  photoPrintImageAssignments: PhotoPrintImageAssignment[];
  classPhotoRules: ClassPhotoLayoutRule[];
  viewport: ViewportState;
  metadata: Metadata;
}

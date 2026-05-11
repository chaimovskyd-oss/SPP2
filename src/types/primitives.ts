export type ID = string;
export type ISODateTime = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type Metadata = Record<string, JsonValue>;

export interface VersionedEntity {
  version: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point, Size {}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface CropRect extends Rect {}

export interface StrokeStyle extends VersionedEntity {
  color: string;
  width: number;
  opacity: number;
  dash?: number[];
}

export interface FillStyle extends VersionedEntity {
  color: string;
  opacity: number;
}

export interface ShadowStyle extends VersionedEntity {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface GradientStop {
  offset: number;
  color: string;
  opacity: number;
}

export interface GradientStyle extends VersionedEntity {
  type: "linear" | "radial";
  stops: GradientStop[];
  angle?: number;
}

export interface Guide extends VersionedEntity {
  id: ID;
  axis: "x" | "y";
  position: number;
  locked: boolean;
  label?: string;
}

export type FitMode = "fit" | "fill" | "smartCrop" | "stretch";

export interface PageSetup extends VersionedEntity {
  size: Size;
  dpi: number;
  orientation: "portrait" | "landscape";
  bleed: Margins;
  margins: Margins;
}

export interface PrintSpec extends VersionedEntity {
  id: ID;
  dpi: number;
  colorProfile: string;
  bleed: Margins;
  safeArea: Rect;
  output: "pdf" | "png" | "jpg" | "tiff";
}

export interface ExportSettings extends VersionedEntity {
  format: "pdf" | "png" | "jpg";
  dpi: number;
  includeBleed: boolean;
  colorProfile: string;
}

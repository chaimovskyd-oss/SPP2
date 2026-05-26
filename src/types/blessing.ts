import type { ID, Metadata, VersionedEntity } from "./primitives";
import type { TextStyle } from "./template";

export type BlessingLength = "קצר" | "ארוך";

export interface BlessingItem {
  id: string;
  event: string;
  recipient: string;
  product: string;
  style: string[];
  length: BlessingLength;
  text: string;
}

export interface SourceQuoteItem {
  id: string;
  section: string;
  category: string;
  source: string;
  source_group: string;
  product: string;
  style: string[];
  text: string;
}

export interface BlessingSearchFilters {
  event: string;
  recipient: string;
  style: string;
  length: BlessingLength | "";
  query: string;
}

export type BlessingTemplateId =
  | "classic_card"
  | "birthday"
  | "brit_bar_mitzvah"
  | "teacher"
  | "army"
  | "wedding";

export interface BlessingTemplate {
  id: BlessingTemplateId;
  name: string;
  defaultEvent: string;
  titleFontFamily: string;
  bodyFontFamily: string;
  titleFontSize: number;
  bodyFontSize: number;
  titleColor: string;
  bodyColor: string;
  titleFontWeight: number;
  bodyFontWeight: number;
  defaultBackgroundFilename: string;
  showFrame: boolean;
  defaultFrameFilename?: string;
  signatureEnabled: boolean;
}

export interface BlessingRule extends VersionedEntity {
  id: ID;
  pageId: ID;
  backgroundLayerId?: ID;
  frameLayerId?: ID;
  titleLayerId?: ID;
  bodyLayerId?: ID;
  signatureLayerId?: ID;
  titleText: string;
  bodyText: string;
  signatureText: string;
  activeBlessingId?: string;
  activeSourceQuoteId?: string;
  templateId: BlessingTemplateId;
  backgroundFilename: string;
  frameEnabled: boolean;
  frameFilename?: string;
  titleTextStyle: TextStyle;
  bodyTextStyle: TextStyle;
  signatureTextStyle: TextStyle;
  bodyAutoFitEnabled: boolean;
  bodyFontSizeComputed?: number;
  bodyOverflowWarning: boolean;
  metadata: Metadata;
}

export interface BlessingWizardResult {
  name: string;
  pageSetup: import("./primitives").PageSetup;
  templateId: BlessingTemplateId;
  backgroundFilename: string;
  frameEnabled: boolean;
  frameFilename?: string;
  titleText: string;
  bodyText: string;
  signatureText: string;
  activeBlessingId?: string;
  activeSourceQuoteId?: string;
}

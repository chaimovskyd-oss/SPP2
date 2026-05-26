import type { Asset, Document } from "./document";
import type { CollageLayoutFamily } from "./collage";
import type { PageSetup } from "./primitives";

export interface BatchCollageAssetGroup {
  id: string;
  name: string;
  assets: Asset[];
}

export interface BatchCollageSettings {
  pageSetup: PageSetup;
  spacingMm: number;
  marginMm: number;
  allowedLayoutMode: "safeOnly" | "allLayouts";
  smartCropEnabled: boolean;
  maxCollages: number;
}

export interface BatchCollageProgress {
  groupIndex: number;
  totalGroups: number;
  groupName: string;
  step: "importing" | "generating" | "choosingLayout" | "creatingPage" | "applyingSmartCrop" | "done" | "warning" | "error";
}

export interface BatchCollageBuildWarning {
  groupId: string;
  groupName: string;
  message: string;
}

export interface BatchCollageBuildResult {
  document: Document;
  createdCount: number;
  warnings: BatchCollageBuildWarning[];
  failedCount: number;
}

export interface BatchCollageCreatedGroup {
  groupId: string;
  groupName: string;
  pageId: string;
  collageRuleId: string;
  chosenLayoutFamily: CollageLayoutFamily;
  chosenScore: number;
}

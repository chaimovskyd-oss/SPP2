import type { Background, Page } from "@/types/document";
import type { GridSettings, Margins, PageSetup, SnapSettings, ViewportState } from "@/types/primitives";

export const DEFAULT_DPI = 300;
export const DEFAULT_COLOR_PROFILE = "sRGB IEC61966-2.1";

export const defaultSnapSettings: SnapSettings = {
  version: 1,
  enabled: true,
  snapToGrid: true,
  snapToGuides: true,
  snapToLayers: true,
  snapToPage: true,
  snapTolerance: 8,
  showSmartGuides: true
};

export const defaultGridSettings: GridSettings = {
  version: 1,
  enabled: true,
  spacingX: 60,
  spacingY: 60,
  subdivisions: 4,
  color: "#7C6FE0",
  opacity: 0.18,
  snapToGrid: false
};

export const defaultViewportState: ViewportState = {
  version: 1,
  zoom: 1,
  panX: 0,
  panY: 0,
  screenWidth: 0,
  screenHeight: 0,
  showRulers: true,
  showGrid: true,
  showGuides: true,
  snapEnabled: true,
  fitMode: "fitPage",
  backgroundStyle: "dark"
};

export const zeroMargins: Margins = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
};

export const defaultPageSetup: PageSetup = {
  version: 1,
  units: "mm",
  size: {
    width: 2480,
    height: 3508
  },
  dpi: DEFAULT_DPI,
  orientation: "portrait",
  bleed: zeroMargins,
  margins: zeroMargins,
  safeArea: zeroMargins,
  backgroundColor: "#fbfafa",
  backgroundTransparent: false,
  printIntent: "photo",
  rulerOrigin: "page",
  snapSettings: { ...defaultSnapSettings },
  gridSettings: { ...defaultGridSettings },
  metadata: {}
};

export const transparentBackground: Background = {
  version: 1,
  type: "transparent"
};

export function createPageDefaults(): Pick<Page, "bleed" | "margins" | "background" | "guides" | "metadata"> {
  return {
    bleed: { ...defaultPageSetup.bleed },
    margins: { ...defaultPageSetup.margins },
    background: { ...transparentBackground },
    guides: [],
    metadata: {}
  };
}

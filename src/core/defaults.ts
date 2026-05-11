import type { Background, Page } from "@/types/document";
import type { Margins, PageSetup } from "@/types/primitives";

export const DEFAULT_DPI = 300;
export const DEFAULT_COLOR_PROFILE = "sRGB IEC61966-2.1";

export const zeroMargins: Margins = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
};

export const defaultPageSetup: PageSetup = {
  version: 1,
  size: {
    width: 2480,
    height: 3508
  },
  dpi: DEFAULT_DPI,
  orientation: "portrait",
  bleed: zeroMargins,
  margins: {
    top: 120,
    right: 120,
    bottom: 120,
    left: 120
  }
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

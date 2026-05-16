import { DEFAULT_COLOR_PROFILE, DEFAULT_DPI, createPageDefaults, defaultPageSetup, defaultViewportState } from "../defaults";
import { createId } from "../ids";
import type { Asset, Document, Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import type { Metadata, PageSetup } from "@/types/primitives";

export interface CreateDocumentOptions {
  id?: string;
  name: string;
  now?: string;
  dpi?: number;
  colorProfile?: string;
  viewport?: Document["viewport"];
  pages?: Page[];
  metadata?: Metadata;
}

export interface CreatePageOptions {
  id?: string;
  name?: string;
  setup?: Partial<PageSetup>;
  layers?: VisualLayer[];
  metadata?: Metadata;
}

export function createDocument(options: CreateDocumentOptions): Document {
  const now = options.now ?? new Date().toISOString();
  return {
    version: 1,
    id: options.id ?? createId("doc"),
    name: options.name,
    createdAt: now,
    modifiedAt: now,
    dpi: options.dpi ?? DEFAULT_DPI,
    colorProfile: options.colorProfile ?? DEFAULT_COLOR_PROFILE,
    pages: options.pages ?? [],
    assets: [],
    presets: [],
    gridRules: [],
    gridImageAssignments: [],
    gridTextOverlayRules: [],
    maskRules: [],
    maskImageAssignments: [],
    maskTextOverlayRules: [],
    maskPresets: [],
    collageRules: [],
    photoPrintRules: [],
    photoPrintImageAssignments: [],
    viewport: options.viewport ?? { ...defaultViewportState },
    metadata: options.metadata ?? {}
  };
}

export function createPage(options: CreatePageOptions = {}): Page {
  const setup = {
    ...defaultPageSetup,
    ...options.setup,
    size: {
      ...defaultPageSetup.size,
      ...options.setup?.size
    },
    bleed: {
      ...defaultPageSetup.bleed,
      ...options.setup?.bleed
    },
    margins: {
      ...defaultPageSetup.margins,
      ...options.setup?.margins
    },
    safeArea: {
      ...defaultPageSetup.safeArea,
      ...options.setup?.safeArea
    },
    snapSettings: {
      ...defaultPageSetup.snapSettings,
      ...options.setup?.snapSettings
    },
    gridSettings: {
      ...defaultPageSetup.gridSettings,
      ...options.setup?.gridSettings
    }
  };

  return {
    version: 1,
    id: options.id ?? createId("page"),
    width: setup.size.width,
    height: setup.size.height,
    orientation: setup.orientation,
    setup,
    ...createPageDefaults(),
    bleed: setup.bleed,
    margins: setup.margins,
    background:
      setup.backgroundTransparent === true
        ? {
            version: 1,
            type: "transparent"
          }
        : {
            version: 1,
            type: "color",
            color: setup.backgroundColor ?? "#fbfafa"
          },
    layers: options.layers ?? [],
    metadata: {
      name: options.name ?? "Page",
      ...(options.metadata ?? {})
    }
  };
}

export function addPage(document: Document, page: Page): Document {
  return {
    ...document,
    modifiedAt: new Date().toISOString(),
    pages: [...document.pages, page]
  };
}

export function addAsset(document: Document, asset: Asset): Document {
  return {
    ...document,
    modifiedAt: new Date().toISOString(),
    assets: [...document.assets, asset]
  };
}

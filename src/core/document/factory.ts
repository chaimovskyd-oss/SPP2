import { DEFAULT_COLOR_PROFILE, DEFAULT_DPI, createPageDefaults, defaultPageSetup } from "../defaults";
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
    pages: [],
    assets: [],
    presets: [],
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
    }
  };

  return {
    version: 1,
    id: options.id ?? createId("page"),
    width: setup.size.width,
    height: setup.size.height,
    orientation: setup.orientation,
    ...createPageDefaults(),
    bleed: setup.bleed,
    margins: setup.margins,
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

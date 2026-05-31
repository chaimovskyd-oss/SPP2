// ─── Graphics Library types ───────────────────────────────────────────────────

export type GraphicFileType = "png" | "jpg" | "jpeg" | "webp" | "svg";
export type GraphicOrientation = "landscape" | "portrait" | "square";
export type GraphicColorName =
  | "red" | "orange" | "yellow" | "green" | "blue"
  | "purple" | "pink" | "brown" | "black" | "white" | "gray" | "gold";

export interface GraphicAsset {
  id: string;
  filePath: string;       // absolute path on disk
  relativePath: string;   // relative to graphics base dir
  fileName: string;
  category: string;       // top-level folder (Backgrounds, Elements, …)
  folders: string[];      // all folder segments above the file
  type: GraphicFileType;
  width: number;
  height: number;
  orientation: GraphicOrientation;
  hasTransparency: boolean;
  dominantColors: string[];   // "rgb(r,g,b)" strings, up to 5
  colorNames: GraphicColorName[];
  tags: string[];
  favorite: boolean;
  source: "local" | "pixabay" | "canvas" | "imported";
  sourceUrl?: string;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
  thumbnailPath?: string; // absolute path to .thumbnails/{id}.jpg
  fileSize: number;
  mtimeMs: number;    // for change detection
}

export interface FileScanResult {
  filePath: string;
  fileName: string;
  size: number;
  mtimeMs: number;
  companionMeta?: Partial<GraphicAsset>; // parsed from companion .json if present
}

export interface ImageAnalysis {
  width: number;
  height: number;
  orientation: GraphicOrientation;
  hasTransparency: boolean;
  dominantColors: string[];
  colorNames: GraphicColorName[];
}

export interface GlibFilters {
  category: string;         // "all" or folder name
  orientation: "" | GraphicOrientation;
  colorName: "" | GraphicColorName;
  fileType: "" | GraphicFileType;
  favoritesOnly: boolean;
  transparentOnly: boolean;
  query: string;
}

export const DEFAULT_GLIB_FILTERS: GlibFilters = {
  category: "all",
  orientation: "",
  colorName: "",
  fileType: "",
  favoritesOnly: false,
  transparentOnly: false,
  query: "",
};

export const SUPPORTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);

export const CATEGORY_LABELS: Record<string, string> = {
  Backgrounds: "רקעים",
  Elements: "אלמנטים",
  Stickers: "מדבקות",
  Frames: "מסגרות",
  Textures: "טקסטורות",
  Shapes: "צורות",
  Downloaded: "הורדות",
  all: "הכל",
};

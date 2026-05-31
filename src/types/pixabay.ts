// ─── Pixabay API types ────────────────────────────────────────────────────────

export interface PixabaySearchParams {
  q: string;
  image_type?: "all" | "photo" | "illustration" | "vector";
  orientation?: "all" | "horizontal" | "vertical";
  colors?: string;
  safesearch?: boolean;
  page?: number;
  per_page?: number;
}

/** Raw hit shape returned by the Pixabay REST API */
export interface PixabayHit {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  previewURL: string;
  previewWidth: number;
  previewHeight: number;
  webformatURL: string;
  webformatWidth: number;
  webformatHeight: number;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  imageSize: number;
  views: number;
  downloads: number;
  collections: number;
  likes: number;
  comments: number;
  user_id: number;
  user: string;
  userImageURL: string;
}

/** Raw API response envelope */
export interface PixabayApiResponse {
  total: number;
  totalHits: number;
  hits: PixabayHit[];
}

/** Normalised result used throughout the UI */
export interface PixabayResult {
  id: string;
  source: "pixabay";
  previewUrl: string;
  thumbnailUrl: string;
  webformatUrl: string;
  fullUrl: string;
  pageUrl: string;
  width: number;
  height: number;
  orientation: "horizontal" | "vertical" | "square";
  tags: string;
  user: string;
  userImageURL: string;
  licenseNote: string;
  downloadedLocalPath?: string;
}

export interface PixabaySearchResult {
  total: number;
  totalHits: number;
  results: PixabayResult[];
  page: number;
}

export interface PixabayCache {
  timestamp: number;
  data: PixabaySearchResult;
}

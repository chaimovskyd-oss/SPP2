import { Heart, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  addRecentFontStorage,
  filterFonts,
  getFontFavoritesStorage,
  getFontList,
  getRecentFontsStorage,
  loadGoogleFont,
  toggleFontFavoriteStorage,
  type FontCategory,
  type FontSubset,
  type GoogleFontItem
} from "@/smartTools/googleFonts/fontsApi";

type TabFilter = "all" | "favorites" | "recent";

const CATEGORY_LABELS: Record<FontCategory | "all", string> = {
  all: "הכל",
  "sans-serif": "Sans-Serif",
  serif: "Serif",
  display: "Display",
  handwriting: "כתב יד",
  monospace: "Monospace"
};

const SUBSET_LABELS: Record<FontSubset, string> = {
  all: "כל השפות",
  hebrew: "עברית",
  latin: "אנגלית / Latin",
  cyrillic: "רוסית / Cyrillic"
};

interface GoogleFontsBrowserProps {
  previewText?: string;
  onUseFont: (family: string) => void;
  onClose: () => void;
}

export function GoogleFontsBrowser({ previewText, onUseFont, onClose }: GoogleFontsBrowserProps): ReactElement {
  const [allFonts, setAllFonts] = useState<GoogleFontItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FontCategory | "all">("all");
  const [subset, setSubset] = useState<FontSubset>("all");
  const [tab, setTab] = useState<TabFilter>("all");
  const [favorites, setFavorites] = useState<string[]>(() => getFontFavoritesStorage());
  const [recent, setRecent] = useState<string[]>(() => getRecentFontsStorage());
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadFonts(forceRefresh = false): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      const fonts = await getFontList(forceRefresh);
      setAllFonts(fonts);
      if (fonts.length <= 20 && !import.meta.env.VITE_GOOGLE_FONTS_API_KEY) {
        setError("לא הוגדר VITE_GOOGLE_FONTS_API_KEY, לכן מוצגת רשימת fallback קצרה בלבד.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google Fonts API unavailable";
      setError(message);
      setAllFonts([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadFonts(false);
  }, []);

  const filteredFonts = useMemo(() => {
    let list = filterFonts(allFonts, query, category, subset);
    if (tab === "favorites") list = list.filter((f) => favorites.includes(f.family));
    if (tab === "recent") list = list.filter((f) => recent.includes(f.family));
    return list;
  }, [allFonts, query, category, subset, tab, favorites, recent]);

  function ensureFontLoaded(font: GoogleFontItem): void {
    if (loadedFonts.has(font.family)) return;
    loadGoogleFont(font.family, font.variants);
    setLoadedFonts((prev) => new Set([...prev, font.family]));
  }

  function toggleFavorite(family: string): void {
    const next = toggleFontFavoriteStorage(family);
    setFavorites(next);
  }

  function handleUse(font: GoogleFontItem): void {
    ensureFontLoaded(font);
    setRecent(addRecentFontStorage(font.family));
    onUseFont(font.family);
  }

  const defaultPreview = subset === "hebrew" ? "אבגדה ABCabc" : subset === "cyrillic" ? "Привет ABC אבגדה" : "ABC אבגדה Привет";
  const displayText = previewText?.trim() || defaultPreview;

  const CATEGORIES: (FontCategory | "all")[] = ["all", "sans-serif", "serif", "display", "handwriting", "monospace"];

  return (
    <div className="util-panel fonts-browser" role="dialog" aria-label="גלישת פונטים">
      <div className="util-panel-header">
        <span>Google Fonts Browser</span>
        <button className="icon-btn" onClick={onClose} type="button"><X size={15} /></button>
      </div>

      <div className="fonts-browser-toolbar">
        <label className="fonts-search-label">
          <Search size={13} />
          <input
            className="fonts-search-input"
            placeholder="חיפוש פונטים בגוגל..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </label>

        <div className="fonts-filter-row">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`fonts-filter-btn ${category === cat ? "active" : ""}`}
              onClick={() => setCategory(cat)}
              type="button"
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="fonts-filter-row">
          {(["all", "hebrew", "latin", "cyrillic"] as FontSubset[]).map((s) => (
            <button
              key={s}
              className={`fonts-filter-btn ${subset === s ? "active" : ""}`}
              onClick={() => setSubset(s)}
              type="button"
            >
              {SUBSET_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="fonts-tabs">
          {([["all", "כל הפונטים"], ["favorites", "מועדפים ♥"], ["recent", "אחרונים"]] as [TabFilter, string][]).map(([t, lbl]) => (
            <button
              key={t}
              className={`fonts-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
              type="button"
            >
              {lbl}
            </button>
          ))}
          <button
            className="fonts-tab"
            onClick={() => void loadFonts(true)}
            title="רענן רשימת פונטים מגוגל"
            type="button"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {error && <p className="util-empty-note">{error}</p>}

      <div className="fonts-list">
        {isLoading ? (
          <p className="util-empty-note">טוען פונטים מ־Google Fonts...</p>
        ) : filteredFonts.length === 0 ? (
          <p className="util-empty-note">לא נמצאו פונטים</p>
        ) : (
          filteredFonts.map((font) => (
            <FontCard
              key={font.family}
              font={font}
              previewText={displayText}
              isFavorite={favorites.includes(font.family)}
              onLoad={ensureFontLoaded}
              onUse={() => handleUse(font)}
              onToggleFavorite={() => toggleFavorite(font.family)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface FontCardProps {
  font: GoogleFontItem;
  previewText: string;
  isFavorite: boolean;
  onLoad: (font: GoogleFontItem) => void;
  onUse: () => void;
  onToggleFavorite: () => void;
}

function FontCard({ font, previewText, isFavorite, onLoad, onUse, onToggleFavorite }: FontCardProps): ReactElement {
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onLoad(font); },
      { threshold: 0.1 }
    );
    const el = document.getElementById(`font-card-${font.family.replace(/\s/g, "-")}`);
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [font, onLoad]);

  return (
    <div
      className="font-card"
      id={`font-card-${font.family.replace(/\s/g, "-")}`}
    >
      <div className="font-card-meta">
        <span className="font-card-name">{font.family}</span>
        <span className="font-card-category">{font.category}</span>
      </div>
      <div
        className="font-card-preview"
        style={{ fontFamily: `"${font.family}", sans-serif` }}
      >
        {previewText}
      </div>
      <div className="font-card-actions">
        <button
          className={`icon-btn font-fav-btn ${isFavorite ? "active" : ""}`}
          onClick={onToggleFavorite}
          title={isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
          type="button"
        >
          <Heart size={13} fill={isFavorite ? "currentColor" : "none"} />
        </button>
        <button className="btn btn-ghost compact" onClick={() => onLoad(font)} type="button">
          טען
        </button>
        <button className="btn btn-accent compact" onClick={onUse} type="button">
          השתמש
        </button>
      </div>
    </div>
  );
}

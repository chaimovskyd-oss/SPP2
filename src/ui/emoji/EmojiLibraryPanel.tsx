import { useCallback, useMemo, useRef, useState } from "react";
import { Search, Star, X } from "lucide-react";
import {
  GRAPHIC_PACKS,
  GRAPHICS_DATA,
  getActivePacks,
  getGraphicById,
  getPackCategories,
  searchGraphics,
  type GraphicItem,
  type GraphicPack,
} from "@/data/graphics";
import "./EmojiLibraryPanel.css";

// ─── Persistence ─────────────────────────────────────────────────────────────

const FAV_KEY     = "spp2_glib_favorites";
const RECENT_KEY  = "spp2_glib_recents";
const MAX_RECENTS = 20;

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function saveSet(key: string, s: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...s]));
}

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function pushRecent(id: string): void {
  const list = loadRecents().filter((x) => x !== id);
  list.unshift(id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
}

// ─── Graphic cell ─────────────────────────────────────────────────────────────

interface CellProps {
  item: GraphicItem;
  isFavorite: boolean;
  onInsert: (item: GraphicItem) => void;
  onToggleFav: (id: string) => void;
  onDragStart: (e: React.DragEvent, item: GraphicItem) => void;
}

function GraphicCell({ item, isFavorite, onInsert, onToggleFav, onDragStart }: CellProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  const handleError = useCallback(() => {
    if (imgRef.current && item.fallbackUrl) {
      imgRef.current.src = item.fallbackUrl;
    }
  }, [item.fallbackUrl]);

  return (
    <div
      className="emoji-cell"
      title={item.name}
      role="button"
      tabIndex={0}
      draggable
      onClick={() => onInsert(item)}
      onKeyDown={(e) => e.key === "Enter" && onInsert(item)}
      onDragStart={(e) => onDragStart(e, item)}
    >
      <img
        ref={imgRef}
        src={item.file}
        alt={item.name}
        className={`emoji-img ${loaded ? "emoji-img--loaded" : ""}`}
        onLoad={() => setLoaded(true)}
        onError={handleError}
        draggable={false}
      />
      <button
        className={`emoji-fav-btn ${isFavorite ? "emoji-fav-btn--active" : ""}`}
        title={isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
        onClick={(e) => { e.stopPropagation(); onToggleFav(item.id); }}
        tabIndex={-1}
      >
        <Star size={10} fill={isFavorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export interface GraphicsLibraryProps {
  onInsertGraphic: (file: string, name: string, fallbackUrl?: string) => void;
}

/** @deprecated Use GraphicsLibraryPanel */
export interface EmojiLibraryPanelProps {
  onInsertEmoji: (svgUrl: string, name: string, code: string) => void;
}

type Props = GraphicsLibraryProps | EmojiLibraryPanelProps;

function isLegacyProps(p: Props): p is EmojiLibraryPanelProps {
  return "onInsertEmoji" in p;
}

function resolveInsert(
  props: Props
): (file: string, name: string, fallbackUrl?: string) => void {
  if (isLegacyProps(props)) {
    return (file, name) => props.onInsertEmoji(file, name, "");
  }
  return props.onInsertGraphic;
}

export function GraphicsLibraryPanel(props: Props) {
  const onInsert = resolveInsert(props);

  const activePacks = useMemo(() => getActivePacks(), []);
  const defaultPack = activePacks[0]?.id ?? "openmoji";

  const [activePack, setActivePack] = useState<string>(defaultPack);
  const [activeCategory, setActiveCategory] = useState<string>("smileys");
  const [view, setView] = useState<"browse" | "recents" | "favorites">("browse");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => loadSet(FAV_KEY));
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  const searchRef = useRef<HTMLInputElement>(null);

  const isSearching = search.trim().length > 0;

  const packCategories = useMemo(
    () => getPackCategories(activePack),
    [activePack]
  );

  // Ensure activeCategory is valid when pack changes
  const safeCat = packCategories.some((c) => c.id === activeCategory)
    ? activeCategory
    : packCategories[0]?.id ?? "smileys";

  const displayedItems = useMemo<GraphicItem[]>(() => {
    if (isSearching) return searchGraphics(search);
    if (view === "recents") {
      return recents
        .map((id) => getGraphicById(id))
        .filter((x): x is GraphicItem => x !== undefined);
    }
    if (view === "favorites") {
      return GRAPHICS_DATA.filter((item) => favorites.has(item.id));
    }
    return GRAPHICS_DATA.filter(
      (item) => item.pack === activePack && item.category === safeCat
    );
  }, [isSearching, search, view, recents, favorites, activePack, safeCat]);

  const handleInsert = useCallback(
    (item: GraphicItem) => {
      pushRecent(item.id);
      setRecents(loadRecents());
      onInsert(item.file, item.name, item.fallbackUrl);
    },
    [onInsert]
  );

  const handleToggleFav = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveSet(FAV_KEY, next);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, item: GraphicItem) => {
    e.dataTransfer.setData("graphic/url", item.file);
    e.dataTransfer.setData("graphic/name", item.name);
    if (item.fallbackUrl) e.dataTransfer.setData("graphic/fallback", item.fallbackUrl);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const clearSearch = useCallback(() => {
    setSearch("");
    searchRef.current?.focus();
  }, []);

  function switchPack(pack: GraphicPack) {
    setActivePack(pack.id);
    const cats = getPackCategories(pack.id);
    setActiveCategory(cats[0]?.id ?? "");
    setView("browse");
  }

  const sectionLabel = isSearching
    ? `${displayedItems.length} תוצאות עבור "${search}"`
    : view === "recents"
    ? "שימוש אחרון"
    : view === "favorites"
    ? "מועדפים"
    : packCategories.find((c) => c.id === safeCat)?.name ?? "";

  const emptyMessage =
    view === "recents"
      ? "טרם השתמשת בגרפיקה"
      : view === "favorites"
      ? 'לחץ ⭐ על פריט להוספה למועדפים'
      : "לא נמצאו תוצאות";

  return (
    <div className="emoji-panel">

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="emoji-search-row">
        <Search size={13} className="emoji-search-icon" />
        <input
          ref={searchRef}
          className="emoji-search-input"
          placeholder="חפש גרפיקה..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="emoji-search-clear" onClick={clearSearch} title="נקה">
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── Pack selector (hidden while searching) ───────────────────────── */}
      {!isSearching && activePacks.length >= 1 && (
        <div className="glib-packs">
          {/* Special: recents & favorites */}
          <button
            className={`glib-special-btn ${view === "recents" ? "active" : ""}`}
            title="שימוש אחרון"
            onClick={() => setView("recents")}
          >
            🕐
          </button>
          <button
            className={`glib-special-btn ${view === "favorites" ? "active" : ""}`}
            title="מועדפים"
            onClick={() => setView("favorites")}
          >
            ⭐
          </button>

          <div className="glib-packs-divider" />

          {/* Pack tabs */}
          {activePacks.map((pack) => (
            <button
              key={pack.id}
              className={`glib-pack-btn ${view === "browse" && activePack === pack.id ? "active" : ""}`}
              onClick={() => switchPack(pack)}
              title={pack.name}
            >
              <span className="glib-pack-icon">{pack.icon}</span>
              <span className="glib-pack-label">{pack.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Category tabs (only in browse mode) ──────────────────────────── */}
      {!isSearching && view === "browse" && packCategories.length > 0 && (
        <div className="emoji-cats">
          {packCategories.map((cat) => (
            <button
              key={cat.id}
              className={`emoji-cat-btn ${safeCat === cat.id ? "active" : ""}`}
              title={cat.name}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* ── Section label ─────────────────────────────────────────────────── */}
      <div className="emoji-section-label">{sectionLabel}</div>

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div className="emoji-grid">
        {displayedItems.length === 0 ? (
          <div className="emoji-empty">{emptyMessage}</div>
        ) : (
          displayedItems.map((item) => (
            <GraphicCell
              key={item.id}
              item={item}
              isFavorite={favorites.has(item.id)}
              onInsert={handleInsert}
              onToggleFav={handleToggleFav}
              onDragStart={handleDragStart}
            />
          ))
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="emoji-footer">לחץ להוספה · גרור לקנבס</div>
    </div>
  );
}

/** @deprecated Alias for backward compatibility — use GraphicsLibraryPanel */
export function EmojiLibraryPanel(props: EmojiLibraryPanelProps) {
  return <GraphicsLibraryPanel {...props} />;
}

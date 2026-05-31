import { useCallback, useRef, useState } from "react";
import { Search, X, ExternalLink, Image, LayoutGrid, Grid2X2, Square } from "lucide-react";

type ThumbSize = "s" | "m" | "l";
import {
  searchPixabay,
  downloadPixabayAsset,
  getPixabayErrorMessage,
} from "@/services/pixabayService";
import { usePixabayStore } from "@/state/pixabayStore";
import type { PixabayResult } from "@/types/pixabay";
import "./PixabayPanel.css";

// ─── Color options ────────────────────────────────────────────────────────────

const COLOR_OPTIONS = [
  { value: "", label: "כל הצבעים" },
  { value: "transparent", label: "שקוף" },
  { value: "grayscale", label: "אפור" },
  { value: "red", label: "אדום" },
  { value: "orange", label: "כתום" },
  { value: "yellow", label: "צהוב" },
  { value: "green", label: "ירוק" },
  { value: "turquoise", label: "טורקיז" },
  { value: "blue", label: "כחול" },
  { value: "lilac", label: "לילך" },
  { value: "pink", label: "ורוד" },
  { value: "white", label: "לבן" },
  { value: "gray", label: "אפור כהה" },
  { value: "black", label: "שחור" },
  { value: "brown", label: "חום" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "כל הסוגים" },
  { value: "photo", label: "תמונות" },
  { value: "illustration", label: "איורים" },
  { value: "vector", label: "וקטור" },
];

const ORIENTATION_OPTIONS = [
  { value: "all", label: "כל כיוון" },
  { value: "horizontal", label: "אופקי" },
  { value: "vertical", label: "אנכי" },
  // "square" is not a Pixabay API param, we don't include it in orientation filter
];

const PER_PAGE = 40;

// ─── Result cell ──────────────────────────────────────────────────────────────

interface CellProps {
  result: PixabayResult;
  onInsert: (result: PixabayResult) => void;
  onSaveLocal: (result: PixabayResult) => void;
  onPreview: (result: PixabayResult) => void;
  onDragStart: (e: React.DragEvent, result: PixabayResult) => void;
}

function PixabayCell({ result, onInsert, onSaveLocal, onPreview, onDragStart }: CellProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="pb-cell"
      draggable
      onClick={() => onPreview(result)}
      onDragStart={(e) => onDragStart(e, result)}
      title={result.tags}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onPreview(result)}
    >
      <img
        src={result.previewUrl}
        alt={result.tags}
        className={`pb-cell-img ${loaded ? "pb-cell-img--loaded" : ""}`}
        onLoad={() => setLoaded(true)}
        draggable={false}
      />
      <div className="pb-cell-overlay">
        <button
          className="pb-cell-btn pb-cell-btn--primary"
          title="הוסף לעיצוב"
          onClick={(e) => { e.stopPropagation(); onInsert(result); }}
        >
          הוסף
        </button>
        <button
          className="pb-cell-btn"
          title="שמור לספריה המקומית"
          onClick={(e) => { e.stopPropagation(); onSaveLocal(result); }}
        >
          שמור
        </button>
      </div>
    </div>
  );
}

// ─── Preview modal ────────────────────────────────────────────────────────────

interface PreviewProps {
  result: PixabayResult;
  onClose: () => void;
  onInsert: (result: PixabayResult) => void;
  onSaveLocal: (result: PixabayResult) => void;
  inserting: boolean;
  saving: boolean;
}

function PixabayPreviewModal({ result, onClose, onInsert, onSaveLocal, inserting, saving }: PreviewProps) {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); },
    [onClose]
  );

  const openPixabayPage = useCallback(() => {
    window.spp?.openUrl(result.pageUrl);
  }, [result.pageUrl]);

  return (
    <div className="pb-preview-backdrop" onClick={handleBackdropClick}>
      <div className="pb-preview-modal">
        <div className="pb-preview-header">
          <div className="pb-preview-img-wrap">
            <img
              src={result.webformatUrl}
              alt={result.tags}
              className="pb-preview-img"
            />
          </div>
          <button className="pb-preview-close" onClick={onClose} title="סגור">
            <X size={14} />
          </button>
        </div>

        <div className="pb-preview-body">
          <div className="pb-preview-credit">
            מקור: Pixabay /{" "}
            <button className="pb-setup-link" onClick={openPixabayPage}>
              {result.user}
            </button>
          </div>
          <div className="pb-preview-tags">
            תגיות: {result.tags}
          </div>
          <div className="pb-preview-license">{result.licenseNote}</div>
        </div>

        <div className="pb-preview-actions">
          <button
            className="pb-preview-action-btn pb-preview-action-btn--primary"
            onClick={() => onInsert(result)}
            disabled={inserting}
          >
            {inserting ? "מוסיף..." : "הוסף לעיצוב"}
          </button>
          <button
            className="pb-preview-action-btn pb-preview-action-btn--secondary"
            onClick={() => onSaveLocal(result)}
            disabled={saving}
          >
            {saving ? "שומר..." : "שמור לספריה המקומית"}
          </button>
          <button
            className="pb-preview-action-btn pb-preview-action-btn--secondary"
            onClick={openPixabayPage}
            style={{ flex: "0 0 auto", padding: "8px 10px" }}
            title="פתח בPixabay"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

interface SetupProps {
  onSave: (key: string) => void;
}

function PixabaySetup({ onSave }: SetupProps) {
  const [input, setInput] = useState("");

  const openPixabayApiPage = useCallback(() => {
    window.spp?.openUrl("https://pixabay.com/api/docs/");
  }, []);

  return (
    <div className="pb-setup">
      <div className="pb-setup-logo">🖼️</div>
      <div className="pb-setup-title">חיפוש אונליין — Pixabay</div>
      <div className="pb-setup-desc">
        גש למיליוני תמונות, איורים וגרפיקות חינמיות.<br />
        כדי להתחיל, הזן מפתח API מ-Pixabay.
      </div>
      <button className="pb-setup-link" onClick={openPixabayApiPage}>
        קבל מפתח API בחינם ← pixabay.com/api/docs
      </button>
      <div className="pb-key-row">
        <input
          className="pb-key-input"
          type="password"
          placeholder="הזן מפתח API..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && input.trim() && onSave(input)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="pb-save-btn"
          onClick={() => onSave(input)}
          disabled={!input.trim()}
        >
          שמור
        </button>
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export interface PixabayPanelProps {
  onInsertGraphic: (url: string, name: string) => void;
  onSaveLocalGraphic?: (blob: Blob, name: string, metadata: PixabayResult) => Promise<void>;
}

export function PixabayPanel({ onInsertGraphic, onSaveLocalGraphic }: PixabayPanelProps) {
  const { apiKey, setApiKey } = usePixabayStore();

  const [query, setQuery] = useState("");
  const [imageType, setImageType] = useState<"all" | "photo" | "illustration" | "vector">("all");
  const [orientation, setOrientation] = useState<"all" | "horizontal" | "vertical">("all");
  const [color, setColor] = useState("");
  const [safeSearch, setSafeSearch] = useState(true);

  const [thumbSize, setThumbSize] = useState<ThumbSize>("m");

  const [results, setResults] = useState<PixabayResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [preview, setPreview] = useState<PixabayResult | null>(null);
  const [inserting, setInserting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showKeyChange, setShowKeyChange] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const runSearch = useCallback(async (searchPage: number, append: boolean) => {
    if (!query.trim() || !apiKey) return;
    const setter = append ? setLoadingMore : setLoading;
    setter(true);
    setError(null);
    try {
      const res = await searchPixabay(
        { q: query.trim(), image_type: imageType, orientation, colors: color || undefined, safesearch: safeSearch, page: searchPage, per_page: PER_PAGE },
        apiKey
      );
      setTotal(res.total);
      setPage(searchPage);
      setResults((prev) => (append ? [...prev, ...res.results] : res.results));
      setHasSearched(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "UNKNOWN";
      setError(getPixabayErrorMessage(msg));
    } finally {
      setter(false);
    }
  }, [query, imageType, orientation, color, safeSearch, apiKey]);

  const handleSearch = useCallback(() => {
    setResults([]);
    setPage(1);
    setHasSearched(false);
    void runSearch(1, false);
  }, [runSearch]);

  const handleLoadMore = useCallback(() => {
    void runSearch(page + 1, true);
  }, [runSearch, page]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  }, [handleSearch]);

  const handleInsert = useCallback(async (result: PixabayResult) => {
    setInserting(true);
    try {
      const url = result.fullUrl || result.webformatUrl;
      const name = result.tags.split(",")[0]?.trim() || "Pixabay";
      onInsertGraphic(url, name);
      setPreview(null);
    } finally {
      setInserting(false);
    }
  }, [onInsertGraphic]);

  const handleSaveLocal = useCallback(async (result: PixabayResult) => {
    setSaving(true);
    try {
      const blob = await downloadPixabayAsset(result);
      if (onSaveLocalGraphic) {
        const name = result.tags.split(",")[0]?.trim() || `pixabay_${result.id}`;
        await onSaveLocalGraphic(blob, name, result);
      } else if (window.spp) {
        const name = result.tags.split(",")[0]?.trim() || `pixabay_${result.id}`;
        const ext = blob.type.includes("png") ? "png" : "jpg";
        const buffer = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        const res = await (window.spp as unknown as { pixabaySaveAsset?: (args: {imageBase64: string, filename: string, ext: string, metadata: PixabayResult}) => Promise<{success: boolean, filePath?: string, error?: string}> }).pixabaySaveAsset?.({
          imageBase64: base64,
          filename: `${name}_${result.id}`,
          ext,
          metadata: result,
        });
        if (!res?.success) throw new Error(res?.error ?? "SAVE_ERROR");
      }
    } catch (e: unknown) {
      console.warn("[Pixabay] Save local failed:", e);
    } finally {
      setSaving(false);
    }
  }, [onSaveLocalGraphic]);

  const handleDragStart = useCallback((e: React.DragEvent, result: PixabayResult) => {
    const url = result.fullUrl || result.webformatUrl;
    const name = result.tags.split(",")[0]?.trim() || "Pixabay";
    e.dataTransfer.setData("graphic/url", url);
    e.dataTransfer.setData("graphic/name", name);
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleKeyChange = useCallback(() => {
    if (keyInput.trim()) {
      setApiKey(keyInput.trim());
      setShowKeyChange(false);
      setKeyInput("");
    }
  }, [keyInput, setApiKey]);

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setError(null);
    searchRef.current?.focus();
  }, []);

  const hasMore = results.length < total;

  if (!apiKey) {
    return (
      <div className="pb-panel">
        <PixabaySetup onSave={setApiKey} />
      </div>
    );
  }

  return (
    <div className="pb-panel">

      {/* ── Key change UI ────────────────────────────────────────────────── */}
      <div className="pb-key-change-row">
        {showKeyChange ? (
          <div className="pb-key-row" style={{ flex: 1, padding: "0 0 4px" }}>
            <input
              className="pb-key-input"
              type="password"
              placeholder="מפתח API חדש..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleKeyChange()}
              autoComplete="off"
            />
            <button className="pb-save-btn" onClick={handleKeyChange} disabled={!keyInput.trim()}>
              שמור
            </button>
            <button className="pb-search-clear" onClick={() => setShowKeyChange(false)}>
              <X size={12} />
            </button>
          </div>
        ) : (
          <button className="pb-key-change-btn" onClick={() => setShowKeyChange(true)}>
            שנה מפתח API
          </button>
        )}
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="pb-search-row">
        <Search size={13} className="pb-search-icon" />
        <input
          ref={searchRef}
          className="pb-search-input"
          placeholder="חפש רקעים, איורים ואלמנטים..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button className="pb-search-clear" onClick={clearSearch} title="נקה">
            <X size={12} />
          </button>
        )}
        <button
          className="pb-save-btn"
          onClick={handleSearch}
          disabled={!query.trim() || loading}
          style={{ padding: "4px 10px", fontSize: "10px" }}
        >
          חפש
        </button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="pb-filters">
        <select
          className="pb-filter-select"
          value={imageType}
          onChange={(e) => setImageType(e.target.value as typeof imageType)}
          title="סוג קובץ"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className="pb-filter-select"
          value={orientation}
          onChange={(e) => setOrientation(e.target.value as typeof orientation)}
          title="כיוון"
        >
          {ORIENTATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className="pb-filter-select"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          title="צבע"
        >
          {COLOR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="pb-filters-end">
          <label className="pb-safe-toggle">
            <input
              type="checkbox"
              checked={safeSearch}
              onChange={(e) => setSafeSearch(e.target.checked)}
            />
            בטוח
          </label>

          <div className="pb-thumb-size-btns">
            <button
              className={`pb-thumb-size-btn ${thumbSize === "s" ? "active" : ""}`}
              onClick={() => setThumbSize("s")}
              title="תמונות קטנות (3 בשורה)"
            >
              <LayoutGrid size={13} />
            </button>
            <button
              className={`pb-thumb-size-btn ${thumbSize === "m" ? "active" : ""}`}
              onClick={() => setThumbSize("m")}
              title="תמונות בינוניות (2 בשורה)"
            >
              <Grid2X2 size={13} />
            </button>
            <button
              className={`pb-thumb-size-btn ${thumbSize === "l" ? "active" : ""}`}
              onClick={() => setThumbSize("l")}
              title="תמונות גדולות (1 בשורה)"
            >
              <Square size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Results grid ────────────────────────────────────────────────── */}
      <div className={`pb-results pb-results--${thumbSize}`}>
        {loading && (
          <div className="pb-state">
            <div className="pb-spinner" />
            <div>מחפש...</div>
          </div>
        )}

        {!loading && error && (
          <div className="pb-state">
            <div className="pb-state-icon">⚠️</div>
            <div>{error}</div>
          </div>
        )}

        {!loading && !error && hasSearched && results.length === 0 && (
          <div className="pb-state">
            <div className="pb-state-icon">
              <Image size={28} strokeWidth={1.2} />
            </div>
            <div>לא נמצאו תוצאות עבור "{query}"</div>
          </div>
        )}

        {!loading && !error && !hasSearched && (
          <div className="pb-state">
            <div className="pb-state-icon">🔍</div>
            <div>הקלד מונח חיפוש ולחץ חפש</div>
          </div>
        )}

        {results.map((result) => (
          <PixabayCell
            key={result.id}
            result={result}
            onInsert={handleInsert}
            onSaveLocal={handleSaveLocal}
            onPreview={setPreview}
            onDragStart={handleDragStart}
          />
        ))}

        {loadingMore && (
          <div className="pb-state" style={{ gridColumn: "1 / -1" }}>
            <div className="pb-spinner" />
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="pb-footer">
          <div className="pb-footer-info">
            {results.length} מתוך {total.toLocaleString()} תוצאות · מקור: Pixabay
          </div>
          {hasMore && (
            <button
              className="pb-load-more-btn"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "טוען..." : "טען עוד"}
            </button>
          )}
          {!hasMore && results.length > 0 && (
            <div className="pb-footer-info">הצגת כל התוצאות</div>
          )}
        </div>
      )}

      {!results.length && !loading && (
        <div className="pb-footer">
          <div className="pb-footer-info">לחץ להוספה · גרור לקנבס</div>
        </div>
      )}

      {/* ── Preview modal ────────────────────────────────────────────────── */}
      {preview && (
        <PixabayPreviewModal
          result={preview}
          onClose={() => setPreview(null)}
          onInsert={handleInsert}
          onSaveLocal={handleSaveLocal}
          inserting={inserting}
          saving={saving}
        />
      )}
    </div>
  );
}

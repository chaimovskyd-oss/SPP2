import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, RefreshCw, FolderOpen, Grid2X2, List,
  Star, Trash2, FolderInput, Eye, Tag, LayoutGrid, Square,
  Plus, Upload,
} from "lucide-react";
import {
  useGraphicsLibraryStore,
  selectFilteredAssets,
  selectCategories,
  thumbnailCache,
} from "@/features/graphicsLibrary/store";
import type { GraphicAsset, GlibFilters } from "@/features/graphicsLibrary/types";
import { CATEGORY_LABELS } from "@/features/graphicsLibrary/types";
import "./GraphicsLibraryPanel.css";

// ─── Helper: read File → data URL ─────────────────────────────────────────────

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Thumbnail image (lazy-loaded, cached) ────────────────────────────────────

type ThumbSize = "s" | "m" | "l";

function ThumbnailImage({
  asset,
  className = "",
}: {
  asset: GraphicAsset;
  className?: string;
}) {
  const [src, setSrc] = useState<string>(() => thumbnailCache.get(asset.id) ?? "");
  const [loaded, setLoaded] = useState(!!src);

  useEffect(() => {
    const cached = thumbnailCache.get(asset.id);
    if (cached) { setSrc(cached); setLoaded(true); return; }
    if (!asset.thumbnailPath || !window.spp?.glib) return;

    let cancelled = false;
    window.spp.glib.readFileB64(asset.thumbnailPath).then((res) => {
      if (cancelled || !res.success || !res.dataUrl) return;
      thumbnailCache.set(asset.id, res.dataUrl);
      setSrc(res.dataUrl);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [asset.id, asset.thumbnailPath]);

  return (
    <img
      src={src}
      alt={asset.fileName}
      className={`${className} ${loaded ? "glib-cell-img--loaded" : ""}`}
      onLoad={() => setLoaded(true)}
      draggable={false}
    />
  );
}

// ─── Context menu ─────────────────────────────────────────────────────────────

interface CtxMenuState { x: number; y: number; asset: GraphicAsset }

const CATEGORIES_FOR_MOVE = ["Backgrounds", "Elements", "Stickers", "Frames", "Textures", "Shapes"];

function ContextMenu({
  menu,
  onClose,
  onToggleFav,
  onReveal,
  onEditTags,
  onMove,
  onDelete,
}: {
  menu: CtxMenuState;
  onClose: () => void;
  onToggleFav: (id: string) => void;
  onReveal: (asset: GraphicAsset) => void;
  onEditTags: (asset: GraphicAsset) => void;
  onMove: (id: string, cat: string) => void;
  onDelete: (id: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  const style = useMemo(() => {
    const { x, y } = menu;
    const el = menuRef.current;
    const w = el?.offsetWidth ?? 170;
    const h = el?.offsetHeight ?? 220;
    return {
      left: Math.min(x, window.innerWidth - w - 8),
      top: Math.min(y, window.innerHeight - h - 8),
    };
  }, [menu]);

  return (
    <>
      <div className="glib-ctx-backdrop" onClick={onClose} />
      <div className="glib-ctx-menu" style={style} ref={menuRef}>
        <button className="glib-ctx-item" onClick={() => { onToggleFav(menu.asset.id); onClose(); }}>
          <Star size={13} />
          {menu.asset.favorite ? "הסר ממועדפים" : "הוסף למועדפים"}
        </button>
        <div className="glib-ctx-divider" />
        <button className="glib-ctx-item" onClick={() => { onReveal(menu.asset); onClose(); }}>
          <Eye size={13} />
          הצג בתיקייה
        </button>
        <button className="glib-ctx-item" onClick={() => { onEditTags(menu.asset); onClose(); }}>
          <Tag size={13} />
          ערוך תגיות
        </button>
        <div className="glib-ctx-divider" />
        <div className="glib-ctx-item" style={{ cursor: "default", opacity: 0.55, fontSize: 9 }}>
          העבר לקטגוריה:
        </div>
        {CATEGORIES_FOR_MOVE.filter((c) => c !== menu.asset.category).map((cat) => (
          <button key={cat} className="glib-ctx-item" onClick={() => { onMove(menu.asset.id, cat); onClose(); }}>
            <FolderInput size={12} />
            {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
        <div className="glib-ctx-divider" />
        <button
          className="glib-ctx-item glib-ctx-item--danger"
          onClick={() => { onDelete(menu.asset.id); onClose(); }}
        >
          <Trash2 size={13} />
          מחק מהספרייה
        </button>
      </div>
    </>
  );
}

// ─── Asset cell (grid mode) ───────────────────────────────────────────────────

function AssetCell({
  asset,
  selected,
  onSelect,
  onContextMenu,
  onInsert,
  onDragStart,
  onToggleFav,
}: {
  asset: GraphicAsset;
  selected: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, asset: GraphicAsset) => void;
  onInsert: (asset: GraphicAsset) => void;
  onDragStart: (e: React.DragEvent, asset: GraphicAsset) => void;
  onToggleFav: (id: string) => void;
}) {
  return (
    <div
      className={`glib-cell ${selected ? "selected" : ""}`}
      onClick={() => onSelect(asset.id)}
      onDoubleClick={() => onInsert(asset)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, asset); }}
      draggable
      onDragStart={(e) => onDragStart(e, asset)}
      title={asset.fileName}
    >
      <ThumbnailImage asset={asset} className="glib-cell-img" />
      <button
        className={`glib-cell-fav ${asset.favorite ? "glib-cell-fav--active" : ""}`}
        onClick={(e) => { e.stopPropagation(); onToggleFav(asset.id); }}
        title={asset.favorite ? "הסר ממועדפים" : "מועדף"}
      >
        <Star size={9} fill={asset.favorite ? "currentColor" : "none"} />
      </button>
      {asset.type === "svg" && <span className="glib-cell-svg-badge">SVG</span>}
    </div>
  );
}

// ─── Asset row (list mode) ────────────────────────────────────────────────────

function AssetRow({
  asset,
  selected,
  onSelect,
  onContextMenu,
  onInsert,
  onDragStart,
  onToggleFav,
}: {
  asset: GraphicAsset;
  selected: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, asset: GraphicAsset) => void;
  onInsert: (asset: GraphicAsset) => void;
  onDragStart: (e: React.DragEvent, asset: GraphicAsset) => void;
  onToggleFav: (id: string) => void;
}) {
  return (
    <div
      className={`glib-list-row ${selected ? "selected" : ""}`}
      onClick={() => onSelect(asset.id)}
      onDoubleClick={() => onInsert(asset)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, asset); }}
      draggable
      onDragStart={(e) => onDragStart(e, asset)}
    >
      <ThumbnailImage asset={asset} className="glib-list-thumb" />
      <div className="glib-list-info">
        <div className="glib-list-name">{asset.fileName}</div>
        <div className="glib-list-meta">
          {asset.width > 0 ? `${asset.width}×${asset.height}` : asset.type.toUpperCase()}
          {" · "}
          {CATEGORY_LABELS[asset.category] ?? asset.category}
        </div>
      </div>
      <button
        className={`glib-list-fav ${asset.favorite ? "glib-list-fav--active" : ""}`}
        onClick={(e) => { e.stopPropagation(); onToggleFav(asset.id); }}
      >
        <Star size={11} fill={asset.favorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

// ─── Asset preview panel ──────────────────────────────────────────────────────

function AssetPreview({
  asset,
  onInsert,
  onSetAsBackground,
}: {
  asset: GraphicAsset;
  onInsert: (asset: GraphicAsset) => void;
  onSetAsBackground: (asset: GraphicAsset) => void;
}) {
  const [fullSrc, setFullSrc] = useState<string>("");

  useEffect(() => {
    if (!window.spp?.glib) return;
    let cancelled = false;
    setFullSrc("");
    window.spp.glib.readFileB64(asset.filePath).then((res) => {
      if (!cancelled && res.success && res.dataUrl) setFullSrc(res.dataUrl);
    });
    return () => { cancelled = true; };
  }, [asset.filePath]);

  const isBackground = asset.category === "Backgrounds" || asset.tags.includes("background");

  return (
    <div className="glib-preview">
      <div className="glib-preview-img-wrap">
        {fullSrc ? (
          <img src={fullSrc} alt={asset.fileName} className="glib-preview-img" />
        ) : (
          <ThumbnailImage asset={asset} className="glib-preview-img" />
        )}
      </div>
      <div className="glib-preview-body">
        <div className="glib-preview-name">{asset.fileName}</div>
        <div className="glib-preview-meta">
          {asset.width > 0 && `${asset.width}×${asset.height}px · `}
          {asset.orientation === "landscape" ? "אופקי" : asset.orientation === "portrait" ? "אנכי" : "ריבועי"}
          {asset.hasTransparency ? " · שקוף" : ""}
          {asset.source === "pixabay" ? " · Pixabay" : ""}
        </div>
        {asset.dominantColors.length > 0 && (
          <div className="glib-preview-colors">
            {asset.dominantColors.map((c, i) => (
              <div key={i} className="glib-color-dot" style={{ background: c }} title={c} />
            ))}
          </div>
        )}
        {asset.tags.length > 0 && (
          <div className="glib-preview-tags">
            {asset.tags.slice(0, 8).map((t) => (
              <span key={t} className="glib-tag">{t}</span>
            ))}
          </div>
        )}
      </div>
      <div className="glib-preview-actions">
        <button className="glib-action-btn glib-action-btn--primary" onClick={() => onInsert(asset)}>
          הוסף כשכבה
        </button>
        {isBackground && (
          <button className="glib-action-btn glib-action-btn--secondary" onClick={() => onSetAsBackground(asset)}>
            הגדר כרקע
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tags edit dialog ─────────────────────────────────────────────────────────

function TagsEditDialog({
  asset,
  onSave,
  onClose,
}: {
  asset: GraphicAsset;
  onSave: (id: string, tags: string[]) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(asset.tags.join(", "));

  const handleSave = () => {
    const tags = value.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
    onSave(asset.id, tags);
    onClose();
  };

  return (
    <div className="glib-ctx-backdrop" onClick={onClose} style={{ display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000 }}>
      <div
        className="glib-ctx-menu"
        style={{ position: "relative", left: "auto", top: "auto", minWidth: 200, padding: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 11, fontWeight: 700, direction: "rtl", marginBottom: 6 }}>ערוך תגיות</div>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", direction: "rtl", marginBottom: 4 }}>הפרד בפסיקים</div>
        <input
          className="glib-tags-edit"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          autoFocus
        />
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button className="glib-action-btn glib-action-btn--primary" style={{ flex: 1 }} onClick={handleSave}>שמור</button>
          <button className="glib-action-btn glib-action-btn--secondary" style={{ flex: 1 }} onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  asset,
  onConfirm,
  onClose,
}: {
  asset: GraphicAsset;
  onConfirm: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="glib-ctx-backdrop" onClick={onClose} style={{ display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000 }}>
      <div
        className="glib-ctx-menu"
        style={{ position: "relative", left: "auto", top: "auto", minWidth: 200, padding: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 11, fontWeight: 700, direction: "rtl", marginBottom: 6 }}>מחק קובץ?</div>
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", direction: "rtl", marginBottom: 10, lineHeight: 1.5 }}>
          "{asset.fileName}" יימחק מהדיסק ולא ניתן לשחזרו.
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="glib-action-btn glib-action-btn--secondary"
            style={{ flex: 1, color: "var(--error, #e54d4d)", borderColor: "var(--error, #e54d4d)" }}
            onClick={() => { onConfirm(asset.id); onClose(); }}
          >
            מחק
          </button>
          <button className="glib-action-btn glib-action-btn--secondary" style={{ flex: 1 }} onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add-files dropdown ───────────────────────────────────────────────────────

function AddMenu({
  baseDir,
  uploadCategory,
  onCategoryChange,
  onUploadFiles,
  onImportFolder,
  onOpenFolder,
  onClose,
}: {
  baseDir: string;
  uploadCategory: string;
  onCategoryChange: (cat: string) => void;
  onUploadFiles: () => void;
  onImportFolder: () => void;
  onOpenFolder: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="glib-ctx-backdrop" onClick={onClose} />
      <div className="glib-add-menu">
        {/* Category selector */}
        <div className="glib-add-menu-label">העלה אל קטגוריה:</div>
        <select
          className="glib-import-select"
          value={uploadCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          style={{ marginBottom: 6 }}
        >
          {CATEGORIES_FOR_MOVE.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
          ))}
        </select>

        <div className="glib-ctx-divider" style={{ margin: "6px 0" }} />

        <button className="glib-ctx-item" onClick={() => { onUploadFiles(); onClose(); }}>
          <Upload size={13} />
          בחר קבצים מהמחשב
        </button>
        <button className="glib-ctx-item" onClick={() => { onImportFolder(); onClose(); }}>
          <FolderInput size={13} />
          ייבא תיקייה שלמה
        </button>

        {baseDir && (
          <>
            <div className="glib-ctx-divider" style={{ margin: "6px 0" }} />
            <button className="glib-ctx-item" onClick={() => { onOpenFolder(); onClose(); }}>
              <FolderOpen size={13} />
              פתח תיקיית גרפיקות
            </button>
          </>
        )}
      </div>
    </>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export interface LocalGraphicsPanelProps {
  onInsertGraphic: (url: string, name: string) => void;
  onSetAsBackground?: (url: string, name: string) => void;
}

export function LocalGraphicsPanel({ onInsertGraphic, onSetAsBackground }: LocalGraphicsPanelProps) {
  const store = useGraphicsLibraryStore();
  const { assets, isScanning, scanProgress, selectedAssetId, filters, viewMode, baseDir } = store;

  const [thumbSize, setThumbSize] = useState<ThumbSize>("m");
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [tagsEditAsset, setTagsEditAsset] = useState<GraphicAsset | null>(null);
  const [deleteAsset, setDeleteAsset] = useState<GraphicAsset | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("Elements");
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const filteredAssets = useMemo(() => selectFilteredAssets(store), [store]);
  const categories = useMemo(() => selectCategories(store), [assets]);
  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );

  // Load index on mount; scan only once per app session (lastScanAt is 0 until scan runs)
  useEffect(() => {
    void (async () => {
      await useGraphicsLibraryStore.getState().loadIndex();
      // Read fresh state — not the stale closure value
      if (useGraphicsLibraryStore.getState().lastScanAt === 0) {
        void useGraphicsLibraryStore.getState().scan();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File upload ──────────────────────────────────────────────────────────────

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !window.spp?.glib) return;

    setIsUploading(true);
    let lastId: string | null = null;

    for (const file of files) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const match = /^data:image\/(\w+);base64,(.+)$/s.exec(dataUrl);
        if (!match) continue;
        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        const base64 = match[2];
        const filename = file.name.replace(/\.[^.]+$/, "");

        const result = await window.spp.glib.saveAsset({ base64, ext, filename, category: uploadCategory });
        if (result?.success && result.filePath && result.fileName) {
          await useGraphicsLibraryStore.getState().addFileToIndex({
            filePath: result.filePath,
            fileName: result.fileName,
            mtimeMs: result.mtimeMs ?? Date.now(),
            size: result.size ?? base64.length,
          });
          lastId = null; // we don't have the id until addFileToIndex processes it
        }
      } catch { /* skip failed files */ }
    }

    setIsUploading(false);
    // Switch category filter to where files were uploaded
    useGraphicsLibraryStore.getState().setFilter("category", uploadCategory);
    void lastId; // unused but reserved for future scroll-to
  }, [uploadCategory]);

  // ── Insert / background ──────────────────────────────────────────────────────

  const handleInsert = useCallback(
    (asset: GraphicAsset) => {
      if (!window.spp?.glib) return;
      window.spp.glib.readFileB64(asset.filePath).then((res) => {
        if (!res.success || !res.dataUrl) return;
        onInsertGraphic(res.dataUrl, asset.fileName.replace(/\.[^.]+$/, ""));
      });
    },
    [onInsertGraphic]
  );

  const handleSetAsBackground = useCallback(
    (asset: GraphicAsset) => {
      if (!window.spp?.glib) return;
      window.spp.glib.readFileB64(asset.filePath).then((res) => {
        if (!res.success || !res.dataUrl) return;
        if (onSetAsBackground) {
          onSetAsBackground(res.dataUrl, asset.fileName.replace(/\.[^.]+$/, ""));
        } else {
          onInsertGraphic(res.dataUrl, asset.fileName.replace(/\.[^.]+$/, ""));
        }
      });
    },
    [onInsertGraphic, onSetAsBackground]
  );

  // ── Drag ─────────────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, asset: GraphicAsset) => {
    const cached = thumbnailCache.get(asset.id);
    const name = asset.fileName.replace(/\.[^.]+$/, "");
    if (cached) {
      e.dataTransfer.setData("graphic/url", cached);
      e.dataTransfer.setData("graphic/name", name);
    } else {
      e.dataTransfer.setData("graphic/name", name);
      // Kick off full-res load asynchronously (best-effort after drag)
      void window.spp?.glib?.readFileB64(asset.filePath).then((res) => {
        if (res.success && res.dataUrl) thumbnailCache.set(asset.id, res.dataUrl);
      });
    }
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  // ── Context menu helpers ──────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, asset: GraphicAsset) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, asset });
  }, []);

  const handleReveal = useCallback((asset: GraphicAsset) => {
    window.spp?.glib?.revealFile(asset.filePath);
  }, []);

  // ── Import folder ─────────────────────────────────────────────────────────────

  const handleImportFolder = useCallback(async () => {
    if (!window.spp?.glib) return;
    const res = await window.spp.glib.chooseImportFolder();
    if (!res.success || !res.folderPath) return;
    await window.spp.glib.copyFolder({ srcDir: res.folderPath, category: uploadCategory });
    void useGraphicsLibraryStore.getState().scan();
  }, [uploadCategory]);

  // ── Open base folder ──────────────────────────────────────────────────────────

  const handleOpenFolder = useCallback(() => {
    if (baseDir) window.spp?.openFolder(baseDir);
  }, [baseDir]);

  // ── Progress ──────────────────────────────────────────────────────────────────

  const progressPct = scanProgress.total > 0
    ? Math.round((scanProgress.done / scanProgress.total) * 100)
    : 0;

  const gridClass = viewMode === "list" ? "glib-grid--list" : `glib-grid--${thumbSize}`;

  return (
    <div className="glib-panel">

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="glib-header">
        <Search size={13} className="glib-search-icon" />
        <input
          className="glib-search-input"
          placeholder="חפש גרפיקה..."
          value={filters.query}
          onChange={(e) => store.setFilter("query", e.target.value)}
        />

        {/* View mode */}
        <button
          className={`glib-icon-btn ${viewMode === "grid" && thumbSize === "m" ? "active" : ""}`}
          onClick={() => { store.setViewMode("grid"); setThumbSize("m"); }}
          title="רשת"
        >
          <Grid2X2 size={13} />
        </button>
        <button
          className={`glib-icon-btn ${viewMode === "list" ? "active" : ""}`}
          onClick={() => store.setViewMode("list")}
          title="רשימה"
        >
          <List size={13} />
        </button>

        {/* Refresh */}
        <button
          className={`glib-icon-btn ${isScanning ? "active" : ""}`}
          onClick={() => void store.scan()}
          title="רענן ספרייה"
          disabled={isScanning}
        >
          <RefreshCw size={13} style={isScanning ? { animation: "glib-spin 0.7s linear infinite" } : undefined} />
        </button>

        {/* Add / upload */}
        <button
          ref={addBtnRef}
          className={`glib-icon-btn ${showAddMenu ? "active" : ""} ${isUploading ? "active" : ""}`}
          onClick={() => setShowAddMenu((v) => !v)}
          title="הוסף גרפיקה"
        >
          {isUploading
            ? <RefreshCw size={13} style={{ animation: "glib-spin 0.7s linear infinite" }} />
            : <Plus size={13} />
          }
        </button>
      </div>

      {/* ── Add menu ────────────────────────────────────────────────────── */}
      {showAddMenu && (
        <AddMenu
          baseDir={baseDir}
          uploadCategory={uploadCategory}
          onCategoryChange={setUploadCategory}
          onUploadFiles={() => fileInputRef.current?.click()}
          onImportFolder={handleImportFolder}
          onOpenFolder={handleOpenFolder}
          onClose={() => setShowAddMenu(false)}
        />
      )}

      {/* ── Grid size (only in grid mode) ───────────────────────────────── */}
      {viewMode === "grid" && (
        <div className="glib-size-row">
          {(["s", "m", "l"] as ThumbSize[]).map((sz) => (
            <button
              key={sz}
              className={`glib-icon-btn ${thumbSize === sz ? "active" : ""}`}
              onClick={() => setThumbSize(sz)}
              title={sz === "s" ? "קטן (4 בשורה)" : sz === "m" ? "בינוני (3 בשורה)" : "גדול (2 בשורה)"}
              style={{ width: 22, height: 22 }}
            >
              {sz === "s" ? <LayoutGrid size={11} /> : sz === "m" ? <Grid2X2 size={11} /> : <Square size={11} />}
            </button>
          ))}
        </div>
      )}

      {/* ── Category chips ───────────────────────────────────────────────── */}
      <div className="glib-categories">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`glib-cat-chip ${filters.category === cat ? "active" : ""}`}
            onClick={() => store.setFilter("category", cat)}
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="glib-filters">
        <select
          className="glib-filter-select"
          value={filters.orientation}
          onChange={(e) => store.setFilter("orientation", e.target.value as GlibFilters["orientation"])}
          title="כיוון"
        >
          <option value="">כל הכיוון</option>
          <option value="landscape">אופקי</option>
          <option value="portrait">אנכי</option>
          <option value="square">ריבועי</option>
        </select>

        <select
          className="glib-filter-select"
          value={filters.fileType}
          onChange={(e) => store.setFilter("fileType", e.target.value as GlibFilters["fileType"])}
          title="סוג קובץ"
        >
          <option value="">כל הסוגים</option>
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
          <option value="webp">WebP</option>
          <option value="svg">SVG</option>
        </select>

        <select
          className="glib-filter-select"
          value={filters.colorName}
          onChange={(e) => store.setFilter("colorName", e.target.value as GlibFilters["colorName"])}
          title="צבע"
        >
          <option value="">כל הצבעים</option>
          {(["red","orange","yellow","green","blue","purple","pink","brown","black","white","gray","gold"] as const).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <label
          className={`glib-filter-toggle ${filters.favoritesOnly ? "active" : ""}`}
          title="מועדפים בלבד"
        >
          <input
            type="checkbox"
            checked={filters.favoritesOnly}
            onChange={(e) => store.setFilter("favoritesOnly", e.target.checked)}
          />
          ⭐
        </label>

        <label
          className={`glib-filter-toggle ${filters.transparentOnly ? "active" : ""}`}
          title="שקוף בלבד"
        >
          <input
            type="checkbox"
            checked={filters.transparentOnly}
            onChange={(e) => store.setFilter("transparentOnly", e.target.checked)}
          />
          PNG⊠
        </label>
      </div>

      {/* ── Scan progress ────────────────────────────────────────────────── */}
      {isScanning && (
        <>
          <div className="glib-progress">
            <div className="glib-progress-bar" style={{ width: `${scanProgress.total ? progressPct : 30}%` }} />
          </div>
          <div className="glib-scan-status">
            {scanProgress.total > 0
              ? `סורק... ${scanProgress.done}/${scanProgress.total}`
              : "אוסף רשימת קבצים..."}
          </div>
        </>
      )}

      {/* ── Asset grid ───────────────────────────────────────────────────── */}
      <div className="glib-grid-wrap">
        <div className={`glib-grid ${gridClass}`}>

          {/* Empty — no assets at all */}
          {!isScanning && assets.length === 0 && (
            <div className="glib-state">
              <div className="glib-state-icon">🖼️</div>
              <div style={{ marginBottom: 12 }}>
                הספרייה ריקה עדיין.<br />
                הוסף גרפיקות כדי להתחיל.
              </div>
              <button
                className="glib-action-btn glib-action-btn--primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", fontSize: 11 }}
                onClick={() => setShowAddMenu(true)}
              >
                <Plus size={13} />
                הוסף גרפיקה
              </button>
            </div>
          )}

          {/* Filters returned nothing */}
          {!isScanning && assets.length > 0 && filteredAssets.length === 0 && (
            <div className="glib-state">
              <div className="glib-state-icon">🔍</div>
              <div>לא נמצאו תוצאות</div>
              <button
                className="glib-action-btn glib-action-btn--secondary"
                style={{ marginTop: 8, fontSize: 10 }}
                onClick={() => store.resetFilters()}
              >
                נקה פילטרים
              </button>
            </div>
          )}

          {filteredAssets.map((asset) =>
            viewMode === "list" ? (
              <AssetRow
                key={asset.id}
                asset={asset}
                selected={asset.id === selectedAssetId}
                onSelect={store.setSelectedAsset}
                onContextMenu={handleContextMenu}
                onInsert={handleInsert}
                onDragStart={handleDragStart}
                onToggleFav={store.toggleFavorite}
              />
            ) : (
              <AssetCell
                key={asset.id}
                asset={asset}
                selected={asset.id === selectedAssetId}
                onSelect={store.setSelectedAsset}
                onContextMenu={handleContextMenu}
                onInsert={handleInsert}
                onDragStart={handleDragStart}
                onToggleFav={store.toggleFavorite}
              />
            )
          )}
        </div>
      </div>

      {/* ── Footer / count ───────────────────────────────────────────────── */}
      {!isScanning && assets.length > 0 && (
        <div className="glib-footer">
          {filteredAssets.length} מתוך {assets.length} פריטים · גרור לקנבס או לחץ פעמיים
        </div>
      )}

      {/* ── Asset preview ────────────────────────────────────────────────── */}
      {selectedAsset && (
        <AssetPreview
          asset={selectedAsset}
          onInsert={handleInsert}
          onSetAsBackground={handleSetAsBackground}
        />
      )}

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onToggleFav={store.toggleFavorite}
          onReveal={handleReveal}
          onEditTags={(a) => setTagsEditAsset(a)}
          onMove={store.moveAsset}
          onDelete={(id) => {
            const asset = assets.find((a) => a.id === id);
            if (asset) setDeleteAsset(asset);
          }}
        />
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      {tagsEditAsset && (
        <TagsEditDialog
          asset={tagsEditAsset}
          onSave={store.updateAssetTags}
          onClose={() => setTagsEditAsset(null)}
        />
      )}

      {deleteAsset && (
        <DeleteConfirmDialog
          asset={deleteAsset}
          onConfirm={store.deleteAsset}
          onClose={() => setDeleteAsset(null)}
        />
      )}
    </div>
  );
}

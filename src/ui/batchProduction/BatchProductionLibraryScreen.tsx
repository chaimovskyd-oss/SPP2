import { ArrowRight, Copy, Edit2, ImageIcon, Layers, Trash2, Zap } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  deleteTemplate,
  duplicateTemplate,
  loadTemplateDocument,
  loadTemplateIndex,
  loadTemplateThumbnail,
  type BatchTemplateIndexItem,
} from "@/core/batchProduction/batchTemplateStore";
import type { Document } from "@/types/document";
import "./batchProduction.css";

interface BatchProductionLibraryScreenProps {
  onEditTemplate: (doc: Document) => void;
  onProduce?: (item: BatchTemplateIndexItem) => void;
  onCancel: () => void;
}

export function BatchProductionLibraryScreen({
  onEditTemplate,
  onProduce,
  onCancel,
}: BatchProductionLibraryScreenProps): ReactElement {
  const [templates, setTemplates] = useState<BatchTemplateIndexItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<BatchTemplateIndexItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function refreshTemplates(): Promise<void> {
    const items = await loadTemplateIndex();
    setTemplates(items);
    const thumbs: Record<string, string> = {};
    await Promise.all(
      items.map(async (t) => {
        const url = t.thumbnailDataUrl ?? (await loadTemplateThumbnail(t.templateId));
        if (url) thumbs[t.templateId] = url;
      })
    );
    setThumbnails(thumbs);
  }

  useEffect(() => {
    void refreshTemplates();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.templateName.toLowerCase().includes(q));
  }, [templates, query]);

  async function handleEdit(): Promise<void> {
    if (!selected) return;
    const doc = await loadTemplateDocument(selected.templateId);
    if (!doc) return;
    onEditTemplate(doc);
  }

  async function handleDuplicate(): Promise<void> {
    if (!selected) return;
    const newItem = await duplicateTemplate(selected.templateId);
    if (newItem) {
      await refreshTemplates();
      setSelected(newItem);
    }
  }

  function handleDelete(): void {
    if (!selected) return;
    setConfirmDelete(selected.templateId);
  }

  async function confirmDeleteAction(): Promise<void> {
    if (!confirmDelete) return;
    await deleteTemplate(confirmDelete);
    await refreshTemplates();
    if (selected?.templateId === confirmDelete) setSelected(null);
    setConfirmDelete(null);
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return iso;
    }
  }

  function formatSize(item: BatchTemplateIndexItem): string {
    const w = Math.round(item.canvasWidthPx);
    const h = Math.round(item.canvasHeightPx);
    return `${w}×${h}px`;
  }

  return (
    <div className="bp-screen" dir="rtl">
      <header className="bp-header">
        <button className="bp-back-btn" onClick={onCancel} type="button">
          <ArrowRight size={14} />
          חזרה
        </button>
        <span className="bp-header-title">ספריית תבניות ייצור סדרתי</span>
        <div className="bp-header-search">
          <Layers size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
          <input
            placeholder="חיפוש תבנית..."
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </header>

      <div className="bp-body">
        {filtered.length === 0 ? (
          <div className="bp-empty">
            <Layers size={48} strokeWidth={1} />
            <strong>{templates.length === 0 ? "אין תבניות עדיין" : "לא נמצאו תבניות"}</strong>
            <p>
              {templates.length === 0
                ? "עצב מסמך ב-Free Mode, סמן שכבות כ-Variable, ולחץ שמירה ← שמור כתבנית ייצור."
                : "נסה שם אחר."}
            </p>
          </div>
        ) : (
          <div className="bp-grid">
            {filtered.map((t) => (
              <div
                key={t.templateId}
                className={`bp-card ${selected?.templateId === t.templateId ? "selected" : ""}`}
                onClick={() => setSelected((prev) => prev?.templateId === t.templateId ? null : t)}
              >
                <div className="bp-card-thumb">
                  {thumbnails[t.templateId] ? (
                    <img alt={t.templateName} src={thumbnails[t.templateId]} />
                  ) : (
                    <div className="bp-card-thumb-placeholder">
                      <ImageIcon size={32} strokeWidth={1} />
                      <span>אין תצוגה מקדימה</span>
                    </div>
                  )}
                </div>
                <div className="bp-card-info">
                  <div className="bp-card-name" title={t.templateName}>{t.templateName}</div>
                  <div className="bp-card-meta">
                    {t.variableFieldTypes.includes("image") && (
                      <span className="bp-card-badge img">
                        <ImageIcon size={9} /> תמונה
                      </span>
                    )}
                    {t.variableFieldTypes.includes("text") && (
                      <span className="bp-card-badge txt">
                        <Layers size={9} /> טקסט
                      </span>
                    )}
                    <span className="bp-card-badge">{formatSize(t)}</span>
                  </div>
                  <div className="bp-card-date">{formatDate(t.updatedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <footer className="bp-footer">
          <span className="bp-footer-name">{selected.templateName}</span>
          <button className="bp-footer-btn primary" onClick={handleEdit} type="button">
            <Edit2 size={13} />
            עריכה
          </button>
          <button className="bp-footer-btn" onClick={handleDuplicate} type="button">
            <Copy size={13} />
            שכפול
          </button>
          <button
            className="bp-footer-btn"
            disabled={!onProduce}
            title={onProduce ? "פתח אשף ייצור" : "בקרוב"}
            type="button"
            onClick={() => onProduce?.(selected)}
          >
            <Zap size={13} />
            ייצור
          </button>
          <button className="bp-footer-btn danger" onClick={handleDelete} type="button">
            <Trash2 size={13} />
            מחיקה
          </button>
        </footer>
      )}

      {confirmDelete && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            style={{
              background: "var(--color-surface, #111c33)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 16, padding: "28px 32px", maxWidth: 360,
              textAlign: "center", display: "flex", flexDirection: "column", gap: 16
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <strong style={{ fontSize: 16 }}>מחיקת תבנית</strong>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary, #aebbd0)", margin: 0 }}>
              האם למחוק את התבנית? לא ניתן לבטל פעולה זו.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13 }}
                onClick={() => setConfirmDelete(null)}
                type="button"
              >
                ביטול
              </button>
              <button
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                onClick={confirmDeleteAction}
                type="button"
              >
                מחק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

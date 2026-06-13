import { useEffect, useRef, useState, type ReactElement } from "react";
import { AlertTriangle, FileText, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { openPdfFromBytes, renderPdfPageToImage, renderPdfThumbnail } from "./pdfRenderService";
import { parsePageRange } from "../print/printRangeUtils";
import {
  PDF_IMPORT_DPI,
  loadLastPdfImportMode,
  saveLastPdfImportMode,
  type PdfImportMode,
  type PdfImportRenderedPage
} from "./pdfCanvasImport";

const MANY_PAGES_WARN = 30;
const ALL_PAGES_CONFIRM = 100;

export interface PdfImportDialogProps {
  file: File;
  onClose: () => void;
  onConfirm: (result: { mode: PdfImportMode; pages: PdfImportRenderedPage[] }) => void;
}

/**
 * Modal for importing PDF pages into the regular canvas. Loads the PDF once,
 * shows a thumbnail grid for page selection, then renders the selected pages at
 * 300 DPI on confirm. Rendering is sequential with progress feedback so the UI
 * never freezes; the loaded document is destroyed on unmount.
 */
export function PdfImportDialog({ file, onClose, onConfirm }: PdfImportDialogProps): ReactElement {
  const [numPages, setNumPages] = useState(0);
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set()); // zero-based indices
  const [rangeText, setRangeText] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [mode, setMode] = useState<PdfImportMode>(loadLastPdfImportMode());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let localDoc: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        setLoading(true);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const doc = await openPdfFromBytes(bytes);
        if (cancelledRef.current) {
          await doc.destroy();
          return;
        }
        localDoc = doc;
        docRef.current = doc;
        setNumPages(doc.numPages);
        setThumbs(new Array(doc.numPages).fill(null));
        setLoading(false);
        for (let i = 0; i < doc.numPages; i += 1) {
          if (cancelledRef.current) return;
          try {
            const thumb = await renderPdfThumbnail(doc, i);
            if (cancelledRef.current) return;
            setThumbs((prev) => {
              const next = prev.slice();
              next[i] = thumb.dataUrl;
              return next;
            });
          } catch {
            /* skip an unrenderable thumbnail; the page can still be selected */
          }
        }
      } catch {
        if (!cancelledRef.current) {
          setLoadError("לא ניתן לפתוח את קובץ ה-PDF.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelledRef.current = true;
      void localDoc?.destroy();
      docRef.current = null;
    };
  }, [file]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape" && progress === null) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, progress]);

  function toggle(index: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setRangeText("");
    setRangeError(null);
  }

  function selectAll(): void {
    setSelected(new Set(Array.from({ length: numPages }, (_, i) => i)));
    setRangeText("");
    setRangeError(null);
  }

  function clearSelection(): void {
    setSelected(new Set());
    setRangeText("");
    setRangeError(null);
  }

  function applyRange(text: string): void {
    setRangeText(text);
    if (!text.trim()) {
      setRangeError(null);
      return;
    }
    const result = parsePageRange(text, numPages);
    if (result.error !== undefined) {
      setRangeError(result.error);
      return;
    }
    setRangeError(null);
    setSelected(new Set(result.indices));
  }

  async function handleConfirm(): Promise<void> {
    const doc = docRef.current;
    if (doc === null || selected.size === 0) return;
    const indices = Array.from(selected).sort((a, b) => a - b);
    if (
      indices.length > ALL_PAGES_CONFIRM &&
      !window.confirm(
        `בחרת ${indices.length} עמודים לייבוא. פעולה זו עשויה לקחת זמן ולצרוך זיכרון רב. להמשיך?`
      )
    ) {
      return;
    }
    try {
      const pages: PdfImportRenderedPage[] = [];
      for (let k = 0; k < indices.length; k += 1) {
        if (cancelledRef.current) return;
        setProgress(`מעבד עמוד ${k + 1} מתוך ${indices.length}…`);
        // Yield so the progress label paints before the heavy render.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const rendered = await renderPdfPageToImage(doc, indices[k], { dpi: PDF_IMPORT_DPI });
        pages.push({ ...rendered, pageNumber: indices[k] + 1 });
      }
      saveLastPdfImportMode(mode);
      onConfirm({ mode, pages });
    } catch {
      setProgress(null);
      setLoadError("שגיאה בעיבוד עמודי ה-PDF.");
    }
  }

  const busy = progress !== null;
  const manyPages = numPages > MANY_PAGES_WARN;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-elevated, #2c2a35)",
          border: "1px solid var(--border, #35323f)",
          borderRadius: 12,
          padding: "20px 24px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          width: 640,
          maxWidth: "95vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          direction: "rtl"
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 15, minWidth: 0 }}>
            <FileText size={16} style={{ color: "var(--accent, #7c6fe0)", flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ייבוא PDF — {file.name}
            </span>
          </div>
          {!busy && (
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary, #8b88a0)", padding: 4 }}
              type="button"
              title="ביטול"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Info row */}
        <div style={{ fontSize: 12, color: "var(--text-secondary, #8b88a0)", marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span>סה"כ עמודים: <strong style={{ color: "var(--text-primary)" }}>{loading ? "…" : numPages}</strong></span>
          <span>נבחרו: <strong style={{ color: "var(--text-primary)" }}>{selected.size}</strong></span>
          <button className="btn btn-ghost" type="button" onClick={selectAll} disabled={busy || loading || numPages === 0} style={{ fontSize: 12 }}>
            בחר הכל
          </button>
          <button className="btn btn-ghost" type="button" onClick={clearSelection} disabled={busy || selected.size === 0} style={{ fontSize: 12 }}>
            נקה בחירה
          </button>
        </div>

        {manyPages && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px", marginBottom: 12, borderRadius: 8, background: "rgba(224,170,107,0.12)", border: "1px solid rgba(224,170,107,0.4)", fontSize: 12, color: "var(--text-primary)" }}>
            <AlertTriangle size={14} style={{ color: "#e0aa6b", flexShrink: 0, marginTop: 1 }} />
            <span>ל-PDF זה יש הרבה עמודים ({numPages}). ייבוא רבים מהם עשוי לקחת זמן ולצרוך זיכרון רב.</span>
          </div>
        )}

        {/* Thumbnail grid */}
        <div className="pdf-import-grid" style={{ flex: 1, overflowY: "auto", minHeight: 160, marginBottom: 12 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>טוען PDF…</div>
          ) : loadError !== null ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--danger, #e06b6b)", fontSize: 13 }}>{loadError}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
              {Array.from({ length: numPages }, (_, i) => {
                const isSelected = selected.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggle(i)}
                    disabled={busy}
                    className={`pdf-import-thumb ${isSelected ? "selected" : ""}`}
                    style={{
                      position: "relative",
                      padding: 4,
                      borderRadius: 8,
                      cursor: busy ? "default" : "pointer",
                      background: isSelected ? "var(--accent-glow, rgba(124,111,224,0.16))" : "var(--bg-surface, #211f28)",
                      border: `2px solid ${isSelected ? "var(--accent, #7c6fe0)" : "var(--border, #35323f)"}`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    <div style={{ width: "100%", height: 120, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#fff", borderRadius: 4 }}>
                      {thumbs[i] !== null && thumbs[i] !== undefined ? (
                        <img src={thumbs[i] as string} alt={`עמוד ${i + 1}`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                      ) : (
                        <span style={{ fontSize: 11, color: "#999" }}>…</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>עמוד {i + 1}</span>
                    {isSelected && (
                      <span style={{ position: "absolute", top: 6, insetInlineEnd: 6, background: "var(--accent, #7c6fe0)", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Page range input */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
            טווח עמודים
          </label>
          <input
            type="text"
            value={rangeText}
            onChange={(e) => applyRange(e.target.value)}
            placeholder="לדוגמה: 1-3,5,8-10"
            disabled={busy || loading}
            style={{
              width: "100%",
              padding: "7px 10px",
              background: "var(--bg-surface, #211f28)",
              border: `1px solid ${rangeError ? "var(--danger, #e06b6b)" : "var(--border, #35323f)"}`,
              borderRadius: 6,
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
              direction: "ltr"
            }}
          />
          {rangeError !== null && (
            <div style={{ marginTop: 5, fontSize: 12, color: "var(--danger, #e06b6b)" }}>{rangeError}</div>
          )}
        </div>

        {/* Import mode */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>אופן הייבוא</div>
          <ModeOption
            label="לקנבס הנוכחי כשכבות"
            description="כל עמוד נבחר נוסף לעמוד הנוכחי כשכבת תמונה, ממורכז ומותאם לגודל"
            checked={mode === "currentCanvas"}
            onChange={() => setMode("currentCanvas")}
            disabled={busy}
          />
          <ModeOption
            label="כל עמוד כעמוד SPP נפרד"
            description="לכל עמוד PDF נוצר עמוד פרויקט חדש בגודל הקנבס הנוכחי"
            checked={mode === "separatePages"}
            onChange={() => setMode("separatePages")}
            disabled={busy}
          />
        </div>

        {/* Progress */}
        {busy && (
          <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--bg-surface)", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)", textAlign: "center" }}>
            {progress}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy || loading || selected.size === 0}
            style={{ flex: 1 }}
          >
            ייבא {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

interface ModeOptionProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}

function ModeOption({ label, description, checked, onChange, disabled }: ModeOptionProps): ReactElement {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        cursor: disabled ? "default" : "pointer",
        background: checked ? "var(--accent-glow, rgba(124,111,224,0.12))" : "transparent",
        border: `1px solid ${checked ? "var(--accent, #7c6fe0)" : "transparent"}`,
        marginBottom: 4,
        opacity: disabled ? 0.6 : 1
      }}
    >
      <input type="radio" checked={checked} onChange={onChange} disabled={disabled} style={{ marginTop: 2, accentColor: "var(--accent, #7c6fe0)" }} />
      <div>
        <div style={{ fontWeight: checked ? 600 : 400, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary, #5f5d72)", marginTop: 2 }}>{description}</div>
      </div>
    </label>
  );
}

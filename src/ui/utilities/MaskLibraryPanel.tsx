import { Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { generateMaskThumbnail, useMaskLibraryStore, type MaskLibraryEntry } from "@/state/maskLibraryStore";

interface MaskLibraryPanelProps {
  onClose: () => void;
}

type FormMode = "closed" | "add" | "edit";

interface FormState {
  name: string;
  fileDataUrl: string;
  fileType: "svg" | "png";
  naturalWidth: number;
  naturalHeight: number;
  defaultWidth: number;
  defaultHeight: number;
  thresholdEnabled: boolean;
  thresholdColor: "white" | "black";
  thresholdTolerance: number;
  thresholdFeather: number;
  preview: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  fileDataUrl: "",
  fileType: "png",
  naturalWidth: 200,
  naturalHeight: 200,
  defaultWidth: 200,
  defaultHeight: 200,
  thresholdEnabled: false,
  thresholdColor: "white",
  thresholdTolerance: 30,
  thresholdFeather: 4,
  preview: ""
};

export function MaskLibraryPanel({ onClose }: MaskLibraryPanelProps): ReactElement {
  const entries = useMaskLibraryStore((s) => s.entries);
  const addEntry = useMaskLibraryStore((s) => s.addEntry);
  const removeEntry = useMaskLibraryStore((s) => s.removeEntry);
  const updateEntry = useMaskLibraryStore((s) => s.updateEntry);

  const [formMode, setFormMode] = useState<FormMode>("closed");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aspectRatio = form.naturalHeight > 0 ? form.naturalWidth / form.naturalHeight : 1;

  // Regenerate preview when threshold params change
  useEffect(() => {
    if (!form.fileDataUrl || form.fileType === "svg") return;
    setPreviewLoading(true);
    void generateMaskThumbnail(
      form.fileDataUrl,
      form.fileType,
      form.thresholdEnabled,
      form.thresholdColor,
      form.thresholdTolerance,
      form.thresholdFeather
    ).then((thumb) => {
      setForm((f) => ({ ...f, preview: thumb }));
      setPreviewLoading(false);
    });
  }, [form.fileDataUrl, form.fileType, form.thresholdEnabled, form.thresholdColor, form.thresholdTolerance, form.thresholdFeather]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const isSvg = file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml";
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new window.Image();
      img.onload = () => {
        const w = img.naturalWidth || 200;
        const h = img.naturalHeight || 200;
        setForm((f) => ({
          ...f,
          name: f.name || file.name.replace(/\.[^.]+$/, ""),
          fileDataUrl: dataUrl,
          fileType: isSvg ? "svg" : "png",
          naturalWidth: w,
          naturalHeight: h,
          defaultWidth: w,
          defaultHeight: h,
          preview: isSvg ? dataUrl : f.preview
        }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function patchWidth(value: number): void {
    const ratio = form.naturalHeight > 0 ? form.naturalWidth / form.naturalHeight : 1;
    setForm((f) => ({ ...f, defaultWidth: value, defaultHeight: Math.round(value / ratio) }));
  }

  function handleSave(): void {
    if (!form.fileDataUrl || !form.name.trim()) return;
    const thumbnail = form.preview || form.fileDataUrl;
    if (formMode === "add") {
      addEntry({
        name: form.name.trim(),
        type: form.fileType,
        fileDataUrl: form.fileDataUrl,
        thumbnailDataUrl: thumbnail,
        defaultWidth: form.defaultWidth,
        defaultHeight: form.defaultHeight,
        thresholdEnabled: form.thresholdEnabled,
        thresholdColor: form.thresholdColor,
        thresholdTolerance: form.thresholdTolerance,
        thresholdFeather: form.thresholdFeather
      });
    } else if (formMode === "edit" && editingId !== null) {
      updateEntry(editingId, {
        name: form.name.trim(),
        type: form.fileType,
        fileDataUrl: form.fileDataUrl,
        thumbnailDataUrl: thumbnail,
        defaultWidth: form.defaultWidth,
        defaultHeight: form.defaultHeight,
        thresholdEnabled: form.thresholdEnabled,
        thresholdColor: form.thresholdColor,
        thresholdTolerance: form.thresholdTolerance,
        thresholdFeather: form.thresholdFeather
      });
    }
    setFormMode("closed");
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleEdit(entry: MaskLibraryEntry): void {
    setFormMode("edit");
    setEditingId(entry.id);
    setForm({
      name: entry.name,
      fileDataUrl: entry.fileDataUrl ?? "",
      fileType: (entry.type === "svg" ? "svg" : "png") as "svg" | "png",
      naturalWidth: entry.defaultWidth,
      naturalHeight: entry.defaultHeight,
      defaultWidth: entry.defaultWidth,
      defaultHeight: entry.defaultHeight,
      thresholdEnabled: entry.thresholdEnabled,
      thresholdColor: entry.thresholdColor,
      thresholdTolerance: entry.thresholdTolerance,
      thresholdFeather: entry.thresholdFeather,
      preview: entry.thumbnailDataUrl ?? ""
    });
  }

  function cancelForm(): void {
    setFormMode("closed");
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  const canSave = form.name.trim().length > 0 && form.fileDataUrl.length > 0;

  return (
    <div className="util-panel mask-library-panel">
      <div className="util-panel-header">
        <span>ספריית מסיכות</span>
        <button className="icon-btn" onClick={onClose} type="button"><X size={14} /></button>
      </div>

      <div className="util-panel-body">
        {/* ── Entry grid ── */}
        {entries.length === 0 && formMode === "closed" ? (
          <div className="mask-lib-empty">
            <span>הספרייה ריקה. הוסף מסיכות מסוג SVG או PNG.</span>
          </div>
        ) : (
          <div className="mask-lib-grid">
            {entries.map((entry) => (
              <div key={entry.id} className="mask-lib-card">
                <div className="mask-lib-thumb">
                  {entry.thumbnailDataUrl ? (
                    <img src={entry.thumbnailDataUrl} alt={entry.name} />
                  ) : (
                    <div className="mask-lib-thumb-placeholder" />
                  )}
                </div>
                <div className="mask-lib-name">{entry.name}</div>
                <div className="mask-lib-meta">{entry.defaultWidth}×{entry.defaultHeight}px</div>
                <div className="mask-lib-actions">
                  <button className="icon-btn" title="עריכה" onClick={() => handleEdit(entry)} type="button">
                    <Pencil size={12} />
                  </button>
                  <button className="icon-btn danger" title="מחיקה" onClick={() => removeEntry(entry.id)} type="button">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Add button ── */}
        {formMode === "closed" && (
          <button
            className="btn btn-accent wide"
            onClick={() => setFormMode("add")}
            type="button"
          >
            <Plus size={14} />
            הוסף מסיכה
          </button>
        )}

        {/* ── Add / Edit form ── */}
        {formMode !== "closed" && (
          <div className="mask-lib-form">
            <div className="mask-lib-form-title">
              {formMode === "add" ? "הוספת מסיכה חדשה" : "עריכת מסיכה"}
            </div>

            {/* File upload */}
            <div className="mask-lib-field">
              <span className="util-field-label">קובץ (SVG / PNG)</span>
              <input ref={fileInputRef} type="file" accept=".svg,.png,image/svg+xml,image/png" style={{ display: "none" }} onChange={handleFileChange} />
              <button className="btn btn-ghost wide" onClick={() => fileInputRef.current?.click()} type="button">
                {form.fileDataUrl ? "החלף קובץ" : "בחר קובץ..."}
              </button>
              {form.fileDataUrl && (
                <div className="mask-lib-preview-row">
                  <div className="mask-lib-preview-thumb">
                    {previewLoading ? (
                      <div className="mask-lib-preview-spinner" />
                    ) : (
                      <img src={form.preview || form.fileDataUrl} alt="preview" />
                    )}
                  </div>
                  <span className="mask-lib-file-info">{form.fileType.toUpperCase()} • {form.naturalWidth}×{form.naturalHeight}</span>
                </div>
              )}
            </div>

            {/* Name */}
            <div className="mask-lib-field">
              <span className="util-field-label">שם</span>
              <input
                className="util-input"
                type="text"
                placeholder="שם המסיכה"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Default size */}
            <div className="mask-lib-field">
              <span className="util-field-label">
                גודל ברירת מחדל (px)
                <Lock size={10} style={{ opacity: 0.5 }} />
                <span style={{ fontSize: 10, opacity: 0.5 }}>פרופורציונלי</span>
              </span>
              <div className="mask-lib-size-row">
                <label>
                  <span>רוחב</span>
                  <input
                    className="util-input"
                    type="number"
                    min={10}
                    max={3000}
                    value={form.defaultWidth}
                    onChange={(e) => patchWidth(Math.max(10, Number(e.target.value)))}
                  />
                </label>
                <span className="mask-lib-size-x">×</span>
                <label>
                  <span>גובה</span>
                  <input
                    className="util-input"
                    type="number"
                    min={10}
                    max={3000}
                    value={form.defaultHeight}
                    readOnly
                    style={{ opacity: 0.6 }}
                  />
                </label>
              </div>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                יחס: {aspectRatio.toFixed(2)}:1
              </span>
            </div>

            {/* PNG threshold options */}
            {form.fileType === "png" && (
              <div className="mask-lib-field">
                <label className="mask-lib-toggle-row">
                  <input
                    type="checkbox"
                    checked={form.thresholdEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, thresholdEnabled: e.target.checked }))}
                  />
                  <span className="util-field-label">הגדר threshold (לבן → שקוף)</span>
                </label>

                {form.thresholdEnabled && (
                  <div className="mask-lib-threshold">
                    <div className="mask-lib-threshold-row">
                      <span>צבע</span>
                      <div className="seg">
                        {(["white", "black"] as const).map((c) => (
                          <button
                            key={c}
                            className={form.thresholdColor === c ? "on" : ""}
                            onClick={() => setForm((f) => ({ ...f, thresholdColor: c }))}
                            type="button"
                          >
                            {c === "white" ? "לבן" : "שחור"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mask-lib-threshold-row">
                      <span>עוצמה ({form.thresholdTolerance})</span>
                      <input
                        type="range"
                        min={0}
                        max={255}
                        value={form.thresholdTolerance}
                        onChange={(e) => setForm((f) => ({ ...f, thresholdTolerance: Number(e.target.value) }))}
                        style={{ accentColor: "var(--accent)" }}
                      />
                    </div>
                    <div className="mask-lib-threshold-row">
                      <span>ריכוך ({form.thresholdFeather})</span>
                      <input
                        type="range"
                        min={0}
                        max={20}
                        value={form.thresholdFeather}
                        onChange={(e) => setForm((f) => ({ ...f, thresholdFeather: Number(e.target.value) }))}
                        style={{ accentColor: "var(--accent)" }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Form footer */}
            <div className="mask-lib-form-footer">
              <button className="btn btn-ghost" onClick={cancelForm} type="button">ביטול</button>
              <button className="btn btn-accent" onClick={handleSave} disabled={!canSave} type="button">
                {formMode === "add" ? "הוסף לספרייה" : "שמור שינויים"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

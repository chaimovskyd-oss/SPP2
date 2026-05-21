import {
  CheckCircle,
  ImageIcon,
  RefreshCw,
  Trash2,
  UploadCloud,
  Zap,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactElement,
} from "react";
import type { BatchRecord, BatchTextVariableField, BatchWizardResult } from "@/types/batchProduction";
import type { BatchTemplateIndexItem } from "@/core/batchProduction/batchTemplateStore";
import { loadTemplateDocument } from "@/core/batchProduction/batchTemplateStore";
import { getBatchProductionMeta } from "@/core/batchProduction/batchProductionMeta";
import { GlobalWizardDropTarget } from "@/ui/wizard/GlobalWizardDropTarget";
import "./batchProduction.css";

// ─── Props ────────────────────────────────────────────────────────────────────

interface BatchProductionWizardProps {
  template: BatchTemplateIndexItem;
  onComplete: (result: BatchWizardResult) => void;
  onCancel: () => void;
}

type WizardStep = 1 | 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractBaseName(file: File): string {
  return file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build initial fields map for a new record based on template text fields. */
function buildInitialFields(
  file: File,
  textFields: BatchTextVariableField[],
): Record<string, string> {
  const baseName = extractBaseName(file);
  const fields: Record<string, string> = {};
  for (const f of textFields) {
    fields[f.id] = f.sourceField === "name" || f.id === "name" ? baseName : "";
  }
  if (textFields.length === 0) fields["name"] = baseName;
  return fields;
}

function validateRecord(
  r: BatchRecord,
  textFields: BatchTextVariableField[],
): BatchRecord {
  const primaryFields =
    textFields.length > 0
      ? textFields.filter((f) => f.sourceField === "name" || f.id === "name")
      : [{ id: "name", sourceField: "name" } as BatchTextVariableField];
  const anyPrimaryEmpty = primaryFields.some(
    (f) => (r.fields[f.id] ?? "").trim() === "",
  );
  return { ...r, status: anyPrimaryEmpty ? "warning" : "ready" };
}

const ACCEPTED = "image/jpeg,image/png,image/webp";

function isBatchImageFile(file: File): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

// ─── Step dots ────────────────────────────────────────────────────────────────

function StepDots({ step }: { step: WizardStep }): ReactElement {
  const steps = [
    { n: 1, label: "העלאה ושמות" },
    { n: 2, label: "סיכום" },
  ];
  return (
    <div className="bpw-steps">
      {steps.map(({ n, label }, i) => (
        <>
          {i > 0 && <span key={`conn-${n}`} className="bpw-step-connector" />}
          <div
            key={n}
            className={`bpw-step-dot ${step === n ? "active" : step > n ? "done" : ""}`}
          >
            <span className="dot">{step > n ? "✓" : n}</span>
            <span>{label}</span>
          </div>
        </>
      ))}
    </div>
  );
}

// ─── Step 1 — Upload + Table ──────────────────────────────────────────────────

function Step1({
  template,
  textFields,
  records,
  onAddFiles,
  onUpdateField,
  onDeleteRecord,
  onReplaceFile,
  onNext,
  onCancel,
}: {
  template: BatchTemplateIndexItem;
  textFields: BatchTextVariableField[];
  records: BatchRecord[];
  onAddFiles: (files: File[]) => void;
  onUpdateField: (id: string, fieldId: string, value: string) => void;
  onDeleteRecord: (id: string) => void;
  onReplaceFile: (id: string, file: File) => void;
  onNext: () => void;
  onCancel: () => void;
}): ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replacingId = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const hasImageField = template.variableFieldTypes.includes("image");
  const warningCount = records.filter((r) => r.status === "warning").length;
  const canNext = records.length > 0;

  // Use template-defined labels, or fall back to field id
  const fieldLabels = textFields.map((f) => f.label || f.id);

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) onAddFiles(Array.from(e.dataTransfer.files));
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files) onAddFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  function handleReplaceInput(e: ChangeEvent<HTMLInputElement>): void {
    const id = replacingId.current;
    if (!id || !e.target.files?.[0]) return;
    onReplaceFile(id, e.target.files[0]);
    e.target.value = "";
    replacingId.current = null;
  }

  function triggerReplace(id: string): void {
    replacingId.current = id;
    replaceInputRef.current?.click();
  }

  return (
    <>
      <div className="bpw-body">
        {/* Drop zone */}
        <div
          className={`bpw-dropzone${dragging ? " dragover" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragLeave={() => setDragging(false)}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
        >
          <UploadCloud size={32} strokeWidth={1.5} />
          <p>גרור תמונות לכאן, או לחץ לבחירה</p>
          <small>JPEG · PNG · WEBP — עד 200 קבצים</small>
        </div>
        <input ref={fileInputRef} accept={ACCEPTED} hidden multiple type="file" onChange={handleFileInput} />
        <input ref={replaceInputRef} accept={ACCEPTED} hidden type="file" onChange={handleReplaceInput} />

        {/* Records table */}
        {records.length > 0 && (
          <div className="bpw-table-wrap">
            <table className="bpw-table" dir="rtl">
              <thead>
                <tr>
                  {hasImageField && <th style={{ width: 56 }}>תמונה</th>}
                  {textFields.length > 0
                    ? fieldLabels.map((label, i) => (
                        <th key={textFields[i]?.id ?? i}>{label}</th>
                      ))
                    : <th>שם</th>}
                  <th>שם קובץ</th>
                  <th style={{ width: 40 }}></th>
                  <th style={{ width: 64 }}></th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr key={rec.id}>
                    {hasImageField && (
                      <td>
                        <img alt="" className="bpw-thumb" src={rec.previewUrl} />
                      </td>
                    )}
                    {textFields.length > 0
                      ? textFields.map((f) => (
                          <td key={f.id}>
                            <input
                              className={`bpw-name-input${!(rec.fields[f.id] ?? "").trim() && (f.sourceField === "name" || f.id === "name") ? " warn" : ""}`}
                              dir="auto"
                              type="text"
                              value={rec.fields[f.id] ?? ""}
                              onChange={(e) => onUpdateField(rec.id, f.id, e.target.value)}
                            />
                          </td>
                        ))
                      : (
                          <td>
                            <input
                              className={`bpw-name-input${!(rec.fields["name"] ?? "").trim() ? " warn" : ""}`}
                              dir="auto"
                              type="text"
                              value={rec.fields["name"] ?? ""}
                              onChange={(e) => onUpdateField(rec.id, "name", e.target.value)}
                            />
                          </td>
                        )}
                    <td>
                      <span className="bpw-filename">{rec.originalFilename}</span>
                    </td>
                    <td>
                      {rec.status === "ready"
                        ? <CheckCircle className="bpw-status-ok" size={14} />
                        : <span className="bpw-status-warn" title="שדה ראשי ריק">⚠</span>}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {hasImageField && (
                          <button className="bpw-row-btn" title="החלף תמונה" type="button" onClick={() => triggerReplace(rec.id)}>
                            <RefreshCw size={12} />
                          </button>
                        )}
                        <button className="bpw-row-btn danger" title="מחק רשומה" type="button" onClick={() => onDeleteRecord(rec.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bpw-footer">
        <span className="count-label">
          {records.length > 0
            ? `${records.length} רשומות${warningCount > 0 ? ` · ${warningCount} ⚠ שדה ריק` : ""}`
            : "טרם הועלו תמונות"}
        </span>
        <button className="btn btn-ghost" onClick={onCancel} type="button">ביטול</button>
        <button className="btn btn-accent" disabled={!canNext} onClick={onNext} type="button">
          המשך ←
        </button>
      </div>
    </>
  );
}

// ─── Step 2 — Summary + Generate ─────────────────────────────────────────────

function Step2({
  template,
  textFields,
  records,
  onBack,
  onGenerate,
}: {
  template: BatchTemplateIndexItem;
  textFields: BatchTextVariableField[];
  records: BatchRecord[];
  onBack: () => void;
  onGenerate: () => void;
}): ReactElement {
  const preview = records.slice(0, 8);
  const warnCount = records.filter((r) => r.status === "warning").length;

  return (
    <>
      <div className="bpw-body">
        <div className="bpw-summary-row">
          <ImageIcon size={14} />
          <span>תבנית: <strong>{template.templateName}</strong></span>
        </div>
        <div className="bpw-summary-row">
          <CheckCircle size={14} />
          <span>
            <strong>{records.length}</strong> רשומות
            {warnCount > 0 && (
              <> · <span style={{ color: "#f59e0b" }}>{warnCount} ⚠ עם שדות חסרים</span></>
            )}
          </span>
        </div>
        {textFields.length > 1 && (
          <div className="bpw-summary-row">
            <Zap size={14} />
            <span>
              שדות טקסט: {textFields.map((f) => <strong key={f.id} style={{ marginInlineStart: 4 }}>{f.label || f.id}</strong>)}
            </span>
          </div>
        )}

        {/* Preview thumbnails */}
        <div className="bpw-confirm-grid">
          {preview.map((rec) =>
            template.variableFieldTypes.includes("image") ? (
              <img key={rec.id} alt={rec.fields["name"] ?? ""} className="bpw-confirm-thumb" src={rec.previewUrl} title={rec.fields["name"] ?? rec.originalFilename} />
            ) : (
              <div key={rec.id} className="bpw-confirm-placeholder" title={rec.fields["name"] ?? ""}>
                <span style={{ fontSize: 10, textAlign: "center", padding: 4 }}>
                  {rec.fields["name"] || rec.fields[Object.keys(rec.fields)[0] ?? ""] || "—"}
                </span>
              </div>
            )
          )}
          {records.length > 8 && (
            <div className="bpw-confirm-placeholder">
              <span>+{records.length - 8}</span>
            </div>
          )}
        </div>

        {warnCount > 0 && (
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderRadius: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", fontSize: 12, color: "#fbbf24", alignItems: "center" }}>
            <span>⚠</span>
            <span>{warnCount} רשומות עם שדות חסרים — יווצרו עם שדה ריק.</span>
          </div>
        )}
      </div>

      <div className="bpw-footer">
        <button className="btn btn-ghost" onClick={onBack} type="button">← חזור</button>
        <div className="bpw-footer-spacer" />
        <button
          className="btn btn-accent"
          onClick={onGenerate}
          type="button"
          style={{ background: "#a855f7", borderColor: "#a855f7", gap: 6 }}
        >
          <Zap size={14} />
          צור {records.length} עיצובים
        </button>
      </div>
    </>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function BatchProductionWizard({
  template,
  onComplete,
  onCancel,
}: BatchProductionWizardProps): ReactElement {
  const [step, setStep] = useState<WizardStep>(1);
  const [records, setRecords] = useState<BatchRecord[]>([]);

  // Load template variable fields so we know which text columns to show
  const [textFields, setTextFields] = useState<BatchTextVariableField[]>([]);
  useEffect(() => {
    void (async () => {
      const doc = await loadTemplateDocument(template.templateId);
      if (!doc) return;
      const meta = getBatchProductionMeta(doc);
      setTextFields(
        (meta?.variableFields.filter((f) => f.type === "text") ?? []) as BatchTextVariableField[],
      );
    })();
  }, [template.templateId]);

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      setRecords((prev) => {
        prev.forEach((r) => URL.revokeObjectURL(r.previewUrl));
        return prev;
      });
    };
  }, []);

  function addFiles(files: File[]): void {
    const images = files.filter((f) =>
      isBatchImageFile(f),
    );
    if (images.length === 0) return;
    setRecords((prev) =>
      [
        ...prev,
        ...images.map((file): BatchRecord => {
          const fields = buildInitialFields(file, textFields);
          const rec: BatchRecord = {
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(file),
            fields,
            originalFilename: file.name,
            status: "ready",
          };
          return validateRecord(rec, textFields);
        }),
      ].slice(0, 200),
    );
  }

  function updateField(id: string, fieldId: string, value: string): void {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return validateRecord({ ...r, fields: { ...r.fields, [fieldId]: value } }, textFields);
      }),
    );
  }

  function deleteRecord(id: string): void {
    setRecords((prev) => {
      const rec = prev.find((r) => r.id === id);
      if (rec) URL.revokeObjectURL(rec.previewUrl);
      return prev.filter((r) => r.id !== id);
    });
  }

  function replaceFile(id: string, file: File): void {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        URL.revokeObjectURL(r.previewUrl);
        return validateRecord(
          { ...r, file, previewUrl: URL.createObjectURL(file), originalFilename: file.name },
          textFields,
        );
      }),
    );
  }

  const stepLabels: Record<WizardStep, string> = {
    1: "העלאת תמונות ועריכת שמות",
    2: "סיכום ואישור",
  };

  return (
    <div className="bpw-overlay" dir="rtl">
      <GlobalWizardDropTarget
        acceptFile={isBatchImageFile}
        onFiles={addFiles}
        invalidSubtitle="גרור קבצי JPEG, PNG או WEBP בלבד"
      />
      <div className="bpw-card">
        <div className="bpw-header">
          <div className="bpw-title">ייצור סדרתי — {template.templateName}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary, #6b7a99)", marginBottom: 12 }}>
            שלב {step}: {stepLabels[step]}
          </div>
          <StepDots step={step} />
        </div>

        {step === 1 && (
          <Step1
            template={template}
            textFields={textFields}
            records={records}
            onAddFiles={addFiles}
            onUpdateField={updateField}
            onDeleteRecord={deleteRecord}
            onReplaceFile={replaceFile}
            onNext={() => setStep(2)}
            onCancel={onCancel}
          />
        )}
        {step === 2 && (
          <Step2
            template={template}
            textFields={textFields}
            records={records}
            onBack={() => setStep(1)}
            onGenerate={() =>
              onComplete({ templateId: template.templateId, templateName: template.templateName, records })
            }
          />
        )}
      </div>
    </div>
  );
}

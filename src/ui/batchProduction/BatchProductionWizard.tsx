import {
  CheckCircle,
  FileText,
  ImageIcon,
  Plus,
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
import { getTextFieldRecordKey, parseTextImportContent, parseTxtImport, type ParsedTextImportRow } from "@/core/batchProduction/textImportParser";
import { HEIC_CONVERSION_ERROR_MESSAGE, SUPPORTED_IMAGE_ACCEPT, normalizeIncomingImage, normalizeIncomingImages } from "@/core/image/normalizeIncomingImage";
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
    fields[getTextFieldRecordKey(f, textFields)] = f.sourceField === "name" || f.id === "name" ? baseName : "";
  }
  if (textFields.length === 0) fields["name"] = baseName;
  return fields;
}

function validateRecord(
  r: BatchRecord,
  textFields: BatchTextVariableField[],
): BatchRecord {
  const namedPrimaryFields = textFields.filter((f) => f.sourceField === "name" || f.id === "name");
  const primaryFields =
    namedPrimaryFields.length > 0
      ? namedPrimaryFields
      : textFields.length > 0
        ? [textFields[0]]
      : [{ id: "name", sourceField: "name" } as BatchTextVariableField];
  const anyPrimaryEmpty = primaryFields.some(
    (f) => (r.fields[getTextFieldRecordKey(f, textFields)] ?? "").trim() === "",
  );
  return { ...r, status: anyPrimaryEmpty ? "warning" : "ready" };
}

const ACCEPTED = SUPPORTED_IMAGE_ACCEPT;
const ACCEPTED_TEXT_DATA = ".txt,.csv,text/plain,text/csv";

function isBatchImageFile(file: File): boolean {
  return ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/heic", "image/heif"].includes(file.type) || /\.(jpe?g|png|webp|svg|heic|heif)$/i.test(file.name);
}

function isBatchTextDataFile(file: File): boolean {
  return ["text/plain", "text/csv", "application/vnd.ms-excel"].includes(file.type) || /\.(txt|csv)$/i.test(file.name);
}

function getRecordDisplayValue(rec: BatchRecord, textFields: BatchTextVariableField[]): string {
  const primary =
    textFields.find((field) => field.sourceField === "name" || field.id === "name") ??
    textFields[0];
  if (primary !== undefined) {
    const value = rec.fields[getTextFieldRecordKey(primary, textFields)];
    if (value !== undefined && value.trim().length > 0) return value;
  }
  return Object.values(rec.fields).find((value) => value.trim().length > 0) ?? "";
}

// ─── Step dots ────────────────────────────────────────────────────────────────

function StepDots({ step, hasImageField }: { step: WizardStep; hasImageField: boolean }): ReactElement {
  const steps = [
    { n: 1, label: hasImageField ? "העלאה ושמות" : "רשימות טקסט" },
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
  onAddTextRows,
  onUpdateField,
  onDeleteRecord,
  onReplaceFile,
  onNext,
  onCancel,
}: {
  template: BatchTemplateIndexItem;
  textFields: BatchTextVariableField[];
  records: BatchRecord[];
  onAddFiles: (files: File[]) => void | Promise<void>;
  onAddTextRows: (rows: ParsedTextImportRow[], sourceName?: string) => void;
  onUpdateField: (id: string, fieldId: string, value: string) => void;
  onDeleteRecord: (id: string) => void;
  onReplaceFile: (id: string, file: File) => void | Promise<void>;
  onNext: () => void;
  onCancel: () => void;
}): ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replacingId = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [manualText, setManualText] = useState("");

  const hasImageField = template.variableFieldTypes.includes("image");
  const warningCount = records.filter((r) => r.status === "warning").length;
  const canNext = records.length > 0;

  // Use template-defined labels, or fall back to field id
  const fieldLabels = textFields.map((f) => f.label || f.id);

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    if (!e.dataTransfer.files) return;
    const files = Array.from(e.dataTransfer.files);
    if (hasImageField) {
      void onAddFiles(files);
    } else {
      void addTextFiles(files);
    }
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      if (hasImageField) void onAddFiles(files);
      else void addTextFiles(files);
    }
    e.target.value = "";
  }

  function handleReplaceInput(e: ChangeEvent<HTMLInputElement>): void {
    const id = replacingId.current;
    if (!id || !e.target.files?.[0]) return;
    void onReplaceFile(id, e.target.files[0]);
    e.target.value = "";
    replacingId.current = null;
  }

  function triggerReplace(id: string): void {
    replacingId.current = id;
    replaceInputRef.current?.click();
  }

  async function addTextFiles(files: File[]): Promise<void> {
    const textFiles = files.filter(isBatchTextDataFile);
    const rows: ParsedTextImportRow[] = [];
    const names: string[] = [];
    for (const file of textFiles) {
      const content = await file.text();
      rows.push(...parseTextImportContent(content, file.name, textFields));
      names.push(file.name);
    }
    if (rows.length > 0) onAddTextRows(rows, names.join(", "));
  }

  function addManualText(): void {
    const rows = parseTxtImport(manualText, textFields);
    if (rows.length === 0) return;
    onAddTextRows(rows, "manual");
    setManualText("");
  }

  return (
    <>
      <div className="bpw-body">
        {hasImageField ? (
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
        ) : (
          <div className="bpw-text-import">
            <div
              className={`bpw-dropzone compact${dragging ? " dragover" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragLeave={() => setDragging(false)}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
            >
              <FileText size={28} strokeWidth={1.5} />
              <p>גרור קובץ TXT או CSV, או לחץ לבחירה</p>
              <small>TXT: שם בכל שורה · CSV: שורה לכל עיצוב ועמודה לכל תיבת טקסט</small>
            </div>
            <div className="bpw-manual-list">
              <textarea
                className="bpw-textarea"
                dir="auto"
                onChange={(event) => setManualText(event.target.value)}
                placeholder="הדבק כאן רשימת שמות, שם אחד בכל שורה"
                value={manualText}
              />
              <button className="btn btn-ghost" disabled={manualText.trim().length === 0} onClick={addManualText} type="button">
                <Plus size={14} />
                הוסף לרשימה
              </button>
            </div>
          </div>
        )}
        <input ref={fileInputRef} accept={hasImageField ? ACCEPTED : ACCEPTED_TEXT_DATA} hidden multiple type="file" onChange={handleFileInput} />
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
                        <th key={textFields[i]?.layerId ?? i}>{label}</th>
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
                        {rec.sourceType === "image" ? (
                          <img alt="" className="bpw-thumb" src={rec.previewUrl} />
                        ) : (
                          <span className="bpw-thumb-placeholder"><FileText size={15} /></span>
                        )}
                      </td>
                    )}
                    {textFields.length > 0
                      ? textFields.map((f) => {
                          const fieldKey = getTextFieldRecordKey(f, textFields);
                          const isPrimary = f.sourceField === "name" || f.id === "name" || textFields[0]?.layerId === f.layerId;
                          return (
                          <td key={f.layerId}>
                            <input
                              className={`bpw-name-input${!(rec.fields[fieldKey] ?? "").trim() && isPrimary ? " warn" : ""}`}
                              dir="auto"
                              type="text"
                              value={rec.fields[fieldKey] ?? ""}
                              onChange={(e) => onUpdateField(rec.id, fieldKey, e.target.value)}
                            />
                          </td>
                          );
                        })
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
                      <span className="bpw-filename">{rec.originalFilename ?? "רשימת טקסט"}</span>
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
            : hasImageField ? "טרם הועלו תמונות" : "טרם נוספו רשומות טקסט"}
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
            rec.sourceType === "image" ? (
              <img key={rec.id} alt={getRecordDisplayValue(rec, textFields)} className="bpw-confirm-thumb" src={rec.previewUrl} title={getRecordDisplayValue(rec, textFields) || rec.originalFilename} />
            ) : (
              <div key={rec.id} className="bpw-confirm-placeholder" title={getRecordDisplayValue(rec, textFields)}>
                <span style={{ fontSize: 10, textAlign: "center", padding: 4 }}>
                  {getRecordDisplayValue(rec, textFields) || "—"}
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
  const hasImageField = template.variableFieldTypes.includes("image");

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
        prev.forEach((r) => {
          if (r.sourceType === "image") URL.revokeObjectURL(r.previewUrl);
        });
        return prev;
      });
    };
  }, []);

  async function addFiles(files: File[]): Promise<void> {
    const { files: normalizedFiles, failed } = await normalizeIncomingImages(files.filter(isBatchImageFile));
    if (failed.length > 0) window.alert(HEIC_CONVERSION_ERROR_MESSAGE);
    const images = normalizedFiles.filter((f) =>
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
            sourceType: "image",
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

  function addTextRows(rows: ParsedTextImportRow[], sourceName?: string): void {
    if (rows.length === 0) return;
    setRecords((prev) =>
      [
        ...prev,
        ...rows.map((row): BatchRecord => {
          const rec: BatchRecord = {
            id: crypto.randomUUID(),
            sourceType: "text",
            fields: row.fields,
            originalFilename: sourceName ?? row.sourceLabel,
            status: "ready",
          };
          return validateRecord(rec, textFields);
        }),
      ].slice(0, 200),
    );
  }

  async function addTextFiles(files: File[]): Promise<void> {
    const textFiles = files.filter(isBatchTextDataFile);
    const rows: ParsedTextImportRow[] = [];
    const names: string[] = [];
    for (const file of textFiles) {
      const content = await file.text();
      rows.push(...parseTextImportContent(content, file.name, textFields));
      names.push(file.name);
    }
    addTextRows(rows, names.join(", ") || undefined);
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
      if (rec?.sourceType === "image") URL.revokeObjectURL(rec.previewUrl);
      return prev.filter((r) => r.id !== id);
    });
  }

  async function replaceFile(id: string, file: File): Promise<void> {
    let normalizedFile: File;
    try {
      normalizedFile = await normalizeIncomingImage(file);
    } catch {
      window.alert(HEIC_CONVERSION_ERROR_MESSAGE);
      return;
    }
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (r.sourceType !== "image") return r;
        URL.revokeObjectURL(r.previewUrl);
        return validateRecord(
          { ...r, file: normalizedFile, previewUrl: URL.createObjectURL(normalizedFile), originalFilename: normalizedFile.name },
          textFields,
        );
      }),
    );
  }

  const stepLabels: Record<WizardStep, string> = {
    1: hasImageField ? "העלאת תמונות ועריכת שמות" : "ייבוא רשימות טקסט",
    2: "סיכום ואישור",
  };

  return (
    <div className="bpw-overlay" dir="rtl">
      <GlobalWizardDropTarget
        acceptFile={hasImageField ? isBatchImageFile : isBatchTextDataFile}
        onFiles={(files) => {
          if (hasImageField) void addFiles(files);
          else void addTextFiles(files);
        }}
        invalidSubtitle={hasImageField ? "גרור קבצי JPEG, PNG או WEBP בלבד" : "גרור קבצי TXT או CSV בלבד"}
      />
      <div className="bpw-card">
        <div className="bpw-header">
          <div className="bpw-title">ייצור סדרתי — {template.templateName}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary, #6b7a99)", marginBottom: 12 }}>
            שלב {step}: {stepLabels[step]}
          </div>
          <StepDots step={step} hasImageField={hasImageField} />
        </div>

        {step === 1 && (
          <Step1
            template={template}
            textFields={textFields}
            records={records}
            onAddFiles={addFiles}
            onAddTextRows={addTextRows}
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

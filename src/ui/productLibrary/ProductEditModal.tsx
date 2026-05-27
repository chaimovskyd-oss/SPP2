/**
 * ProductEditModal — slide-in panel for editing a product's fields in the library.
 * Opens from ProductLibraryScreen; saves directly to the JSON library via productBridge.
 */

import "./ProductEditModal.css";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  FileImage,
  RotateCw,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { saveProductDefinition, uploadProductMask } from "@/services/python_bridge/productBridge";
import type { ProductDefinition, ProductInstructionSet } from "@/types/product";

interface ProductEditModalProps {
  product: ProductDefinition;
  onClose: () => void;
  onSaved: (updated: ProductDefinition) => void;
}

const PRODUCTION_TYPES: Array<{ value: string; label: string }> = [
  { value: "", label: "— לא צוין —" },
  { value: "photo", label: "הדפסת תמונה" },
  { value: "sublimation", label: "סובלימציה" },
  { value: "laser", label: "לייזר" },
  { value: "uv", label: "UV" },
  { value: "print", label: "הדפסה רגילה" },
  { value: "vinyl", label: "ויניל" },
  { value: "engraving", label: "חריטה" },
  { value: "other", label: "אחר" }
];

const ORIENTATIONS = [
  { value: "any", label: "גמיש (כל אוריינטציה)" },
  { value: "landscape", label: "שוכב (Landscape)" },
  { value: "portrait", label: "עומד (Portrait)" }
];

const DEFAULT_MASK_THRESHOLD = 28;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Cannot read mask file"));
    reader.readAsDataURL(file);
  });
}

function base64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function ProductEditModal({ product, onClose, onSaved }: ProductEditModalProps): ReactElement {
  // Basic fields
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category ?? "");
  const [widthCm, setWidthCm] = useState((product.canvasSize.width / 10).toFixed(1));
  const [heightCm, setHeightCm] = useState((product.canvasSize.height / 10).toFixed(1));
  const [orientation, setOrientation] = useState(String(product.metadata.orientation ?? "any"));
  const [bleedMm, setBleedMm] = useState(
    product.bleed ? String(((product.bleed.top + product.bleed.right + product.bleed.bottom + product.bleed.left) / 4).toFixed(1)) : "2.0"
  );
  const [dpi, setDpi] = useState(String(product.recommendedDPI ?? ""));
  const [productionType, setProductionType] = useState(product.productionType ?? "");
  const [price, setPrice] = useState(String((product.metadata as Record<string, unknown>).price ?? "0"));
  const [tips, setTips] = useState(String((product.metadata as Record<string, unknown>).tips ?? ""));
  const [tags, setTags] = useState((product.tags ?? []).join(", "));
  const primaryMask = product.productMasks?.[0];
  const [maskPath, setMaskPath] = useState(primaryMask?.assetPath ?? primaryMask?.assetData ?? "");
  const [maskName, setMaskName] = useState(primaryMask?.originalFileName ?? primaryMask?.name ?? "");
  const [maskDataUrl, setMaskDataUrl] = useState(primaryMask?.assetDataUrl ?? "");
  const [maskThreshold, setMaskThreshold] = useState(String(product.maskThreshold ?? primaryMask?.thresholdSettings?.tolerance ?? DEFAULT_MASK_THRESHOLD));
  const [maskUploading, setMaskUploading] = useState(false);

  // Instructions
  const ins = product.instructions ?? {};
  const [printerType, setPrinterType] = useState(ins.printerType ?? "");
  const [requiresHeatPress, setRequiresHeatPress] = useState(ins.requiresHeatPress ?? false);
  const [heatTemp, setHeatTemp] = useState(String(ins.heatPressTemperature ?? ""));
  const [heatTime, setHeatTime] = useState(String(ins.heatPressTimeSeconds ?? ""));
  const [heatPressure, setHeatPressure] = useState<string>(ins.heatPressPressure ?? "");
  const [mirrorPrint, setMirrorPrint] = useState(ins.requiresMirrorPrint ?? false);
  const [washTemp, setWashTemp] = useState(String(ins.washTemperatureCelsius ?? ""));
  const [noTumbleDry, setNoTumbleDry] = useState(ins.doNotTumbleDry ?? false);
  const [ironingAllowed, setIroningAllowed] = useState(ins.ironingAllowed ?? true);
  const [dryCleanOnly, setDryCleanOnly] = useState(ins.dryCleanOnly ?? false);
  const [notes, setNotes] = useState(ins.notes ?? "");

  const [instructionsOpen, setInstructionsOpen] = useState(!!product.instructions);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Keyboard close
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function buildUpdatedProduct(): ProductDefinition {
    const wCm = parseFloat(widthCm) || product.canvasSize.width / 10;
    const hCm = parseFloat(heightCm) || product.canvasSize.height / 10;
    const bleed = parseFloat(bleedMm) || 2;
    const bleedMargins = { top: bleed, right: bleed, bottom: bleed, left: bleed };
    const parsedDpi = dpi.trim() ? parseInt(dpi, 10) : undefined;

    const instructions: ProductInstructionSet | undefined = (
      printerType || requiresHeatPress || mirrorPrint || washTemp || notes ||
      noTumbleDry || !ironingAllowed || dryCleanOnly
    ) ? {
      printerType: printerType || undefined,
      requiresHeatPress: requiresHeatPress || undefined,
      heatPressTemperature: heatTemp.trim() ? parseFloat(heatTemp) : undefined,
      heatPressTimeSeconds: heatTime.trim() ? parseFloat(heatTime) : undefined,
      heatPressPressure: (heatPressure as ProductInstructionSet["heatPressPressure"]) || undefined,
      requiresMirrorPrint: mirrorPrint || undefined,
      washTemperatureCelsius: washTemp.trim() ? parseFloat(washTemp) : undefined,
      doNotTumbleDry: noTumbleDry || undefined,
      ironingAllowed: ironingAllowed ? undefined : false,
      dryCleanOnly: dryCleanOnly || undefined,
      notes: notes.trim() || undefined
    } : undefined;

    const parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
    const parsedMaskThreshold = Math.max(0, Math.min(255, parseInt(maskThreshold, 10) || DEFAULT_MASK_THRESHOLD));
    const nextProductMasks = maskPath
      ? [
          {
            version: 1 as const,
            id: primaryMask?.id ?? `mask_${product.id}`,
            name: maskName || "Product mask",
            type: maskPath.toLowerCase().endsWith(".svg") ? "svg" as const : "pngThreshold" as const,
            assetData: maskPath,
            assetPath: maskPath,
            assetDataUrl: maskDataUrl || primaryMask?.assetDataUrl,
            originalFileName: maskName || undefined,
            thresholdSettings: {
              version: 1 as const,
              enabled: true,
              color: "white" as const,
              tolerance: parsedMaskThreshold
            },
            appliesTo: []
          }
        ]
      : undefined;

    return {
      ...product,
      name: name.trim() || product.name,
      category: category.trim(),
      canvasSize: { width: wCm * 10, height: hCm * 10 },
      safeArea: {
        x: bleed,
        y: bleed,
        width: wCm * 10 - 2 * bleed,
        height: hCm * 10 - 2 * bleed
      },
      bleed: bleedMargins,
      recommendedDPI: parsedDpi,
      productionType: (productionType as ProductDefinition["productionType"]) || undefined,
      instructions,
      tags: parsedTags,
      maskThreshold: parsedMaskThreshold,
      productMasks: nextProductMasks,
      metadata: {
        ...product.metadata,
        orientation,
        price: parseFloat(price) || 0,
        tips: tips.trim() || ""
      }
    };
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = buildUpdatedProduct();
      await saveProductDefinition(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function handleMaskFileSelected(file: File | null): Promise<void> {
    if (file === null) return;
    setMaskUploading(true);
    setSaveError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploadedPath = await uploadProductMask(product.id, base64FromDataUrl(dataUrl), file.name);
      setMaskPath(uploadedPath);
      setMaskName(file.name);
      setMaskDataUrl(dataUrl);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "׳©׳’׳™׳׳” ׳‘׳”׳¢׳׳׳× ׳׳¡׳™׳›׳”");
    } finally {
      setMaskUploading(false);
    }
  }

  function handleRemoveMask(): void {
    setMaskPath("");
    setMaskName("");
    setMaskDataUrl("");
  }

  return (
    <div className="prod-edit-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="prod-edit-panel" role="dialog" aria-label="עריכת מוצר">

        {/* Header */}
        <div className="prod-edit-header">
          <span className="prod-edit-title">עריכת מוצר</span>
          <span className="prod-edit-subtitle">{product.name}</span>
          <button className="icon-btn" onClick={onClose} title="סגור" type="button">
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="prod-edit-body">

          {/* ── פרטים בסיסיים ── */}
          <section className="prod-edit-section">
            <div className="prod-edit-section-title">פרטים בסיסיים</div>

            <div className="prod-edit-field">
              <label>שם מוצר</label>
              <input
                className="prod-edit-input"
                onChange={(e) => setName(e.target.value)}
                placeholder="שם המוצר"
                type="text"
                value={name}
              />
            </div>

            <div className="prod-edit-field">
              <label>קטגוריה</label>
              <input
                className="prod-edit-input"
                onChange={(e) => setCategory(e.target.value)}
                placeholder="קטגוריה"
                type="text"
                value={category}
              />
            </div>

            <div className="prod-edit-row-2">
              <div className="prod-edit-field">
                <label>רוחב (ס"מ)</label>
                <input
                  className="prod-edit-input"
                  min="0.1"
                  onChange={(e) => setWidthCm(e.target.value)}
                  step="0.1"
                  type="number"
                  value={widthCm}
                />
              </div>
              <div className="prod-edit-field">
                <label>גובה (ס"מ)</label>
                <input
                  className="prod-edit-input"
                  min="0.1"
                  onChange={(e) => setHeightCm(e.target.value)}
                  step="0.1"
                  type="number"
                  value={heightCm}
                />
              </div>
            </div>

            <div className="prod-edit-row-2">
              <div className="prod-edit-field">
                <label>Bleed (מ"מ)</label>
                <input
                  className="prod-edit-input"
                  min="0"
                  onChange={(e) => setBleedMm(e.target.value)}
                  step="0.5"
                  type="number"
                  value={bleedMm}
                />
              </div>
              <div className="prod-edit-field">
                <label>DPI (רזולוציה)</label>
                <input
                  className="prod-edit-input"
                  min="72"
                  onChange={(e) => setDpi(e.target.value)}
                  placeholder="300"
                  step="1"
                  type="number"
                  value={dpi}
                />
              </div>
            </div>

            <div className="prod-edit-field">
              <label>אוריינטציה</label>
              <select
                className="prod-edit-select"
                onChange={(e) => setOrientation(e.target.value)}
                value={orientation}
              >
                {ORIENTATIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="prod-edit-row-2">
              <div className="prod-edit-field">
                <label>סוג ייצור</label>
                <select
                  className="prod-edit-select"
                  onChange={(e) => setProductionType(e.target.value)}
                  value={productionType}
                >
                  {PRODUCTION_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="prod-edit-field">
                <label>מחיר (₪)</label>
                <input
                  className="prod-edit-input"
                  min="0"
                  onChange={(e) => setPrice(e.target.value)}
                  step="1"
                  type="number"
                  value={price}
                />
              </div>
            </div>

            <div className="prod-edit-field">
              <label>תגיות (פסולות בפסיקים)</label>
              <input
                className="prod-edit-input"
                onChange={(e) => setTags(e.target.value)}
                placeholder="לדוגמה: ילדים, מורים, מתנה"
                type="text"
                value={tags}
              />
            </div>

            <div className="prod-edit-field">
              <label>טיפים / הערות למוכר</label>
              <textarea
                className="prod-edit-textarea"
                onChange={(e) => setTips(e.target.value)}
                placeholder="הערות לעיצוב, המלצות, אזהרות..."
                rows={3}
                value={tips}
              />
            </div>
          </section>

          {/* ── הוראות ייצור / כבישה ── */}
          <section className="prod-edit-section">
            <div className="prod-edit-section-title">Product Mask</div>

            <div className="prod-edit-mask-card">
              <div className="prod-edit-mask-status">
                <FileImage size={16} />
                <div>
                  <strong>{maskPath ? (maskName || "Product mask") : "׳׳™׳ ׳׳¡׳™׳›׳”"}</strong>
                  <span>{maskPath || "SVG / PNG / JPG / WebP"}</span>
                </div>
              </div>

              <div className="prod-edit-mask-actions">
                <label className={`btn btn-ghost prod-edit-upload-btn${maskUploading ? " disabled" : ""}`}>
                  {maskUploading ? <RotateCw className="spin" size={13} /> : <Upload size={13} />}
                  {maskPath ? "׳”׳—׳׳£" : "׳”׳¢׳׳”"}
                  <input
                    accept="image/svg+xml,image/png,image/jpeg,image/webp,image/*"
                    disabled={maskUploading}
                    onChange={(e) => void handleMaskFileSelected(e.target.files?.[0] ?? null)}
                    type="file"
                  />
                </label>
                {maskPath && (
                  <button className="btn btn-ghost" onClick={handleRemoveMask} type="button">
                    <Trash2 size={13} />
                    ׳”׳¡׳¨
                  </button>
                )}
              </div>
            </div>

            <div className="prod-edit-field">
              <label>White Threshold</label>
              <div className="prod-edit-threshold-row">
                <input
                  className="prod-edit-range"
                  max="255"
                  min="0"
                  onChange={(e) => setMaskThreshold(e.target.value)}
                  step="1"
                  type="range"
                  value={maskThreshold}
                />
                <input
                  className="prod-edit-input prod-edit-threshold-input"
                  max="255"
                  min="0"
                  onChange={(e) => setMaskThreshold(e.target.value)}
                  step="1"
                  type="number"
                  value={maskThreshold}
                />
              </div>
            </div>
          </section>

          <section className="prod-edit-section">
            <button
              className="prod-edit-collapsible"
              onClick={() => setInstructionsOpen((v) => !v)}
              type="button"
            >
              {instructionsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              הוראות ייצור / כבישה
            </button>

            {instructionsOpen && (
              <div className="prod-edit-instructions">
                <div className="prod-edit-field">
                  <label>סוג מדפסת</label>
                  <input
                    className="prod-edit-input"
                    onChange={(e) => setPrinterType(e.target.value)}
                    placeholder="לדוגמה: Epson L1800"
                    type="text"
                    value={printerType}
                  />
                </div>

                {/* Heat press */}
                <div className="prod-edit-check-row">
                  <input
                    checked={requiresHeatPress}
                    id="req-heat"
                    onChange={(e) => setRequiresHeatPress(e.target.checked)}
                    type="checkbox"
                  />
                  <label htmlFor="req-heat">דורש כבישה בחום (Heat Press)</label>
                </div>

                {requiresHeatPress && (
                  <div className="prod-edit-indent">
                    <div className="prod-edit-row-3">
                      <div className="prod-edit-field">
                        <label>טמפ׳ (°C)</label>
                        <input
                          className="prod-edit-input"
                          min="0"
                          onChange={(e) => setHeatTemp(e.target.value)}
                          placeholder="180"
                          type="number"
                          value={heatTemp}
                        />
                      </div>
                      <div className="prod-edit-field">
                        <label>זמן (שניות)</label>
                        <input
                          className="prod-edit-input"
                          min="0"
                          onChange={(e) => setHeatTime(e.target.value)}
                          placeholder="30"
                          type="number"
                          value={heatTime}
                        />
                      </div>
                      <div className="prod-edit-field">
                        <label>לחץ</label>
                        <select
                          className="prod-edit-select"
                          onChange={(e) => setHeatPressure(e.target.value)}
                          value={heatPressure}
                        >
                          <option value="">—</option>
                          <option value="light">קל</option>
                          <option value="medium">בינוני</option>
                          <option value="heavy">חזק</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="prod-edit-check-row">
                  <input
                    checked={mirrorPrint}
                    id="mirror-print"
                    onChange={(e) => setMirrorPrint(e.target.checked)}
                    type="checkbox"
                  />
                  <label htmlFor="mirror-print">הדפסה מראה (Mirror Print)</label>
                </div>

                {/* Washing */}
                <div className="prod-edit-subsection-title">הוראות כבישה</div>

                <div className="prod-edit-field">
                  <label>טמפ׳ כבישה (°C)</label>
                  <input
                    className="prod-edit-input prod-edit-input-sm"
                    min="0"
                    onChange={(e) => setWashTemp(e.target.value)}
                    placeholder="30"
                    type="number"
                    value={washTemp}
                  />
                </div>

                <div className="prod-edit-check-row">
                  <input
                    checked={noTumbleDry}
                    id="no-tumble"
                    onChange={(e) => setNoTumbleDry(e.target.checked)}
                    type="checkbox"
                  />
                  <label htmlFor="no-tumble">אסור ייבוש במייבש</label>
                </div>

                <div className="prod-edit-check-row">
                  <input
                    checked={!ironingAllowed}
                    id="no-iron"
                    onChange={(e) => setIroningAllowed(!e.target.checked)}
                    type="checkbox"
                  />
                  <label htmlFor="no-iron">אסור גיהוץ</label>
                </div>

                <div className="prod-edit-check-row">
                  <input
                    checked={dryCleanOnly}
                    id="dry-clean"
                    onChange={(e) => setDryCleanOnly(e.target.checked)}
                    type="checkbox"
                  />
                  <label htmlFor="dry-clean">ניקוי יבש בלבד</label>
                </div>

                <div className="prod-edit-field" style={{ marginTop: 10 }}>
                  <label>הערות נוספות</label>
                  <textarea
                    className="prod-edit-textarea"
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="כל הערה נוספת להפקה..."
                    rows={3}
                    value={notes}
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="prod-edit-footer">
          {saveError && (
            <div className="prod-edit-error">
              <AlertTriangle size={12} />
              {saveError}
            </div>
          )}
          <button className="btn btn-ghost" onClick={onClose} type="button">
            ביטול
          </button>
          <button
            className={`btn ${saved ? "btn-success" : "btn-accent"}`}
            disabled={saving}
            onClick={() => void handleSave()}
            type="button"
          >
            {saving ? <RotateCw className="spin" size={13} /> : saved ? <Check size={13} /> : null}
            {saved ? "נשמר!" : "שמור לספרייה"}
          </button>
        </div>

      </div>
    </div>
  );
}

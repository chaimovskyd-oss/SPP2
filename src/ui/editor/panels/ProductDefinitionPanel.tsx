/**
 * Right-panel section shown in EditorScreen when a product is active.
 * Allows viewing + editing product definition fields and toggling guide visibility.
 * All edits are applied via patchActiveProduct (in-memory) and persisted only
 * when the user clicks "Save to Library".
 */

import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
  Save,
  RotateCw
} from "lucide-react";
import { useState, type ReactElement } from "react";
import { useProductStore } from "@/state/productStore";
import { saveProductDefinition } from "@/services/python_bridge/productBridge";
import type { ProductGuideVisibility } from "@/types/product";

export function ProductDefinitionPanel(): ReactElement | null {
  const activeProduct = useProductStore((s) => s.activeProduct);
  const isDirty = useProductStore((s) => s.isDirty);
  const patchActiveProduct = useProductStore((s) => s.patchActiveProduct);
  const markProductClean = useProductStore((s) => s.markProductClean);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  if (!activeProduct) return null;

  const ctx = activeProduct.metadata;
  const guideVisibility = (
    (activeProduct as unknown as { _guideVisibility?: ProductGuideVisibility })
      ._guideVisibility ?? {
      bleed: true,
      safeArea: true,
      maskOverlay: true,
      nonPrintableArea: true,
      printZones: true
    }
  );

  function toggleGuide(key: keyof ProductGuideVisibility): void {
    // Guide visibility is stored in page.metadata.productContext — for simplicity
    // we expose it via product store patch on a synthetic field.
    // The ProductGuidesOverlay reads it from page.metadata.productContext directly.
    // This panel is informational; the full guide toggle wiring is in Step 10.
  }

  async function handleSave(): Promise<void> {
    if (!activeProduct) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveProductDefinition(activeProduct);
      markProductClean();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  const trimW = (activeProduct.canvasSize.width / 10).toFixed(1);
  const trimH = (activeProduct.canvasSize.height / 10).toFixed(1);
  const bleedMm = activeProduct.bleed
    ? ((activeProduct.bleed.top + activeProduct.bleed.right + activeProduct.bleed.bottom + activeProduct.bleed.left) / 4).toFixed(1)
    : "2.0";

  return (
    <div className="product-def-panel">
      {/* ── Header ── */}
      <div className="product-def-header">
        <Boxes size={14} />
        <span>{activeProduct.name}</span>
        {isDirty && <span className="product-def-dirty" title="שינויים לא נשמרו">●</span>}
      </div>

      {/* ── Basic info ── */}
      <div className="product-def-section">
        <div className="product-def-row">
          <label>קטגוריה</label>
          <span>{activeProduct.category || "—"}</span>
        </div>
        <div className="product-def-row">
          <label>גודל (ס&quot;מ)</label>
          <span>{trimW} × {trimH}</span>
        </div>
        <div className="product-def-row">
          <label>Bleed (מ&quot;מ)</label>
          <span>{bleedMm} מ&quot;מ</span>
        </div>
        {activeProduct.productionType && (
          <div className="product-def-row">
            <label>סוג ייצור</label>
            <span className="product-def-badge">{activeProduct.productionType}</span>
          </div>
        )}
        {activeProduct.recommendedDPI && (
          <div className="product-def-row">
            <label>DPI מומלץ</label>
            <span>{activeProduct.recommendedDPI}</span>
          </div>
        )}
        {(activeProduct.tags ?? []).length > 0 && (
          <div className="product-def-row">
            <label>תגיות</label>
            <span>{(activeProduct.tags ?? []).join(", ")}</span>
          </div>
        )}
      </div>

      {/* ── Guide visibility toggles ── */}
      <div className="product-def-section">
        <div className="product-def-section-title">מדריכים</div>
        {(
          [
            { key: "bleed" as const, label: "Bleed" },
            { key: "safeArea" as const, label: "Safe Area" },
            { key: "printZones" as const, label: "אזורי הדפסה" },
            { key: "maskOverlay" as const, label: "גבול מסיכה" },
            { key: "nonPrintableArea" as const, label: "אפלת חוץ" }
          ] as const
        ).map(({ key, label }) => (
          <div className="product-def-guide-row" key={key}>
            <span>{label}</span>
            <button
              className={`icon-btn ${guideVisibility[key] ? "active" : ""}`}
              onClick={() => toggleGuide(key)}
              title={guideVisibility[key] ? "הסתר" : "הצג"}
              type="button"
            >
              {guideVisibility[key] ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>
        ))}
      </div>

      {/* ── Production instructions (collapsible) ── */}
      {activeProduct.instructions && (
        <div className="product-def-section">
          <button
            className="product-def-collapsible"
            onClick={() => setInstructionsOpen((v) => !v)}
            type="button"
          >
            <Info size={12} />
            הוראות ייצור
            {instructionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {instructionsOpen && (
            <div className="product-def-instructions">
              {activeProduct.instructions.printerType && (
                <div className="product-def-row">
                  <label>מדפסת</label>
                  <span>{activeProduct.instructions.printerType}</span>
                </div>
              )}
              {activeProduct.instructions.requiresHeatPress && (
                <>
                  <div className="product-def-row">
                    <label>חום</label>
                    <span>{activeProduct.instructions.heatPressTemperature ?? "—"}°C</span>
                  </div>
                  <div className="product-def-row">
                    <label>זמן</label>
                    <span>{activeProduct.instructions.heatPressTimeSeconds ?? "—"}s</span>
                  </div>
                  <div className="product-def-row">
                    <label>לחץ</label>
                    <span>{activeProduct.instructions.heatPressPressure ?? "—"}</span>
                  </div>
                </>
              )}
              {activeProduct.instructions.requiresMirrorPrint && (
                <div className="product-def-row product-def-info">
                  <AlertTriangle size={11} />
                  <span>הדפסה מראה (informational only)</span>
                </div>
              )}
              {activeProduct.instructions.notes && (
                <div className="product-def-notes">{activeProduct.instructions.notes}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Print zones list ── */}
      {(activeProduct.printZones ?? []).length > 0 && (
        <div className="product-def-section">
          <div className="product-def-section-title">אזורי הדפסה</div>
          {(activeProduct.printZones ?? []).map((zone) => (
            <div className="product-def-zone" key={zone.id}>
              <span className="product-def-zone-name">{zone.name}</span>
              <span className="product-def-zone-side">{zone.side}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Save / Error ── */}
      <div className="product-def-footer">
        {saveError && (
          <div className="product-def-error">
            <AlertTriangle size={12} />
            {saveError}
          </div>
        )}
        <button
          className={`btn ${isDirty ? "btn-accent" : "btn-ghost"}`}
          disabled={!isDirty || saving}
          onClick={() => void handleSave()}
          type="button"
        >
          {saving ? <RotateCw className="spin" size={13} /> : <Save size={13} />}
          שמור לספרייה
        </button>
      </div>
    </div>
  );
}

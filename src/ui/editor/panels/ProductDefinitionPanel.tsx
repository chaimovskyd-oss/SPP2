/**
 * Right-panel section shown in EditorScreen when a product is active.
 * - Shows product info, guide toggles, production instructions
 * - Orientation flip: swaps canvas width/height and re-creates the page
 * - Save to Library: persists changes back to Python product JSON
 */

import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
  Monitor,
  RotateCcw,
  RotateCw,
  Save,
  Smartphone
} from "lucide-react";
import { useState, type ReactElement } from "react";
import { applyOrientationToProduct, createDocumentFromProduct } from "@/core/product/productDocument";
import { createProjectEnvelope, withProjectMetadata } from "@/core";
import { useProductStore } from "@/state/productStore";
import { useDocumentStore } from "@/state/documentStore";
import { useProjectLifecycleStore } from "@/state/projectLifecycleStore";
import { saveProductDefinition } from "@/services/python_bridge/productBridge";
import type { ProductGuideVisibility } from "@/types/product";

export function ProductDefinitionPanel(): ReactElement | null {
  const activeProduct = useProductStore((s) => s.activeProduct);
  const isDirty = useProductStore((s) => s.isDirty);
  const patchActiveProduct = useProductStore((s) => s.patchActiveProduct);
  const setActiveProduct = useProductStore((s) => s.setActiveProduct);
  const markProductClean = useProductStore((s) => s.markProductClean);

  const setDocument = useDocumentStore((s) => s.setDocument);
  const currentDoc = useDocumentStore((s) => s.document);
  const beginProject = useProjectLifecycleStore((s) => s.beginProject);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  if (!activeProduct) return null;

  // ── Derived values ──────────────────────────────────────────────────────────

  const trimW = activeProduct.canvasSize.width;
  const trimH = activeProduct.canvasSize.height;
  const isPortrait = trimH >= trimW;
  const trimWCm = (trimW / 10).toFixed(1);
  const trimHCm = (trimH / 10).toFixed(1);
  const bleedMm = activeProduct.bleed
    ? ((activeProduct.bleed.top + activeProduct.bleed.right + activeProduct.bleed.bottom + activeProduct.bleed.left) / 4).toFixed(1)
    : "2.0";

  const guideVisibility: ProductGuideVisibility = {
    bleed: true,
    safeArea: true,
    maskOverlay: true,
    nonPrintableArea: true,
    printZones: true
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleFlipOrientation(): void {
    if (!activeProduct) return;
    const targetOrientation = isPortrait ? "landscape" : "portrait";
    const flipped = applyOrientationToProduct(activeProduct, targetOrientation);
    // Update store (so the panel reflects the new size immediately)
    setActiveProduct(flipped);
    // Re-create the document with flipped dimensions, preserving doc-level data
    const newDoc = createDocumentFromProduct(flipped);
    if (currentDoc) {
      setDocument({
        ...newDoc,
        id: currentDoc.id,
        name: currentDoc.name,
        createdAt: currentDoc.createdAt,
        assets: currentDoc.assets
      });
    } else {
      const envelope = beginProject(createProjectEnvelope({ document: newDoc, linkedGroups: [], batchJobs: [] }));
      setDocument(withProjectMetadata(envelope.document, envelope.metadata));
    }
  }

  function toggleGuide(_key: keyof ProductGuideVisibility): void {
    // Full guide-toggle wiring: updates page.metadata.productContext
    // (to be wired in a future iteration)
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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="product-def-panel">
      {/* Header */}
      <div className="product-def-header">
        <Boxes size={14} />
        <span>{activeProduct.name}</span>
        {isDirty && <span className="product-def-dirty" title="שינויים לא נשמרו">●</span>}
      </div>

      {/* ── Basic info + orientation ── */}
      <div className="product-def-section">
        <div className="product-def-row">
          <label>קטגוריה</label>
          <span>{activeProduct.category || "—"}</span>
        </div>

        {/* Orientation row with flip button */}
        <div className="product-def-row product-def-orientation-row">
          <label>אוריינטציה</label>
          <div className="product-def-orientation-ctrl">
            <span className="product-def-orientation-label">
              {isPortrait ? (
                <><Smartphone size={11} /> {trimWCm} × {trimHCm} ס&quot;מ</>
              ) : (
                <><Monitor size={11} /> {trimWCm} × {trimHCm} ס&quot;מ</>
              )}
            </span>
            <button
              className="icon-btn product-def-flip-btn"
              onClick={handleFlipOrientation}
              title={`הפוך ל${isPortrait ? "שוכב" : "עומד"}`}
              type="button"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        <div className="product-def-row">
          <label>Bleed</label>
          <span>{bleedMm} מ&quot;מ</span>
        </div>

        {activeProduct.productionType && (
          <div className="product-def-row">
            <label>ייצור</label>
            <span className="product-def-badge">{activeProduct.productionType}</span>
          </div>
        )}
        {activeProduct.recommendedDPI && (
          <div className="product-def-row">
            <label>DPI</label>
            <span>{activeProduct.recommendedDPI}</span>
          </div>
        )}
      </div>

      {/* ── Guide visibility ── */}
      <div className="product-def-section">
        <div className="product-def-section-title">מדריכים</div>
        {(
          [
            { key: "bleed" as const,            label: "Bleed" },
            { key: "safeArea" as const,          label: "Safe Area" },
            { key: "printZones" as const,        label: "אזורי הדפסה" },
            { key: "maskOverlay" as const,       label: "גבול מסיכה" },
            { key: "nonPrintableArea" as const,  label: "אפלת חוץ" }
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

      {/* ── Production instructions ── */}
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

      {/* ── Print zones ── */}
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

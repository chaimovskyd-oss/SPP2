/**
 * Right-panel section shown in EditorScreen when a product is active.
 * - Shows product info, production instructions, guide toggles
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
  Monitor,
  RotateCcw,
  RotateCw,
  Save,
  Smartphone
} from "lucide-react";
import { useState, type ReactElement } from "react";
import { applyOrientationToProduct, createDocumentFromProduct } from "@/core/product/productDocument";
import { createProjectEnvelope, withProjectMetadata } from "@/core";
import { reflowCollage, syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import { useProductStore } from "@/state/productStore";
import { useDocumentStore } from "@/state/documentStore";
import { useProjectLifecycleStore } from "@/state/projectLifecycleStore";
import { saveProductDefinition } from "@/services/python_bridge/productBridge";
import type { FrameLayer, ShapeLayer } from "@/types/layers";

export function ProductDefinitionPanel(): ReactElement | null {
  const activeProduct = useProductStore((s) => s.activeProduct);
  const isDirty = useProductStore((s) => s.isDirty);
  const setActiveProduct = useProductStore((s) => s.setActiveProduct);
  const markProductClean = useProductStore((s) => s.markProductClean);

  const setDocument = useDocumentStore((s) => s.setDocument);
  const updateLayer = useDocumentStore((s) => s.updateLayer);
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

  // Guide layer references from the active page
  const currentPage = currentDoc?.pages[0];
  const safeAreaGuideLayer = currentPage?.layers.find(
    (l): l is ShapeLayer => l.type === "shape" && l.metadata?.role === "safeAreaGuide"
  );
  const safeAreaVisible = safeAreaGuideLayer?.visible ?? true;

  const ins = activeProduct.instructions;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleFlipOrientation(): void {
    if (!activeProduct) return;
    const targetOrientation = isPortrait ? "landscape" : "portrait";
    const flipped = applyOrientationToProduct(activeProduct, targetOrientation);
    setActiveProduct(flipped);

    const newDoc = createDocumentFromProduct(flipped);
    const dpi = flipped.recommendedDPI ?? flipped.printSpec.dpi;
    const newPage = newDoc.pages[0];

    if (!currentDoc) {
      const envelope = beginProject(createProjectEnvelope({ document: newDoc, linkedGroups: [], batchJobs: [] }));
      setDocument(withProjectMetadata(envelope.document, envelope.metadata));
      return;
    }

    // Check if we're in collage mode (document has collage rules)
    const hasCollage = currentDoc.collageRules.length > 0;

    if (hasCollage && newPage) {
      // Reflow each collage rule to the new canvas size, then sync frame layers
      const newW = newPage.width;
      const newH = newPage.height;
      const updatedRules = currentDoc.collageRules.map((rule) =>
        reflowCollage(rule, newW, newH, dpi)
      );
      const updatedPages = currentDoc.pages.map((oldPage) => {
        const rule = updatedRules.find((r) => r.pageId === oldPage.id);
        if (!rule) {
          // Non-collage page: resize to match new canvas
          return { ...oldPage, width: newW, height: newH,
            setup: { ...oldPage.setup, size: { width: newW, height: newH } }
          };
        }
        const { page: synced } = syncFrameLayersToPage(
          { ...oldPage, width: newW, height: newH,
            setup: { ...oldPage.setup, size: { width: newW, height: newH } }
          },
          rule, newW, newH
        );
        return synced;
      });
      setDocument({
        ...currentDoc,
        collageRules: updatedRules,
        pages: updatedPages
      });
      return;
    }

    // Regular product mode: preserve placed image in the editable frame
    let finalPages = newDoc.pages;
    const existingPage = currentDoc.pages[0];
    if (existingPage && newPage) {
      const oldFrame = existingPage.layers.find(
        (l): l is FrameLayer => l.type === "frame" && l.metadata?.role === "editableZone"
      );
      if (oldFrame?.imageAssetId) {
        const updatedLayers = newPage.layers.map((layer) => {
          if (layer.type === "frame" && layer.metadata?.role === "editableZone") {
            return {
              ...layer,
              contentType: oldFrame.contentType,
              imageAssetId: oldFrame.imageAssetId,
              fitMode: oldFrame.fitMode
            } satisfies FrameLayer;
          }
          return layer;
        });
        finalPages = [{ ...newPage, layers: updatedLayers }, ...newDoc.pages.slice(1)];
      }
    }
    setDocument({
      ...newDoc,
      id: currentDoc.id,
      name: currentDoc.name,
      createdAt: currentDoc.createdAt,
      assets: currentDoc.assets,
      pages: finalPages
    });
  }

  function toggleSafeAreaGuide(): void {
    if (!currentPage || !safeAreaGuideLayer) return;
    updateLayer(currentPage.id, { ...safeAreaGuideLayer, visible: !safeAreaGuideLayer.visible });
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
        <div className="product-def-guide-row">
          <span>איזור בטוח</span>
          <button
            className={`icon-btn ${safeAreaVisible ? "active" : ""}`}
            onClick={toggleSafeAreaGuide}
            title={safeAreaVisible ? "הסתר איזור בטוח" : "הצג איזור בטוח"}
            type="button"
          >
            {safeAreaVisible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
        </div>
      </div>

      {/* ── Production instructions ── */}
      {ins && (
        <div className="product-def-section">
          <button
            className="product-def-collapsible"
            onClick={() => setInstructionsOpen((v) => !v)}
            type="button"
          >
            הוראות ייצור / כבישה
            {instructionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {instructionsOpen && (
            <div className="product-def-instructions">
              {ins.printerType && (
                <div className="product-def-row">
                  <label>מדפסת</label>
                  <span>{ins.printerType}</span>
                </div>
              )}
              {ins.requiresHeatPress && (
                <>
                  <div className="product-def-row">
                    <label>חום</label>
                    <span>{ins.heatPressTemperature ?? "—"}°C</span>
                  </div>
                  <div className="product-def-row">
                    <label>זמן</label>
                    <span>{ins.heatPressTimeSeconds ?? "—"}s</span>
                  </div>
                  <div className="product-def-row">
                    <label>לחץ</label>
                    <span>{ins.heatPressPressure ?? "—"}</span>
                  </div>
                </>
              )}
              {ins.requiresMirrorPrint && (
                <div className="product-def-row product-def-info">
                  <AlertTriangle size={11} />
                  <span>הדפסה מראה</span>
                </div>
              )}
              {ins.washTemperatureCelsius != null && (
                <div className="product-def-row">
                  <label>כבישה</label>
                  <span>{ins.washTemperatureCelsius}°C</span>
                </div>
              )}
              {ins.doNotTumbleDry && (
                <div className="product-def-row product-def-info">
                  <AlertTriangle size={11} />
                  <span>לא לייבש במייבש</span>
                </div>
              )}
              {ins.ironingAllowed === false && (
                <div className="product-def-row product-def-info">
                  <AlertTriangle size={11} />
                  <span>אסור לגהץ</span>
                </div>
              )}
              {ins.notes && (
                <div className="product-def-notes">{ins.notes}</div>
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

import { type ReactElement } from "react";
import { Eye, EyeOff, RotateCcw, Trash2, Sparkles, Layers as LayersIcon } from "lucide-react";
import { useDocumentStore } from "@/state/documentStore";
import { useLayerEditsPreviewStore } from "@/state/layerEditsPreviewStore";
import { collectLayerEdits, getLayerEditAdapter, resetAllLayerEdits, setAllLayerEditsEnabled } from "@/core/layerEdits";
import type { LayerEditDescriptor, LayerEditSource } from "@/core/layerEdits";
import type { VisualLayer } from "@/types/layers";

const SOURCE_BADGE: Record<LayerEditSource, string> = {
  preset: "פריסט",
  imageAdjustment: "כוונון",
  visualEffect: "אפקט",
  legacyEffect: "תמונה",
  textEffect: "טקסט"
};

/**
 * Unified "Layer Edits" panel: every visual edit affecting the selected layer —
 * regardless of which field stores it — in one compact, manageable list. Reads
 * via collectLayerEdits and mutates via pure adapters committed through the
 * generic updateLayer action (one undo record each). Before/After is a separate,
 * non-persisted preview (useLayerEditsPreviewStore).
 */
export function LayerEditsPanel({ layer }: { layer: VisualLayer }): ReactElement {
  const pageId = useDocumentStore((s) => s.activePageId);
  const updateLayer = useDocumentStore((s) => s.updateLayer);

  const previewLayerId = useLayerEditsPreviewStore((s) => s.previewLayerId);
  const previewMode = useLayerEditsPreviewStore((s) => s.mode);
  const toggleBeforeAfter = useLayerEditsPreviewStore((s) => s.toggleBeforeAfter);

  const edits = collectLayerEdits(layer);
  const beforeAfterActive = previewLayerId === layer.id && previewMode === "all-off";
  const anyEnabled = edits.some((e) => e.enabled);

  const commit = (next: VisualLayer): void => {
    if (pageId === null) return;
    updateLayer(pageId, next);
  };

  const handleToggle = (edit: LayerEditDescriptor): void => {
    const adapter = getLayerEditAdapter(edit.source);
    if (adapter === undefined) return;
    commit(adapter.setEnabled(layer, edit.id, !edit.enabled));
  };

  const handleReset = (edit: LayerEditDescriptor): void => {
    const adapter = getLayerEditAdapter(edit.source);
    if (adapter === undefined) return;
    commit(adapter.reset(layer, edit.id));
  };

  const handleRemove = (edit: LayerEditDescriptor): void => {
    const adapter = getLayerEditAdapter(edit.source);
    if (adapter?.remove === undefined) return;
    commit(adapter.remove(layer, edit.id));
  };

  const handleToggleAll = (): void => {
    commit(setAllLayerEditsEnabled(layer, !anyEnabled)); // all-off → enable all; else disable all
  };

  const handleResetAll = (): void => {
    commit(resetAllLayerEdits(layer));
  };

  if (edits.length === 0) {
    return (
      <div className="layer-edits-panel layer-edits-empty">
        <LayersIcon size={26} opacity={0.5} />
        <p>אין עריכות פעילות על השכבה הזו.</p>
        <span className="layer-edits-hint">כל תיקון, פריסט, אפקט או פעולת AI שיוחל על השכבה יופיע כאן.</span>
      </div>
    );
  }

  return (
    <div className="layer-edits-panel">
      <div className="layer-edits-list">
        {edits.map((edit) => (
          <div
            key={`${edit.source}:${edit.id}`}
            className={`layer-edit-row${edit.enabled ? "" : " is-disabled"}`}
          >
            <button
              type="button"
              className="layer-edit-eye"
              title={edit.enabled ? "הסתר עריכה" : "הצג עריכה"}
              aria-pressed={!edit.enabled}
              disabled={!edit.capabilities.toggle}
              onClick={() => handleToggle(edit)}
            >
              {edit.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>

            <div className="layer-edit-main">
              <div className="layer-edit-title">
                {edit.source === "preset" ? <Sparkles size={12} className="layer-edit-preset-icon" /> : null}
                <strong>{edit.label}</strong>
                <span className="layer-edit-badge">{SOURCE_BADGE[edit.source]}</span>
              </div>
              {edit.summary !== "" ? <span className="layer-edit-summary">{edit.summary}</span> : null}
            </div>

            {edit.capabilities.remove ? (
              <button
                type="button"
                className="layer-edit-action"
                title="הסר עריכה"
                onClick={() => handleRemove(edit)}
              >
                <Trash2 size={14} />
              </button>
            ) : edit.capabilities.reset ? (
              <button
                type="button"
                className="layer-edit-action"
                title="אפס עריכה"
                onClick={() => handleReset(edit)}
              >
                <RotateCcw size={14} />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="layer-edits-footer">
        <button
          type="button"
          className={`layer-edits-fbtn${beforeAfterActive ? " on" : ""}`}
          title="החזק/לחץ כדי להשוות לפני/אחרי — לא הרסני"
          onClick={() => toggleBeforeAfter(layer.id)}
        >
          {beforeAfterActive ? <EyeOff size={14} /> : <Eye size={14} />} לפני / אחרי
        </button>
        <button type="button" className="layer-edits-fbtn" onClick={handleToggleAll}>
          {anyEnabled ? "כבה הכל" : "הפעל הכל"}
        </button>
        <button type="button" className="layer-edits-fbtn danger" onClick={handleResetAll}>
          <RotateCcw size={14} /> אפס הכל
        </button>
      </div>
    </div>
  );
}

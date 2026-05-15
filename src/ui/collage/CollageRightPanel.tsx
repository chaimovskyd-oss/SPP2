import { useState, type ReactElement } from "react";
import { useDocumentStore } from "@/state/documentStore";
import type { CollageEdgeStyle, CollageRule } from "@/types/collage";
import type { ID } from "@/types/primitives";

interface CollageRightPanelProps {
  rule: CollageRule;
  selectedSlotId: ID | null;
}

export function CollageRightPanel({ rule, selectedSlotId }: CollageRightPanelProps): ReactElement {
  const [tab, setTab] = useState<"cell" | "effects" | "canvas">("cell");
  const updateAdjustments = useDocumentStore((s) => s.updateCollageImageAdjustments);
  const updateEdgeConfig = useDocumentStore((s) => s.updateCollageEdgeConfig);
  const updateCanvasSettings = useDocumentStore((s) => s.updateCollageCanvasSettings);

  const assignment = selectedSlotId
    ? rule.imageAssignments.find((a) => a.slotId === selectedSlotId)
    : undefined;

  const adj = assignment?.colorAdjustments;

  return (
    <aside className="collage-right-panel">
      <div className="panel-tabs">
        <button type="button" className={`panel-tab${tab === "cell" ? " active" : ""}`} onClick={() => setTab("cell")}>
          תא
        </button>
        <button type="button" className={`panel-tab${tab === "effects" ? " active" : ""}`} onClick={() => setTab("effects")}>
          אפקטים
        </button>
        <button type="button" className={`panel-tab${tab === "canvas" ? " active" : ""}`} onClick={() => setTab("canvas")}>
          קנבס
        </button>
      </div>

      {tab === "cell" && (
        <div className="panel-section">
          {!selectedSlotId || !assignment ? (
            <p className="panel-hint">בחר תא בקנבס</p>
          ) : (
            <>
              <div className="panel-field">
                <label>בהירות: {adj?.brightness.toFixed(2)}</label>
                <input
                  type="range" min={0.2} max={2} step={0.05}
                  value={adj?.brightness ?? 1}
                  onChange={(e) => updateAdjustments(rule.id, selectedSlotId, { brightness: +e.target.value })}
                />
              </div>
              <div className="panel-field">
                <label>ניגודיות: {adj?.contrast.toFixed(2)}</label>
                <input
                  type="range" min={0.2} max={2} step={0.05}
                  value={adj?.contrast ?? 1}
                  onChange={(e) => updateAdjustments(rule.id, selectedSlotId, { contrast: +e.target.value })}
                />
              </div>
              <div className="panel-field">
                <label>רוויה: {adj?.saturation.toFixed(2)}</label>
                <input
                  type="range" min={0} max={2} step={0.05}
                  value={adj?.saturation ?? 1}
                  onChange={(e) => updateAdjustments(rule.id, selectedSlotId, { saturation: +e.target.value })}
                />
              </div>
              <div className="panel-field">
                <label>חשיפה (EV): {adj?.exposureEV.toFixed(1)}</label>
                <input
                  type="range" min={-3} max={3} step={0.1}
                  value={adj?.exposureEV ?? 0}
                  onChange={(e) => updateAdjustments(rule.id, selectedSlotId, { exposureEV: +e.target.value })}
                />
              </div>
              <div className="panel-field">
                <label>
                  <input
                    type="checkbox"
                    checked={adj?.isBlackAndWhite ?? false}
                    onChange={(e) => updateAdjustments(rule.id, selectedSlotId, { isBlackAndWhite: e.target.checked })}
                  />
                  &nbsp;שחור לבן
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "effects" && (
        <div className="panel-section">
          {!selectedSlotId ? (
            <p className="panel-hint">בחר תא בקנבס</p>
          ) : (
            <div className="panel-field">
              <label>סגנון שוליים:</label>
              <select
                value={assignment?.edgeConfig?.style ?? "hard"}
                onChange={(e) =>
                  updateEdgeConfig(rule.id, selectedSlotId, { style: e.target.value as CollageEdgeStyle })
                }
              >
                <option value="hard">חד</option>
                <option value="softEdge">רך</option>
                <option value="tornPaper">נייר קרוע</option>
                <option value="outlineCircle">מסגרת עגולה</option>
              </select>
            </div>
          )}
        </div>
      )}

      {tab === "canvas" && (
        <div className="panel-section">
          <div className="panel-field">
            <label>צבע רקע:</label>
            <input
              type="color"
              value={rule.canvasSettings.backgroundColor}
              onChange={(e) => updateCanvasSettings(rule.id, { backgroundColor: e.target.value })}
            />
          </div>
          <div className="panel-field">
            <label>רדיוס פינות: {rule.canvasSettings.globalCornerRadius} מ״מ</label>
            <input
              type="range" min={0} max={20} step={0.5}
              value={rule.canvasSettings.globalCornerRadius}
              onChange={(e) => updateCanvasSettings(rule.id, { globalCornerRadius: +e.target.value })}
            />
          </div>
          <div className="panel-field">
            <label>גבול: {rule.canvasSettings.globalBorderWidth} מ״מ</label>
            <input
              type="range" min={0} max={5} step={0.1}
              value={rule.canvasSettings.globalBorderWidth}
              onChange={(e) => updateCanvasSettings(rule.id, { globalBorderWidth: +e.target.value })}
            />
          </div>
          <div className="panel-field">
            <label>
              <input
                type="checkbox"
                checked={rule.canvasSettings.globalShadowEnabled}
                onChange={(e) => updateCanvasSettings(rule.id, { globalShadowEnabled: e.target.checked })}
              />
              &nbsp;צל כללי
            </label>
          </div>
        </div>
      )}
    </aside>
  );
}

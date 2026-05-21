import { Brush, ChevronDown, ChevronUp, Copy, PaintBucket, Pipette, RefreshCw, Trash2, X } from "lucide-react";
import { useMemo, useState, type ChangeEvent, type ReactElement } from "react";
import { useColorStore } from "@/state/colorStore";
import { useDrawingToolsStore } from "@/state/drawingToolsStore";
import { computeHarmony, type HarmonyScheme } from "@/core/color/harmonies";
import { extractDominantColors } from "@/core/color/dominantColors";

interface ColorPanelProps {
  getStageCanvas?: () => HTMLCanvasElement | null;
}

const HARMONY_TABS: Array<{ id: HarmonyScheme; label: string }> = [
  { id: "complementary", label: "משלים" },
  { id: "analogous", label: "אנלוגי" },
  { id: "triadic", label: "משולש" },
  { id: "splitComplement", label: "מתפצל" },
  { id: "monochromatic", label: "מונוכרום" }
];

const COLLAPSE_STORAGE_KEY = "spp2.colorPanel.collapsed.v1";

function loadCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1"; } catch { return false; }
}
function persistCollapsed(v: boolean): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(COLLAPSE_STORAGE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
}

export function ColorPanel({ getStageCanvas }: ColorPanelProps): ReactElement {
  const currentColor = useColorStore((s) => s.currentColor);
  const history = useColorStore((s) => s.history);
  const dominantColors = useColorStore((s) => s.dominantColors);
  const harmonyScheme = useColorStore((s) => s.harmonyScheme);
  const setCurrentColor = useColorStore((s) => s.setCurrentColor);
  const removeFromHistory = useColorStore((s) => s.removeFromHistory);
  const clearHistory = useColorStore((s) => s.clearHistory);
  const setDominantColors = useColorStore((s) => s.setDominantColors);
  const setHarmonyScheme = useColorStore((s) => s.setHarmonyScheme);

  const activeTool = useDrawingToolsStore((s) => s.activeTool);
  const setActiveTool = useDrawingToolsStore((s) => s.setActiveTool);
  const brushSize = useDrawingToolsStore((s) => s.brushSize);
  const setBrushSize = useDrawingToolsStore((s) => s.setBrushSize);
  const bucketMode = useDrawingToolsStore((s) => s.bucketMode);
  const setBucketMode = useDrawingToolsStore((s) => s.setBucketMode);

  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(loadCollapsed);

  const harmonyColors = useMemo(
    () => computeHarmony(currentColor, harmonyScheme),
    [currentColor, harmonyScheme]
  );

  function handleHexInput(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    if (/^#?[0-9A-Fa-f]{0,6}$/.test(value)) {
      if (value.length === 7 || (value.length === 6 && !value.startsWith("#"))) {
        setCurrentColor(value);
      }
    }
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(currentColor);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard may be unavailable in restricted contexts
    }
  }

  function toggleEyedropper(): void {
    setActiveTool(activeTool === "eyedropper" ? null : "eyedropper");
  }

  function handleRefreshDominant(): void {
    if (getStageCanvas === undefined) return;
    setRefreshing(true);
    window.requestAnimationFrame(() => {
      try {
        const canvas = getStageCanvas();
        if (canvas !== null) {
          const colors = extractDominantColors(canvas, 6);
          setDominantColors(colors);
        }
      } finally {
        setRefreshing(false);
      }
    });
  }

  function toggleCollapsed(): void {
    setCollapsed((prev) => {
      const next = !prev;
      persistCollapsed(next);
      return next;
    });
  }

  return (
    <div className={collapsed ? "color-panel collapsed" : "color-panel"} data-testid="color-panel">
      <div className="cp-header">
        <button
          type="button"
          className="cp-collapse-btn"
          onClick={toggleCollapsed}
          title={collapsed ? "פתח פאנל צבע" : "כווץ פאנל צבע"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
        <span className="cp-title">צבע</span>
        {collapsed ? (
          <div
            className="cp-collapsed-swatch"
            style={{ background: currentColor }}
            title={currentColor}
            onClick={toggleCollapsed}
          />
        ) : null}
        <button
          type="button"
          className={activeTool === "eyedropper" ? "cp-tool-btn on" : "cp-tool-btn"}
          onClick={toggleEyedropper}
          title="טפטפת — דגום צבע מהקנבס (I)"
        >
          <Pipette size={14} />
        </button>
        <button
          type="button"
          className={activeTool === "brush" ? "cp-tool-btn on" : "cp-tool-btn"}
          onClick={() => setActiveTool(activeTool === "brush" ? null : "brush")}
          title="מכחול (B)"
          data-testid="tool-brush"
        >
          <Brush size={14} />
        </button>
        <button
          type="button"
          className={activeTool === "bucket" ? "cp-tool-btn on" : "cp-tool-btn"}
          onClick={() => setActiveTool(activeTool === "bucket" ? null : "bucket")}
          title="דלי צבע (G)"
          data-testid="tool-bucket"
        >
          <PaintBucket size={14} />
        </button>
      </div>

      {collapsed ? null : (
        <>
          <div className="cp-current">
            <div
              className="cp-swatch-large"
              style={{ background: currentColor }}
              title={currentColor}
            />
            <div className="cp-current-meta">
              <input
                type="color"
                className="cp-color-picker"
                value={currentColor}
                onChange={(e) => setCurrentColor(e.target.value)}
                title="בחר צבע"
              />
              <input
                type="text"
                className="cp-hex-input"
                value={currentColor}
                onChange={handleHexInput}
                spellCheck={false}
                maxLength={7}
                dir="ltr"
              />
              <button
                type="button"
                className="cp-copy-btn"
                onClick={() => { void handleCopy(); }}
                title="העתק קוד צבע"
              >
                <Copy size={12} />
                <span>{copied ? "הועתק" : "העתק"}</span>
              </button>
            </div>
          </div>

          {activeTool === "brush" ? (
            <div className="cp-tool-settings">
              <span className="cp-tool-settings-label">מכחול</span>
              <label className="ctx-slider" title="גודל מכחול">
                <span className="ctx-btn-label">גודל</span>
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />
                <span className="ctx-btn-label" style={{ minWidth: 26, textAlign: "center" }}>{brushSize}</span>
              </label>
            </div>
          ) : null}
          {activeTool === "bucket" ? (
            <div className="cp-tool-settings">
              <span className="cp-tool-settings-label">דלי</span>
              <div className="context-bucket-modes">
                <button
                  type="button"
                  className={bucketMode === "fill" ? "context-toggle on" : "context-toggle"}
                  onClick={() => setBucketMode("fill")}
                  title="מלא את כל השכבה"
                >Fill</button>
                <button
                  type="button"
                  className={bucketMode === "contiguous" ? "context-toggle on" : "context-toggle"}
                  onClick={() => setBucketMode("contiguous")}
                  title="מלא רק את האזור הרציף תחת הקליק"
                >Contig</button>
              </div>
            </div>
          ) : null}

          <div className="cp-section">
            <div className="cp-history-header">
              <span>צבעי קנבס</span>
              <button
                type="button"
                className="cp-refresh-btn"
                onClick={handleRefreshDominant}
                disabled={refreshing || getStageCanvas === undefined}
                title="חשב מחדש את הצבעים הדומיננטיים בקנבס"
              >
                <RefreshCw size={11} className={refreshing ? "spin" : ""} />
              </button>
            </div>
            <div className="cp-swatch-row">
              {dominantColors.length === 0 ? (
                <span className="cp-history-empty">לחץ Refresh כדי לחלץ צבעים מהקנבס</span>
              ) : (
                dominantColors.map((hex, idx) => (
                  <button
                    key={`${hex}-${idx}`}
                    type="button"
                    className="cp-swatch-small"
                    style={{ background: hex }}
                    onClick={() => setCurrentColor(hex)}
                    title={hex}
                  />
                ))
              )}
            </div>
          </div>

          <div className="cp-section">
            <div className="cp-history-header">
              <span>הרמוניות</span>
            </div>
            <div className="cp-harmony-tabs">
              {HARMONY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={harmonyScheme === tab.id ? "cp-harmony-tab on" : "cp-harmony-tab"}
                  onClick={() => setHarmonyScheme(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="cp-swatch-row">
              {harmonyColors.map((hex, idx) => {
                const isAnchor = hex.toUpperCase() === currentColor.toUpperCase();
                return (
                  <button
                    key={`${hex}-${idx}`}
                    type="button"
                    className={isAnchor ? "cp-swatch-small cp-anchor-swatch" : "cp-swatch-small"}
                    style={{ background: hex }}
                    onClick={() => setCurrentColor(hex)}
                    title={hex}
                  />
                );
              })}
            </div>
          </div>

          <div className="cp-history-header">
            <span>היסטוריה</span>
            {history.length > 0 ? (
              <button
                type="button"
                className="cp-clear-btn"
                onClick={clearHistory}
                title="נקה היסטוריה"
              >
                <Trash2 size={11} />
              </button>
            ) : null}
          </div>
          <div className="cp-history">
            {history.length === 0 ? (
              <span className="cp-history-empty">דגום צבעים מהקנבס כדי לבנות פאלטה</span>
            ) : (
              history.map((hex) => (
                <div key={hex} className="cp-history-cell">
                  <button
                    type="button"
                    className="cp-swatch-small"
                    style={{ background: hex }}
                    onClick={() => setCurrentColor(hex)}
                    title={hex}
                  />
                  <button
                    type="button"
                    className="cp-history-remove"
                    onClick={() => removeFromHistory(hex)}
                    title="הסר"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

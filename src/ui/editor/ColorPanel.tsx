import { Copy, Pipette, Trash2, X } from "lucide-react";
import { useState, type ChangeEvent, type ReactElement } from "react";
import { useColorStore } from "@/state/colorStore";
import { useDrawingToolsStore } from "@/state/drawingToolsStore";

export function ColorPanel(): ReactElement {
  const currentColor = useColorStore((s) => s.currentColor);
  const history = useColorStore((s) => s.history);
  const setCurrentColor = useColorStore((s) => s.setCurrentColor);
  const removeFromHistory = useColorStore((s) => s.removeFromHistory);
  const clearHistory = useColorStore((s) => s.clearHistory);

  const activeTool = useDrawingToolsStore((s) => s.activeTool);
  const setActiveTool = useDrawingToolsStore((s) => s.setActiveTool);

  const [copied, setCopied] = useState(false);

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

  return (
    <div className="color-panel" data-testid="color-panel">
      <div className="cp-header">
        <span className="cp-title">צבע</span>
        <button
          type="button"
          className={activeTool === "eyedropper" ? "cp-eyedrop-btn on" : "cp-eyedrop-btn"}
          onClick={toggleEyedropper}
          title="טפטפת — דגום צבע מהקנבס (I)"
        >
          <Pipette size={14} />
        </button>
      </div>

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
    </div>
  );
}

import { useState, useEffect } from "react";
import { Printer, Zap, X } from "lucide-react";
import type { PrintRangeMode } from "./printRangeUtils";
import { parsePageRange } from "./printRangeUtils";
import { loadLastPrintSettings } from "./lastPrintSettings";

export interface PrintRangeDialogProps {
  totalPages: number;
  currentPageIndex: number; // zero-based
  onPrint: (mode: PrintRangeMode, customRange: string | undefined) => void;
  onPrintOneCopy: (() => void) | null; // null = no last settings yet
  onCancel: () => void;
  isBusy?: boolean;
}

export function PrintRangeDialog({
  totalPages,
  currentPageIndex,
  onPrint,
  onPrintOneCopy,
  onCancel,
  isBusy = false
}: PrintRangeDialogProps) {
  const [mode, setMode] = useState<PrintRangeMode>("current");
  const [customRange, setCustomRange] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Pre-fill from last settings
  useEffect(() => {
    const last = loadLastPrintSettings();
    if (last) {
      setMode(last.printRangeMode);
      setCustomRange(last.customPageRange ?? "");
    }
  }, []);

  function validateCustomRange(value: string): string | null {
    if (!value.trim()) return "יש להזין טווח עמודים.";
    const result = parsePageRange(value, totalPages);
    return result.error ?? null;
  }

  function handleModeChange(next: PrintRangeMode) {
    setMode(next);
    setRangeError(null);
  }

  function handleCustomRangeChange(value: string) {
    setCustomRange(value);
    setRangeError(null);
  }

  function handlePrint() {
    if (mode === "custom") {
      const err = validateCustomRange(customRange);
      if (err) {
        setRangeError(err);
        return;
      }
    }
    onPrint(mode, mode === "custom" ? customRange : undefined);
  }

  const hasLastSettings = loadLastPrintSettings() !== null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)"
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onCancel(); }}
    >
      <div
        style={{
          background: "var(--bg-elevated, #2c2a35)",
          border: "1px solid var(--border, #35323f)",
          borderRadius: 12,
          padding: "24px 28px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          width: 380,
          maxWidth: "95vw",
          direction: "rtl"
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 15 }}>
            <Printer size={16} style={{ color: "var(--accent, #7c6fe0)" }} />
            הדפסה
          </div>
          {!isBusy && (
            <button
              onClick={onCancel}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary, #8b88a0)", padding: 4 }}
              type="button"
              title="ביטול"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Info */}
        <div style={{ fontSize: 12, color: "var(--text-secondary, #8b88a0)", marginBottom: 18, display: "flex", gap: 16 }}>
          <span>סה"כ עמודים: <strong style={{ color: "var(--text-primary)" }}>{totalPages}</strong></span>
          <span>עמוד נוכחי: <strong style={{ color: "var(--text-primary)" }}>{currentPageIndex + 1}</strong></span>
        </div>

        {/* Range section */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            טווח הדפסה
          </div>

          <RadioOption
            label="עמוד נוכחי"
            description={`יודפס עמוד ${currentPageIndex + 1} בלבד`}
            checked={mode === "current"}
            onChange={() => handleModeChange("current")}
            disabled={isBusy}
          />

          <RadioOption
            label="כל העמודים"
            description={`יודפסו כל ${totalPages} העמודים`}
            checked={mode === "all"}
            onChange={() => handleModeChange("all")}
            disabled={isBusy}
          />

          <RadioOption
            label="עמודים נבחרים"
            description={null}
            checked={mode === "custom"}
            onChange={() => handleModeChange("custom")}
            disabled={isBusy}
          />

          {mode === "custom" && (
            <div style={{ marginTop: 8, marginRight: 24 }}>
              <input
                type="text"
                value={customRange}
                onChange={(e) => handleCustomRangeChange(e.target.value)}
                placeholder="לדוגמה: 1-3,6,9-12"
                disabled={isBusy}
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  background: "var(--bg-surface, #211f28)",
                  border: `1px solid ${rangeError ? "var(--danger, #e06b6b)" : "var(--border, #35323f)"}`,
                  borderRadius: 6,
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                  direction: "ltr"
                }}
                autoFocus
              />
              {rangeError && (
                <div style={{ marginTop: 5, fontSize: 12, color: "var(--danger, #e06b6b)" }}>
                  {rangeError}
                </div>
              )}
              <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-tertiary, #5f5d72)" }}>
                פורמטים תקינים: 1 | 1-4 | 2,5,8 | 1-3,6,10-12
              </div>
            </div>
          )}
        </div>

        {/* Busy indicator */}
        {isBusy && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--bg-surface)", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)", textAlign: "center" }}>
            מכין עמודים להדפסה…
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={handlePrint}
              disabled={isBusy}
              style={{ flex: 1 }}
            >
              <Printer size={14} />
              הדפס
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={onCancel}
              disabled={isBusy}
            >
              ביטול
            </button>
          </div>

          {/* Print One Copy */}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              if (hasLastSettings && onPrintOneCopy) {
                onPrintOneCopy();
              } else {
                // No last settings — trigger print with current settings as first-time
                handlePrint();
              }
            }}
            disabled={isBusy}
            title={hasLastSettings ? "הדפסה מהירה לפי הגדרות אחרונות (עותק אחד)" : "אין עדיין הגדרות אחרונות — תדפיס וישמור"}
            style={{ fontSize: 12, color: "var(--text-secondary)" }}
          >
            <Zap size={12} />
            {hasLastSettings ? "הדפס עותק אחד (הגדרות אחרונות)" : "הדפס עותק אחד"}
          </button>

          {!hasLastSettings && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", textAlign: "center" }}>
              אין עדיין הגדרות הדפסה אחרונות. לאחר הדפסה ראשונה, ניתן יהיה להשתמש בהדפסה המהירה.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface RadioOptionProps {
  label: string;
  description: string | null;
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}

function RadioOption({ label, description, checked, onChange, disabled }: RadioOptionProps) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        cursor: disabled ? "default" : "pointer",
        background: checked ? "var(--accent-glow, rgba(124,111,224,0.12))" : "transparent",
        border: `1px solid ${checked ? "var(--accent, #7c6fe0)" : "transparent"}`,
        marginBottom: 4,
        transition: "all 150ms ease-out",
        opacity: disabled ? 0.6 : 1
      }}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ marginTop: 2, accentColor: "var(--accent, #7c6fe0)" }}
      />
      <div>
        <div style={{ fontWeight: checked ? 600 : 400, fontSize: 13 }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: "var(--text-tertiary, #5f5d72)", marginTop: 2 }}>{description}</div>
        )}
      </div>
    </label>
  );
}

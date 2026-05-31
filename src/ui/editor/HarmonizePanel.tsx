import React, { useCallback, useState } from "react";
import type Konva from "konva";
import type { Asset } from "@/types/document";
import {
  isHarmonizeAvailable,
  runHarmonizePreview,
  applyHarmonize,
  buildShadowAsset,
  type HarmonizeOptions,
  type HarmonizePreviewResult,
} from "@/services/harmonizeService";

interface HarmonizePanelProps {
  layerId: string;
  asset: Asset;
  bbox: { x: number; y: number; w: number; h: number };
  stageRef: React.RefObject<Konva.Stage | null>;
  onApply: (updatedAsset: Asset, shadow?: { asset: Asset }) => void;
  onClose: () => void;
}

const defaultOptions: HarmonizeOptions = {
  strength: 0.35,
  matchBrightness: true,
  matchContrast: true,
  matchSaturation: true,
  matchTemperature: true,
  mode: "algorithm",
  addShadow: false,
  shadowStrength: 0.28,
  shadowSoftness: 14,
  shadowDistance: 10,
  shadowDirection: 135,
};

const SLIDER_STYLE: React.CSSProperties = {
  width: "100%",
  accentColor: "var(--accent)",
};

const ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

export function HarmonizePanel({
  layerId,
  asset,
  bbox,
  stageRef,
  onApply,
  onClose,
}: HarmonizePanelProps) {
  const [options, setOptions] = useState<HarmonizeOptions>(defaultOptions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<HarmonizePreviewResult | null>(null);
  const [applying, setApplying] = useState(false);

  const available = isHarmonizeAvailable();

  const handlePreview = useCallback(async () => {
    if (!stageRef.current || !available) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await runHarmonizePreview(
        asset,
        bbox,
        stageRef.current,
        layerId,
        options
      );
      if (!result) {
        setError("העיבוד נכשל. ייתכן שאין מספיק מידע על הרקע.");
      } else {
        setPreview(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setLoading(false);
    }
  }, [asset, bbox, layerId, options, stageRef, available]);

  const handleApply = useCallback(async () => {
    if (!preview) return;
    setApplying(true);
    try {
      const updatedAsset = await applyHarmonize(preview.previewDataUrl, asset);
      const shadowResult =
        preview.shadowDataUrl
          ? { asset: buildShadowAsset(preview.shadowDataUrl, asset.name) }
          : undefined;
      onApply(updatedAsset, shadowResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאת החלה");
      setApplying(false);
    }
  }, [asset, preview, onApply]);

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const set = <K extends keyof HarmonizeOptions>(k: K, v: HarmonizeOptions[K]) =>
    setOptions((o) => ({ ...o, [k]: v }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir="rtl"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "min(440px, 96vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "var(--bg-elevated, #2c2a35)",
          border: "1px solid var(--border, #35323f)",
          borderRadius: 10,
          padding: "20px 22px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
            מיזוג סגנון
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none",
              color: "var(--text-secondary)", cursor: "pointer",
              fontSize: 20, lineHeight: 1, padding: "0 2px",
            }}
            title="סגור"
          >
            ✕
          </button>
        </div>

        {!available && (
          <p style={{ color: "var(--warning, #e0a650)", fontSize: 12, margin: 0 }}>
            עיבוד Python אינו זמין במצב זה.
          </p>
        )}

        {/* ── Harmonize controls ─────────────────────────────────────── */}
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            עוצמת מיזוג – {Math.round(options.strength * 100)}%
          </span>
          <input
            type="range" min={0} max={70}
            value={Math.round(options.strength * 100)}
            onChange={(e) => set("strength", Number(e.target.value) / 100)}
            style={SLIDER_STYLE}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
          {([
            ["matchBrightness", "בהירות"],
            ["matchContrast", "קונטרסט"],
            ["matchSaturation", "רוויה"],
            ["matchTemperature", "טמפרטורה"],
          ] as const).map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(e) => set(key, e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              {label}
            </label>
          ))}
        </div>

        {/* Neural toggle */}
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: available ? "pointer" : "not-allowed", fontSize: 12, opacity: available ? 1 : 0.45 }}
          title={available ? "מצב נוירלי – IntrinsicHarmony (CVPR 2021). בשימוש ראשון יורד מודל ~47MB." : "עיבוד Python אינו זמין"}
        >
          <input
            type="checkbox"
            checked={options.mode === "neural"}
            disabled={!available}
            onChange={(e) => set("mode", e.target.checked ? "neural" : "algorithm")}
            style={{ accentColor: "var(--accent)" }}
          />
          <span>
            מצב נוירלי
            <span style={{ color: "var(--text-tertiary)", marginRight: 4, fontSize: 11 }}>
              {options.mode === "neural" ? "(IIH – הורדה אוטומטית בפעם הראשונה)" : "(אלגוריתם מהיר)"}
            </span>
          </span>
        </label>

        {/* ── Divider ────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />

        {/* ── Contact shadow ─────────────────────────────────────────── */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={options.addShadow}
            onChange={(e) => set("addShadow", e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          הוסף צל מגע
        </label>

        {options.addShadow && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingRight: 16, borderRight: "2px solid rgba(124,111,224,0.3)" }}>
            {/* Shadow strength */}
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={ROW}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>עוצמת צל</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{Math.round(options.shadowStrength * 100)}%</span>
              </div>
              <input
                type="range" min={0} max={100}
                value={Math.round(options.shadowStrength * 100)}
                onChange={(e) => set("shadowStrength", Number(e.target.value) / 100)}
                style={SLIDER_STYLE}
              />
            </label>

            {/* Shadow softness */}
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={ROW}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>רכות</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{options.shadowSoftness}px</span>
              </div>
              <input
                type="range" min={0} max={60}
                value={options.shadowSoftness}
                onChange={(e) => set("shadowSoftness", Number(e.target.value))}
                style={SLIDER_STYLE}
              />
            </label>

            {/* Shadow distance */}
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={ROW}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>מרחק</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{options.shadowDistance}px</span>
              </div>
              <input
                type="range" min={0} max={80}
                value={options.shadowDistance}
                onChange={(e) => set("shadowDistance", Number(e.target.value))}
                style={SLIDER_STYLE}
              />
            </label>

            {/* Shadow direction */}
            <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={ROW}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>כיוון הצל</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{options.shadowDirection}°</span>
              </div>
              <input
                type="range" min={0} max={359}
                value={options.shadowDirection}
                onChange={(e) => set("shadowDirection", Number(e.target.value))}
                style={SLIDER_STYLE}
              />
              {/* Compass hint */}
              <span style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "center" }}>
                {directionLabel(options.shadowDirection)}
              </span>
            </label>
          </div>
        )}

        {/* Preview button */}
        <button
          onClick={handlePreview}
          disabled={loading || !available}
          style={{
            background: "var(--accent, #7c6fe0)", color: "#fff",
            border: "none", borderRadius: 6, padding: "8px 14px",
            cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600,
            opacity: loading || !available ? 0.6 : 1,
          }}
        >
          {loading ? "מעבד..." : "תצוגה מקדימה"}
        </button>

        {/* Error */}
        {error && (
          <p style={{ color: "var(--danger, #e06b6b)", fontSize: 12, margin: 0 }}>{error}</p>
        )}

        {/* ── Preview comparison ─────────────────────────────────────── */}
        {preview && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {/* Original */}
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 4px" }}>מקור</p>
                <img
                  src={asset.previewPath ?? asset.originalPath ?? ""}
                  alt="מקור"
                  style={{ width: "100%", height: 110, objectFit: "contain", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}
                />
              </div>
              {/* Result */}
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 4px" }}>תוצאה</p>
                <img
                  src={preview.previewDataUrl}
                  alt="תוצאה"
                  style={{ width: "100%", height: 110, objectFit: "contain", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid var(--accent, #7c6fe0)" }}
                />
              </div>
            </div>

            {/* Shadow preview */}
            {preview.shadowDataUrl && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 56, height: 56, flexShrink: 0, borderRadius: 6,
                    background: "repeating-conic-gradient(#888 0% 25%, #ccc 0% 50%) 0 0 / 10px 10px",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={preview.shadowDataUrl}
                    alt="צל"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                </div>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
                  שכבת צל תיווצר מתחת לשכבה הנוכחית<br />
                  <span style={{ color: "var(--text-tertiary)" }}>Contact Shadow – {asset.name}</span>
                </p>
              </div>
            )}

            {/* Diagnostics */}
            <div
              style={{
                background: "rgba(124,111,224,0.08)", border: "1px solid rgba(124,111,224,0.2)",
                borderRadius: 6, padding: "8px 10px", fontSize: 11,
                color: "var(--text-secondary)", display: "flex", flexWrap: "wrap", gap: "4px 14px",
              }}
            >
              <span>בהירות: {pct(preview.diagnostics.brightnessAdj)}</span>
              <span>קונטרסט: ×{preview.diagnostics.contrastAdj.toFixed(2)}</span>
              <span>רוויה: {pct(preview.diagnostics.saturationAdj)}</span>
              <span>טמפרטורה: {pct(preview.diagnostics.tempAdj)}</span>
              {preview.mode && preview.mode !== "passthrough" && (
                <span style={{ color: "var(--text-tertiary)" }}>
                  {preview.mode === "neural" ? "🧠 נוירלי" : "📐 אלגוריתם"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "1px solid var(--border)", borderRadius: 6,
              padding: "7px 14px", cursor: "pointer",
              color: "var(--text-secondary)", fontSize: 12,
            }}
          >
            ביטול
          </button>
          <button
            onClick={handleApply}
            disabled={!preview || applying}
            style={{
              background: preview ? "var(--success, #52c97a)" : "var(--bg-canvas)",
              color: preview ? "#fff" : "var(--text-tertiary)",
              border: "none", borderRadius: 6, padding: "7px 18px",
              cursor: preview && !applying ? "pointer" : "default",
              fontSize: 13, fontWeight: 600, opacity: applying ? 0.6 : 1,
            }}
          >
            {applying ? "מחיל..." : "החל"}
          </button>
        </div>
      </div>
    </div>
  );
}

function directionLabel(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  if (d < 22.5 || d >= 337.5) return "↑ צפון";
  if (d < 67.5)  return "↗ צפון-מזרח";
  if (d < 112.5) return "→ מזרח";
  if (d < 157.5) return "↘ דרום-מזרח ✓";
  if (d < 202.5) return "↓ דרום";
  if (d < 247.5) return "↙ דרום-מערב";
  if (d < 292.5) return "← מערב";
  return "↖ צפון-מערב";
}

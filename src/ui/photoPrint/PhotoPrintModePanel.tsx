import { useState, type ReactElement } from "react";
import { Crop, Frame, Layers, Ruler, Sparkles } from "lucide-react";
import { mmToPx } from "@/core/units/conversion";
import type { Document } from "@/types/document";
import type { PhotoPrintRule } from "@/types/photoPrint";
import { PRINT_SIZE_PRESETS, PHOTO_PAGE_PRESETS } from "@/types/photoPrint";
import { PassportCheckPanel } from "./PassportCheckPanel";
import { isPassportPrintPreset } from "@/core/passport/passportRequirements";

interface PhotoPrintModePanelProps {
  rule: PhotoPrintRule;
  document: Document;
  smartCropProgress?: { done: number; total: number } | null;
  onApplyFaceCrop: () => void;
  onRegenerate: (patch: Partial<PhotoPrintRule>) => void;
}

type PanelTab = "size" | "frame" | "margins" | "layout";

export function PhotoPrintModePanel({ rule, document, smartCropProgress = null, onApplyFaceCrop, onRegenerate }: PhotoPrintModePanelProps): ReactElement {
  const [tab, setTab] = useState<PanelTab>("size");

  const dpi = (rule.metadata["dpi"] as number | undefined) ?? 300;

  function patchAndRegenerate(patch: Partial<PhotoPrintRule>): void {
    onRegenerate(patch);
  }

  return (
    <div className="pp-panel">
      {/* Tab bar */}
      <div className="pp-panel-tabs">
        <button className={`pp-panel-tab${tab === "size" ? " active" : ""}`} type="button" onClick={() => setTab("size")} title="גודל הדפסה">
          <Crop size={14} />
        </button>
        <button className={`pp-panel-tab${tab === "frame" ? " active" : ""}`} type="button" onClick={() => setTab("frame")} title="מסגרת">
          <Frame size={14} />
        </button>
        <button className={`pp-panel-tab${tab === "margins" ? " active" : ""}`} type="button" onClick={() => setTab("margins")} title="שוליים">
          <Ruler size={14} />
        </button>
        <button className={`pp-panel-tab${tab === "layout" ? " active" : ""}`} type="button" onClick={() => setTab("layout")} title="סידור">
          <Layers size={14} />
        </button>
      </div>

      <div className="pp-panel-body">
        <PassportCheckPanel document={document} rule={rule} />
        <button className="pp-panel-action" disabled={smartCropProgress !== null} onClick={onApplyFaceCrop} type="button">
          <Sparkles size={14} />
          {smartCropProgress === null ? "התאם לפי פנים" : `מנתח ${smartCropProgress.done}/${smartCropProgress.total}`}
        </button>
        {tab === "size" && <SizeTab rule={rule} dpi={dpi} onPatch={patchAndRegenerate} />}
        {tab === "frame" && <FrameTab rule={rule} onPatch={patchAndRegenerate} />}
        {tab === "margins" && <MarginsTab rule={rule} onPatch={patchAndRegenerate} />}
        {tab === "layout" && <LayoutTab rule={rule} onPatch={patchAndRegenerate} />}
      </div>
    </div>
  );
}

// ─── Size tab ─────────────────────────────────────────────────────────────────

function SizeTab({ rule, onPatch }: { rule: PhotoPrintRule; dpi: number; onPatch: (p: Partial<PhotoPrintRule>) => void }): ReactElement {
  const photoPresets = PRINT_SIZE_PRESETS.filter((p) => p.category !== "custom");
  const selectedPreset = photoPresets.find((p) => p.widthMm === rule.printWidthMm && p.heightMm === rule.printHeightMm);

  return (
    <div className="pp-panel-section">
      <div className="pp-panel-label">גודל הדפסה</div>
      <div className="pp-panel-info">
        {Math.round(rule.printWidthMm)}×{Math.round(rule.printHeightMm)} מ"מ
        {selectedPreset && <span className="pp-panel-badge">{selectedPreset.name}</span>}
      </div>
      <div className="pp-preset-grid-sm">
        {PRINT_SIZE_PRESETS.filter((p) => p.category === "photo").map((p) => (
          <button
            key={p.id}
            className={`pp-preset-sm${rule.printWidthMm === p.widthMm && rule.printHeightMm === p.heightMm ? " active" : ""}`}
            type="button"
            onClick={() => onPatch({ printWidthMm: p.widthMm, printHeightMm: p.heightMm, targetsPerPage: 0, passportPresetId: undefined, passportRequirementId: undefined, passportSizeMm: undefined, showPassportGuidelines: undefined, metadata: { ...rule.metadata, printPresetId: p.id } })}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="pp-panel-divider" />
      <div className="pp-panel-label">Passport / ID</div>
      <div className="pp-preset-grid-sm">
        {PRINT_SIZE_PRESETS.filter((p) => isPassportPrintPreset(p)).map((p) => (
          <button
            key={p.id}
            className={`pp-preset-sm${rule.passportPresetId === (p.passportPresetId ?? p.id) || (rule.printWidthMm === p.widthMm && rule.printHeightMm === p.heightMm && rule.passportRequirementId === p.passportRequirementId) ? " active" : ""}`}
            type="button"
            onClick={() => onPatch({
              printWidthMm: p.widthMm,
              printHeightMm: p.heightMm,
              targetsPerPage: 0,
              passportPresetId: p.passportPresetId ?? p.id,
              passportRequirementId: p.passportRequirementId,
              passportSizeMm: { width: p.widthMm, height: p.heightMm },
              showPassportGuidelines: true,
              metadata: { ...rule.metadata, printPresetId: p.id }
            })}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="pp-panel-divider" />
      <div className="pp-panel-label">פיצול חכם (כמה בדף)</div>
      <div className="pp-split-row">
        {[0, 1, 2, 4, 6, 8, 9].map((count) => (
          <button
            key={count}
            className={`pp-split-count-btn${rule.targetsPerPage === count ? " active" : ""}`}
            type="button"
            onClick={() => onPatch({ targetsPerPage: count })}
          >
            {count === 0 ? "אוטו" : `${count}`}
          </button>
        ))}
      </div>

      <div className="pp-panel-divider" />
      <div className="pp-panel-label">אוריינטציה</div>
      <div className="pp-toggle-row">
        {(["auto", "portrait", "landscape"] as const).map((policy) => (
          <button
            key={policy}
            className={`pp-toggle-btn${rule.orientationPolicy === policy ? " active" : ""}`}
            type="button"
            onClick={() => onPatch({ orientationPolicy: policy })}
          >
            {policy === "auto" ? "אוטו" : policy === "portrait" ? "לגובה" : "לרוחב"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Frame tab ────────────────────────────────────────────────────────────────

function FrameTab({ rule, onPatch }: { rule: PhotoPrintRule; onPatch: (p: Partial<PhotoPrintRule>) => void }): ReactElement {
  return (
    <div className="pp-panel-section">
      <div className="pp-panel-row">
        <label className="pp-panel-check">
          <input type="checkbox" checked={rule.frameBorderEnabled}
            onChange={(e) => onPatch({ frameBorderEnabled: e.target.checked })} />
          גבול לבן (מסגרת)
        </label>
      </div>
      {rule.frameBorderEnabled && (
        <div className="pp-panel-slider-row">
          <span>עובי</span>
          <input type="range" min={0} max={20} step={0.5} value={rule.frameBorderMm}
            onChange={(e) => onPatch({ frameBorderMm: parseFloat(e.target.value) })} />
          <span className="pp-panel-val">{rule.frameBorderMm} מ"מ</span>
        </div>
      )}

      <div className="pp-panel-divider" />
      <div className="pp-panel-row">
        <label className="pp-panel-check">
          <input type="checkbox" checked={rule.cutLineEnabled}
            onChange={(e) => onPatch({ cutLineEnabled: e.target.checked })} />
          קו חיתוך שחור
        </label>
      </div>
      {rule.cutLineEnabled && (
        <div className="pp-panel-slider-row">
          <span>עובי קו</span>
          <input type="range" min={1} max={6} step={1} value={rule.cutLineWidthPx}
            onChange={(e) => onPatch({ cutLineWidthPx: parseInt(e.target.value) })} />
          <span className="pp-panel-val">{rule.cutLineWidthPx}px</span>
        </div>
      )}

      <div className="pp-panel-divider" />
      <div className="pp-panel-row">
        <label className="pp-panel-check">
          <input type="checkbox" checked={rule.faceDetectionEnabled}
            onChange={(e) => onPatch({ faceDetectionEnabled: e.target.checked })} />
          זיהוי פנים
        </label>
      </div>
    </div>
  );
}

// ─── Margins tab ──────────────────────────────────────────────────────────────

function MarginsTab({ rule, onPatch }: { rule: PhotoPrintRule; onPatch: (p: Partial<PhotoPrintRule>) => void }): ReactElement {
  return (
    <div className="pp-panel-section">
      <div className="pp-panel-label">שוליים סביב הגיליון</div>
      <div className="pp-panel-slider-row">
        <span>שוליים</span>
        <input type="range" min={0} max={30} step={1} value={rule.sheetMarginsMm}
          onChange={(e) => onPatch({ sheetMarginsMm: parseInt(e.target.value) })} />
        <span className="pp-panel-val">{rule.sheetMarginsMm} מ"מ</span>
      </div>

      <div className="pp-panel-divider" />
      <div className="pp-panel-label">מרווח בין הדפסות</div>
      <div className="pp-panel-slider-row">
        <span>מרווח</span>
        <input type="range" min={0} max={10} step={0.5} value={rule.gapBetweenPrintsMm}
          onChange={(e) => onPatch({ gapBetweenPrintsMm: parseFloat(e.target.value) })} />
        <span className="pp-panel-val">{rule.gapBetweenPrintsMm} מ"מ</span>
      </div>
    </div>
  );
}

// ─── Layout tab ───────────────────────────────────────────────────────────────

function LayoutTab({ rule, onPatch }: { rule: PhotoPrintRule; onPatch: (p: Partial<PhotoPrintRule>) => void }): ReactElement {
  return (
    <div className="pp-panel-section">
      <div className="pp-panel-label">סידור על הדף</div>
      <div className="pp-panel-info">
        {rule.slotsPerRow}×{rule.slotsPerColumn} = {rule.slotsPerRow * rule.slotsPerColumn} בדף
      </div>

      <div className="pp-panel-row">
        <label className="pp-panel-check">
          <input type="checkbox" checked={rule.autoRotateOnSheet}
            onChange={(e) => onPatch({ autoRotateOnSheet: e.target.checked })} />
          סיבוב אוטומטי לחיסכון בנייר
        </label>
      </div>

      <div className="pp-panel-divider" />
      <div className="pp-panel-label">מצב מילוי</div>
      <div className="pp-toggle-row">
        {(["fill", "fit"] as const).map((mode) => (
          <button
            key={mode}
            className={`pp-toggle-btn${rule.fitMode === mode ? " active" : ""}`}
            type="button"
            onClick={() => onPatch({ fitMode: mode })}
          >
            {mode === "fill" ? "מלא (חיתוך)" : "התאמה"}
          </button>
        ))}
      </div>

      <div className="pp-panel-divider" />
      <div className="pp-panel-label">עותקים גלובלי</div>
      <div className="pp-panel-row">
        <input type="number" min={1} max={99} value={rule.globalCopies}
          onChange={(e) => onPatch({ globalCopies: Math.max(1, parseInt(e.target.value) || 1) })}
          style={{ width: 60, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-base)", color: "var(--text-primary)" }} />
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>עותקים לכל תמונה</span>
      </div>
    </div>
  );
}

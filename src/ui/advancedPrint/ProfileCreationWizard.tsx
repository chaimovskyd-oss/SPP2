import { ChevronLeft, ChevronRight, Settings2, X } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import { createDefaultProfile, newAdvancedPrintId } from "@/core/advancedPrint/builtInPresets";
import { suggestStarterProfiles } from "@/core/advancedPrint/capabilityDefaults";
import type {
  AdvancedPrinterProfile,
  ColorManagementMode,
  OutputUse,
  PrinterCapabilities
} from "@/types/advancedPrint";

interface ProfileCreationWizardProps {
  onCancel: () => void;
  onSave: (profile: AdvancedPrinterProfile) => void;
}

const USE_LABELS: Array<{ use: OutputUse; label: string }> = [
  { use: "photo", label: "תמונות" },
  { use: "office", label: "מסמכים" },
  { use: "canvas", label: "קנבס / פוסטר" },
  { use: "sublimation", label: "סובלימציה" },
  { use: "product", label: "מדבקות / מוצרים" },
  { use: "poster", label: "גליל רחב" }
];

const COLOR_LABELS: Array<{ mode: ColorManagementMode; label: string }> = [
  { mode: "printer-manages-color", label: "המדפסת מנהלת צבע" },
  { mode: "app-manages-color", label: "SPP מנהלת צבע (ICC)" },
  { mode: "none", label: "ללא ניהול צבע" }
];

/**
 * Guided profile creation: printer → usage → paper → borderless/tray → color → driver settings →
 * test page → save. Pre-fills from detected capabilities so a regular user does not need to
 * understand DEVMODE, tray ids, or rendering intents.
 */
export function ProfileCreationWizard({ onCancel, onSave }: ProfileCreationWizardProps): ReactElement {
  const [step, setStep] = useState(0);
  const [printers, setPrinters] = useState<string[]>([]);
  const [printer, setPrinter] = useState("");
  const [caps, setCaps] = useState<PrinterCapabilities | null>(null);
  const [use, setUse] = useState<OutputUse>("photo");
  const [paperName, setPaperName] = useState("A4");
  const [borderless, setBorderless] = useState(false);
  const [tray, setTray] = useState("ברירת מחדל של הדרייבר");
  const [colorMode, setColorMode] = useState<ColorManagementMode>("printer-manages-color");
  const [devmodeBase64, setDevmodeBase64] = useState<string | undefined>(undefined);
  const [name, setName] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await window.spp?.advancedPrint?.listPrinters();
      if (res?.printers?.length) {
        setPrinters(res.printers);
        setPrinter(res.printers[0]);
      }
    })();
  }, []);

  // Load capabilities when a printer is picked → drives smart defaults.
  useEffect(() => {
    if (!printer) return;
    void (async () => {
      try {
        const c = await window.spp?.advancedPrint?.getCapabilities(printer);
        if (c) {
          setCaps(c as PrinterCapabilities);
          if (c.paperSizes?.length) setPaperName(c.paperSizes[0].name || "A4");
          if (c.sources?.length) setTray(c.sources[0]);
          // Adopt the first suggested starter profile's hints.
          const suggestion = suggestStarterProfiles(c as PrinterCapabilities)[0];
          if (suggestion?.profile.color?.mode) setColorMode(suggestion.profile.color.mode);
          if (suggestion?.profile.borderless?.status === "requested-not-verified") setBorderless(true);
          setName(`${printer} — ${USE_LABELS.find((u) => u.use === use)?.label ?? ""}`);
        }
      } catch {
        /* worker unavailable — user fills manually */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printer]);

  const openDriver = async (): Promise<void> => {
    const res = await window.spp?.advancedPrint?.openDriverDialog(printer);
    if (res && !res.cancelled && res.devmodeBase64) setDevmodeBase64(res.devmodeBase64);
  };

  const buildProfile = (): AdvancedPrinterProfile => {
    const base = createDefaultProfile(printer, name || printer);
    const paper = caps?.paperSizes.find((p) => p.name === paperName);
    return {
      ...base,
      id: newAdvancedPrintId("profile"),
      printerClass: caps ? undefined : base.printerClass,
      printerPaper: paper
        ? { name: paper.name, widthMm: paper.widthMm, heightMm: paper.heightMm, custom: paper.custom }
        : base.printerPaper,
      traySource: { label: tray, verified: false },
      borderless: { status: borderless ? "requested-not-verified" : "not-requested" },
      bleedMm: borderless ? 1.5 : 0,
      color: { ...base.color, mode: colorMode },
      devmode: devmodeBase64
        ? { base64: devmodeBase64, capturedForPrinter: printer, capturedAt: new Date().toISOString() }
        : {},
      engine: devmodeBase64 ? "windows-native" : base.engine
    };
  };

  const steps = ["מדפסת", "שימוש", "נייר", "שוליים/מגש", "צבע", "דרייבר", "שמירה"];
  const canNext = step === 0 ? Boolean(printer) : true;

  return (
    <div className="ape-overlay">
      <div className="ape-wizard">
        <div className="ape-dialog-head">
          <h3>אשף יצירת פרופיל הדפסה</h3>
          <button className="ape-icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>

        <div className="ape-wizard-steps">
          {steps.map((s, i) => (
            <span key={s} className={`ape-wizard-chip ${i === step ? "active" : i < step ? "done" : ""}`}>{s}</span>
          ))}
        </div>

        <div className="ape-wizard-body">
          {step === 0 && (
            <div className="ape-row-col">
              <label className="ape-label">בחר מדפסת</label>
              <select className="ape-select" value={printer} onChange={(e) => setPrinter(e.target.value)}>
                {printers.length === 0 && <option value="">לא נמצאו מדפסות</option>}
                {printers.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {caps && (
                <div className="ape-caps-hint">
                  זוהו {caps.paperSizes.length} גדלים, {caps.sources.length} מקורות
                  {caps.isWideFormat ? " · מדפסת רחבה" : ""}{caps.isRoll ? " · גליל" : ""}
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="ape-chip-grid">
              {USE_LABELS.map(({ use: u, label }) => (
                <button key={u} className={`ape-chip-btn ${use === u ? "active" : ""}`} onClick={() => setUse(u)}>{label}</button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="ape-row-col">
              <label className="ape-label">גודל נייר</label>
              <select className="ape-select" value={paperName} onChange={(e) => setPaperName(e.target.value)}>
                {(caps?.paperSizes ?? [{ name: "A4", widthMm: 210, heightMm: 297, custom: false }]).map((p) => (
                  <option key={p.name} value={p.name}>{p.name} ({Math.round(p.widthMm)}×{Math.round(p.heightMm)} מ"מ)</option>
                ))}
              </select>
            </div>
          )}

          {step === 3 && (
            <div className="ape-row-col">
              <label className="ape-check">
                <input type="checkbox" checked={borderless} onChange={(e) => setBorderless(e.target.checked)} />
                הדפסה ללא שוליים (תאומת בדף בדיקה)
              </label>
              <label className="ape-label">מקור נייר / מגש</label>
              <select className="ape-select" value={tray} onChange={(e) => setTray(e.target.value)}>
                {(caps?.sources ?? ["ברירת מחדל של הדרייבר"]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {step === 4 && (
            <div className="ape-chip-grid">
              {COLOR_LABELS.map(({ mode, label }) => (
                <button key={mode} className={`ape-chip-btn ${colorMode === mode ? "active" : ""}`} onClick={() => setColorMode(mode)}>{label}</button>
              ))}
            </div>
          )}

          {step === 5 && (
            <div className="ape-row-col">
              <p className="ape-help">פתח את הגדרות הדרייבר כדי לקבע מגש/ללא שוליים/סוג נייר. ההגדרות יישמרו בפרופיל.</p>
              <button className="ape-btn" onClick={openDriver}><Settings2 size={15} /> פתח הגדרות מדפסת</button>
              {devmodeBase64 && <div className="ape-caps-hint">הגדרות הדרייבר נשמרו ✓</div>}
            </div>
          )}

          {step === 6 && (
            <div className="ape-row-col">
              <label className="ape-label">שם הפרופיל</label>
              <input className="ape-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={printer} />
            </div>
          )}
        </div>

        <div className="ape-dialog-foot">
          <button className="ape-btn ghost" onClick={onCancel}>ביטול</button>
          <div className="ape-foot-nav">
            {step > 0 && <button className="ape-btn" onClick={() => setStep(step - 1)}><ChevronRight size={15} /> הקודם</button>}
            {step < steps.length - 1 ? (
              <button className="ape-btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>הבא <ChevronLeft size={15} /></button>
            ) : (
              <button className="ape-btn primary" disabled={!printer} onClick={() => onSave(buildProfile())}>שמור פרופיל</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

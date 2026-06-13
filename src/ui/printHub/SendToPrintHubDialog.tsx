import { AlertTriangle, Send, X } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import { availableOptionsFromProfiles, resolvePreset } from "@/core/printHub/resolveProfile";
import { SIZE_KEYS, SIZE_LABELS } from "@/core/printHub/sizes";
import { lanConfigFromSettings, testLanConnection, type LanUploadProgress } from "@/services/lan/lanQueueClient";
import { useAppSettings } from "@/settings/store";
import type { BorderMode, PrintFinish, PrinterProfile } from "@/types/printHub";
import "./printHub.css";

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

export interface SendToPrintHubOptions {
  size: string;
  finish: PrintFinish;
  borderMode: BorderMode;
  copies: number;
  customerName: string;
  customerPhone: string;
  note: string;
  approvalMode: "auto" | "require_approval";
  includeSummary: boolean;
  testPrintFirstOnly: boolean;
}

interface SendToPrintHubDialogProps {
  defaultSize?: string;
  defaultApprovalMode: "auto" | "require_approval";
  customerName?: string;
  customerPhone?: string;
  pageCount: number;
  busy: boolean;
  hubConfigured: boolean;
  /** Live upload progress while sending over LAN (null when not uploading). */
  uploadProgress?: LanUploadProgress | null;
  onCancel: () => void;
  onConfirm: (options: SendToPrintHubOptions) => void;
}

const ALL_SIZES: string[] = SIZE_KEYS;
const ALL_FINISHES: PrintFinish[] = ["glossy", "matte"];
const ALL_BORDERS: BorderMode[] = ["borderless", "white_border"];
const FINISH_LABEL: Record<PrintFinish, string> = { glossy: "מבריק", matte: "מאט" };
const BORDER_LABEL: Record<BorderMode, string> = { borderless: "ללא שוליים", white_border: "שוליים לבנים" };

export function SendToPrintHubDialog({
  defaultSize = "10x15",
  defaultApprovalMode,
  customerName = "",
  customerPhone = "",
  pageCount,
  busy,
  hubConfigured,
  uploadProgress,
  onCancel,
  onConfirm
}: SendToPrintHubDialogProps): ReactElement {
  const [size, setSize] = useState(defaultSize);
  const [finish, setFinish] = useState<PrintFinish>("glossy");
  const [borderMode, setBorderMode] = useState<BorderMode>("borderless");
  const [copies, setCopies] = useState(1);
  const [name, setName] = useState(customerName);
  const [phone, setPhone] = useState(customerPhone);
  const [note, setNote] = useState("");
  const [approvalMode, setApprovalMode] = useState(defaultApprovalMode);
  const [includeSummary, setIncludeSummary] = useState(false);
  const [testPrint, setTestPrint] = useState(false);

  // LAN transport: show a live connection light so the user knows the Hub is reachable before sending.
  const printHubCfg = useAppSettings((s) => s.settings.printHub);
  const lanCfg = lanConfigFromSettings(printHubCfg);
  const [lanStatus, setLanStatus] = useState<{ state: "checking" | "ok" | "down"; hubName?: string } | null>(null);
  useEffect(() => {
    if (!lanCfg) { setLanStatus(null); return; }
    let cancelled = false;
    const check = async (): Promise<void> => {
      setLanStatus((s) => (s ? s : { state: "checking" }));
      const h = await testLanConnection(lanCfg);
      if (!cancelled) setLanStatus(h.ok ? { state: "ok", hubName: h.hubName } : { state: "down" });
    };
    void check();
    const id = setInterval(() => void check(), 6000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanCfg?.host, lanCfg?.port, lanCfg?.token]);

  // Sync options from the print server's shared config so we offer exactly what it can produce.
  const hubRoot = useAppSettings((s) => s.settings.printHub.serverHubRoot || s.settings.printHub.networkFolderPath);
  const [sizes, setSizes] = useState<string[]>(ALL_SIZES);
  const [finishes, setFinishes] = useState<PrintFinish[]>(ALL_FINISHES);
  const [borders, setBorders] = useState<BorderMode[]>(ALL_BORDERS);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!hubRoot) return;
      const res = await window.spp?.printHub?.loadProfiles?.(hubRoot);
      if (cancelled || !res?.success || !res.profiles || res.profiles.length === 0) return;
      setProfiles(res.profiles);
      const opts = availableOptionsFromProfiles(res.profiles);
      if (opts.sizes.length > 0) { setSizes(opts.sizes); if (!opts.sizes.includes(size)) setSize(opts.sizes[0]); }
      if (opts.finishes.length > 0) { setFinishes(opts.finishes); if (!opts.finishes.includes(finish)) setFinish(opts.finishes[0]); }
      if (opts.borderModes.length > 0) { setBorders(opts.borderModes); if (!opts.borderModes.includes(borderMode)) setBorderMode(opts.borderModes[0]); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubRoot]);

  const resolved = resolvePreset(profiles, { size, finish, borderMode });
  const selectedPreset = resolved?.preset;
  const presetLabel = selectedPreset
    ? `${Math.round(selectedPreset.widthMm)}x${Math.round(selectedPreset.heightMm)} mm @ ${selectedPreset.dpi} DPI`
    : SIZE_LABELS[size] ?? size;
  const bleedLabel = selectedPreset
    ? `${selectedPreset.bleedMm} mm`
    : (borderMode === "borderless" ? "1.5 mm" : "0 mm");
  const printedUnits = pageCount * copies;

  return (
    <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="util-panel print-hub-send" role="dialog" aria-label="שליחה להדפסה מרוחקת" dir="rtl">
        <div className="util-panel-header">
          <div className="print-hub-title">
            <Send size={16} /><span>שליחה להדפסה מרוחקת</span>
            {lanStatus && (
              <span className={`lan-light lan-light-${lanStatus.state}`} title={
                lanStatus.state === "ok" ? `מחובר ל-${lanStatus.hubName ?? "Print Hub"}`
                  : lanStatus.state === "down" ? "אין חיבור ל-Print Hub"
                  : "בודק חיבור…"
              }>
                <span className="lan-dot" />
                {lanStatus.state === "ok" ? (lanStatus.hubName ?? "מחובר") : lanStatus.state === "down" ? "לא מחובר" : "בודק…"}
              </span>
            )}
          </div>
          <button className="icon-btn" onClick={onCancel} type="button" disabled={busy}><X size={14} /></button>
        </div>
        <div className="util-panel-body print-hub-send-body">
          {!hubConfigured && (
            <div className="print-hub-error">הגדר תחילה את תיקיית התור בכלי "מרכז הדפסות" ← הגדרות.</div>
          )}
          <p className="print-hub-hint">{pageCount} עמודים יישלחו כעבודת הדפסה לשרת. אין צורך בדרייבר בתחנה זו.</p>

          <div className="print-hub-send-grid">
            <label className="print-hub-field">
              <span>גודל</span>
              <select value={size} onChange={(e) => setSize(e.target.value)}>
                {sizes.map((s) => <option key={s} value={s}>{SIZE_LABELS[s] ?? s}</option>)}
              </select>
            </label>
            <label className="print-hub-field">
              <span>גימור</span>
              <select value={finish} onChange={(e) => setFinish(e.target.value as PrintFinish)}>
                {finishes.map((f) => <option key={f} value={f}>{FINISH_LABEL[f]}</option>)}
              </select>
            </label>
            <label className="print-hub-field">
              <span>שוליים</span>
              <select value={borderMode} onChange={(e) => setBorderMode(e.target.value as BorderMode)}>
                {borders.map((b) => <option key={b} value={b}>{BORDER_LABEL[b]}</option>)}
              </select>
            </label>
            <label className="print-hub-field">
              <span>עותקים: {copies}</span>
              <input type="range" min={1} max={20} value={copies} onChange={(e) => setCopies(Number(e.target.value))} />
            </label>
          </div>

          <div className="print-hub-send-grid">
            <label className="print-hub-field">
              <span>שם לקוח</span>
              <input dir="rtl" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="print-hub-field">
              <span>טלפון</span>
              <input dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>

          <label className="print-hub-field">
            <span>הערה לעבודה</span>
            <input dir="rtl" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div className="print-hub-preflight" aria-label="סיכום לפני שליחה">
            <div className="print-hub-preflight-title">סיכום לפני שליחה</div>
            <div className="print-hub-preflight-grid">
              <span>מדפסת יעד</span><strong>{resolved?.profile.displayName ?? "לא נמצאה התאמה עדיין"}</strong>
              <span>דרייבר Windows</span><strong>{resolved?.profile.windowsPrinterName || "לא מוגדר"}</strong>
              <span>גודל בפועל</span><strong dir="ltr">{presetLabel}</strong>
              <span>שוליים / bleed</span><strong>{BORDER_LABEL[borderMode]} · {bleedLabel}</strong>
              <span>כמות</span><strong>{pageCount} קבצים x {copies} = {printedUnits} הדפסות</strong>
            </div>
            <div className="print-hub-preflight-warning">
              <AlertTriangle size={14} />
              <span>האפליקציה שולטת ברינדור, גודל דף ושוליים. מקור נייר/BYPASS, tray, מצב גליל והגדרות borderless אמיתיות עדיין נקבעים בדרייבר או בפרופיל המדפסת.</span>
            </div>
          </div>

          <label className="print-hub-field">
            <span>אופן שליחה</span>
            <select value={approvalMode} onChange={(e) => setApprovalMode(e.target.value as typeof approvalMode)}>
              <option value="require_approval">שלח לאישור מנהל</option>
              <option value="auto">הדפס אוטומטית (אם התחנה מורשית)</option>
            </select>
            <span className="print-hub-hint">
              הדפסה אוטומטית מתבצעת רק אם תחנה זו מסומנת "מורשית" בשרת. אחרת — העבודה תמתין לאישור מנהל.
            </span>
          </label>

          <label className="print-hub-check">
            <input type="checkbox" checked={includeSummary} onChange={(e) => setIncludeSummary(e.target.checked)} />
            <span>צרף פתק סיכום הזמנה (עם QR)</span>
          </label>

          <label className="print-hub-check">
            <input type="checkbox" checked={testPrint} onChange={(e) => setTestPrint(e.target.checked)} />
            <span>הדפסת בדיקה — תמונה ראשונה בלבד</span>
          </label>
        </div>
        {uploadProgress && uploadProgress.phase !== "error" && (
          <div className="print-hub-upload" dir="rtl">
            {uploadProgress.phase === "connecting" && <span>מתחבר ל-Print Hub…</span>}
            {uploadProgress.phase === "uploading" && (
              <span>שולח {uploadProgress.imagesSent} מתוך {uploadProgress.imagesTotal} תמונות · {formatMb(uploadProgress.loadedBytes)} / {formatMb(uploadProgress.totalBytes)}</span>
            )}
            {uploadProgress.phase === "finalizing" && <span>מסיים שליחה…</span>}
            {uploadProgress.phase === "success" && <span>העבודה נשלחה בהצלחה ✓</span>}
            {uploadProgress.phase !== "success" && (
              <div className="print-hub-upload-bar">
                <div className="print-hub-upload-fill" style={{ width: `${uploadProgress.totalBytes > 0 ? Math.min(100, Math.round((uploadProgress.loadedBytes / uploadProgress.totalBytes) * 100)) : 0}%` }} />
              </div>
            )}
          </div>
        )}
        <div className="print-hub-send-footer">
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={busy}>ביטול</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !hubConfigured}
            onClick={() => onConfirm({ size, finish, borderMode, copies, customerName: name, customerPhone: phone, note, approvalMode, includeSummary, testPrintFirstOnly: testPrint })}
          >
            <Send size={14} /> {busy ? "שולח…" : "אשר ושלח לתור"}
          </button>
        </div>
      </div>
    </div>
  );
}

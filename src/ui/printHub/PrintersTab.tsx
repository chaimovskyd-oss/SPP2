import { AlertTriangle, CheckCircle2, Plus, Printer, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

import { makeBlankProfile, makePreset, DEFAULT_PROFILES } from "@/core/printHub/defaultProfiles";
import { resolvePreset, sizeKey } from "@/core/printHub/resolveProfile";
import { SIZE_KEYS, SIZE_LABELS, SIZE_MM } from "@/core/printHub/sizes";
import { useAppSettings } from "@/settings/store";
import type { BorderMode, PrintFinish, PrinterProfile, PrintPreset } from "@/types/printHub";

const SIZES = SIZE_KEYS;

// Common shop combinations the system should be able to route automatically.
const COMMON_COMBOS: Array<{ size: string; finish: PrintFinish; borderMode: BorderMode; label: string }> = [
  { size: "10x15", finish: "glossy", borderMode: "borderless", label: "10×15 מבריק ללא שוליים" },
  { size: "10x15", finish: "matte", borderMode: "borderless", label: "10×15 מאט ללא שוליים" },
  { size: "15x20", finish: "glossy", borderMode: "borderless", label: "15×20 מבריק ללא שוליים" }
];

interface WinPrinter {
  name: string;
  displayName: string;
  isDefault: boolean;
}

interface DriverPaper {
  name: string;
  widthMm: number;
  heightMm: number;
}

export function PrintersTab(): ReactElement {
  const hubRoot = useAppSettings((s) => s.settings.printHub.serverHubRoot || s.settings.printHub.networkFolderPath);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [winPrinters, setWinPrinters] = useState<WinPrinter[]>([]);
  const [papersByDevice, setPapersByDevice] = useState<Record<string, DriverPaper[]>>({});
  const [loadingPapers, setLoadingPapers] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const api = window.spp?.printHub;
    if (api === undefined) {
      setMessage("ניהול המדפסות זמין רק בהרצה דרך התוכנה המותקנת.");
      return;
    }
    const printersRes = await api.getPrinters?.();
    setWinPrinters(printersRes?.printers ?? []);
    if (hubRoot) {
      const res = await api.loadProfiles?.(hubRoot);
      setProfiles(res?.profiles ?? deepCopy(DEFAULT_PROFILES));
    } else {
      setProfiles(deepCopy(DEFAULT_PROFILES));
    }
    setLoaded(true);
    setDirty(false);
  }, [hubRoot]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!dirty || !hubRoot) return;
    const id = setTimeout(() => void save(), 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, profiles, hubRoot]);

  function update(next: PrinterProfile[]): void {
    setProfiles(next);
    setDirty(true);
  }

  function addPrinter(): void {
    update([...profiles, makeBlankProfile(`printer_${rand()}`)]);
  }
  function removePrinter(deviceId: string): void {
    update(profiles.filter((p) => p.deviceId !== deviceId));
  }
  function patchPrinter(deviceId: string, patch: Partial<PrinterProfile>): void {
    update(profiles.map((p) => (p.deviceId === deviceId ? { ...p, ...patch } : p)));
  }
  function addPreset(deviceId: string): void {
    patchPresets(deviceId, (presets) => [...presets, makePreset(`preset_${rand()}`, "10×15 מבריק ללא שוליים", "10x15", "glossy", "borderless")]);
  }
  function removePreset(deviceId: string, presetId: string): void {
    patchPresets(deviceId, (presets) => presets.filter((p) => p.id !== presetId));
  }
  function patchPreset(deviceId: string, presetId: string, patch: Partial<PrintPreset>): void {
    patchPresets(deviceId, (presets) => presets.map((p) => (p.id === presetId ? applyPresetPatch(p, patch) : p)));
  }
  function patchPresets(deviceId: string, fn: (presets: PrintPreset[]) => PrintPreset[]): void {
    update(profiles.map((p) => (p.deviceId === deviceId ? { ...p, presets: fn(p.presets) } : p)));
  }

  async function loadPapers(deviceId: string, printerName: string): Promise<void> {
    if (!printerName) { setMessage("בחר תחילה מדפסת Windows."); return; }
    setLoadingPapers(deviceId);
    const res = await window.spp?.printHub?.getPrinterPapers?.(printerName);
    setLoadingPapers(null);
    const papers = res?.papers ?? [];
    setPapersByDevice((m) => ({ ...m, [deviceId]: papers }));
    if (papers.length === 0) setMessage("לא התקבלו מידות מהמדפסת (זמין רק במחשב עם המדפסת מותקנת).");
  }

  function addPaperAsPreset(deviceId: string, paper: DriverPaper): void {
    patchPresets(deviceId, (presets) => [...presets, {
      id: `preset_${rand()}`,
      name: `${paper.name} (${Math.round(paper.widthMm)}×${Math.round(paper.heightMm)} מ״מ)`,
      widthMm: paper.widthMm,
      heightMm: paper.heightMm,
      dpi: 300,
      bleedMm: 1.5,
      finish: "glossy",
      borderMode: "borderless",
      secondsPerPrint: 12,
      copies: 1
    }]);
  }

  async function save(): Promise<void> {
    if (!hubRoot) {
      setMessage("הגדר תחילה תיקיית שרת בלשונית ההגדרות.");
      return;
    }
    // Keep supported lists in sync with the presets so routing stays consistent.
    const normalized = profiles.map((p) => ({
      ...p,
      supportedSizes: unique(p.presets.map(presetSizeKey)),
      supportedFinishes: unique(p.presets.map((x) => x.finish)) as PrintFinish[]
    }));
    const res = await window.spp?.printHub?.saveProfiles?.({ hubRoot, profiles: normalized });
    if (res?.success) {
      setDirty(false);
      setMessage("המדפסות נשמרו.");
    } else {
      setMessage(`השמירה נכשלה: ${res?.error ?? "שגיאה לא ידועה"}`);
    }
  }

  const coverage = useMemo(
    () => COMMON_COMBOS.map((c) => ({ ...c, covered: resolvePreset(profiles, c) !== null })),
    [profiles]
  );

  if (!loaded) return <div className="print-hub-hint">טוען מדפסות…</div>;

  return (
    <div className="print-hub-printers">
      {message && <div className="print-hub-error">{message}</div>}

      <div className="print-hub-coverage">
        <div className="print-hub-coverage-title">בדיקת התאמה — האם עבודות נפוצות ימצאו מדפסת:</div>
        {coverage.map((c) => (
          <div key={c.label} className={`print-hub-coverage-row ${c.covered ? "ok" : "bad"}`}>
            {c.covered ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>{c.label}</span>
            <span className="print-hub-coverage-status">{c.covered ? "מכוסה" : "חסר פריסט"}</span>
          </div>
        ))}
      </div>

      {profiles.map((profile) => (
        <div key={profile.deviceId} className="print-hub-printer-card">
          <div className="print-hub-printer-head">
            <Printer size={15} />
            <input
              className="print-hub-printer-name"
              dir="rtl"
              value={profile.displayName}
              onChange={(e) => patchPrinter(profile.deviceId, { displayName: e.target.value })}
              placeholder="שם המדפסת (לתצוגה)"
            />
            <button className="btn btn-ghost bad" type="button" onClick={() => removePrinter(profile.deviceId)} title="הסר מדפסת">
              <Trash2 size={14} />
            </button>
          </div>

          <label className="print-hub-field">
            <span>מדפסת Windows מותקנת</span>
            <select
              value={profile.windowsPrinterName}
              onChange={(e) => patchPrinter(profile.deviceId, { windowsPrinterName: e.target.value })}
            >
              <option value="">— בחר מדפסת —</option>
              {winPrinters.map((wp) => (
                <option key={wp.name} value={wp.name}>{wp.displayName}{wp.isDefault ? " (ברירת מחדל)" : ""}</option>
              ))}
              {profile.windowsPrinterName && !winPrinters.some((wp) => wp.name === profile.windowsPrinterName) && (
                <option value={profile.windowsPrinterName}>{profile.windowsPrinterName} (לא מחוברת כעת)</option>
              )}
            </select>
          </label>

          <div className="print-hub-paper-load">
            <button className="btn btn-ghost" type="button" disabled={loadingPapers === profile.deviceId} onClick={() => void loadPapers(profile.deviceId, profile.windowsPrinterName)}>
              {loadingPapers === profile.deviceId ? "טוען…" : "טען מידות מהמדפסת"}
            </button>
            {(papersByDevice[profile.deviceId]?.length ?? 0) > 0 && (
              <div className="print-hub-paper-chips">
                {papersByDevice[profile.deviceId].map((paper, idx) => (
                  <button key={`${paper.name}-${idx}`} className="print-hub-paper-chip" type="button" title="הוסף כפריסט" onClick={() => addPaperAsPreset(profile.deviceId, paper)}>
                    <Plus size={11} /> {paper.name} · {Math.round(paper.widthMm)}×{Math.round(paper.heightMm)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="print-hub-presets-title">פריסטים (גודל · גימור · שוליים):</div>
          {profile.presets.length === 0 && <div className="print-hub-hint">אין פריסטים. הוסף פריסט כדי שניתן יהיה לנתב עבודות למדפסת זו.</div>}
          {profile.presets.map((ps) => (
            <div key={ps.id} className="print-hub-preset-row">
              <select value={presetSizeKey(ps)} onChange={(e) => patchPreset(profile.deviceId, ps.id, { ...sizeToDims(e.target.value) } as Partial<PrintPreset>)}>
                {SIZES.map((s) => <option key={s} value={s}>{SIZE_LABELS[s] ?? s}</option>)}
              </select>
              <select value={ps.finish} onChange={(e) => patchPreset(profile.deviceId, ps.id, { finish: e.target.value as PrintFinish })}>
                <option value="glossy">מבריק</option>
                <option value="matte">מאט</option>
              </select>
              <select value={ps.borderMode} onChange={(e) => patchPreset(profile.deviceId, ps.id, { borderMode: e.target.value as BorderMode })}>
                <option value="borderless">ללא שוליים</option>
                <option value="white_border">שוליים לבנים</option>
              </select>
              <label className="print-hub-dpi">DPI
                <input type="number" min={150} max={600} value={ps.dpi} onChange={(e) => patchPreset(profile.deviceId, ps.id, { dpi: Number(e.target.value) })} />
              </label>
              <label className="print-hub-dpi">שניות לתמונה
                <input type="number" min={1} max={120} value={ps.secondsPerPrint ?? 12} onChange={(e) => patchPreset(profile.deviceId, ps.id, { secondsPerPrint: Number(e.target.value) })} />
              </label>
              <button className="btn btn-ghost bad" type="button" onClick={() => removePreset(profile.deviceId, ps.id)} title="הסר פריסט"><Trash2 size={13} /></button>
            </div>
          ))}
          <button className="btn btn-ghost" type="button" onClick={() => addPreset(profile.deviceId)}><Plus size={13} /> הוסף פריסט</button>
        </div>
      ))}

      <div className="print-hub-printers-actions">
        <button className="btn btn-ghost" type="button" onClick={addPrinter}><Plus size={14} /> הוסף מדפסת</button>
        <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={!dirty}>
          <Save size={14} /> {dirty ? "שמור שינויים" : "נשמר"}
        </button>
      </div>
    </div>
  );
}

// ── helpers ──
function rand(): string {
  return Math.random().toString(36).slice(2, 8);
}
function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
function sizeToDims(size: string): { widthMm: number; heightMm: number } {
  return SIZE_MM[size] ?? SIZE_MM["10x15"];
}
function presetSizeKey(p: PrintPreset): string {
  return sizeKey(p);
}
// Recompute bleed when borderMode changes; keep a sensible default.
function applyPresetPatch(p: PrintPreset, patch: Partial<PrintPreset>): PrintPreset {
  const next = { ...p, ...patch };
  if (patch.borderMode !== undefined) {
    next.bleedMm = patch.borderMode === "borderless" ? Math.max(1.5, p.bleedMm) : 0;
  }
  return next;
}

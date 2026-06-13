import { Layers, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

import { useAppSettings } from "@/settings/store";
import type { MediaItem, PrinterProfile } from "@/types/printHub";

export function MediaTab(): ReactElement {
  const hubRoot = useAppSettings((s) => s.settings.printHub.serverHubRoot || s.settings.printHub.networkFolderPath);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const api = window.spp?.printHub;
    if (api?.loadMedia === undefined) { setMessage("ניהול זמין רק בתוכנה המותקנת."); return; }
    if (hubRoot) {
      const [mediaRes, profRes] = await Promise.all([api.loadMedia(hubRoot), api.loadProfiles?.(hubRoot)]);
      setItems(mediaRes?.items ?? []);
      setProfiles(profRes?.profiles ?? []);
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
  }, [dirty, items, hubRoot]);

  // preset id -> readable label
  const presetLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles) for (const ps of p.presets) map.set(ps.id, `${p.displayName} · ${ps.name}`);
    return map;
  }, [profiles]);

  const addablePresets = useMemo(() => {
    const tracked = new Set(items.map((i) => i.presetId));
    const out: Array<{ id: string; label: string }> = [];
    for (const p of profiles) for (const ps of p.presets) if (!tracked.has(ps.id)) out.push({ id: ps.id, label: `${p.displayName} · ${ps.name}` });
    return out;
  }, [profiles, items]);

  function update(next: MediaItem[]): void { setItems(next); setDirty(true); }
  function addPreset(presetId: string): void {
    if (!presetId) return;
    update([...items, { presetId, remainingUnits: 0, unitType: presetLabel.get(presetId) ?? presetId }]);
  }
  function patch(presetId: string, remainingUnits: number): void {
    update(items.map((i) => (i.presetId === presetId ? { ...i, remainingUnits: Math.max(0, remainingUnits) } : i)));
  }
  function remove(presetId: string): void { update(items.filter((i) => i.presetId !== presetId)); }

  async function save(): Promise<void> {
    if (!hubRoot) { setMessage("הגדר תחילה תיקיית שרת בלשונית ההגדרות."); return; }
    const res = await window.spp?.printHub?.saveMedia?.({ hubRoot, items });
    if (res?.success) { setDirty(false); setMessage("המלאי נשמר."); }
    else setMessage(`השמירה נכשלה: ${res?.error ?? "שגיאה"}`);
  }

  if (!loaded) return <div className="print-hub-hint">טוען מלאי…</div>;

  return (
    <div className="print-hub-printers">
      {message && <div className="print-hub-error">{message}</div>}
      <p className="print-hub-hint">
        ספירת מלאי לעדכון ידני (כמה תמונות נותרו בכל ריבון/נייר). המערכת מתריעה לפני שעבודה חורגת מהמלאי הזמין.
      </p>

      {items.length === 0 && <div className="print-hub-empty">אין מעקב מלאי. הוסף פריסט כדי לעקוב אחרי כמות נותרת.</div>}

      {items.map((item) => (
        <div key={item.presetId} className="print-hub-media-row">
          <div className="print-hub-media-name"><Layers size={14} /> {presetLabel.get(item.presetId) ?? item.presetId}</div>
          <label className="print-hub-dpi">נותרו
            <input type="number" min={0} value={item.remainingUnits} onChange={(e) => patch(item.presetId, Number(e.target.value))} />
          </label>
          <span className="print-hub-media-unit">תמונות</span>
          <button className="btn btn-ghost bad" type="button" onClick={() => remove(item.presetId)} title="הסר"><Trash2 size={13} /></button>
        </div>
      ))}

      {addablePresets.length > 0 && (
        <label className="print-hub-field">
          <span>הוסף מעקב לפריסט</span>
          <select value="" onChange={(e) => addPreset(e.target.value)}>
            <option value="">— בחר פריסט —</option>
            {addablePresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      )}

      <div className="print-hub-printers-actions">
        <span className="print-hub-count">{addablePresets.length === 0 && profiles.length === 0 ? "הגדר מדפסות תחילה" : ""}</span>
        <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={!dirty}>
          <Save size={14} /> {dirty ? "שמור" : "נשמר"}
        </button>
      </div>
    </div>
  );
}

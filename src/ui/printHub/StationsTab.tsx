import { Plus, Save, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState, type ReactElement } from "react";

import { useAppSettings } from "@/settings/store";
import type { Station, StationRole } from "@/types/printHub";

const ROLE_LABELS: Record<StationRole, string> = {
  designer: "עיצוב",
  operator: "מפעיל",
  admin: "מנהל",
  trusted: "מהימנה"
};

export function StationsTab(): ReactElement {
  const hubRoot = useAppSettings((s) => s.settings.printHub.serverHubRoot || s.settings.printHub.networkFolderPath);
  const [stations, setStations] = useState<Station[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const api = window.spp?.printHub;
    if (api?.loadStations === undefined) { setMessage("ניהול זמין רק בתוכנה המותקנת."); return; }
    if (hubRoot) {
      const res = await api.loadStations(hubRoot);
      setStations(res?.stations ?? []);
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
  }, [dirty, stations, hubRoot]);

  function update(next: Station[]): void { setStations(next); setDirty(true); }
  function add(): void {
    update([...stations, { computerName: "", displayName: "תחנה חדשה", role: "designer", trusted: false }]);
  }
  function patch(index: number, p: Partial<Station>): void {
    update(stations.map((s, i) => (i === index ? { ...s, ...p } : s)));
  }
  function remove(index: number): void { update(stations.filter((_, i) => i !== index)); }

  async function save(): Promise<void> {
    if (!hubRoot) { setMessage("הגדר תחילה תיקיית שרת בלשונית ההגדרות."); return; }
    const res = await window.spp?.printHub?.saveStations?.({ hubRoot, stations });
    if (res?.success) { setDirty(false); setMessage("התחנות נשמרו."); }
    else setMessage(`השמירה נכשלה: ${res?.error ?? "שגיאה"}`);
  }

  if (!loaded) return <div className="print-hub-hint">טוען תחנות…</div>;

  return (
    <div className="print-hub-printers">
      {message && <div className="print-hub-error">{message}</div>}
      <p className="print-hub-hint">
        תחנות מורשות שנשלחות במצב "הדפס אוטומטית" — מודפסות מיד. כל שאר התחנות (או שליחה במצב "אישור") ממתינות לאישור מנהל.
      </p>

      {stations.length === 0 && <div className="print-hub-empty">אין תחנות מוגדרות. עבודות מכל מחשב יידרשו אישור.</div>}

      {stations.map((st, i) => (
        <div key={i} className="print-hub-printer-card">
          <div className="print-hub-printer-head">
            <Users size={15} />
            <input className="print-hub-printer-name" dir="rtl" value={st.displayName} placeholder="שם התחנה (לתצוגה)" onChange={(e) => patch(i, { displayName: e.target.value })} />
            <button className="btn btn-ghost bad" type="button" onClick={() => remove(i)} title="הסר"><Trash2 size={14} /></button>
          </div>
          <div className="print-hub-send-grid">
            <label className="print-hub-field">
              <span>שם המחשב (Computer Name)</span>
              <input dir="ltr" type="text" placeholder="DESK-2" value={st.computerName} onChange={(e) => patch(i, { computerName: e.target.value })} />
            </label>
            <label className="print-hub-field">
              <span>תפקיד</span>
              <select value={st.role} onChange={(e) => patch(i, { role: e.target.value as StationRole })}>
                <option value="designer">{ROLE_LABELS.designer}</option>
                <option value="operator">{ROLE_LABELS.operator}</option>
                <option value="admin">{ROLE_LABELS.admin}</option>
              </select>
            </label>
          </div>
          <label className="print-hub-check">
            <input type="checkbox" checked={st.trusted} onChange={(e) => patch(i, { trusted: e.target.checked })} />
            <span>תחנה מורשית — מותר להדפיס אוטומטית בלי אישור מנהל</span>
          </label>
        </div>
      ))}

      <div className="print-hub-printers-actions">
        <button className="btn btn-ghost" type="button" onClick={add}><Plus size={14} /> הוסף תחנה</button>
        <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={!dirty}>
          <Save size={14} /> {dirty ? "שמור" : "נשמר"}
        </button>
      </div>
    </div>
  );
}

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

import { SIZE_LABELS } from "@/core/printHub/sizes";
import { useAppSettings } from "@/settings/store";

interface LogEntry {
  at: string;
  jobId: string;
  sourceComputer: string;
  size: string;
  finish: string;
  borderMode: string;
  prints: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function HistoryTab(): ReactElement {
  const hubRoot = useAppSettings((s) => s.settings.printHub.serverHubRoot || s.settings.printHub.networkFolderPath);
  const [date, setDate] = useState(today());
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const api = window.spp?.printHub;
    if (api?.readProductionLog === undefined) { setMessage("זמין רק בתוכנה המותקנת."); return; }
    if (!hubRoot) { setMessage("הגדר תחילה תיקיית שרת בלשונית ההגדרות."); setEntries([]); return; }
    setLoading(true);
    const res = await api.readProductionLog({ hubRoot, date });
    setLoading(false);
    setMessage(null);
    setEntries(res?.entries ?? []);
  }, [hubRoot, date]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const totalPrints = entries.reduce((s, e) => s + e.prints, 0);
    const bySize = new Map<string, number>();
    for (const e of entries) bySize.set(e.size, (bySize.get(e.size) ?? 0) + e.prints);
    return { totalPrints, jobs: entries.length, bySize: [...bySize.entries()] };
  }, [entries]);

  return (
    <div className="print-hub-printers">
      {message && <div className="print-hub-error">{message}</div>}

      <div className="print-hub-queue-toolbar">
        <label className="print-hub-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <span>תאריך</span>
          <input dir="ltr" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn btn-ghost" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={13} className={loading ? "spin" : ""} /> רענן
        </button>
      </div>

      <div className="print-hub-coverage">
        <div className="print-hub-coverage-row ok"><span>סה״כ עבודות</span><span className="print-hub-coverage-status">{totals.jobs}</span></div>
        <div className="print-hub-coverage-row ok"><span>סה״כ תמונות שהודפסו</span><span className="print-hub-coverage-status">{totals.totalPrints}</span></div>
        {totals.bySize.map(([size, count]) => (
          <div key={size} className="print-hub-coverage-row"><span>{SIZE_LABELS[size] ?? size}</span><span className="print-hub-coverage-status">{count} תמונות</span></div>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="print-hub-empty">אין הדפסות ביום זה.</div>
      ) : (
        <div className="print-hub-history">
          {entries.map((e, i) => (
            <div key={`${e.jobId}-${i}`} className="print-hub-job">
              <div className="print-hub-job-main">
                <div className="print-hub-job-line1"><span className="print-hub-job-id">{e.jobId}</span></div>
                <div className="print-hub-job-line2">
                  {new Date(e.at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })} · {SIZE_LABELS[e.size] ?? e.size} · {e.prints} תמונות · {e.sourceComputer}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

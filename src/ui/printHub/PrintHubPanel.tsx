import {
  BarChart3,
  CheckCircle2,
  Cloud,
  FolderOpen,
  Layers,
  ListChecks,
  Printer,
  RefreshCw,
  Settings2,
  Trash2,
  Users,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { useAppSettings } from "@/settings/store";
import { estimateJobSeconds, estimateQueueSeconds, formatDuration } from "@/core/printHub/timeEstimate";
import { lanConfigFromSettings, testLanConnection, troubleshootLan, type LanCheck } from "@/services/lan/lanQueueClient";
import { cloudStatusConfigured, listCloudPrintJobs, pushCloudSessionToHub } from "@/services/cloud/printJobsCloud";
import { publishPrintHubSettingsToCloud, pullPrintHubSettingsFromCloud } from "@/services/cloud/printHubSettingsCloud";
import type { PrintJobCloudRow } from "@/core/printHub/cloudStatus";
import type { PrinterProfile } from "@/types/printHub";
import { PrintersTab } from "./PrintersTab";
import { StationsTab } from "./StationsTab";
import { MediaTab } from "./MediaTab";
import { HistoryTab } from "./HistoryTab";
import "./printHub.css";

type Tab = "queue" | "printers" | "stations" | "media" | "history" | "cloud" | "setup";

interface JobSummary {
  jobId: string;
  state: string;
  size?: string;
  finish?: string;
  borderMode?: string;
  copies?: number;
  fileCount: number;
  customer: { name: string; phone: string; note: string };
  createdAt?: string;
  priority?: string;
  approval?: { mode: string; state: string | null };
  source?: string;
  sourceComputer?: string;
  lastNote?: string;
  error?: string;
}

const STATE_LABELS: Record<string, string> = {
  incoming: "ממתין בתור",
  validating: "בבדיקה",
  waiting_approval: "ממתין לאישור",
  printing: "בהדפסה",
  done: "הושלם",
  failed: "נכשל",
  canceled: "בוטל",
  rejected: "נדחה",
  archived: "ארכיון"
};

const STATE_ORDER = [
  "waiting_approval", "printing", "incoming", "validating", "failed", "done", "canceled", "rejected", "archived"
];

// Plain-Hebrew messages for the technical notes the engine records (no jargon shown to users).
function translateNote(note: string): string {
  const map: Array<[RegExp, string]> = [
    [/no matching printer\/preset/i, "לא נמצאה מדפסת מתאימה לעבודה זו"],
    [/duplicate/i, "עבודה זהה כבר הודפסה"],
    [/paper jam/i, "תקלת נייר במדפסת"],
    [/print incomplete/i, "ההדפסה לא הושלמה"],
    [/spooler offline|not available|unavailable/i, "המדפסת לא זמינה"],
    [/^part (\d+)\/(\d+)$/i, "חלק $1 מתוך $2"]
  ];
  for (const [re, he] of map) {
    if (re.test(note)) return note.replace(re, he);
  }
  return note;
}

const TABS: Array<{ id: Tab; icon: typeof Printer; label: string }> = [
  { id: "queue", icon: ListChecks, label: "תור הדפסות" },
  { id: "printers", icon: Printer, label: "מדפסות ופריסטים" },
  { id: "stations", icon: Users, label: "תחנות והרשאות" },
  { id: "media", icon: Layers, label: "מדיה וריבונים" },
  { id: "history", icon: BarChart3, label: "יומן ייצור" },
  { id: "cloud", icon: Cloud, label: "סטטוס בענן" },
  { id: "setup", icon: Settings2, label: "הגדרות" }
];

export function PrintHubPanel({ onClose, standalone = false }: { onClose: () => void; standalone?: boolean }): ReactElement {
  const [tab, setTab] = useState<Tab>("queue");
  const effectiveRoot = useAppSettings((s) => s.settings.printHub.serverHubRoot || s.settings.printHub.networkFolderPath);

  // In the standalone tray window, keep the print engine pointed at the same folder the window
  // manages — otherwise the engine would watch a different folder and never print.
  useEffect(() => {
    if (standalone && effectiveRoot) void window.spp?.printHub?.setServerHub?.(effectiveRoot);
  }, [standalone, effectiveRoot]);

  // In the standalone tray window, push the logged-in cloud session to the headless server so it
  // can mirror job status to Supabase (Phase 2). Refreshed periodically so the token stays valid.
  const cloudEnabled = useAppSettings((s) => s.settings.printHub.cloudStatusEnabled);
  useEffect(() => {
    if (!standalone || !cloudEnabled) return;
    void pushCloudSessionToHub();
    const id = setInterval(() => void pushCloudSessionToHub(), 60_000);
    return () => clearInterval(id);
  }, [standalone, cloudEnabled]);

  return (
    <div className="util-panel print-hub-panel" role="dialog" aria-label="מרכז הדפסות" dir="rtl">
      <div className="util-panel-header">
        <div className="print-hub-title">
          <Printer size={16} />
          <span>מרכז הדפסות</span>
        </div>
        <button className="icon-btn" onClick={onClose} type="button" aria-label="סגור">
          <X size={14} />
        </button>
      </div>
      <div className="print-hub-tabs">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button key={id} className={`print-hub-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)} type="button">
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      <div className="util-panel-body print-hub-body">
        {tab === "queue" && <QueueTab />}
        {tab === "printers" && <PrintersTab />}
        {tab === "stations" && <StationsTab />}
        {tab === "media" && <MediaTab />}
        {tab === "history" && <HistoryTab />}
        {tab === "cloud" && <CloudStatusTab />}
        {tab === "setup" && <SetupTab standalone={standalone} />}
      </div>
    </div>
  );
}

function SetupTab({ standalone = false }: { standalone?: boolean }): ReactElement {
  const printHub = useAppSettings((s) => s.settings.printHub);
  const updatePrintHub = useAppSettings((s) => s.updatePrintHub);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function browseFolder(current: string, apply: (path: string) => void): Promise<void> {
    const res = await window.spp?.smartPrintPrepare?.chooseOutputDir?.(current);
    if (res?.success && res.folderPath) apply(res.folderPath);
  }

  useEffect(() => {
    const hubRoot = printHub.serverHubRoot || printHub.networkFolderPath;
    if (!hubRoot || window.spp?.printHub?.saveHubConfig === undefined) return;
    const id = setTimeout(() => {
      void window.spp?.printHub?.saveHubConfig?.({
        hubRoot,
        config: {
          retentionDays: printHub.retentionDays,
          lanPort: printHub.lanPort
        }
      });
    }, 500);
    return () => clearTimeout(id);
  }, [printHub.serverHubRoot, printHub.networkFolderPath, printHub.retentionDays, printHub.lanPort]);

  async function publishSettingsToCloud(): Promise<void> {
    const api = window.spp?.printHub;
    const hubRoot = printHub.serverHubRoot || printHub.networkFolderPath;
    if (!api?.exportSettings || !hubRoot) {
      setSyncMessage("הגדר תחילה תיקיית Print Hub.");
      return;
    }
    setSyncMessage("מעלה הגדרות לענן...");
    const exported = await api.exportSettings({ hubRoot, appSettings: printHub });
    if (!exported.success || !exported.snapshot) {
      setSyncMessage(`ייצוא ההגדרות נכשל: ${exported.error ?? "שגיאה לא ידועה"}`);
      return;
    }
    const res = await publishPrintHubSettingsToCloud(exported.snapshot);
    setSyncMessage(res.ok ? "הגדרות Print Hub נשמרו בענן." : `סנכרון לענן נכשל: ${res.error ?? "שגיאה לא ידועה"}`);
  }

  async function pullSettingsFromCloud(): Promise<void> {
    const api = window.spp?.printHub;
    const hubRoot = printHub.serverHubRoot || printHub.networkFolderPath;
    if (!api?.importSettings || !hubRoot) {
      setSyncMessage("הגדר תחילה תיקיית Print Hub מקומית במחשב זה.");
      return;
    }
    setSyncMessage("מוריד הגדרות מהענן...");
    const res = await pullPrintHubSettingsFromCloud();
    if (!res.ok || !res.row?.settings) {
      setSyncMessage(`לא נמצאו הגדרות בענן: ${res.error ?? "אין נתונים"}`);
      return;
    }
    const imported = await api.importSettings({ hubRoot, snapshot: res.row.settings });
    if (!imported.success) {
      setSyncMessage(`ייבוא ההגדרות נכשל: ${imported.error ?? "שגיאה לא ידועה"}`);
      return;
    }
    if (res.row.settings.appSettings) updatePrintHub(res.row.settings.appSettings);
    if (standalone) await api.setServerHub?.(res.row.settings.appSettings?.serverHubRoot || hubRoot);
    setSyncMessage(`הגדרות Print Hub סונכרנו מהענן (${res.row.source_computer ?? "מחשב מרכזי"}).`);
  }

  return (
    <div className="print-hub-setup">
      <p className="print-hub-hint">
        תחנות עיצוב שולחות עבודות לתיקיית התור. שרת ההדפסה קולט ומדפיס מקומית — אין צורך בדרייבר בתחנה זו.
      </p>

      {standalone && <HubLanInfo />}

      <label className="print-hub-field">
        <span>תפקיד התחנה</span>
        <select value={printHub.stationRole} onChange={(e) => updatePrintHub({ stationRole: e.target.value as typeof printHub.stationRole })}>
          <option value="designer">תחנת עיצוב (שולחת עבודות)</option>
          <option value="operator">מפעיל (מנהל תור)</option>
          <option value="admin">מנהל / שרת הדפסה</option>
        </select>
      </label>

      <label className="print-hub-field">
        <span>תיקיית התור ברשת</span>
        <div className="print-hub-path">
          <input
            dir="ltr"
            type="text"
            placeholder="\\PRINT-PC\SPP_PrintQueue"
            value={printHub.networkFolderPath}
            onChange={(e) => updatePrintHub({ networkFolderPath: e.target.value })}
          />
          <button className="btn btn-ghost" type="button" onClick={() => browseFolder(printHub.networkFolderPath, (p) => updatePrintHub({ networkFolderPath: p }))}>
            <FolderOpen size={14} />
          </button>
        </div>
      </label>

      <LanSetupSection />

      <label className="print-hub-check">
        <input type="checkbox" checked={printHub.cloudStatusEnabled}
          onChange={(e) => updatePrintHub({ cloudStatusEnabled: e.target.checked })} />
        <span>סנכרן סטטוס עבודות לענן (צפייה חוצת-מחשבים · מטא-דאטה בלבד, ללא תמונות)</span>
      </label>

      <label className="print-hub-field">
        <span>ברירת מחדל לשליחה מתחנה זו</span>
        <div className="print-hub-field">
          <span>סנכרון הגדרות Print Hub בענן</span>
          <div className="print-hub-path">
            <button className="btn btn-ghost" type="button" onClick={() => void publishSettingsToCloud()} disabled={!cloudStatusConfigured()}>
              <Cloud size={14} /> העלה הגדרות
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => void pullSettingsFromCloud()} disabled={!cloudStatusConfigured()}>
              <RefreshCw size={14} /> סנכרן נתונים
            </button>
          </div>
          {syncMessage && <span className="print-hub-hint">{syncMessage}</span>}
        </div>
        <select value={printHub.defaultApprovalMode} onChange={(e) => updatePrintHub({ defaultApprovalMode: e.target.value as typeof printHub.defaultApprovalMode })}>
          <option value="require_approval">שלח לאישור מנהל</option>
          <option value="auto">הדפס אוטומטית (אם התחנה מורשית)</option>
        </select>
        <span className="print-hub-hint">
          תחנת עיצוב מורשית? קבע "הדפס אוטומטית". העבודות יודפסו מיד — בתנאי שהתחנה מסומנת מורשית בלשונית "תחנות והרשאות" בשרת.
        </span>
      </label>

      {printHub.stationRole === "admin" && (
        <>
          <label className="print-hub-field">
            <span>תיקיית שרת מקומית</span>
            <div className="print-hub-path">
              <input
                dir="ltr"
                type="text"
                placeholder="C:\SPP_PrintHub"
                value={printHub.serverHubRoot}
                onChange={(e) => updatePrintHub({ serverHubRoot: e.target.value })}
              />
              <button className="btn btn-ghost" type="button" onClick={() => browseFolder(printHub.serverHubRoot, (p) => updatePrintHub({ serverHubRoot: p }))}>
                <FolderOpen size={14} />
              </button>
            </div>
          </label>

          <label className="print-hub-field">
            <span>שמירת עבודות שהושלמו: {printHub.retentionDays === 0 ? "ללא הגבלה" : `${printHub.retentionDays} ימים`}</span>
            <input
              type="range"
              min={0}
              max={90}
              value={printHub.retentionDays}
              onChange={(e) => updatePrintHub({ retentionDays: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      {!standalone && (
        <div className="print-hub-field">
          <span>תפריט "שלח ל-SPP Print Hub" ב-Windows Explorer</span>
          <div className="print-hub-path">
            <button className="btn btn-ghost" type="button" onClick={() => void installContextMenu()}>התקן</button>
            <button className="btn btn-ghost" type="button" onClick={() => void uninstallContextMenu()}>הסר</button>
          </div>
          <span className="print-hub-hint">מתקין קליק-ימני על תמונות שמפעיל את SPP2. להתקנה בתחנת העיצוב.</span>
        </div>
      )}
    </div>
  );

  async function installContextMenu(): Promise<void> {
    const res = await window.spp?.printHub?.installContextMenu?.();
    alert(res?.success ? "התפריט הותקן. בחר תמונות ב-Explorer → קליק ימני → שלח ל-SPP Print Hub." : `נכשל: ${res?.error ?? "לא ידוע"}`);
  }
  async function uninstallContextMenu(): Promise<void> {
    const res = await window.spp?.printHub?.uninstallContextMenu?.();
    alert(res?.success ? "התפריט הוסר." : `נכשל: ${res?.error ?? "לא ידוע"}`);
  }
}

/** Sender-side LAN config: choose folder vs LAN transport, enter host/port/token, test + troubleshoot. */
function LanSetupSection(): ReactElement {
  const printHub = useAppSettings((s) => s.settings.printHub);
  const updatePrintHub = useAppSettings((s) => s.updatePrintHub);
  const lanCfg = lanConfigFromSettings(printHub);

  const [status, setStatus] = useState<{ state: "idle" | "checking" | "ok" | "down"; hubName?: string }>({ state: "idle" });
  const [checks, setChecks] = useState<LanCheck[] | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  // Live status light while LAN transport is selected.
  useEffect(() => {
    if (!lanCfg) { setStatus({ state: "idle" }); return; }
    let cancelled = false;
    const check = async (): Promise<void> => {
      const h = await testLanConnection(lanCfg);
      if (!cancelled) setStatus(h.ok ? { state: "ok", hubName: h.hubName } : { state: "down" });
    };
    void check();
    const id = setInterval(() => void check(), 6000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanCfg?.host, lanCfg?.port, lanCfg?.token]);

  async function runTest(): Promise<void> {
    if (!lanCfg) return;
    setStatus({ state: "checking" });
    const h = await testLanConnection(lanCfg);
    setStatus(h.ok ? { state: "ok", hubName: h.hubName } : { state: "down" });
  }

  async function runDiagnostics(): Promise<void> {
    if (!lanCfg) return;
    setDiagBusy(true);
    setChecks(null);
    try {
      const res = await troubleshootLan(lanCfg);
      setChecks(res.checks);
    } finally {
      setDiagBusy(false);
    }
  }

  return (
    <div className="print-hub-lan">
      <label className="print-hub-field">
        <span>אופן שליחה מתחנה זו</span>
        <select value={printHub.transportMode} onChange={(e) => updatePrintHub({ transportMode: e.target.value as typeof printHub.transportMode })}>
          <option value="folder">תיקיית תור משותפת</option>
          <option value="lan">חיבור ישיר LAN למחשב ההדפסה</option>
        </select>
      </label>

      {printHub.transportMode === "lan" && (
        <>
          <label className="print-hub-field">
            <span>כתובת מחשב ההדפסה (IP / שם)</span>
            <input dir="ltr" type="text" placeholder="192.168.1.50" value={printHub.lanHost}
              onChange={(e) => updatePrintHub({ lanHost: e.target.value.trim() })} />
          </label>
          <div className="print-hub-lan-row">
            <label className="print-hub-field">
              <span>פורט</span>
              <input dir="ltr" type="number" value={printHub.lanPort}
                onChange={(e) => updatePrintHub({ lanPort: Number(e.target.value) || 8788 })} />
            </label>
            <label className="print-hub-field" style={{ flex: 1 }}>
              <span>קוד שיוך</span>
              <input dir="ltr" type="text" placeholder="XXXX-XXXX" value={printHub.lanToken}
                onChange={(e) => updatePrintHub({ lanToken: e.target.value.trim().toUpperCase() })} />
            </label>
          </div>

          <div className="print-hub-lan-status">
            <span className={`lan-light lan-light-${status.state === "idle" ? "checking" : status.state}`}>
              <span className="lan-dot" />
              {status.state === "ok" ? `מחובר ל-${status.hubName ?? "Print Hub"}`
                : status.state === "down" ? "אין חיבור"
                : status.state === "checking" ? "בודק…" : "לא נבדק"}
            </span>
            <button className="btn btn-ghost" type="button" onClick={() => void runTest()} disabled={!lanCfg}>בדיקת חיבור</button>
            <button className="btn btn-ghost" type="button" onClick={() => void runDiagnostics()} disabled={!lanCfg || diagBusy}>
              {diagBusy ? "מאבחן…" : "אבחון חיבור"}
            </button>
          </div>

          {checks && (
            <div className="print-hub-lan-checks">
              {checks.map((c) => (
                <div key={c.id} className="print-hub-lan-check">
                  {c.ok === true ? <CheckCircle2 size={14} className="ok" /> : c.ok === false ? <XCircle size={14} className="bad" /> : <span className="unknown">?</span>}
                  <div>
                    <div>{c.detail}</div>
                    {c.fix && c.ok !== true && <div className="print-hub-hint">{c.fix}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Hub-side display (server management window): the LAN address + pairing code to give designers. */
function HubLanInfo(): ReactElement | null {
  const [info, setInfo] = useState<{ addresses: string[]; port: number; token: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await window.spp?.printHub?.lanInfo?.();
      if (!cancelled && res?.success) setInfo({ addresses: res.addresses, port: res.port, token: res.token });
    })();
    return () => { cancelled = true; };
  }, []);
  if (!info || (info.addresses.length === 0 && !info.token)) return null;
  const primary = info.addresses[0] ?? `127.0.0.1:${info.port}`;
  return (
    <div className="print-hub-lan-info">
      <div className="print-hub-lan-info-title">חיבור LAN למחשב זה</div>
      <div>כתובת לשליחה מתחנות עיצוב: <strong dir="ltr">{info.addresses.join("  ·  ") || primary}</strong></div>
      <div>קוד שיוך: <strong dir="ltr">{info.token}</strong></div>
      <button className="btn btn-ghost" type="button" onClick={() => void navigator.clipboard?.writeText(`${primary}  ·  ${info.token}`)}>העתק כתובת + קוד</button>
    </div>
  );
}

const CLOUD_STATE_LABELS: Record<string, string> = {
  incoming: "ממתין", validating: "נבדק", waiting_approval: "ממתין לאישור",
  printing: "בהדפסה", done: "הודפס", failed: "נכשל", canceled: "בוטל", rejected: "נדחה", archived: "ארכיון"
};

/** Reader-side live cross-machine queue: the account's jobs (all machines) from Supabase, polled. */
function CloudStatusTab(): ReactElement {
  const enabled = useAppSettings((s) => s.settings.printHub.cloudStatusEnabled);
  const [jobs, setJobs] = useState<PrintJobCloudRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    const res = await listCloudPrintJobs();
    setLoading(false);
    if (!res.ok) { setError(res.error ?? "שגיאה"); return; }
    setError(null);
    setJobs(res.jobs);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  if (!cloudStatusConfigured()) return <div className="print-hub-empty">ענן אינו מוגדר בגרסה זו.</div>;
  if (!enabled) return <div className="print-hub-empty">סנכרון סטטוס בענן כבוי. הפעל אותו בלשונית "הגדרות".</div>;

  return (
    <div className="print-hub-cloud">
      <div className="print-hub-queue-toolbar">
        <button className="btn btn-ghost" type="button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={13} className={loading ? "spin" : ""} /> רענן
        </button>
        <span className="print-hub-count">{jobs.length} עבודות · כל המחשבים בחשבון</span>
      </div>
      {error && <div className="print-hub-error">{error}</div>}
      {!error && jobs.length === 0 && <div className="print-hub-empty">אין עבודות בענן עדיין.</div>}
      {jobs.map((j) => (
        <div key={j.id} className="print-hub-cloud-row">
          <span className={`cloud-state cloud-state-${j.state}`}>{CLOUD_STATE_LABELS[j.state] ?? j.state}</span>
          <div className="print-hub-cloud-main">
            <strong>{j.customer_name || j.job_id}</strong>
            <span className="print-hub-hint">{j.size} · {j.image_count} תמונות · {j.source_computer || "?"} ← {j.target_computer || "?"}</span>
            {j.error && <span className="print-hub-cloud-err">{j.error}</span>}
          </div>
          <span className="print-hub-hint" dir="ltr">{new Date(j.updated_at).toLocaleTimeString("he-IL")}</span>
        </div>
      ))}
    </div>
  );
}

function QueueTab(): ReactElement {
  const hubRoot = useAppSettings((s) => s.settings.printHub.serverHubRoot || s.settings.printHub.networkFolderPath);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [profiles, setProfiles] = useState<PrinterProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void (async () => {
      if (!hubRoot) return;
      const res = await window.spp?.printHub?.loadProfiles?.(hubRoot);
      setProfiles(res?.profiles ?? []);
    })();
  }, [hubRoot]);

  const refresh = useCallback(async (): Promise<void> => {
    const api = window.spp?.printHub;
    if (api === undefined) {
      setError("מרכז ההדפסות זמין רק בהרצה דרך Electron.");
      return;
    }
    if (!hubRoot) {
      setError("הגדר תחילה את תיקיית התור בלשונית ההגדרות.");
      setJobs([]);
      return;
    }
    setLoading(true);
    const res = await api.listQueue(hubRoot);
    setLoading(false);
    if (!res.success) {
      setError(res.error ?? "קריאת התור נכשלה.");
      return;
    }
    setError(null);
    setJobs(res.jobs);
    const logRes = await api.readServerLog?.(hubRoot);
    if (logRes?.success) setLog(logRes.lines);
  }, [hubRoot]);

  useEffect(() => {
    void refresh();
    timer.current = setInterval(() => void refresh(), 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  async function act(jobId: string, action: "cancel" | "reject" | "approve" | "retry" | "archive" | "delete"): Promise<void> {
    const api = window.spp?.printHub;
    if (api === undefined || !hubRoot) return;
    await api.jobAction({ hubRoot, jobId, action });
    void refresh();
  }

  const grouped = useMemo(() => {
    const map = new Map<string, JobSummary[]>();
    for (const job of jobs) {
      const list = map.get(job.state) ?? [];
      list.push(job);
      map.set(job.state, list);
    }
    return STATE_ORDER.filter((s) => map.has(s)).map((s) => [s, map.get(s)!] as const);
  }, [jobs]);

  return (
    <div className="print-hub-queue">
      <div className="print-hub-queue-toolbar">
        <button className="btn btn-ghost" type="button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={13} className={loading ? "spin" : ""} /> רענן
        </button>
        <span className="print-hub-count">
          {jobs.length} עבודות
          {jobs.length > 0 && ` · זמן משוער לתור: ~${formatDuration(estimateQueueSeconds(profiles, jobs))}`}
        </span>
        <button className="btn btn-ghost" type="button" onClick={() => setShowLog((v) => !v)}>
          {showLog ? "הסתר לוג" : "לוג שרת"}
        </button>
      </div>

      {showLog && (
        <div className="print-hub-log">
          {log.length === 0
            ? <div className="print-hub-hint">אין רשומות לוג. ודא ששרת ההדפסה רץ ומצביע לאותה תיקייה.</div>
            : log.slice().reverse().map((line, i) => <div key={i} className="print-hub-log-line">{line}</div>)}
        </div>
      )}

      {error && <div className="print-hub-error">{error}</div>}

      {!error && jobs.length === 0 && <div className="print-hub-empty">אין עבודות בתור.</div>}

      {grouped.map(([state, list]) => (
        <div key={state} className="print-hub-group">
          <div className={`print-hub-group-head state-${state}`}>
            {STATE_LABELS[state] ?? state} ({list.length})
          </div>
          {list.map((job) => (
            <div key={job.jobId} className="print-hub-job">
              <div className="print-hub-job-main">
                <div className="print-hub-job-line1">
                  <span className="print-hub-job-id">{job.jobId}</span>
                  {job.priority === "high" && <span className="print-hub-badge high">דחוף</span>}
                </div>
                <div className="print-hub-job-line2">
                  {job.size} · {job.finish} · {job.fileCount} תמונות{job.copies && job.copies > 1 ? ` · ${job.copies} עותקים` : ""}
                  {job.customer?.name ? ` · ${job.customer.name}` : ""}
                  {` · ~${formatDuration(estimateJobSeconds(profiles, job))}`}
                </div>
                {job.lastNote && <div className="print-hub-job-note">{translateNote(job.lastNote)}</div>}
              </div>
              <div className="print-hub-job-actions">
                {state === "waiting_approval" && (
                  <>
                    <button className="btn btn-ghost ok" type="button" onClick={() => void act(job.jobId, "approve")}><CheckCircle2 size={14} /> אשר</button>
                    <button className="btn btn-ghost bad" type="button" onClick={() => void act(job.jobId, "reject")}><XCircle size={14} /> דחה</button>
                  </>
                )}
                {state === "failed" && (
                  <button className="btn btn-ghost" type="button" onClick={() => void act(job.jobId, "retry")}><RefreshCw size={14} /> הדפס שוב</button>
                )}
                {(state === "incoming" || state === "validating" || state === "printing") && (
                  <button className="btn btn-ghost bad" type="button" onClick={() => void act(job.jobId, "cancel")}>בטל</button>
                )}
                {(state === "done" || state === "failed" || state === "canceled" || state === "rejected") && (
                  <button className="btn btn-ghost" type="button" onClick={() => void act(job.jobId, "delete")}><Trash2 size={13} /></button>
                )}
                <button className="btn btn-ghost" type="button" onClick={() => void window.spp?.printHub?.openJobFolder({ hubRoot, jobId: job.jobId })}><FolderOpen size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

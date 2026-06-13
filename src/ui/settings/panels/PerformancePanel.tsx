import { useEffect, useState, type ReactElement } from "react";
import { RefreshCw, Zap, Gauge, Cpu, Download } from "lucide-react";
import { useAppSettings } from "@/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";
import { useAiPreloadStore } from "@/state/aiPreloadStore";
import { reloadAiModels } from "@/services/ai/aiPreloadService";
import {
  getSmartSelectionCapabilities,
  getAiAccelerationStatus,
  runAiAccelerationBenchmark,
  getSdAccelerationStatus,
  type SmartSelectionCapabilities,
  type AiAccelerationStatus,
  type AiBenchmarkResult,
  type SdAccelerationStatus
} from "@/services/ai/smartSelectionService";

const NVIDIA_COMPONENT_ID = "nvidia-ai-acceleration";

const SD_MODE_LABELS: Record<string, string> = {
  fast: "מהיר (GPU)",
  slow: "איטי (CPU)",
  unavailable: "לא זמין"
};

const AI_MODEL_STATUS_LABELS: Record<string, string> = {
  idle: "ממתין",
  loading: "טוען…",
  ready: "מוכן",
  fallback: "חלקי",
  failed: "נכשל"
};

export function PerformancePanel(): ReactElement {
  const perf = useAppSettings((s) => s.settings.performance);
  const update = useAppSettings((s) => s.updatePerformance);
  const aiModels = useAiPreloadStore((s) => s.models);
  const aiModelList = Object.values(aiModels);
  const [aiDiagnostics, setAiDiagnostics] = useState<SmartSelectionCapabilities | null>(null);
  const [accel, setAccel] = useState<AiAccelerationStatus | null>(null);
  const [benchmark, setBenchmark] = useState<AiBenchmarkResult | null>(null);
  const [benchmarking, setBenchmarking] = useState(false);
  const [sdStatus, setSdStatus] = useState<SdAccelerationStatus | null>(null);
  const [hasNvidia, setHasNvidia] = useState(false);
  const [nvidiaInstalled, setNvidiaInstalled] = useState<boolean | null>(null);
  const [installingNvidia, setInstallingNvidia] = useState(false);
  const [nvidiaError, setNvidiaError] = useState<string | null>(null);

  const refreshSdStatus = async (): Promise<void> => {
    const [sd, components] = await Promise.all([
      getSdAccelerationStatus(),
      window.spp?.components?.list?.() ?? Promise.resolve(null)
    ]);
    setSdStatus(sd);
    if (components?.components != null) {
      const entry = components.components.find((c) => c.id === NVIDIA_COMPONENT_ID);
      setNvidiaInstalled(entry != null ? entry.status === "installed" : false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void getSmartSelectionCapabilities().then((capabilities) => {
      if (!cancelled) setAiDiagnostics(capabilities);
    }).catch(() => undefined);
    void getAiAccelerationStatus().then((status) => {
      if (!cancelled) setAccel(status);
    }).catch(() => undefined);
    void getSdAccelerationStatus().then((sd) => {
      if (!cancelled) setSdStatus(sd);
    }).catch(() => undefined);
    void (window.spp?.components?.gpuInfo?.() ?? Promise.resolve(null)).then((info) => {
      if (!cancelled && info != null) setHasNvidia(Boolean(info.nvidia));
    }).catch(() => undefined);
    void (window.spp?.components?.list?.() ?? Promise.resolve(null)).then((res) => {
      if (cancelled || res?.components == null) return;
      const entry = res.components.find((c) => c.id === NVIDIA_COMPONENT_ID);
      setNvidiaInstalled(entry != null ? entry.status === "installed" : false);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const handleInstallNvidia = async (): Promise<void> => {
    if (window.spp?.components?.install == null) return;
    setInstallingNvidia(true);
    setNvidiaError(null);
    try {
      const res = await window.spp.components.install(NVIDIA_COMPONENT_ID);
      if (res?.ok === false || res?.success === false) {
        setNvidiaError(res?.error ?? "ההתקנה נכשלה");
      } else {
        await refreshSdStatus();
      }
    } catch (err) {
      setNvidiaError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingNvidia(false);
    }
  };

  const handleBenchmark = async (): Promise<void> => {
    setBenchmarking(true);
    setBenchmark(null);
    try {
      const [status, result] = await Promise.all([
        getAiAccelerationStatus(),
        runAiAccelerationBenchmark({ iterations: 10 })
      ]);
      if (status !== null) setAccel(status);
      setBenchmark(result);
    } catch {
      /* surfaced via empty result */
    } finally {
      setBenchmarking(false);
    }
  };

  return (
    <div>
      <SettingsSection title="איכות תצוגה" description="איכות התצוגה המקדימה בזמן עריכה.">
        <SettingsRow label="איכות תצוגה מקדימה" description="קובעת את גודל תמונות ה-preview ועומס הרינדור בזמן עבודה.">
          <select
            className="settings-select"
            value={perf.previewQuality}
            onChange={(e) => update({ previewQuality: e.target.value as "low" | "medium" | "high" })}
          >
            <option value="low">נמוכה - מהיר יותר</option>
            <option value="medium">בינונית</option>
            <option value="high">גבוהה - מדויק יותר</option>
          </select>
        </SettingsRow>

        <SettingsRow label="איכות ייצוא סופי" description="קובעת את רזולוציית הרינדור בייצוא PNG, JPG ו-PDF.">
          <select
            className="settings-select"
            value={perf.renderQuality}
            onChange={(e) => update({ renderQuality: e.target.value as "standard" | "high" | "print" })}
          >
            <option value="standard">רגיל</option>
            <option value="high">גבוה</option>
            <option value="print">הדפסה (300 DPI)</option>
          </select>
        </SettingsRow>

        <SettingsRow
          label="הפחת איכות בזמן גרירה"
          description="מצב עבודה קל יותר בזמן גרירה, עם חזרה לאיכות מלאה לאחר שחרור."
        >
          <SettingsToggle value={perf.lowResWhileDragging} onChange={(v) => update({ lowResWhileDragging: v })} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="זיכרון ועיבוד">
        <SettingsRow
          label="הפעלת האצת GPU"
          description="ההעדפה נשמרת. יישום מלא ברמת Electron ידרוש הפעלה מחדש."
        >
          <SettingsToggle value={perf.enableGpuAcceleration} onChange={(v) => update({ enableGpuAcceleration: v })} />
        </SettingsRow>

        <SettingsRow
          label="גודל תמונת תצוגה מקסימלי (px)"
          description="מגביל את גודל תמונות התצוגה המקדימה. הייצוא עדיין משתמש במקור."
        >
          <select
            className="settings-select"
            value={perf.maxPreviewSizePx}
            onChange={(e) => update({ maxPreviewSizePx: parseInt(e.target.value) })}
          >
            <option value={1024}>1024px</option>
            <option value={2048}>2048px</option>
            <option value={4096}>4096px</option>
            <option value={8192}>8192px</option>
          </select>
        </SettingsRow>

        <SettingsRow
          label="מגבלת היסטוריית ביטול"
          description="כמות הפעולות שנשמרות לביטול/ביצוע מחדש."
        >
          <select
            className="settings-select"
            value={perf.undoHistoryLimit}
            onChange={(e) => update({ undoHistoryLimit: parseInt(e.target.value) })}
          >
            <option value={50}>50 פעולות</option>
            <option value={100}>100 פעולות</option>
            <option value={200}>200 פעולות</option>
          </select>
        </SettingsRow>

        <SettingsRow label="אזהרה בפתיחת קבצים גדולים (MB)" description="הצג אזהרה לפני טעינת קובץ גדול.">
          <input
            type="number"
            className="settings-number-input"
            value={perf.warnLargeFileMb}
            min={10}
            max={500}
            step={10}
            onChange={(e) => update({ warnLargeFileMb: parseInt(e.target.value) || 50 })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="מצב ביצועים">
        <SettingsRow
          label="מצב ביצועים"
          description="מפעיל מדיניות עבודה קלה יותר בלי לדרוס את ההגדרות הידניות."
        >
          <SettingsToggle value={perf.performanceMode} onChange={(v) => update({ performanceMode: v })} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="האצת AI (GPU)"
        description="בדיקה אם פעולות ה-AI (בחירה חכמה, הסרת רקע, מילוי) רצות על כרטיס המסך או על המעבד."
      >
        <SettingsRow
          label="מצב האצה"
          description="ספק החישוב הפעיל. GPU מהיר משמעותית מ-CPU בפעולות AI."
        >
          {accel === null ? (
            <span style={{ fontSize: 12, opacity: 0.6 }}>בודק…</span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 999,
                background: accel.accelerationEnabled ? "rgba(64,192,120,0.16)" : "rgba(246,193,119,0.16)",
                color: accel.accelerationEnabled ? "#40c078" : "#f6c177"
              }}
            >
              <Zap size={12} />
              {accel.accelerationEnabled ? `מופעל — ${accel.device}` : "לא זמין — רץ על CPU"}
            </span>
          )}
        </SettingsRow>

        {accel?.conflict === true && (
          <div className="settings-row" style={{ display: "block" }}>
            <div style={{ color: "#f6c177", fontSize: 12 }}>
              ⚠ מותקנות חבילות onnxruntime סותרות. התקן מחדש את רכיב "בחירה חכמה" כדי להשאיר רק את גרסת ה-DirectML.
            </div>
          </div>
        )}

        <SettingsRow
          label="בדיקת האצת AI"
          description="מריץ benchmark קצר ומשווה את זמני העיבוד על GPU מול CPU במחשב הזה."
        >
          <button type="button" className="btn btn-ghost" onClick={() => void handleBenchmark()} disabled={benchmarking}>
            <Gauge size={13} />
            {benchmarking ? "בודק…" : "בדיקת האצת AI"}
          </button>
        </SettingsRow>

        {benchmark !== null && (
          <div className="settings-row" style={{ display: "block" }}>
            <div style={{ fontSize: 12, marginBottom: 8, fontWeight: 600 }}>
              {benchmark.message}
              {benchmark.speedup != null && benchmark.accelerationEnabled && (
                <span style={{ color: "#40c078" }}> (פי {benchmark.speedup} מהיר יותר)</span>
              )}
            </div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "right", opacity: 0.7 }}>
                  <th style={{ padding: "4px 6px" }}>ספק</th>
                  <th style={{ padding: "4px 6px" }}>התקן</th>
                  <th style={{ padding: "4px 6px" }}>זמן עיבוד</th>
                </tr>
              </thead>
              <tbody>
                {benchmark.results.map((r) => (
                  <tr key={r.requested} style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                    <td style={{ padding: "4px 6px", direction: "ltr", textAlign: "left" }}>{r.provider ?? r.requested}</td>
                    <td style={{ padding: "4px 6px" }}>{r.device}</td>
                    <td style={{ padding: "4px 6px" }}>
                      {r.error != null ? <span style={{ color: "#f6c177" }}>שגיאה</span> : r.msPerInference != null ? `${r.msPerInference} ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <SettingsRow
          label="מילוי איכותי (SD) — מנוע"
          description="מילוי Content-Aware איכותי (Stable Diffusion) רץ על torch. מהיר רק עם כרטיס NVIDIA והאצת CUDA מותקנת."
        >
          {sdStatus === null ? (
            <span style={{ fontSize: 12, opacity: 0.6 }}>בודק…</span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 999,
                background: sdStatus.estimatedMode === "fast" ? "rgba(64,192,120,0.16)" : sdStatus.estimatedMode === "slow" ? "rgba(246,193,119,0.16)" : "rgba(150,150,170,0.16)",
                color: sdStatus.estimatedMode === "fast" ? "#40c078" : sdStatus.estimatedMode === "slow" ? "#f6c177" : "#9a9ab0"
              }}
            >
              {sdStatus.estimatedMode === "fast" ? <Zap size={12} /> : <Cpu size={12} />}
              {SD_MODE_LABELS[sdStatus.estimatedMode] ?? sdStatus.estimatedMode}
              {sdStatus.cudaDeviceName != null && sdStatus.estimatedMode === "fast" ? ` — ${sdStatus.cudaDeviceName}` : ""}
            </span>
          )}
        </SettingsRow>

        {hasNvidia && nvidiaInstalled === false && sdStatus?.estimatedMode !== "fast" && (
          <SettingsRow
            label="התקן האצת AI ל-NVIDIA"
            description="זוהה כרטיס NVIDIA. התקנת torch CUDA (~2.5GB) תאיץ משמעותית את מילוי ה-SD. אופציונלי — לא נכלל בהתקנה הבסיסית."
          >
            <button type="button" className="btn btn-ghost" onClick={() => void handleInstallNvidia()} disabled={installingNvidia}>
              <Download size={13} />
              {installingNvidia ? "מתקין…" : "התקן האצת AI ל-NVIDIA"}
            </button>
          </SettingsRow>
        )}
        {nvidiaError != null && (
          <div className="settings-row" style={{ display: "block" }}>
            <div style={{ color: "#f6c177", fontSize: 12 }}>⚠ {nvidiaError}</div>
          </div>
        )}

        {sdStatus !== null && (
          <div className="settings-row" style={{ display: "block" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>torch</td>
                  <td style={{ padding: "4px 6px" }}>{sdStatus.torchInstalled ? `available ${sdStatus.torchVersion ?? ""}` : "missing"}</td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>CUDA available</td>
                  <td style={{ padding: "4px 6px" }}>{sdStatus.cudaAvailable ? "yes" : "no"}</td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>CUDA device</td>
                  <td style={{ padding: "4px 6px" }}>{sdStatus.cudaDeviceName ?? "—"}</td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>SD device</td>
                  <td style={{ padding: "4px 6px" }}>{sdStatus.sdDevice ?? "—"}</td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>Estimated mode</td>
                  <td style={{ padding: "4px 6px" }}>{SD_MODE_LABELS[sdStatus.estimatedMode] ?? sdStatus.estimatedMode}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="טעינת מודלים של AI"
        description="טעינה מוקדמת של מודלי בינה מלאכותית בהפעלה כדי שכל פעולת AI אחר כך תהיה מהירה יותר. טעינה מלאה מאריכה את ההפעלה הראשונה."
      >
        <SettingsRow
          label="מצב טעינת מודלים של AI"
          description="בחר כמה מודלים לטעון מראש בהפעלה. ככל שנטענים יותר — ההפעלה איטית יותר אך הפעולות מיידיות."
        >
          <select
            className="settings-select"
            value={perf.aiPerformanceMode}
            onChange={(e) => update({ aiPerformanceMode: e.target.value as "lazy" | "balanced" | "advanced" | "full" })}
          >
            <option value="lazy">Lazy — לפי דרישה (ללא טעינה מוקדמת)</option>
            <option value="balanced">Balanced — Object Select מהיר בלבד</option>
            <option value="advanced">Advanced — Object Select + SAM2</option>
            <option value="full">Full — explicit heavy preload for local AI</option>
          </select>
        </SettingsRow>

        <SettingsRow
          label="הצג סרטון טעינה בהפעלה"
          description="הצגת סרטון בזמן טעינת מודלי ה-AI בהפעלה. בכיבוי — הטעינה תרוץ ברקע ללא סרטון."
        >
          <SettingsToggle value={perf.aiShowLoadingVideo} onChange={(v) => update({ aiShowLoadingVideo: v })} />
        </SettingsRow>

        <SettingsRow
          label="טען מודלים מחדש"
          description="משחרר את המודלים הטעונים וטוען אותם מחדש לפי ההגדרה הנוכחית."
        >
          <button type="button" className="btn btn-ghost" onClick={() => reloadAiModels(perf.aiPerformanceMode)}>
            <RefreshCw size={13} />
            טען מחדש
          </button>
        </SettingsRow>

        {aiModelList.length > 0 && (
          <div className="settings-row" style={{ display: "block" }}>
            <div className="settings-row-label" style={{ marginBottom: 8 }}>
              <span className="settings-row-name">סטטוס מודלים</span>
              <div className="settings-row-desc">מצב טעינה, ספק החישוב (CPU / CUDA / DirectML) וזמני הטעינה.</div>
            </div>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "right", opacity: 0.7 }}>
                  <th style={{ padding: "4px 6px" }}>מודל</th>
                  <th style={{ padding: "4px 6px" }}>סטטוס</th>
                  <th style={{ padding: "4px 6px" }}>ספק</th>
                  <th style={{ padding: "4px 6px" }}>טעינה</th>
                  <th style={{ padding: "4px 6px" }}>חימום</th>
                </tr>
              </thead>
              <tbody>
                {aiModelList.map((m) => (
                  <tr key={m.name} style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                    <td style={{ padding: "4px 6px" }}>{m.name}</td>
                    <td style={{ padding: "4px 6px" }}>
                      {AI_MODEL_STATUS_LABELS[m.status] ?? m.status}
                      {(m.error ?? m.fallbackReason) != null && (
                        <span style={{ opacity: 0.6 }}> — {m.error ?? m.fallbackReason}</span>
                      )}
                    </td>
                    <td style={{ padding: "4px 6px" }}>{m.provider ?? "—"}</td>
                    <td style={{ padding: "4px 6px" }}>{m.loadMs != null ? `${Math.round(m.loadMs)}ms` : "—"}</td>
                    <td style={{ padding: "4px 6px" }}>{m.warmupMs != null ? `${Math.round(m.warmupMs)}ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {aiDiagnostics !== null && (
          <div className="settings-row" style={{ display: "block" }}>
            <div className="settings-row-label" style={{ marginBottom: 8 }}>
              <span className="settings-row-name">AI diagnostics</span>
              <div className="settings-row-desc">Python, ONNX provider, acceleration, and local model availability.</div>
            </div>
            {(aiDiagnostics.diagnostics?.warnings ?? []).map((warning) => (
              <div key={warning} style={{ color: "#f6c177", fontSize: 12, marginBottom: 6 }}>
                {warning}
              </div>
            ))}
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <tbody>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>Python</td>
                  <td style={{ padding: "4px 6px", direction: "ltr", textAlign: "left" }}>
                    {aiDiagnostics.pythonExecutable ?? aiDiagnostics.diagnostics?.pythonExecutable ?? "-"}
                  </td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>onnxruntime</td>
                  <td style={{ padding: "4px 6px" }}>
                    {aiDiagnostics.diagnostics?.onnxruntime?.available ? `available ${aiDiagnostics.diagnostics.onnxruntime.version ?? ""}` : "missing"}
                  </td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>DirectML package</td>
                  <td style={{ padding: "4px 6px" }}>
                    {aiDiagnostics.diagnostics?.onnxruntimeDirectml?.installed ? `installed ${aiDiagnostics.diagnostics.onnxruntimeDirectml.version ?? ""}` : "missing"}
                  </td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>Providers</td>
                  <td style={{ padding: "4px 6px" }}>{(aiDiagnostics.providers ?? []).join(", ") || "-"}</td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>Selected</td>
                  <td style={{ padding: "4px 6px" }}>
                    {aiDiagnostics.selectedProvider ?? aiDiagnostics.diagnostics?.onnxruntime?.selectedProvider ?? "-"}
                  </td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>torch</td>
                  <td style={{ padding: "4px 6px" }}>
                    {aiDiagnostics.diagnostics?.torch?.available ? `available ${aiDiagnostics.diagnostics.torch.version ?? ""}` : "missing"}
                  </td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                  <td style={{ padding: "4px 6px", opacity: 0.72 }}>mediapipe</td>
                  <td style={{ padding: "4px 6px" }}>
                    {aiDiagnostics.diagnostics?.mediapipe?.available ? `available ${aiDiagnostics.diagnostics.mediapipe.version ?? ""}` : "missing"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

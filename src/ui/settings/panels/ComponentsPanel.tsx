import { useEffect, useMemo, useState, type ReactElement } from "react";
import { CheckCircle2, Cloud, FolderOpen, Package, RefreshCw, RotateCcw, Trash2, Wrench } from "lucide-react";
import { useAppSettings } from "@/settings";
import { SettingsSection } from "../components";

type ComponentStatus = "installed" | "partial" | "missing" | "failed" | "cloud";

interface ComponentEntry {
  id: string;
  displayName: string;
  type: "core" | "optional" | "editor" | "cloud";
  defaultSelected: boolean;
  installOnFirstRun: boolean;
  installOnDemandOnly?: boolean;
  blocksLaunch: boolean;
  isOptional: boolean;
  requirements: string[];
  models: string[];
  toolIds: string[];
  estimatedSizeMB: number;
  removeSafe: boolean;
  status: ComponentStatus;
  signatureCurrent: boolean;
  lastError?: string;
  updatedAt?: string;
}

const STATUS_LABELS: Record<ComponentStatus, string> = {
  installed: "מותקן",
  partial: "חלקי",
  missing: "חסר",
  failed: "נכשל",
  cloud: "ענן"
};

const TYPE_LABELS: Record<ComponentEntry["type"], string> = {
  core: "בסיס",
  optional: "אופציונלי",
  editor: "עורך",
  cloud: "ענן"
};

function formatSize(sizeMb: number): string {
  if (!sizeMb) return "0 MB";
  if (sizeMb >= 1000) return `${(sizeMb / 1000).toFixed(1)} GB`;
  return `${Math.round(sizeMb)} MB`;
}

function statusClass(status: ComponentStatus): string {
  return `component-status component-status-${status}`;
}

export function ComponentsPanel(): ReactElement {
  const [components, setComponents] = useState<ComponentEntry[]>([]);
  const [paths, setPaths] = useState({ logsDir: "", modelsDir: "" });
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const updateComponentsSettings = useAppSettings((s) => s.updateComponents);
  const lastCheckedAt = useAppSettings((s) => s.settings.components.lastCheckedAt);

  const sortedComponents = useMemo(() => {
    const order = ["core", "editor-light", "smart-selection", "content-aware-fill", "face-detection", "editor-heavy-ai", "cloud-ai"];
    return [...components].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [components]);

  async function refresh(): Promise<void> {
    if (!window.spp?.components) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await window.spp.components.list();
      if (!result.success) throw new Error(result.error || "טעינת הרכיבים נכשלה");
      setComponents(result.components as ComponentEntry[]);
      setPaths({ logsDir: result.logsDir, modelsDir: result.modelsDir });
      updateComponentsSettings({ lastCheckedAt: new Date().toISOString() });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runAction(id: string, action: "install" | "repair" | "remove" | "health"): Promise<void> {
    if (!window.spp?.components) return;
    setBusyId(id);
    setMessage("");
    try {
      const api = window.spp.components;
      const result =
        action === "install" ? await api.install(id) :
        action === "repair" ? await api.repair(id) :
        action === "remove" ? await api.remove(id) :
        await api.health(id);
      if ("error" in result && result.error) throw new Error(result.error);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div>
      <SettingsSection
        title="רכיבים ומודלים"
        description="ניהול סביבת Python, רכיבי AI ומודלים מקומיים. רכיבים כבדים מותקנים רק לפי דרישה."
      >
        <div className="component-manager-toolbar">
          <div className="component-manager-summary">
            <Package size={16} />
            <span>{components.length} רכיבים</span>
            {lastCheckedAt && <span className="component-manager-muted">בדיקה אחרונה: {new Date(lastCheckedAt).toLocaleString("he-IL")}</span>}
          </div>
          <div className="component-manager-actions">
            <button type="button" className="btn btn-ghost" onClick={() => void window.spp?.components?.openLogs()} title={paths.logsDir || "פתח לוגים"}>
              <FolderOpen size={13} />
              לוגים
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void window.spp?.components?.openModels()} title={paths.modelsDir || "פתח מודלים"}>
              <FolderOpen size={13} />
              מודלים
            </button>
            <button type="button" className="btn btn-accent" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw size={13} />
              רענן
            </button>
          </div>
        </div>

        {message && <div className="component-manager-error">{message}</div>}

        <div className="component-list">
          {sortedComponents.map((component) => {
            const busy = busyId === component.id;
            const canInstall = component.status === "missing" || component.status === "failed" || component.status === "partial";
            return (
              <div className="component-row" key={component.id}>
                <div className="component-row-main">
                  <div className="component-row-title">
                    {component.type === "cloud" ? <Cloud size={16} /> : <Package size={16} />}
                    <strong>{component.displayName}</strong>
                    <span className="component-type">{TYPE_LABELS[component.type]}</span>
                    <span className={statusClass(component.status)}>{STATUS_LABELS[component.status]}</span>
                  </div>
                  <div className="component-row-meta">
                    <span>{formatSize(component.estimatedSizeMB)}</span>
                    {component.installOnFirstRun && <span>מותקן בהרצה ראשונה</span>}
                    {component.installOnDemandOnly && <span>לפי דרישה בלבד</span>}
                    {component.blocksLaunch && <span>נדרש להפעלה</span>}
                  </div>
                  {component.lastError && <div className="component-row-error">{component.lastError}</div>}
                  {component.toolIds.length > 0 && (
                    <div className="component-tool-list">
                      {component.toolIds.map((tool: string) => <span key={tool}>{tool}</span>)}
                    </div>
                  )}
                </div>
                <div className="component-row-actions">
                  <button type="button" className="icon-btn" title="בדוק" disabled={busy} onClick={() => void runAction(component.id, "health")}>
                    <CheckCircle2 size={14} />
                  </button>
                  {canInstall ? (
                    <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void runAction(component.id, "install")}>
                      <Wrench size={13} />
                      התקן
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost" disabled={busy || component.type === "cloud"} onClick={() => void runAction(component.id, "repair")}>
                      <RotateCcw size={13} />
                      תקן
                    </button>
                  )}
                  {component.removeSafe && (
                    <button type="button" className="icon-btn danger" title="הסר חתימת התקנה" disabled={busy} onClick={() => void runAction(component.id, "remove")}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}

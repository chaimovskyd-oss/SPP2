import type { ReactElement } from "react";
import { FolderOpen, FileDown, FileUp, RefreshCw, AlertTriangle } from "lucide-react";
import { useAppSettings } from "@/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";

export function AdvancedPanel(): ReactElement {
  const advanced = useAppSettings((s) => s.settings.advanced);
  const updateAdvanced = useAppSettings((s) => s.updateAdvanced);
  const exportSettings = useAppSettings((s) => s.exportSettings);
  const importSettings = useAppSettings((s) => s.importSettings);
  const resetAll = useAppSettings((s) => s.resetAll);

  function handleExportSettings(): void {
    const json = exportSettings();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spp2-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportSettings(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const json = reader.result as string;
        const result = importSettings(json);
        if (result.success) {
          window.alert("הגדרות יובאו בהצלחה!");
        } else {
          window.alert(`שגיאה בייבוא: ${result.error ?? "שגיאה לא ידועה"}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function handleResetAll(): void {
    if (!window.confirm("לאפס את כל ההגדרות לברירת המחדל?\n\nפעולה זו אינה ניתנת לביטול.")) return;
    resetAll();
    window.alert("כל ההגדרות אופסו לברירת המחדל.");
  }

  return (
    <div>
      <SettingsSection title="ייצוא/ייבוא הגדרות" description="גיבוי והעברת הגדרות בין מחשבים.">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">ייצוא הגדרות</span>
            <div className="settings-row-desc">שמור את כל ההגדרות לקובץ JSON.</div>
          </div>
          <div className="settings-row-control">
            <button type="button" className="btn btn-ghost" onClick={handleExportSettings}>
              <FileDown size={13} />
              ייצוא
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">ייבוא הגדרות</span>
            <div className="settings-row-desc">טען הגדרות מקובץ JSON. הגדרות נוכחיות יוחלפו.</div>
          </div>
          <div className="settings-row-control">
            <button type="button" className="btn btn-ghost" onClick={handleImportSettings}>
              <FileUp size={13} />
              ייבוא
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="תיקיות ולוגים" description="גישה לקבצי מערכת ולוגים.">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">פתח תיקיית לוגים</span>
          </div>
          <div className="settings-row-control">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { /* TODO: window.spp?.openLogsFolder?.() */ }}
            >
              <FolderOpen size={13} />
              פתח
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">פתח קובץ הגדרות</span>
          </div>
          <div className="settings-row-control">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { /* TODO: window.spp?.openSettingsFile?.() */ }}
            >
              <FolderOpen size={13} />
              פתח
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="אבחון ופיתוח">
        <SettingsRow label="מצב Debug" description="הצג לוגים מורחבים ואפשרויות פיתוח.">
          <SettingsToggle
            value={advanced.debugMode}
            onChange={(v) => updateAdvanced({ debugMode: v })}
          />
        </SettingsRow>

        <SettingsRow label="אפשר אבחונים" description="שלח נתוני שגיאות אנונימיים לשיפור האפליקציה.">
          <SettingsToggle
            value={advanced.enableDiagnostics}
            onChange={(v) => updateAdvanced({ enableDiagnostics: v })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="תיקון ושיחזור" description="כלי תחזוקה.">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">בנה מחדש תמונות תצוגה מקדימה</span>
            <div className="settings-row-desc">בנה מחדש את כל תמונות המיניאטורה.</div>
          </div>
          <div className="settings-row-control">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { /* TODO: trigger thumbnail rebuild */ }}
            >
              <RefreshCw size={13} />
              בנה מחדש
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="אפס הכל" danger>
        <div style={{ padding: "8px 0 12px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
            <AlertTriangle size={16} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              איפוס כל ההגדרות יחזיר את כל הקטגוריות לברירת המחדל המקורית. פרויקטים לא יימחקו.
            </p>
          </div>
          <button type="button" className="btn btn-danger" onClick={handleResetAll}>
            <AlertTriangle size={13} />
            אפס את כל ההגדרות
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}

import type { ReactElement } from "react";
import { FolderOpen, ExternalLink } from "lucide-react";
import { useAppSettings } from "@/settings";
import { useUtilitiesSettings } from "@/utilities/settingsStore";
import type { ExternalAppKey } from "@/utilities/settingsStore";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";

const SOON = <span className="settings-coming-soon">בקרוב</span>;

const PATH_LABELS: Record<ExternalAppKey, string> = {
  photoshopPath: "Photoshop",
  colorLabPath: "ColorLab",
  pdfEditorPath: "עורך PDF",
  collageEditorPath: "עורך קולאז׳",
  projectsFolder: "תיקיית פרויקטים",
  exportsFolder: "תיקיית ייצוא",
  tempEditingFolder: "תיקייה זמנית לעריכה"
};

const PATH_IS_FOLDER: Record<ExternalAppKey, boolean> = {
  photoshopPath: false,
  colorLabPath: false,
  pdfEditorPath: false,
  collageEditorPath: false,
  projectsFolder: true,
  exportsFolder: true,
  tempEditingFolder: true
};

const ALL_PATH_KEYS: ExternalAppKey[] = [
  "photoshopPath", "colorLabPath", "pdfEditorPath", "collageEditorPath",
  "projectsFolder", "exportsFolder", "tempEditingFolder"
];

export function FilesPanel(): ReactElement {
  const files = useAppSettings((s) => s.settings.filesAutosave);
  const update = useAppSettings((s) => s.updateFilesAutosave);
  const legacyStore = useUtilitiesSettings();

  function handlePathChange(key: ExternalAppKey, value: string): void {
    update({ [key]: value });
    // Bridge: keep the legacy store in sync so existing callers don't break
    legacyStore.setPath(key, value);
  }

  function openFolder(path: string): void {
    if (path) void window.spp?.openFolder?.(path);
  }

  return (
    <div>
      <SettingsSection title="שמירה אוטומטית" description="הגדרות שמירה אוטומטית לפרויקטים פתוחים.">
        <SettingsRow label="שמירה אוטומטית מופעלת">
          <SettingsToggle
            value={files.autosaveEnabled}
            onChange={(v) => update({ autosaveEnabled: v })}
          />
        </SettingsRow>

        <SettingsRow label={<>שמור כל X דקות {SOON}</>} description="יחובר למנגנון השמירה האוטומטית.">
          <input
            type="number"
            className="settings-number-input"
            value={files.autosaveIntervalMinutes}
            min={1} max={60} step={1}
            disabled={!files.autosaveEnabled}
            onChange={(e) => update({ autosaveIntervalMinutes: parseInt(e.target.value) || 3 })}
          />
        </SettingsRow>

        <SettingsRow label={<>שמור אחרי X פעולות {SOON}</>} description="יחובר למנגנון השמירה האוטומטית.">
          <input
            type="number"
            className="settings-number-input"
            value={files.autosaveAfterActions}
            min={1} max={100} step={1}
            disabled={!files.autosaveEnabled}
            onChange={(e) => update({ autosaveAfterActions: parseInt(e.target.value) || 20 })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="גיבויים">
        <SettingsRow label="שמור גרסאות גיבוי">
          <SettingsToggle value={files.keepBackupVersions} onChange={(v) => update({ keepBackupVersions: v })} />
        </SettingsRow>

        <SettingsRow label="מספר גרסאות לשמירה">
          <input
            type="number"
            className="settings-number-input"
            value={files.backupVersionCount}
            min={1} max={20} step={1}
            disabled={!files.keepBackupVersions}
            onChange={(e) => update({ backupVersionCount: parseInt(e.target.value) || 5 })}
          />
        </SettingsRow>

        <SettingsRow label="פרויקטים אחרונים לזכור">
          <input
            type="number"
            className="settings-number-input"
            value={files.recentProjectsCount}
            min={5} max={50} step={1}
            onChange={(e) => update({ recentProjectsCount: parseInt(e.target.value) || 20 })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="אחסון קבצים">
        <SettingsRow label="מצב אחסון פרויקט ברירת מחדל" description="כיצד לשמור תמונות בפרויקטים חדשים.">
          <select
            className="settings-select"
            value={files.projectStorageMode}
            onChange={(e) => update({ projectStorageMode: e.target.value as "linked" | "embedded" | "ask" })}
          >
            <option value="linked">קישורי תמונות (Linked)</option>
            <option value="embedded">הטמעת תמונות (Embedded)</option>
            <option value="ask">שאל בכל פרויקט</option>
          </select>
        </SettingsRow>

        <SettingsRow label="אזהרה על תמונה מקושרת חסרה">
          <SettingsToggle value={files.warnMissingLinkedImage} onChange={(v) => update({ warnMissingLinkedImage: v })} />
        </SettingsRow>

        <SettingsRow label="שמור תמונת מיניאטורה עם הפרויקט">
          <SettingsToggle value={files.saveProjectThumbnail} onChange={(v) => update({ saveProjectThumbnail: v })} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={<>מטמון (Cache) {SOON}</>} description="ניהול קבצי מטמון. כלי המטמון יהיו זמינים בגרסה עתידית.">
        <SettingsRow label="נקה מטמון אוטומטית כל X ימים">
          <input
            type="number"
            className="settings-number-input"
            value={files.autoClearCacheDays}
            min={0} max={365} step={1}
            onChange={(e) => update({ autoClearCacheDays: parseInt(e.target.value) || 30 })}
          />
        </SettingsRow>

        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">פעולות מטמון <span className="settings-coming-soon">בקרוב</span></span>
          </div>
          <div className="settings-row-control" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost" disabled title="בקרוב">
              נקה מטמון
            </button>
            <button type="button" className="btn btn-ghost" disabled title="בקרוב">
              <FolderOpen size={13} />
              פתח תיקייה
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="נתיבי תוכנות חיצוניות" description="נתיבי הפעלה לתוכנות חיצוניות ותיקיות עבודה. שינויים חלים מיד.">
        {ALL_PATH_KEYS.map((key) => {
          const value = (files[key] as string) || "";
          const isFolder = PATH_IS_FOLDER[key];
          return (
            <div className="settings-row" key={key}>
              <div className="settings-row-label">
                <span className="settings-row-name">{PATH_LABELS[key]}</span>
                <div className="settings-row-desc">{isFolder ? "תיקייה" : "קובץ הרצה (.exe)"}</div>
              </div>
              <div className="settings-row-control" style={{ gap: 6 }}>
                <input
                  type="text"
                  className="settings-text-input"
                  value={value}
                  onChange={(e) => handlePathChange(key, e.target.value)}
                  placeholder={isFolder ? "C:\\..." : "C:\\...\\app.exe"}
                  style={{ direction: "ltr", textAlign: "right", minWidth: 200 }}
                />
                {value && isFolder && (
                  <button type="button" className="icon-btn" title="פתח תיקייה" onClick={() => openFolder(value)}>
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </SettingsSection>
    </div>
  );
}

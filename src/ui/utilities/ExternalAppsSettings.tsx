import { FolderOpen, Search, X } from "lucide-react";
import { useState, type ReactElement } from "react";
import {
  useUtilitiesSettings,
  EXTERNAL_APP_LABELS,
  EXTERNAL_APP_ICONS,
  EXTERNAL_APP_IS_FOLDER,
  type ExternalAppKey
} from "@/utilities/settingsStore";

interface ExternalAppsSettingsProps {
  onClose: () => void;
}

const PATH_ORDER: ExternalAppKey[] = [
  "photoshopPath",
  "colorLabPath",
  "pdfEditorPath",
  "collageEditorPath",
  "projectsFolder",
  "exportsFolder",
  "tempEditingFolder"
];

export function ExternalAppsSettings({ onClose }: ExternalAppsSettingsProps): ReactElement {
  const settings = useUtilitiesSettings();
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState("");

  async function detectPhotoshop(): Promise<void> {
    if (!window.spp?.detectPhotoshop) return;
    setDetecting(true);
    setDetectMsg("");
    const result = await window.spp.detectPhotoshop();
    if (result.path) {
      settings.setPath("photoshopPath", result.path);
      setDetectMsg(`נמצא: ${result.path}`);
    } else {
      setDetectMsg("Photoshop לא נמצא אוטומטית — הגדר ידנית.");
    }
    setDetecting(false);
  }

  function handleOpenFolder(key: ExternalAppKey): void {
    const val = settings[key];
    if (!val || !window.spp?.openFolder) return;
    void window.spp.openFolder(val);
  }

  return (
    <div className="util-panel settings-panel" role="dialog" aria-label="הגדרות אפליקציות חיצוניות">
      <div className="util-panel-header">
        <span>⚙️ External Apps & Paths</span>
        <button className="icon-btn" onClick={onClose} type="button"><X size={15} /></button>
      </div>
      <div className="util-panel-body settings-body">
        {PATH_ORDER.map((key) => {
          const isFolder = EXTERNAL_APP_IS_FOLDER[key];
          return (
            <div className="settings-field-row" key={key}>
              <label className="settings-field-label">
                <span>{EXTERNAL_APP_ICONS[key]}</span>
                {EXTERNAL_APP_LABELS[key]}
              </label>
              <div className="settings-field-input-row">
                <input
                  className="util-input settings-path-input"
                  placeholder={isFolder ? "נתיב לתיקייה..." : "נתיב לאפליקציה או URL..."}
                  value={settings[key]}
                  onChange={(e) => settings.setPath(key, e.target.value)}
                />
                {isFolder && (
                  <button
                    className="icon-btn"
                    title="פתח תיקייה"
                    onClick={() => handleOpenFolder(key)}
                    disabled={!settings[key]}
                    type="button"
                  >
                    <FolderOpen size={15} />
                  </button>
                )}
                {key === "photoshopPath" && (
                  <button
                    className="icon-btn"
                    title="זיהוי אוטומטי"
                    onClick={() => void detectPhotoshop()}
                    disabled={detecting}
                    type="button"
                  >
                    <Search size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {detectMsg && (
          <p className={`settings-detect-msg ${detectMsg.startsWith("נמצא") ? "success" : "warning"}`}>
            {detectMsg}
          </p>
        )}

        <div className="settings-footer">
          <button className="btn btn-ghost" onClick={settings.reset} type="button">אפס הכל</button>
          <button className="btn btn-accent" onClick={onClose} type="button">שמור וסגור</button>
        </div>
      </div>
    </div>
  );
}

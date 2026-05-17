import type { ReactElement } from "react";
import { useAppSettings } from "@/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";

const SOON = <span className="settings-coming-soon">בקרוב</span>;

export function ExportPanel(): ReactElement {
  const exp = useAppSettings((s) => s.settings.exportPrint);
  const update = useAppSettings((s) => s.updateExportPrint);

  return (
    <div>
      <SettingsSection title="הגדרות ייצוא ברירת מחדל" description="ערכי ברירת מחדל לייצוא קבצים.">
        <SettingsRow label="פורמט ייצוא ברירת מחדל">
          <select
            className="settings-select"
            value={exp.defaultExportFormat}
            onChange={(e) => update({ defaultExportFormat: e.target.value as "pdf" | "png" | "jpg" })}
          >
            <option value="pdf">PDF</option>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </SettingsRow>

        <SettingsRow label="DPI ברירת מחדל" description="300 DPI מומלץ להדפסה.">
          <select
            className="settings-select"
            value={exp.defaultDpi}
            onChange={(e) => update({ defaultDpi: parseInt(e.target.value) })}
          >
            <option value={72}>72 DPI (מסך)</option>
            <option value={150}>150 DPI</option>
            <option value={300}>300 DPI (הדפסה)</option>
            <option value={600}>600 DPI (הדפסה מדויקת)</option>
          </select>
        </SettingsRow>

        <SettingsRow label="איכות JPG" description="אחוז איכות לפורמט JPG.">
          <div className="settings-slider-wrap">
            <input
              type="range"
              className="settings-slider"
              min={10} max={100} step={5}
              value={exp.jpgQuality}
              onChange={(e) => update({ jpgQuality: parseInt(e.target.value) })}
            />
            <span className="settings-slider-value">{exp.jpgQuality}%</span>
          </div>
        </SettingsRow>

        <SettingsRow label="שקיפות ב-PNG" description="אפשר שכבת שקיפות בייצוא PNG.">
          <SettingsToggle value={exp.pngTransparency} onChange={(v) => update({ pngTransparency: v })} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="כיווץ וסימוני חיתוך">
        <SettingsRow label="כלול כיווץ (Bleed) בייצוא">
          <SettingsToggle value={exp.includeBleedInExport} onChange={(v) => update({ includeBleedInExport: v })} />
        </SettingsRow>

        <SettingsRow label={<>כלול סימוני חיתוך (Crop Marks) {SOON}</>} description="יחובר לייצוא PDF.">
          <SettingsToggle value={exp.includeCropMarks} onChange={(v) => update({ includeCropMarks: v })} disabled />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="תיקיית ייצוא ופעולות">
        <SettingsRow label="תיקיית ייצוא ברירת מחדל" description="ריק = שאל בכל פעם.">
          <input
            type="text"
            className="settings-text-input"
            value={exp.defaultExportFolder}
            onChange={(e) => update({ defaultExportFolder: e.target.value })}
            placeholder="ריק = שאל בכל פעם"
            style={{ direction: "ltr", textAlign: "right" }}
          />
        </SettingsRow>

        <SettingsRow label="פתח תיקייה לאחר ייצוא">
          <SettingsToggle value={exp.openFolderAfterExport} onChange={(v) => update({ openFolderAfterExport: v })} />
        </SettingsRow>

        <SettingsRow label={<>פעולה לאחר ייצוא {SOON}</>}>
          <select
            className="settings-select"
            value={exp.afterExportBehavior}
            onChange={(e) => update({ afterExportBehavior: e.target.value as "nothing" | "openFolder" | "openFile" })}
            disabled
          >
            <option value="nothing">ללא פעולה</option>
            <option value="openFolder">פתח תיקיית ייצוא</option>
            <option value="openFile">פתח קובץ שיוצא</option>
          </select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={<>הדפסה {SOON}</>} description="הגדרות פרופיל הדפסה יתווספו בגרסאות עתידיות.">
        <div className="settings-info-box">
          פרופיל הדפסה מותאם, פיצוי צבעים לסובלימציה ובחירת מדפסת יתווספו בגרסאות עתידיות.
        </div>
      </SettingsSection>
    </div>
  );
}

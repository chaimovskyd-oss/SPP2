import type { ReactElement } from "react";
import { useAppSettings } from "@/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";

export function PerformancePanel(): ReactElement {
  const perf = useAppSettings((s) => s.settings.performance);
  const update = useAppSettings((s) => s.updatePerformance);

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
    </div>
  );
}

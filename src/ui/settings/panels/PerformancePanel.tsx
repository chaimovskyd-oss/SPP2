import type { ReactElement } from "react";
import { useAppSettings } from "@/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";

const SOON = <span className="settings-coming-soon">בקרוב</span>;

export function PerformancePanel(): ReactElement {
  const perf = useAppSettings((s) => s.settings.performance);
  const update = useAppSettings((s) => s.updatePerformance);

  return (
    <div>
      <SettingsSection title="איכות תצוגה" description="איכות תצוגה מקדימה בזמן עריכה.">
        <SettingsRow label={<>איכות תצוגה מקדימה {SOON}</>} description="יחובר למנוע הרינדור בגרסה עתידית.">
          <select
            className="settings-select"
            value={perf.previewQuality}
            onChange={(e) => update({ previewQuality: e.target.value as "low" | "medium" | "high" })}
          >
            <option value="low">נמוכה — מהיר יותר</option>
            <option value="medium">בינונית</option>
            <option value="high">גבוהה — מדויק יותר</option>
          </select>
        </SettingsRow>

        <SettingsRow label={<>איכות ייצוא סופי {SOON}</>} description="יחובר לצינור הייצוא בגרסה עתידית.">
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
          label={<>הפחת איכות בזמן גרירה {SOON}</>}
          description="תצוגה ברזולוציה נמוכה בגרירה, ואיכות מלאה לאחר שחרור."
        >
          <SettingsToggle value={perf.lowResWhileDragging} onChange={(v) => update({ lowResWhileDragging: v })} disabled />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="זיכרון ועיבוד">
        <SettingsRow
          label={<>הפעלת האצת GPU {SOON}</>}
          description="מומלץ למחשבים עם כרטיס מסך ייעודי."
        >
          <SettingsToggle value={perf.enableGpuAcceleration} onChange={(v) => update({ enableGpuAcceleration: v })} disabled />
        </SettingsRow>

        <SettingsRow
          label={<>גודל תמונת תצוגה מקסימלי (px) {SOON}</>}
          description="מגביל גודל תמונות לתצוגה מקדימה."
        >
          <select
            className="settings-select"
            value={perf.maxPreviewSizePx}
            onChange={(e) => update({ maxPreviewSizePx: parseInt(e.target.value) })}
            disabled
          >
            <option value={1024}>1024px</option>
            <option value={2048}>2048px</option>
            <option value={4096}>4096px</option>
            <option value={8192}>ללא הגבלה</option>
          </select>
        </SettingsRow>

        <SettingsRow
          label={<>מגבלת היסטוריית ביטול {SOON}</>}
          description="כמות הפעולות הניתנות לביטול. יחובר למנוע ההיסטוריה."
        >
          <select
            className="settings-select"
            value={perf.undoHistoryLimit}
            onChange={(e) => update({ undoHistoryLimit: parseInt(e.target.value) })}
            disabled
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
            min={10} max={500} step={10}
            onChange={(e) => update({ warnLargeFileMb: parseInt(e.target.value) || 50 })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="מצב ביצועים">
        <SettingsRow
          label={<>מצב ביצועים {SOON}</>}
          description="מפחית אפקטים ואנימציות לשיפור ביצועים."
        >
          <SettingsToggle value={perf.performanceMode} onChange={(v) => update({ performanceMode: v })} disabled />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

import type { ReactElement } from "react";
import { useAppSettings } from "@/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";

export function PerformancePanel(): ReactElement {
  const perf = useAppSettings((s) => s.settings.performance);
  const update = useAppSettings((s) => s.updatePerformance);

  return (
    <div>
      <SettingsSection title="איכות תצוגה" description="איכות תצוגה מקדימה בזמן עריכה.">
        <SettingsRow label="איכות תצוגה מקדימה">
          <select
            className="settings-select"
            value={perf.previewQuality}
            onChange={(e) => update({ previewQuality: e.target.value as "low" | "medium" | "high" })}
          >
            <option value="low">נמוכה — מהיר יותר</option>
            <option value="medium">בינונית</option>
            <option value="high">גבוהה — מדויק יותר</option>
          </select>
          {/* TODO: wire to image preview rendering */}
        </SettingsRow>

        <SettingsRow label="איכות ייצוא סופי">
          <select
            className="settings-select"
            value={perf.renderQuality}
            onChange={(e) => update({ renderQuality: e.target.value as "standard" | "high" | "print" })}
          >
            <option value="standard">רגיל</option>
            <option value="high">גבוה</option>
            <option value="print">הדפסה (300 DPI)</option>
          </select>
          {/* TODO: wire to export pipeline */}
        </SettingsRow>

        <SettingsRow
          label="הפחת איכות בזמן גרירה"
          description="הצג רזולוציה נמוכה בזמן גרירה, ואיכות מלאה לאחר שחרור."
        >
          <SettingsToggle
            value={perf.lowResWhileDragging}
            onChange={(v) => update({ lowResWhileDragging: v })}
          />
          {/* TODO: wire to Konva drag events */}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="זיכרון ועיבוד" description="הגבלת שימוש בזיכרון ובמעבד.">
        <SettingsRow
          label="הפעלת האצת GPU"
          description="מומלץ למחשבים עם כרטיס מסך ייעודי. ייתכן שיידרש הפעלה מחדש."
        >
          <SettingsToggle
            value={perf.enableGpuAcceleration}
            onChange={(v) => update({ enableGpuAcceleration: v })}
          />
          {/* TODO: wire to Electron GPU settings / Konva pixelRatio */}
        </SettingsRow>

        <SettingsRow
          label="גודל תמונת תצוגה מקסימלי (px)"
          description="מגביל גודל תמונות טעונות לתצוגה מקדימה."
        >
          <select
            className="settings-select"
            value={perf.maxPreviewSizePx}
            onChange={(e) => update({ maxPreviewSizePx: parseInt(e.target.value) })}
          >
            <option value={1024}>1024px</option>
            <option value={2048}>2048px</option>
            <option value={4096}>4096px</option>
            <option value={8192}>ללא הגבלה</option>
          </select>
          {/* TODO: wire to assetManager preview generation */}
        </SettingsRow>

        <SettingsRow
          label="מגבלת היסטוריית ביטול"
          description="כמות הפעולות הניתנות לביטול."
          note="(TODO: חיבור למנוע)"
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
          {/* TODO: wire to documentStore history limit */}
        </SettingsRow>

        <SettingsRow
          label="אזהרה בפתיחת קבצים גדולים (MB)"
          description="הצג אזהרה לפני טעינת קובץ גדול."
        >
          <input
            type="number"
            className="settings-number-input"
            value={perf.warnLargeFileMb}
            min={10} max={500} step={10}
            onChange={(e) => update({ warnLargeFileMb: parseInt(e.target.value) || 50 })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="מצב ביצועים" description="הגדרות למחשבים חלשים יותר.">
        <SettingsRow
          label="מצב ביצועים"
          description="מפחית אפקטים ואנימציות לשיפור ביצועים."
        >
          <SettingsToggle
            value={perf.performanceMode}
            onChange={(v) => update({ performanceMode: v })}
          />
          {/* TODO: wire to global performance CSS class / Konva settings */}
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

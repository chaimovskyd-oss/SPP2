import type { ReactElement } from "react";
import { useAppSettings } from "@/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";

export function PassportPanel(): ReactElement {
  const passport = useAppSettings((s) => s.settings.passport);
  const update = useAppSettings((s) => s.updatePassport);

  return (
    <div>
      <div className="settings-info-box">
        הגדרות הפספורט יחולו על מצב פספורט בלבד — הן לא ישפיעו על שאר מצבי העריכה.
        תכונות אלו תהיינה זמינות ברגע שמצב פספורט יהיה מוכן.
      </div>

      <SettingsSection title="ברירת מחדל לפספורט" description="הגדרות ברירת מחדל למצב עריכת תמונות פספורט.">
        <SettingsRow
          label="פריסת פספורט ברירת מחדל"
          description="הפריסה שתיבחר אוטומטית בפתיחת מצב פספורט."
        >
          <select
            className="settings-select"
            value={passport.defaultPresetId}
            onChange={(e) => update({ defaultPresetId: e.target.value })}
          >
            <option value="il-passport">פספורט ישראלי (35×45 מ״מ)</option>
            <option value="us-passport">פספורט אמריקאי (2×2 אינץ׳)</option>
            <option value="eu-passport">פספורט אירופי (35×45 מ״מ)</option>
            <option value="il-visa">ויזה ישראלית (35×45 מ״מ)</option>
            <option value="il-id">תעודת זהות ישראלית (30×40 מ״מ)</option>
            {/* TODO: expand list when Passport Mode is fully implemented */}
          </select>
        </SettingsRow>

        <SettingsRow
          label="זכור פריסה אחרונה"
          description="פתח עם הפריסה שנבחרה לאחרונה."
        >
          <SettingsToggle
            value={passport.rememberLastPreset}
            onChange={(v) => update({ rememberLastPreset: v })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="אימות ועזרים" description="לוחות אימות והמלצות קומפוזיציה.">
        <SettingsRow
          label="הצג לוח אימות"
          description="פנל בדיקת תקינות תמונת הפספורט (גודל ראש, פנים, רקע)."
        >
          <SettingsToggle
            value={passport.showValidationPanel}
            onChange={(v) => update({ showValidationPanel: v })}
          />
          {/* TODO: connect to PassportValidationPanel when mode is built */}
        </SettingsRow>

        <SettingsRow
          label="הצג המלצות קומפוזיציה"
          description="קווי עזר לקומפוזיציה — קו עיניים, מיקום ראש."
        >
          <SettingsToggle
            value={passport.showCompositionRecommendations}
            onChange={(v) => update({ showCompositionRecommendations: v })}
          />
          {/* TODO: connect to composition guide overlay */}
        </SettingsRow>

        <SettingsRow
          label="הצג קווי עזר על התמונה"
          description="קווי עזר ויזואליים על פי תקן."
        >
          <SettingsToggle
            value={passport.showGuideLines}
            onChange={(v) => update({ showGuideLines: v })}
          />
        </SettingsRow>

        <SettingsRow
          label="רמת קפדנות אימות"
          description="נורמלי — אזהרות. קפדן — שגיאות שמונעות ייצוא."
        >
          <select
            className="settings-select"
            value={passport.validationStrictness}
            onChange={(e) => update({ validationStrictness: e.target.value as "normal" | "strict" })}
          >
            <option value="normal">נורמלי — הצג אזהרות</option>
            <option value="strict">קפדן — חסום ייצוא</option>
          </select>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

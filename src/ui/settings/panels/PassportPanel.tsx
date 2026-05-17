import type { ReactElement } from "react";
import { useAppSettings } from "@/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";

const SOON = <span className="settings-coming-soon">בקרוב</span>;

export function PassportPanel(): ReactElement {
  const passport = useAppSettings((s) => s.settings.passport);
  const update = useAppSettings((s) => s.updatePassport);

  return (
    <div>
      <div className="settings-info-box">
        <strong>הגדרות הפספורט {SOON}</strong>
        <br />
        כל הגדרות הפאנל הזה יחולו על מצב פספורט בלבד. מצב פספורט נמצא בפיתוח ויהיה זמין בגרסה עתידית.
        ההגדרות נשמרות עכשיו ויהיו פעילות כאשר המצב יושק.
      </div>

      <SettingsSection title={<>ברירת מחדל לפספורט {SOON}</>} description="הגדרות ברירת מחדל למצב עריכת תמונות פספורט.">
        <SettingsRow label="פריסת פספורט ברירת מחדל">
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
          </select>
        </SettingsRow>

        <SettingsRow label="זכור פריסה אחרונה">
          <SettingsToggle value={passport.rememberLastPreset} onChange={(v) => update({ rememberLastPreset: v })} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={<>אימות ועזרים {SOON}</>}>
        <SettingsRow label="הצג לוח אימות" description="פנל בדיקת תקינות תמונת הפספורט.">
          <SettingsToggle value={passport.showValidationPanel} onChange={(v) => update({ showValidationPanel: v })} />
        </SettingsRow>

        <SettingsRow label="הצג המלצות קומפוזיציה">
          <SettingsToggle value={passport.showCompositionRecommendations} onChange={(v) => update({ showCompositionRecommendations: v })} />
        </SettingsRow>

        <SettingsRow label="הצג קווי עזר על התמונה">
          <SettingsToggle value={passport.showGuideLines} onChange={(v) => update({ showGuideLines: v })} />
        </SettingsRow>

        <SettingsRow label="רמת קפדנות אימות">
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

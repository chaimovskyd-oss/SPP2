import type { ReactElement } from "react";
import { useAppSettings } from "@/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";

export function GeneralPanel(): ReactElement {
  const general = useAppSettings((s) => s.settings.general);
  const update = useAppSettings((s) => s.updateGeneral);

  return (
    <div>
      <SettingsSection title="כללי" description="הגדרות ברירת מחדל כלליות של האפליקציה.">
        <SettingsRow label="יחידת מידה ברירת מחדל" description="יחידה המשמשת לכל הגדרות הגודל.">
          <select
            className="settings-select"
            value={general.defaultUnit}
            onChange={(e) => update({ defaultUnit: e.target.value as "mm" | "cm" | "inch" | "px" })}
          >
            <option value="mm">מ״מ (mm)</option>
            <option value="cm">ס״מ (cm)</option>
            <option value="inch">אינץ׳ (inch)</option>
            <option value="px">פיקסלים (px)</option>
          </select>
        </SettingsRow>

        <SettingsRow label="מסך פתיחה" description="מה יוצג בעת הפעלת האפליקציה.">
          <select
            className="settings-select"
            value={general.startupBehavior}
            onChange={(e) => update({ startupBehavior: e.target.value as "home" | "lastProject" | "recentProjects" })}
          >
            <option value="home">מסך הבית</option>
            <option value="lastProject">פרויקט אחרון</option>
            <option value="recentProjects">פרויקטים אחרונים</option>
          </select>
        </SettingsRow>

        <SettingsRow
          label="תיקיית פרויקטים ברירת מחדל"
          description="המיקום בו יישמרו פרויקטים חדשים."
          note="(ניתן לשינוי בהמשך)"
        >
          <input
            type="text"
            className="settings-text-input"
            value={general.defaultProjectFolder}
            onChange={(e) => update({ defaultProjectFolder: e.target.value })}
            placeholder="לא הוגדר"
            style={{ direction: "ltr", textAlign: "right" }}
          />
          {/* TODO: add window.spp?.pickFolder?.() button when IPC is ready */}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="פרטי לקוח ברירת מחדל"
        description="שדות שיוצגו בחלון פרטי הלקוח בפרויקטים חדשים."
      >
        <SettingsRow label="שם לקוח" description="הצג שדה שם לקוח.">
          <SettingsToggle
            value={general.customerNameEnabled}
            onChange={(v) => update({ customerNameEnabled: v })}
          />
        </SettingsRow>

        <SettingsRow label="טלפון" description="הצג שדה מספר טלפון.">
          <SettingsToggle
            value={general.customerPhoneEnabled}
            onChange={(v) => update({ customerPhoneEnabled: v })}
          />
        </SettingsRow>

        <SettingsRow label="דוא״ל" description="הצג שדה כתובת דוא״ל.">
          <SettingsToggle
            value={general.customerEmailEnabled}
            onChange={(v) => update({ customerEmailEnabled: v })}
          />
        </SettingsRow>

        <SettingsRow label="שמור סוג פרויקט" description="שמור את סוג/מצב הפרויקט יחד עם הפרויקט.">
          <SettingsToggle
            value={general.saveProjectType}
            onChange={(v) => update({ saveProjectType: v })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="תבנית שם קובץ ברירת מחדל"
        description="שם שיוצע אוטומטית בעת שמירה. ניתן להשתמש במשתנים: customerName, date, projectType."
      >
        <SettingsRow label="תבנית שם">
          <input
            type="text"
            className="settings-text-input"
            value={general.defaultFileNamingPattern}
            onChange={(e) => update({ defaultFileNamingPattern: e.target.value })}
            style={{ minWidth: 240 }}
            placeholder="customerName-date-projectType"
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

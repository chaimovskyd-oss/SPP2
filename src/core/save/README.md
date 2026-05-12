# Save

Save/load uses a versioned project envelope. Project JSON contains structure;
large assets, previews, and fonts stay external.
# מערכת שמירה

תומכת בשני מסלולים: JSON קל עם references חיצוניים, ו־`.spp` נייד שהוא package פנימי עם `project.json`, `metadata.json`, assets ו־recovery.

משתמשים בה: save/load, autosave, recovery, migrations ו־portable export.

אסור לעשות: לשנות schema בלי migration, לשמור project ללא `projectVersion/appVersion/schemaVersion`, או לקרוס כאשר asset חסר בפרויקט JSON.

הרחבה עתידית: compression, signing, incremental autosave, שמירת fonts ו־package recovery מלא.

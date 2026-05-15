# SPP2 Print Preview Integration Patch

החבילה הזו מוסיפה חיבור נקי בין SPP2 לבין מודול ההדפסה בפייתון.

## מה נוסף

- `src/ui/projectActions.ts` — פונקציה חדשה `exportStagePrintImage` שמרנדרת קובץ הדפסה נקי בלי קווי עזר/בחירה.
- `src/services/printPreviewService.ts` — שירות React/Electron לפתיחת Print Preview.
- `src/ui/editor/EditorScreen.tsx` — כפתור ההדפסה הופעל ומחובר לשירות החדש.
- `electron/preload.ts` + `electron/preload.cjs` — IPC חדש: `window.spp.openPrintPreview`.
- `electron/main.ts` + `electron/main.cjs` — handler חדש שמפעיל את מודול הפייתון.
- `print.preview.engine/` — מודול ההדפסה + launcher/adaptor ל־SPP2.
- `package.json` — הוספת `print.preview.engine/**/*` לבילד.

## איך להטמיע

העתק את התיקיות/קבצים מתוך החבילה לשורש פרויקט SPP2, באותם נתיבים.

לאחר מכן הרץ:

```bash
npm install
npm run build
npm run electron
```

אם PySide6/Pillow לא מותקנים בסביבת הפייתון שלך:

```bash
pip install -r print.preview.engine/requirements.txt
```

## הערה חשובה

בשלב הזה ההדפסה מקבלת קובץ PNG נקי שמיוצר מתוך Konva. זו הדרך הכי בטוחה כי היא לא מנסה לשחזר בפייתון את כל שכבות SPP2, אלא משתמשת ברינדור שכבר עובד בתוכנה.

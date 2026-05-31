# SPP2 Harmonize v4 Patch

מה יש כאן:

1. `python_sidecar/harmonize_v4_service.py`  
   אלגוריתם בטוח יותר: local sampling, גבולות קשיחים, שמירת alpha, contact shadow עדין.

2. `src/services/harmonizeService.ts`  
   גרסה שמוסיפה פרמטרים בטוחים ומגבילה strength כדי שלא ישחיר אובייקטים.

3. `src/ui/editor/HarmonizePanel.tsx`  
   אותה קומפוננטה שלך, אבל עם ברירות מחדל בטוחות יותר ושם ברור יותר.

## מה חסר לי בתיקיה שהעלית
העלית רק `src`, ולכן אין לי את קובץ ה-Electron/IPC שקורא בפועל ל-Python. לכן הקובץ Python כאן הוא standalone.
צריך לחבר אותו במקום שבו `window.spp.harmonizeLayer(...)` ממומש.

## איך לחבר
חפש בפרויקט המלא את המימוש של IPC בשם `harmonizeLayer` או `harmonize-layer`.
שם כנראה יש קריאה לסקריפט Python קיים. החלף את הסקריפט הקיים ב:

```bash
python harmonize_v4_service.py layer.png bg.png bboxJson optionsJson output.png
```

הסקריפט מדפיס JSON ל-stdout בפורמט:

```json
{"ok": true, "mode": "algorithm", "diagnostics": {...}, "shadow": {"ok": true}}
```

## למה זה אמור לשפר
- לא משתמש בכל הרקע, רק בסביבה הקרובה לאובייקט.
- לא מאפשר שינויי בהירות/קונטרסט קיצוניים.
- strength 100% ב-UI לא אומר החלפה הרסנית.
- שומר את האלפא והקצוות.
- צל נוצר בעיקר מהחלק התחתון של האובייקט, לא הילה מסביב.

## המלצה ראשונה לבדיקה
- strength: 25-35%
- brightness/contrast/saturation/temperature: פעילים
- shadow: פעיל
- shadow strength: 25-30%
- softness: 12-18px
- distance: 8-14px
- direction: לפי כיוון הצל בתמונה

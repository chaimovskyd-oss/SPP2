# תוכנית יישום: מסך הגדרות - ביצועים

## מצב קיים שנסרק בקוד

מסך הביצועים נמצא ב-`src/ui/settings/panels/PerformancePanel.tsx`.

הנתונים כבר קיימים ב-store:

- `src/settings/types.ts` מגדיר `PerformanceSettings`.
- `src/settings/defaults.ts` מגדיר ברירות מחדל.
- `src/settings/store.ts` שומר ומעדכן את ההגדרות ב-Zustand persist תחת `spp-app-settings`.

אבל רוב הכלים עדיין לא מחוברים למנוע:

- `PerformancePanel.tsx` מציג תג `בקרוב` לרוב השדות וחוסם חלק מהפקדים עם `disabled`.
- `CanvasStage.tsx` מחשב scale למסך לפי zoom ו-page size, בלי `previewQuality` או `maxPreviewSizePx`.
- `KonvaLayerNode.tsx` מפעיל caches ו-filters לפי צורך ויזואלי, אבל בלי מדיניות ביצועים גלובלית.
- `projectActions.ts` מייצא עם `pixelRatio: 1` קבוע ב-`renderPrintableStage`, ו-JPG לא מקבל quality מהגדרות.
- `documentStore.ts` יוצר `createHistoryState()` עם ברירת מחדל 100, בלי לקרוא `undoHistoryLimit`.
- `EditorScreen.tsx` משתמש ב-`AutosaveManager` עם ערכים קשיחים: 2 דקות, debounce 3000ms, threshold 20.
- `EditorScreen.tsx` מייבא תמונות ב-`handleImageFiles`, אבל לא משתמש ב-`warnLargeFileMb`.

המסקנה: יש שלד הגדרות טוב, אבל צריך שכבת `performancePolicy` אחת שמתרגמת את ההגדרות להתנהגות בקנבס, ייצוא, היסטוריה, autosave וייבוא קבצים.

## מיפוי הגדרות למסך אמיתי

### 1. איכות תצוגה מקדימה

שדה: `previewQuality: "low" | "medium" | "high"`

התנהגות:

- `low`: preview קל, צד ארוך עד 1024px, פחות cache/filter בזמן עבודה.
- `medium`: צד ארוך עד 2048px.
- `high`: צד ארוך עד 4096px או לפי `maxPreviewSizePx`.

מימוש:

- ליצור `src/settings/performancePolicy.ts`.
- להוסיף `getPreviewMaxSide(settings.performance)`.
- לחבר ל-`useKonvaImage` או ל-asset preview pipeline.
- לשמור originalPath ללא שינוי, ולהשתמש ב-preview רק למסך.

### 2. איכות ייצוא סופי

שדה: `renderQuality: "standard" | "high" | "print"`

התנהגות:

- `standard`: ייצוא מהיר, `pixelRatio: 1`.
- `high`: `pixelRatio: 2` כשגודל הקנבס מאפשר.
- `print`: ייצוא לפי DPI אמיתי ושימוש במקור, לא ב-low-res preview.

מימוש:

- לעדכן `exportStagePng`, `exportStageJpg`, `exportStagePdf`, `exportStagePrintImage` ב-`src/ui/projectActions.ts` לקבל options.
- להעביר את `settings.performance.renderQuality` מתוך `EditorScreen.tsx`.
- להחליף את `pixelRatio: 1` הקבוע ב-`renderPrintableStage`.
- ל-JPG להעביר גם `settings.exportPrint.jpgQuality / 100`.

### 3. הפחת איכות בזמן גרירה

שדה: `lowResWhileDragging: boolean`

התנהגות:

- בזמן drag/transform: מצב קל.
- בסיום פעולה: חזרה לאיכות מלאה ו-`batchDraw`.

מימוש:

- להוסיף ב-`CanvasStage.tsx` מצב `interactionQuality: "idle" | "interactive"`.
- להעביר prop ל-`KonvaLayerNode.tsx`.
- בזמן `interactive`, לדלג זמנית על filters כבדים או להשתמש ב-preview קל.
- לחבר `onDragStart`, `onDragEnd`, `onTransformStart`, `onTransformEnd`.

### 4. הפעלת האצת GPU

שדה: `enableGpuAcceleration: boolean`

התנהגות:

- הגדרה ברמת Electron, לא רק React.
- שינוי דורש הפעלה מחדש.

מימוש:

- ב-`electron/main.ts`, לקרוא הגדרה מוקדם לפני יצירת החלון.
- אם כבוי: לקרוא `app.disableHardwareAcceleration()` לפני `app.whenReady()`.
- להוסיף IPC לשמירת ההעדפה בקובץ Electron settings.
- במסך ההגדרות להציג: "יחול לאחר הפעלה מחדש".

### 5. גודל תמונת תצוגה מקסימלי

שדה: `maxPreviewSizePx: number`

התנהגות:

- מגביל רק preview/screen assets.
- לא מקטין originalPath.
- ערך `8192` יכול להיות "ללא הגבלה מעשית".

מימוש:

- לעדכן את import/asset pipeline ליצור preview מוקטן לפי ההגדרה.
- לשמור metadata כמו `previewMaxSidePx`.
- לתקן את טקסט האופציה במסך כך שלא ייראה כאילו `8192` הוא באמת "ללא הגבלה".

### 6. מגבלת היסטוריית ביטול

שדה: `undoHistoryLimit: number`

התנהגות:

- history stack נחתך לפי ההגדרה.
- שינוי מ-200 ל-50 חותך stack קיים.

מימוש:

- להוסיף ל-`documentStore.ts` פעולה `setHistoryLimit(limit: number)`.
- לחבר `createHistoryState(limit)` בעת טעינת מסמך חדש.
- להוסיף effect ב-`EditorScreen.tsx` שמאזין ל-`settings.performance.undoHistoryLimit`.
- לעדכן `compressStack` כך שיחול גם כשמשנים limit.

### 7. אזהרה בפתיחת קבצים גדולים

שדה: `warnLargeFileMb: number`

התנהגות:

- לפני ייבוא תמונה או פתיחת פרויקט מעל הסף: להציג אזהרה.
- לא לחסום אוטומטית; המשתמש יכול להמשיך.

מימוש:

- ב-`EditorScreen.tsx`, בתוך `handleImageFiles`, לבדוק `file.size / 1024 / 1024`.
- להציג modal/confirm לפני קריאת הקובץ.
- ליישם גם בזרימת `loadProject(file)`.
- בתמונות מרובות, להציג סיכום של הקבצים החורגים.

### 8. מצב ביצועים

שדה: `performanceMode: boolean`

התנהגות:

- מצב-על שמחשב הגדרות אפקטיביות בלי לדרוס את הבחירות הידניות.
- מפעיל low-res בזמן גרירה.
- מוריד preview אפקטיבי.
- מצמצם אנימציות ו-filters בזמן עבודה.

מימוש:

- ב-`performancePolicy.ts` ליצור `resolveEffectivePerformanceSettings`.
- להוסיף class ל-root, למשל `spp-performance-mode`, כדי לכבות transitions כבדים ב-`styles.css`.
- להשתמש במדיניות האפקטיבית ב-`CanvasStage.tsx` וב-`KonvaLayerNode.tsx`.

## שלבי יישום מומלצים

### Phase 1 - חיבור UI בסיסי

1. להסיר `SOON` ו-`disabled` מפקדים שאפשר לממש מיד.
2. להשאיר ל-GPU תווית "דורש הפעלה מחדש".
3. לתקן את אופציית `8192px`.

קבצים:

- `src/ui/settings/panels/PerformancePanel.tsx`
- `src/settings/types.ts`
- `src/settings/defaults.ts`
- `src/settings/migrations.ts`, רק אם משנים schema.

### Phase 2 - Performance Policy מרכזי

1. ליצור `src/settings/performancePolicy.ts`.
2. להגדיר:
   - `resolveEffectivePerformanceSettings`
   - `getPreviewMaxSide`
   - `getExportPixelRatio`
   - `shouldReduceEffectsDuringInteraction`
   - `getJpegQuality`
3. להוסיף בדיקות יחידה.

קבצים:

- `src/settings/performancePolicy.ts`
- `tests/performance-settings.test.ts`

### Phase 3 - קנבס ו-Konva

1. `CanvasStage.tsx` קורא settings ומחשב מצב אינטראקציה.
2. `KonvaLayerNode.tsx` מקבל render mode או policy.
3. להפחית filters/cache בזמן drag רק כשצריך.
4. לשמור על cache cleanup הקיים כדי לא להחזיר דליפות זיכרון.

קבצים:

- `src/ui/editor/CanvasStage.tsx`
- `src/ui/editor/KonvaLayerNode.tsx`
- `src/ui/editor/useKonvaImage.ts`

### Phase 4 - ייבוא תמונות ו-preview assets

1. להוסיף warning לפי `warnLargeFileMb`.
2. להוסיף downscale preview לפי `maxPreviewSizePx`.
3. לוודא `originalPath` נשאר ללא שינוי.

קבצים:

- `src/ui/editor/EditorScreen.tsx`
- `src/ui/projectActions.ts`
- `src/core/assets/assetManager.ts`

### Phase 5 - ייצוא והדפסה

1. להעביר settings ל-export functions.
2. להחליף `pixelRatio: 1` הקבוע ב-policy.
3. לחבר JPG quality.
4. לוודא multi-page export משתמש באותה מדיניות.

קבצים:

- `src/ui/projectActions.ts`
- `src/ui/editor/EditorScreen.tsx`
- `src/ui/print/PrintRangeDialog.tsx`, אם יש זרימת print נפרדת.

### Phase 6 - היסטוריה ו-autosave

1. לחבר `undoHistoryLimit` ל-`documentStore`.
2. לחבר את הגדרות autosave הקיימות ל-`AutosaveManager`:
   - `autosaveIntervalMinutes`
   - `autosaveAfterActions`
   - `backupVersionCount`
3. לוודא שמצב ביצועים לא מבטל autosave, רק מפחית עבודה ויזואלית.

קבצים:

- `src/state/documentStore.ts`
- `src/core/history/actions.ts`
- `src/core/save/autosave.ts`
- `src/ui/editor/EditorScreen.tsx`

### Phase 7 - GPU/Electron

1. להוסיף שמירת הגדרת GPU בקובץ settings של Electron או IPC ייעודי.
2. לקרוא אותה ב-`electron/main.ts` לפני יצירת BrowserWindow.
3. להציג הודעת restart במסך ההגדרות.
4. להוסיף diagnostic קטן.

קבצים:

- `electron/main.ts`
- `electron/preload.ts`
- `src/electron.d.ts`
- `src/ui/settings/panels/PerformancePanel.tsx`

## בדיקות קבלה

- שינוי `previewQuality` משנה את מדיניות preview בלי לשנות original assets.
- שינוי `renderQuality` משנה pixelRatio בייצוא.
- `lowResWhileDragging` מוריד עומס בזמן drag ומחזיר איכות אחרי release.
- `undoHistoryLimit` חותך history stack בפועל.
- `warnLargeFileMb` מציג אזהרה לפני ייבוא.
- `performanceMode` מפעיל מדיניות אפקטיבית בלי לדרוס בחירות ידניות.
- GPU setting נשמר ומסומן כמיושם אחרי restart.
- ייצוא print נשאר באיכות מלאה גם כש-preview נמוך.

## סדר עדיפויות קצר

1. `performancePolicy.ts` + חיבור UI בסיסי.
2. `undoHistoryLimit` ו-`warnLargeFileMb`.
3. `renderQuality` + JPG quality בייצוא.
4. `lowResWhileDragging` ו-`maxPreviewSizePx`.
5. `performanceMode` כמדיניות-על.
6. `enableGpuAcceleration` דרך Electron/restart.

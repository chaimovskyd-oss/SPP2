# SPP v2 — Phase 4 Mask Mode — Working Specification

## מטרת המסמך

מסמך עבודה ראשוני לאפיון Phase 4 — Mask Mode בצורה מבוקרת לפני כתיבת פרומפט מלא ל-Claude Code.

הלקחים מ-Phase 3:

1. אסור להשאיר חוקים חשובים ברמת “מובן מאליו”.
2. חייבים להגדיר מראש מה מותר ומה אסור לתאים/מסיכות לעשות.
3. חייבים להגדיר UX מפורט, לא רק מודל נתונים.
4. חייבים להפריד היטב בין מצב Grid לבין מצב Mask.
5. כל כלי שמצפים שיופיע ב-UI חייב להיות מוגדר מפורשות: מיקום, תנאי הופעה, כפתורים והתנהגות.
6. כל שינוי במיקום/גודל/מרווחים חייב להיות מוגדר כך שלא יזיז בטעות אובייקטים בצורה לא צפויה.

---

# Phase 4 — הגדרה ראשונית

Mask Mode הוא מצב עבודה שמאפשר יצירה מהירה של אוסף תמונות בתוך צורות/מסיכות, בעיקר לשימושי דפוס כמו:

- עיגולים
- לבבות
- כוכבים
- צורות SVG
- מסיכות PNG
- מדבקות
- תמונות גזורות
- מוצרים צורניים
- מארזים של הרבה תמונות בצורה אחידה

בניגוד ל-Grid Mode, Mask Mode אינו טבלה קשיחה של שורות ועמודות.

Mask Mode הוא מצב סידור של FrameLayers עם shape/mask, כאשר הגודל של המסיכות נשאר משמעותי ויציב, והמרווחים/הסידור משנים את המיקום — לא בהכרח את גודל התא.

---

# ההבדל המרכזי בין Grid Mode ל-Mask Mode

## Grid Mode

- טבלה קשיחה.
- Rows / Columns.
- כל התאים מלבניים ואחידים.
- שינוי spacing/margins משנה את גודל התאים.
- התא מחושב לפי חלוקת הדף.
- מתאים לתמונות פספורט, תמונות מוצר, אלבומים פשוטים, גיליונות אחידים.

## Mask Mode

- לא טבלה קלאסית.
- מבוסס על צורה/מסיכה.
- יכול להיות עיגולים, לבבות, SVG, PNG mask.
- הגודל של המסיכה הוא פרמטר מרכזי.
- שינוי spacing משנה מיקום/סידור, לא בהכרח את גודל המסיכה.
- מתאים ל-40 עיגולים, מדבקות, מחזיקי מפתחות, חיתוכים צורניים, תמונות מחזור עגולות, מוצרים מיוחדים.

---

# כלל ארכיטקטוני ראשי

Mask Mode לא יוצר מנוע חדש.

כל מסיכה היא FrameLayer רגיל עם shape/mask.
כל תמונה בתוך מסיכה משתמשת במנוע התמונה הקיים.
כל טקסט, אם יתווסף בהמשך, משתמש במנוע הטקסט הקיים.
כל פעולה עוברת דרך Document/Page/Layer/Frame/Batch/History.

Mask Mode מנהל רק:

- בחירת סוג מסיכה
- יצירת מספר מסיכות
- סידור המסיכות על הדף
- מרווחים
- גודל מסיכה
- מילוי תמונות batch
- smart crop / face detect
- קישור קבוצתי בין מסיכות
- פעולות apply-to-all

---

# החלטות סגורות ל-Phase 4

## 1. סוגי מסיכות

Phase 4 חייב לתמוך כבר מהשלב הראשון ב:

- Circle
- Heart
- Rounded rectangle
- Star / basic shapes if simple
- SVG upload
- PNG upload
- PNG mask with white background removal by threshold

PNG mask threshold behavior:

- המשתמש יכול להעלות PNG שבו הרקע לבן.
- המערכת תוכל להתייחס ללבן כשקוף לפי threshold.
- צריך להציג preview לפני אישור המסיכה.
- threshold צריך להיות ניתן לשליטה בסיסית, למשל slider.
- ברירת מחדל צריכה לעבוד טוב עם PNG פשוטים של שחור/לבן.

SVG/PNG upload הם חובה, לא שלב עתידי.

---

## 2. Mask Mode מתחיל מאשף

Mask Mode חייב להתחיל מאשף, לא לפתוח ישר קנבס ריק.

זרימת אשף מומלצת:

1. בחירת גודל דף / מוצר / custom.
2. בחירת סוג מסיכה:
   - circle
   - heart
   - basic shapes
   - upload SVG
   - upload PNG
3. הגדרת גודל מסיכה:
   - width
   - height
   - keep proportions מסומן כברירת מחדל
4. הגדרת spacing / margins / safe area / bleed אם צריך.
5. העלאת תמונות.
6. אפשרות להוספת טקסט לכל התמונות כבר בתוך האשף.
7. בחירת smart crop / face detection.
8. יצירת הקנבס והמסיכות.

חשוב:

הכמות אינה מוגדרת מראש.
כמות המסיכות נקבעת לפי כמות התמונות שהועלו.
אם הועלו 40 תמונות — נוצרים 40 FrameLayers עם המסיכה שנבחרה.
אם אין מקום בדף — נוצרים דפים נוספים.

---

## 3. גודל מסיכה ו-Keep Proportions

בעת בחירת גודל מסיכה:

- Keep Proportions מסומן כברירת מחדל.
- שינוי width משנה height בהתאם.
- שינוי height משנה width בהתאם.
- אם המשתמש מבטל Keep Proportions, ניתן לשנות width/height בנפרד.

זה נכון לגודל המסיכה עצמה, לא לתמונה שבתוכה.

---

## 4. Overflow / אין מקום בדף

Mask Mode לא משנה את גודל המסיכות אוטומטית כדי להכניס עוד למסך.

הכלל:

- spacing משנה מרחקים וסידור.
- גודל המסיכה נשאר קבוע.
- אם אין מקום, נוצרים דפים נוספים.

חריג יחיד:

אם גודל הדף קטן מדי אפילו למסיכה אחת, כלומר מסיכה אחת לא יכולה להיכנס לדף — יש להציג popup עם שלוש אפשרויות:

1. הגדל את הדף
2. הקטן את המסיכה
3. ביטול

בחירה ב״ביטול״ מבטלת את הפעולה שגרמה לבעיה.

---

## 5. תנועה ועריכה של מסיכות

בשלב זה המסיכות עצמן לא אמורות לזוז ידנית.

המסיכות הן layout-managed.
המשתמש לא מזיז אותן חופשי ולא משנה גודל של מסיכה בודדת.

Allowed:

- להזיז את התמונה בתוך המסיכה
- crop/position של התמונה בתוך המסיכה
- לסובב את התמונה בתוך המסיכה
- free transform לתמונה בתוך המסיכה באמצעות bounding box
* וודא שBOUNDARY BOX נראה לעין בצורה נוחה גם שהתמונה בתוך מסיכה או גריד.
Not allowed:

- להזיז מסיכה בודדת חופשי
- לשנות גודל מסיכה בודדת
- לשבור סידור של מסיכה בודדת

יש לכלול bounding box / free transform עבור התמונה שבתוך המסיכה, לא עבור המסיכה עצמה.

---

## 6. סיבוב מסיכה מול סיבוב תמונה

צריך להפריד בין שני סוגי סיבוב:

### Rotate image inside mask

- מסובב רק את התמונה.
- המסיכה נשארת באותה זווית.
- זה מיועד לתיקון תמונה בתוך הצורה.

### Rotate mask

- אם המשתמש מסובב את המסיכה, המסיכה והתמונה שבתוכה מסתובבות יחד לאותה זווית.
- כלומר המסגרת/הצורה והתוכן מסתובבים כיחידה אחת.

בשלב זה אין צורך לאפשר סיבוב חופשי של כל מסיכה בודדת אם זה מסבך את layout.
אבל אם יש rotation control למסיכות, הוא חייב להיות group-level או controlled ולא לשבור את הסידור.

---

## 7. Delete behavior

מחיקת תמונה ב-Mask Mode עובדת כמו Grid Mode.

אם מוחקים תמונה ממסיכה:

- התמונה האחרונה בשימוש עוברת למקום שהתפנה.
- התא/מסיכה האחרונים מתפנים או נמחקים לפי cleanup rules.
- אם הדף האחרון התרוקן לגמרי והוא מכיל רק מסיכות שנוצרו על ידי ה-Mask Mode, ניתן להסיר אותו.

זו חייבת להיות פעולה אחת ב-undo/redo.

---

## 8. Drag/Drop בין מסיכות

Drag/drop של תמונה ממסיכה למסיכה אחרת מחליף בין התמונות.

המסיכות עצמן לא זזות.
רק שיוך התמונות מתחלף.

---

## 9. טקסט לכל המסיכות

זה חובה כבר בשלב הראשון של Phase 4.

באשף, אחרי העלאת/בחירת התמונות, תהיה אפשרות להוסיף טקסט לכל המסיכות.

הטקסט חייב להשתמש במנוע הטקסט הקיים, לא במנוע חדש.
כל טקסט יהיה TextLayer רגיל שמקושר למסיכה/FrameLayer שלו.

יכולות נדרשות:

- יצירת תיבת טקסט אחת שמוחלת על כל המסיכות באותו מיקום יחסי.
- הדמיה ראשונית של מיקום הטקסט על המסיכה כבר בתוך האשף.
- שימוש בכל כלי הטקסט של המנוע הקיים ככל האפשר.
- תמיכה בכמה שורות.
- אפשרות להוסיף יותר מתיבת טקסט אחת.
- אפשרות לערוך ולהוסיף טקסט גם אחרי יצירת המסיכות, מתוך ה-Right Context Panel.
- אפשרות אופציונלית לקחת טקסט משם הקובץ.
- אין צורך במספר רץ בשלב זה.

מקורות טקסט רצויים:

- Manual text
- Empty editable text boxes
- Filename, optional

לא חובה:

- Running number

---

## 10. Smart Crop / Face Detection

Smart Crop / Face Detection מומלץ מאוד וצריך להיות חלק מ-Phase 4.

בגלל שמסיכות וצורות מורכבות דורשות מיקום מדויק יותר של הפנים/אובייקט, זה יחסוך הרבה עבודה ידנית.

### Recommended model

Use **MediaPipe Face Detection / BlazeFace** as the default face detection model for Phase 4.

Reasons:

- Fast and lightweight.
- Suitable for batch processing many images.
- Provides face bounding boxes plus basic facial keypoints.
- Good enough for centering faces inside circles/hearts/masks.
- Fits the existing architecture where Python workers already handle smart image processing.

Optional fallback / alternative:

- OpenCV YuNet can be kept as a future fallback or advanced option if MediaPipe has packaging issues.
- YuNet is also lightweight and CPU-friendly, but MediaPipe should be the first implementation target unless there is a practical integration problem.

### UI

- checkbox באשף: Use Smart Crop / Face Detection
- רצוי שיהיה מסומן כברירת מחדל אם הביצועים סבירים
- אם זה עלול להאט, הצג הסבר קטן ליד checkbox

### Behavior

- אם זוהו פנים — מרכז לפי פנים.
- אם יש כמה פנים — בחר את הפנים הגדולות/מרכזיות ביותר כברירת מחדל.
- אם לא זוהו פנים — fallback ל-center crop.
- הפעולה חייבת לרוץ כ-BatchJob עם progress.
- שגיאה בתמונה אחת לא מפילה את כל הפעולה.
- שמור את תוצאת הזיהוי כ-metadata, כדי שלא להריץ שוב על אותה תמונה בלי צורך.

### Face anchor data

Store the result in the existing/future `FaceAnchorData` model:

- bounding box
- confidence
- keypoints if available
- selected face index if multiple faces detected
- detection model name/version

---

## 10.5 Mask Library

Uploaded masks must be reusable.

When the user uploads an SVG or PNG mask, the system should offer the option to save it into a local Mask Library.

### Mask Library goals

The Mask Library is a reusable asset/preset library for masks.
It should be accessible from:

- Mask Mode wizard
- Mask Mode right panel
- Free Mode assets/library panel

### Mask Library UI

The library should show:

- small thumbnail preview
- mask name
- mask type: built-in / SVG / PNG / threshold PNG
- optional category/tag later

The UI should allow:

- search/filter by name if simple
- rename mask
- delete custom mask
- reuse mask in new Mask Mode project
- drag mask into Free Mode canvas

### Saving uploaded masks

When uploading SVG/PNG mask:

- show preview
- allow naming the mask
- checkbox: Save to Mask Library
- if PNG threshold was used, save the threshold settings with the mask preset

### Mask preset model

Suggested model:

```ts
interface MaskPreset {
  id: string;
  version: number;
  name: string;
  type: 'builtInShape' | 'svg' | 'png' | 'pngThreshold';
  shape?: 'circle' | 'heart' | 'roundedRect' | 'star' | 'custom';
  assetId?: string;
  thumbnailAssetId?: string;
  thresholdSettings?: {
    enabled: boolean;
    color: 'white' | 'black' | 'custom';
    tolerance: number;
    feather?: number;
  };
  defaultSize?: Size;
  keepProportionsDefault: boolean;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}
```

### Free Mode integration

Free Mode must be able to access the Mask Library.

Behavior:

- user opens Mask Library from assets/library panel
- user drags a mask preset onto the canvas
- the app creates a normal FrameLayer with that mask/shape
- the user can then drag an image into that frame
- the same core FrameLayer/ImageLayer mechanics are used

Do not create a separate Free Mode mask system.
A mask from the library is simply a reusable preset that creates a normal FrameLayer.

---

## 11. Arrangement

ה-arrangement הראשי לשלב הראשון הוא:

Packed Rows / efficient packing.

המטרה היא ניצול שטח יעיל בדף.

כלומר:

- המסיכות מסודרות בשורות.
- לפי גודל מסיכה קבוע.
- לפי spacing/margins.
- ממלאות את הדף בצורה יעילה ככל האפשר.
- כשאין מקום — עוברות לדף הבא.

לא צריך בשלב הראשון:

- circle arrangement
- random scatter
- custom free arrangement
- collage-like dynamic layout

---

## 12. Bleed / Safe Area

Mask Mode צריך לתמוך ב-bleed / safe area אם המערכת המרכזית כבר תומכת בזה.

ברירת מחדל יכולה להיות 0.

המשתמש לא חייב להגדיר את זה בכל עבודה.
אבל אם הוגדר bleed/safe area, arrangement צריך לכבד אותם.

---

# הצעה ראשונית ל-MVP של Phase 4

כדי לא לשבור את המערכת, מומלץ להתחיל ב-MVP מדויק:

1. Mask Mode עם צורות בסיס:
   - Circle
   - Rounded rect
   - Heart אם קל
   - SVG/PNG upload אולי כשלב שני בתוך Phase 4

2. אשף יצירה:
   - Page size
   - Mask shape
   - Mask size
   - Quantity
   - Spacing
   - Arrangement: rows/wrap

3. יצירת FrameLayers רגילים עם shape/mask.

4. Fill images batch.

5. Smart crop / face detect דרך Python worker הקיים.

6. Apply to all:
   - mask size
   - spacing
   - fit mode
   - stroke/border
   - smart crop mode

7. Drag/drop בין מסיכות = החלפת תמונות.

8. Delete behavior מוגדר מראש.

9. Save/load מלא.

10. Export דרך המערכת המרכזית.

---

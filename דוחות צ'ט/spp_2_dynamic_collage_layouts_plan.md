# תוכנית עבודה ליישום מנוע קולאז' דינמי ב-SPP2

## מטרת המסמך

המטרה היא לבנות ב-SPP2 מערכת קולאז' דינמית, יפה, יציבה וניתנת להרחבה, שלא מסתפקת בגריד רגיל אלא יודעת לייצר תבניות עשירות יותר: גליות, אמורפיות, פוליגוניות, תמונה מרכזית עם תומכות, סטריפים דינמיים, חלוקה אורגנית ועוד.

הדגש הוא לא רק על מראה יפה, אלא על מערכת שאפשר באמת להשתמש בה עם כמות רחבה של תמונות: 3, 5, 8, 12, 20, 40 ואף יותר, בלי שהתוצאה תתפרק, בלי שהתאים יהיו צרים מדי, בלי שהתמונות ייחתכו בצורה גרועה, ובלי לגרום לקריסות ביצועים ב-Konva/Electron.

---

# חלק א': עקרונות בסיס לכל מנועי הקולאז'

## 1. לא לבנות כל תבנית כציור קשיח

הטעות הכי גדולה תהיה ליצור 10 תבניות כ-SVG קבוע או מערך קואורדינטות קשיח. זה ייראה יפה בדמו, אבל יישבר כשמספר התמונות משתנה.

במקום זה צריך לבנות **Layout Generators**:

כל סגנון הוא אלגוריתם שמקבל:

- גודל קנבס
- יחס עמוד
- מספר תמונות
- seed אקראי
- עוצמת תנועה / organicness
- האם יש תמונת Hero
- העדפות: יותר פנים, יותר נוף, יותר סימטרי, יותר חופשי

ומחזיר:

- רשימת תאים
- מסיכה לכל תא
- משקל וחשיבות לכל תא
- חוקים לחיתוך תמונה בתוך התא
- נתוני debug

כלומר, לא “תבנית אחת”, אלא “משפחה של תבניות”.

---

## 2. מבנה נתונים מומלץ

```ts
export type CollageLayoutStyle =
  | 'organic-flow'
  | 'amoeba-pack'
  | 'soft-polygons'
  | 'hero-support'
  | 'wave-ribbons'
  | 'dynamic-strips'
  | 'radial-hero'
  | 'mosaic-modular'
  | 'voronoi-soft'
  | 'freeform-clusters';

export type CollageCellRole =
  | 'hero'
  | 'primary'
  | 'support'
  | 'accent'
  | 'background';

export type CollageCellShape =
  | 'rect'
  | 'rounded-rect'
  | 'polygon'
  | 'soft-polygon'
  | 'blob'
  | 'wave-region'
  | 'circle'
  | 'capsule'
  | 'custom-path';

export interface CollageCell {
  id: string;
  role: CollageCellRole;
  shape: CollageCellShape;

  // Bounds for interaction, hit testing, layout calculations
  x: number;
  y: number;
  width: number;
  height: number;

  // Actual mask path in canvas coordinates
  maskPath: string;

  // Normalized geometry for responsive regeneration
  normalizedPath?: string;

  // Used for assigning photos
  weight: number;
  preferredAspect?: number;
  minFaceScale?: number;
  cropPriority?: 'face' | 'center' | 'full-body' | 'landscape' | 'auto';

  // Visual styling
  gapPx: number;
  borderRadius?: number;
  strokeWidth?: number;
  safeInsetPx?: number;

  // Debug / editing
  locked?: boolean;
  editable?: boolean;
}

export interface CollageLayoutResult {
  style: CollageLayoutStyle;
  canvasWidth: number;
  canvasHeight: number;
  cells: CollageCell[];
  seed: string;
  warnings: string[];
  metadata: {
    imageCount: number;
    heroCount: number;
    averageCellArea: number;
    minCellArea: number;
    complexityScore: number;
  };
}
```

---

## 3. כלל חשוב: כל תא הוא Frame/Mask אמיתי

ב-SPP2 כל תא קולאז' צריך להתנהג כמו מסגרת/מסיכה, לא כמו תמונה רגילה.

כל תא צריך לכלול:

- maskPath
- image transform פנימי
- מצב Fill/Fit
- crop פנימי
- אפשרות להזיז את התמונה בתוך התא בלי להזיז את המסיכה
- אפשרות Shift-transform לתמונה בתוך המסיכה, כמו שכבר דיברנו במצב חופשי

התא הוא “מיכל”. התמונה היא “תוכן”.

זה קריטי כדי שהתוכנה לא תתבלבל בין:

- הזזת התא כולו
- הזזת התמונה בתוך התא
- שינוי גודל התא
- שינוי crop פנימי

---

## 4. Fill נכון הוא תנאי בסיס

בכל הסגנונות, ברירת המחדל צריכה להיות Cover / Fill.

כלומר:

- התמונה תמיד ממלאת את התא
- אין לבן בתוך התא
- הזזה פנימית מוגבלת כך שהתמונה לא יכולה לחשוף רקע
- scale מינימלי מחושב לפי גודל התא והמסיכה

בפועל:

```ts
const scale = Math.max(
  cellBounds.width / imageWidth,
  cellBounds.height / imageHeight
);
```

אבל בגלל שתאים יכולים להיות blob / polygon / wave, לא מספיק להשתמש רק ב-bounds. צריך לקחת safeBounds פנימי:

- bounds של המסיכה
- inset פנימי קטן
- אזור שבו סביר שיופיעו פנים

---

## 5. התאמת תמונות חכמה

לא כל תמונה מתאימה לכל תא.

צריך מנגנון assignment:

1. תמונות עם פנים ברורות → תאים גדולים / Hero / Primary
2. תמונות רוחביות → תאים רחבים
3. תמונות אנכיות → תאים גבוהים / capsule / strips
4. תמונות עם הרבה אנשים → תאים גדולים יותר
5. תמונות נוף / רקע → תאי תמיכה או תאים צרים

מבנה מומלץ לתמונה:

```ts
interface PhotoAnalysis {
  id: string;
  aspectRatio: number;
  faceCount: number;
  faces: Array<{ x: number; y: number; width: number; height: number }>;
  saliencyBox?: Rect;
  orientation: 'portrait' | 'landscape' | 'square';
  qualityScore?: number;
}
```

---

## 6. מערכת דרגות חשיבות לתאים

לא כל התאים שווים.

בכל layout צריך להיות לפחות אחד מהבאים:

- hero cell
- primary cells
- support cells
- accent cells

לדוגמה:

- 1 Hero = 30%-45% משטח הקולאז'
- 2-4 Primary = 10%-18% כל אחד
- Supports = 4%-10%
- Accents = 2%-5%

זה יוצר קולאז' מעניין יותר מגריד שווה.

---

## 7. חוקים נגד תאים גרועים

כל generator חייב לעבור validation.

חוקים מומלצים:

- תא לא קטן מ-4% משטח הקנבס, אלא אם הוא accent מוצהר
- יחס תא לא קיצוני מדי: לא יותר מ-1:5 או 5:1, אלא בסגנון strip
- אין תא עם צוואר צר מדי ב-blob
- אין אזור מסיכה דקיק שלא יראה תמונה
- gap אחיד יחסית בין תאים
- stroke/gap לא אוכל יותר מדי משטח התמונה
- אין יותר מדי נקודות path
- אין חיתוך פנים צפוי באזור קצה חד

---

## 8. ביצועים ב-Konva/Electron

כדי לא לפגוע בביצועים:

- להגביל path complexity
- לא להשתמש במסיכות SVG סופר מורכבות בזמן גרירה
- בזמן drag/resize להציג preview פשוט יותר
- לרנדר high quality רק בסיום פעולה
- לשמור cache לתאי מסיכה
- להימנע מיצירת מאות clipFunc כבדים
- לפרק קולאז' גדול לקבוצות Konva

כל תא יכול להחזיק:

- lowResPreviewPath
- finalPath
- cachedImage

בזמן אינטראקציה משתמשים ב-low quality.
בייצוא/הדפסה משתמשים ב-final quality.

---

## 9. UX מוצע בתוך SPP2

### Wizard חדש: Dynamic Collage

שלבים:

1. בחירת גודל דף / מוצר
2. העלאת תמונות
3. בחירת סגנון
4. בחירת תמונות Hero ידנית או אוטומטית
5. סליידרים:
   - כמות תנועה
   - מידת אורגניות
   - עובי מרווחים
   - איזון בין תמונה מרכזית לכל התמונות
   - צפיפות
6. Generate Variations
7. Apply to Canvas

### כפתורים חשובים

- Regenerate Same Style
- Shuffle Photos Only
- Change Layout Keep Crops
- Change Style Keep Hero
- Lock Cell
- Lock Photo Crop
- Convert to Free Editable Layout

---

# חלק ב': 10 סגנונות קולאז' דינמיים

---

# 1. Organic Flow Cells — תאים גליים זורמים

## רעיון עיצובי

זה הסגנון שהכי קרוב לדוגמה מספר 2 שאהבת. הקולאז' מחולק לאזורים עם קווים גליים, רכים וזורמים. אין תחושה של גריד, אבל עדיין יש סדר. התמונות משתלבות זו בזו כמו חתיכות נייר גזורות בקווים רכים.

זה מתאים מאוד לתמונות אנשים, כי אין פינות חדות מדי, התאים גדולים יחסית, והעין מרגישה תנועה טבעית.

## מתי להשתמש

- אלבומי משפחה
- קולאז' ילדים
- זוגות
- טיולים
- מתנות לבית
- תמונות עם הרבה פורטרטים

## מבנה גיאומטרי

האלגוריתם מחלק את הקנבס בעזרת קווי Bezier גליים.

אפשר לחשוב על זה כעל grid בסיסי בלתי נראה, שעליו מעוותים את קווי החלוקה.

לדוגמה:

- מתחילים מ-2 או 3 עמודות בסיס
- יוצרים קווי הפרדה אנכיים גליים
- מוסיפים קווי הפרדה אופקיים גליים
- כל תא נוצר בין קווים סמוכים

## אלגוריתם בנייה

1. קבע מספר אזורים לפי כמות תמונות.
2. צור חלוקה בסיסית לפי יחס הקנבס.
3. המר קווי חלוקה ישרים לקווי Bezier.
4. ודא שכל תא מקבל שטח מספיק.
5. צור path סגור לכל תא.
6. החלק פינות וחיבורים.
7. החל gap לבן בין התאים.
8. שייך תמונות לפי התאמה.

## התאמה לכמות תמונות

### 3-5 תמונות

- 1 תא גדול מאוד
- 2-4 תאים זורמים סביבו
- מעט מאוד חיתוכים

### 6-10 תמונות

- 2 תאים גדולים
- 4-8 תאים בינוניים
- מבנה מאוזן

### 11-20 תמונות

- חלוקה ל-3 אזורים עיקריים
- בכל אזור wave פנימי
- להימנע מתאים קטנים מדי

### 20+ תמונות

- עדיף ליצור כמה clusters גליים
- כל cluster כולל 4-7 תמונות
- לא לנסות לעשות 40 blobs בודדים

## חוקים חשובים

- מינימום רוחב תא: 12% מרוחב הקנבס
- מינימום גובה תא: 12% מגובה הקנבס
- מרווחים לבנים: 8-24px לפי גודל הדף
- עקומות לא חדות מדי
- אין קו גלי שיוצר צוואר צר בתא

## התאמת תמונות אנשים

- פנים צריכות להיות במרכז visual-safe של התא
- בתאים גליים עדיף crop מעט רחב יותר מפורטרט רגיל
- אם תא צר מדי, לא לשים בו תמונה עם יותר מפנים אחת

## UX

סליידרים:

- Flow amount
- Gap width
- Hero strength
- Curve smoothness

כפתורים:

- Regenerate waves
- Keep photos, change flow
- Make more calm
- Make more dynamic

## קושי יישום

בינוני. דורש path generator טוב, אבל לא חייב Voronoi מלא.

## מתאים כשלב ראשון?

כן. זה אחד הסגנונות הראשונים שהייתי ממליץ ליישם.

---

# 2. Amoeba Pack — צורות אמורפיות מתחברות

## רעיון עיצובי

קולאז' שמורכב מצורות blob / אמבה, שכל אחת שונה מעט, אבל כולן משתלבות יפה בשטח. בניגוד ל-Organic Flow שבו הקווים מחלקים את כל הקנבס, כאן כל תא מרגיש כמו צורה עצמאית שמונחת ליד אחרות.

הסגנון יותר playful, מתאים לילדים, משפחה, גן, מתנות שמחות.

## מבנה גיאומטרי

כל תא מתחיל כאליפסה או rounded rect, ואז מקבל עיוות קל בעזרת נקודות Bezier.

האתגר: לגרום לצורות למלא את השטח בלי חורים גדולים מדי.

לכן מומלץ לא לעשות packing חופשי לגמרי, אלא להשתמש ב-grid סמוי:

- כל blob יושב בתוך slot מלבני
- ה-blob מתעוות בתוך גבולות ה-slot
- ה-slots עצמם מסודרים טוב

## אלגוריתם בנייה

1. צור grid משוקלל לפי מספר התמונות.
2. חלק חלק מה-slots לגדולים יותר.
3. לכל slot צור blob path.
4. הוסף overlap ויזואלי קל או gap לבן.
5. ודא שאין blob קטן מדי.
6. שייך תמונות לפי יחס התא.

## התאמה לכמות תמונות

### 3-6

- blobs גדולים
- אחד מרכזי או שניים גדולים
- הרבה מקום לנשימה

### 7-14

- שילוב blobs בינוניים וקטנים
- cluster מרכזי

### 15+

- להפחית אמורפיות
- להפוך חלק מהתאים ל-rounded organic rectangles
- אחרת זה נהיה מבולגן

## חוקים

- כל blob צריך bounds פשוטים וברורים לעריכה
- לא לאפשר שקעים עמוקים מדי
- לא לאפשר צורה עם חור פנימי
- לא ליצור blob עם יחס קיצוני מדי

## התאמה לפנים

צורות blob יכולות לחתוך פנים אם לא נזהרים.

לכן:

- לשמור safe ellipse פנימי
- למקם פנים בתוך 60% המרכזי של התא
- לא לשים פנים באזור בליטה או שקע

## UX

סליידרים:

- Blob irregularity
- Spacing
- Playfulness
- Size variation

אפשרויות:

- Soft blobs
- Round blobs
- Kids style
- Elegant organic

## קושי יישום

בינוני-גבוה. לא בגלל ה-path עצמו, אלא בגלל packing יפה.

## מתאים לשלב ראשון?

כן, אבל אחרי Organic Flow או Modular Grid.

---

# 3. Soft Polygon Packing — פוליגונים רכים משלימים

## רעיון עיצובי

חלוקה פוליגונית כמו פסיפס, אבל לא חדה ואגרסיבית. התאים נראים כמו חתיכות גיאומטריות שמתחברות יפה. אפשר לעגל פינות מעט כדי שזה יתאים לתמונות אנשים ולא ירגיש כמו זכוכית שבורה.

זה טוב כשמחפשים מראה מודרני, דינמי, גברי/ספורטיבי/טיולים/אירועים.

## מבנה גיאומטרי

אפשר להשתמש בגישה דמוית Voronoi, אבל לא חייבים להתחיל מ-Voronoi מלא.

שלב ראשון פשוט יותר:

- ליצור נקודות מרכז
- לבנות פוליגונים סביבן
- או לחלק מלבן recursively עם קווים אלכסוניים

## אלגוריתם מומלץ לגרסה ראשונה

1. התחל ממלבן הקנבס.
2. בצע recursive split:
   - לפעמים אנכי
   - לפעמים אופקי
   - לפעמים אלכסוני
3. עצור כשמספר התאים מתאים.
4. תקן תאים קטנים מדי.
5. עגל מעט פינות.
6. הוסף gap לבן.

## התאמה לכמות תמונות

### 4-8

- מתאים מאוד
- אפשר תאים גדולים ודרמטיים

### 9-16

- עדיין טוב
- צריך לשמור על חלוקה לא צפופה מדי

### 20+

- להפוך חלק מהתאים למלבנים/טרפזים פשוטים
- לא לעשות יותר מדי משולשים קטנים

## חוקים

- מינימום זווית פנימית: 35 מעלות
- לא ליצור שפיצים דקים
- לא ליצור משולש קטן מדי לפנים
- תמונות עם פנים עדיף בתאים מרובעים/מחומשים, לא משולשים צרים

## התאמה לפנים

- תאים פוליגוניים צריכים crop safe חזק יותר
- להרחיק פנים מקצוות אלכסוניים
- בתא משולש או טרפז, פנים צריכות להיות באזור הרחב

## UX

סליידרים:

- Geometry strength
- Diagonal amount
- Corner roundness
- Hero size

אפשרויות:

- Clean polygons
- Dynamic shards
- Soft mosaic

## קושי יישום

בינוני. קל יותר מ-Voronoi אמיתי אם עושים recursive split.

## מתאים לשלב ראשון?

כן, כגרסת MVP.

---

# 4. Hero + Support Cells — תמונה מרכזית ותמונות תומכות

## רעיון עיצובי

תמונה אחת גדולה ומשמעותית, וסביבה תמונות קטנות יותר שמחזקות את הסיפור. זה אחד הסגנונות הכי שימושיים מסחרית כי לקוחות אוהבים “תמונה ראשית” ועוד רגעים מסביבה.

מתאים מאוד למתנות, קנבס, בלוקים, ימי הולדת, משפחה, חתונה, סוף שנה וכו'.

## מבנה גיאומטרי

יש Hero cell גדול:

- במרכז
- בצד
- למעלה
- באלכסון
- בתוך עיגול/קפסולה/צורה גלית

מסביבו support cells.

## אלגוריתם בנייה

1. בחר מיקום Hero מתוך presets.
2. קבע שטח Hero לפי מספר תמונות:
   - מעט תמונות: 40%-60%
   - הרבה תמונות: 25%-35%
3. חלק את השטח שנותר לתאי support.
4. השתמש בגלים/מלבנים/פוליגונים לפי variant.
5. שייך את התמונה הכי טובה ל-Hero.

## התאמה לכמות תמונות

### 2-4

- Hero גדול מאוד
- 1-3 תומכות

### 5-10

- Hero 35%-45%
- תמיכות סביב

### 11-25

- Hero 25%-35%
- תמיכות בקבוצות

### 25+

- אולי 2 Hero cells
- או להפוך לסגנון Cluster

## חוקים

- Hero לא פחות מ-25% בקולאז' רגיל
- תמונת Hero חייבת להיות באיכות טובה
- אם יש פנים, הן לא נחתכות
- התמיכות לא מתחרות מדי ב-Hero

## UX

- Pick Hero Photo
- Auto choose best hero
- Hero size slider
- Hero position selector
- Surround style: waves / grid / polygons / circles

## קושי יישום

קל-בינוני. מאוד כדאי להתחיל ממנו כי הוא שימושי וברור.

## מתאים לשלב ראשון?

חד משמעית כן.

---

# 5. Wave Ribbons — רצועות גליות

## רעיון עיצובי

הקולאז' מחולק לרצועות רחבות, חלקן אנכיות וחלקן אופקיות, עם גבולות גליים. זה מייצר תנועה יפה אבל עדיין מאוד תבניתי ונוח לשחזור.

זה מעולה להרבה תמונות כי רצועות יודעות להכיל תמונות בצורה נקייה.

## מבנה גיאומטרי

- 3-6 רצועות ראשיות
- כל רצועה יכולה להתחלק לתאים פנימיים
- הגבולות בין הרצועות גליים

## אלגוריתם

1. בחר כיוון עיקרי: vertical / horizontal / mixed.
2. חלק את הקנבס לרצועות לפי משקלים.
3. הפוך את גבולות הרצועות ל-Bezier waves.
4. חלק כל רצועה לתאים פנימיים.
5. שמור על גלים עדינים כדי לא לחתוך פנים.

## התאמה לכמות תמונות

### 4-8

- כל תמונה יכולה לקבל רצועה/חלק גדול

### 9-18

- כל רצועה מחולקת ל-2-4 תאים

### 20+

- רצועות הופכות ל-columns עם cells
- עדיין שומרות על תנועה

## חוקים

- רוחב רצועה מינימלי 15%
- לא יותר מ-6 רצועות ראשיות
- wave amplitude לא יותר מ-10%-18% מהרצועה
- לא ליצור תאים פנימיים קטנים מדי

## התאמה לפנים

- תמונות פורטרט מתאימות לרצועות אנכיות
- תמונות קבוצתיות לרצועות אופקיות
- לא לשים פנים באזור שבו הגבול הגלי נכנס פנימה

## UX

- Direction: vertical / horizontal / mixed
- Wave strength
- Strip count
- Internal split density

## קושי יישום

בינוני ונוח יחסית.

## מתאים לשלב ראשון?

כן. זה סגנון חזק מאוד למערכת דינמית.

---

# 6. Dynamic Strips — פסי תמונות דינמיים

## רעיון עיצובי

קולאז' שמבוסס על פסים, אבל לא פסים ישרים ומשעממים. חלקם רחבים, חלקם צרים, חלקם אלכסוניים קלות, חלקם עם קצוות מעוגלים או גליים.

זה מתאים במיוחד לכמות גדולה של תמונות.

## מבנה גיאומטרי

- חלוקה לעמודות או שורות
- חלק מהפסים מתפצלים
- אפשר לשלב תא גדול באמצע

## אלגוריתם

1. צור strips לפי מספר התמונות.
2. קבע משקל לכל strip.
3. חלק strips פנימית לפי הצורך.
4. הוסף variation קל:
   - offset
   - rounded edges
   - wave edge
   - diagonal cuts
5. נרמל את הכול כדי למלא שטח מלא.

## התאמה לכמות תמונות

### 6-12

- 3-4 פסים עיקריים
- חלוקה פנימית

### 13-30

- מצוין
- הרבה תאים בלי להיראות צפוף מדי

### 30+

- אחד הסגנונות הכי מתאימים
- אבל צריך להקפיד על גודל מינימלי

## חוקים

- לא יותר מדי פסים צרים
- תמונות פנים לא בתאים צרים מאוד
- פסים צרים מתאימים לנוף, פרטים, טקסטורות
- לשמור על היררכיה

## UX

- Strip direction
- Number of main strips
- Variation
- Rounded/wavy/diagonal edges

## קושי יישום

קל-בינוני.

## מתאים לשלב ראשון?

כן, בעיקר כי הוא יעיל להרבה תמונות.

---

# 7. Radial Hero Layout — מרכז עגול/אורגני ותמונות סביב

## רעיון עיצובי

תמונה מרכזית בולטת, וסביבה תמונות תומכות באופן רדיאלי. יכול להיות עיגול, אליפסה, blob, או צורה אורגנית. התמיכות יכולות להיות slices, קפסולות, או תאים גליים.

זה נותן תחושה של פוסטר חגיגי.

## מבנה גיאומטרי

- Hero במרכז
- Ring סביבו
- חלוקה של הטבעת לתאים
- אפשר שכבה חיצונית נוספת אם יש הרבה תמונות

## אלגוריתם

1. צור hero center shape.
2. צור ring חיצוני.
3. חלק את ring לסגמנטים.
4. עגל את הסגמנטים.
5. אם יש יותר תמונות, צור ring שני או תמיכות מלבניות בצדדים.

## התאמה לכמות תמונות

### 4-8

- Hero + ring אחד

### 9-16

- Hero + ring מפוצל יותר

### 17+

- פחות מומלץ, אלא אם מוסיפים אזורים חיצוניים

## חוקים

- Hero חייב להיות מספיק גדול
- סגמנטים סביב לא צריכים להיות דקים מדי
- להימנע מ-slices צרים שמחתכים פנים
- תמונות עם פנים קרובות מתאימות יותר לעיגולים/קפסולות

## UX

- Center hero size
- Ring count
- Segment style
- Organic center shape

## קושי יישום

בינוני-גבוה.

## מתאים לשלב ראשון?

לא ראשון, אבל מצוין לשלב שני.

---

# 8. Modular Irregular Grid — גריד לא אחיד עם תנועה

## רעיון עיצובי

זה הגשר בין גריד פשוט לבין קולאז' מיוחד. עדיין יש מבנה מלבני ברור, אבל התאים בגדלים שונים, חלקם מחוברים, חלקם מעוגלים, והקומפוזיציה נראית מעוצבת.

זה הסגנון הכי בטוח מסחרית.

## מבנה גיאומטרי

- grid בסיסי
- merge של תאים סמוכים
- שינוי משקלים
- rounding
- לפעמים קו גלי אחד או שניים

## אלגוריתם

1. צור grid לפי כמות תמונות.
2. בצע merge לתאים כדי ליצור גדולים וקטנים.
3. ודא שיש 1-3 תאים בולטים.
4. הוסף rounding / gaps.
5. אפשר להוסיף organic divider עדין.

## התאמה לכמות תמונות

מתאים כמעט לכל מספר.

### 3-5

- grid פשוט עם hero

### 6-20

- מצוין

### 20-60

- אחד הסגנונות הכי יציבים

## חוקים

- לא לאפשר יותר מדי תאים באותו גודל
- כל 6-8 תמונות צריך תא אחד גדול יותר
- להימנע מגריד משעמם מדי

## UX

- Density
- Size variation
- Rounded corners
- Hero count
- Organic touch

## קושי יישום

קל יחסית.

## מתאים לשלב ראשון?

כן. זה צריך להיות בסיס המערכת.

---

# 9. Soft Voronoi — חלוקה אורגנית לפי נקודות

## רעיון עיצובי

חלוקת שטח לפי נקודות מרכז, בדומה ל-Voronoi, אבל עם קווים רכים. התוצאה מרגישה טבעית, כמעט כמו תאים ביולוגיים או אבני פסיפס רכות.

זה יכול להיות מאוד מיוחד, אבל חייבים לשלוט בזה כדי שלא ייראה כאוטי.

## מבנה גיאומטרי

- בוחרים points לפי מספר תמונות
- מחשבים אזורי Voronoi
- מרככים גבולות
- מעגלים פינות
- מוודאים שטחים תקינים

## אלגוריתם

1. פזר נקודות עם Poisson disk sampling.
2. תן משקל לנקודות לפי חשיבות תמונות.
3. צור Voronoi cells.
4. חתוך לגבולות הקנבס.
5. הרכך polygons.
6. תקן תאים קטנים/צרים.

## התאמה לכמות תמונות

### 5-12

- הכי יפה

### 13-25

- אפשרי

### 25+

- עלול להיות צפוף מדי
- עדיף להשתמש ב-clusters

## חוקים

- לא לייצר תאים עם יותר מדי צלעות
- לא לאפשר שטחים קטנים מדי
- לא לאפשר צלעות קצרות מדי
- smoothing חייב להיות מוגבל

## UX

- Organicness
- Cell balance
- Hero weight
- Random seed

## קושי יישום

גבוה יחסית.

## מתאים לשלב ראשון?

לא. לשלב מתקדם.

---

# 10. Freeform Clusters — קבוצות תמונות חופשיות

## רעיון עיצובי

במקום קולאז' אחד רציף, מחלקים את התמונות לקבוצות. כל קבוצה יכולה להיות גלית, פוליגונית או grid קטן. זה טוב במיוחד להרבה תמונות, כי זה נותן סדר ויזואלי.

לדוגמה:

- cluster משפחה
- cluster ילדים
- cluster טיול
- cluster רגעים קטנים

גם אם אין ניתוח תוכן, אפשר ליצור clusters לפי סדר העלאה.

## מבנה גיאומטרי

- מחלקים את הקנבס ל-2-5 אזורי cluster
- כל cluster מקבל layout פנימי
- יש מרווחים גדולים יותר בין clusters

## אלגוריתם

1. קבע מספר clusters לפי מספר התמונות.
2. חלק את הקנבס לאזורים גדולים.
3. לכל cluster בחר sub-layout:
   - mini grid
   - waves
   - blobs
   - polygons
4. שייך תמונות לכל cluster.
5. צור איזון ויזואלי בין clusters.

## התאמה לכמות תמונות

### 8-15

- 2 clusters

### 16-30

- 3-4 clusters

### 30+

- 4-6 clusters
- אחד הסגנונות הכי טובים לכמויות גדולות

## חוקים

- כל cluster צריך עוגן ויזואלי
- לא ליצור clusters קטנים מדי
- לשמור על כיוון קריאה ברור
- לא לערבב יותר מדי סגנונות באותו עמוד

## UX

- Cluster count
- Cluster style
- Group by upload order / face count / manual selection
- Balance clusters

## קושי יישום

בינוני.

## מתאים לשלב ראשון?

שלב שני, אבל כדאי לתכנן אותו מראש.

---

# חלק ג': סדר יישום מומלץ

## Phase 1 — תשתית חובה

### מטרות

- ליצור Collage Layout Engine אמיתי
- להפריד בין תא למסיכה לתמונה
- לייצב Fill/Cover בתוך תא
- לאפשר regenerate בלי להרוס crop ידני

### משימות

1. ליצור types לקולאז'.
2. ליצור LayoutGenerator interface.
3. ליצור CollageCell כ-Frame/Mask.
4. ליצור Preview renderer.
5. ליצור validation לכל layout.
6. ליצור photo assignment בסיסי.
7. ליצור Wizard ראשוני.

---

## Phase 2 — שלושה סגנונות ראשונים

מומלץ להתחיל עם:

1. Modular Irregular Grid
2. Hero + Support
3. Organic Flow Cells

למה?

- הראשון יציב ומתאים להרבה תמונות
- השני שימושי מאוד מסחרית
- השלישי נותן את הייחוד שאתה מחפש

---

## Phase 3 — סגנונות מתקדמים אבל עדיין פרקטיים

4. Wave Ribbons
5. Dynamic Strips
6. Soft Polygon Packing
7. Amoeba Pack

---

## Phase 4 — סגנונות מתקדמים מאוד

8. Radial Hero
9. Freeform Clusters
10. Soft Voronoi

---

# חלק ד': מנגנון התאמה למספר תמונות

## עיקרון בסיס

לא כל סגנון מתאים לכל כמות תמונות.

לכן לכל סגנון צריך להגדיר:

```ts
interface LayoutStyleCapability {
  minImages: number;
  idealMin: number;
  idealMax: number;
  maxImages: number;
  fallbackStyle?: CollageLayoutStyle;
}
```

דוגמה:

```ts
const capabilities = {
  'organic-flow': { minImages: 3, idealMin: 4, idealMax: 14, maxImages: 24, fallbackStyle: 'freeform-clusters' },
  'modular-irregular-grid': { minImages: 2, idealMin: 4, idealMax: 60, maxImages: 120 },
  'soft-voronoi': { minImages: 5, idealMin: 6, idealMax: 18, maxImages: 28, fallbackStyle: 'soft-polygons' },
};
```

אם המשתמש בוחר סגנון שלא מתאים לכמות התמונות, לא לחסום אותו מיד. להציג הודעה:

“הסגנון הזה נראה הכי טוב עם 6-18 תמונות. עבור 42 תמונות מומלץ להשתמש בגריד דינמי או קבוצות חופשיות.”

---

# חלק ה': מנגנון Crop חכם

## דרישות

כל תא צריך לדעת להציג תמונה בלי חיתוך רע.

במיוחד:

- לא לחתוך ראש
- לא לחתוך פנים בקצה
- לא להשאיר לבן
- לא להגדיל יותר מדי תמונה באיכות נמוכה

## אלגוריתם בסיסי

1. חשב scale מינימלי ל-cover.
2. מצא safe area בתוך המסיכה.
3. אם יש face detection:
   - מקם את הפנים בתוך safe area.
4. אם אין:
   - השתמש במרכז או saliency.
5. clamp להזזה פנימית חוקית.

---

# חלק ו': שמירה, Autosave והיסטוריה

כל regenerate צריך להיות history action ברור.

פעולות מומלצות:

- COLLAGE_STYLE_CHANGED
- COLLAGE_LAYOUT_REGENERATED
- COLLAGE_PHOTOS_SHUFFLED
- COLLAGE_CELL_CROP_UPDATED
- COLLAGE_CELL_LOCKED
- COLLAGE_CONVERTED_TO_FREE_LAYOUT

Autosave צריך לשמור:

- style
- seed
- cell geometry
- photo assignments
- internal image transforms
- locked cells/crops

---

# חלק ז': ייצוא והדפסה

בייצוא צריך להקפיד:

- render לפי DPI אמיתי
- mask paths scaled correctly
- gaps נשארים עקביים
- bleed/safe area אם מדובר במוצר
- לא לייצא preview low-res

---

# חלק ח': פרומפט מקיף לקלוד / מפתח

## Prompt: Implement Dynamic Collage Layout Engine for SPP2

You are working on SPP2, an Electron + React + Konva desktop print/design application. The goal is to implement a dynamic collage layout system that supports reusable layout generators, real mask/frame cells, smart photo fitting, and multiple advanced collage styles.

Important architecture context:

- SPP2 already has image layers, masks/frames, free mode, print/export flows, autosave/history, and Konva rendering.
- A collage cell must not be treated as a plain image. It must be a real frame/mask container with an internal image transform.
- The image inside a collage cell must use Cover/Fill behavior by default and must never expose white/empty background when dragged or transformed.
- The user needs dynamic layouts that adapt to many image counts, not fixed SVG templates.
- The system must be performant in Electron/Konva and must avoid excessive path complexity.

Implement this in phases.

### Phase 1 — Core Types and Engine

Create a dynamic collage engine with these concepts:

1. `CollageLayoutStyle`
2. `CollageCell`
3. `CollageLayoutResult`
4. `LayoutGeneratorOptions`
5. `LayoutGenerator` interface
6. layout validation utilities
7. photo assignment utilities
8. cover/fill crop calculation utilities

A layout generator receives:

- canvas width/height
- image count
- seed
- style options
- optional photo analysis data
- optional hero photo ids

and returns:

- cells with mask paths
- cell roles: hero / primary / support / accent
- weights
- preferred aspect ratio
- crop priority
- warnings
- metadata

### Phase 2 — Collage Cell as Frame/Mask

Add a proper collage cell layer model or reuse the existing frame/mask architecture if available.

Each collage cell must contain:

- a mask path
- bounds for selection/hit testing
- assigned image id
- internal image transform: scale, offsetX, offsetY, rotation if supported
- fill mode, default `cover`
- locked state
- crop lock state

Do not flatten the image and mask together in the document model. The mask and internal image transform must remain editable.

### Phase 3 — Cover/Fit Safety

Implement robust cover behavior for every cell:

- Compute minimum scale to fully cover the cell bounds.
- Use mask safe bounds where possible.
- Clamp internal image movement so the image can never reveal empty areas.
- Support future face-aware crop logic.
- Keep manual crop adjustments when regenerating layout if the cell remains compatible.

This is especially important because SPP2 previously had issues where images moved inside fill cells and exposed white areas. Do not reintroduce that bug.

### Phase 4 — First Layout Generators

Implement these first three styles:

#### 1. Modular Irregular Grid

A stable dynamic grid with merged cells, different cell sizes, optional rounded corners, and 1-3 larger hero/primary cells.

Rules:

- Works with 2-80 images.
- Every 6-8 images should include at least one larger cell.
- Avoid too many identical cells.
- Validate minimum cell size.

#### 2. Hero + Support

A layout with one large hero image and supporting cells around it.

Rules:

- Hero should occupy 25%-60% depending on image count.
- Support cells fill remaining space.
- Hero can be center, left, right, top, or organic position.
- Best photo should be assigned to hero automatically if no manual hero is selected.

#### 3. Organic Flow Cells

A dynamic layout inspired by flowing curved dividers. It should resemble soft wave-based cells, not a rigid grid.

Rules:

- Use an invisible base grid or partition system.
- Convert dividers into smooth Bezier curves.
- Generate closed mask paths for each cell.
- Keep curves moderate so faces are not cut badly.
- Avoid thin necks and tiny cells.
- Works best with 4-16 images, but can support more by clustering.

### Phase 5 — Additional Layout Styles

After the first three are stable, implement:

4. Wave Ribbons
5. Dynamic Strips
6. Soft Polygon Packing
7. Amoeba Pack
8. Radial Hero
9. Freeform Clusters
10. Soft Voronoi

Each style should implement the same `LayoutGenerator` interface and should declare its supported image count range.

### Phase 6 — UI / Wizard

Add a Dynamic Collage wizard screen or panel:

- Select photos
- Select layout style
- Choose hero photo or auto hero
- Sliders:
  - density
  - gap size
  - organicness
  - size variation
  - hero strength
  - corner roundness
- Buttons:
  - Generate
  - Regenerate same style
  - Shuffle photos only
  - Change layout keep photos
  - Change style keep hero
  - Lock selected cell
  - Lock selected crop
  - Convert to editable free layout

The UI should show warnings if a style is not ideal for the selected image count.

### Phase 7 — History and Autosave

Add history actions:

- COLLAGE_CREATED
- COLLAGE_LAYOUT_REGENERATED
- COLLAGE_STYLE_CHANGED
- COLLAGE_PHOTOS_SHUFFLED
- COLLAGE_CELL_CROP_UPDATED
- COLLAGE_CELL_LOCKED
- COLLAGE_CONVERTED_TO_FREE_LAYOUT

Autosave must save:

- style
- seed
- cells
- mask paths
- image assignments
- internal transforms
- locks
- style options

### Phase 8 — Performance

Konva performance rules:

- Cache complex masks where possible.
- Use simplified paths while dragging/resizing.
- Limit path points.
- Avoid hundreds of expensive clip functions.
- Debounce layout regeneration.
- Render final quality only on export/print.

### Phase 9 — Export/Print

Ensure collage export uses final resolution paths and correct DPI scaling.

- Scale mask paths correctly.
- Preserve gaps/strokes.
- Respect bleed/safe area if used in product mode.
- Do not export low-resolution previews.

### Acceptance Criteria

The implementation is successful when:

1. A user can create a dynamic collage from 3-40 photos.
2. At least three styles work reliably: Modular Irregular Grid, Hero + Support, Organic Flow.
3. All collage cells behave as editable masks/frames.
4. Images fill cells without exposing white background.
5. Regenerate creates useful variations without destroying the entire project.
6. Autosave/history restore the collage correctly.
7. Export/print output matches the canvas preview.
8. Performance remains smooth with at least 30 photos on a normal Windows computer.

Do not implement this as fixed SVG templates. Build it as a generator-based architecture.

---

# סיכום קצר

הכיוון הנכון ל-SPP2 הוא לא “עוד כמה תבניות קולאז'”, אלא מנוע קולאז' דינמי שמבין תאים, מסיכות, משקלים, היררכיה, crop, כמות תמונות וסגנון.

שלושת הסגנונות הראשונים שכדאי לפתח:

1. Modular Irregular Grid
2. Hero + Support
3. Organic Flow Cells

אחריהם להוסיף:

4. Wave Ribbons
5. Dynamic Strips
6. Soft Polygons
7. Amoeba Pack
8. Radial Hero
9. Freeform Clusters
10. Soft Voronoi

אם זה ייבנה נכון, זה יכול להפוך את כלי הקולאז' ב-SPP2 לאחד הכלים הכי חזקים בתוכנה — במיוחד לחנות מתנות, הדפסות, קנבסים, בלוקים, תמונות מחזור ומוצרים מותאמים אישית.


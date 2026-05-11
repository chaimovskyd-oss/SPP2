# SPP v2 — Master Build Prompt for Claude Code

## תפקידך
אתה הולך לבנות את **SPP v2** — תוכנת Electron מקצועית לעיצוב והכנה לדפוס.
זה לא MVP חד-פעמי. זה core ארכיטקטוני שיתפתח שנים.
**איכות הבסיס חשובה יותר מהמהירות.** אל תיקח קיצורי דרך.

קרא את כל המסמך לפני שתכתוב שורת קוד. בסוף תמצא הוראות פעולה מדויקות.

---

# חלק 1 — חזון המוצר

SPP v2 היא פלטפורמת עיצוב מודולרית לעבודות דפוס.

**המטרה:**
- חופש של עורך עיצוב מקצועי
- מהירות של כלי workflow ייעודיים
- UI מודרני וקליל
- ארכיטקטורה משותפת ללא כפילויות
- סקיילביליות גבוהה לכלים עתידיים
- פלט print-ready מדויק
- תמיכה עברית/RTL מצוינת

**המוצר חייב להרגיש:** מהיר • מודרני • יציב • צפוי • מודולרי • מקצועי

**המוצר אסור שיהפוך ל:**
- שיבוט של Photoshop
- אוסף של מיני-אפליקציות מנותקות
- ארכיטקטורה כפולה כמו בגרסה הישנה
- בלגן של פלאגינים
- ריבוי קנבסים / מנועי טקסט / מערכות שמירה

---

# חלק 2 — שלוש פילוסופיות ליבה (חוקים בלתי-עבירים)

## חוק 1 — One Shared Core
יש **מנוע ליבה אחד**. כל מצב/כלי חייב להשתמש ב:
- אותו canvas engine
- אותה layer system
- אותו text engine
- אותו image engine
- אותה save/load system
- אותו export pipeline
- אותה rulers/guides/snapping
- אותה selection + transform
- אותה undo/redo

**שום מצב לא יוצר implementation עצמאי.**

## חוק 2 — Modes הם Workflow Layers
מצבי עבודה אינם אפליקציות נפרדות. מצב מגדיר רק:
- workflow behavior
- UI emphasis
- automation logic
- presets
- panels ייעודיים
- layout rules

**מצב לעולם לא מגדיר** canvas/text engine/layer model/save/export/object structure משלו.

## חוק 3 — Single Source of Truth
לכל אובייקט ויזואלי יש object data canonical אחד.

- UI לעולם לא בעלים של data
- Canvas לעולם לא בעלים של data
- מצבים זמניים לעולם לא הופכים לאמת persistent
- אסור duplicate object representations
- אסור unsynced text states
- אסור canvas-only temporary objects

---

# חלק 3 — Technology Stack (מחייב)

## Desktop Shell
**Electron + React + TypeScript**

## State Management
**Zustand** — מרכזי, lightweight, מונע duplicated states

## Canvas Engine
**React-Konva** — אחראי על rendering ואינטראקציות בלבד.
**Konva הוא לא ה-source of truth.** ה-state המרכזי הוא.

## Image Processing
- Frontend preview: **Sharp** (Node side)
- Heavy processing: **Python Worker** (OpenCV / Pillow / MediaPipe)
- Python הוא לא UI. Python הוא processing engine בלבד.

## Export
- PDF: **pdf-lib**
- Image: **Sharp**

## Updates
**electron-builder + electron-updater**

## File Structure
```
SPP_v2/
  core/           # מנועי ליבה משותפים
    document/
    pages/
    layers/
    frames/
    text/
    image/
    selection/
    transform/
    history/
    save/
    export/
  modes/          # workflow shells
    free/
    grid/
    mask/
    class_photo/
    photo_print/
    product/
    collage/
    pdf_tools/
  ui/             # React components
    layout/
    panels/
    canvas/
    home/
    dialogs/
  services/       # business logic services
    template_engine/
    batch_operations/
    product_library/
    asset_manager/
    preset_manager/
  workers/        # Python workers
    color_lab/
    face_detect/
    smart_crop/
    background_remove/
  state/          # Zustand stores
  types/          # TypeScript types
  utils/
  assets/
  project_format/
```

---

# חלק 4 — מערכות ה-Core (חובה לבנות לפי הסדר הזה)

## 4.1 Document System
פרויקט יכול להכיל: pages, layouts, workflows, shared assets, presets.

```typescript
interface Document {
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  dpi: number;
  colorProfile: string;
  pages: Page[];
  assets: Asset[];
  presets: Preset[];
  metadata: Record<string, any>;
}
```

**חוקים:** document בעלים של pages → pages בעלים של layers → layers בעלים של content. כלום לא קיים מחוץ למבנה.

## 4.2 Page System
תמיכה אמיתית ב-multi-page (אלבומים, גיליונות דפוס, וריאציות, batch layouts).

```typescript
interface Page {
  id: string;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  bleed: Margins;
  margins: Margins;
  background: Background;
  layers: BaseLayer[];
  guides: Guide[];
  metadata: Record<string, any>;
}
```

**חוקים:** pages הם canvases עצמאיים. תמיכה ב-duplication, drag-reorder, templates.

## 4.3 Layer System
**הכל הוא layer** (image, text, shape, group, mask, background, frame, guide).

```typescript
interface BaseLayer {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  selected: boolean;
  parentId?: string;
  metadata: Record<string, any>;
}
```

## 4.4 Frame / Cell System (לב המוצר)

```typescript
interface FrameLayer extends BaseLayer {
  shape: 'rect' | 'circle' | 'ellipse' | 'polygon' | 'svgPath' | 'customMask';
  contentType: 'image' | 'text' | 'mixed' | 'empty';
  imageAssetId?: string;
  textLayerId?: string;
  fitMode: 'fit' | 'fill' | 'smartCrop' | 'stretch';
  crop: CropRect;
  padding: number;
  cornerRadius?: number;
  stroke?: StrokeStyle;
  fill?: FillStyle;
  maskId?: string;
  linkedGroup?: string;
  batchIndex?: number;
  smartCropMode?: 'none' | 'face' | 'center' | 'ruleOfThirds' | 'custom';
  faceAnchor?: FaceAnchorData;
  lockedContent?: boolean;
  lockedFrame?: boolean;
}
```

**חוקים:** כל תא הוא layer. כל מצב משתמש באותו FrameLayer, לא במימוש משלו.

## 4.5 LinkedGroup System (חשוב — צריך הגדרה מפורשת)

```typescript
interface LinkedGroup {
  id: string;
  name: string;
  type: 'size' | 'style' | 'spacing' | 'fitMode' | 'textStyle' | 'all';
  memberIds: string[];          // ids של layers בקבוצה
  masterFrameId?: string;       // master frame אופציונלי
  overridable: boolean;          // האם תא בודד יכול לשבור את הקישור?
  perMemberOverrides: Record<string, Partial<FrameLayer>>;
}
```

**חוקים:**
- שינוי על המאסטר מתפשט לכל החברים
- שינוי על member בודד יוצר override (אם overridable=true)
- מחיקת member מהקבוצה לא משפיעה על השאר

## 4.6 Pro Text Engine
**מנוע טקסט אחד יחיד.** כל מצב משתמש בו.

```typescript
interface TextLayer extends BaseLayer {
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  stroke?: StrokeStyle;
  shadow?: ShadowStyle;
  gradient?: GradientStyle;
  alignment: 'right' | 'center' | 'left' | 'justify';
  direction: 'rtl' | 'ltr' | 'auto';
  arcSettings?: ArcSettings;
  warpSettings?: WarpSettings;
  textEffects?: TextEffect[];
}
```

**RTL מחייב:**
- תמיכה מלאה בעברית
- mixed Hebrew/English נכון
- copy/paste מדויק
- ייצוא מדויק
- Google Fonts + system fonts

**Editing:** HTML overlay editor → Canvas/SVG preview → Export renderer.

## 4.7 Image Engine
**הקנבס לעולם לא מציג originals ב-full-res בזמן עריכה.**
- Preview rendering = previews מותאמים
- Export = assets מקוריים
- Non-destructive בלבד
- כל adjustment הוא parameter-based

```typescript
interface ImageLayer extends BaseLayer {
  assetId: string;
  crop: CropRect;
  fitMode: FitMode;
  transform: Transform;
  filters: Filter[];
  colorAdjustments: ColorAdjustments;
  perspective?: PerspectiveCorrection;
  mask?: string;
}
```

## 4.8 Selection / Transform / History
- **Selection:** מנהל אחד מרכזי. אין duplicate state.
- **Transform:** מנוע משותף ל-move/resize/rotate/scale/snap/align/distribute.
- **History:** מרכזי. כל שינוי עובר דרך command/action. אין mutations ישירות.

## 4.9 Save / Load
```
project.json    # מבנה הפרויקט בלבד
assets/         # external
previews/       # cached
fonts/          # embedded
```

JSON מכיל מבנה בלבד. assets נשארים חיצוניים. format חייב להיות versioned.

## 4.10 Export / Print
מרכזי. שום מצב לא בעלים של export logic.
תכונות: PDF / PNG / JPG / multi-page / bleed / DPI / print preview / printer presets.

---

# חלק 5 — Services שכבר קיימים ב-Python (חובה לאינטגרציה, לא לכתוב מחדש!)

יש לי כבר תוכנות Python קיימות שעובדות. ה-Electron app יקרא להן דרך IPC + Python child process:

1. **Color Lab** — תיקוני תמונה חכמים עם presets ✅ קיים
2. **Print Preview / הכנה להדפסה** ✅ קיים
3. **Product Library** — מידות, bleed, מוצרים מקומיים ✅ קיים
4. **Greeting Generator** (מצב עתידי) — מאגר רקעים וברכות מוכנות ✅ קיים

**משימה:** עטוף את ה-Python services הקיימים ב-Service wrappers ב-TypeScript. אל תכתוב מחדש את הלוגיקה. בנה bridge נקי דרך IPC.

```typescript
// services/python_bridge/
interface PythonService<TInput, TOutput> {
  call(input: TInput): Promise<TOutput>;
  callBatch(inputs: TInput[]): Promise<TOutput[]>;
  cancel(jobId: string): Promise<void>;
}
```

---

# חלק 6 — Template Engine (מנוע התבניות)

תבנית היא מבנה חכם, לא קובץ עיצובי בלבד.

```typescript
interface Template {
  id: string;
  name: string;
  mode: ModeType;
  version: number;
  pageSetup: PageSetup;
  pages: TemplatePage[];
  slots: TemplateSlot[];
  textZones: TemplateTextZone[];
  lockedLayers: string[];
  editableLayers: string[];
  autoFillRules: AutoFillRule[];
  smartArrangeRules: SmartArrangeRule[];
  printSpec: PrintSpec;
  metadata: Record<string, any>;
}

interface TemplateSlot {
  id: string;
  pageId: string;
  type: 'image' | 'text' | 'mixed';
  frameId: string;
  batchIndex?: number;
  linkedGroup?: string;
  required: boolean;
  defaultFitMode: FitMode;
  allowedContentTypes: string[];
  metadata: Record<string, any>;
}

interface TemplateTextZone {
  id: string;
  pageId: string;
  role: 'title' | 'subtitle' | 'name' | 'caption' | 'footer' | 'custom';
  linkedGroup?: string;
  defaultTextStyle: TextStyle;
  editable: boolean;
  batchConnectedToSlot?: string;
}
```

---

# חלק 7 — Batch Operations System

פעולות batch הן קריטיות (40 עיגולים, 80 תמונות בגריד, וכו').

```typescript
interface BatchJob {
  id: string;
  type: BatchJobType;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;          // 0-100
  totalItems: number;
  completedItems: number;
  errors: BatchError[];
  cancellable: boolean;
  createdAt: string;
  updatedAt: string;
}

type BatchJobType =
  | 'importImages'
  | 'fillFrames'
  | 'smartCrop'
  | 'faceDetect'
  | 'exportPages'
  | 'applyTextStyle'
  | 'generatePages';
```

**חוקים:**
- כל פעולה ארוכה חייבת להציג progress (bottom bar, לא modal)
- ה-UI לעולם לא נראה תקוע
- פעולות כבדות רצות ב-Worker
- כל batch ניתן לביטול אם אפשר
- שגיאות מדווחות per-item, לא עוצרות את כל ה-job

---

# חלק 8 — Product Library Service

עוטף את ה-Python service הקיים:

```typescript
interface ProductDefinition {
  id: string;
  name: string;
  category: string;
  printSpec: PrintSpec;
  canvasSize: Size;
  safeArea: Rect;
  bleed: Margins;
  templates: Template[];
  masks: MaskDefinition[];
  mockups: ProductMockup[];
  defaultExportSettings: ExportSettings;
  metadata: Record<string, any>;
}
```

**חוקים:**
- מוצר נטען לתוך אותו core
- מוצר מייצר Template או Document
- safe area + print area מוצגים כ-Guides/Overlays
- ה-user עורך רק אזורים editable
- כל מוצר ניתן לעדכון עתידי בלי לשבור פרויקטים ישנים

---

# חלק 9 — Preset System

```typescript
interface Preset {
  id: string;
  name: string;
  scope: 'grid' | 'text' | 'mask' | 'print' | 'export' | 'color';
  data: Record<string, any>;
  isDefault?: boolean;
  isShared?: boolean;
  thumbnail?: string;
  createdAt: string;
}
```

חוצה כל המצבים. ניתן לשמירה, ייבוא, ייצוא.

---

# חלק 10 — Workflow Modes (כולם משתמשים באותו core)

## Free Mode
**MVP Phase 1.** מצב חופשי שמוכיח שה-core עובד.
- drag/drop images
- add text
- resize/rotate/move
- layer ordering
- grouping
- snap/guides
- save/load
- export

## Grid Mode
```typescript
interface GridTemplate {
  pageSize: Size;
  margins: Margins;
  rows?: number;
  columns?: number;
  cellSize?: Size;
  spacing: number;
  fillMode: 'byRowsColumns' | 'byCellSize' | 'autoFitCount';
  fitMode: FitMode;
  autoCreatePages: boolean;
}
```
**Test:** משתמש גורר 80 תמונות, מגדיר 4x6, spacing+margins → המערכת יוצרת דפים מלאים עם אפשרות לשנות fit/fill לכולם.

## Mask Mode
```typescript
interface MaskTemplate {
  maskId: string;
  maskType: 'shape' | 'svg' | 'png';
  frameCount: number;
  arrangement: 'grid' | 'circle' | 'custom' | 'free';
  spacing: number;
  linkedGroup?: string;
  defaultFitMode: FitMode;
}
```
**Test:** משתמש בוחר מסיכת עיגול, גורר 40 תמונות → 40 עיגולים עם face detection, כל פנים ממורכזות, אפשרות לשנות גודל/מרווח לכולם יחד.

## Photo Print Mode
```typescript
interface PhotoPrintJob {
  imageAssets: Asset[];
  printSize: Size;
  copies: number;
  border: BorderSettings;
  passepartout: PassepartoutSettings;
  fitMode: FitMode;
  paperOptimization: boolean;
  printerPresetId?: string;
}
```
**Test:** 50 תמונות, 10x15, 2 עותקים, גבול לבן → המערכת מסדרת על דפי הדפסה.

## Class Photo Mode (אשף)
```typescript
interface ClassPhotoTemplate {
  pageSetup: PageSetup;
  backgroundLayerId: string;
  titleZones: TemplateTextZone[];
  studentSlots: TemplateSlot[];
  teacherSlots?: TemplateSlot[];
  footerZones?: TemplateTextZone[];
  arrangementRules: ArrangementRule[];
  defaultCellShape: 'circle' | 'roundedRect' | 'rect' | 'custom';
  nameTextStyle: TextStyle;
}

interface StudentRecord {
  id: string;
  name: string;
  imageAssetId: string;
  slotId?: string;
  faceData?: FaceAnchorData;
  metadata?: Record<string, any>;
}
```

**חשוב — שמות מתמונות:** המשתמש מעלה תמונות עם שם הקובץ = שם הילד.
דוגמה: `יותם.jpeg` → השם הוא "יותם".
דוגמה: `יותם_כהן.jpeg` → "יותם כהן" (replace `_` with space).
תמיכה בעברית ב-filenames מחייבת.

**Wizard:** page+template → upload photos → face detect+crop → adjust names → background+style → auto arrange → manual edit → export.

**Test:** 35 תמונות עם שמות בעברית מ-filenames → תמונת מחזור מוכנה עם פנים ממורכזות, שמות תקינים, כותרת ורקע.

## Product Library Mode
נטען מה-Python service הקיים. user בוחר מוצר → canvas במידה הנכונה עם safe area → drag image + add text → export לפי דרישות המוצר.

## Collage Tool (Phase מאוחר יותר)
תאים בגדלים שונים, layout דינמי, אופציה ל-regenerate.

## PDF Tools (Phase מאוחר יותר)
- Phase 1 בלבד: open PDF, resize pages, re-export
- Booklet = עתידי

## Greeting Generator (עתידי — מצב מאוחר)
משלב את ה-Python service הקיים. רקעים + ברכות מוכנות. כרגע **לא** לבנות, רק להשאיר slot ב-modes/.

---

# חלק 11 — UI Architecture

## Layout
```
┌─────────────────────────────────────────────────────┐
│  Top Bar (44px)                                     │
├─────┬───────────────────────────┬───────────────────┤
│ L   │                           │                   │
│ e   │   Canvas Center           │  Right Context    │
│ f   │                           │  Panel (280px)    │
│ t   │                           │  (contextual)     │
│     │                           │                   │
│Rail │                           │                   │
│52px │                           │                   │
├─────┴───────────────────────────┴───────────────────┤
│  Bottom Page Strip (32px) + Batch Progress          │
└─────────────────────────────────────────────────────┘
```

## Left Tool Rail (אייקונים בלבד)
Move • Text • Shape • Frame • Layers • Assets
**אסור toolbar ענק.**

## Right Panel
**Contextual.** משתנה לפי mode/tool/selected layer.
אם לא נבחר כלום → מינימלי.

## Text UI
Quick controls גלויים. Advanced expandable.

---

# חלק 12 — Visual Design (חובה לעקוב)

## Palette (CSS Variables)
```css
:root {
  --bg-base:        #17161C;
  --bg-surface:     #211F28;
  --bg-elevated:    #2C2A35;
  --bg-canvas:      #0F0E13;
  --border:         #35323F;
  --text-primary:   #F0EEF8;
  --text-secondary: #8B88A0;
  --accent:         #7C6FE0;
  --accent-hover:   #9B8FF0;
  --accent-glow:    rgba(124, 111, 224, 0.15);
  --success:        #52C97A;
  --warning:        #E0A650;
  --danger:         #E06B6B;
}
```

## Typography
- Display: **Syne** (Google Fonts)
- UI body: **DM Sans** (Google Fonts)
- Sizes: 11 / 13 / 16 / 24+

## Icons
**Lucide React.** 16px UI, 20px toolbar, 24px home cards.

## Transitions
150ms ease-out. ללא exception.

## Border Radius
- Cards: 8px
- Buttons: 6px
- Inputs: 4px

## Mode Cards Colors
- Free → סגול #7C6FE0
- Grid → כחול #6FB5E0
- Mask → ורוד #E06FA8
- Class Photo → צהוב #E0C050
- Photo Print → ירוק #52C97A
- Product → כתום #E08A50

---

# חלק 13 — Performance Rules (חובה)

✅ חובה:
- Lazy page rendering
- Asset caching
- Preview rendering נפרד מ-export
- Virtualized lists
- Debounced updates
- GPU-friendly rendering
- Background workers לעבודה כבדה

🚫 אסור:
- Rendering full originals live
- Blocking the UI thread
- Duplicate state systems
- חישובים כבדים בתוך React render loops

---

# חלק 14 — Development Rules

✅ חובה:
- Component-based architecture
- TypeScript strict mode
- שום duplicated systems
- שום hidden temp states
- כל major system מתועד
- כל object type עם version field
- שום quick hack ב-core

🚫 כלל זהב — **The Final Rule:**
> אם פיצ'ר לא יכול להיבנות מעל Document/Page/Layer/Frame/Template/Batch/Export — **לא מוסיפים אותו כפתרון צדדי**. קודם מרחיבים את ה-core בצורה נקייה.

---

# חלק 15 — Data Model Validation (לפני קוד!)

לפני שאתה כותב שורת קוד, ודא שהמודלים תומכים ב-4 תרחישים אלה. אם לא — תקן את המודל קודם.

**Scenario A — 40 Circle Masks:**
40 FrameLayers, shape=circle, אותו linkedGroup, כל אחד עם תמונה שונה, smart crop שונה לכל אחד, אבל גודל/spacing משותף לקבוצה. עדיין ניתן לערוך crop פרטני.

**Scenario B — Class Photo with Names:**
35 student frames + 35 name text layers. כל שם linked ל-student slot. שינוי סגנון שמות → לכולם. שם בודד עדיין editable. רקע נעול. כותרת editable.

**Scenario C — Grid With Auto Pages:**
80 images, 24 frames/page, יצירת דפים אוטומטית, אותם grid rules בכל הדפים, crop פרטני per-image, שינוי global fit/fill.

**Scenario D — Product Safe Area:**
Product template מגדיר print size, safe area visible, mockup אופציונלי, locked layers, editable zones, export מכבד את ה-print spec.

---

# חלק 16 — סדר הבנייה (חובה לפי הסדר!)

## Phase 0 — Architecture Proof (שבוע 1-2)
**ללא UI מלא.** רק:
- types/*.ts — כל ה-interfaces המלאים
- state/*.ts — Zustand stores ריקים
- save/load schema + versioning
- בדיקת ה-4 scenarios על המודלים (unit tests)
- folder structure

**Definition of done:** אני יכול ליצור Document → Page → Layers → Frames programmatically, לשמור JSON, לטעון, ולקבל בדיוק את אותו state.

## Phase 1 — Free Mode Core (שבוע 3-5)
- Home screen (לפי הdesign)
- Create project flow
- Canvas + React-Konva integration
- Add image (drag/drop)
- Add text (Pro Text basic)
- Layer panel
- Save/load
- Export image + PDF

## Phase 2 — Frame/Cell Engine (שבוע 6-7)
- FrameLayer rendering
- Fit/fill/smart crop (smart crop יקרא ל-Python worker)
- Crop UI
- LinkedGroup logic
- Batch fill בסיסי

## Phase 3 — Grid Mode (שבוע 8-9)
- Grid generation
- Multi-page auto creation
- Batch image fill
- Apply settings to all

## Phase 4 — Mask Mode (שבוע 10-11)
- Shape masks
- SVG/PNG masks
- Linked mask groups
- Smart crop integration

## Phase 5 — Photo Print Mode (שבוע 12)
חיבור ל-Python services קיימים (Print Preview).

## Phase 6 — Class Photo Mode (שבוע 13-14)
Wizard מלא + face detection (Python) + names from filenames.

## Phase 7 — Product Library Mode (שבוע 15-16)
חיבור ל-Python Product Library הקיים.

---

# חלק 17 — חיבור Python Services קיימים

**אל תכתוב מחדש.** ה-Python services הללו קיימים ועובדים:
1. Color Lab
2. Print Preview
3. Product Library
4. Greeting Generator (לעתיד)

צור thin TypeScript wrappers שמתקשרים איתם דרך:
- **electron IPC** ל-main process
- **child_process** או **python-shell** ל-Python
- JSON serialization
- Job queue + cancellation
- Progress events

```typescript
// services/python_bridge/PythonBridge.ts
class PythonBridge {
  async call<T>(service: string, method: string, params: any): Promise<T>;
  async callStreaming<T>(service: string, method: string, params: any,
                         onProgress: (p: ProgressEvent) => void): Promise<T>;
  cancel(jobId: string): Promise<void>;
}
```

---

# חלק 18 — Visual Design Reference

**עקרונות:**
- Dark UI, גוון סגול-אפור חם (לא שחור)
- Canvas הוא הכוכב — שאר ה-UI נסוג
- תפריטים contextual — מופיעים רק כשצריך
- אייקונים צבעוניים עדינים — צבע לפי קטגוריה
- ללא toolbar ענק
- ללא modal popups לכל דבר

**מסך הבית:** 6 mode cards, כל אחד עם icon גדול בצבעו, hover עם glow.
**Canvas view:** Top bar 44px + Left rail 52px + Canvas (flex) + Right panel 280px contextual + Bottom 32px.

מסכי דיזיין מפורטים יסופקו בנפרד או ב-React reference component.

---

# חלק 19 — מה שאני מצפה ממך עכשיו

## שלב 1 — Confirm understanding (לפני קוד!)
לפני שתכתוב **שורה אחת של קוד**, ענה במילים שלך:

1. מה הם 3 חוקי הליבה?
2. למה Python קיים בארכיטקטורה ולמה לא נשתמש בו ל-UI?
3. תאר את ה-flow של Scenario A (40 circle masks) במונחי המודלים שלי.
4. מה ההבדל בין Template, FrameLayer, ו-LinkedGroup?
5. מה Phase 0 כולל ומה הוא **לא** כולל?

אם משהו לא ברור — **תשאל לפני קוד**. אסור לנחש.

## שלב 2 — Phase 0
אחרי שאישרתי את ההבנה שלך, התחל ב-Phase 0:
1. צור את folder structure המלא
2. כתוב את כל ה-types המלאים ב-TypeScript
3. צור Zustand stores ריקים אבל typed
4. כתוב unit tests שמוכיחים את 4 הScenarios על המודל
5. הצג לי את התוצאה לבחינה לפני שתעבור ל-Phase 1

## שלב 3 — אחרי אישור Phase 0
המשך ל-Phase 1 (Free Mode Core).

---

# חלק 20 — חוקי ברזל לכל אורך הפרויקט

1. **אל תיקח קיצורי דרך ב-core.** קיצור דרך עכשיו = refactor כואב בעתיד.
2. **אל תפזר state.** הכל ב-Zustand stores מרכזיים.
3. **אל תיצור duplicate systems.** אם יש לך הרגשה שכבר כתבת משהו דומה — חפש לפני שתכתוב.
4. **אל תשכח RTL.** עברית first-class בכל component, בכל input, בכל layout.
5. **אל תשבור את "The Final Rule":** פיצ'ר חדש מתחיל מהרחבת core, לא מ-patch צדדי.
6. **תיעוד תוך כדי קוד.** כל module עם README קצר שמסביר את ה-API שלו.
7. **TypeScript strict, no any.** אם אתה צריך any — אתה צריך type טוב יותר.
8. **שאל אותי לפני decisions ארכיטקטוניים גדולים.**

---

**עכשיו — קרא שוב את חלק 19 שלב 1 והשב. ללא קוד.**

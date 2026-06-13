import {
  ArrowLeft,
  ArrowRight,
  Check,
  Image,
  Trash2,
  UploadCloud,
  UserRound,
  X
} from "lucide-react";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactElement
} from "react";
import { PAGE_PRESETS, pageSetupFromPreset, getPagePreset } from "@/core/pageSetup/presets";
import { unitToPx } from "@/core/units/conversion";
import {
  createClassPhotoPersonRecord,
  defaultChildNameTextStyle,
  defaultChildFrameStyle,
  defaultStaffFrameStyle,
  defaultStaffNameTextStyle,
  defaultTitleTextStyle,
  defaultFooterTextStyle,
  defaultLayoutSettings,
  defaultVisualBalanceSettings
} from "@/core/classPhoto/classPhotoFactory";
import { computeOptimalClassPhotoLayout } from "@/core/classPhoto/classPhotoLayoutEngine";
import { BUILTIN_TEXT_PRESETS } from "@/core/text/presets";
import { HEIC_CONVERSION_ERROR_MESSAGE, SUPPORTED_IMAGE_ACCEPT, normalizeIncomingImage, normalizeIncomingImages } from "@/core/image/normalizeIncomingImage";
import { getAllFonts, loadSystemFonts } from "@/ui/editor/fonts";
import { GlobalWizardDropTarget, isImageDropFile } from "@/ui/wizard/GlobalWizardDropTarget";
import type {
  ClassPhotoFrameStyle,
  ClassPhotoLayoutSettings,
  ClassPhotoPersonRecord,
  ClassPhotoVisualBalanceSettings,
  ClassPhotoWizardResult,
  ClassPhotoWizardImageEntry
} from "@/types/classPhoto";
import type { PageSetup, Unit } from "@/types/primitives";
import type { ProjectCustomerInfo } from "@/types/project";

// ─── Page presets ─────────────────────────────────────────────────────────────

const CLASS_PHOTO_PRESETS = [
  ...PAGE_PRESETS.filter((p) =>
    p.category === "photo" ||
    (p.category === "paper" && ["a4", "a3"].includes(p.id))
  ),
  { id: "custom", name: "מותאם אישית", category: "custom" as const, width: 300, height: 400, units: "mm" as Unit, dpi: 300, printIntent: "photo" as const }
];

const SHAPE_OPTIONS: Array<{ value: ClassPhotoFrameStyle["shape"]; label: string }> = [
  { value: "circle", label: "עיגול" },
  { value: "roundedRect", label: "מלבן מעוגל" },
  { value: "rect", label: "מלבן" },
  { value: "ellipse", label: "אליפסה" },
  { value: "star", label: "כוכב" },
  { value: "cloud", label: "ענן" }
];

type SpacingDensity = "compact" | "standard" | "relaxed";

const SPACING_DENSITY_OPTIONS: Array<{ value: SpacingDensity; label: string; hint: string; factor: number }> = [
  { value: "standard", label: "סטנדרטי", hint: "איזון בטוח לרוב הכיתות", factor: 1 },
  { value: "compact", label: "צפוף", hint: "יותר מקום לתמונות", factor: 0.62 },
  { value: "relaxed", label: "מרווח", hint: "אוויר בין השורות כשיש מספיק מקום", factor: 1.28 }
];

function spacingDensityFromLayout(base: ClassPhotoLayoutSettings, current?: ClassPhotoLayoutSettings): SpacingDensity {
  if (!current || base.horizontalSpacing <= 0) return "standard";
  const ratio = current.horizontalSpacing / base.horizontalSpacing;
  if (ratio < 0.82) return "compact";
  if (ratio > 1.14) return "relaxed";
  return "standard";
}

function applySpacingDensity(settings: ClassPhotoLayoutSettings, density: SpacingDensity): ClassPhotoLayoutSettings {
  const option = SPACING_DENSITY_OPTIONS.find((item) => item.value === density) ?? SPACING_DENSITY_OPTIONS[0];
  const factor = option.factor;
  return {
    ...settings,
    horizontalSpacing: Math.max(0, Math.round(settings.horizontalSpacing * factor)),
    verticalSpacing: Math.max(0, Math.round(settings.verticalSpacing * factor)),
    frameToNameSpacing: Math.max(0, Math.round(settings.frameToNameSpacing * Math.min(factor, 1))),
    staffToChildrenSpacing: Math.max(0, Math.round(settings.staffToChildrenSpacing * factor))
  };
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const STEP_LABELS: Record<WizardStep, string> = {
  1: "פרטי לקוח",
  2: "גודל דף",
  3: "כותרת ותחתית",
  4: "העלאת תמונות",
  5: "סקירת אנשים",
  6: "זיהוי פנים",
  7: "צורת מסגרת",
  8: "ריווח ופריסה",
  9: "רקע"
};

export interface ClassPhotoWizardInitialState {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  presetId?: string;
  orientation?: "portrait" | "landscape";
  titleText?: string;
  footerText?: string;
  titleFontFamily?: string;
  footerFontFamily?: string;
  childFrameStyle?: ClassPhotoFrameStyle;
  staffFrameStyle?: ClassPhotoFrameStyle;
  visualBalanceSettings?: ClassPhotoVisualBalanceSettings;
  /** Pre-loaded person records (back-to-wizard flow: real assetIds already imported) */
  personRecords?: ClassPhotoPersonRecord[];
  /** Thumbnail URLs for pre-loaded persons (index-matched to personRecords) */
  personThumbnailUrls?: string[];
  /** Pre-built layout settings (back-to-wizard flow) */
  layoutSettings?: ClassPhotoLayoutSettings;
  /** Back-to-wizard: skip image upload step since images are already imported */
  imagesAlreadyImported?: boolean;
}

function buildInitialPageSetup(
  presetId: string,
  orientation: "portrait" | "landscape"
): PageSetup {
  const preset = CLASS_PHOTO_PRESETS.find((p) => p.id === presetId && p.id !== "custom");
  const base = pageSetupFromPreset(getPagePreset(preset?.id ?? "a4"));
  const isPortrait = orientation === "portrait";
  const w = isPortrait ? Math.min(base.size.width, base.size.height) : Math.max(base.size.width, base.size.height);
  const h = isPortrait ? Math.max(base.size.width, base.size.height) : Math.min(base.size.width, base.size.height);
  return { ...base, size: { width: w, height: h }, orientation };
}

interface ClassPhotoSetupWizardProps {
  onComplete: (result: ClassPhotoWizardResult) => void;
  onCancel: () => void;
  initialState?: ClassPhotoWizardInitialState;
}

export function ClassPhotoSetupWizard({ onComplete, onCancel, initialState }: ClassPhotoSetupWizardProps): ReactElement {
  const [step, setStep] = useState<WizardStep>(1);
  const [dragging, setDragging] = useState(false);
  const [fontRevision, setFontRevision] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  // ─── Step 1 — customer ────────────────────────────────────────────────────
  const [customerName, setCustomerName] = useState(initialState?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(initialState?.customerPhone ?? "");
  const [customerEmail, setCustomerEmail] = useState(initialState?.customerEmail ?? "");

  // ─── Step 2 — page ───────────────────────────────────────────────────────
  const [presetId, setPresetId] = useState(initialState?.presetId ?? "a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(initialState?.orientation ?? "portrait");
  const [customW, setCustomW] = useState("30");
  const [customH, setCustomH] = useState("40");
  const [customUnit, setCustomUnit] = useState<Unit>("cm");
  const [customDpi, setCustomDpi] = useState(300);

  // ─── Step 3 — text & fonts ───────────────────────────────────────────────
  const [titleText, setTitleText] = useState(initialState?.titleText ?? "");
  const [footerText, setFooterText] = useState(initialState?.footerText ?? "");
  const [titleFontFamily, setTitleFontFamily] = useState(initialState?.titleFontFamily ?? "Heebo");
  const [footerFontFamily, setFooterFontFamily] = useState(initialState?.footerFontFamily ?? "Assistant");
  const wizardFonts = useMemo(() => {
    const allFonts = getAllFonts();
    return allFonts.filter((f) => f.lang === "he" || f.lang === "both").concat(
      allFonts.filter((f) => f.lang === "la")
    );
  }, [fontRevision]);
  const [titlePresetId, setTitlePresetId] = useState<string | undefined>();
  const [footerPresetId, setFooterPresetId] = useState<string | undefined>();

  // ─── Step 4 — images ────────────────────────────────────────────────────
  // In back-to-wizard flow, images are empty (already imported) but personRecords is pre-filled
  const [images, setImages] = useState<ClassPhotoWizardImageEntry[]>([]);
  const [personRecords, setPersonRecords] = useState<ClassPhotoPersonRecord[]>(
    initialState?.personRecords ?? []
  );
  const imagesAlreadyImported = initialState?.imagesAlreadyImported ?? false;
  const personThumbnailUrls = initialState?.personThumbnailUrls ?? [];

  // ─── Step 6 — face detection ────────────────────────────────────────────
  // Skip face detection in back-to-wizard flow (faceData already stored in records)
  const [useFaceDetection, setUseFaceDetection] = useState(!imagesAlreadyImported);
  const [faceDetectProgress, setFaceDetectProgress] = useState<{ done: number; total: number } | null>(null);

  // ─── Step 7 — frame style ────────────────────────────────────────────────
  const [childFrameStyle, setChildFrameStyle] = useState<ClassPhotoFrameStyle>(
    initialState?.childFrameStyle ?? defaultChildFrameStyle()
  );
  const [staffFrameStyle, setStaffFrameStyle] = useState<ClassPhotoFrameStyle>(
    initialState?.staffFrameStyle ?? defaultStaffFrameStyle()
  );

  // ─── Step 8 — spacing ────────────────────────────────────────────────────
  const [visualBalance, setVisualBalance] = useState<ClassPhotoVisualBalanceSettings>(
    initialState?.visualBalanceSettings ?? defaultVisualBalanceSettings()
  );
  const preLS = initialState?.layoutSettings;
  const initialPageSetupForDensity = buildInitialPageSetup(
    initialState?.presetId ?? "a4",
    initialState?.orientation ?? "portrait"
  );
  const initialDensityBase = defaultLayoutSettings(
    initialPageSetupForDensity.size.width,
    initialPageSetupForDensity.size.height,
    Math.max(1, (initialState?.personRecords ?? []).filter((r) => r.role === "child").length),
    Math.max(0, (initialState?.personRecords ?? []).filter((r) => r.role === "staff").length)
  );
  const [spacingDensity, setSpacingDensity] = useState<SpacingDensity>(
    spacingDensityFromLayout(initialDensityBase, preLS)
  );

  // ─── Step 9 — background ────────────────────────────────────────────────
  const [backgroundFile, setBackgroundFile] = useState<File | undefined>();
  const [backgroundUrl, setBackgroundUrl] = useState<string | undefined>();

  const imagesRef = useRef(images);
  imagesRef.current = images;
  const backgroundUrlRef = useRef(backgroundUrl);
  backgroundUrlRef.current = backgroundUrl;
  useEffect(() => () => {
    for (const entry of imagesRef.current) {
      try { URL.revokeObjectURL(entry.url); } catch { /* ignore */ }
    }
    if (backgroundUrlRef.current !== undefined && backgroundUrlRef.current.length > 0) {
      try { URL.revokeObjectURL(backgroundUrlRef.current); } catch { /* ignore */ }
    }
  }, []);

  // ─── Page setup ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    void loadSystemFonts().then(() => {
      if (!cancelled) setFontRevision((revision) => revision + 1);
    });
    return () => { cancelled = true; };
  }, []);

  function buildPageSetup(): PageSetup {
    const preset = CLASS_PHOTO_PRESETS.find((p) => p.id === presetId);
    if (preset && preset.id !== "custom") {
      const fullPreset = getPagePreset(preset.id);
      const base = pageSetupFromPreset(fullPreset);
      const isPortrait = orientation === "portrait";
      const w = isPortrait ? Math.min(base.size.width, base.size.height) : Math.max(base.size.width, base.size.height);
      const h = isPortrait ? Math.max(base.size.width, base.size.height) : Math.min(base.size.width, base.size.height);
      return { ...base, size: { width: w, height: h }, orientation };
    }
    const wPx = Math.round(unitToPx(parseFloat(customW) || 30, customUnit, customDpi));
    const hPx = Math.round(unitToPx(parseFloat(customH) || 40, customUnit, customDpi));
    const isPortrait = orientation === "portrait";
    const finalW = isPortrait ? Math.min(wPx, hPx) : Math.max(wPx, hPx);
    const finalH = isPortrait ? Math.max(wPx, hPx) : Math.min(wPx, hPx);
    const defaultMargins = { top: 0, right: 0, bottom: 0, left: 0 };
    return {
      version: 1,
      units: customUnit,
      dpi: customDpi,
      orientation,
      size: { width: finalW, height: finalH },
      bleed: defaultMargins,
      margins: defaultMargins,
      safeArea: defaultMargins,
      printIntent: "photo",
      snapSettings: { version: 1, enabled: true, snapToGrid: false, snapToGuides: true, snapToLayers: true, snapToPage: true, snapTolerance: 8, showSmartGuides: true },
      gridSettings: { version: 1, enabled: false, spacingX: 60, spacingY: 60, snapToGrid: false }
    };
  }

  function buildLayoutSettings(pageSetup: PageSetup): ClassPhotoLayoutSettings {
    const childCount = personRecords.filter((r) => r.role === "child").length;
    const staffCount = personRecords.filter((r) => r.role === "staff").length;
    const ls = defaultLayoutSettings(pageSetup.size.width, pageSetup.size.height, childCount, staffCount);
    return optimizeLayoutSettings(pageSetup, applySpacingDensity(ls, spacingDensity));
  }

  function optimizeLayoutSettings(pageSetup: PageSetup, settings: ClassPhotoLayoutSettings): ClassPhotoLayoutSettings {
    const childFrameSize = settings.childFrameSize.width;
    const staffFrameSize = settings.staffFrameSize.width;
    const plan = computeOptimalClassPhotoLayout(pageSetup.size.width, pageSetup.size.height, {
      version: 1,
      id: "preview-class-photo-rule",
      pageId: "preview-page",
      personRecords,
      childFrameStyle,
      staffFrameStyle,
      childNameTextStyle: defaultChildNameTextStyle(childFrameSize),
      staffNameTextStyle: defaultStaffNameTextStyle(staffFrameSize),
      titleTextStyle: defaultTitleTextStyle(pageSetup.size.width, titleFontFamily),
      footerTextStyle: defaultFooterTextStyle(pageSetup.size.width, footerFontFamily),
      layoutSettings: settings,
      visualBalanceSettings: visualBalance,
      titleText,
      footerText,
      titleTextEffects: [],
      footerTextEffects: [],
      metadata: {}
    });
    if (!plan) return settings;
    return {
      ...settings,
      childFrameSize: { width: plan.childFrameSize, height: plan.childFrameSize },
      staffFrameSize: { width: plan.staffFrameSize, height: plan.staffFrameSize }
    };
  }

  // ─── Image upload ────────────────────────────────────────────────────────

  async function addFiles(files: FileList | File[]): Promise<void> {
    const { files: normalizedFiles, failed } = await normalizeIncomingImages(Array.from(files).filter(isImageDropFile));
    if (failed.length > 0) window.alert(HEIC_CONVERSION_ERROR_MESSAGE);
    const todo = normalizedFiles.filter(isImageDropFile);
    if (todo.length === 0) return;
    let pending = todo.length;
    const toAddImages: ClassPhotoWizardImageEntry[] = [];
    const toAddRecords: ClassPhotoPersonRecord[] = [];
    for (const file of todo) {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const entry: ClassPhotoWizardImageEntry = { file, url, width: img.naturalWidth, height: img.naturalHeight };
        toAddImages.push(entry);
        toAddRecords.push(createClassPhotoPersonRecord(
          "PLACEHOLDER_" + crypto.randomUUID(),
          file.name,
          "child",
          0 // will be recalculated on setState
        ));
        pending--;
        if (pending === 0) {
          setImages((prev) => [...prev, ...toAddImages]);
          setPersonRecords((prev) => {
            const base = prev.length;
            return [...prev, ...toAddRecords.map((r, i) => ({ ...r, orderIndex: base + i }))];
          });
        }
      };
      img.onerror = () => { pending--; };
      img.src = url;
    }
  }

  function removeImage(idx: number): void {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setPersonRecords((prev) => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, orderIndex: i })));
  }

  async function handleBgChange(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    let normalizedFile: File;
    try {
      normalizedFile = await normalizeIncomingImage(file);
    } catch {
      window.alert(HEIC_CONVERSION_ERROR_MESSAGE);
      e.target.value = "";
      return;
    }
    setBackgroundFile(normalizedFile);
    setBackgroundUrl((prev) => {
      if (prev !== undefined && prev.length > 0) {
        try { URL.revokeObjectURL(prev); } catch { /* ignore */ }
      }
      return URL.createObjectURL(normalizedFile);
    });
    e.target.value = "";
  }

  // ─── Face detection ───────────────────────────────────────────────────────

  async function runFaceDetection(): Promise<void> {
    if (!useFaceDetection || personRecords.length === 0) return;
    const { detectFacesForRecords } = await import("@/core/classPhoto/classPhotoFaceDetect");
    const urlMap = new Map<string, string>();
    images.forEach((img, i) => {
      const rec = personRecords[i];
      if (rec) urlMap.set(rec.id, img.url);
    });
    setFaceDetectProgress({ done: 0, total: personRecords.length });
    const faceMap = await detectFacesForRecords(
      personRecords.map((r) => ({ id: r.id, assetId: r.id, displayName: r.displayName })),
      (id) => urlMap.get(id),
      (prog) => setFaceDetectProgress({ done: prog.done, total: prog.total })
    );
    setPersonRecords((prev) =>
      prev.map((r) => {
        const face = faceMap.get(r.id);
        return face ? { ...r, faceData: face } : r;
      })
    );
    setFaceDetectProgress(null);
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  async function goNext(): Promise<void> {
    if (step === 6 && useFaceDetection) {
      await runFaceDetection();
    }
    if (step < 9) setStep((s) => (s + 1) as WizardStep);
  }

  function goPrev(): void {
    if (step > 1) setStep((s) => (s - 1) as WizardStep);
  }

  function handleComplete(): void {
    const pageSetup = buildPageSetup();
    const layoutSettings = buildLayoutSettings(pageSetup);
    const customerInfo: Partial<ProjectCustomerInfo> = {
      customerName,
      customerPhone,
      customerEmail,
      phoneNumber: customerPhone,
      email: customerEmail
    };
    onComplete({
      images,
      personRecords,
      backgroundFile,
      pageSetup,
      titleText,
      footerText,
      titleFontFamily,
      footerFontFamily,
      titlePresetId,
      footerPresetId,
      childFrameStyle,
      staffFrameStyle,
      layoutSettings,
      visualBalanceSettings: visualBalance,
      customerInfo
    });
  }

  const canGoNext =
    step === 1 || step === 2 || step === 3 ||
    (step === 4 && (images.length > 0 || imagesAlreadyImported)) ||
    (step === 5 && personRecords.length > 0) ||
    step >= 6;

  // ─── Spacing preview values ────────────────────────────────────────────────

  // Compute auto-layout settings preview for step 8 sliders
  const previewPageSetup = buildPageSetup();
  const autoLSBase = defaultLayoutSettings(
    previewPageSetup.size.width,
    previewPageSetup.size.height,
    Math.max(1, personRecords.filter((r) => r.role === "child").length),
    Math.max(0, personRecords.filter((r) => r.role === "staff").length)
  );
  const autoLS = optimizeLayoutSettings(previewPageSetup, applySpacingDensity(autoLSBase, spacingDensity));

  return (
    <div className="cp-wizard-overlay">
      <GlobalWizardDropTarget
        acceptFile={isImageDropFile}
        onFiles={(files) => void addFiles(files)}
      />
      <div className="cp-wizard">
        {/* Header */}
        <div className="cp-wizard-header">
          <button className="cp-wizard-close" onClick={onCancel} type="button">
            <X size={18} />
          </button>
          <h2>אשף תמונת מחזור</h2>
          <div className="cp-wizard-steps">
            {([1, 2, 3, 4, 5, 6, 7, 8, 9] as WizardStep[]).map((s) => (
              <div
                className={`cp-step-dot${step === s ? " active" : ""}${step > s ? " done" : ""}`}
                key={s}
                title={STEP_LABELS[s]}
              >
                {step > s ? <Check size={10} /> : s}
              </div>
            ))}
          </div>
          <div className="cp-wizard-step-label">{STEP_LABELS[step]}</div>
        </div>

        {/* Body */}
        <div className="cp-wizard-body">
          {step === 1 && (
            <div className="cp-step-form">
              <h3>פרטי לקוח / כיתה</h3>
              <p className="cp-step-desc">שם הכיתה ישמש כותרת ברירת מחדל.</p>
              <label className="cp-field">
                <span>שם כיתה / לקוח</span>
                <input dir="rtl" onChange={(e) => setCustomerName(e.target.value)} placeholder='למשל: כיתה א׳1 — בית ספר "השקמה"' type="text" value={customerName} />
              </label>
              <label className="cp-field">
                <span>טלפון</span>
                <input dir="ltr" onChange={(e) => setCustomerPhone(e.target.value)} placeholder="050-0000000" type="tel" value={customerPhone} />
              </label>
              <label className="cp-field">
                <span>אימייל</span>
                <input dir="ltr" onChange={(e) => setCustomerEmail(e.target.value)} placeholder="school@example.com" type="email" value={customerEmail} />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="cp-step-form">
              <h3>גודל דף</h3>
              <div className="cp-preset-grid">
                {CLASS_PHOTO_PRESETS.map((p) => (
                  <button className={`cp-preset-btn${presetId === p.id ? " active" : ""}`} key={p.id} onClick={() => setPresetId(p.id)} type="button">
                    {p.name}
                  </button>
                ))}
              </div>
              {presetId === "custom" && (
                <div className="cp-custom-size">
                  <label className="cp-field"><span>רוחב</span><input dir="ltr" min="1" onChange={(e) => setCustomW(e.target.value)} type="number" value={customW} /></label>
                  <label className="cp-field"><span>גובה</span><input dir="ltr" min="1" onChange={(e) => setCustomH(e.target.value)} type="number" value={customH} /></label>
                  <label className="cp-field"><span>יחידה</span>
                    <select onChange={(e) => setCustomUnit(e.target.value as Unit)} value={customUnit}>
                      <option value="mm">מ"מ</option><option value="cm">ס"מ</option><option value="inch">אינץ׳</option><option value="px">פיקסל</option>
                    </select>
                  </label>
                  <label className="cp-field"><span>DPI</span>
                    <select onChange={(e) => setCustomDpi(Number(e.target.value))} value={customDpi}>
                      <option value={72}>72</option><option value={150}>150</option><option value={300}>300</option><option value={600}>600</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="cp-orientation-row">
                <button className={`cp-orient-btn${orientation === "portrait" ? " active" : ""}`} onClick={() => setOrientation("portrait")} type="button">
                  <div className="cp-orient-icon portrait" />לאורך
                </button>
                <button className={`cp-orient-btn${orientation === "landscape" ? " active" : ""}`} onClick={() => setOrientation("landscape")} type="button">
                  <div className="cp-orient-icon landscape" />לרוחב
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="cp-step-form">
              <h3>כותרת ותחתית</h3>
              <p className="cp-step-desc">ניתן לערוך גם לאחר יצירת הפריסה.</p>

              {/* ── Title ── */}
              <label className="cp-field">
                <span>כותרת ראשית</span>
                <input dir="rtl" onChange={(e) => setTitleText(e.target.value)} placeholder={`תמונת כיתה${customerName ? ` — ${customerName}` : ""}`} type="text" value={titleText} />
              </label>
              <label className="cp-field">
                <span>גופן כותרת</span>
                <select onChange={(e) => setTitleFontFamily(e.target.value)} style={{ fontFamily: `"${titleFontFamily}", sans-serif` }} value={titleFontFamily}>
                  {wizardFonts.map((f) => (
                    <option key={f.family} style={{ fontFamily: `"${f.family}", sans-serif` }} value={f.family}>{f.label}</option>
                  ))}
                </select>
              </label>

              {/* ── Title preset ── */}
              <div className="cp-field">
                <span>עיצוב כותרת</span>
                <TextPresetPicker
                  selectedId={titlePresetId}
                  previewText={titleText || `תמונת כיתה${customerName ? ` — ${customerName}` : ""}`}
                  fontFamily={titleFontFamily}
                  onSelect={(id) => setTitlePresetId(id === titlePresetId ? undefined : id)}
                />
              </div>

              {/* ── Footer ── */}
              <label className="cp-field" style={{ marginTop: 6 }}>
                <span>כותרת תחתית</span>
                <input dir="rtl" onChange={(e) => setFooterText(e.target.value)} placeholder='למשל: בית ספר "השקמה" — שנה"ל תשפ"ה' type="text" value={footerText} />
              </label>
              <label className="cp-field">
                <span>גופן תחתית</span>
                <select onChange={(e) => setFooterFontFamily(e.target.value)} style={{ fontFamily: `"${footerFontFamily}", sans-serif` }} value={footerFontFamily}>
                  {wizardFonts.map((f) => (
                    <option key={f.family} style={{ fontFamily: `"${f.family}", sans-serif` }} value={f.family}>{f.label}</option>
                  ))}
                </select>
              </label>

              {/* ── Footer preset ── */}
              <div className="cp-field">
                <span>עיצוב תחתית</span>
                <TextPresetPicker
                  selectedId={footerPresetId}
                  previewText={footerText || "בית ספר"}
                  fontFamily={footerFontFamily}
                  onSelect={(id) => setFooterPresetId(id === footerPresetId ? undefined : id)}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="cp-step-upload">
              <h3>תמונות</h3>
              {imagesAlreadyImported ? (
                <>
                  <p className="cp-step-desc">
                    <strong>{personRecords.length} אנשים</strong> כבר יובאו בפרויקט זה. ניתן להוסיף תמונות נוספות.
                  </p>
                  <div className="cp-thumb-grid">
                    {personRecords.map((rec, i) => {
                      const thumbUrl = personThumbnailUrls[i];
                      return (
                        <div className="cp-thumb" key={rec.id} title={rec.displayName}>
                          {thumbUrl ? <img alt={rec.displayName} src={thumbUrl} /> : <UserRound size={22} />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="cp-upload-count">{personRecords.length} אנשים בפרויקט</div>
                  <div
                    className={`cp-drop-zone${dragging ? " dragging" : ""}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragLeave={() => setDragging(false)}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
                    style={{ padding: "16px 20px" }}
                  >
                    <UserRound size={24} strokeWidth={1.4} />
                    <span style={{ fontSize: "0.85rem" }}>הוסף תמונות נוספות</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="cp-step-desc">גרור תמונות לכאן. השם יחולץ אוטומטית משם הקובץ.</p>
                  <div
                    className={`cp-drop-zone${dragging ? " dragging" : ""}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragLeave={() => setDragging(false)}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
                  >
                    <UserRound size={36} strokeWidth={1.2} />
                    <span>גרור תמונות לכאן או לחץ לבחירה</span>
                    <span className="cp-drop-sub">PNG, JPG, WEBP</span>
                  </div>
                  {images.length > 0 && (
                    <div className="cp-thumb-grid">
                      {images.map((img, i) => (
                        <div className="cp-thumb" key={img.url}>
                          <img alt="" src={img.url} />
                          <button className="cp-thumb-remove" onClick={() => removeImage(i)} type="button"><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="cp-upload-count">{images.length} תמונות</div>
                </>
              )}
              <input accept={SUPPORTED_IMAGE_ACCEPT} hidden multiple onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} ref={fileInputRef} type="file" />
            </div>
          )}

          {step === 5 && (
            <div className="cp-step-review">
              <h3>סקירת רשימת אנשים</h3>
              <p className="cp-step-desc">ערוך שמות, שנה תפקיד (תלמיד / צוות), או הסר אנשים.</p>
              <div className="cp-person-list">
                {personRecords.map((rec, i) => {
                  const img = images[i];
                  // In back-to-wizard flow, use personThumbnailUrls instead of new images
                  const thumbUrl = img?.url ?? personThumbnailUrls[i];
                  return (
                    <div className="cp-person-row" key={rec.id}>
                      <div className="cp-person-thumb">
                        {thumbUrl ? <img alt="" src={thumbUrl} /> : <UserRound size={22} />}
                      </div>
                      <input
                        className="cp-person-name"
                        dir="rtl"
                        onChange={(e) => setPersonRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, displayName: e.target.value } : r))}
                        type="text"
                        value={rec.displayName}
                      />
                      <select
                        className="cp-person-role"
                        onChange={(e) => setPersonRecords((prev) => prev.map((r) => r.id === rec.id ? { ...r, role: e.target.value as "child" | "staff" } : r))}
                        value={rec.role}
                      >
                        <option value="child">תלמיד</option>
                        <option value="staff">צוות</option>
                      </select>
                      <button
                        className="cp-person-remove"
                        onClick={() => removeImage(i)}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="cp-step-form">
              <h3>זיהוי פנים / חיתוך חכם</h3>
              <p className="cp-step-desc">זיהוי אוטומטי של פנים למיקום מיטבי בתוך המסגרת.</p>
              <label className="cp-toggle-row">
                <input checked={useFaceDetection} onChange={(e) => setUseFaceDetection(e.target.checked)} type="checkbox" />
                <span>הפעל זיהוי פנים ({personRecords.length} תמונות)</span>
              </label>
              {!useFaceDetection && <p className="cp-step-hint">ללא זיהוי פנים, התמונות יחותכו למרכז.</p>}
              {faceDetectProgress !== null && (
                <div className="cp-face-progress">
                  <div className="cp-progress-bar">
                    <div className="cp-progress-fill" style={{ width: `${Math.round((faceDetectProgress.done / Math.max(faceDetectProgress.total, 1)) * 100)}%` }} />
                  </div>
                  <span>{faceDetectProgress.done} / {faceDetectProgress.total}</span>
                </div>
              )}
            </div>
          )}

          {step === 7 && (
            <div className="cp-step-form">
              <h3>סגנון מסגרת ואפקטים</h3>
              <FrameStyleEditor
                label="תלמידים"
                style={childFrameStyle}
                onChange={setChildFrameStyle}
              />
              <FrameStyleEditor
                label="צוות / מורים"
                style={staffFrameStyle}
                onChange={setStaffFrameStyle}
              />
            </div>
          )}

          {step === 8 && (
            <div className="cp-step-form">
              <h3>ריווח ופריסה</h3>
              <p className="cp-step-desc">
                גודל מסגרת אוטומטי: <strong>{autoLS.childFrameSize.width}px</strong> ({personRecords.filter(r=>r.role==="child").length} ילדים).
                הריווח מחושב אוטומטית לפי מספר הילדים וגודל הדף.
              </p>

              <div className="cp-shape-grid" role="radiogroup" aria-label="צפיפות פריסה">
                {SPACING_DENSITY_OPTIONS.map((option) => (
                  <button
                    className={`cp-shape-btn${spacingDensity === option.value ? " active" : ""}`}
                    key={option.value}
                    onClick={() => setSpacingDensity(option.value)}
                    title={option.hint}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <label className="cp-toggle-row">
                  <input checked={visualBalance.centerPartialRows} onChange={(e) => setVisualBalance({ ...visualBalance, centerPartialRows: e.target.checked })} type="checkbox" />
                  <span>מרכז שורות חלקיות</span>
                </label>
                <label className="cp-toggle-row">
                  <input checked={visualBalance.balanceLastRows} onChange={(e) => setVisualBalance({ ...visualBalance, balanceLastRows: e.target.checked })} type="checkbox" />
                  <span>איזון שורות</span>
                </label>
                <label className="cp-toggle-row">
                  <input checked={visualBalance.centerStaffRow} onChange={(e) => setVisualBalance({ ...visualBalance, centerStaffRow: e.target.checked })} type="checkbox" />
                  <span>מרכז שורת צוות</span>
                </label>
                <label className="cp-field">
                  <span>מיון</span>
                  <select onChange={(e) => setVisualBalance({ ...visualBalance, sortMode: e.target.value as ClassPhotoVisualBalanceSettings["sortMode"] })} value={visualBalance.sortMode}>
                    <option value="manualOrder">סדר העלאה</option>
                    <option value="alphabetical">א-ב לפי שם</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {step === 9 && (
            <div className="cp-step-form">
              <h3>רקע</h3>
              <p className="cp-step-desc">בחר תמונת רקע, או השאר ריק לרקע לבן.</p>
              {backgroundUrl ? (
                <div className="cp-bg-preview">
                  <img alt="רקע" src={backgroundUrl} />
                  <button className="btn btn-ghost cp-bg-clear" onClick={() => { setBackgroundFile(undefined); setBackgroundUrl(undefined); }} type="button">
                    <X size={14} /> הסר רקע
                  </button>
                </div>
              ) : (
                <button className="cp-drop-zone" onClick={() => bgInputRef.current?.click()} type="button">
                  <Image size={32} strokeWidth={1.2} />
                  <span>לחץ לבחירת תמונת רקע</span>
                </button>
              )}
              <input accept={SUPPORTED_IMAGE_ACCEPT} hidden onChange={(event) => void handleBgChange(event)} ref={bgInputRef} type="file" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="cp-wizard-footer">
          <button className="btn btn-ghost" disabled={step === 1} onClick={goPrev} type="button">
            <ArrowRight size={15} />הקודם
          </button>
          <div className="cp-wizard-footer-center">שלב {step} מתוך 9</div>
          {step < 9 ? (
            <button className="btn btn-primary" disabled={!canGoNext} onClick={() => void goNext()} type="button">
              הבא<ArrowLeft size={15} />
            </button>
          ) : (
            <button className="btn btn-accent" onClick={handleComplete} type="button">
              <Check size={15} />צור פריסה
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Frame style editor ───────────────────────────────────────────────────────

function FrameStyleEditor({ label, style, onChange }: {
  label: string;
  style: ClassPhotoFrameStyle;
  onChange: (s: ClassPhotoFrameStyle) => void;
}): ReactElement {
  const hasShadow = style.shadow !== undefined;
  const hasStroke = style.stroke !== undefined;
  const hasGlow = style.outerGlow !== undefined;

  function toggleShadow(): void {
    if (hasShadow) {
      const { shadow: _shadow, ...rest } = style;
      void _shadow;
      onChange(rest as ClassPhotoFrameStyle);
    } else {
      onChange({ ...style, shadow: { version: 1, color: "#000000", blur: 18, offsetX: 0, offsetY: 6, opacity: 0.28 } });
    }
  }

  function toggleStroke(): void {
    if (hasStroke) {
      const { stroke: _s, ...rest } = style;
      void _s;
      onChange(rest as ClassPhotoFrameStyle);
    } else {
      onChange({ ...style, stroke: { version: 1, color: "#ffffff", width: 4, opacity: 1 } });
    }
  }

  function toggleGlow(): void {
    if (hasGlow) {
      const { outerGlow: _g, ...rest } = style;
      void _g;
      onChange(rest as ClassPhotoFrameStyle);
    } else {
      onChange({ ...style, outerGlow: { version: 1, color: "#ffffff", blur: 20, offsetX: 0, offsetY: 0, opacity: 0.7 } });
    }
  }

  return (
    <div className="cp-frame-style-group">
      <div className="cp-frame-style-label">{label}</div>
      {/* Shape */}
      <div className="cp-shape-grid">
        {SHAPE_OPTIONS.map((opt) => (
          <button
            className={`cp-shape-btn${style.shape === opt.value ? " active" : ""}`}
            key={opt.value}
            onClick={() => onChange({ ...style, shape: opt.value })}
            type="button"
          >
            {opt.label}
          </button>
        ))}
      </div>
      {style.shape === "roundedRect" && (
        <label className="cp-field" style={{ marginTop: 6 }}>
          <span>רדיוס פינות</span>
          <input dir="ltr" max={80} min={0} onChange={(e) => onChange({ ...style, cornerRadius: Number(e.target.value) })} type="range" value={style.cornerRadius ?? 12} />
          <span>{style.cornerRadius ?? 12}px</span>
        </label>
      )}

      {/* Shadow */}
      <div className="cp-effect-row">
        <label className="cp-toggle-row">
          <input checked={hasShadow} onChange={toggleShadow} type="checkbox" />
          <span>צל</span>
        </label>
        {hasShadow && style.shadow && (
          <div className="cp-effect-params">
            <label className="cp-mini-field"><span>צבע</span><input type="color" value={style.shadow.color} onChange={(e) => onChange({ ...style, shadow: { ...style.shadow!, color: e.target.value } })} /></label>
            <label className="cp-mini-field"><span>טשטוש</span><input dir="ltr" type="range" min={0} max={60} value={style.shadow.blur} onChange={(e) => onChange({ ...style, shadow: { ...style.shadow!, blur: Number(e.target.value) } })} /></label>
            <label className="cp-mini-field"><span>X</span><input dir="ltr" type="range" min={-30} max={30} value={style.shadow.offsetX} onChange={(e) => onChange({ ...style, shadow: { ...style.shadow!, offsetX: Number(e.target.value) } })} /></label>
            <label className="cp-mini-field"><span>Y</span><input dir="ltr" type="range" min={-30} max={30} value={style.shadow.offsetY} onChange={(e) => onChange({ ...style, shadow: { ...style.shadow!, offsetY: Number(e.target.value) } })} /></label>
            <label className="cp-mini-field"><span>שקיפות</span><input dir="ltr" type="range" min={0} max={100} value={Math.round(style.shadow.opacity * 100)} onChange={(e) => onChange({ ...style, shadow: { ...style.shadow!, opacity: Number(e.target.value) / 100 } })} /></label>
          </div>
        )}
      </div>

      {/* Stroke */}
      <div className="cp-effect-row">
        <label className="cp-toggle-row">
          <input checked={hasStroke} onChange={toggleStroke} type="checkbox" />
          <span>מסגרת (Stroke)</span>
        </label>
        {hasStroke && style.stroke && (
          <div className="cp-effect-params">
            <label className="cp-mini-field"><span>צבע</span><input type="color" value={style.stroke.color} onChange={(e) => onChange({ ...style, stroke: { ...style.stroke!, color: e.target.value } })} /></label>
            <label className="cp-mini-field"><span>עובי</span><input dir="ltr" type="range" min={1} max={30} value={style.stroke.width} onChange={(e) => onChange({ ...style, stroke: { ...style.stroke!, width: Number(e.target.value) } })} /></label>
            <label className="cp-mini-field"><span>שקיפות</span><input dir="ltr" type="range" min={0} max={100} value={Math.round(style.stroke.opacity * 100)} onChange={(e) => onChange({ ...style, stroke: { ...style.stroke!, opacity: Number(e.target.value) / 100 } })} /></label>
          </div>
        )}
      </div>

      {/* Outer glow */}
      <div className="cp-effect-row">
        <label className="cp-toggle-row">
          <input checked={hasGlow} onChange={toggleGlow} type="checkbox" />
          <span>זוהר חיצוני</span>
        </label>
        {hasGlow && style.outerGlow && (
          <div className="cp-effect-params">
            <label className="cp-mini-field"><span>צבע</span><input type="color" value={style.outerGlow.color} onChange={(e) => onChange({ ...style, outerGlow: { ...style.outerGlow!, color: e.target.value } })} /></label>
            <label className="cp-mini-field"><span>טשטוש</span><input dir="ltr" type="range" min={0} max={80} value={style.outerGlow.blur} onChange={(e) => onChange({ ...style, outerGlow: { ...style.outerGlow!, blur: Number(e.target.value) } })} /></label>
            <label className="cp-mini-field"><span>עוצמה</span><input dir="ltr" type="range" min={0} max={100} value={Math.round(style.outerGlow.opacity * 100)} onChange={(e) => onChange({ ...style, outerGlow: { ...style.outerGlow!, opacity: Number(e.target.value) / 100 } })} /></label>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Text preset picker ───────────────────────────────────────────────────────

function getPresetStyle(preset: import("@/types/text").TextPreset): React.CSSProperties {
  const s = preset.style as Record<string, unknown> | undefined;
  if (!s) return {};
  const fill = s["color"] as string | undefined;
  const grad = s["gradient"] as { stops?: Array<{ color: string }> } | undefined;
  if (grad?.stops && grad.stops.length >= 2) {
    const colors = grad.stops.map((st) => st.color);
    return {
      background: `linear-gradient(90deg, ${colors.join(", ")})`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text"
    };
  }
  return { color: fill ?? "#fff" };
}

function TextPresetPicker({ selectedId, previewText, fontFamily, onSelect }: {
  selectedId: string | undefined;
  previewText: string;
  fontFamily: string;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <div className="cp-preset-chips">
      <button
        className={`cp-preset-chip${!selectedId ? " active" : ""}`}
        onClick={() => selectedId && onSelect(selectedId)}
        type="button"
        style={{ color: "#ccc", fontFamily: `"${fontFamily}", sans-serif` }}
      >
        ללא עיצוב
      </button>
      {BUILTIN_TEXT_PRESETS.map((preset) => {
        const previewStyle = getPresetStyle(preset);
        return (
          <button
            className={`cp-preset-chip${selectedId === preset.presetId ? " active" : ""}`}
            key={preset.presetId}
            onClick={() => onSelect(preset.presetId)}
            type="button"
            style={{ fontFamily: `"${fontFamily}", sans-serif`, ...previewStyle }}
            title={preset.name}
          >
            {preset.name}
          </button>
        );
      })}
    </div>
  );
}

// ─── Slider with auto-reset ───────────────────────────────────────────────────

function SliderWithReset({ label, value, min, max, autoValue, isOverridden, onChange, onReset, unit }: {
  label: string;
  value: number;
  min: number;
  max: number;
  autoValue: number;
  isOverridden: boolean;
  onChange: (v: number) => void;
  onReset: () => void;
  unit: string;
}): ReactElement {
  return (
    <div className="cp-slider-row">
      <div className="cp-slider-header">
        <span className="cp-slider-label">{label}</span>
        <span className="cp-slider-value">{value}{unit}</span>
        {isOverridden ? (
          <button className="cp-slider-reset" onClick={onReset} title="איפוס לאוטו" type="button">אוטו</button>
        ) : (
          <span className="cp-slider-auto-tag">אוטו</span>
        )}
      </div>
      <input
        dir="ltr"
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        step={Math.max(1, Math.round(max / 100))}
        type="range"
        value={value}
      />
    </div>
  );
}

// runPreflight() — makes hidden driver behavior visible before printing.
//
// Compares the authoritative PrintLayout and profile against live driver state and
// produces human-readable warnings. A "blocker" must prevent printing (e.g. preview/job
// would disagree, or the saved driver settings are no longer valid).
//
// Pure functions only — unit-testable.

import type {
  AdvancedPrinterProfile,
  DriverState,
  OutputPreset,
  PreflightReport,
  PreflightWarning,
  PrintLayout
} from "@/types/advancedPrint";

const MM_PER_INCH = 25.4;

/** Effective DPI of the rendered pixels at the final physical print width. */
export function effectiveDpi(layout: PrintLayout): number {
  const widthInch = layout.printSizeMm.widthMm / MM_PER_INCH;
  if (widthInch <= 0) return 0;
  return layout.renderedPx.width / widthInch;
}

/** Detects whether the saved DEVMODE is stale relative to current driver state. */
function devmodeIsStale(profile: AdvancedPrinterProfile, driver: DriverState): boolean {
  const dm = profile.devmode;
  if (!dm.base64) return false; // nothing saved → nothing to be stale
  if (!driver.printerExists) return true;
  if (driver.devmodeApplied === false) return true;
  if (dm.driverName && driver.currentDriverName && dm.driverName !== driver.currentDriverName) return true;
  if (dm.driverVersion && driver.currentDriverVersion && dm.driverVersion !== driver.currentDriverVersion) return true;
  return false;
}

export interface PreflightInput {
  layout: PrintLayout;
  profile: AdvancedPrinterProfile;
  driver: DriverState;
  /** The effective output preset, if any (used for the color-mode conflict check). */
  outputPreset?: OutputPreset;
  /** Minimum acceptable effective DPI before a warning/blocker (default 150). */
  minDpiWarn?: number;
}

/** Runs all preflight checks and returns a report. Messages are in Hebrew. */
export function runPreflight(input: PreflightInput): PreflightReport {
  const { layout, profile, driver } = input;
  const warnings: PreflightWarning[] = [];
  const minDpiWarn = input.minDpiWarn ?? 150;

  // 1. Printer missing (blocker).
  if (!driver.printerExists) {
    warnings.push({
      code: "printer-missing",
      severity: "blocker",
      message: `המדפסת "${profile.windowsPrinterName}" לא נמצאה במערכת.`,
      hint: "בדוק שהמדפסת מחוברת ומותקנת, או בחר מדפסת אחרת בפרופיל."
    });
  }

  // 2. DEVMODE staleness (blocker) — saved driver settings no longer valid.
  if (devmodeIsStale(profile, driver)) {
    warnings.push({
      code: "devmode-stale",
      severity: "blocker",
      message: "הגדרות הדרייבר ששמורות בפרופיל הזה כבר לא תקפות (המדפסת או הדרייבר השתנו).",
      hint: 'פתח מחדש "הגדרות מדפסת" כדי לשמור הגדרות עדכניות.'
    });
  }

  // 3. Orientation mismatch (warning) — forced orientation differs from the design.
  const renderedOrientation = layout.renderedPx.width >= layout.renderedPx.height ? "landscape" : "portrait";
  if (
    (profile.orientationPolicy === "force-portrait" || profile.orientationPolicy === "force-landscape") &&
    layout.resolvedOrientation !== renderedOrientation
  ) {
    warnings.push({
      code: "orientation-mismatch",
      severity: "warning",
      message: `העיצוב הוא ${renderedOrientation === "landscape" ? "לרוחב" : "לאורך"} אבל הפרופיל מאלץ ${layout.resolvedOrientation === "landscape" ? "רוחב" : "אורך"}.`,
      hint: "ההדפסה תסובב את העיצוב. ודא שזו הכוונה."
    });
  }

  // 4. Physical-size mismatch (warning) — print larger than the loaded paper.
  if (
    layout.printSizeMm.widthMm > layout.printerPaperMm.widthMm + 0.5 ||
    layout.printSizeMm.heightMm > layout.printerPaperMm.heightMm + 0.5
  ) {
    warnings.push({
      code: "physical-size-mismatch",
      severity: "warning",
      message: `מידת ההדפסה (${Math.round(layout.printSizeMm.widthMm)}×${Math.round(layout.printSizeMm.heightMm)} מ"מ) גדולה מהנייר (${Math.round(layout.printerPaperMm.widthMm)}×${Math.round(layout.printerPaperMm.heightMm)} מ"מ).`,
      hint: "בחר נייר גדול יותר או שנה את ההתאמה ל'התאמה לדף'."
    });
  }

  // 5. Borderless requested but not verified (warning).
  if (profile.borderless.status === "requested-not-verified") {
    warnings.push({
      code: "borderless-not-verified",
      severity: "warning",
      message: "הדפסה ללא שוליים התבקשה אך לא אומתה מול הדרייבר.",
      hint: "פתח הגדרות מדפסת והפעל מצב ללא שוליים, או הדפס דף בדיקה לאימות."
    });
  }

  // 6. Crop risk (warning) — design content will be clipped (and it's not intentional bleed).
  if (layout.cropRiskRectsMm.length > 0 && profile.borderless.status === "not-requested") {
    warnings.push({
      code: "crop-risk",
      severity: "warning",
      message: "חלק מהעיצוב חורג מאזור ההדפסה וייחתך.",
      hint: "שנה את ההתאמה, המיקום או השוליים כדי שכל התוכן ייכנס."
    });
  }

  // 7. DPI too low.
  const dpi = effectiveDpi(layout);
  if (dpi > 0 && dpi < minDpiWarn) {
    const blocker = dpi < 100;
    warnings.push({
      code: "dpi-too-low",
      severity: blocker ? "blocker" : "warning",
      message: `הרזולוציה האפקטיבית היא ${Math.round(dpi)} DPI במידת ההדפסה הזו.`,
      hint: "השתמש בתמונה ברזולוציה גבוהה יותר או הקטן את מידת ההדפסה."
    });
  }

  // 8. Missing bleed for a bleed-required (borderless) product.
  if (profile.borderless.status !== "not-requested" && profile.bleedMm <= 0) {
    warnings.push({
      code: "missing-bleed",
      severity: "warning",
      message: "הדפסה ללא שוליים ללא bleed עלולה להשאיר קצוות לבנים.",
      hint: 'הוסף bleed (לרוב 1.5–3 מ"מ) לפרופיל.'
    });
  }

  // 9. Tray/source unverified.
  if (!profile.traySource.verified) {
    warnings.push({
      code: "tray-unverified",
      severity: "info",
      message: `מקור הנייר (${profile.traySource.label}) לא אומת.`,
      hint: "הדפס דף בדיקה כדי לוודא שהמדפסת מושכת מהמגש הנכון."
    });
  }

  // 10. Double color correction — app applies ICC while the driver may also manage color.
  // Color ownership is profile-level (the preset is only a tonal layer on top).
  if (profile.color.mode === "app-manages-color") {
    warnings.push({
      code: "double-color-correction",
      severity: "warning",
      message: "SPP מנהלת צבע עם ICC. אם הדרייבר גם מתקן צבע, התוצאה תהיה מוגזמת.",
      hint: "כבה את תיקון הצבע בהגדרות הדרייבר (ICM/Color Management = off)."
    });
  }

  const hasBlocker = warnings.some((w) => w.severity === "blocker");
  return { warnings, hasBlocker, clean: warnings.length === 0 };
}

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Crosshair, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { isPhotoPrintSlotLayer } from "@/core/photoPrint/photoPrintModeEngine";
import { detectPassportImage } from "@/core/passport/passportDetectionService";
import { aggregatePassportValidations, autoCropPassportTransform, centerFaceTransform, fitHeadSizeTransform, validatePassportFrame } from "@/core/passport/passportValidationService";
import { resolvePassportRequirementForRule, resolvePassportSizeForRule, type PassportRequirement, type PassportSizeMm, type PassportStatus } from "@/core/passport/passportRequirements";
import { useDocumentStore } from "@/state/documentStore";
import { passportRuntimeKey, usePassportAssistantStore } from "@/state/passportAssistantStore";
import type { Asset, Document } from "@/types/document";
import type { ContentTransform, FrameLayer } from "@/types/layers";
import type { PhotoPrintImageAssignment, PhotoPrintRule } from "@/types/photoPrint";

interface PassportCheckPanelProps {
  document: Document;
  rule: PhotoPrintRule;
}

interface PassportTarget {
  pageId: string;
  frame: FrameLayer;
  asset: Asset;
  assignment: PhotoPrintImageAssignment | undefined;
  runtimeKey: string;
}

const STATUS_LABEL: Record<PassportStatus, string> = {
  ok: "תקין",
  review: "דורש בדיקה",
  notRecommended: "לא מומלץ"
};

export function PassportCheckPanel({ document, rule }: PassportCheckPanelProps): ReactElement | null {
  const requirement = resolvePassportRequirementForRule(rule);
  if (requirement === null) return null;
  return <PassportCheckPanelInner document={document} requirement={requirement} rule={rule} size={resolvePassportSizeForRule(rule, requirement)} />;
}

function PassportCheckPanelInner({ document, rule, requirement, size }: PassportCheckPanelProps & { requirement: PassportRequirement; size: PassportSizeMm }): ReactElement {
  const [recheckNonce, setRecheckNonce] = useState(0);
  const entries = usePassportAssistantStore((state) => state.entries);
  const setLoading = usePassportAssistantStore((state) => state.setLoading);
  const setResult = usePassportAssistantStore((state) => state.setResult);
  const setError = usePassportAssistantStore((state) => state.setError);
  const clearMissing = usePassportAssistantStore((state) => state.clearMissing);
  const applyDocumentChange = useDocumentStore((state) => state.applyDocumentChange);
  const showGuidelines = rule.showPassportGuidelines ?? true;

  const targets = useMemo(() => getPassportTargets(document, rule, requirement.id, `${size.width}x${size.height}`), [document, requirement.id, rule, size.height, size.width]);
  const targetKeys = useMemo(() => targets.map((target) => target.runtimeKey), [targets]);
  const targetEntries = targets.map((target) => entries[target.runtimeKey]);
  const validations = targetEntries.flatMap((entry) => entry?.validation === null || entry?.validation === undefined ? [] : [entry.validation]);
  const loading = targetEntries.some((entry) => entry?.loading === true);
  const overallStatus = validations.length === 0 ? "review" : aggregatePassportValidations(validations);
  const issueCounts = countIssues(validations);

  useEffect(() => {
    clearMissing(targetKeys);
  }, [clearMissing, targetKeys]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      for (const target of targets) {
        setLoading(target.runtimeKey);
        void detectPassportImage(target.asset).then((detection) => {
          const validation = validatePassportFrame({ frame: target.frame, asset: target.asset, detection, requirement, size });
          setResult(target.runtimeKey, detection, validation);
        }).catch((error) => {
          setError(target.runtimeKey, error instanceof Error ? error.message : String(error));
        });
      }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [recheckNonce, requirement, setError, setLoading, setResult, size, targets]);

  function setGuidelines(next: boolean): void {
    applyDocumentChange("SetPassportGuidelinesCommand", (doc) => ({
      ...doc,
      photoPrintRules: doc.photoPrintRules.map((item) => item.id === rule.id ? { ...item, showPassportGuidelines: next } : item),
      photoPrintImageAssignments: doc.photoPrintImageAssignments.map((assignment) => assignment.photoPrintId === rule.id
        ? {
            ...assignment,
            passportState: {
              version: 1,
              ...(assignment.passportState ?? {}),
              selectedPassportPreset: rule.passportPresetId,
              selectedPassportSize: size,
              showPassportGuidelines: next
            }
          }
        : assignment)
    }));
  }

  function applyAutoAction(action: "center" | "fitHead" | "autoCrop" | "reset"): void {
    const transformByFrame = new Map<string, ContentTransform>();
    for (const target of targets) {
      const entry = entries[target.runtimeKey];
      const detection = entry?.detection;
      const face = entry?.validation?.detectedFace;
      if (action === "reset") {
        const previous = target.assignment?.passportState?.manualAdjustmentState;
        if (previous !== undefined) transformByFrame.set(target.frame.id, previous);
        continue;
      }
      if (detection === undefined || detection === null || face === undefined) continue;
      if (action === "center") {
        transformByFrame.set(target.frame.id, centerFaceTransform({ frame: target.frame, face, imageWidth: detection.imageWidth, imageHeight: detection.imageHeight }));
      } else if (action === "fitHead") {
        transformByFrame.set(target.frame.id, fitHeadSizeTransform({ frame: target.frame, face, imageWidth: detection.imageWidth, imageHeight: detection.imageHeight, requirement, size }));
      } else {
        transformByFrame.set(target.frame.id, autoCropPassportTransform({ frame: target.frame, face, imageWidth: detection.imageWidth, imageHeight: detection.imageHeight, requirement, size }));
      }
    }
    if (transformByFrame.size === 0) return;
    applyDocumentChange(`Passport${action}Command`, (doc) => applyPassportTransforms(doc, rule.id, transformByFrame, action === "reset", size, rule.passportPresetId));
    setRecheckNonce((value) => value + 1);
  }

  const sampleIssues = validations.flatMap((validation) => validation.issues).slice(0, 8);

  return (
    <section className="passport-check-panel">
      <div className="passport-check-header">
        <div>
          <div className="passport-check-title">בדיקת פספורט</div>
          <div className="passport-check-subtitle">Passport Check</div>
        </div>
        <span className={`passport-status passport-status-${overallStatus}`}>{STATUS_LABEL[overallStatus]}</span>
      </div>

      <div className="passport-info-grid">
        <span>סוג מסמך</span><strong>{requirement.label}</strong>
        <span>גודל רשמי</span><strong>{Math.round(size.width)}x{Math.round(size.height)} mm</strong>
        <span>תאים נבדקים</span><strong>{targets.length}</strong>
      </div>

      {loading ? <div className="passport-loading">בודק תמונה…</div> : null}

      <div className="passport-checklist">
        {validations.length === 0 ? (
          <div className="passport-checkitem review"><span>⚠</span><p>עדיין אין תוצאות בדיקה</p></div>
        ) : sampleIssues.length === 0 ? (
          <div className="passport-checkitem ok"><span>✓</span><p>כל הבדיקות הבסיסיות נראות תקינות</p></div>
        ) : sampleIssues.map((issue, index) => (
          <div className={`passport-checkitem ${issue.status}`} key={`${issue.id}-${index}`}>
            <span>{issue.status === "notRecommended" ? "✕" : "⚠"}</span>
            <p>{issue.message}</p>
          </div>
        ))}
      </div>

      <div className="passport-issue-summary">
        <span>תקין: {issueCounts.ok}</span>
        <span>בדיקה: {issueCounts.review}</span>
        <span>לא מומלץ: {issueCounts.notRecommended}</span>
      </div>

      <button className="passport-wide-button" type="button" onClick={() => setGuidelines(!showGuidelines)}>
        {showGuidelines ? "הסתר קווי עזר" : "הצג קווי עזר"}
      </button>
      <button className="passport-wide-button" type="button" onClick={() => setRecheckNonce((value) => value + 1)}>
        <RefreshCw size={14} /> Recheck
      </button>

      <div className="passport-actions">
        <button type="button" onClick={() => applyAutoAction("center")}><Crosshair size={14} /> יישור פנים</button>
        <button type="button" onClick={() => applyAutoAction("fitHead")}><Sparkles size={14} /> התאמת גודל ראש</button>
        <button type="button" onClick={() => applyAutoAction("autoCrop")}><Sparkles size={14} /> חיתוך אוטומטי</button>
        <button type="button" onClick={() => applyAutoAction("reset")}><RotateCcw size={14} /> איפוס התאמות</button>
        <button type="button" disabled title="מוכן לחיבור מנוע ניקוי רקע עתידי">ניקוי רקע</button>
      </div>

      <p className="passport-note">הבדיקה היא כלי עזר בלבד ואינה מבטיחה אישור רשמי של התמונה.</p>
    </section>
  );
}

function getPassportTargets(document: Document, rule: PhotoPrintRule, requirementId: string, sizeKey: string): PassportTarget[] {
  const assetById = new Map(document.assets.map((asset) => [asset.id, asset]));
  const assignmentByFrame = new Map(document.photoPrintImageAssignments.filter((assignment) => assignment.photoPrintId === rule.id).map((assignment) => [assignment.frameId, assignment]));
  const targets: PassportTarget[] = [];
  for (const page of document.pages) {
    if (!rule.pageIds.includes(page.id)) continue;
    for (const layer of page.layers) {
      if (!isPhotoPrintSlotLayer(layer) || layer.imageAssetId === undefined) continue;
      const asset = assetById.get(layer.imageAssetId);
      if (asset === undefined) continue;
      targets.push({
        pageId: page.id,
        frame: layer,
        asset,
        assignment: assignmentByFrame.get(layer.id),
        runtimeKey: passportRuntimeKey(layer.id, layer.imageAssetId, transformKey(layer.contentTransform), requirementId, sizeKey)
      });
    }
  }
  return targets;
}

function applyPassportTransforms(document: Document, ruleId: string, transforms: Map<string, ContentTransform>, isReset: boolean, size: PassportSizeMm, presetId: string | undefined): Document {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => layer.type === "frame" && transforms.has(layer.id)
        ? { ...layer, contentTransform: transforms.get(layer.id)! }
        : layer)
    })),
    photoPrintImageAssignments: document.photoPrintImageAssignments.map((assignment) => {
      const next = transforms.get(assignment.frameId);
      if (assignment.photoPrintId !== ruleId || next === undefined) return assignment;
      const previousManual = assignment.passportState?.manualAdjustmentState ?? assignment.manualContentTransform;
      return {
        ...assignment,
        manualContentTransform: next,
        hasManualCropOverride: true,
        passportState: {
          version: 1,
          ...(assignment.passportState ?? {}),
          selectedPassportPreset: presetId,
          selectedPassportSize: size,
          manualAdjustmentState: isReset ? previousManual : previousManual,
          autoAdjustmentState: isReset ? undefined : next
        }
      };
    })
  };
}

function transformKey(transform: ContentTransform): string {
  return `${round(transform.offsetX)},${round(transform.offsetY)},${round(transform.scale)},${round(transform.rotation)}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function countIssues(validations: ReturnType<typeof validatePassportFrame>[]): Record<PassportStatus, number> {
  const counts: Record<PassportStatus, number> = { ok: 0, review: 0, notRecommended: 0 };
  for (const validation of validations) {
    for (const check of validation.checks) counts[check.status] += 1;
  }
  return counts;
}

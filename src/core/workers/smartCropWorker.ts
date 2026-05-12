import { writeLog, captureError } from "@/core/logging/logger";
import { createTypeScriptWorkerBridge } from "./workerBridge";

export interface SmartCropPayload {
  pageId: string;
  frameId: string;
  assetId: string;
  frameWidth: number;
  frameHeight: number;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
  mode: "face" | "center" | "ruleOfThirds";
  onResult: (frameId: string, anchor: { x: number; y: number }) => void;
}

export interface SmartCropResult {
  frameId: string;
  anchor: { x: number; y: number };
  mode: SmartCropPayload["mode"];
  usedFallback: boolean;
}

/**
 * Worker לחיתוך חכם.
 *
 * מנסה לקרוא ל-Python bridge לזיהוי פנים/תוכן.
 * אם השירות אינו זמין — חוזר למרכז (center crop) ללא קריסה.
 */
export const smartCropWorker = createTypeScriptWorkerBridge<SmartCropPayload>(
  async (payload, context) => {
    context.updateProgress(0.1);

    if (context.signal.aborted) return;

    let anchor: { x: number; y: number };
    let usedFallback = false;

    try {
      anchor = await callPythonSmartCrop(payload);
      writeLog("smartCrop", "info", "חיתוך חכם הצליח", { frameId: payload.frameId, mode: payload.mode });
    } catch (error) {
      captureError("smartCrop", error, { frameId: payload.frameId });
      writeLog("smartCrop", "warn", "Python bridge לא זמין — חיתוך למרכז", { frameId: payload.frameId });
      anchor = centerAnchor(payload.mode);
      usedFallback = true;
    }

    context.updateProgress(0.9);

    if (!context.signal.aborted) {
      payload.onResult(payload.frameId, anchor);
    }

    writeLog("smartCrop", "info", usedFallback ? "fallback למרכז" : "חיתוך חכם הושלם", { frameId: payload.frameId });
    context.updateProgress(1);
  }
);

async function callPythonSmartCrop(
  payload: SmartCropPayload
): Promise<{ x: number; y: number }> {
  // TODO: חבר ל-Python bridge אמיתי דרך Electron IPC
  // כרגע זורק שגיאה כדי להפעיל את ה-fallback
  throw new Error("Python bridge לא חובר עדיין");
}

function centerAnchor(mode: SmartCropPayload["mode"]): { x: number; y: number } {
  if (mode === "ruleOfThirds") {
    return { x: 0.5, y: 1 / 3 };
  }
  return { x: 0.5, y: 0.5 };
}

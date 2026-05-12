import { writeLog } from "@/core/logging/logger";
import { defaultContentTransform } from "@/core/layers/factory";
import { createTypeScriptWorkerBridge } from "@/core/workers/workerBridge";
import type { Asset } from "@/types/document";
import type { ContentTransform, FrameLayer } from "@/types/layers";
import type { FitMode } from "@/types/primitives";

export interface FillFramesPayload {
  frames: FrameLayer[];
  assets: Asset[];
  fitMode: FitMode;
  onFrameFilled: (frameId: string, assetId: string, contentTransform: ContentTransform) => void;
  onComplete: (summary: FillFramesSummary) => void;
}

export interface FillFramesSummary {
  filledCount: number;
  skippedFrames: string[];
  unusedAssets: string[];
}

/**
 * Job למילוי אצווה של פריימים עם תמונות.
 *
 * מכניס לכל פריים תמונה אחת לפי הסדר.
 * שולח אירוע onFrameFilled לאחר כל מילוי כדי לא לחסום את ה-UI.
 */
export const fillFramesWorker = createTypeScriptWorkerBridge<FillFramesPayload>(
  async (payload, context) => {
    const { frames, assets, fitMode, onFrameFilled, onComplete } = payload;

    const emptyFrames = frames.filter((f) => f.contentType === "empty" || f.imageAssetId === undefined);
    const imageAssets = assets.filter((a) => a.kind === "image" && a.status === "ready");

    const skippedFrames: string[] = [];
    const filledPairs: Array<{ frameId: string; assetId: string }> = [];
    let assetIndex = 0;

    writeLog("fillFrames", "info", `מתחיל מילוי ${emptyFrames.length} פריימים עם ${imageAssets.length} תמונות`);

    for (let i = 0; i < emptyFrames.length; i++) {
      if (context.signal.aborted) break;

      const frame = emptyFrames[i];
      if (frame === undefined) continue;

      const asset = imageAssets[assetIndex];
      if (asset === undefined) {
        skippedFrames.push(frame.id);
        writeLog("fillFrames", "warn", "אין תמונה עבור פריים", { frameId: frame.id });
        continue;
      }

      try {
        onFrameFilled(frame.id, asset.id, { ...defaultContentTransform });
        filledPairs.push({ frameId: frame.id, assetId: asset.id });
        assetIndex++;

        writeLog("fillFrames", "info", "פריים מולא", { frameId: frame.id, assetId: asset.id });
      } catch (error) {
        context.addItemError(frame.id, error instanceof Error ? error.message : String(error));
        skippedFrames.push(frame.id);
      }

      context.updateProgress((i + 1) / emptyFrames.length);

      // מניח ל-event loop לנשום בין פריים לפריים
      await yieldToMain();
    }

    const unusedAssets = imageAssets.slice(assetIndex).map((a) => a.id);

    const summary: FillFramesSummary = {
      filledCount: filledPairs.length,
      skippedFrames,
      unusedAssets
    };

    onComplete(summary);
    writeLog("fillFrames", "info", "מילוי אצווה הושלם", { ...summary });
  }
);

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

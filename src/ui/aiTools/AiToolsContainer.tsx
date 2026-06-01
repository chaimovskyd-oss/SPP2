import { useEffect, useState, type ReactElement } from "react";
import "./aiTools.css";
import { useAiToolsStore } from "@/state/aiToolsStore";
import { useDocumentStore } from "@/state/documentStore";
import { createAssetPreviews } from "@/core/assets/assetManager";
import type { FrameLayer, ImageLayer } from "@/types/layers";
import type { ExpansionAmounts } from "@/services/ai/genExpandService";
import { AILoadingOverlay } from "./AILoadingOverlay";
import { ObjectRemovePanel } from "./ObjectRemovePanel";
import { UpscalePanel } from "./UpscalePanel";
import { GenExpandPanel } from "./GenExpandPanel";
import { RestorationPanel } from "./RestorationPanel";

interface AiToolResultOptions {
  expansion?: ExpansionAmounts;
}

type AiEditableImageLayer = ImageLayer | FrameLayer;

function layerImageAssetId(layer: AiEditableImageLayer): string | undefined {
  return layer.type === "image" ? layer.assetId : layer.imageAssetId;
}

function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}

export function AiToolsContainer(): ReactElement | null {
  const activeTarget = useAiToolsStore((s) => s.activeTarget);
  const processing = useAiToolsStore((s) => s.processing);
  const close = useAiToolsStore((s) => s.close);

  const document = useDocumentStore((s) => s.document);
  const applyDocumentChange = useDocumentStore((s) => s.applyDocumentChange);

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);

  // Resolve image from layer+asset whenever target changes
  useEffect(() => {
    if (!activeTarget || !document) {
      setImageDataUrl(null);
      setImageDims(null);
      return;
    }
    const page = document.pages.find((p) => p.id === activeTarget.pageId);
    if (!page) {
      console.warn("[AiTools] page not found:", activeTarget.pageId);
      return;
    }
    const layer = page.layers.find((l) => l.id === activeTarget.layerId) as AiEditableImageLayer | undefined;
    if (!layer || (layer.type !== "image" && layer.type !== "frame")) {
      console.warn("[AiTools] image layer not found:", activeTarget.layerId);
      return;
    }
    const sourceAssetId = layerImageAssetId(layer);
    const asset = document.assets.find((a) => a.id === sourceAssetId);
    if (!asset) {
      console.warn("[AiTools] asset not found:", sourceAssetId);
      return;
    }

    const url = asset.originalPath ?? asset.previewPath ?? null;
    console.log("[AiTools] Resolved asset:", { assetId: asset.id, hasSrc: !!url, w: asset.width, h: asset.height });
    setImageDataUrl(url);

    if (asset.width && asset.height) {
      setImageDims({ w: asset.width, h: asset.height });
    } else if (url) {
      const img = new Image();
      img.onload = () => {
        console.log("[AiTools] Image natural dims:", img.naturalWidth, "×", img.naturalHeight);
        setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
      };
      img.src = url;
    }
  }, [activeTarget, document]);

  if (!activeTarget) return null;

  /**
   * Called by each tool panel when the API returns a result.
   * Returns a Promise so panels can await it before calling setProcessing(false).
   */
  async function handleResult(resultDataUrl: string, options?: AiToolResultOptions): Promise<void> {
    console.log("[AiTools] handleResult called, resultDataUrl length:", resultDataUrl.length);

    if (!activeTarget || !document) {
      console.error("[AiTools] handleResult: activeTarget or document is null — cannot apply");
      return;
    }

    try {
      console.log("[AiTools] Creating asset previews...");
      const [previews, resultSize] = await Promise.all([
        createAssetPreviews(resultDataUrl, 1600, 280),
        loadImageSize(resultDataUrl),
      ]);
      console.log("[AiTools] Previews created");

      const newAsset = {
        id: crypto.randomUUID(),
        version: 1 as const,
        name: `ai_${activeTarget.tool}_${Date.now()}`,
        kind: "image" as const,
        mimeType: "image/png",
        originalPath: resultDataUrl,
        previewPath: previews.previewPath,
        thumbnailPath: previews.thumbnailPath,
        width: resultSize.width,
        height: resultSize.height,
        metadata: {} as import("@/types/primitives").Metadata,
        status: "ready" as const,
      };

      console.log("[AiTools] Applying document change, new asset id:", newAsset.id);
      console.log("[AiTools] Target: pageId=", activeTarget.pageId, "layerId=", activeTarget.layerId);

      // applyDocumentChange captures the full before-state for undo automatically
      applyDocumentChange("AiToolResultAction", (doc) => {
        const withAsset = { ...doc, assets: [...doc.assets, newAsset] };
        const result = {
          ...withAsset,
          pages: withAsset.pages.map((p) =>
            p.id !== activeTarget.pageId
              ? p
              : {
                  ...p,
                  layers: p.layers.map((l) => {
                    if (l.id !== activeTarget.layerId) return l;
                    if (l.type === "frame") {
                      return { ...l, imageAssetId: newAsset.id, contentType: "image" as const };
                    }
                    if (l.type !== "image") return l;
                    if (activeTarget.tool !== "expand") return { ...l, assetId: newAsset.id };

                    const expansion = options?.expansion;
                    const existingScale = imageDims !== null && imageDims.w > 0 && imageDims.h > 0
                      ? Math.sqrt((l.width * l.height) / (imageDims.w * imageDims.h))
                      : 1;
                    const nextWidth = Math.max(8, resultSize.width * existingScale);
                    const nextHeight = Math.max(8, resultSize.height * existingScale);
                    const sourceFinalWidth = imageDims !== null
                      ? imageDims.w + (expansion?.left ?? 0) + (expansion?.right ?? 0)
                      : 0;
                    const sourceFinalHeight = imageDims !== null
                      ? imageDims.h + (expansion?.top ?? 0) + (expansion?.bottom ?? 0)
                      : 0;
                    const offsetX = expansion !== undefined && sourceFinalWidth > 0
                      ? nextWidth * (expansion.left / sourceFinalWidth)
                      : 0;
                    const offsetY = expansion !== undefined && sourceFinalHeight > 0
                      ? nextHeight * (expansion.top / sourceFinalHeight)
                      : 0;

                    return {
                      ...l,
                      assetId: newAsset.id,
                      x: l.x - offsetX,
                      y: l.y - offsetY,
                      width: nextWidth,
                      height: nextHeight,
                      crop: { ...l.crop, x: 0, y: 0, width: 1, height: 1 },
                      imageOffsetX: 0,
                      imageOffsetY: 0,
                      imageScale: 1,
                    };
                  }),
                }
          ),
        };
        const targetPage = result.pages.find((p) => p.id === activeTarget.pageId);
        const updatedLayer = targetPage?.layers.find((l) => l.id === activeTarget.layerId);
        console.log("[AiTools] Layer after update assetId:", (updatedLayer as ImageLayer | undefined)?.assetId);
        return result;
      });

      console.log("[AiTools] Document change applied, closing panel");
      close();
    } catch (err) {
      console.error("[AiTools] handleResult FAILED:", err);
      throw err;
    }
  }

  if (!imageDataUrl || !imageDims) {
    console.log("[AiTools] Waiting for imageDataUrl/dims:", { imageDataUrl: !!imageDataUrl, imageDims });
    return null;
  }

  const dims = imageDims;

  return (
    <>
      {processing && <AILoadingOverlay previewDataUrl={imageDataUrl} />}

      {!processing && (
        <div
          className="ai-tools-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          role="dialog"
          aria-modal="true"
          aria-label="כלי AI לעריכת תמונות"
        >
          {activeTarget.tool === "remove" && (
            <ObjectRemovePanel
              imageDataUrl={imageDataUrl}
              imageWidth={dims.w}
              imageHeight={dims.h}
              onResult={handleResult}
              onClose={close}
            />
          )}
          {activeTarget.tool === "upscale" && (
            <UpscalePanel
              imageDataUrl={imageDataUrl}
              onResult={handleResult}
              onClose={close}
            />
          )}
          {activeTarget.tool === "expand" && (
            <GenExpandPanel
              imageDataUrl={imageDataUrl}
              imageWidth={dims.w}
              imageHeight={dims.h}
              onResult={handleResult}
              onClose={close}
            />
          )}
          {activeTarget.tool === "restore" && (
            <RestorationPanel
              imageDataUrl={imageDataUrl}
              onResult={handleResult}
              onClose={close}
            />
          )}
        </div>
      )}
    </>
  );
}

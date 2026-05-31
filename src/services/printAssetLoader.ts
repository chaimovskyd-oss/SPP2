/**
 * printAssetLoader.ts
 *
 * Ensures every image asset used on a page is fully decoded in the browser
 * before renderPrintableStage / stage.toDataURL() is called.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The Konva stage renders images through the useKonvaImage React hook, which
 * creates an HTMLImageElement and sets its .src asynchronously.  After a page
 * switch, only two requestAnimationFrame ticks are awaited before the stage is
 * captured.  For large data-URL images (high-res photos, class-photo pages, etc.)
 * those two frames are not enough — the HTMLImageElement's onload hasn't fired
 * yet, so the Konva node still has image=undefined and renders transparent/gray.
 *
 * THE FIX
 * ───────
 * 1. preloadAssetsForPrint   — loads every canvas-quality image into the browser
 *    decode cache BEFORE the per-page render loop starts.  Cache hits are
 *    returned synchronously (or after one microtask), so useKonvaImage's onload
 *    fires within the RAF cycle.
 *
 * 2. waitForKonvaPageImages  — after the page switch + double-RAF, polls the
 *    stage until no Konva.Image node has an HTMLImageElement still in loading
 *    state.  Acts as a safety net for slow machines / memory pressure.
 *
 * SCOPE
 * ─────
 * This module is exclusively for the final print/export render path.
 * It has no connection to the print-preview thumbnail pipeline
 * (printPreviewCache / printPreviewQueue), which uses intentionally
 * low-resolution JPEG snapshots that MUST NOT reach the final print output.
 */

import type { Page, Asset } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import { resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { markDebugEvent } from "@/debug/sppDiagnostics";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PrintImageStatus {
  assetId: string;
  layerName: string;
  /** 1-based page number for user-facing messages. */
  pageIndex: number;
  srcType: "data-url" | "blob" | "file" | "other";
  loaded: boolean;
  error?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface AssetRef {
  /** Asset UUID, or `inline:<layerId>` for metadata.imageMaskDataUrl. */
  assetId: string;
  layerName: string;
  /** When set, this src is used directly instead of looking up the asset store. */
  inlineSrc?: string;
}

function classifySrc(src: string): PrintImageStatus["srcType"] {
  if (src.startsWith("data:")) return "data-url";
  if (src.startsWith("blob:")) return "blob";
  if (src.startsWith("file:") || /^[A-Za-z]:[/\\]/.test(src)) return "file";
  return "other";
}

function gatherLayerRefs(layer: VisualLayer, allLayers: VisualLayer[]): AssetRef[] {
  if (layer.visible === false) return [];
  const refs: AssetRef[] = [];

  switch (layer.type) {
    case "image": {
      refs.push({ assetId: layer.assetId, layerName: layer.name || layer.id });

      if (layer.pixelMask?.assetId) {
        refs.push({
          assetId: layer.pixelMask.assetId,
          layerName: `${layer.name || layer.id} (pixel mask)`,
        });
      }

      const libMask = layer.metadata["imageMaskDataUrl"];
      if (typeof libMask === "string" && libMask.length > 0) {
        refs.push({
          assetId: `inline:${layer.id}`,
          layerName: `${layer.name || layer.id} (library mask)`,
          inlineSrc: libMask,
        });
      }
      break;
    }

    case "frame": {
      if (layer.imageAssetId) {
        refs.push({ assetId: layer.imageAssetId, layerName: layer.name || layer.id });
      }
      if (layer.maskSource?.type === "alphaAsset") {
        refs.push({
          assetId: layer.maskSource.assetId,
          layerName: `${layer.name || layer.id} (frame mask)`,
        });
      }
      break;
    }

    case "mask": {
      if (layer.assetId) {
        refs.push({ assetId: layer.assetId, layerName: layer.name || layer.id });
      }
      break;
    }

    case "group": {
      for (const childId of layer.childIds) {
        const child = allLayers.find((l) => l.id === childId);
        if (child) refs.push(...gatherLayerRefs(child, allLayers));
      }
      break;
    }
  }

  return refs;
}

function gatherPageAssetRefs(page: Page): AssetRef[] {
  const refs: AssetRef[] = [];

  if (page.background.type === "asset" && page.background.assetId) {
    refs.push({ assetId: page.background.assetId, layerName: "background" });
  }

  for (const layer of page.layers) {
    refs.push(...gatherLayerRefs(layer, page.layers));
  }

  // Deduplicate by assetId so we don't load the same image twice.
  const seen = new Set<string>();
  return refs.filter((ref) => {
    if (seen.has(ref.assetId)) return false;
    seen.add(ref.assetId);
    return true;
  });
}

/**
 * Load a single image src into the browser decode cache, using decode() when
 * available.  Returns immediately if the image is already cached.
 * Rejects on error or after timeoutMs.
 */
async function loadImageFully(src: string, timeoutMs = 20_000): Promise<void> {
  // Fast path: browser already has this image decoded.
  const probe = new Image();
  probe.src = src;
  if (probe.complete && probe.naturalWidth > 0) {
    if (typeof probe.decode === "function") {
      await probe.decode().catch(() => {
        // decode() failure is non-fatal; the image is already complete.
      });
    }
    return;
  }

  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    const timer = setTimeout(
      () => reject(new Error(`Image load timed out after ${timeoutMs / 1000}s`)),
      timeoutMs,
    );

    img.onload = () => {
      clearTimeout(timer);
      if (typeof img.decode === "function") {
        img.decode().catch(() => {}).then(resolve);
      } else {
        resolve();
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Image failed to load"));
    };

    img.src = src;
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pre-warms the browser image decode cache for every asset used on the given
 * pages.  Call this BEFORE the per-page render loop in executeFinalPrint.
 *
 * Uses resolveCanvasAssetPath (previewPath → thumbnailPath → originalPath)
 * because that is the same path the Konva stage renders from.
 *
 * Final print quality is not affected: this function only ensures the browser
 * has the images decoded so useKonvaImage's onload fires within the RAF cycle.
 * The actual render still happens via renderPrintableStage → stage.toDataURL().
 */
export async function preloadAssetsForPrint(
  allPages: Page[],
  pageIndices: number[],
  assets: Asset[],
): Promise<PrintImageStatus[]> {
  const statuses: PrintImageStatus[] = [];

  for (const idx of pageIndices) {
    const page = allPages[idx];
    if (!page) continue;

    const refs = gatherPageAssetRefs(page);

    for (const ref of refs) {
      const assetRecord = ref.inlineSrc === undefined
        ? assets.find((a) => a.id === ref.assetId)
        : undefined;

      const src: string | undefined =
        ref.inlineSrc ?? resolveCanvasAssetPath(assetRecord);

      const status: PrintImageStatus = {
        assetId: ref.assetId,
        layerName: ref.layerName,
        pageIndex: idx + 1,
        srcType: src ? classifySrc(src) : "other",
        loaded: false,
      };

      if (!src) {
        status.error = "asset not found or has no loadable path";
        markDebugEvent("print:asset-preload-missing", {
          pageIndex: idx + 1,
          assetId: ref.assetId,
          layerName: ref.layerName,
        });
        statuses.push(status);
        continue;
      }

      markDebugEvent("print:asset-preload-start", {
        pageIndex: idx + 1,
        assetId: ref.assetId,
        layerName: ref.layerName,
        srcType: status.srcType,
      });

      try {
        await loadImageFully(src);
        status.loaded = true;
        markDebugEvent("print:asset-preload-ok", {
          pageIndex: idx + 1,
          assetId: ref.assetId,
        });
      } catch (err) {
        status.error = err instanceof Error ? err.message : String(err);
        markDebugEvent("print:asset-preload-fail", {
          pageIndex: idx + 1,
          assetId: ref.assetId,
          layerName: ref.layerName,
          error: status.error,
        });
        console.error(
          `[print] Asset preload failed — page ${idx + 1}, layer "${ref.layerName}":`,
          status.error,
        );
      }

      statuses.push(status);
    }
  }

  return statuses;
}

/**
 * After a page switch + double-RAF, poll the Konva stage until every
 * Konva.Image node that holds an HTMLImageElement is fully decoded
 * (complete === true && naturalWidth > 0).
 *
 * This is a safety net: preloadAssetsForPrint should have pre-warmed the
 * browser cache so images load within one RAF cycle.  This function covers
 * the residual cases — large images on slow machines, memory pressure, etc.
 *
 * NOTE: Nodes with image=undefined (empty frames, layers still mounting)
 * are not counted as "unloaded" because we have no way to distinguish
 * "intentionally empty" from "still mounting."  Pre-loading ensures these
 * resolve quickly.
 */
export async function waitForKonvaPageImages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stage: any, // Konva.Stage — typed as any to avoid import issues in this service
  pageIndex: number,
  timeoutMs = 8_000,
): Promise<{ allLoaded: boolean; unloadedCount: number }> {
  const start = Date.now();

  function countUnloaded(): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes: any[] = stage.find("Image");
    return nodes.reduce((count: number, node: any) => {
      const img: unknown = typeof node.image === "function" ? node.image() : node.attrs?.image;
      if (
        img instanceof HTMLImageElement &&
        (!img.complete || img.naturalWidth === 0)
      ) {
        return count + 1;
      }
      return count;
    }, 0);
  }

  while (Date.now() - start < timeoutMs) {
    const unloaded = countUnloaded();

    if (unloaded === 0) {
      markDebugEvent("print:stage-images-ready", {
        pageIndex,
        elapsedMs: Date.now() - start,
      });
      return { allLoaded: true, unloadedCount: 0 };
    }

    markDebugEvent("print:stage-images-waiting", {
      pageIndex,
      unloadedCount: unloaded,
      elapsedMs: Date.now() - start,
    });

    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  const unloadedCount = countUnloaded();
  markDebugEvent("print:stage-images-timeout", {
    pageIndex,
    unloadedCount,
    timeoutMs,
  });

  return { allLoaded: unloadedCount === 0, unloadedCount };
}

import { useMemo, type ReactElement } from "react";
import { Image as KonvaImage } from "react-konva";
import { ENABLE_PAGE_LOOK_LAYERS } from "@/core/features/adjustmentFlags";
import { renderPageLookToCanvas } from "@/core/rendering/pageLookEffects";
import { pageLookMaster, type PageLookLayer } from "@/types/imageAdjustments";

/**
 * Live preview of always-top page-look overlays. Each look is rendered into an
 * offscreen canvas (the SAME renderer the export uses) and shown as a single
 * top-most Konva.Image. There is deliberately no full-page cache of the content
 * beneath — the overlay is an independent layer drawn on top.
 */
export function PageLookOverlay({
  pageLooks,
  width,
  height
}: {
  pageLooks: PageLookLayer[] | undefined;
  width: number;
  height: number;
}): ReactElement | null {
  if (!ENABLE_PAGE_LOOK_LAYERS || pageLooks === undefined || pageLooks.length === 0) return null;
  return (
    <>
      {pageLooks.map((look) =>
        look.enabled === false ? null : (
          <PageLookImage key={look.id} look={look} width={width} height={height} />
        )
      )}
    </>
  );
}

function PageLookImage({ look, width, height }: { look: PageLookLayer; width: number; height: number }): ReactElement | null {
  const master = pageLookMaster(look);
  const canvas = useMemo(
    () => (master <= 0 ? null : renderPageLookToCanvas(look.effect, width, height, master)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(look.effect), master, width, height]
  );
  if (canvas === null) return null;
  return <KonvaImage image={canvas} x={0} y={0} width={width} height={height} listening={false} />;
}

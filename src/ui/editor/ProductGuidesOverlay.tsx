/**
 * Konva overlay for Product Mode guides:
 *  - bleed border (red dashed)
 *  - safe area border (green dashed)
 *  - print zone outlines + labels
 *  - outside-trim-area dim (bleed zone visualization)
 *  - mask boundary outlines
 *
 * Rendered inside CanvasStage's main Layer, OUTSIDE the content clip Group so
 * overlays appear on top of all content.  All nodes are non-interactive.
 */

import type Konva from "konva";
import type { ReactElement } from "react";
import { Group, Line, Rect, Shape, Text } from "react-konva";
import { SCREEN_HELPER_NODE_NAME } from "./canvasNodeNames";
import type { ProductPageContext } from "@/types/product";

interface ProductGuidesOverlayProps {
  context: ProductPageContext;
  pageWidth: number;
  pageHeight: number;
  scale: number;
}

export function ProductGuidesOverlay({
  context,
  pageWidth,
  pageHeight,
  scale
}: ProductGuidesOverlayProps): ReactElement {
  const sw = 1.5 / scale;
  const { bleed, trimSize, guideVisibility } = context;

  // Trim area on the canvas: offset from canvas origin by bleed
  const trimX = bleed.left;
  const trimY = bleed.top;
  const trimW = trimSize.width;
  const trimH = trimSize.height;

  return (
    <Group listening={false} name={SCREEN_HELPER_NODE_NAME}>
      {/* ── Outside-trim-area dim (bleed zone) ── */}
      {guideVisibility.nonPrintableArea && (
        <Shape
          name={SCREEN_HELPER_NODE_NAME}
          listening={false}
          sceneFunc={(ctx: Konva.Context, shape: Konva.Shape) => {
            ctx.beginPath();
            // Outer path — full canvas (clockwise via ctx.rect)
            ctx.rect(0, 0, pageWidth, pageHeight);
            // Inner path — trim area, counter-clockwise = creates hole with nonzero rule
            ctx.moveTo(trimX + trimW, trimY);
            ctx.lineTo(trimX, trimY);
            ctx.lineTo(trimX, trimY + trimH);
            ctx.lineTo(trimX + trimW, trimY + trimH);
            ctx.closePath();
            ctx.fillStrokeShape(shape);
          }}
          fill="rgba(0,0,0,0.32)"
          opacity={1}
        />
      )}

      {/* ── Bleed border (red dashed) ── */}
      {guideVisibility.bleed && (
        <Rect
          name={SCREEN_HELPER_NODE_NAME}
          x={trimX}
          y={trimY}
          width={trimW}
          height={trimH}
          stroke="#E05D5D"
          strokeWidth={sw * 1.5}
          dash={[8 / scale, 6 / scale]}
          fill="transparent"
          listening={false}
        />
      )}

      {/* ── Safe area border (green dashed) ── */}
      {guideVisibility.safeArea && context.safeArea && (
        <Rect
          name={SCREEN_HELPER_NODE_NAME}
          x={context.safeArea.x}
          y={context.safeArea.y}
          width={context.safeArea.width}
          height={context.safeArea.height}
          stroke="#39B980"
          strokeWidth={sw}
          dash={[5 / scale, 7 / scale]}
          fill="transparent"
          listening={false}
        />
      )}

      {/* ── Print zone outlines ── */}
      {guideVisibility.printZones &&
        context.printZones.map((zone) => (
          <Group key={zone.id} listening={false}>
            <Rect
              name={SCREEN_HELPER_NODE_NAME}
              x={zone.bounds.x}
              y={zone.bounds.y}
              width={zone.bounds.width}
              height={zone.bounds.height}
              stroke="#F0A040"
              strokeWidth={sw}
              dash={[10 / scale, 8 / scale]}
              fill="transparent"
              listening={false}
            />
            {/* Zone label in top-left corner */}
            <Text
              name={SCREEN_HELPER_NODE_NAME}
              x={zone.bounds.x + 4 / scale}
              y={zone.bounds.y + 4 / scale}
              text={zone.name}
              fontSize={10 / scale}
              fill="#F0A040"
              opacity={0.8}
              listening={false}
            />
          </Group>
        ))}

      {/* ── Mask outlines ── */}
      {guideVisibility.maskOverlay &&
        (context.masks ?? []).map((mask) => {
          // For rect/simple masks, use the first applicable zone bounds as mask bounds.
          // More complex shapes (SVG paths) will be supported in a future iteration.
          const targetZone =
            mask.appliesTo && mask.appliesTo.length > 0
              ? context.printZones.find((z) => mask.appliesTo!.includes(z.id))
              : context.printZones[0];
          if (!targetZone) return null;
          return (
            <Group key={mask.id} listening={false}>
              {/* Dashed mask boundary */}
              <Rect
                name={SCREEN_HELPER_NODE_NAME}
                x={targetZone.bounds.x}
                y={targetZone.bounds.y}
                width={targetZone.bounds.width}
                height={targetZone.bounds.height}
                stroke="#A78BFA"
                strokeWidth={sw * 1.2}
                dash={[4 / scale, 6 / scale]}
                fill="transparent"
                listening={false}
              />
              {/* Mask label */}
              <Text
                name={SCREEN_HELPER_NODE_NAME}
                x={targetZone.bounds.x + 4 / scale}
                y={targetZone.bounds.y + targetZone.bounds.height - 14 / scale}
                text={mask.name}
                fontSize={9 / scale}
                fill="#A78BFA"
                opacity={0.75}
                listening={false}
              />
            </Group>
          );
        })}

      {/* ── Canvas boundary (page edge marker, white hairline) ── */}
      <Rect
        name={SCREEN_HELPER_NODE_NAME}
        x={0}
        y={0}
        width={pageWidth}
        height={pageHeight}
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={sw * 0.8}
        fill="transparent"
        listening={false}
      />
    </Group>
  );
}

import { useEffect, useMemo, useRef } from "react";
import { Group, Image as KonvaImage, Line, Rect, Text } from "react-konva";
import Konva from "konva";
import { resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { clampContentTransformToFillBounds, computeContentRect, type ContentRect } from "@/core/rendering/frameFitEngine";
import { measureTextLayerSize } from "@/core/text/measurement";
import type { Asset } from "@/types/document";
import type { FrameLayer, ImageLayer, TextLayer, VisualLayer } from "@/types/layers";
import type { BlendMode } from "@/types/layers";
import type {
  ColorOverlayEffect,
  GradientOverlayEffect,
  OuterGlowEffect,
  SoftEdgeEffect,
  StrokeEffect,
  VisualEffectStack
} from "@/types/visualEffects";
import { useKonvaImage } from "./useKonvaImage";
import { renderTextToCanvas } from "./warpText";

interface KonvaLayerNodeProps {
  layer: VisualLayer;
  assets: Asset[];
  selected: boolean;
  layoutEditMode: boolean;
  onSelect: (layerId: string) => void;
  onChange: (layer: VisualLayer) => void;
  onBeginTextEdit: (layerId: string) => void;
}

export function KonvaLayerNode({
  layer,
  assets,
  selected,
  layoutEditMode,
  onSelect,
  onChange,
  onBeginTextEdit
}: KonvaLayerNodeProps): React.ReactElement | null {
  if (layer.type === "text") {
    return <TextNode layer={layer} selected={selected} onBeginTextEdit={onBeginTextEdit} onChange={onChange} onSelect={onSelect} />;
  }

  if (layer.type === "image") {
    return <ImageNode layer={layer} assets={assets} selected={selected} onChange={onChange} onSelect={onSelect} />;
  }

  if (layer.type === "frame") {
    return <FrameNode layer={layer} assets={assets} selected={selected} layoutEditMode={layoutEditMode} onChange={onChange} onSelect={onSelect} />;
  }

  return null;
}

// ─── Visual effects resolver ──────────────────────────────────────────────────

interface ResolvedFx {
  shadow?: { color: string; opacity: number; offsetX: number; offsetY: number; blur: number };
  stroke?: StrokeEffect;
  softEdge?: SoftEdgeEffect;
  colorOverlay?: ColorOverlayEffect;
  gradientOverlay?: GradientOverlayEffect;
}

function resolveFrameEffects(stack: VisualEffectStack | undefined): ResolvedFx {
  if (stack === undefined || !stack.enabled) return {};
  const result: ResolvedFx = {};
  for (const effect of stack.effects) {
    if (!effect.enabled) continue;
    const p = effect.params;
    if (p.type === "dropShadow") {
      result.shadow = { color: p.color, opacity: p.opacity, offsetX: p.offsetX, offsetY: p.offsetY, blur: p.blur };
    } else if (p.type === "outerGlow" && result.shadow === undefined) {
      result.shadow = { color: (p as OuterGlowEffect).color, opacity: p.opacity, offsetX: 0, offsetY: 0, blur: (p as OuterGlowEffect).blur };
    } else if (p.type === "stroke") {
      result.stroke = p as StrokeEffect;
    } else if (p.type === "softEdge") {
      result.softEdge = p as SoftEdgeEffect;
    } else if (p.type === "colorOverlay") {
      result.colorOverlay = p as ColorOverlayEffect;
    } else if (p.type === "gradientOverlay") {
      result.gradientOverlay = p as GradientOverlayEffect;
    }
  }
  return result;
}

function maskShape(layer: FrameLayer): string | null {
  const metadata = layer.metadata["maskFrame"];
  if (typeof metadata === "object" && metadata !== null && "maskShape" in metadata && typeof metadata.maskShape === "string") {
    return metadata.maskShape;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function heartPath(ctx: any, x: number, y: number, width: number, height: number): void {
  ctx.moveTo(x + width / 2, y + height * 0.92);
  ctx.bezierCurveTo(x + width * 0.05, y + height * 0.62, x, y + height * 0.28, x + width * 0.25, y + height * 0.14);
  ctx.bezierCurveTo(x + width * 0.38, y + height * 0.06, x + width * 0.5, y + height * 0.16, x + width / 2, y + height * 0.28);
  ctx.bezierCurveTo(x + width * 0.5, y + height * 0.16, x + width * 0.62, y + height * 0.06, x + width * 0.75, y + height * 0.14);
  ctx.bezierCurveTo(x + width, y + height * 0.28, x + width * 0.95, y + height * 0.62, x + width / 2, y + height * 0.92);
  ctx.closePath();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function starPath(ctx: any, cx: number, cy: number, outerRadius: number, innerRadius: number): void {
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function mapBlendMode(mode: BlendMode): string {
  const table: Record<BlendMode, string> = {
    normal: "source-over",
    multiply: "multiply",
    screen: "screen",
    overlay: "overlay",
    darken: "darken",
    lighten: "lighten"
  };
  return table[mode] ?? "source-over";
}

function gradientOverlayRectProps(
  fx: GradientOverlayEffect,
  w: number,
  h: number
): Record<string, unknown> {
  const colorStops = fx.stops.flatMap((s) => [s.position, s.color]);
  if (fx.gradientType === "radial") {
    return {
      fillRadialGradientStartPoint: { x: w / 2, y: h / 2 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndPoint: { x: w / 2, y: h / 2 },
      fillRadialGradientEndRadius: Math.max(w, h) / 2,
      fillRadialGradientColorStops: colorStops
    };
  }
  const rad = (fx.angle * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const dx = Math.cos(rad) * (w / 2);
  const dy = Math.sin(rad) * (h / 2);
  return {
    fillLinearGradientStartPoint: { x: cx - dx, y: cy - dy },
    fillLinearGradientEndPoint: { x: cx + dx, y: cy + dy },
    fillLinearGradientColorStops: colorStops
  };
}

// ─── Outer-glow helper (text only) ───────────────────────────────────────────

function resolveOuterGlow(layer: TextLayer): { color: string; blur: number; opacity: number } | null {
  const glowEffect = layer.effects.find((e) => e.enabled && e.effectType === "outer_glow");
  if (glowEffect !== undefined) {
    const p = glowEffect.params as Record<string, unknown>;
    return {
      color: typeof p["color"] === "string" ? p["color"] : "#ffffff",
      blur: typeof p["blur"] === "number" ? p["blur"] : 20,
      opacity: glowEffect.opacity
    };
  }
  if (layer.shadow !== undefined && layer.shadow.offsetX === 0 && layer.shadow.offsetY === 0 && layer.shadow.blur > 8) {
    return { color: layer.shadow.color, blur: layer.shadow.blur, opacity: layer.shadow.opacity };
  }
  return null;
}

// ─── Text Node ────────────────────────────────────────────────────────────────

function TextNode({
  layer,
  selected,
  onSelect,
  onChange,
  onBeginTextEdit
}: {
  layer: TextLayer;
  selected: boolean;
  onSelect: (layerId: string) => void;
  onChange: (layer: VisualLayer) => void;
  onBeginTextEdit: (layerId: string) => void;
}): React.ReactElement {
  const warpCanvas = useMemo(
    () => renderTextToCanvas(layer),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      layer.text,
      layer.fontFamily,
      layer.fontSize,
      layer.fontWeight,
      layer.fontStyle,
      layer.color,
      layer.fillOpacity,
      layer.letterSpacing,
      layer.lineHeight,
      layer.direction,
      layer.stroke,
      layer.shadow,
      layer.warpSettings.enabled,
      layer.warpSettings.type,
      layer.warpSettings.amount,
      layer.warpSettings.horizontalDistortion,
      layer.warpSettings.verticalDistortion,
      JSON.stringify(layer.effects)
    ]
  );

  const commonDrag = {
    draggable: !layer.locked,
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      onChange({ ...layer, x: event.target.x(), y: event.target.y() });
    }
  };

  if (warpCanvas !== null) {
    return (
      <KonvaImage
        id={layer.id}
        name={selected ? "selected-layer" : undefined}
        image={warpCanvas}
        x={layer.x}
        y={layer.y}
        width={warpCanvas.width}
        height={warpCanvas.height}
        rotation={layer.rotation}
        opacity={layer.opacity}
        visible={layer.visible}
        {...commonDrag}
        onClick={() => onSelect(layer.id)}
        onDblClick={() => onBeginTextEdit(layer.id)}
        onTap={() => onSelect(layer.id)}
        onTransformEnd={(event) => {
          const node = event.target;
          node.scaleX(1);
          node.scaleY(1);
          onChange({ ...layer, x: node.x(), y: node.y(), rotation: node.rotation() });
        }}
      />
    );
  }

  const gradientProps = gradientFillProps(layer);
  const shadow = layer.shadow;
  const stroke = layer.stroke;
  const measuredSize = measureTextLayerSize(layer);
  const outerGlow = resolveOuterGlow(layer);
  const shadowProps =
    shadow !== undefined && (shadow.offsetX !== 0 || shadow.offsetY !== 0 || shadow.blur <= 8)
      ? {
          shadowColor: shadow.color,
          shadowBlur: shadow.blur,
          shadowOffsetX: shadow.offsetX,
          shadowOffsetY: shadow.offsetY,
          shadowOpacity: shadow.opacity
        }
      : outerGlow !== null
      ? {
          shadowColor: outerGlow.color,
          shadowBlur: outerGlow.blur,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          shadowOpacity: outerGlow.opacity
        }
      : {};

  return (
    <Text
      id={layer.id}
      name={selected ? "selected-layer" : undefined}
      x={layer.x}
      y={layer.y}
      width={measuredSize.width}
      height={measuredSize.height}
      text={layer.text}
      fontFamily={layer.fontFamily}
      fontSize={layer.fontSize}
      fontStyle={konvaFontStyle(layer)}
      fontVariant="normal"
      fill={rgba(layer.color, layer.fillOpacity)}
      {...gradientProps}
      stroke={stroke?.color}
      strokeWidth={stroke?.width ?? 0}
      strokeEnabled={stroke !== undefined && stroke.width > 0 && stroke.opacity > 0}
      {...shadowProps}
      lineHeight={layer.lineHeight}
      letterSpacing={layer.letterSpacing}
      align={layer.alignment}
      direction={layer.direction === "auto" ? "rtl" : layer.direction}
      {...commonDrag}
      rotation={layer.rotation}
      opacity={layer.opacity}
      visible={layer.visible}
      onClick={() => onSelect(layer.id)}
      onDblClick={() => onBeginTextEdit(layer.id)}
      onTap={() => onSelect(layer.id)}
      onTransformEnd={(event) => {
        const node = event.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const fontScale = Math.max(0.1, (Math.abs(scaleX) + Math.abs(scaleY)) / 2);
        node.scaleX(1);
        node.scaleY(1);
        const nextFontSize = Math.max(4, Math.round(layer.fontSize * fontScale));
        const nextLayer = { ...layer, fontSize: nextFontSize, x: node.x(), y: node.y(), rotation: node.rotation() };
        const nextSize = measureTextLayerSize(nextLayer);
        onChange({ ...nextLayer, width: nextSize.width, height: nextSize.height });
      }}
    />
  );
}

function clampContentNodeToFrame(node: Konva.Node, rect: ContentRect, layer: FrameLayer): void {
  const pad = layer.padding;
  const innerX = pad;
  const innerY = pad;
  const innerW = Math.max(1, layer.width - pad * 2);
  const innerH = Math.max(1, layer.height - pad * 2);
  node.x(clampNodeAxis(node.x(), rect.width, innerX, innerW));
  node.y(clampNodeAxis(node.y(), rect.height, innerY, innerH));
}

function clampNodeAxis(start: number, size: number, innerStart: number, innerSize: number): number {
  if (size <= innerSize) {
    return innerStart + (innerSize - size) / 2;
  }
  const minStart = innerStart + innerSize - size;
  const maxStart = innerStart;
  return Math.min(maxStart, Math.max(minStart, start));
}

function konvaFontStyle(layer: TextLayer): string {
  const weight = layer.fontWeight >= 700 ? "bold" : "";
  return [layer.fontStyle === "italic" ? "italic" : "", weight].filter(Boolean).join(" ") || "normal";
}

function gradientFillProps(layer: TextLayer): Record<string, unknown> {
  if (layer.gradient === undefined || layer.gradient.stops.length === 0) {
    return {};
  }
  const stops = layer.gradient.stops.flatMap((stop) => [stop.offset, rgba(stop.color, stop.opacity * layer.fillOpacity)]);
  if (layer.gradient.type === "radial") {
    return {
      fillRadialGradientStartPoint: { x: layer.width / 2, y: layer.height / 2 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndPoint: { x: layer.width / 2, y: layer.height / 2 },
      fillRadialGradientEndRadius: Math.max(layer.width, layer.height) / 2,
      fillRadialGradientColorStops: stops
    };
  }
  const radians = ((layer.gradient.angle ?? 0) * Math.PI) / 180;
  const cx = layer.width / 2;
  const cy = layer.height / 2;
  const dx = Math.cos(radians) * layer.width * 0.5;
  const dy = Math.sin(radians) * layer.height * 0.5;
  return {
    fillLinearGradientStartPoint: { x: cx - dx, y: cy - dy },
    fillLinearGradientEndPoint: { x: cx + dx, y: cy + dy },
    fillLinearGradientColorStops: stops
  };
}

function rgba(color: string, opacity: number): string {
  if (!color.startsWith("#")) return color;
  const normalized =
    color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
  if (normalized.length !== 7) return color;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

// ─── Image Node (מצב חופשי — ImageLayer רגיל, ללא פריים/תא) ─────────────────
// All visual effects are applied here. This node is used in free-mode only.
// Frame/cell mode uses FrameNode which has its own effect rendering.

function ImageNode({
  layer,
  assets,
  selected,
  onSelect,
  onChange
}: {
  layer: ImageLayer;
  assets: Asset[];
  selected: boolean;
  onSelect: (layerId: string) => void;
  onChange: (layer: VisualLayer) => void;
}): React.ReactElement {
  const asset = assets.find((item) => item.id === layer.assetId);
  const image = useKonvaImage(resolveCanvasAssetPath(asset));
  const blurRef = useRef<Konva.Image | null>(null);

  const fx = useMemo(
    () => resolveFrameEffects(layer.visualEffects),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(layer.visualEffects)]
  );
  const blurRadius = fx.softEdge?.radius ?? 0;

  // Cache the image node when soft-edge blur filter is active
  useEffect(() => {
    const node = blurRef.current;
    if (node === null) return;
    if (blurRadius > 0) {
      node.cache();
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  }, [blurRadius]);

  // Shadow/glow on the outer Group so it renders outside the image bounds
  const shadowProps = fx.shadow !== undefined
    ? {
        shadowColor: fx.shadow.color,
        shadowBlur: fx.shadow.blur,
        shadowOffsetX: fx.shadow.offsetX,
        shadowOffsetY: fx.shadow.offsetY,
        shadowOpacity: fx.shadow.opacity,
        shadowEnabled: true
      }
    : {};

  const groupCommon = {
    id: layer.id,
    name: selected ? "selected-layer" : undefined,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: !layer.locked,
    onClick: () => onSelect(layer.id),
    onTap: () => onSelect(layer.id),
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      onChange({ ...layer, x: event.target.x(), y: event.target.y() });
    },
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
      const node = event.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      onChange({
        ...layer,
        x: node.x(),
        y: node.y(),
        width: Math.max(8, node.width() * scaleX),
        height: Math.max(8, node.height() * scaleY),
        rotation: node.rotation()
      });
    }
  };

  return (
    <Group {...groupCommon} {...shadowProps}>
      {/* Image — blur filter applied here */}
      <KonvaImage
        ref={blurRef}
        x={0}
        y={0}
        width={layer.width}
        height={layer.height}
        image={image ?? undefined}
        filters={blurRadius > 0 ? [Konva.Filters.Blur] : []}
        blurRadius={blurRadius}
        stroke={fx.stroke?.color}
        strokeWidth={fx.stroke?.width ?? 0}
        strokeEnabled={fx.stroke !== undefined}
      />
      {/* Color overlay */}
      {fx.colorOverlay !== undefined && (
        <Rect
          x={0}
          y={0}
          width={layer.width}
          height={layer.height}
          fill={fx.colorOverlay.color}
          opacity={fx.colorOverlay.opacity}
          globalCompositeOperation={mapBlendMode(fx.colorOverlay.blendMode) as "source-over"}
          listening={false}
        />
      )}
      {/* Gradient overlay */}
      {fx.gradientOverlay !== undefined && (
        <Rect
          x={0}
          y={0}
          width={layer.width}
          height={layer.height}
          {...gradientOverlayRectProps(fx.gradientOverlay, layer.width, layer.height)}
          opacity={fx.gradientOverlay.opacity}
          globalCompositeOperation={mapBlendMode(fx.gradientOverlay.blendMode) as "source-over"}
          listening={false}
        />
      )}
    </Group>
  );
}

// ─── Frame Node ───────────────────────────────────────────────────────────────

function FrameNode({
  layer,
  assets,
  selected,
  layoutEditMode,
  onSelect,
  onChange
}: {
  layer: FrameLayer;
  assets: Asset[];
  selected: boolean;
  layoutEditMode: boolean;
  onSelect: (layerId: string) => void;
  onChange: (layer: VisualLayer) => void;
}): React.ReactElement {
  const asset = assets.find((item) => item.id === layer.imageAssetId);
  const image = useKonvaImage(resolveCanvasAssetPath(asset));
  const blurRef = useRef<Konva.Image | null>(null);
  const fx = useMemo(
    () => resolveFrameEffects(layer.visualEffects),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(layer.visualEffects)]
  );
  const blurRadius = fx.softEdge?.radius ?? 0;
  const isGridCell = layer.metadata["gridCell"] !== undefined;
  const isMaskFrame = layer.metadata["maskFrame"] !== undefined;
  const collageFrameMeta = layer.metadata["collageFrame"] as { isCollageFrame?: boolean; layoutManaged?: boolean; slotType?: string } | undefined;
  const isCollageFrame = collageFrameMeta?.isCollageFrame === true;
  const isCollageEmpty = isCollageFrame && collageFrameMeta?.slotType === "empty";
  const collageSelectColor = "#22d3ee";

  useEffect(() => {
    const node = blurRef.current;
    if (node === null) return;
    if (blurRadius > 0) { node.cache(); } else { node.clearCache(); }
    node.getLayer()?.batchDraw();
  }, [blurRadius]);

  // האם הפריים עצמו ניתן לגרירה
  const frameIsDraggable =
    !isGridCell &&
    !isMaskFrame &&
    !isCollageFrame &&
    !layer.locked &&
    !layer.lockedFrame &&
    (layer.behaviorMode === "freeform" || layoutEditMode);

  // האם התמונה ניתנת לגרירה (הזזת תוכן בתוך הפריים)
  const contentIsDraggable = !layer.lockedContent && image !== null && !layoutEditMode && layer.fitMode !== "stretch";

  const contentRect = useMemo(() => {
    if (image === null) return null;
    return computeContentRect(
      layer.width,
      layer.height,
      image.naturalWidth,
      image.naturalHeight,
      layer.fitMode,
      layer.contentTransform,
      layer.padding
    );
  }, [image, layer.width, layer.height, layer.fitMode, layer.contentTransform, layer.padding]);

  const cornerRadius = layer.shape === "circle"
    ? Math.min(layer.width, layer.height) / 2
    : (layer.cornerRadius ?? 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clipFunc = (ctx: any): void => {
    const pad = layer.padding;
    const w = layer.width - pad * 2;
    const h = layer.height - pad * 2;
    ctx.beginPath();
    if (layer.shape === "circle" || layer.shape === "ellipse") {
      ctx.ellipse(pad + w / 2, pad + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (layer.shape === "svgPath" && maskShape(layer) === "star") {
      starPath(ctx, pad + w / 2, pad + h / 2, Math.min(w, h) / 2, Math.min(w, h) / 4);
    } else if (layer.shape === "svgPath" && maskShape(layer) === "heart") {
      heartPath(ctx, pad, pad, w, h);
    } else {
      const r = Math.min(cornerRadius, w / 2, h / 2);
      ctx.moveTo(pad + r, pad);
      ctx.arcTo(pad + w, pad, pad + w, pad + h, r);
      ctx.arcTo(pad + w, pad + h, pad, pad + h, r);
      ctx.arcTo(pad, pad + h, pad, pad, r);
      ctx.arcTo(pad, pad, pad + w, pad, r);
      ctx.closePath();
    }
  };

  const shadowProps = fx.shadow !== undefined
    ? { shadowColor: fx.shadow.color, shadowBlur: fx.shadow.blur, shadowOffsetX: fx.shadow.offsetX, shadowOffsetY: fx.shadow.offsetY, shadowOpacity: fx.shadow.opacity, shadowEnabled: true }
    : {};

  const handleFrameDragEnd = (event: Konva.KonvaEventObject<DragEvent>): void => {
    if (isMaskFrame) {
      event.cancelBubble = true;
      event.target.x(layer.x);
      event.target.y(layer.y);
      return;
    }
    onChange({ ...layer, x: event.target.x(), y: event.target.y() });
  };

  const handleTransformEnd = (event: Konva.KonvaEventObject<Event>): void => {
    const node = event.target;
    if (isMaskFrame) {
      event.cancelBubble = true;
      node.x(layer.x);
      node.y(layer.y);
      node.scaleX(1);
      node.scaleY(1);
      node.rotation(layer.rotation);
      return;
    }
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onChange({
      ...layer,
      x: node.x(),
      y: node.y(),
      width: Math.max(24, node.width() * scaleX),
      height: Math.max(24, node.height() * scaleY),
      rotation: node.rotation()
    });
  };

  const handleContentDragEnd = (event: Konva.KonvaEventObject<DragEvent>): void => {
    event.cancelBubble = true;
    if (contentRect === null) return;
    const node = event.target;
    clampContentNodeToFrame(node, contentRect, layer);
    const dx = node.x() - contentRect.x;
    const dy = node.y() - contentRect.y;
    const nextTransform = {
      ...layer.contentTransform,
      offsetX: layer.contentTransform.offsetX + dx,
      offsetY: layer.contentTransform.offsetY + dy
    };
    onChange({
      ...layer,
      contentTransform: image === null
        ? nextTransform
        : clampContentTransformToFillBounds(
            nextTransform,
            layer.width,
            layer.height,
            image.naturalWidth,
            image.naturalHeight,
            layer.fitMode,
            layer.padding
          )
    });
  };

  return (
    <Group
      id={layer.id}
      name={selected ? "selected-layer" : undefined}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation}
      opacity={layer.opacity}
      visible={layer.visible}
      draggable={frameIsDraggable}
      onClick={() => onSelect(layer.id)}
      onTap={() => onSelect(layer.id)}
      onDragEnd={handleFrameDragEnd}
      onTransformEnd={handleTransformEnd}
      {...shadowProps}
    >
      {/* שכבת תוכן עם clip לפי צורת הפריים */}
      <Group clipFunc={clipFunc}>
        {/* רקע פריים ריק */}
        <Rect
          x={0}
          y={0}
          width={layer.width}
          height={layer.height}
          fill={isCollageEmpty ? "#e8eaf0" : (layer.fill?.color ?? (image === null ? "#e8e5e1" : "#ffffff"))}
          opacity={layer.fill?.opacity ?? 1}
          listening={false}
        />
        {/* Empty collage slot placeholder */}
        {isCollageEmpty && (
          <>
            <Text
              x={0}
              y={layer.height / 2 - 14}
              width={layer.width}
              text="+"
              fontSize={Math.min(32, layer.width * 0.3)}
              fill="rgba(0,0,0,0.25)"
              align="center"
              listening={false}
            />
            <Text
              x={0}
              y={layer.height / 2 + 8}
              width={layer.width}
              text="תא ריק"
              fontSize={Math.max(8, Math.min(13, layer.width * 0.12))}
              fill="rgba(0,0,0,0.3)"
              align="center"
              fontFamily="Arial"
              listening={false}
            />
          </>
        )}
        {/* תמונה בתוך הפריים */}
        {image !== null && contentRect !== null && (
          <KonvaImage
            ref={blurRef}
            x={contentRect.x}
            y={contentRect.y}
            width={contentRect.width}
            height={contentRect.height}
            image={image}
            draggable={contentIsDraggable}
            filters={blurRadius > 0 ? [Konva.Filters.Blur] : []}
            blurRadius={blurRadius}
            onDragMove={(event) => {
              event.cancelBubble = true;
              clampContentNodeToFrame(event.target, contentRect, layer);
            }}
            onDragEnd={handleContentDragEnd}
          />
        )}
        {/* overlays */}
        {fx.colorOverlay !== undefined && (
          <Rect x={0} y={0} width={layer.width} height={layer.height} fill={fx.colorOverlay.color} opacity={fx.colorOverlay.opacity} globalCompositeOperation={mapBlendMode(fx.colorOverlay.blendMode) as "source-over"} listening={false} />
        )}
        {fx.gradientOverlay !== undefined && (
          <Rect x={0} y={0} width={layer.width} height={layer.height} {...gradientOverlayRectProps(fx.gradientOverlay, layer.width, layer.height)} opacity={fx.gradientOverlay.opacity} globalCompositeOperation={mapBlendMode(fx.gradientOverlay.blendMode) as "source-over"} listening={false} />
        )}
      </Group>

      {/* מסגרת חיצונית (מעל התמונה, ללא fill) */}
      {image === null ? (
        <Rect
          x={0}
          y={0}
          width={layer.width}
          height={layer.height}
          fill="transparent"
          stroke={fx.stroke?.color ?? (selected ? (isCollageFrame ? collageSelectColor : "#7C6FE0") : (isCollageEmpty ? "#bbbdc8" : "#b8b2aa"))}
          strokeWidth={fx.stroke?.width ?? (selected ? 2.5 : 1)}
          dash={fx.stroke !== undefined ? undefined : (isCollageEmpty ? [6, 4] : [8, 8])}
          cornerRadius={cornerRadius}
          listening={false}
        />
      ) : (
        <Rect
          x={0}
          y={0}
          width={layer.width}
          height={layer.height}
          fill="transparent"
          stroke={fx.stroke?.color ?? (selected && layoutEditMode ? "#7C6FE0" : "transparent")}
          strokeWidth={fx.stroke?.width ?? (selected && layoutEditMode ? 2.5 : 0)}
          cornerRadius={cornerRadius}
          listening={false}
        />
      )}

      {/* אינדיקטור מצב עריכת פריסה */}
      {layoutEditMode && selected && !isCollageFrame && (
        <Rect x={0} y={0} width={layer.width} height={layer.height} fill="transparent" stroke="#F59E0B" strokeWidth={2} dash={[6, 4]} cornerRadius={cornerRadius} listening={false} />
      )}
      {/* Collage cell selected highlight */}
      {isCollageFrame && selected && (
        <Rect x={0} y={0} width={layer.width} height={layer.height} fill="rgba(34,211,238,0.08)" stroke={collageSelectColor} strokeWidth={2.5} cornerRadius={cornerRadius} listening={false} />
      )}
    </Group>
  );
}

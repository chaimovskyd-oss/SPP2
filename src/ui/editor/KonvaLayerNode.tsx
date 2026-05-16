import { useEffect, useMemo, useRef, useState } from "react";
import { useImageEditStore } from "@/state/imageEditStore";
import { Circle, Group, Image as KonvaImage, Line, Rect, Text } from "react-konva";
import { drawPuzzlePath } from "@/core/collage/collagePuzzle";
import { generateTornEdgePoints } from "@/core/collage/collageTornPaper";
import type { CollageEdgeConfig } from "@/types/collage";
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
import { collageAdjToKonva, imageEffectsToKonva, imageLayerAdjToKonva, type CollageColorAdj } from "@/core/rendering/colorAdjustUtils";
import { renderTextToCanvas } from "./warpText";

export interface CanvasContextMenuTarget {
  layerId: string;
  layerType: "image" | "frame";
  hasImage: boolean;
  screenX: number;
  screenY: number;
}

interface KonvaLayerNodeProps {
  layer: VisualLayer;
  assets: Asset[];
  selected: boolean;
  layoutEditMode: boolean;
  onSelect: (layerId: string) => void;
  onChange: (layer: VisualLayer) => void;
  onBeginTextEdit: (layerId: string) => void;
  onContextMenu?: (target: CanvasContextMenuTarget) => void;
}

export function KonvaLayerNode({
  layer,
  assets,
  selected,
  layoutEditMode,
  onSelect,
  onChange,
  onBeginTextEdit,
  onContextMenu
}: KonvaLayerNodeProps): React.ReactElement | null {
  if (layer.type === "text") {
    return <TextNode layer={layer} selected={selected} onBeginTextEdit={onBeginTextEdit} onChange={onChange} onSelect={onSelect} />;
  }

  if (layer.type === "image") {
    return <ImageNode layer={layer} assets={assets} selected={selected} onChange={onChange} onSelect={onSelect} onContextMenu={onContextMenu} />;
  }

  if (layer.type === "frame") {
    return <FrameNode layer={layer} assets={assets} selected={selected} layoutEditMode={layoutEditMode} onChange={onChange} onSelect={onSelect} onContextMenu={onContextMenu} />;
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
interface CollageGlobalMaskMeta {
  enabled?: boolean;
  shape?: "heart" | "circle";
  canvasW?: number;
  canvasH?: number;
  marginPx?: number;
}

function drawGlobalMaskPath(
  ctx: any,
  mask: CollageGlobalMaskMeta,
  layerX: number,
  layerY: number
): boolean {
  if (mask.enabled !== true || typeof mask.canvasW !== "number" || typeof mask.canvasH !== "number") return false;
  const canvasW = mask.canvasW;
  const canvasH = mask.canvasH;
  const marginPx = typeof mask.marginPx === "number" ? mask.marginPx : Math.min(canvasW, canvasH) * 0.04;
  const ox = -layerX;
  const oy = -layerY;
  ctx.beginPath();
  if (mask.shape === "circle") {
    const r = Math.max(1, Math.min(canvasW, canvasH) / 2 - marginPx);
    ctx.ellipse(ox + canvasW / 2, oy + canvasH / 2, r, r, 0, 0, Math.PI * 2);
    ctx.closePath();
    return true;
  }
  if (mask.shape === "heart") {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 180; i++) {
      const t = (i / 180) * Math.PI * 2;
      pts.push({
        x: 16 * Math.sin(t) ** 3,
        y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
      });
    }
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const srcW = Math.max(1, maxX - minX);
    const srcH = Math.max(1, maxY - minY);
    const scale = Math.min((canvasW - 2 * marginPx) / srcW, (canvasH - 2 * marginPx) / srcH);
    const px0 = (canvasW - srcW * scale) / 2 - minX * scale;
    const py0 = (canvasH - srcH * scale) / 2 - minY * scale;
    pts.forEach((pt, index) => {
      const x = ox + pt.x * scale + px0;
      const y = oy + pt.y * scale + py0;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    return true;
  }
  return false;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cloudPath(ctx: any, x: number, y: number, w: number, h: number): void {
  // Guard against degenerate dimensions
  if (w < 4 || h < 4) {
    ctx.rect(x, y, Math.max(w, 1), Math.max(h, 1));
    return;
  }
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Cloud built from 6 overlapping circles — robust and works at any size
  // All radii are relative to the smaller dimension
  const r = Math.min(w, h);
  const bumpR  = r * 0.22;   // top bumps
  const bodyRx = w * 0.36;   // main body half-width
  const bodyRy = h * 0.22;   // main body half-height
  const bodyY  = cy + h * 0.08; // center of body, slightly below center

  ctx.beginPath();
  // Main body (central rectangle-ish ellipse)
  ctx.ellipse(cx, bodyY, bodyRx, bodyRy, 0, 0, Math.PI * 2);
  ctx.closePath();
  ctx.beginPath();
  // Three bumps on top
  ctx.arc(cx - w * 0.22, bodyY - bodyRy * 0.6, bumpR * 0.9,  Math.PI, 0);
  ctx.arc(cx,             bodyY - bodyRy * 1.0, bumpR * 1.15, Math.PI, 0);
  ctx.arc(cx + w * 0.22,  bodyY - bodyRy * 0.6, bumpR * 0.9,  Math.PI, 0);
  // Connect bottom
  ctx.arc(cx + bodyRx * 0.7, bodyY, bodyRy, 0, Math.PI * 0.7);
  ctx.arc(cx,              bodyY + bodyRy * 0.9, bodyRx * 0.5, Math.PI * 0.2, Math.PI * 0.8);
  ctx.arc(cx - bodyRx * 0.7, bodyY, bodyRy, Math.PI * 0.3, Math.PI);
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

  // When this is a class-photo managed text layer (name/title/footer), use the stored
  // layer.width/height so align="center" centers within the frame or title container.
  // For all other text layers, always use measuredSize (natural fit).
  const isClassPhotoText =
    layer.metadata?.["classPhotoName"] !== undefined ||
    layer.metadata?.["classPhotoTitle"] !== undefined ||
    layer.metadata?.["classPhotoFooter"] !== undefined;
  const renderWidth = isClassPhotoText && layer.width > measuredSize.width ? layer.width : measuredSize.width;
  const renderHeight = isClassPhotoText && layer.height > measuredSize.height ? layer.height : measuredSize.height;

  return (
    <Text
      id={layer.id}
      name={selected ? "selected-layer" : undefined}
      x={layer.x}
      y={layer.y}
      width={renderWidth}
      height={renderHeight}
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


type KonvaQuickAdjustment = {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  grayscale: boolean;
  blurRadius: number;
  hasAny: boolean;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function quickEditParamsToKonva(params: Record<string, unknown> | null | undefined): KonvaQuickAdjustment {
  const exposure = typeof params?.["exposure"] === "number" ? params["exposure"] : 0;
  const brightness = typeof params?.["brightness"] === "number" ? params["brightness"] : 0;
  const contrast = typeof params?.["contrast"] === "number" ? params["contrast"] : 0;
  const saturation = typeof params?.["saturation"] === "number" ? params["saturation"] : 0;
  const hue = typeof params?.["hue"] === "number" ? params["hue"] : 0;
  const blur = typeof params?.["blur"] === "number" ? params["blur"] : 0;
  const grayscale = params?.["black_white"] === true;

  const mappedBrightness = clampNumber(exposure / 175 + brightness / 220, -0.45, 0.45);
  const mappedContrast = clampNumber(contrast, -40, 40);
  const mappedSaturation = clampNumber(1 + saturation / 200, 0.7, 1.35);
  const mappedHue = clampNumber(hue, -45, 45);
  const mappedBlur = clampNumber(blur, 0, 8);

  return {
    brightness: mappedBrightness,
    contrast: mappedContrast,
    saturation: mappedSaturation,
    hue: mappedHue,
    grayscale,
    blurRadius: mappedBlur,
    hasAny:
      Math.abs(mappedBrightness) > 0.001 ||
      Math.abs(mappedContrast) > 0.001 ||
      Math.abs(mappedSaturation - 1) > 0.001 ||
      Math.abs(mappedHue) > 0.001 ||
      grayscale ||
      mappedBlur > 0
  };
}

function mergeKonvaAdjustments(
  base: { brightness?: number; contrast?: number; saturation?: number; hue?: number; grayscale?: boolean; hasAny?: boolean } | null | undefined,
  quick: KonvaQuickAdjustment
): KonvaQuickAdjustment {
  const brightness = clampNumber((base?.brightness ?? 0) + quick.brightness, -0.55, 0.55);
  const contrast = clampNumber((base?.contrast ?? 0) + quick.contrast, -55, 55);
  const saturation = clampNumber((base?.saturation ?? 1) * quick.saturation, 0.6, 1.6);
  const hue = clampNumber((base?.hue ?? 0) + quick.hue, -60, 60);
  const grayscale = Boolean(base?.grayscale) || quick.grayscale;

  return {
    brightness,
    contrast,
    saturation,
    hue,
    grayscale,
    blurRadius: quick.blurRadius,
    hasAny:
      Boolean(base?.hasAny) ||
      quick.hasAny ||
      Math.abs(brightness) > 0.001 ||
      Math.abs(contrast) > 0.001 ||
      Math.abs(saturation - 1) > 0.001 ||
      Math.abs(hue) > 0.001 ||
      grayscale
  };
}

// ─── Image Node (מצב חופשי — ImageLayer רגיל, ללא פריים/תא) ─────────────────
// All visual effects are applied here. This node is used in free-mode only.
// Frame/cell mode uses FrameNode which has its own effect rendering.

function ImageNode({
  layer,
  assets,
  selected,
  onSelect,
  onChange,
  onContextMenu
}: {
  layer: ImageLayer;
  assets: Asset[];
  selected: boolean;
  onSelect: (layerId: string) => void;
  onChange: (layer: VisualLayer) => void;
  onContextMenu?: (target: CanvasContextMenuTarget) => void;
}): React.ReactElement {
  // Lock layer & use live crop preview during image-edit mode
  const isBeingEdited = useImageEditStore((s) => s.imageEditMode && s.editingLayerId === layer.id);
  const cropPreviewFromStore = useImageEditStore((s) =>
    s.imageEditMode && s.editingLayerId === layer.id ? s.cropPreview : null
  );

  const asset = assets.find((item) => item.id === layer.assetId);
  const image = useKonvaImage(resolveCanvasAssetPath(asset));
  const imageRef = useRef<Konva.Image | null>(null);
  const maskedGroupRef = useRef<Konva.Group | null>(null);

  // Load mask asset if pixelMask is set
  const maskAsset = layer.pixelMask !== undefined
    ? assets.find((a) => a.id === layer.pixelMask!.assetId)
    : undefined;
  const maskImage = useKonvaImage(maskAsset !== undefined ? resolveCanvasAssetPath(maskAsset) : undefined);

  // Cache the masked group whenever image/mask changes so destination-in compositing works correctly
  useEffect(() => {
    const grp = maskedGroupRef.current;
    if (grp === null) return;
    if (image !== null && maskImage !== null && layer.pixelMask !== undefined) {
      grp.cache();
    } else {
      grp.clearCache();
    }
    grp.getLayer()?.batchDraw();
  }, [image, maskImage, layer.pixelMask, layer.width, layer.height]);

  const fx = useMemo(
    () => resolveFrameEffects(layer.visualEffects),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(layer.visualEffects)]
  );
  const softEdgeBlurRadius = fx.softEdge?.radius ?? 0;
  const colorAdj = imageEffectsToKonva(layer.effects);
  const blurRadius = Math.max(softEdgeBlurRadius, colorAdj.blurRadius);

  // Build the active filter list for this node.
  const activeFilters = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = [];
    if (blurRadius > 0) list.push(Konva.Filters.Blur);
    if (Math.abs(colorAdj.brightness) > 0.001) list.push(Konva.Filters.Brighten);
    if (Math.abs(colorAdj.contrast) > 0.001) list.push(Konva.Filters.Contrast);
    if (colorAdj.grayscale) list.push(Konva.Filters.Grayscale);
    if (!colorAdj.grayscale && (Math.abs(colorAdj.saturation - 1) > 0.001 || Math.abs(colorAdj.hue) > 0.001)) list.push(Konva.Filters.HSL);
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blurRadius, colorAdj.brightness, colorAdj.contrast, colorAdj.saturation, colorAdj.hue, colorAdj.grayscale]);

  const needsCache = activeFilters.length > 0;

  // Cache the node whenever filters are active, image changes, or dimensions change.
  // Dimensions must be in deps because Konva's cached bitmap is frozen at cache() time —
  // after a resize the cache would show the old size until re-cached.
  useEffect(() => {
    const node = imageRef.current;
    if (node === null || image === null) return;
    if (needsCache) {
      node.cache();
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsCache, image, layer.width, layer.height]);

  // Shadow on the outer Group — effects.shadow takes precedence over visualEffects dropShadow
  const shadowProps =
    colorAdj.shadow !== null
      ? colorAdj.shadow
      : fx.shadow !== undefined
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
    draggable: !layer.locked && !isBeingEdited,
    onClick: () => { if (!isBeingEdited) onSelect(layer.id); },
    onTap: () => { if (!isBeingEdited) onSelect(layer.id); },
    onContextMenu: (event: Konva.KonvaEventObject<PointerEvent>) => {
      event.evt.preventDefault();
      onContextMenu?.({
        layerId: layer.id,
        layerType: "image",
        hasImage: true,
        screenX: event.evt.clientX,
        screenY: event.evt.clientY
      });
    },
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

  // ─── Shape clip + flip from metadata ──────────────────────────────────────
  const imageShape = (layer.metadata["imageShape"] as string | undefined) ?? "rect";
  const cornerRadius = (layer.metadata["imageCornerRadius"] as number | undefined) ?? 0;
  const flipH = (layer.metadata["flipH"] as boolean | undefined) ?? false;
  const flipV = (layer.metadata["flipV"] as boolean | undefined) ?? false;

  const hasClip = imageShape !== "rect" || cornerRadius > 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageClipFunc = hasClip ? (ctx: any): void => {
    const w = layer.width;
    const h = layer.height;
    ctx.beginPath();
    if (imageShape === "circle" || imageShape === "ellipse") {
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else {
      const r = Math.min(cornerRadius, w / 2, h / 2);
      ctx.moveTo(r, 0);
      ctx.arcTo(w, 0, w, h, r);
      ctx.arcTo(w, h, 0, h, r);
      ctx.arcTo(0, h, 0, 0, r);
      ctx.arcTo(0, 0, w, 0, r);
      ctx.closePath();
    }
  } : undefined;

  // Flip via negative scale + offset compensation on the KonvaImage
  const imgX = flipH ? layer.width : 0;
  const imgY = flipV ? layer.height : 0;
  const imgScaleX = flipH ? -1 : 1;
  const imgScaleY = flipV ? -1 : 1;

  // Non-destructive crop: use live preview during edit mode, else stored crop
  const effectiveCrop = cropPreviewFromStore ?? layer.crop;
  const hasCrop = effectiveCrop.x > 0.001 || effectiveCrop.y > 0.001
    || effectiveCrop.width < 0.999 || effectiveCrop.height < 0.999;
  const cropProp = hasCrop && image !== null ? {
    crop: {
      x: effectiveCrop.x * image.naturalWidth,
      y: effectiveCrop.y * image.naturalHeight,
      width: effectiveCrop.width * image.naturalWidth,
      height: effectiveCrop.height * image.naturalHeight
    }
  } : {};

  const hasMask = layer.pixelMask !== undefined && maskImage !== null;

  const konvaImageNode = (
    <KonvaImage
      ref={imageRef}
      x={imgX}
      y={imgY}
      scaleX={imgScaleX}
      scaleY={imgScaleY}
      width={layer.width}
      height={layer.height}
      image={image ?? undefined}
      {...cropProp}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filters={activeFilters as any}
      blurRadius={blurRadius}
      brightness={colorAdj.brightness}
      contrast={colorAdj.contrast}
      saturation={colorAdj.saturation}
      hue={colorAdj.hue}
      stroke={colorAdj.outline !== null ? colorAdj.outline.stroke : (fx.stroke?.color)}
      strokeWidth={colorAdj.outline !== null ? colorAdj.outline.strokeWidth : (fx.stroke?.width ?? 0)}
      strokeEnabled={colorAdj.outline !== null ? colorAdj.outline.strokeEnabled : fx.stroke !== undefined}
    />
  );

  return (
    <Group {...groupCommon} {...shadowProps}>
      {/* Inner group clips to shape/corner-radius */}
      <Group clipFunc={imageClipFunc}>
        {hasMask ? (
          // Wrap image + mask in a cached Group so destination-in is isolated
          <Group ref={maskedGroupRef}>
            {konvaImageNode}
            <KonvaImage
              x={0}
              y={0}
              width={layer.width}
              height={layer.height}
              image={maskImage ?? undefined}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              globalCompositeOperation={"destination-in" as any}
              listening={false}
            />
          </Group>
        ) : konvaImageNode}
        {/* Color overlay */}
        {fx.colorOverlay !== undefined && (
          <Rect x={0} y={0} width={layer.width} height={layer.height} fill={fx.colorOverlay.color} opacity={fx.colorOverlay.opacity} globalCompositeOperation={mapBlendMode(fx.colorOverlay.blendMode) as "source-over"} listening={false} />
        )}
        {/* Gradient overlay */}
        {fx.gradientOverlay !== undefined && (
          <Rect x={0} y={0} width={layer.width} height={layer.height} {...gradientOverlayRectProps(fx.gradientOverlay, layer.width, layer.height)} opacity={fx.gradientOverlay.opacity} globalCompositeOperation={mapBlendMode(fx.gradientOverlay.blendMode) as "source-over"} listening={false} />
        )}
      </Group>
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
  onChange,
  onContextMenu
}: {
  layer: FrameLayer;
  assets: Asset[];
  selected: boolean;
  layoutEditMode: boolean;
  onSelect: (layerId: string) => void;
  onChange: (layer: VisualLayer) => void;
  onContextMenu?: (target: CanvasContextMenuTarget) => void;
}): React.ReactElement {
  const asset = assets.find((item) => item.id === layer.imageAssetId);
  const image = useKonvaImage(resolveCanvasAssetPath(asset));
  const blurRef = useRef<Konva.Image | null>(null);
  const fx = useMemo(
    () => resolveFrameEffects(layer.visualEffects),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(layer.visualEffects)]
  );
  const softEdgeBlurRadius = fx.softEdge?.radius ?? 0;
  const isGridCell = layer.metadata["gridCell"] !== undefined;
  const isMaskFrame = layer.metadata["maskFrame"] !== undefined;
  const collageFrameMeta = layer.metadata["collageFrame"] as { isCollageFrame?: boolean; layoutManaged?: boolean; slotType?: string; slotId?: string; slotShape?: string; vertices?: Array<{ x: number; y: number }>; edgeConfig?: CollageEdgeConfig; globalMask?: CollageGlobalMaskMeta } | undefined;
  const isCollageFrame = collageFrameMeta?.isCollageFrame === true;
  const isCollageEmpty = isCollageFrame && collageFrameMeta?.slotType === "empty";
  const collageSelectColor = "#22d3ee";

  // Colour adjustments stored in metadata by syncFrameLayersToPage / updateCollageImageAdjustments
  const rawCollageAdj = layer.metadata["collageColorAdj"] as CollageColorAdj | null | undefined;
  const baseFrameColorAdj = rawCollageAdj != null ? collageAdjToKonva(rawCollageAdj, undefined) : null;
  const quickFrameParams =
    (layer.metadata["imageEditParams"] as Record<string, unknown> | undefined) ??
    (layer.metadata["collageImageEditParams"] as Record<string, unknown> | undefined);
  const quickFrameAdj = quickEditParamsToKonva(quickFrameParams);
  const frameColorAdj = mergeKonvaAdjustments(baseFrameColorAdj, quickFrameAdj);
  const blurRadius = Math.max(softEdgeBlurRadius, frameColorAdj.blurRadius);

  // Edge config mirrored from collage assignment
  const collageEdgeConfig = layer.metadata["collageEdgeConfig"] as CollageEdgeConfig | null | undefined;

  const frameNeedsCache = blurRadius > 0 || frameColorAdj.hasAny;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frameFilters = useMemo((): any[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = [];
    if (blurRadius > 0) list.push(Konva.Filters.Blur);
    if (Math.abs(frameColorAdj.brightness) > 0.001) list.push(Konva.Filters.Brighten);
    if (Math.abs(frameColorAdj.contrast) > 0.001) list.push(Konva.Filters.Contrast);
    if (frameColorAdj.grayscale) list.push(Konva.Filters.Grayscale);
    if (!frameColorAdj.grayscale && (Math.abs(frameColorAdj.saturation - 1) > 0.001 || Math.abs(frameColorAdj.hue) > 0.001)) list.push(Konva.Filters.HSL);
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blurRadius, frameColorAdj.brightness, frameColorAdj.contrast, frameColorAdj.saturation, frameColorAdj.hue, frameColorAdj.grayscale]);

  useEffect(() => {
    const node = blurRef.current;
    if (node === null || image === null) return;
    if (frameNeedsCache) { node.cache(); } else { node.clearCache(); }
    node.getLayer()?.batchDraw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameNeedsCache, image, layer.width, layer.height]);

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

  // Puzzle tabs from collage frame metadata
  const puzzleTabs = (layer.metadata["collageFrame"] as Record<string, unknown> | undefined)?.["puzzleTabs"] as
    import("@/types/collage").PuzzleTabs | undefined;

  const slotId = (layer.metadata["collageFrame"] as Record<string, unknown> | undefined)?.["slotId"] as string | undefined;
  const collageSlotShape = collageFrameMeta?.slotShape;
  const collageVertices = collageFrameMeta?.vertices;
  const collageGlobalMask = collageFrameMeta?.globalMask;
  const [swapAnchorHovered, setSwapAnchorHovered] = useState(false);
  const [activeSwapSlotId, setActiveSwapSlotId] = useState<string | null>(null);

  useEffect(() => {
    function handleSwapModeChange(event: Event): void {
      const detail = (event as CustomEvent<{ slotId?: string | null }>).detail;
      setActiveSwapSlotId(detail?.slotId ?? null);
    }
    window.addEventListener("spp2:collage-swap-mode-change", handleSwapModeChange);
    return () => window.removeEventListener("spp2:collage-swap-mode-change", handleSwapModeChange);
  }, []);

  function handleCollageSwapAnchor(event: Konva.KonvaEventObject<MouseEvent>): void {
    event.cancelBubble = true;
    if (!slotId) return;
    window.dispatchEvent(new CustomEvent("spp2:collage-slot-anchor-click", { detail: { slotId } }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clipFunc = (ctx: any): void => {
    const pad = layer.padding;
    const w = Math.max(1, layer.width - pad * 2);
    const h = Math.max(1, layer.height - pad * 2);

    if (collageGlobalMask != null && drawGlobalMaskPath(ctx, collageGlobalMask, layer.x, layer.y)) {
      return;
    }

    if (layer.shape === "puzzle" && puzzleTabs) {
      drawPuzzlePath(ctx, pad, pad, w, h, puzzleTabs);
      return;
    }

    // Torn paper edge style: replace clip with jagged polygon
    if (collageEdgeConfig?.style === "tornPaper") {
      const roughness = collageEdgeConfig.tornPaperRoughness ?? 1;
      const seed = collageEdgeConfig.tornPaperSeed ?? 42;
      const sides = collageEdgeConfig.softEdgeSides ?? ["top", "right", "bottom", "left"] as import("@/core/collage/collageTornPaper").EdgeSide[];
      const pts = generateTornEdgePoints(w, h, sides, roughness, seed, slotId ?? "");
      ctx.beginPath();
      if (pts.length >= 2) {
        ctx.moveTo(pad + pts[0], pad + pts[1]);
        for (let i = 2; i < pts.length; i += 2) {
          ctx.lineTo(pad + pts[i], pad + pts[i + 1]);
        }
        ctx.closePath();
      }
      return;
    }

    // Outline circle: force circle clip regardless of slot shape
    if (collageEdgeConfig?.style === "outlineCircle") {
      ctx.beginPath();
      ctx.ellipse(pad + w / 2, pad + h / 2, Math.min(w, h) / 2, Math.min(w, h) / 2, 0, 0, Math.PI * 2);
      return;
    }

    ctx.beginPath();
    if ((collageSlotShape === "polygon" || collageSlotShape === "diagonalPolygon") && Array.isArray(collageVertices) && collageVertices.length >= 3) {
      collageVertices.forEach((vertex, index) => {
        const px = pad + Math.max(0, Math.min(1, vertex.x)) * w;
        const py = pad + Math.max(0, Math.min(1, vertex.y)) * h;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    } else if (collageSlotShape === "heart") {
      heartPath(ctx, pad, pad, w, h);
    } else if (layer.shape === "circle" || layer.shape === "ellipse" || collageSlotShape === "circle" || collageSlotShape === "ellipse") {
      ctx.ellipse(pad + w / 2, pad + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (layer.shape === "svgPath" && maskShape(layer) === "star") {
      starPath(ctx, pad + w / 2, pad + h / 2, Math.min(w, h) / 2, Math.min(w, h) / 4);
    } else if (layer.shape === "svgPath" && maskShape(layer) === "heart") {
      heartPath(ctx, pad, pad, w, h);
    } else if (layer.shape === "svgPath" && maskShape(layer) === "cloud") {
      cloudPath(ctx, pad, pad, w, h);
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

  const handleFrameContextMenu = (event: Konva.KonvaEventObject<PointerEvent>): void => {
    event.evt.preventDefault();
    onContextMenu?.({
      layerId: layer.id,
      layerType: "frame",
      hasImage: image !== null,
      screenX: event.evt.clientX,
      screenY: event.evt.clientY
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
      onContextMenu={handleFrameContextMenu}
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filters={frameFilters as any}
            blurRadius={blurRadius}
            brightness={frameColorAdj.brightness}
            contrast={frameColorAdj.contrast}
            saturation={frameColorAdj.saturation}
            hue={frameColorAdj.hue}
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

      {/* Collage swap anchor: hidden by default. Hover the center point to reveal it; after choosing the first cell, all other anchors appear. */}
      {isCollageFrame && image !== null && !isCollageEmpty && (
        <>
          <Circle
            x={layer.width / 2}
            y={layer.height / 2}
            radius={Math.max(44, Math.min(180, Math.min(layer.width, layer.height) * 0.32))}
            fill="rgba(0,0,0,0.001)"
            stroke="transparent"
            onMouseEnter={(event) => { setSwapAnchorHovered(true); const container = event.target.getStage()?.container(); if (container) container.style.cursor = "pointer"; }}
            onMouseLeave={(event) => { setSwapAnchorHovered(false); const container = event.target.getStage()?.container(); if (container) container.style.cursor = "default"; }}
            onClick={handleCollageSwapAnchor}
            onTap={(event) => handleCollageSwapAnchor(event as unknown as Konva.KonvaEventObject<MouseEvent>)}
          />
          {(swapAnchorHovered || activeSwapSlotId !== null) && (
            <Circle
              x={layer.width / 2}
              y={layer.height / 2}
              radius={Math.max(24, Math.min(48, Math.min(layer.width, layer.height) * 0.15))}
              fill={activeSwapSlotId === slotId ? "rgba(124,111,224,0.96)" : "rgba(34,211,238,0.92)"}
              stroke="#ffffff"
              strokeWidth={3}
              shadowColor="rgba(0,0,0,0.42)"
              shadowBlur={12}
              shadowOpacity={0.6}
              listening={false}
            />
          )}
        </>
      )}

      {/* Collage/Grid/Mask cell: boundary box with zoom handles instead of fill highlight */}
      {(isCollageFrame || isGridCell || isMaskFrame) && selected && image !== null && (
        <ContentZoomHandles
          layer={layer}
          image={image}
          collageSelectColor={collageSelectColor}
          cornerRadius={cornerRadius}
          onChange={onChange}
        />
      )}
      {/* Collage empty cell selected indicator */}
      {isCollageFrame && selected && image === null && (
        <Rect x={0} y={0} width={layer.width} height={layer.height} fill="transparent" stroke={collageSelectColor} strokeWidth={2.5} cornerRadius={cornerRadius} listening={false} />
      )}
    </Group>
  );
}


// --- Content Zoom Handles ---
// Shows a boundary box with corner handles that zoom the image within a cell.

const HANDLE_SIZE = 10;
const HANDLE_HALF = HANDLE_SIZE / 2;

interface ContentZoomHandlesProps {
  layer: FrameLayer;
  image: HTMLImageElement;
  collageSelectColor: string;
  cornerRadius: number;
  onChange: (layer: VisualLayer) => void;
}

// Handles are placed OUTSIDE the frame so image content drag is never blocked.
// Each handle sits fully outside its corner:
//   TL → (-SIZE, -SIZE)   TR → (w, -SIZE)
//   BL → (-SIZE, h)       BR → (w,  h)
const HANDLE_OUTSIDE = HANDLE_SIZE; // how far outside the frame the handle sits

function ContentZoomHandles({ layer, image, collageSelectColor, cornerRadius, onChange }: ContentZoomHandlesProps): React.ReactElement {
  const dragStartRef = useRef<{ scale: number } | null>(null);

  // Anchor = frame corner; handle placed fully outside
  const corners = [
    { key: "tl", ax: 0,           ay: 0,            hx: -HANDLE_OUTSIDE, hy: -HANDLE_OUTSIDE },
    { key: "tr", ax: layer.width,  ay: 0,            hx: layer.width,      hy: -HANDLE_OUTSIDE },
    { key: "bl", ax: 0,           ay: layer.height,  hx: -HANDLE_OUTSIDE, hy: layer.height },
    { key: "br", ax: layer.width,  ay: layer.height,  hx: layer.width,      hy: layer.height },
  ] as const;

  function onDragStart(): void {
    dragStartRef.current = { scale: layer.contentTransform.scale };
  }

  function onDragMove(e: Konva.KonvaEventObject<DragEvent>, ax: number, ay: number, hx: number, hy: number): void {
    e.cancelBubble = true;
    const node = e.target;
    const start = dragStartRef.current;
    if (start === null) return;

    // Drag delta from handle's resting position
    const dx = node.x() - hx;
    const dy = node.y() - hy;
    const fw = layer.width;
    const fh = layer.height;
    const diag = Math.sqrt(fw * fw + fh * fh) / 2;
    // Direction: from center toward anchor corner
    const dirX = (ax - fw / 2) / diag;
    const dirY = (ay - fh / 2) / diag;
    const projection = dx * dirX + dy * dirY;

    const newScale = Math.max(0.5, Math.min(8, start.scale + projection * 0.004));
    const clamped = clampContentTransformToFillBounds(
      { ...layer.contentTransform, scale: newScale },
      layer.width, layer.height,
      image.naturalWidth, image.naturalHeight,
      layer.fitMode, layer.padding
    );
    onChange({ ...layer, contentTransform: clamped });
    // Snap handle back to resting position during drag so the image zooms in place
    node.x(hx);
    node.y(hy);
  }

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>, hx: number, hy: number): void {
    e.cancelBubble = true;
    e.target.x(hx);
    e.target.y(hy);
    dragStartRef.current = null;
  }

  return (
    <>
      {/* Dashed boundary box — listening=false so image drag is never blocked */}
      <Rect
        x={0} y={0}
        width={layer.width} height={layer.height}
        fill="transparent"
        stroke={collageSelectColor}
        strokeWidth={2}
        dash={[5, 3]}
        cornerRadius={cornerRadius}
        listening={false}
      />
      {/* Zoom handles — fully OUTSIDE the frame, never overlap image area */}
      {corners.map(({ key, ax, ay, hx, hy }) => (
        <Rect
          key={key}
          x={hx}
          y={hy}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          fill="#fff"
          stroke={collageSelectColor}
          strokeWidth={2}
          cornerRadius={2}
          draggable
          onDragStart={onDragStart}
          onDragMove={(e) => onDragMove(e, ax, ay, hx, hy)}
          onDragEnd={(e) => onDragEnd(e, hx, hy)}
        />
      ))}
    </>
  );
}

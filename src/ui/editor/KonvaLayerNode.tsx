import { Image as KonvaImage, Rect, Text } from "react-konva";
import type Konva from "konva";
import { measureTextLayerSize } from "@/core/text/measurement";
import type { Asset } from "@/types/document";
import type { FrameLayer, TextLayer, VisualLayer } from "@/types/layers";
import { useKonvaImage } from "./useKonvaImage";

interface KonvaLayerNodeProps {
  layer: VisualLayer;
  assets: Asset[];
  selected: boolean;
  onSelect: (layerId: string) => void;
  onChange: (layer: VisualLayer) => void;
  onBeginTextEdit: (layerId: string) => void;
}

export function KonvaLayerNode({
  layer,
  assets,
  selected,
  onSelect,
  onChange,
  onBeginTextEdit
}: KonvaLayerNodeProps): React.ReactElement | null {
  if (layer.type === "text") {
    return <TextNode layer={layer} selected={selected} onBeginTextEdit={onBeginTextEdit} onChange={onChange} onSelect={onSelect} />;
  }

  if (layer.type === "frame") {
    return <FrameNode layer={layer} assets={assets} selected={selected} onChange={onChange} onSelect={onSelect} />;
  }

  return null;
}

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
  const gradientProps = gradientFillProps(layer);
  const shadow = layer.shadow;
  const stroke = layer.stroke;
  const measuredSize = measureTextLayerSize(layer);
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
      shadowColor={shadow?.color}
      shadowBlur={shadow?.blur ?? 0}
      shadowOffsetX={shadow?.offsetX ?? 0}
      shadowOffsetY={shadow?.offsetY ?? 0}
      shadowOpacity={shadow?.opacity ?? 0}
      lineHeight={layer.lineHeight}
      letterSpacing={layer.letterSpacing}
      align={layer.alignment}
      direction={layer.direction === "auto" ? "rtl" : layer.direction}
      draggable={!layer.locked}
      rotation={layer.rotation}
      opacity={layer.opacity}
      visible={layer.visible}
      onClick={() => onSelect(layer.id)}
      onDblClick={() => onBeginTextEdit(layer.id)}
      onTap={() => onSelect(layer.id)}
      onDragEnd={(event) => {
        onChange({
          ...layer,
          x: event.target.x(),
          y: event.target.y()
        });
      }}
      onTransformEnd={(event) => {
        const node = event.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const fontScale = Math.max(0.1, (Math.abs(scaleX) + Math.abs(scaleY)) / 2);
        node.scaleX(1);
        node.scaleY(1);
        const nextFontSize = Math.max(4, Math.round(layer.fontSize * fontScale));
        const nextLayer = {
          ...layer,
          fontSize: nextFontSize,
          x: node.x(),
          y: node.y(),
          rotation: node.rotation()
        };
        const nextSize = measureTextLayerSize(nextLayer);
        onChange({
          ...nextLayer,
          width: nextSize.width,
          height: nextSize.height
        });
      }}
    />
  );
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
  if (!color.startsWith("#")) {
    return color;
  }
  const normalized = color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color;
  if (normalized.length !== 7) {
    return color;
  }
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`;
}

function FrameNode({
  layer,
  assets,
  selected,
  onSelect,
  onChange
}: {
  layer: FrameLayer;
  assets: Asset[];
  selected: boolean;
  onSelect: (layerId: string) => void;
  onChange: (layer: VisualLayer) => void;
}): React.ReactElement {
  const asset = assets.find((item) => item.id === layer.imageAssetId);
  const image = useKonvaImage(asset?.previewPath);
  const common = {
    id: layer.id,
    name: selected ? "selected-layer" : undefined,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: !layer.locked && !layer.lockedFrame,
    onClick: () => onSelect(layer.id),
    onTap: () => onSelect(layer.id),
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      onChange({
        ...layer,
        x: event.target.x(),
        y: event.target.y()
      });
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
        width: Math.max(24, node.width() * scaleX),
        height: Math.max(24, node.height() * scaleY),
        rotation: node.rotation()
      });
    }
  };

  if (image !== null) {
    return (
      <KonvaImage
        {...common}
        image={image}
        crop={layer.fitMode === "fill" ? coverCrop(image, layer.width, layer.height) : undefined}
      />
    );
  }

  return (
    <Rect
      {...common}
      fill="#e6e3df"
      stroke="#b8b2aa"
      strokeWidth={selected ? 3 : 1}
      dash={[8, 8]}
      cornerRadius={layer.shape === "circle" ? Math.min(layer.width, layer.height) / 2 : (layer.cornerRadius ?? 2)}
    />
  );
}

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function coverCrop(image: HTMLImageElement, targetWidth: number, targetHeight: number): CropBox {
  const imageRatio = image.width / image.height;
  const targetRatio = targetWidth / targetHeight;
  if (targetRatio >= imageRatio) {
    const height = image.width / targetRatio;
    return {
      x: 0,
      y: (image.height - height) / 2,
      width: image.width,
      height
    };
  }
  const width = image.height * targetRatio;
  return {
    x: (image.width - width) / 2,
    y: 0,
    width,
    height: image.height
  };
}

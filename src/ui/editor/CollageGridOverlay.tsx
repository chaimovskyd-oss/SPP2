import { useRef, useState, type ReactElement } from "react";
import { Stage, Layer, Line as KonvaLine, Rect as KonvaRect, Text as KonvaText } from "react-konva";
import type Konva from "konva";
import type { CollageRule, CollageSlot } from "@/types/collage";
import type { Page } from "@/types/document";
import type { ViewportStore } from "@/state/viewportStore";

interface CollageGridOverlayProps {
  rule: CollageRule;
  page: Page;
  viewport: ViewportStore;
  onUpdateSlots: (newSlots: CollageSlot[]) => void;
}

const DIVIDER_COLOR = "#22d3ee";
const CELL_HIGHLIGHT = "rgba(34,211,238,0.08)";
const EPSILON = 0.005;

interface SlotDivider {
  id: string;
  direction: "H" | "V";
  position: number;
  start: number;
  end: number;
  leftIds: string[];
  rightIds: string[];
}

function extractDividers(slots: CollageSlot[]): SlotDivider[] {
  const dividers: SlotDivider[] = [];
  const seen = new Set<string>();

  for (const s1 of slots) {
    for (const s2 of slots) {
      if (s1.id === s2.id) continue;

      const vPos = s1.x + s1.w;
      if (Math.abs(vPos - s2.x) < EPSILON) {
        const oS = Math.max(s1.y, s2.y);
        const oE = Math.min(s1.y + s1.h, s2.y + s2.h);
        if (oE - oS > EPSILON) {
          const key = `H:${vPos.toFixed(3)}`;
          if (!seen.has(key)) {
            seen.add(key);
            const left = slots.filter((s) => Math.abs((s.x + s.w) - vPos) < EPSILON);
            const right = slots.filter((s) => Math.abs(s.x - vPos) < EPSILON);
            const allY = [...left, ...right].flatMap((s) => [s.y, s.y + s.h]);
            dividers.push({ id: key, direction: "H", position: vPos, start: Math.min(...allY), end: Math.max(...allY), leftIds: left.map((s) => s.id), rightIds: right.map((s) => s.id) });
          }
        }
      }

      const hPos = s1.y + s1.h;
      if (Math.abs(hPos - s2.y) < EPSILON) {
        const oS = Math.max(s1.x, s2.x);
        const oE = Math.min(s1.x + s1.w, s2.x + s2.w);
        if (oE - oS > EPSILON) {
          const key = `V:${hPos.toFixed(3)}`;
          if (!seen.has(key)) {
            seen.add(key);
            const top = slots.filter((s) => Math.abs((s.y + s.h) - hPos) < EPSILON);
            const bottom = slots.filter((s) => Math.abs(s.y - hPos) < EPSILON);
            const allX = [...top, ...bottom].flatMap((s) => [s.x, s.x + s.w]);
            dividers.push({ id: key, direction: "V", position: hPos, start: Math.min(...allX), end: Math.max(...allX), leftIds: top.map((s) => s.id), rightIds: bottom.map((s) => s.id) });
          }
        }
      }
    }
  }
  return dividers;
}

function applyDividerMove(slots: CollageSlot[], divider: SlotDivider, newPos: number): CollageSlot[] {
  const clamped = Math.max(0.05, Math.min(0.95, newPos));
  const delta = clamped - divider.position;
  return slots.map((slot) => {
    if (divider.direction === "H") {
      if (divider.leftIds.includes(slot.id)) return { ...slot, w: Math.max(0.02, slot.w + delta) };
      if (divider.rightIds.includes(slot.id)) return { ...slot, x: slot.x + delta, w: Math.max(0.02, slot.w - delta) };
    } else {
      if (divider.leftIds.includes(slot.id)) return { ...slot, h: Math.max(0.02, slot.h + delta) };
      if (divider.rightIds.includes(slot.id)) return { ...slot, y: slot.y + delta, h: Math.max(0.02, slot.h - delta) };
    }
    return slot;
  });
}

export function CollageGridOverlay({ rule, page, viewport, onUpdateSlots }: CollageGridOverlayProps): ReactElement {
  const [activeDivider, setActiveDivider] = useState<string | null>(null);
  const dragSlotsRef = useRef<CollageSlot[]>(rule.cachedSlots);

  const baseScale = Math.min(0.42, 720 / page.height, 820 / page.width);
  const scale = baseScale * viewport.zoom;
  const stageW = Math.round(page.width * scale);
  const stageH = Math.round(page.height * scale);

  const slots = rule.cachedSlots;
  const dividers = extractDividers(slots);

  function handleDividerDragStart(id: string): void {
    setActiveDivider(id);
    dragSlotsRef.current = rule.cachedSlots;
  }

  function handleDividerDragMove(divider: SlotDivider, e: Konva.KonvaEventObject<DragEvent>): void {
    const node = e.target;
    let newPos: number;
    if (divider.direction === "H") {
      newPos = node.x() / page.width;
      node.y(divider.start * page.height); // constrain vertical movement
    } else {
      newPos = node.y() / page.height;
      node.x(divider.start * page.width); // constrain horizontal movement
    }
    const newSlots = applyDividerMove(dragSlotsRef.current, divider, newPos);
    dragSlotsRef.current = newSlots;
    onUpdateSlots(newSlots);
  }

  function handleDividerDragEnd(divider: SlotDivider, e: Konva.KonvaEventObject<DragEvent>): void {
    const node = e.target;
    let newPos: number;
    if (divider.direction === "H") {
      newPos = node.x() / page.width;
    } else {
      newPos = node.y() / page.height;
    }
    const newSlots = applyDividerMove(dragSlotsRef.current, divider, newPos);
    onUpdateSlots(newSlots);
    setActiveDivider(null);
  }

  return (
    <Stage
      width={stageW}
      height={stageH}
      scaleX={scale}
      scaleY={scale}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: activeDivider !== null ? "auto" : "auto" }}
    >
      <Layer>
        {/* Cell highlight rects */}
        {slots.map((slot) => (
          <KonvaRect
            key={slot.id}
            x={slot.x * page.width}
            y={slot.y * page.height}
            width={slot.w * page.width}
            height={slot.h * page.height}
            fill={CELL_HIGHLIGHT}
            stroke={DIVIDER_COLOR}
            strokeWidth={1.5 / scale}
            listening={false}
          />
        ))}

        {/* Slot labels */}
        {slots.map((slot, i) => (
          <KonvaText
            key={`label-${slot.id}`}
            x={slot.x * page.width + 6 / scale}
            y={slot.y * page.height + 6 / scale}
            text={`תא ${i + 1}`}
            fontSize={11 / scale}
            fill={DIVIDER_COLOR}
            listening={false}
          />
        ))}

        {/* Draggable dividers */}
        {dividers.map((d) => {
          const isH = d.direction === "H";
          const px = isH ? d.position * page.width : d.start * page.width;
          const py = isH ? d.start * page.height : d.position * page.height;
          const pts = isH
            ? [0, 0, 0, (d.end - d.start) * page.height]
            : [0, 0, (d.end - d.start) * page.width, 0];

          return (
            <KonvaLine
              key={d.id}
              x={px}
              y={py}
              points={pts}
              stroke={activeDivider === d.id ? "#f59e0b" : DIVIDER_COLOR}
              strokeWidth={activeDivider === d.id ? 4 / scale : 3 / scale}
              hitStrokeWidth={20 / scale}
              draggable
              dragBoundFunc={(pos) => {
                if (isH) return { x: pos.x, y: py * scale };
                return { x: px * scale, y: pos.y };
              }}
              onDragStart={() => handleDividerDragStart(d.id)}
              onDragMove={(e) => handleDividerDragMove(d, e)}
              onDragEnd={(e) => handleDividerDragEnd(d, e)}
              onMouseEnter={(e) => { (e.target.getStage()?.container() as HTMLElement | undefined)?.style.setProperty("cursor", isH ? "ew-resize" : "ns-resize"); }}
              onMouseLeave={(e) => { (e.target.getStage()?.container() as HTMLElement | undefined)?.style.setProperty("cursor", "default"); }}
            />
          );
        })}
      </Layer>
    </Stage>
  );
}

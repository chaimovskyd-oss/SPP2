import { Ellipse, Group, Line, Rect } from "react-konva";
import type { FrameLayer } from "@/types/layers";
import { SCREEN_HELPER_NODE_NAME } from "@/ui/editor/canvasNodeNames";

interface PassportGuidelinesOverlayProps {
  frames: FrameLayer[];
  scale: number;
}

export function PassportGuidelinesOverlay({ frames, scale }: PassportGuidelinesOverlayProps): React.ReactElement | null {
  if (frames.length === 0) return null;
  const strokeWidth = 1.4 / scale;
  const dash = [7 / scale, 5 / scale];
  return (
    <>
      {frames.map((frame) => {
        const innerX = frame.x + frame.padding;
        const innerY = frame.y + frame.padding;
        const innerW = Math.max(1, frame.width - frame.padding * 2);
        const innerH = Math.max(1, frame.height - frame.padding * 2);
        const cx = innerX + innerW / 2;
        const faceRx = innerW * 0.25;
        const faceRy = innerH * 0.33;
        const headTopY = innerY + innerH * 0.12;
        const eyeY = innerY + innerH * 0.42;
        const chinY = innerY + innerH * 0.78;
        const shoulderY = innerY + innerH * 0.76;
        return (
          <Group key={frame.id} name={SCREEN_HELPER_NODE_NAME} listening={false}>
            <Rect
              x={innerX + innerW * 0.05}
              y={innerY + innerH * 0.05}
              width={innerW * 0.9}
              height={innerH * 0.9}
              fill="rgba(47, 134, 255, 0.06)"
              stroke="rgba(80, 180, 255, 0.62)"
              strokeWidth={strokeWidth}
              dash={dash}
            />
            <Ellipse
              x={cx}
              y={innerY + innerH * 0.46}
              radiusX={faceRx}
              radiusY={faceRy}
              stroke="rgba(255, 255, 255, 0.82)"
              strokeWidth={strokeWidth}
              dash={dash}
            />
            <Line points={[cx, innerY, cx, innerY + innerH]} stroke="rgba(255,255,255,0.55)" strokeWidth={strokeWidth} dash={dash} />
            <Line points={[innerX, headTopY, innerX + innerW, headTopY]} stroke="rgba(52,211,153,0.72)" strokeWidth={strokeWidth} />
            <Line points={[innerX, eyeY, innerX + innerW, eyeY]} stroke="rgba(250,204,21,0.76)" strokeWidth={strokeWidth} />
            <Line points={[innerX, chinY, innerX + innerW, chinY]} stroke="rgba(52,211,153,0.72)" strokeWidth={strokeWidth} />
            <Line points={[innerX + innerW * 0.18, shoulderY, cx, innerY + innerH * 0.66, innerX + innerW * 0.82, shoulderY]} stroke="rgba(255,255,255,0.42)" strokeWidth={strokeWidth} dash={dash} tension={0.35} />
          </Group>
        );
      })}
    </>
  );
}

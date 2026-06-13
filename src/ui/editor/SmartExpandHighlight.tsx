import { useEffect, useState, type ReactElement } from "react";
import { Image as KonvaImage } from "react-konva";

import { useSmartExpandStore } from "@/state/smartExpandStore";
import { SCREEN_HELPER_NODE_NAME } from "./canvasNodeNames";

/**
 * Soft tekhelet tint over the empty canvas regions that Smart Canvas Fill
 * ("הרחבה חכמה") will complete. Visible only while the popup is open; tagged
 * as a screen helper so exports/rasterisation never include it.
 */
export function SmartExpandHighlight({ width, height }: { width: number; height: number }): ReactElement | null {
  const dataUrl = useSmartExpandStore((s) => s.highlightDataUrl);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (dataUrl === null) {
      setImage(null);
      return;
    }
    let cancelled = false;
    const el = new window.Image();
    el.onload = () => {
      if (!cancelled) setImage(el);
    };
    el.src = dataUrl;
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  if (image === null) return null;
  return (
    <KonvaImage
      name={SCREEN_HELPER_NODE_NAME}
      image={image}
      x={0}
      y={0}
      width={width}
      height={height}
      listening={false}
    />
  );
}

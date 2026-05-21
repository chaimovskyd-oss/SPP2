import { useEffect, useState } from "react";
import { markDebugImageError, markDebugImageLoaded, registerDebugImageLoad } from "@/debug/sppDiagnostics";

export function useKonvaImage(src: string | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (src === undefined || src.length === 0) {
      setImage(null);
      return;
    }

    let active = true;
    const debugImage = registerDebugImageLoad(src);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (debugImage !== null) markDebugImageLoaded(debugImage.id);
      if (active) {
        setImage(img);
      }
    };
    img.onerror = () => {
      if (debugImage !== null) markDebugImageError(debugImage.id);
    };
    img.src = src;

    return () => {
      active = false;
      img.onload = null;
      img.onerror = null;
      img.src = "";
      debugImage?.cleanup();
    };
  }, [src]);

  return image;
}

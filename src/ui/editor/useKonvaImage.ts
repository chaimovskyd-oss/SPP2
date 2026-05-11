import { useEffect, useState } from "react";

export function useKonvaImage(src: string | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (src === undefined || src.length === 0) {
      setImage(null);
      return;
    }

    let active = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (active) {
        setImage(img);
      }
    };
    img.src = src;

    return () => {
      active = false;
    };
  }, [src]);

  return image;
}

import type { CollageSlot } from "@/types/collage";

const HERO_COLOR = "#7c6fe0";
const STANDARD_COLOR = "#a8b2c8";
const ACCENT_COLOR = "#5ec4e0";
const EMPTY_COLOR = "#e8eaf0";

export function generateCollageSvgThumbnail(slots: CollageSlot[], w = 160, h = 120): string {
  const rects = slots
    .map((slot) => {
      const x = slot.x * w;
      const y = slot.y * h;
      const sw = slot.w * w;
      const sh = slot.h * h;
      const rx = slot.shape === "rounded" ? Math.min(sw, sh) * (slot.shapeParams.cornerRadius ?? 0.08) : 0;

      if (slot.type === "empty") {
        return `<rect x="${f(x)}" y="${f(y)}" width="${f(sw)}" height="${f(sh)}" rx="${f(rx)}" fill="${EMPTY_COLOR}" stroke="#bbbdc8" stroke-width="1" stroke-dasharray="4 3"/>`;
      }

      const fill = slot.role === "hero" ? HERO_COLOR : slot.role === "accent" ? ACCENT_COLOR : STANDARD_COLOR;
      return `<rect x="${f(x)}" y="${f(y)}" width="${f(sw)}" height="${f(sh)}" rx="${f(rx)}" fill="${fill}" opacity="0.85"/>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;border-radius:4px;overflow:hidden">
  <rect width="${w}" height="${h}" fill="#f0f1f5"/>
  ${rects}
</svg>`;
}

function f(n: number): string {
  return n.toFixed(2);
}

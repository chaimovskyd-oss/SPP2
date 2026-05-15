import type { CollageSlot } from "@/types/collage";

const HERO_COLOR = "#7c6fe0";
const STANDARD_COLOR = "#a8b2c8";
const ACCENT_COLOR = "#5ec4e0";
const EMPTY_COLOR = "#e8eaf0";

export function generateCollageSvgThumbnail(slots: CollageSlot[], w = 160, h = 120): string {
  const shapes = slots
    .map((slot) => renderSlotSvg(slot, w, h))
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;border-radius:4px;overflow:hidden">
  <rect width="${w}" height="${h}" fill="#f0f1f5"/>
  ${shapes}
</svg>`;
}

function renderSlotSvg(slot: CollageSlot, thumbW: number, thumbH: number): string {
  const x = slot.x * thumbW;
  const y = slot.y * thumbH;
  const sw = slot.w * thumbW;
  const sh = slot.h * thumbH;
  const fill = slot.type === "empty"
    ? EMPTY_COLOR
    : slot.role === "hero"
      ? HERO_COLOR
      : slot.role === "accent"
        ? ACCENT_COLOR
        : STANDARD_COLOR;
  const opacity = slot.type === "empty" ? "1" : "0.85";
  const stroke = slot.type === "empty" ? ` stroke="#bbbdc8" stroke-width="1" stroke-dasharray="4 3"` : "";

  if ((slot.shape === "polygon" || slot.shape === "diagonalPolygon") && slot.shapeParams.vertices && slot.shapeParams.vertices.length >= 3) {
    const points = slot.shapeParams.vertices
      .map((v) => `${f(x + v.x * sw)},${f(y + v.y * sh)}`)
      .join(" ");
    return `<polygon points="${points}" fill="${fill}" opacity="${opacity}"${stroke}/>`;
  }

  if (slot.shape === "circle" || slot.shape === "ellipse") {
    return `<ellipse cx="${f(x + sw / 2)}" cy="${f(y + sh / 2)}" rx="${f(sw / 2)}" ry="${f(sh / 2)}" fill="${fill}" opacity="${opacity}"${stroke}/>`;
  }

  if (slot.shape === "heart") {
    return `<path d="${heartPathData(x, y, sw, sh)}" fill="${fill}" opacity="${opacity}"${stroke}/>`;
  }

  const rx = slot.shape === "rounded" ? Math.min(sw, sh) * (slot.shapeParams.cornerRadius ?? 0.08) : 0;
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(sw)}" height="${f(sh)}" rx="${f(rx)}" fill="${fill}" opacity="${opacity}"${stroke}/>`;
}

function heartPathData(x: number, y: number, width: number, height: number): string {
  return [
    `M ${f(x + width / 2)} ${f(y + height * 0.92)}`,
    `C ${f(x + width * 0.05)} ${f(y + height * 0.62)}, ${f(x)} ${f(y + height * 0.28)}, ${f(x + width * 0.25)} ${f(y + height * 0.14)}`,
    `C ${f(x + width * 0.38)} ${f(y + height * 0.06)}, ${f(x + width * 0.5)} ${f(y + height * 0.16)}, ${f(x + width / 2)} ${f(y + height * 0.28)}`,
    `C ${f(x + width * 0.5)} ${f(y + height * 0.16)}, ${f(x + width * 0.62)} ${f(y + height * 0.06)}, ${f(x + width * 0.75)} ${f(y + height * 0.14)}`,
    `C ${f(x + width)} ${f(y + height * 0.28)}, ${f(x + width * 0.95)} ${f(y + height * 0.62)}, ${f(x + width / 2)} ${f(y + height * 0.92)}`,
    "Z",
  ].join(" ");
}

function f(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "0";
}

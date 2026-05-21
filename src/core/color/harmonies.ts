export type HarmonyScheme =
  | "complementary"
  | "analogous"
  | "triadic"
  | "splitComplement"
  | "monochromatic";

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  let v = hex.trim().replace(/^#/, "");
  if (v.length === 3) v = `${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16)
  };
}

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = parseHex(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
    else if (max === gn) h = ((bn - rn) / d + 2);
    else h = ((rn - gn) / d + 4);
    h *= 60;
  }
  return { h, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sc = clamp01(s);
  const lc = clamp01(l);
  const hc = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lc - 1)) * sc;
  const x = c * (1 - Math.abs(((hc / 60) % 2) - 1));
  const m = lc - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (hc < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (hc < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (hc < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (hc < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (hc < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  const toHex = (v: number): string => {
    const n = Math.round((v + m) * 255);
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0").toUpperCase();
  };
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function rotated(base: Hsl, deltaH: number, s?: number, l?: number): Hsl {
  return {
    h: base.h + deltaH,
    s: Math.max(0.05, Math.min(0.98, s ?? base.s)),
    l: l ?? base.l
  };
}

export function computeHarmony(baseHex: string, scheme: HarmonyScheme): string[] {
  const base = hexToHsl(baseHex);
  const baseSafe: Hsl = { h: base.h, s: Math.max(0.05, Math.min(0.98, base.s)), l: base.l };
  switch (scheme) {
    case "complementary":
      return [hslToHex(baseSafe), hslToHex(rotated(baseSafe, 180))];
    case "analogous":
      return [
        hslToHex(rotated(baseSafe, -30)),
        hslToHex(baseSafe),
        hslToHex(rotated(baseSafe, 30))
      ];
    case "triadic":
      return [
        hslToHex(baseSafe),
        hslToHex(rotated(baseSafe, 120)),
        hslToHex(rotated(baseSafe, 240))
      ];
    case "splitComplement":
      return [
        hslToHex(baseSafe),
        hslToHex(rotated(baseSafe, 150)),
        hslToHex(rotated(baseSafe, 210))
      ];
    case "monochromatic":
      return [
        hslToHex({ h: baseSafe.h, s: baseSafe.s, l: 0.25 }),
        hslToHex({ h: baseSafe.h, s: baseSafe.s, l: 0.40 }),
        hslToHex(baseSafe),
        hslToHex({ h: baseSafe.h, s: baseSafe.s, l: 0.70 }),
        hslToHex({ h: baseSafe.h, s: baseSafe.s, l: 0.85 })
      ];
  }
}

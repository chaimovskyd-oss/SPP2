// Pure print-size definitions + client-side preset builder (no Node deps), safe to import in the
// renderer. The sender renders to these physical dimensions; the server re-maps to its concrete
// printer preset, but the rendered pixels already match the requested physical size (gap G5).

import type { BorderMode, PrintFinish, PrintPreset } from "@/types/printHub";

/** Nominal print sizes in millimetres. Photo (cm, with inch equivalents) + standard paper sizes. */
export const SIZE_MM: Record<string, { widthMm: number; heightMm: number }> = {
  // Photo sizes (cm)
  "9x13": { widthMm: 89, heightMm: 127 },
  "10x15": { widthMm: 102, heightMm: 152 },
  "13x18": { widthMm: 127, heightMm: 178 },
  "15x20": { widthMm: 152, heightMm: 203 },
  "15x21": { widthMm: 152, heightMm: 210 },
  "20x25": { widthMm: 203, heightMm: 254 },
  "20x30": { widthMm: 203, heightMm: 305 },
  "28x36": { widthMm: 279, heightMm: 356 },
  "30x45": { widthMm: 305, heightMm: 457 },
  // Paper sizes (ISO / US)
  A6: { widthMm: 105, heightMm: 148 },
  A5: { widthMm: 148, heightMm: 210 },
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  letter: { widthMm: 216, heightMm: 279 },
  legal: { widthMm: 216, heightMm: 356 }
};

export const SIZE_LABELS: Record<string, string> = {
  "9x13": "9×13 ס״מ",
  "10x15": "10×15 ס״מ (4×6″)",
  "13x18": "13×18 ס״מ (5×7″)",
  "15x20": "15×20 ס״מ (6×8″)",
  "15x21": "15×21 ס״מ",
  "20x25": "20×25 ס״מ (8×10″)",
  "20x30": "20×30 ס״מ (8×12″)",
  "28x36": "28×36 ס״מ (11×14″)",
  "30x45": "30×45 ס״מ (12×18″)",
  A6: "A6",
  A5: "A5",
  A4: "A4",
  A3: "A3",
  letter: "Letter",
  legal: "Legal"
};

/** Ordered list of size keys for dropdowns. */
export const SIZE_KEYS: string[] = Object.keys(SIZE_MM);

/** Builds a render preset for the sender from the user's size/finish/border selection. */
export function buildClientPreset(size: string, finish: PrintFinish, borderMode: BorderMode): PrintPreset {
  const dims = SIZE_MM[size] ?? SIZE_MM["10x15"];
  return {
    id: `client_${size}_${finish}_${borderMode}`,
    name: SIZE_LABELS[size] ?? size,
    widthMm: dims.widthMm,
    heightMm: dims.heightMm,
    dpi: 300,
    bleedMm: borderMode === "borderless" ? 1.5 : 0,
    finish,
    borderMode,
    copies: 1
  };
}

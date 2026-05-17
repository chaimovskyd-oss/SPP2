import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MaskLibraryEntry {
  id: string;
  name: string;
  type: "builtInShape" | "svg" | "png";
  shape?: "circle" | "heart" | "roundedRect" | "star";
  fileDataUrl?: string;
  thumbnailDataUrl?: string;
  defaultWidth: number;
  defaultHeight: number;
  thresholdEnabled: boolean;
  thresholdColor: "white" | "black";
  thresholdTolerance: number;
  thresholdFeather: number;
  createdAt: string;
}

interface MaskLibraryState {
  entries: MaskLibraryEntry[];
  addEntry: (entry: Omit<MaskLibraryEntry, "id" | "createdAt">) => MaskLibraryEntry;
  removeEntry: (id: string) => void;
  updateEntry: (id: string, patch: Partial<Omit<MaskLibraryEntry, "id" | "createdAt">>) => void;
}

export const useMaskLibraryStore = create<MaskLibraryState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) => {
        const newEntry: MaskLibraryEntry = {
          ...entry,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString()
        };
        set((s) => ({ entries: [...s.entries, newEntry] }));
        return newEntry;
      },

      removeEntry: (id) =>
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

      updateEntry: (id, patch) =>
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e))
        }))
    }),
    { name: "spp2-mask-library" }
  )
);

export async function generateMaskThumbnail(
  fileDataUrl: string,
  type: "svg" | "png",
  thresholdEnabled: boolean,
  thresholdColor: "white" | "black",
  thresholdTolerance: number,
  thresholdFeather: number,
  maxSize = 200
): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / img.width, maxSize / img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx === null) {
        resolve(fileDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);

      if (type === "png" && thresholdEnabled) {
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = thresholdColor === "white"
            ? (r + g + b) / 3
            : 255 - (r + g + b) / 3;
          const edge = 255 - thresholdTolerance;
          if (brightness >= edge) {
            const featherZone = Math.max(1, thresholdFeather * 2);
            const alpha = brightness >= edge + featherZone
              ? 0
              : Math.round(255 * (1 - (brightness - edge) / featherZone));
            data[i + 3] = Math.min(data[i + 3], alpha);
          }
        }
        ctx.putImageData(imageData, 0, 0);
      }

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(fileDataUrl);
    img.src = fileDataUrl;
  });
}

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PixabayState {
  apiKey: string;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

export const usePixabayStore = create<PixabayState>()(
  persist(
    (set) => ({
      apiKey: "",
      setApiKey: (key) => set({ apiKey: key.trim() }),
      clearApiKey: () => set({ apiKey: "" }),
    }),
    { name: "spp2_pixabay_settings" }
  )
);

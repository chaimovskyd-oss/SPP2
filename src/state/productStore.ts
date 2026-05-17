import { create } from "zustand";
import type { ProductDefinition } from "@/types/product";

export interface ProductCollageContext {
  product: ProductDefinition;
}

interface ProductState {
  activeProduct: ProductDefinition | null;
  isDirty: boolean;
  collageContext: ProductCollageContext | null;
}

interface ProductActions {
  setActiveProduct: (product: ProductDefinition) => void;
  clearProduct: () => void;
  markProductDirty: () => void;
  markProductClean: () => void;
  setCollageContext: (ctx: ProductCollageContext | null) => void;
  patchActiveProduct: (patch: Partial<ProductDefinition>) => void;
}

export const useProductStore = create<ProductState & ProductActions>((set, get) => ({
  activeProduct: null,
  isDirty: false,
  collageContext: null,

  setActiveProduct: (product) => set({ activeProduct: product, isDirty: false }),

  clearProduct: () => set({ activeProduct: null, isDirty: false, collageContext: null }),

  markProductDirty: () => set({ isDirty: true }),

  markProductClean: () => set({ isDirty: false }),

  setCollageContext: (ctx) => set({ collageContext: ctx }),

  patchActiveProduct: (patch) => {
    const current = get().activeProduct;
    if (!current) return;
    set({ activeProduct: { ...current, ...patch }, isDirty: true });
  }
}));

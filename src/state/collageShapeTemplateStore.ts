import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CollageShapeTemplate } from "@/types/collage";

export type CollageShapeTemplateInput = Omit<CollageShapeTemplate, "id" | "version" | "createdAt" | "updatedAt">;

interface CollageShapeTemplateState {
  templates: CollageShapeTemplate[];
  addTemplate: (template: CollageShapeTemplateInput) => CollageShapeTemplate;
  removeTemplate: (id: string) => void;
  updateTemplate: (id: string, patch: Partial<CollageShapeTemplateInput>) => void;
}

export const useCollageShapeTemplateStore = create<CollageShapeTemplateState>()(
  persist(
    (set) => ({
      templates: [],
      addTemplate: (template) => {
        const now = new Date().toISOString();
        const next: CollageShapeTemplate = {
          version: 1,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          ...template
        };
        set((state) => ({ templates: [...state.templates, next] }));
        return next;
      },
      removeTemplate: (id) => set((state) => ({ templates: state.templates.filter((template) => template.id !== id) })),
      updateTemplate: (id, patch) =>
        set((state) => ({
          templates: state.templates.map((template) =>
            template.id === id ? { ...template, ...patch, updatedAt: new Date().toISOString() } : template
          )
        }))
    }),
    { name: "spp2-collage-shape-templates" }
  )
);


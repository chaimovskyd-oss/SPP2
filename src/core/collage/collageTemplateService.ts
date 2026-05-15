import { createId } from "@/core/ids";
import type { CollageTemplate } from "@/types/collage";
import type { ID } from "@/types/primitives";

// Templates stored in userData/collage-templates/ as individual JSON files.
// In browser / Electron without the IPC bridge we fall back to localStorage.

const LS_KEY = "spp2_collage_templates";

function readAll(): CollageTemplate[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CollageTemplate[];
  } catch {
    return [];
  }
}

function writeAll(templates: CollageTemplate[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(templates));
}

export const collageTemplateService = {
  async listTemplates(): Promise<CollageTemplate[]> {
    return readAll();
  },

  async saveTemplate(template: CollageTemplate): Promise<void> {
    const all = readAll();
    const idx = all.findIndex((t) => t.id === template.id);
    if (idx >= 0) {
      all[idx] = { ...template, updatedAt: new Date().toISOString() };
    } else {
      all.push({ ...template, updatedAt: new Date().toISOString() });
    }
    writeAll(all);
  },

  async loadTemplate(id: ID): Promise<CollageTemplate | null> {
    return readAll().find((t) => t.id === id) ?? null;
  },

  async deleteTemplate(id: ID): Promise<void> {
    writeAll(readAll().filter((t) => t.id !== id));
  },

  async renameTemplate(id: ID, name: string): Promise<void> {
    writeAll(readAll().map((t) => (t.id === id ? { ...t, name, updatedAt: new Date().toISOString() } : t)));
  },

  async setFavorite(id: ID, favorite: boolean): Promise<void> {
    writeAll(readAll().map((t) => (t.id === id ? { ...t, favorite } : t)));
  },

  async duplicateTemplate(id: ID): Promise<CollageTemplate | null> {
    const original = readAll().find((t) => t.id === id);
    if (!original) return null;
    const copy: CollageTemplate = {
      ...original,
      id: createId("ctpl"),
      name: `${original.name} (עותק)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorite: false
    };
    const all = readAll();
    all.push(copy);
    writeAll(all);
    return copy;
  }
};

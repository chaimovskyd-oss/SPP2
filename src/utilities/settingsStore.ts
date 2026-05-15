import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ExternalAppPaths {
  photoshopPath: string;
  colorLabPath: string;
  pdfEditorPath: string;
  collageEditorPath: string;
  projectsFolder: string;
  exportsFolder: string;
  tempEditingFolder: string;
}

interface UtilitiesSettingsState extends ExternalAppPaths {
  setPath: (key: keyof ExternalAppPaths, value: string) => void;
  setPaths: (paths: Partial<ExternalAppPaths>) => void;
  reset: () => void;
}

const defaultPaths: ExternalAppPaths = {
  photoshopPath: "",
  colorLabPath: "",
  pdfEditorPath: "",
  collageEditorPath: "",
  projectsFolder: "",
  exportsFolder: "",
  tempEditingFolder: ""
};

export const useUtilitiesSettings = create<UtilitiesSettingsState>()(
  persist(
    (set) => ({
      ...defaultPaths,
      setPath: (key, value) => set({ [key]: value }),
      setPaths: (paths) => set(paths),
      reset: () => set(defaultPaths)
    }),
    { name: "spp-utilities-settings" }
  )
);

export type ExternalAppKey = keyof ExternalAppPaths;

export const EXTERNAL_APP_LABELS: Record<ExternalAppKey, string> = {
  photoshopPath: "Photoshop",
  colorLabPath: "ColorLab",
  pdfEditorPath: "עורך PDF",
  collageEditorPath: "עורך קולאז׳",
  projectsFolder: "תיקיית פרויקטים",
  exportsFolder: "תיקיית ייצוא",
  tempEditingFolder: "תיקייה זמנית לעריכה"
};

export const EXTERNAL_APP_ICONS: Record<ExternalAppKey, string> = {
  photoshopPath: "🎨",
  colorLabPath: "🎨",
  pdfEditorPath: "📄",
  collageEditorPath: "🖼️",
  projectsFolder: "📁",
  exportsFolder: "📤",
  tempEditingFolder: "🗂️"
};

export const EXTERNAL_APP_IS_FOLDER: Record<ExternalAppKey, boolean> = {
  photoshopPath: false,
  colorLabPath: false,
  pdfEditorPath: false,
  collageEditorPath: false,
  projectsFolder: true,
  exportsFolder: true,
  tempEditingFolder: true
};

import { create } from "zustand";

export interface HistoryCommand {
  id: string;
  label: string;
  createdAt: string;
}

export interface HistoryState {
  undoStack: HistoryCommand[];
  redoStack: HistoryCommand[];
  push: (command: HistoryCommand) => void;
  markUndo: () => void;
  markRedo: () => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  undoStack: [],
  redoStack: [],
  push: (command) =>
    set((state) => ({
      undoStack: [...state.undoStack, command],
      redoStack: []
    })),
  markUndo: () =>
    set((state) => {
      const command = state.undoStack.at(-1);
      if (command === undefined) {
        return state;
      }
      return {
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, command]
      };
    }),
  markRedo: () =>
    set((state) => {
      const command = state.redoStack.at(-1);
      if (command === undefined) {
        return state;
      }
      return {
        undoStack: [...state.undoStack, command],
        redoStack: state.redoStack.slice(0, -1)
      };
    }),
  clear: () => set({ undoStack: [], redoStack: [] })
}));

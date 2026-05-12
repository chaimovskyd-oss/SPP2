export type ToolId = "move" | "text" | "image" | "layers" | "pan";

export interface ModifierState {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

export interface PointerLifecycle {
  active: boolean;
  start: { x: number; y: number } | null;
  current: { x: number; y: number } | null;
  button: number;
}

export interface InputState {
  activeTool: ToolId;
  modifiers: ModifierState;
  pointer: PointerLifecycle;
}

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: string;
}

export function createInputState(activeTool: ToolId = "move"): InputState {
  return {
    activeTool,
    modifiers: { shift: false, alt: false, ctrl: false, meta: false },
    pointer: { active: false, start: null, current: null, button: 0 }
  };
}

export function readModifiers(event: Pick<KeyboardEvent | MouseEvent, "shiftKey" | "altKey" | "ctrlKey" | "metaKey">): ModifierState {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey
  };
}

export function beginPointer(input: InputState, point: { x: number; y: number }, button = 0): InputState {
  return {
    ...input,
    pointer: {
      active: true,
      start: point,
      current: point,
      button
    }
  };
}

export function movePointer(input: InputState, point: { x: number; y: number }): InputState {
  if (!input.pointer.active) {
    return input;
  }
  return {
    ...input,
    pointer: {
      ...input.pointer,
      current: point
    }
  };
}

export function endPointer(input: InputState): InputState {
  return {
    ...input,
    pointer: {
      active: false,
      start: null,
      current: null,
      button: 0
    }
  };
}

export function matchShortcut(event: KeyboardEvent, shortcuts: Shortcut[]): string | null {
  const key = event.key.toLowerCase();
  const match = shortcuts.find((shortcut) =>
    shortcut.key.toLowerCase() === key &&
    Boolean(shortcut.ctrl) === event.ctrlKey &&
    Boolean(shortcut.meta) === event.metaKey &&
    Boolean(shortcut.shift) === event.shiftKey &&
    Boolean(shortcut.alt) === event.altKey
  );
  return match?.action ?? null;
}

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { key: "z", ctrl: true, action: "undo" },
  { key: "z", ctrl: true, shift: true, action: "redo" },
  { key: "Delete", action: "delete" },
  { key: "Escape", action: "escape" },
  { key: "Enter", action: "commit" },
  { key: "v", action: "tool.move" },
  { key: "t", action: "tool.text" }
];

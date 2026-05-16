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

// ─── Global app shortcut definitions (used by Settings system) ────────────────

export interface AppShortcutDef {
  action: string;
  label: string;
  defaultKey: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export const DEFAULT_SHORTCUT_DEFINITIONS: AppShortcutDef[] = [
  { action: "save",         label: "שמור",              defaultKey: "s", ctrl: true },
  { action: "saveAs",       label: "שמור בשם",           defaultKey: "s", ctrl: true, shift: true },
  { action: "undo",         label: "בטל",               defaultKey: "z", ctrl: true },
  { action: "redo",         label: "בצע שוב",           defaultKey: "y", ctrl: true },
  { action: "delete",       label: "מחק",               defaultKey: "Delete" },
  { action: "duplicate",    label: "שכפל",              defaultKey: "d", ctrl: true },
  { action: "selectAll",    label: "בחר הכל",           defaultKey: "a", ctrl: true },
  { action: "deselect",     label: "בטל בחירה",         defaultKey: "Escape" },
  { action: "group",        label: "קבץ",               defaultKey: "g", ctrl: true },
  { action: "ungroup",      label: "בטל קיבוץ",         defaultKey: "g", ctrl: true, shift: true },
  { action: "copy",         label: "העתק",              defaultKey: "c", ctrl: true },
  { action: "paste",        label: "הדבק",              defaultKey: "v", ctrl: true },
  { action: "cut",          label: "גזור",              defaultKey: "x", ctrl: true },
  { action: "zoomIn",       label: "הגדל",              defaultKey: "=", ctrl: true },
  { action: "zoomOut",      label: "הקטן",              defaultKey: "-", ctrl: true },
  { action: "zoomFit",      label: "התאם למסך",         defaultKey: "0", ctrl: true },
  { action: "zoom100",      label: "100% זום",          defaultKey: "1", ctrl: true },
  { action: "toggleGrid",   label: "הצג/הסתר גריד",     defaultKey: "g" },
  { action: "toggleRulers", label: "הצג/הסתר סרגלים",   defaultKey: "r" },
  { action: "settings",     label: "הגדרות",            defaultKey: ",", ctrl: true },
];

// ─── Collage Mode shortcuts ───────────────────────────────────────────────────

export const COLLAGE_SHORTCUTS: Shortcut[] = [
  { key: "Tab", action: "collage.nextCell" },
  { key: "Tab", shift: true, action: "collage.prevCell" },
  { key: "ArrowLeft", action: "collage.panLeft" },
  { key: "ArrowRight", action: "collage.panRight" },
  { key: "ArrowUp", action: "collage.panUp" },
  { key: "ArrowDown", action: "collage.panDown" },
  { key: "+", action: "collage.zoomIn" },
  { key: "-", action: "collage.zoomOut" },
  { key: "r", action: "collage.rotateCell" },
  { key: "s", action: "collage.swapMode" },
  { key: "e", ctrl: true, action: "collage.export" },
  { key: "Escape", action: "collage.deselect" },
  // Layouts 1-9
  { key: "1", action: "collage.layout1" },
  { key: "2", action: "collage.layout2" },
  { key: "3", action: "collage.layout3" },
  { key: "4", action: "collage.layout4" },
  { key: "5", action: "collage.layout5" },
  { key: "6", action: "collage.layout6" },
  { key: "7", action: "collage.layout7" },
  { key: "8", action: "collage.layout8" },
  { key: "9", action: "collage.layout9" }
];

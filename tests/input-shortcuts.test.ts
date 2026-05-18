import { describe, expect, it } from "vitest";
import { keyboardEventToShortcutKey, matchShortcut, shortcutBindingsToShortcuts } from "@/core/input/inputSystem";

function keyEvent(init: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    code: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...init
  } as KeyboardEvent;
}

describe("keyboard shortcut matching", () => {
  it("matches physical latin letter shortcuts when the active layout emits Hebrew characters", () => {
    const action = matchShortcut(
      keyEvent({ key: "ב", code: "KeyC", ctrlKey: true }),
      [{ action: "copy", key: "c", ctrl: true }]
    );

    expect(action).toBe("copy");
  });

  it("converts captured physical letter keys to stable shortcut keys", () => {
    expect(keyboardEventToShortcutKey(keyEvent({ key: "ב", code: "KeyC", ctrlKey: true }))).toBe("c");
  });

  it("matches user shortcut bindings by their persisted modifier state", () => {
    const shortcuts = shortcutBindingsToShortcuts([
      { action: "redo", currentKey: "z", currentCtrl: true, currentShift: true }
    ]);

    expect(matchShortcut(keyEvent({ key: "Z", code: "KeyZ", ctrlKey: true, shiftKey: true }), shortcuts)).toBe("redo");
    expect(matchShortcut(keyEvent({ key: "z", code: "KeyZ", ctrlKey: true }), shortcuts)).toBeNull();
  });
});

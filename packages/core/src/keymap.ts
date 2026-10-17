import type { KeyboardAction, KeyboardOptions, KeyShortcut } from "./types/grid.js";

const DEFAULT_BINDINGS: Record<KeyboardAction, readonly KeyShortcut[]> = {
  copy: [{ key: "c", mod: true }],
  cut: [{ key: "x", mod: true }],
  paste: [{ key: "v", mod: true }],
  pasteValues: [{ key: "v", mod: true, shift: true }],
  undo: [{ key: "z", mod: true }],
  redo: [
    { key: "z", mod: true, shift: true },
    { key: "y", mod: true },
  ],
  find: [{ key: "f", mod: true }],
  replace: [{ key: "h", mod: true }],
  clearContents: [{ key: "Delete" }, { key: "Backspace" }],
};
const ACTIONS = Object.keys(DEFAULT_BINDINGS) as KeyboardAction[];
const APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/i;

export function isKeyboardAction(action: string): action is KeyboardAction {
  return Object.hasOwn(DEFAULT_BINDINGS, action);
}

function isMac(): boolean {
  return APPLE_PLATFORM.test(navigator.platform) || APPLE_PLATFORM.test(navigator.userAgent);
}

export function formatShortcut(shortcut: KeyShortcut): string {
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  if (isMac()) {
    return `${shortcut.mod ? "⌘" : ""}${shortcut.shift ? "⇧" : ""}${shortcut.alt ? "⌥" : ""}${key}`;
  }
  return [shortcut.mod && "Ctrl", shortcut.shift && "Shift", shortcut.alt && "Alt", key]
    .filter(Boolean)
    .join("+");
}

export function boundShortcutLabel(action: KeyboardAction, options?: KeyboardOptions): string {
  const binding = options?.bindings?.[action];
  const shortcut =
    binding === null
      ? undefined
      : binding === undefined
        ? DEFAULT_BINDINGS[action][0]
        : "key" in binding
          ? binding
          : binding[0];
  return shortcut ? formatShortcut(shortcut) : "";
}

function matchesShortcut(event: KeyboardEvent, shortcut: KeyShortcut, mac: boolean): boolean {
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    (mac ? event.metaKey : event.ctrlKey) === Boolean(shortcut.mod) &&
    !(mac ? event.ctrlKey : event.metaKey) &&
    event.shiftKey === Boolean(shortcut.shift) &&
    event.altKey === Boolean(shortcut.alt)
  );
}

export function keyboardAction(
  event: KeyboardEvent,
  options?: KeyboardOptions,
): KeyboardAction | null {
  const mac = isMac();
  for (const action of ACTIONS) {
    const binding = options?.bindings?.[action];
    if (binding === null) continue;
    if (binding && "key" in binding) {
      if (matchesShortcut(event, binding, mac)) return action;
    } else {
      for (const shortcut of binding ?? DEFAULT_BINDINGS[action]) {
        if (matchesShortcut(event, shortcut, mac)) return action;
      }
    }
  }
  return null;
}

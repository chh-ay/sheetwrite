import { SheetwriteError } from "./errors.js";
import type {
  ContextMenuContext,
  ContextMenuItem,
  Grid,
  GridConfig,
  KeyboardAction,
  KeyboardOptions,
  KeyShortcut,
} from "./types/grid.js";

const DEFAULT_BINDINGS: Record<KeyboardAction, readonly KeyShortcut[]> = {
  copy: ["Mod+C"],
  cut: ["Mod+X"],
  paste: ["Mod+V"],
  pasteValues: ["Mod+Shift+V"],
  undo: ["Mod+Z"],
  redo: ["Mod+Shift+Z", "Mod+Y"],
  find: ["Mod+F"],
  replace: ["Mod+H"],
  clearContents: [{ key: "Delete" }, { key: "Backspace" }],
};
const ACTIONS = Object.keys(DEFAULT_BINDINGS) as KeyboardAction[];
const APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/i;

/** Internal physical-key representation shared by labels, matching, and conflict detection. */
export interface ParsedShortcut {
  readonly key: string;
  /** Display modifiers for this platform. */
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  /**
   * `Mod` without a literal Ctrl/Meta: either key matches. Browsers and test
   * runners can report a Mac platform on other systems, so matching never
   * depends on platform detection; only the label does.
   */
  readonly either: boolean;
}

interface ActionBinding {
  readonly action: KeyboardAction;
  readonly shortcut: ParsedShortcut;
}

interface CustomBinding {
  readonly command: ContextMenuItem;
  readonly shortcut: ParsedShortcut;
}

export function isKeyboardAction(action: string): action is KeyboardAction {
  return Object.hasOwn(DEFAULT_BINDINGS, action);
}

function isMac(): boolean {
  return APPLE_PLATFORM.test(navigator.platform) || APPLE_PLATFORM.test(navigator.userAgent);
}

function invalidShortcut(shortcut: KeyShortcut, reason: string): never {
  throw new SheetwriteError("invalid-shortcut", "keyboard-configure", reason, {
    context: { shortcut: typeof shortcut === "string" ? shortcut : shortcut.key },
  });
}

export function parseShortcut(shortcut: KeyShortcut): ParsedShortcut {
  let key: string;
  let mod = false;
  let ctrl = false;
  let meta = false;
  let shift = false;
  let alt = false;
  if (typeof shortcut === "string") {
    const parts = shortcut.split("+");
    key = parts.pop() ?? "";
    const seen = new Set<string>();
    for (const modifier of parts) {
      if (seen.has(modifier)) invalidShortcut(shortcut, `Repeated shortcut modifier: ${modifier}.`);
      seen.add(modifier);
      switch (modifier) {
        case "Mod":
          mod = true;
          break;
        case "Ctrl":
          ctrl = true;
          break;
        case "Meta":
          meta = true;
          break;
        case "Shift":
          shift = true;
          break;
        case "Alt":
          alt = true;
          break;
        default:
          invalidShortcut(shortcut, `Unknown shortcut modifier: ${modifier}.`);
      }
    }
    if (parts.length === 0 || ["Mod", "Ctrl", "Meta", "Shift", "Alt"].includes(key)) {
      invalidShortcut(shortcut, "A compact shortcut must contain modifiers followed by one key.");
    }
  } else {
    key = shortcut.key;
    mod = shortcut.mod === true;
    ctrl = shortcut.ctrl === true;
    meta = shortcut.meta === true;
    shift = shortcut.shift === true;
    alt = shortcut.alt === true;
  }
  if (key.length === 0 || (key !== " " && key.trim() !== key)) {
    invalidShortcut(
      shortcut,
      "A shortcut must contain one non-empty key without surrounding spaces.",
    );
  }
  const mac = isMac();

  return {
    key: key.toLowerCase(),
    ctrl: ctrl || (mod && !mac),
    meta: meta || (mod && mac),
    shift,
    alt,
    either: mod && !ctrl && !meta,
  };
}

export function formatShortcut(shortcut: ParsedShortcut): string {
  const key =
    shortcut.key === " "
      ? "Space"
      : shortcut.key.length === 1
        ? shortcut.key.toUpperCase()
        : shortcut.key === "delete"
          ? "Delete"
          : shortcut.key === "backspace"
            ? "Backspace"
            : shortcut.key === "escape"
              ? "Escape"
              : shortcut.key === "enter"
                ? "Enter"
                : shortcut.key === "tab"
                  ? "Tab"
                  : shortcut.key.startsWith("arrow")
                    ? `Arrow${shortcut.key.slice(5, 6).toUpperCase()}${shortcut.key.slice(6)}`
                    : /^f\d+$/.test(shortcut.key)
                      ? shortcut.key.toUpperCase()
                      : shortcut.key;
  if (isMac()) {
    return `${shortcut.ctrl ? "⌃" : ""}${shortcut.meta ? "⌘" : ""}${shortcut.shift ? "⇧" : ""}${shortcut.alt ? "⌥" : ""}${key}`;
  }
  return [
    shortcut.ctrl && "Ctrl",
    shortcut.meta && "Meta",
    shortcut.shift && "Shift",
    shortcut.alt && "Alt",
    key,
  ]
    .filter(Boolean)
    .join("+");
}

function isSingleShortcut(binding: KeyShortcut | readonly KeyShortcut[]): binding is KeyShortcut {
  return typeof binding === "string" || "key" in binding;
}

function bindingsFor(
  action: KeyboardAction,
  options?: KeyboardOptions,
): KeyShortcut | readonly KeyShortcut[] | null {
  return options?.bindings?.[action] === undefined
    ? DEFAULT_BINDINGS[action]
    : (options.bindings[action] ?? null);
}

export function boundShortcutLabel(action: KeyboardAction, options?: KeyboardOptions): string {
  const binding = bindingsFor(action, options);
  if (binding === null) return "";
  const shortcut = isSingleShortcut(binding) ? binding : binding[0];

  return shortcut ? formatShortcut(parseShortcut(shortcut)) : "";
}

/** The (Control, Command) pairs a shortcut accepts. */
function acceptedModifiers(shortcut: ParsedShortcut): ReadonlyArray<readonly [boolean, boolean]> {
  return shortcut.either
    ? [
        [true, false],
        [false, true],
      ]
    : [[shortcut.ctrl, shortcut.meta]];
}

/** Unshifted US-layout characters for the punctuation `KeyboardEvent.code` values. */
const PUNCTUATION_CODES: Readonly<Record<string, string>> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
};

/**
 * The key a shortcut names when Shift or Alt changed the typed character:
 * Shift+1 types "!" and Option+K types "˚", but "Mod+Shift+1" names the 1 key.
 * Only a typed symbol falls back to the physical key, so a letter or digit
 * typed on another layout (AZERTY "a" on the Q key) still matches by meaning.
 */
function physicalKey(event: KeyboardEvent, typed: string): string | undefined {
  if (!event.shiftKey && !event.altKey) return undefined;
  if (typed.length !== 1 || /[\p{L}\p{N}]/u.test(typed)) return undefined;
  const code = event.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return PUNCTUATION_CODES[code];
}

function matchesShortcut(event: KeyboardEvent, key: string, shortcut: ParsedShortcut): boolean {
  return (
    (key === shortcut.key || physicalKey(event, key) === shortcut.key) &&
    event.shiftKey === shortcut.shift &&
    event.altKey === shortcut.alt &&
    acceptedModifiers(shortcut).some(
      ([ctrl, meta]) => event.ctrlKey === ctrl && event.metaKey === meta,
    )
  );
}

/** One identity per accepted key press, so `Mod+C` conflicts with `Ctrl+C`. */
function bindingIdentities(shortcut: ParsedShortcut): string[] {
  return acceptedModifiers(shortcut).map(
    ([ctrl, meta]) =>
      `${Number(ctrl)}${Number(meta)}${Number(shortcut.shift)}${Number(shortcut.alt)}:${shortcut.key}`,
  );
}

function registerBinding(
  registered: Map<string, string>,
  shortcut: ParsedShortcut,
  command: string,
): void {
  for (const identity of bindingIdentities(shortcut)) {
    const previous = registered.get(identity);
    if (previous !== undefined) {
      throw new SheetwriteError(
        "shortcut-conflict",
        "keyboard-configure",
        `Shortcut ${formatShortcut(shortcut)} is bound to both ${previous} and ${command}.`,
        {
          context: { shortcut: formatShortcut(shortcut), commands: [previous, command] },
        },
      );
    }
    registered.set(identity, command);
  }
}

/** Compiles static registrations once; request-aware menu factories resolve against the focused cell. */
export class Keymap {
  private readonly actions: ActionBinding[] = [];
  private readonly registered = new Map<string, string>();
  private readonly menu: GridConfig["contextMenu"];
  private readonly staticCustom: readonly CustomBinding[];

  constructor(
    config?: GridConfig,
    context: ContextMenuContext = { cell: null, clientX: 0, clientY: 0 },
  ) {
    this.menu = config?.contextMenu;
    if (config?.keyboard !== false) {
      const options = typeof config?.keyboard === "object" ? config.keyboard : undefined;
      for (const action of ACTIONS) {
        const binding = bindingsFor(action, options);
        if (binding === null) continue;
        const shortcuts = isSingleShortcut(binding) ? [binding] : binding;
        for (const input of shortcuts) {
          const shortcut = parseShortcut(input);
          registerBinding(this.registered, shortcut, action);
          this.actions.push({ action, shortcut });
        }
      }
    }
    this.staticCustom = this.resolveCustom(context);
  }

  label(action: KeyboardAction): string {
    const binding = this.actions.find((candidate) => candidate.action === action);
    return binding ? formatShortcut(binding.shortcut) : "";
  }

  action(event: KeyboardEvent): KeyboardAction | null {
    const key = event.key.toLowerCase();
    for (const binding of this.actions) {
      if (matchesShortcut(event, key, binding.shortcut)) return binding.action;
    }
    return null;
  }

  runCustom(
    event: KeyboardEvent,
    context: ContextMenuContext,
    grid: Grid,
    editing: boolean,
  ): boolean {
    const bindings =
      typeof this.menu === "function" ? this.resolveCustom(context) : this.staticCustom;
    const key = event.key.toLowerCase();
    for (const { command, shortcut } of bindings) {
      if (editing && !shortcut.ctrl && !shortcut.meta) continue;
      if (!matchesShortcut(event, key, shortcut)) continue;
      if (
        command.visible === false ||
        (typeof command.visible === "function" && !command.visible(context))
      )
        continue;
      if (
        command.disabled === true ||
        (typeof command.disabled === "function" && command.disabled(context))
      )
        continue;
      event.preventDefault();
      event.stopPropagation();
      command.onClick?.(grid, context.cell);
      return true;
    }
    return false;
  }

  private resolveCustom(context: ContextMenuContext): readonly CustomBinding[] {
    const configured = typeof this.menu === "function" ? this.menu(context) : this.menu;
    if (!Array.isArray(configured)) return [];
    const registered = new Map(this.registered);
    const bindings: CustomBinding[] = [];
    for (const [index, command] of configured.entries()) {
      const input = command.shortcut;
      if (!command.onClick || !input || (typeof input === "string" && isKeyboardAction(input)))
        continue;
      const shortcut = parseShortcut(input);
      registerBinding(
        registered,
        shortcut,
        command.id ?? command.label ?? `menu item ${index + 1}`,
      );
      bindings.push({ command, shortcut });
    }
    return bindings;
  }
}

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

/**
 * Excel's keys for each built-in action on every platform: the defaults a
 * binding override replaces. `defaultKeys` adds the macOS-only ones.
 */
export const DEFAULT_BINDINGS: Readonly<Record<KeyboardAction, readonly KeyShortcut[]>> = {
  copy: ["Mod+C"],
  cut: ["Mod+X"],
  paste: ["Mod+V"],
  pasteValues: ["Mod+Shift+V"],
  // Excel's Paste Special: Ctrl+Alt+V, and Cmd+Option+V or Ctrl+Option+V in
  // Excel for Mac (`Mod` accepts either).
  pasteSpecial: ["Mod+Alt+V"],
  undo: ["Mod+Z"],
  redo: ["Mod+Shift+Z", "Mod+Y"],
  find: ["Mod+F"],
  replace: ["Mod+H"],
  // Backspace is not a binding: as in Excel it clears only the active cell and opens it.
  clearContents: [{ key: "Delete" }],
  // Excel opens the note editor with Shift+F2.
  editNote: ["Shift+F2"],
  // Excel's formatting keys; Ctrl+2, Ctrl+3 and Ctrl+4 are its second keys for the first three.
  bold: ["Mod+B", "Mod+2"],
  italic: ["Mod+I", "Mod+3"],
  underline: ["Mod+U", "Mod+4"],
  strikethrough: ["Mod+5"],
  // Ctrl+; enters today's date and Ctrl+Shift+; (Ctrl+:) the current time.
  insertDate: ["Mod+;"],
  insertTime: ["Mod+Shift+;"],
  // Ctrl+A selects the current region, and the whole sheet when pressed again.
  selectAll: ["Mod+A"],
  // Excel's Fill Down and Fill Right.
  fillDown: ["Mod+D"],
  fillRight: ["Mod+R"],
  // Excel switches sheets with Ctrl+PageDown and Ctrl+PageUp. Browsers keep
  // those keys for their own tabs, so Excel for the web's Ctrl+Alt+PageDown
  // and Ctrl+Alt+PageUp work too.
  nextSheet: ["Ctrl+PageDown", "Ctrl+Alt+PageDown"],
  previousSheet: ["Ctrl+PageUp", "Ctrl+Alt+PageUp"],
  // Shift+F11 inserts a sheet before the active one.
  insertSheet: ["Shift+F11"],
  // Excel turns filters on and off with Ctrl+Shift+L.
  toggleFilter: ["Mod+Shift+L"],
  // Excel's number-format keys, Ctrl+Shift+~ ! @ # $ % ^, named by their unshifted keys.
  formatGeneral: ["Mod+Shift+`"],
  formatNumber: ["Mod+Shift+1"],
  formatTime: ["Mod+Shift+2"],
  formatDate: ["Mod+Shift+3"],
  formatCurrency: ["Mod+Shift+4"],
  formatPercent: ["Mod+Shift+5"],
  formatScientific: ["Mod+Shift+6"],
  // Ctrl+9 and Ctrl+0 hide the selected rows and columns; with Shift they show them again.
  hideRows: ["Mod+9"],
  unhideRows: ["Mod+Shift+9"],
  hideColumns: ["Mod+0"],
  unhideColumns: ["Mod+Shift+0"],
  // Ctrl++ inserts: Ctrl+Shift+= on a US keyboard, the keypad + or a + key of its own.
  // Ctrl+- (or the keypad -) deletes.
  insertCells: ["Mod+Shift+=", { key: "+", mod: true }],
  deleteCells: ["Mod+-"],
  // Ctrl+1 opens Format Cells.
  formatCells: ["Mod+1"],
};

/**
 * Excel for Mac's defaults where they add keys. They hold Ctrl with Cmd,
 * which elsewhere is Ctrl with the Windows or Super key: the operating system
 * keeps those, so the page would never receive them.
 */
const MAC_DEFAULT_BINDINGS: Readonly<Partial<Record<KeyboardAction, readonly KeyShortcut[]>>> = {
  // Excel for Mac also opens Paste Special with Ctrl+Cmd+V.
  pasteSpecial: ["Mod+Alt+V", "Ctrl+Meta+V"],
};

/** Excel's keys for `action` on this platform. */
export function defaultKeys(action: KeyboardAction): readonly KeyShortcut[] {
  return (isMac() ? MAC_DEFAULT_BINDINGS[action] : undefined) ?? DEFAULT_BINDINGS[action];
}

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

export function isMac(): boolean {
  return APPLE_PLATFORM.test(navigator.platform) || APPLE_PLATFORM.test(navigator.userAgent);
}

function invalid_shortcut(shortcut: KeyShortcut, reason: string): never {
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
      if (seen.has(modifier))
        invalid_shortcut(shortcut, `Repeated shortcut modifier: ${modifier}.`);
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
          invalid_shortcut(shortcut, `Unknown shortcut modifier: ${modifier}.`);
      }
    }

    if (parts.length === 0 || ["Mod", "Ctrl", "Meta", "Shift", "Alt"].includes(key)) {
      invalid_shortcut(shortcut, "A compact shortcut must contain modifiers followed by one key.");
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
    invalid_shortcut(
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

function is_single_shortcut(binding: KeyShortcut | readonly KeyShortcut[]): binding is KeyShortcut {
  return typeof binding === "string" || "key" in binding;
}

function bindings_for(
  action: KeyboardAction,
  options?: KeyboardOptions,
): KeyShortcut | readonly KeyShortcut[] | null {
  return options?.bindings?.[action] === undefined
    ? defaultKeys(action)
    : (options.bindings[action] ?? null);
}

export function boundShortcutLabel(action: KeyboardAction, options?: KeyboardOptions): string {
  const binding = bindings_for(action, options);
  if (binding === null) return "";
  const shortcut = is_single_shortcut(binding) ? binding : binding[0];

  return shortcut ? formatShortcut(parseShortcut(shortcut)) : "";
}

/** The (Control, Command) pairs a shortcut accepts. */
function accepted_modifiers(shortcut: ParsedShortcut): ReadonlyArray<readonly [boolean, boolean]> {
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

/** The unshifted US-layout key of a `KeyboardEvent.code`, for letters, digits and punctuation. */
export function codeKey(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return PUNCTUATION_CODES[code];
}

/**
 * The key a shortcut names when Shift or Alt changed the typed character:
 * Shift+1 types "!" and Option+K types "˚", but "Mod+Shift+1" names the 1 key.
 * Only a typed symbol falls back to the physical key, so a letter or digit
 * typed on another layout (AZERTY "a" on the Q key) still matches by meaning.
 */
function physical_key(event: KeyboardEvent, typed: string): string | undefined {
  if (!event.shiftKey && !event.altKey) return undefined;
  if (typed.length !== 1 || /[\p{L}\p{N}]/u.test(typed)) return undefined;
  return codeKey(event.code);
}

function matches_shortcut(event: KeyboardEvent, key: string, shortcut: ParsedShortcut): boolean {
  return (
    (key === shortcut.key || physical_key(event, key) === shortcut.key) &&
    event.shiftKey === shortcut.shift &&
    event.altKey === shortcut.alt &&
    accepted_modifiers(shortcut).some(
      ([ctrl, meta]) => event.ctrlKey === ctrl && event.metaKey === meta,
    )
  );
}

/** One identity per accepted key press, so `Mod+C` conflicts with `Ctrl+C`. */
export function bindingIdentities(shortcut: ParsedShortcut): string[] {
  return accepted_modifiers(shortcut).map(
    ([ctrl, meta]) =>
      `${Number(ctrl)}${Number(meta)}${Number(shortcut.shift)}${Number(shortcut.alt)}:${shortcut.key}`,
  );
}

function register_binding(
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
  private readonly static_custom: readonly CustomBinding[];

  constructor(
    config?: GridConfig,
    context: ContextMenuContext = { cell: null, clientX: 0, clientY: 0 },
  ) {
    this.menu = config?.contextMenu;
    if (config?.keyboard !== false) {
      const options = typeof config?.keyboard === "object" ? config.keyboard : undefined;
      for (const action of ACTIONS) {
        const binding = bindings_for(action, options);
        if (binding === null) continue;
        const shortcuts = is_single_shortcut(binding) ? [binding] : binding;
        for (const input of shortcuts) {
          const shortcut = parseShortcut(input);
          register_binding(this.registered, shortcut, action);
          this.actions.push({ action, shortcut });
        }
      }
    }
    this.static_custom = this.resolve_custom(context);
  }

  label(action: KeyboardAction): string {
    const binding = this.actions.find((candidate) => candidate.action === action);
    return binding ? formatShortcut(binding.shortcut) : "";
  }

  action(event: KeyboardEvent): KeyboardAction | null {
    const key = event.key.toLowerCase();
    for (const binding of this.actions) {
      if (matches_shortcut(event, key, binding.shortcut)) return binding.action;
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
      typeof this.menu === "function" ? this.resolve_custom(context) : this.static_custom;
    const key = event.key.toLowerCase();
    for (const { command, shortcut } of bindings) {
      if (editing && !shortcut.ctrl && !shortcut.meta) continue;
      if (!matches_shortcut(event, key, shortcut)) continue;
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

  private resolve_custom(context: ContextMenuContext): readonly CustomBinding[] {
    const configured = typeof this.menu === "function" ? this.menu(context) : this.menu;
    if (!Array.isArray(configured)) return [];
    const registered = new Map(this.registered);
    const bindings: CustomBinding[] = [];
    for (const [index, command] of configured.entries()) {
      const input = command.shortcut;
      if (!command.onClick || !input || (typeof input === "string" && isKeyboardAction(input)))
        continue;
      const shortcut = parseShortcut(input);
      register_binding(
        registered,
        shortcut,
        command.id ?? command.label ?? `menu item ${index + 1}`,
      );
      bindings.push({ command, shortcut });
    }
    return bindings;
  }
}

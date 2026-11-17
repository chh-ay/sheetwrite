// What the Keyboard shortcuts panel (keyboard-settings.ts) decides, apart
// from its DOM: command names, recording a key press, keys the browser or
// the operating system keeps, conflicts, and import and export. It loads with
// the panel, on first use.

import { SheetwriteError } from "./errors.js";
import {
  bindingIdentities,
  codeKey,
  DEFAULT_BINDINGS,
  formatShortcut,
  isKeyboardAction,
  isMac,
  Keymap,
  parseShortcut,
  type ParsedShortcut,
} from "./keymap.js";
import type {
  GridConfig,
  KeyBindings,
  KeyboardAction,
  KeyboardOptions,
  KeyShortcut,
} from "./types/grid.js";

/** The commands in the ribbon's group order, with the names the ribbon gives them. */
export const COMMAND_GROUPS: readonly {
  readonly label: string;
  readonly commands: readonly (readonly [KeyboardAction, string])[];
}[] = [
  {
    label: "Clipboard",
    commands: [
      ["copy", "Copy"],
      ["cut", "Cut"],
      ["paste", "Paste"],
      ["pasteValues", "Paste Values"],
    ],
  },
  {
    label: "Editing",
    commands: [
      ["undo", "Undo"],
      ["redo", "Redo"],
      ["find", "Find"],
      ["replace", "Replace"],
      ["clearContents", "Clear Contents"],
      ["editNote", "Edit Note"],
      ["selectAll", "Select All"],
      ["fillDown", "Fill Down"],
      ["fillRight", "Fill Right"],
      ["insertDate", "Insert Date"],
      ["insertTime", "Insert Time"],
    ],
  },
  {
    label: "Font",
    commands: [
      ["bold", "Bold"],
      ["italic", "Italic"],
      ["underline", "Underline"],
      ["strikethrough", "Strikethrough"],
    ],
  },
  {
    label: "Number",
    commands: [
      ["formatGeneral", "General"],
      ["formatNumber", "Number"],
      ["formatTime", "Time"],
      ["formatDate", "Date"],
      ["formatCurrency", "Currency"],
      ["formatPercent", "Percentage"],
      ["formatScientific", "Scientific"],
      ["formatCells", "Format Cells"],
    ],
  },
  {
    label: "Cells",
    commands: [
      ["insertCells", "Insert Cells"],
      ["deleteCells", "Delete Cells"],
      ["hideRows", "Hide Rows"],
      ["unhideRows", "Unhide Rows"],
      ["hideColumns", "Hide Columns"],
      ["unhideColumns", "Unhide Columns"],
    ],
  },
  { label: "Data", commands: [["toggleFilter", "Filter"]] },
  {
    label: "Sheets",
    commands: [
      ["nextSheet", "Next Sheet"],
      ["previousSheet", "Previous Sheet"],
    ],
  },
];

const LABELS = new Map(COMMAND_GROUPS.flatMap((group) => group.commands));
const ACTIONS = [...LABELS.keys()];

/** The command's name, as the ribbon shows it. */
export function commandLabel(action: KeyboardAction): string {
  return LABELS.get(action) ?? action;
}

/** The keys `action` has under `bindings`: Excel's defaults unless the bindings change them. */
export function keysOf(action: KeyboardAction, bindings: KeyBindings): readonly KeyShortcut[] {
  const own = bindings[action];
  if (own === undefined) return DEFAULT_BINDINGS[action];
  if (own === null) return [];
  return typeof own === "string" || "key" in own ? [own] : own;
}

/** The exact key press a shortcut names, so equal shortcuts written differently compare equal. */
function identity(shortcut: KeyShortcut): string {
  return bindingIdentities(parseShortcut(shortcut)).join("|");
}

function sameKeys(a: readonly KeyShortcut[], b: readonly KeyShortcut[]): boolean {
  return (
    a.length === b.length &&
    a.every((shortcut, index) => identity(shortcut) === identity(b[index]!))
  );
}

/** Whether two shortcuts share a key press: `Mod+B` and `Ctrl+B` do. */
function overlaps(a: KeyShortcut, b: KeyShortcut): boolean {
  const presses = new Set(bindingIdentities(parseShortcut(a)));
  return bindingIdentities(parseShortcut(b)).some((press) => presses.has(press));
}

/** Whether the user changed `action`'s keys from Excel's defaults. */
export function isChanged(action: KeyboardAction, bindings: KeyBindings): boolean {
  return !sameKeys(keysOf(action, bindings), DEFAULT_BINDINGS[action]);
}

/** Only the actions that differ from Excel's defaults, each as a list of keys or `null`. */
export function normalizeBindings(bindings: KeyBindings): KeyBindings {
  const normal: Partial<Record<KeyboardAction, readonly KeyShortcut[] | null>> = {};
  for (const action of ACTIONS) {
    if (!isChanged(action, bindings)) continue;
    const keys = keysOf(action, bindings);
    normal[action] = keys.length === 0 ? null : [...keys];
  }
  return normal;
}

/** `bindings` with `action`'s keys set to `keys`. */
export function withKeys(
  bindings: KeyBindings,
  action: KeyboardAction,
  keys: readonly KeyShortcut[],
): KeyBindings {
  return normalizeBindings({ ...bindings, [action]: keys.length === 0 ? null : keys });
}

/** One key of one command: its position in the command's key list. */
export interface KeySlot {
  readonly action: KeyboardAction;
  readonly index: number;
}

/** The first key of another command that shares a key press with `shortcut`. */
export function ownerOf(
  bindings: KeyBindings,
  shortcut: KeyShortcut,
  except?: KeySlot,
): KeySlot | null {
  for (const action of ACTIONS) {
    const keys = keysOf(action, bindings);
    for (let index = 0; index < keys.length; index++) {
      if (except?.action === action && except.index === index) continue;
      if (overlaps(keys[index]!, shortcut)) return { action, index };
    }
  }
  return null;
}

/** Every command that a press of `shortcut` runs or would run. */
export function ownersOf(bindings: KeyBindings, shortcut: KeyShortcut): Set<KeyboardAction> {
  return new Set(
    ACTIONS.filter((action) => keysOf(action, bindings).some((key) => overlaps(key, shortcut))),
  );
}

/**
 * Give `action` the keys `shortcut`, in place of its key at `index` or added
 * after its keys when `index` is null. A command that already has the keys
 * loses them (`replace`), or takes the old keys of `action` (`swap`).
 */
export function assignKeys(
  bindings: KeyBindings,
  action: KeyboardAction,
  index: number | null,
  shortcut: KeyShortcut,
  resolution: "swap" | "replace" = "replace",
): KeyBindings {
  const keys = [...keysOf(action, bindings)];
  const previous = index === null ? undefined : keys[index];
  const owner = ownerOf(bindings, shortcut, index === null ? undefined : { action, index });
  if (index === null) keys.push(shortcut);
  else keys[index] = shortcut;
  let next = withKeys(bindings, action, keys);
  if (owner !== null && owner.action !== action) {
    const theirs = [...keysOf(owner.action, next)];
    if (resolution === "swap" && previous !== undefined) theirs[owner.index] = previous;
    else theirs.splice(owner.index, 1);
    next = withKeys(next, owner.action, theirs);
  }
  return next;
}

/** A label with the platform's names: Ctrl+Shift+B, or ⌘⇧B on a Mac. */
export function keysLabel(shortcut: KeyShortcut): string {
  return formatShortcut(parseShortcut(shortcut)).replace(
    /(insert|home|end|pageup|pagedown)$/,
    (key) => NAMED_KEYS[key] ?? key[0]!.toUpperCase() + key.slice(1),
  );
}

const NAMED_KEYS: Readonly<Record<string, string>> = { pageup: "PageUp", pagedown: "PageDown" };

/** Keys as words, for search: "ctrl+shift+b", or "cmd+shift+b" and "⌘⇧b" on a Mac. */
function searchText(shortcut: KeyShortcut): string {
  const parsed = parseShortcut(shortcut);
  const mac = isMac();
  const words = [
    parsed.ctrl && "ctrl",
    parsed.meta && (mac ? "cmd" : "meta"),
    parsed.shift && "shift",
    parsed.alt && (mac ? "option" : "alt"),
    parsed.key === " " ? "space" : parsed.key,
  ]
    .filter(Boolean)
    .join("+");
  return `${keysLabel(shortcut).toLowerCase()} ${words} ${mac ? words.replace("option", "alt") : ""}`;
}

/** Whether every word of `query` is in the command's name, group or keys. */
export function matchesQuery(
  action: KeyboardAction,
  group: string,
  bindings: KeyBindings,
  query: string,
): boolean {
  const words = query
    .toLowerCase()
    .replace(/\s*\+\s*/g, "+")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    commandLabel(action),
    group,
    ...keysOf(action, bindings).map(searchText),
    ...DEFAULT_BINDINGS[action].map(searchText),
  ]
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** A key press read as keys. */
export type PressedKeys =
  /** Only modifiers so far; `label` shows them. */
  | { readonly kind: "pending"; readonly label: string }
  | { readonly kind: "keys"; readonly shortcut: KeyShortcut };

const MODIFIER_KEYS = new Set([
  "Control",
  "Meta",
  "Shift",
  "Alt",
  "AltGraph",
  "OS",
  "Super",
  "Hyper",
  "Fn",
  "CapsLock",
]);
/** Keys that move or edit in the sheet, as in Excel, with or without modifiers. */
const SHEET_KEYS = new Set([
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "home",
  "end",
  "pageup",
  "pagedown",
  "enter",
  "tab",
  "escape",
  "backspace",
  " ",
]);

/**
 * Read a key press as keys. The platform's main modifier (Ctrl, or
 * ⌘ on a Mac) is saved as `Mod`, so the same binding works on both. Shift or
 * Option name the key they were pressed with, not the symbol they typed.
 */
export function readKeys(event: KeyboardEvent): PressedKeys {
  const mac = isMac();
  const mod = mac ? event.metaKey : event.ctrlKey;
  const ctrl = mac && event.ctrlKey;
  const meta = !mac && event.metaKey;
  const { shiftKey: shift, altKey: alt } = event;
  if (MODIFIER_KEYS.has(event.key)) {
    const held = { key: "…", mod, ctrl, meta, shift, alt };
    return { kind: "pending", label: formatShortcut(parseShortcut(held)) };
  }

  let key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (
    key === "Dead" ||
    key === "Unidentified" ||
    ((shift || alt) && key.length === 1 && !/[\p{L}\p{N}]/u.test(key))
  ) {
    key = codeKey(event.code) ?? key;
  } else if (alt && key.length === 1 && !/[a-z0-9]/.test(key)) {
    // Option+B types "∫" on a Mac.
    key = codeKey(event.code) ?? key;
  }

  const shortcut: KeyShortcut =
    (mod || ctrl || meta || shift || alt) && key !== "+"
      ? (`${[mod && "Mod", ctrl && "Ctrl", meta && "Meta", shift && "Shift", alt && "Alt"]
          .filter(Boolean)
          .join("+")}+${key.length === 1 ? key.toUpperCase() : key}` as KeyShortcut)
      : {
          key,
          ...(mod ? { mod } : {}),
          ...(ctrl ? { ctrl } : {}),
          ...(meta ? { meta } : {}),
          ...(shift ? { shift } : {}),
          ...(alt ? { alt } : {}),
        };
  return { kind: "keys", shortcut };
}

/**
 * Why `shortcut` cannot be a command's keys, or null when it can: it types
 * or moves in the sheet, or the browser or the operating system keeps it.
 */
export function refusedKeys(
  shortcut: KeyShortcut,
  environment = currentEnvironment(),
): string | null {
  const parsed = parseShortcut(shortcut);
  // With Ctrl or Alt, Page Up and Page Down switch sheets, as in Excel, so they can be assigned.
  const switchesSheets =
    (parsed.key === "pageup" || parsed.key === "pagedown") && (parsed.ctrl || parsed.alt);
  if (SHEET_KEYS.has(parsed.key) && !switchesSheets) {
    return `${keysLabel(shortcut)} moves or edits in the sheet, as in Excel, so it can't be assigned.`;
  }
  const bare = !parsed.ctrl && !parsed.meta && !parsed.alt;
  if (bare && !/^f\d+$/.test(parsed.key) && parsed.key !== "delete" && parsed.key !== "insert") {
    return environment.platform === "mac"
      ? "Add ⌘, ⌃ or ⌥: without them, keys type into the cell."
      : "Add Ctrl or Alt: without them, keys type into the cell.";
  }
  if (bare && !parsed.shift && (parsed.key === "f2" || parsed.key === "f4")) {
    return `${keysLabel(shortcut)} edits the active cell, as in Excel, so it can't be assigned.`;
  }
  return reservedReason(parsed, environment);
}

/** The browser engine and the operating system the page runs in. */
export interface Environment {
  readonly engine: "chromium" | "firefox" | "webkit" | "other";
  readonly platform: "mac" | "windows" | "linux";
}

function currentEnvironment(): Environment {
  const agent = navigator.userAgent;
  const engine = /Firefox\//.test(agent)
    ? "firefox"
    : /Chrom(e|ium)\/|Edg\//.test(agent)
      ? "chromium"
      : /AppleWebKit\//.test(agent)
        ? "webkit"
        : "other";
  const platform = isMac()
    ? "mac"
    : /Win/.test(navigator.platform) || /Windows/.test(agent)
      ? "windows"
      : "linux";
  return { engine, platform };
}

/**
 * Keys the browser or the operating system acts on without passing them to
 * the page, with what they do. Sources: Chromium's `kReservedCommandIds`
 * (chrome/browser/ui/accelerator_table.cc) and its bindings, Firefox's
 * `reserved="true"` keys (browser/base/content/browser-sets.inc.xhtml),
 * and Apple's, Microsoft's and GNOME's lists of system shortcuts.
 */
function reservedKeys(environment: Environment): readonly (readonly [string, string, string])[] {
  const { engine, platform } = environment;
  const mac = platform === "mac";
  const accel = mac ? "Meta" : "Ctrl";
  const chrome = "Chrome and Edge";
  const keys: (readonly [string, string, string])[] = [];
  if (engine === "chromium") {
    keys.push(
      [`${accel}+N`, chrome, "open a new window"],
      [`${accel}+Shift+N`, chrome, "open an incognito window"],
      [`${accel}+T`, chrome, "open a new tab"],
      [`${accel}+Shift+T`, chrome, "reopen a closed tab"],
      [`${accel}+W`, chrome, "close the tab"],
      [`${accel}+Shift+W`, chrome, "close the window"],
      ["Ctrl+Tab", chrome, "switch tabs"],
      ["Ctrl+Shift+Tab", chrome, "switch tabs"],
      ["Ctrl+PageUp", chrome, "switch tabs"],
      ["Ctrl+PageDown", chrome, "switch tabs"],
    );
    if (mac) {
      keys.push(
        ["Meta+Shift+[", chrome, "switch tabs"],
        ["Meta+Shift+]", chrome, "switch tabs"],
        ["Meta+Alt+ArrowLeft", chrome, "switch tabs"],
        ["Meta+Alt+ArrowRight", chrome, "switch tabs"],
      );
    } else {
      keys.push(["Ctrl+F4", chrome, "close the tab"]);
    }
  } else if (engine === "firefox") {
    keys.push(
      [`${accel}+N`, "Firefox", "open a new window"],
      [`${accel}+T`, "Firefox", "open a new tab"],
      [`${accel}+W`, "Firefox", "close the tab"],
      [`${accel}+Shift+W`, "Firefox", "close the window"],
      [`${accel}+Shift+P`, "Firefox", "open a private window"],
    );
    if (platform === "linux") keys.push(["Ctrl+Q", "Firefox", "quit"]);
    if (platform === "windows") keys.push(["Ctrl+Shift+Q", "Firefox", "quit"]);
  }
  if (mac) {
    keys.push(
      ["Meta+Q", "macOS", "quit the browser"],
      ["Meta+H", "macOS", "hide the browser"],
      ["Meta+M", "macOS", "minimize the window"],
      ["Meta+Tab", "macOS", "switch apps"],
      ["Meta+`", "macOS", "switch windows"],
      ["Meta+ ", "macOS", "open Spotlight"],
      ["Meta+Shift+3", "macOS", "take a screenshot"],
      ["Meta+Shift+4", "macOS", "take a screenshot"],
      ["Meta+Shift+5", "macOS", "take a screenshot"],
      ["Meta+Alt+Escape", "macOS", "force apps to quit"],
      ["Ctrl+ArrowUp", "macOS", "open Mission Control"],
      ["Ctrl+ArrowDown", "macOS", "show the app's windows"],
      ["Ctrl+ArrowLeft", "macOS", "switch spaces"],
      ["Ctrl+ArrowRight", "macOS", "switch spaces"],
    );
  } else {
    const system = platform === "windows" ? "Windows" : "Linux";
    keys.push(
      ["Alt+Tab", system, "switch windows"],
      ["Alt+F4", system, "close the window"],
      ["Ctrl+Alt+Delete", system, "open the security screen"],
    );
    if (platform === "windows") keys.push(["Ctrl+Shift+Escape", system, "open Task Manager"]);
    else keys.push(["Alt+F2", system, "run a command"]);
  }
  return keys;
}

/** The one key press a shortcut asks for on this platform. */
function press(shortcut: ParsedShortcut, mac: boolean): string {
  const ctrl = shortcut.either ? !mac : shortcut.ctrl;
  const meta = shortcut.either ? mac : shortcut.meta;
  return `${Number(ctrl)}${Number(meta)}${Number(shortcut.shift)}${Number(shortcut.alt)}:${shortcut.key}`;
}

/** Why the page never receives `shortcut` here, or null when it does. */
function reservedReason(
  shortcut: ParsedShortcut,
  environment = currentEnvironment(),
): string | null {
  const mac = environment.platform === "mac";
  if (shortcut.meta && !shortcut.either && !mac) {
    const key = environment.platform === "windows" ? "the Windows key" : "the Super key";
    return `The operating system keeps ${key}, so the page never receives ${formatShortcut(shortcut)}.`;
  }
  const pressed = press(shortcut, mac);
  for (const [keys, who, what] of reservedKeys(environment)) {
    const reserved = parseShortcut(keys as KeyShortcut);
    if (press(reserved, mac) !== pressed) continue;
    const verb = who === "Chrome and Edge" ? "use" : "uses";
    return `${who} ${verb} ${formatShortcut(reserved)} to ${what}, so the page never receives it.`;
  }
  return null;
}

/** The reason the first of `action`'s keys never reaches the page here, if one doesn't. */
export function unreachableKeys(action: KeyboardAction, bindings: KeyBindings): string | null {
  for (const key of keysOf(action, bindings)) {
    const reason = reservedReason(parseShortcut(key));
    if (reason !== null) return reason;
  }
  return null;
}

/** The host's `config.keyboard` options, when the grid's keys can be rebound at all. */
export function keyboardOptions(config: GridConfig | undefined): KeyboardOptions | null {
  const keyboard = config?.keyboard ?? true;
  if (keyboard === true) return {};
  return typeof keyboard === "object" ? keyboard : null;
}

/** `config` with `bindings` as its keyboard bindings. */
export function withBindings(config: GridConfig | undefined, bindings: KeyBindings): GridConfig {
  return { ...config, keyboard: { ...keyboardOptions(config), bindings } };
}

/**
 * Why the grid cannot take `bindings`, or null when it can: building its
 * keymap finds every conflict, a host's context-menu shortcuts included.
 */
export function conflictIn(config: GridConfig | undefined, bindings: KeyBindings): string | null {
  try {
    new Keymap(withBindings(config, bindings));
    return null;
  } catch (error) {
    if (!(error instanceof SheetwriteError) || error.code !== "shortcut-conflict") throw error;
    const context = error.context as
      | { readonly commands?: readonly string[]; readonly shortcut?: string }
      | undefined;
    // The error keeps a frozen copy of its context, without Array.prototype.
    const commands = Array.from(context?.commands ?? []);
    const names = commands.map((name) => (isKeyboardAction(name) ? commandLabel(name) : name));
    return `${context?.shortcut ?? "These keys"} is assigned to both ${names.join(" and ")}.`;
  }
}

const EXPORT_TAG = "keyboard-shortcuts";

/** The bindings as a JSON file another grid can import. */
export function exportBindings(bindings: KeyBindings): string {
  return JSON.stringify(
    { sheetwrite: EXPORT_TAG, version: 1, bindings: normalizeBindings(bindings) },
    null,
    2,
  );
}

/**
 * Read an exported file, or a bare bindings object. Locked actions keep the
 * keys they have in `current`. Returns the new bindings, or why the file
 * cannot be used.
 */
export function importBindings(
  text: string,
  current: KeyBindings,
  locked: ReadonlySet<KeyboardAction>,
  config?: GridConfig,
): { readonly bindings: KeyBindings } | { readonly error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "The file is not JSON." };
  }
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const source = record(data) && record(data.bindings) ? data.bindings : data;
  if (!record(source)) return { error: "The file holds no key bindings." };

  const bindings: Partial<Record<KeyboardAction, readonly KeyShortcut[] | null>> = {};
  for (const [action, value] of Object.entries(source)) {
    if (!isKeyboardAction(action)) return { error: `“${action}” is not a command.` };
    if (locked.has(action)) continue;
    if (value === null) {
      bindings[action] = null;
      continue;
    }
    const keys = (Array.isArray(value) ? value : [value]) as KeyShortcut[];
    for (const key of keys) {
      let reason: string | null;
      try {
        reason = refusedKeys(key);
      } catch (error) {
        reason = error instanceof SheetwriteError ? error.message : "These keys are not valid.";
      }
      if (reason !== null) return { error: `${commandLabel(action)}: ${reason}` };
    }
    bindings[action] = keys;
  }
  for (const action of locked) {
    if (current[action] !== undefined)
      bindings[action] = current[action] as readonly KeyShortcut[] | null;
  }
  const next = normalizeBindings(bindings);
  const conflict = conflictIn(config, next);
  return conflict === null ? { bindings: next } : { error: conflict };
}

// The Keyboard shortcuts panel (#802): a modal dialog where the user rebinds
// the grid's built-in commands. The grid loads this chunk on first use
// (`Grid.openKeyboardSettings`). Each change applies at once through
// `setConfig` and reaches the host as one `key-bindings-change` event; the
// host stores the bindings, which are a user preference, not workbook data.

import { type DialogHost, openDialog } from "./dialog.js";
import {
  assignKeys,
  COMMAND_GROUPS,
  commandLabel,
  conflictIn,
  exportBindings,
  importBindings,
  isChanged,
  keyboardOptions,
  keysLabel,
  keysOf,
  type KeySlot,
  matchesQuery,
  normalizeBindings,
  ownerOf,
  ownersOf,
  readKeys,
  refusedKeys,
  unreachableKeys,
  withBindings,
  withKeys,
} from "./keyboard-settings-model.js";
import { defaultKeys } from "./keymap.js";
import { checkStylePart } from "./style-parts.js";
import type { Grid, GridConfig, KeyBindings, KeyboardAction, KeyShortcut } from "./types/grid.js";

/** What the panel needs from the grid that opens it. */
export interface KeyboardSettingsHost {
  readonly grid: Grid;
  readonly dialogs: DialogHost;
  /** The element that had focus when the panel was asked for; focus goes back to it. */
  readonly opener: Element | null;
  config(): GridConfig | undefined;
  /** Emit `key-bindings-change` with the bindings now applied. */
  changed(bindings: KeyBindings): void;
}

/** Open the panel over the grid. */
export function openKeyboardSettings(host: KeyboardSettingsHost): void {
  new KeyboardSettingsPanel(host);
}

const COMMAND_COUNT = COMMAND_GROUPS.reduce((count, group) => count + group.commands.length, 0);
/** With Ctrl or ⌘, these keys edit the search text, so they never search by keys. */
const TEXT_EDITING_KEYS = /^(a|c|v|x|y|z|arrow.*|home|end|backspace|delete)$/;

let panelCount = 0;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string, label?: string): HTMLButtonElement {
  const node = element("button", className, text);
  node.type = "button";
  if (label !== undefined) node.setAttribute("aria-label", label);
  return node;
}

function keysList(action: KeyboardAction, bindings: KeyBindings): string {
  return keysOf(action, bindings).map(keysLabel).join(", ") || "no keys";
}

/** The key slot being recorded: a key's position, or null for added keys. */
interface Recording {
  readonly action: KeyboardAction;
  readonly index: number | null;
  readonly field: HTMLButtonElement;
}

interface Conflict {
  readonly action: KeyboardAction;
  readonly index: number | null;
  readonly shortcut: KeyShortcut;
  readonly owner: KeySlot;
}

class KeyboardSettingsPanel {
  private readonly host: KeyboardSettingsHost;
  private readonly locked: ReadonlySet<KeyboardAction>;
  /** The host handles keys itself (`keyboard: false` or a function): nothing can change. */
  private readonly fixed: boolean;
  private bindings: KeyBindings;
  private query = "";
  /** Keys pressed in the search box; the list shows the commands they run. */
  private pressed: KeyShortcut | null = null;
  private changedOnly = false;
  private recording: Recording | null = null;
  private conflict: Conflict | null = null;
  /** The bindings the toast's Undo restores. */
  private undoTo: KeyBindings | null = null;

  private readonly body: HTMLDivElement;
  private readonly search: HTMLInputElement;
  private readonly count: HTMLSpanElement;
  private readonly rows: HTMLTableSectionElement;
  private readonly prompt: HTMLDivElement;
  private readonly promptText: HTMLParagraphElement;
  private readonly promptButtons: HTMLDivElement;
  private readonly message: HTMLParagraphElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly file: HTMLInputElement;

  constructor(host: KeyboardSettingsHost) {
    this.host = host;
    const config = host.config();
    const settings = config?.keyboardSettings;
    this.locked = new Set(typeof settings === "object" ? (settings.locked ?? []) : []);
    const options = keyboardOptions(config);
    this.fixed = options === null;
    this.bindings = normalizeBindings(options?.bindings ?? {});

    const id = `sheetwrite-keys-${++panelCount}`;
    this.body = element("div", "sheetwrite-keys");

    const toolbar = element("div", "sheetwrite-keys-toolbar");
    this.search = element("input", "sheetwrite-dialog-control sheetwrite-keys-search");
    this.search.type = "search";
    this.search.placeholder = "Search, or press keys";
    this.search.autocomplete = "off";
    this.search.spellcheck = false;
    this.search.setAttribute("aria-label", "Search commands or press keys");
    this.search.setAttribute("aria-describedby", `${id}-hint`);
    this.search.setAttribute("aria-controls", `${id}-table`);
    this.search.addEventListener("input", () => {
      this.query = this.search.value;
      this.pressed = null;
      this.render();
    });

    const changedLabel = element("label", "sheetwrite-keys-filter");
    const changedOnly = element("input", "");
    changedOnly.type = "checkbox";
    changedOnly.setAttribute("aria-label", "Show changed only");
    changedOnly.addEventListener("change", () => {
      this.changedOnly = changedOnly.checked;
      this.render();
    });
    changedLabel.append(changedOnly, " Show changed only");
    this.count = element("span", "sheetwrite-keys-count");
    toolbar.append(this.search, changedLabel, this.count);

    const hint = element(
      "p",
      "sheetwrite-keys-hint",
      this.fixed
        ? "Your app handles the keys itself, so they can't be changed here."
        : "Type a name or keys, or press keys to find the command that uses them. Excel's keys are the defaults. F6 and Shift+F6 always move to the next or previous part of the window, and out of the grid.",
    );
    hint.id = `${id}-hint`;

    this.prompt = element("div", "sheetwrite-keys-conflict");
    this.prompt.setAttribute("role", "group");
    this.prompt.setAttribute("aria-labelledby", `${id}-conflict`);
    this.prompt.hidden = true;
    this.promptText = element("p", "sheetwrite-keys-conflict-text");
    this.promptText.id = `${id}-conflict`;
    this.promptButtons = element("div", "sheetwrite-keys-conflict-buttons");
    this.prompt.append(this.promptText, this.promptButtons);

    const scroll = element("div", "sheetwrite-keys-scroll");
    const table = element("table", "sheetwrite-keys-table");
    table.id = `${id}-table`;
    table.setAttribute("aria-label", "Commands and their keys");
    const head = element("thead", "");
    const headRow = element("tr", "");
    for (const [text, hidden] of [
      ["Command", false],
      ["Keys", false],
      ["Excel default", false],
      ["Reset", true],
    ] as const) {
      const cell = element("th", hidden ? "sheetwrite-keys-hidden-label" : "", text);
      cell.scope = "col";
      headRow.append(cell);
    }
    head.append(headRow);
    this.rows = element("tbody", "");
    table.append(head, this.rows);
    scroll.append(table);

    const toast = element("div", "sheetwrite-keys-toast");
    this.message = element("p", "sheetwrite-keys-message");
    this.message.setAttribute("role", "status");
    this.undoButton = button("sheetwrite-dialog-button sheetwrite-keys-undo", "Undo");
    this.undoButton.hidden = true;
    this.undoButton.addEventListener("click", () => {
      if (this.undoTo !== null) this.commit(this.undoTo, "Undid the last change.", null, false);
    });
    toast.append(this.message, this.undoButton);

    this.file = element("input", "");
    this.file.type = "file";
    this.file.accept = ".json,application/json";
    this.file.hidden = true;
    this.file.addEventListener("change", () => void this.importFile());

    this.body.append(toolbar, hint, this.prompt, scroll, toast, this.file);
    this.body.addEventListener("keydown", this.onKeydown);
    this.body.addEventListener("focusout", this.onFocusout);
    this.render();

    const dialog = openDialog(
      { ...host.dialogs, returnFocus: () => this.returnFocus() },
      {
        title: "Keyboard shortcuts",
        body: this.body,
        buttons: [
          { label: "Import…", value: "import" },
          { label: "Export", value: "export" },
          { label: "Reset all", value: "reset" },
          { label: "Close", value: "close" },
        ],
        cancel: "close",
        initialFocus: this.search,
        accept: (value) => {
          this.footer(value);
          return false;
        },
      },
    );
    dialog.element.classList.add("sheetwrite-keyboard-settings");
    dialog.element.setAttribute("aria-describedby", hint.id);
    checkStylePart(dialog.element, "panels", "The Keyboard shortcuts panel");
  }

  private footer(value: string): void {
    if (this.fixed) {
      this.say("Your app handles the keys itself, so they can't be changed here.");
    } else if (value === "import") {
      this.file.click();
    } else if (value === "export") {
      this.exportFile();
    } else if (value === "reset") {
      this.resetAll();
    }
  }

  /** Rebuild the rows for the bindings, search and filter. Focus stays where it is. */
  private render(): void {
    const owners = this.pressed === null ? null : ownersOf(this.bindings, this.pressed);
    let shown = 0;
    let changed = 0;
    const rows: HTMLTableRowElement[] = [];
    for (const group of COMMAND_GROUPS) {
      const header = element("tr", "sheetwrite-keys-group");
      const title = element("th", "", group.label);
      title.scope = "rowgroup";
      title.colSpan = 4;
      header.append(title);
      rows.push(header);
      let groupShown = 0;
      for (const [action, label] of group.commands) {
        const isActionChanged = isChanged(action, this.bindings);
        if (isActionChanged) changed += 1;
        const visible =
          (owners === null
            ? matchesQuery(action, group.label, this.bindings, this.query)
            : owners.has(action)) &&
          (!this.changedOnly || isActionChanged);
        const row = this.renderRow(action, label, isActionChanged);
        row.hidden = !visible;
        if (visible) groupShown += 1;
        rows.push(row);
      }
      header.hidden = groupShown === 0;
      shown += groupShown;
    }
    if (shown === 0) {
      const empty = element("tr", "sheetwrite-keys-empty");
      const cell = element(
        "td",
        "",
        this.pressed !== null
          ? `No command uses ${keysLabel(this.pressed)}.`
          : this.changedOnly && this.query.trim() === ""
            ? "No command has changed keys."
            : `No command matches “${this.query.trim()}”.`,
      );
      cell.colSpan = 4;
      empty.append(cell);
      rows.push(empty);
    }
    this.rows.replaceChildren(...rows);
    const total =
      shown === COMMAND_COUNT ? `${shown} commands` : `${shown} of ${COMMAND_COUNT} commands`;
    this.count.textContent = `${total}, ${changed} changed`;
  }

  private renderRow(action: KeyboardAction, label: string, changed: boolean): HTMLTableRowElement {
    const row = element("tr", "");
    row.dataset.action = action;
    const name = element("th", "", label);
    name.scope = "row";

    const keysCell = element("td", "sheetwrite-keys-current");
    const keys = keysOf(action, this.bindings);
    const editable = !this.fixed && !this.locked.has(action);
    keys.forEach((key, index) => {
      const text = keysLabel(key);
      const chip = element("span", "sheetwrite-keys-chip");
      if (editable) {
        const change = button("sheetwrite-keys-change", text, `Change ${text} for ${label}`);
        change.dataset.focus = `${action}:${index}`;
        change.addEventListener("click", () => this.startRecording(action, index, change));
        const remove = button("sheetwrite-keys-remove", "×", `Remove ${text} from ${label}`);
        remove.dataset.focus = `${action}:${index}:remove`;
        remove.addEventListener("click", () => this.removeKey(action, index));
        chip.append(change, remove);
      } else {
        chip.append(element("kbd", "", text));
      }
      keysCell.append(chip);
    });
    if (keys.length === 0) keysCell.append(element("span", "sheetwrite-keys-none", "None"));
    if (editable) {
      const add = button("sheetwrite-keys-add", "+", `Add keys for ${label}`);
      add.dataset.focus = `${action}:add`;
      add.title = `Add keys for ${label}`;
      add.addEventListener("click", () => this.startRecording(action, null, add));
      keysCell.append(add);
    }
    const unreachable = unreachableKeys(action, this.bindings);
    if (unreachable !== null) keysCell.append(element("p", "sheetwrite-keys-warning", unreachable));

    const defaults = element(
      "td",
      "sheetwrite-keys-default",
      defaultKeys(action).map(keysLabel).join(", ") || "None",
    );
    defaults.dataset.default = "";

    const reset = element("td", "sheetwrite-keys-reset");
    if (!editable) {
      reset.textContent = "Set by your app";
    } else if (changed) {
      const resetButton = button("sheetwrite-keys-reset-button", "Reset", `Reset ${label}`);
      resetButton.dataset.focus = `${action}:reset`;
      resetButton.addEventListener("click", () => this.resetAction(action));
      reset.append(resetButton);
    }

    row.append(name, keysCell, defaults, reset);
    return row;
  }

  private focusSlot(key: string | null): void {
    const target =
      (key === null ? null : this.rows.querySelector<HTMLElement>(`[data-focus="${key}"]`)) ??
      this.search;
    target.focus();
  }

  private say(message: string, undo = false): void {
    this.message.textContent = message;
    this.undoButton.hidden = !undo;
  }

  private startRecording(
    action: KeyboardAction,
    index: number | null,
    field: HTMLButtonElement,
  ): void {
    if (this.recording !== null) this.stopRecording(null);
    this.closeConflict();
    const label = commandLabel(action);
    this.recording = { action, index, field };
    field.textContent = "Press keys…";
    field.setAttribute("aria-label", `Recording keys for ${label}`);
    field.dataset.recording = "";
    field.focus();
    this.say(`Recording keys for ${label}. Press the new keys, or Escape to cancel.`);
  }

  /** Leave recording mode; the row shows its keys again and keeps the focus. */
  private stopRecording(message: string | null): void {
    const recording = this.recording;
    if (recording === null) return;
    this.recording = null;
    this.render();
    this.focusSlot(`${recording.action}:${recording.index ?? "add"}`);
    if (message !== null) this.say(message);
  }

  private readonly onFocusout = (event: FocusEvent): void => {
    // Focus left the field being recorded, as a click elsewhere moves it.
    if (this.recording !== null && event.target === this.recording.field) {
      const recording = this.recording;
      queueMicrotask(() => {
        if (this.recording === recording && document.activeElement !== recording.field) {
          this.stopRecording(null);
        }
      });
    }
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    if (this.recording !== null && event.target === this.recording.field) {
      this.recordKey(event, this.recording);
    } else if (event.target === this.search) {
      this.searchKey(event);
    } else if (
      this.conflict !== null &&
      event.key === "Escape" &&
      event.target instanceof Node &&
      this.prompt.contains(event.target)
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.resolveConflict(null);
    }
  };

  private recordKey(event: KeyboardEvent, recording: Recording): void {
    // Tab leaves recording and moves on from the slot, so the keyboard is
    // never trapped; the browser moves focus after this handler.
    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.stopRecording(null);
      return;
    }
    // Every other key belongs to the recording, not to the browser or the dialog.
    event.preventDefault();
    event.stopPropagation();
    const { action, index, field } = recording;
    const label = commandLabel(action);
    if (
      event.key === "Escape" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      this.stopRecording(`Stopped recording. ${label} keeps ${keysList(action, this.bindings)}.`);
      return;
    }
    const read = readKeys(event);
    if (read.kind === "pending") {
      field.textContent = read.label;
      return;
    }
    const refused = refusedKeys(read.shortcut);
    if (refused !== null) {
      field.textContent = "Press keys…";
      this.say(refused);
      return;
    }
    const owner = ownerOf(
      this.bindings,
      read.shortcut,
      index === null ? undefined : { action, index },
    );
    if (owner?.action === action) {
      this.say(`${label} already uses ${keysLabel(read.shortcut)}.`);
      return;
    }
    if (owner !== null) {
      field.textContent = keysLabel(read.shortcut);
      this.askConflict({ action, index, shortcut: read.shortcut, owner });
      return;
    }
    this.assign(action, index, read.shortcut, "replace");
  }

  /** Keys pressed in the search box find their command; text-editing keys still edit. */
  private searchKey(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.search.value !== "") {
      event.preventDefault();
      event.stopPropagation();
      this.search.value = "";
      this.query = "";
      this.pressed = null;
      this.render();
      return;
    }
    const functionKey = /^F\d+$/.test(event.key);
    const mod = event.ctrlKey || event.metaKey;
    if (!mod && !event.altKey && !functionKey) return;
    if (mod && !event.altKey && TEXT_EDITING_KEYS.test(event.key.toLowerCase())) return;
    const read = readKeys(event);
    if (read.kind === "pending") return;
    event.preventDefault();
    event.stopPropagation();
    this.pressed = read.shortcut;
    this.query = "";
    this.search.value = keysLabel(read.shortcut);
    this.render();
  }

  private askConflict(conflict: Conflict): void {
    this.recording = null;
    this.conflict = conflict;
    const keys = keysLabel(conflict.shortcut);
    const other = commandLabel(conflict.owner.action);
    const lockedOwner = this.locked.has(conflict.owner.action);
    this.promptText.textContent = lockedOwner
      ? `${keys} is assigned to ${other}, which your app keeps fixed.`
      : `${keys} is assigned to ${other}.`;
    const choices: HTMLButtonElement[] = [];
    if (!lockedOwner && conflict.index !== null) {
      const swap = button("sheetwrite-dialog-button sheetwrite-dialog-default", "Swap");
      swap.title = `${other} takes ${keysLabel(keysOf(conflict.action, this.bindings)[conflict.index]!)}`;
      swap.addEventListener("click", () => this.resolveConflict("swap"));
      choices.push(swap);
    }
    if (!lockedOwner) {
      const replace = button("sheetwrite-dialog-button", "Replace");
      replace.title = `${other} loses ${keys}`;
      replace.addEventListener("click", () => this.resolveConflict("replace"));
      choices.push(replace);
    }
    const cancel = button("sheetwrite-dialog-button", "Cancel");
    cancel.addEventListener("click", () => this.resolveConflict(null));
    choices.push(cancel);
    this.promptButtons.replaceChildren(...choices);
    this.prompt.hidden = false;
    choices[0]!.focus();
  }

  private closeConflict(): Conflict | null {
    const conflict = this.conflict;
    this.conflict = null;
    this.prompt.hidden = true;
    this.promptButtons.replaceChildren();
    return conflict;
  }

  private resolveConflict(resolution: "swap" | "replace" | null): void {
    const conflict = this.closeConflict();
    if (conflict === null) return;
    if (resolution === null) {
      this.render();
      this.focusSlot(`${conflict.action}:${conflict.index ?? "add"}`);
      this.say(
        `${commandLabel(conflict.action)} keeps ${keysList(conflict.action, this.bindings)}.`,
      );
      return;
    }
    this.assign(conflict.action, conflict.index, conflict.shortcut, resolution, conflict.owner);
  }

  private assign(
    action: KeyboardAction,
    index: number | null,
    shortcut: KeyShortcut,
    resolution: "swap" | "replace",
    owner?: KeySlot,
  ): void {
    const next = assignKeys(this.bindings, action, index, shortcut, resolution);
    const label = commandLabel(action);
    let message = `${label} now uses ${keysList(action, next)}.`;
    if (owner !== undefined) {
      const other = commandLabel(owner.action);
      message +=
        resolution === "swap"
          ? ` ${other} now uses ${keysList(owner.action, next)}.`
          : ` ${other} no longer uses ${keysLabel(shortcut)}.`;
    }
    const slot = index ?? keysOf(action, next).length - 1;
    this.commit(next, message, `${action}:${slot}`);
  }

  private removeKey(action: KeyboardAction, index: number): void {
    const keys = [...keysOf(action, this.bindings)];
    const [removed] = keys.splice(index, 1);
    const label = commandLabel(action);
    const focus =
      keys.length === 0 ? `${action}:add` : `${action}:${Math.min(index, keys.length - 1)}`;
    this.commit(
      withKeys(this.bindings, action, keys),
      `${label} no longer uses ${removed === undefined ? "those keys" : keysLabel(removed)}.`,
      focus,
    );
  }

  private resetAction(action: KeyboardAction): void {
    const next: Partial<Record<KeyboardAction, unknown>> = { ...this.bindings };
    delete next[action];
    this.commit(
      normalizeBindings(next as KeyBindings),
      `${commandLabel(action)} is back to Excel's ${keysList(action, {})}.`,
      `${action}:0`,
    );
  }

  private resetAll(): void {
    const next: Partial<Record<KeyboardAction, unknown>> = {};
    for (const action of this.locked) {
      if (this.bindings[action] !== undefined) next[action] = this.bindings[action];
    }
    const kept = normalizeBindings(next as KeyBindings);
    if (Object.keys(kept).length === Object.keys(this.bindings).length) {
      this.say("Every command already has Excel's keys.");
      return;
    }
    this.commit(kept, "Every command is back to Excel's keys.", null);
  }

  private async importFile(): Promise<void> {
    const file = this.file.files?.[0];
    if (file === undefined) return;
    const text = await file.text();
    this.file.value = "";
    const result = importBindings(text, this.bindings, this.locked, this.host.config());
    if ("error" in result) {
      this.say(result.error);
      return;
    }
    const count = Object.keys(result.bindings).length;
    this.commit(
      result.bindings,
      `Imported ${file.name}: ${count} ${count === 1 ? "command differs" : "commands differ"} from Excel's keys.`,
      null,
    );
  }

  private exportFile(): void {
    const name = "keyboard-shortcuts.json";
    const link = element("a", "");
    link.href = `data:application/json;charset=utf-8,${encodeURIComponent(exportBindings(this.bindings))}`;
    link.download = name;
    link.hidden = true;
    this.body.append(link);
    link.click();
    link.remove();
    const count = Object.keys(this.bindings).length;
    this.say(`Exported ${count} changed ${count === 1 ? "command" : "commands"} as ${name}.`);
  }

  /**
   * Apply `next` as one change: the grid takes it at once and the host hears
   * of it once. A conflict the panel did not catch (a host's context-menu
   * shortcut) leaves everything as it was.
   */
  private commit(next: KeyBindings, message: string, focus: string | null, undoable = true): void {
    const config = this.host.config();
    const conflict = conflictIn(config, next);
    if (conflict !== null) {
      this.recording = null;
      this.render();
      this.say(conflict);
      return;
    }
    const previous = this.bindings;
    this.bindings = next;
    this.recording = null;
    this.host.grid.setConfig(withBindings(config, next));
    this.host.changed(next);
    this.undoTo = undoable ? previous : null;
    this.render();
    if (focus !== null) this.focusSlot(focus);
    this.say(message, undoable);
  }

  /**
   * Focus goes back where it came from. A ribbon rebuilt by the change has a
   * new button for the same command, which takes the focus instead.
   */
  private returnFocus(): void {
    const opener = this.host.opener;
    if (
      opener instanceof HTMLElement &&
      opener.isConnected &&
      opener !== opener.ownerDocument.body
    ) {
      opener.focus();
      return;
    }
    const command = opener instanceof HTMLElement ? opener.dataset.command : undefined;
    const again =
      command === undefined
        ? undefined
        : [
            ...this.host.dialogs.host.querySelectorAll<HTMLElement>(`[data-command="${command}"]`),
          ].find((candidate) => candidate.closest("[hidden]") === null);
    if (again !== undefined) again.focus();
    else this.host.dialogs.returnFocus();
  }
}

import type { EditNavigate, EditRect } from "./editor.js";
import type { CellScalar } from "./types/cell.js";
import type { DataValidationRule } from "./types/document.js";
import type { Theme } from "./types/render.js";

export interface BeginValidationEditOptions {
  row: number;
  col: number;
  rule: DataValidationRule;
  /** A list rule's items, in order; a checkbox rule ignores them. */
  values: readonly CellScalar[];
  current: CellScalar;
  /**
   * Text typed into the cell that opened the list. It shows in the list's
   * box and keeps only the items that contain it; empty shows them all.
   */
  filter: string;
  rect: EditRect;
  theme: Theme;
  onCommit: (value: CellScalar, navigate: EditNavigate) => void;
  /** Typed text that is none of the items, stored as typed: the grid then checks it against the rule. */
  onCommitText: (text: string, navigate: EditNavigate) => void;
  onCancel: () => void;
}

function validation_label(value: CellScalar): string {
  if (value === null) return "(blank)";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

let list_count = 0;

/**
 * Accessible DOM overlay for list and checkbox validation rules. A list is a
 * combobox: a text box over the cell and the rule's items below it, as
 * Excel's dropdown. Typing in the box keeps only the items that contain the
 * text, as Excel's AutoComplete for dropdown lists does. A list opened
 * without typing (Alt+Down, the arrow) leaves the cell showing its value, as
 * in Excel: its box stays out of sight until the first typed text, which
 * then replaces the value in the cell and filters the list.
 */
export class ValidationEditor {
  private readonly host: HTMLElement;
  private root: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private listbox: HTMLElement | null = null;
  private options: BeginValidationEditOptions | null = null;
  private values: readonly CellScalar[] = [];
  /** Indices into `values` of the items the filter keeps, in list order. */
  private shown: number[] = [];
  /** Position in `shown` of the highlighted item; -1 while none is. */
  private active_index = -1;
  private checkbox_value: CellScalar = false;
  /** The cell the editor sits on, kept so the list's box can move over it once typing starts. */
  private rect: EditRect | null = null;
  /** A list opened without typing: its box stays hidden, so the cell keeps showing its value. */
  private idle = false;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  get isEditing(): boolean {
    return this.root !== null;
  }

  begin(options: BeginValidationEditOptions): void {
    this.cancel(false);
    const condition = options.rule.condition;
    if (condition.kind !== "list" && condition.kind !== "checkbox") return;

    this.options = options;
    if (condition.kind === "list") this.begin_list(options);
    else this.begin_checkbox(options);
    this.position(options.rect);
    const focus_target = this.input ?? this.root;
    focus_target?.focus();
    this.input?.setSelectionRange(options.filter.length, options.filter.length);
  }

  position(rect: EditRect): void {
    const root = this.root;
    if (!root) return;
    this.rect = rect;
    root.style.left = `${rect.x}px`;
    if (this.input && !this.idle) {
      root.style.top = `${rect.y}px`;
      this.input.style.height = `${rect.h}px`;
    } else {
      // A checkbox, or a list whose box is out of sight: below the cell.
      root.style.top = `${rect.y + rect.h}px`;
    }
    root.style.minWidth = `${Math.max(120, rect.w)}px`;
  }

  cancel(notify = true): void {
    const options = this.options;
    const root = this.root;
    this.root = null;
    this.input = null;
    this.listbox = null;
    this.options = null;
    this.values = [];
    this.shown = [];
    this.active_index = -1;
    this.rect = null;
    this.idle = false;
    root?.remove();
    if (notify) options?.onCancel();
  }

  destroy(): void {
    this.cancel(false);
  }

  private begin_list(options: BeginValidationEditOptions): void {
    const root = document.createElement("div");
    root.className = "sheetwrite-validation-combo";
    this.apply_theme(root, options.theme);

    const list_id = `sheetwrite-validation-list-${++list_count}`;
    const input = document.createElement("input");
    input.className = "sheetwrite-validation-input";
    input.type = "text";
    input.value = options.filter;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", list_id);
    input.setAttribute("aria-label", options.rule.inputTitle || "Choose a value");
    input.addEventListener("keydown", this.on_list_key_down);
    input.addEventListener("input", this.on_list_input);
    input.addEventListener("blur", this.on_blur);

    const listbox = document.createElement("div");
    listbox.className = "sheetwrite-validation-list";
    listbox.id = list_id;
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("aria-label", options.rule.inputTitle || "Choices");
    // A press on an item keeps the focus in the box, so its click commits.
    listbox.addEventListener("pointerdown", (event) => event.preventDefault());

    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.append(input, listbox);
    this.host.appendChild(root);
    this.root = root;
    this.input = input;
    this.listbox = listbox;
    this.values = options.values;
    // Without typed text, the box would cover the cell's value with an empty field.
    if (options.filter === "") {
      this.idle = true;
      input.classList.add("sheetwrite-validation-input-idle");
    }
    this.render_list();
    // Opened without typing, the list starts on the cell's own value, as in Excel.
    if (options.filter === "") {
      this.set_active(
        this.shown.findIndex((index) => Object.is(this.values[index], options.current)),
      );
    }
  }

  /** Show the items that contain the box's text, ignoring case; none is highlighted. */
  private render_list(): void {
    const listbox = this.listbox;
    const input = this.input;
    if (!listbox || !input) return;
    const needle = input.value.toLocaleLowerCase();
    this.shown = [];
    for (let index = 0; index < this.values.length; index++) {
      const label = validation_label(this.values[index] ?? null);
      if (label.toLocaleLowerCase().includes(needle)) this.shown.push(index);
    }
    const options = this.shown.map((index, position) => {
      const option = document.createElement("div");
      option.className = "sheetwrite-validation-option";
      option.id = `${listbox.id}-${position}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.textContent = validation_label(this.values[index] ?? null);
      option.addEventListener("click", () => this.commit_item(index, "none"));
      return option;
    });
    listbox.replaceChildren(...options);
    listbox.hidden = options.length === 0;
    input.setAttribute("aria-expanded", String(options.length > 0));
    this.set_active(-1);
  }

  private begin_checkbox(options: BeginValidationEditOptions): void {
    const condition = options.rule.condition;
    if (condition.kind !== "checkbox") return;
    const checked = condition.checkedValue ?? true;
    const unchecked = condition.uncheckedValue ?? false;
    this.checkbox_value = Object.is(options.current, checked) ? checked : unchecked;

    const root = document.createElement("button");
    root.type = "button";
    root.className = "sheetwrite-validation-checkbox";
    root.setAttribute("role", "checkbox");
    root.setAttribute("aria-label", options.rule.helpText || "Toggle checkbox");
    this.apply_theme(root, options.theme);
    this.render_checkbox(root);
    root.addEventListener("click", () => {
      this.toggle_checkbox();
      this.commit_checkbox("none");
    });
    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.addEventListener("keydown", this.on_checkbox_key_down);
    root.addEventListener("blur", this.on_blur);
    this.host.appendChild(root);
    this.root = root;
  }

  private apply_theme(root: HTMLElement, theme: Theme): void {
    root.style.setProperty("--sheetwrite-bg", theme.bg);
    root.style.setProperty("--sheetwrite-fg", theme.fg);
    root.style.setProperty("--sheetwrite-selection-border", theme.selectionBorder);
  }

  private readonly on_list_input = (): void => {
    // The first typed text replaces the cell's value: the box moves over the cell.
    if (this.idle) {
      this.idle = false;
      this.input?.classList.remove("sheetwrite-validation-input-idle");
      if (this.rect !== null) this.position(this.rect);
    }
    this.render_list();
  };

  private readonly on_list_key_down = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    const count = this.shown.length;
    if (event.key === "ArrowDown" && !event.altKey) {
      if (count > 0) this.set_active((this.active_index + 1) % count);
    } else if (event.key === "ArrowUp" && !event.altKey) {
      if (count > 0) this.set_active(this.active_index <= 0 ? count - 1 : this.active_index - 1);
    } else if (event.key === "Enter") this.commit_list(event.shiftKey ? "up" : "down");
    else if (event.key === "Tab") this.commit_list(event.shiftKey ? "left" : "right");
    else if (event.key === "Escape") this.cancel();
    else {
      // Other keys type into the box; the grid must not see them.
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly on_checkbox_key_down = (event: KeyboardEvent): void => {
    if (event.key === " " || event.key === "Spacebar") {
      this.toggle_checkbox();
      this.commit_checkbox("none");
    } else if (event.key === "Enter") this.commit_checkbox("down");
    else if (event.key === "Tab") this.commit_checkbox(event.shiftKey ? "left" : "right");
    else if (event.key === "Escape") this.cancel();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly on_blur = (event: FocusEvent): void => {
    if (event.relatedTarget instanceof Node && this.root?.contains(event.relatedTarget)) return;
    this.cancel();
  };

  private set_active(position: number): void {
    const listbox = this.listbox;
    if (!listbox || !this.input) return;
    this.active_index = position;
    const children = listbox.children;
    for (let current = 0; current < children.length; current++) {
      children[current]?.setAttribute("aria-selected", String(current === position));
    }
    const active = children[position];
    if (active instanceof HTMLElement) {
      this.input.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView?.({ block: "nearest" });
    } else {
      this.input.removeAttribute("aria-activedescendant");
    }
  }

  /**
   * Enter or Tab in the list: store the highlighted item; without one, the
   * item the text names (ignoring case), or else the text as typed.
   */
  private commit_list(navigate: EditNavigate): void {
    const options = this.options;
    const text = this.input?.value ?? "";
    if (!options) return;
    const highlighted = this.shown[this.active_index];
    if (highlighted !== undefined) {
      this.commit_item(highlighted, navigate);
      return;
    }
    const needle = text.toLocaleLowerCase();
    const named = this.values.findIndex(
      (value) => validation_label(value).toLocaleLowerCase() === needle,
    );
    if (text !== "" && named >= 0) {
      this.commit_item(named, navigate);
      return;
    }
    // A list opened and closed without a choice or text changes nothing, as in Excel.
    if (text === "") {
      this.cancel();
      return;
    }
    this.cancel(false);
    options.onCommitText(text, navigate);
  }

  private commit_item(index: number, navigate: EditNavigate): void {
    const value = this.values[index];
    const options = this.options;
    if (value === undefined || !options) return;
    this.cancel(false);
    options.onCommit(value, navigate);
  }

  private toggle_checkbox(): void {
    const options = this.options;
    const root = this.root;
    if (!options || !(root instanceof HTMLButtonElement)) return;
    const condition = options.rule.condition;
    if (condition.kind !== "checkbox") return;
    const checked = condition.checkedValue ?? true;
    const unchecked = condition.uncheckedValue ?? false;
    this.checkbox_value = Object.is(this.checkbox_value, checked) ? unchecked : checked;
    this.render_checkbox(root);
  }

  private render_checkbox(root: HTMLButtonElement): void {
    const options = this.options;
    if (options?.rule.condition.kind !== "checkbox") return;
    const checked = options.rule.condition.checkedValue ?? true;
    const is_checked = Object.is(this.checkbox_value, checked);
    root.setAttribute("aria-checked", String(is_checked));
    root.textContent = is_checked ? "✓" : "";
  }

  private commit_checkbox(navigate: EditNavigate): void {
    const options = this.options;
    if (!options) return;
    const value = this.checkbox_value;
    this.cancel(false);
    options.onCommit(value, navigate);
  }
}

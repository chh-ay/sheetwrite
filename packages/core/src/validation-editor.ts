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

function validationLabel(value: CellScalar): string {
  if (value === null) return "(blank)";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

let listCount = 0;

/**
 * Accessible DOM overlay for list and checkbox validation rules. A list is a
 * combobox: a text box over the cell and the rule's items below it, as
 * Excel's dropdown. Typing in the box keeps only the items that contain the
 * text, as Excel's AutoComplete for dropdown lists does.
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
  private activeIndex = -1;
  private checkboxValue: CellScalar = false;

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
    if (condition.kind === "list") this.beginList(options);
    else this.beginCheckbox(options);
    this.position(options.rect);
    const focusTarget = this.input ?? this.root;
    focusTarget?.focus();
    this.input?.setSelectionRange(options.filter.length, options.filter.length);
  }

  position(rect: EditRect): void {
    const root = this.root;
    if (!root) return;
    root.style.left = `${rect.x}px`;
    if (this.input) {
      root.style.top = `${rect.y}px`;
      this.input.style.height = `${rect.h}px`;
    } else {
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
    this.activeIndex = -1;
    root?.remove();
    if (notify) options?.onCancel();
  }

  destroy(): void {
    this.cancel(false);
  }

  private beginList(options: BeginValidationEditOptions): void {
    const root = document.createElement("div");
    root.className = "sheetwrite-validation-combo";
    this.applyTheme(root, options.theme);

    const listId = `sheetwrite-validation-list-${++listCount}`;
    const input = document.createElement("input");
    input.className = "sheetwrite-validation-input";
    input.type = "text";
    input.value = options.filter;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-controls", listId);
    input.setAttribute("aria-label", options.rule.inputTitle || "Choose a value");
    input.addEventListener("keydown", this.onListKeyDown);
    input.addEventListener("input", this.onListInput);
    input.addEventListener("blur", this.onBlur);

    const listbox = document.createElement("div");
    listbox.className = "sheetwrite-validation-list";
    listbox.id = listId;
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
    this.renderList();
    // Opened without typing, the list starts on the cell's own value, as in Excel.
    if (options.filter === "") {
      this.setActive(
        this.shown.findIndex((index) => Object.is(this.values[index], options.current)),
      );
    }
  }

  /** Show the items that contain the box's text, ignoring case; none is highlighted. */
  private renderList(): void {
    const listbox = this.listbox;
    const input = this.input;
    if (!listbox || !input) return;
    const needle = input.value.toLocaleLowerCase();
    this.shown = [];
    for (let index = 0; index < this.values.length; index++) {
      const label = validationLabel(this.values[index] ?? null);
      if (label.toLocaleLowerCase().includes(needle)) this.shown.push(index);
    }
    const options = this.shown.map((index, position) => {
      const option = document.createElement("div");
      option.className = "sheetwrite-validation-option";
      option.id = `${listbox.id}-${position}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.textContent = validationLabel(this.values[index] ?? null);
      option.addEventListener("click", () => this.commitItem(index, "none"));
      return option;
    });
    listbox.replaceChildren(...options);
    listbox.hidden = options.length === 0;
    input.setAttribute("aria-expanded", String(options.length > 0));
    this.setActive(-1);
  }

  private beginCheckbox(options: BeginValidationEditOptions): void {
    const condition = options.rule.condition;
    if (condition.kind !== "checkbox") return;
    const checked = condition.checkedValue ?? true;
    const unchecked = condition.uncheckedValue ?? false;
    this.checkboxValue = Object.is(options.current, checked) ? checked : unchecked;

    const root = document.createElement("button");
    root.type = "button";
    root.className = "sheetwrite-validation-checkbox";
    root.setAttribute("role", "checkbox");
    root.setAttribute("aria-label", options.rule.helpText || "Toggle checkbox");
    this.applyTheme(root, options.theme);
    this.renderCheckbox(root);
    root.addEventListener("click", () => {
      this.toggleCheckbox();
      this.commitCheckbox("none");
    });
    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.addEventListener("keydown", this.onCheckboxKeyDown);
    root.addEventListener("blur", this.onBlur);
    this.host.appendChild(root);
    this.root = root;
  }

  private applyTheme(root: HTMLElement, theme: Theme): void {
    root.style.setProperty("--sheetwrite-bg", theme.bg);
    root.style.setProperty("--sheetwrite-fg", theme.fg);
    root.style.setProperty("--sheetwrite-selection-border", theme.selectionBorder);
  }

  private readonly onListInput = (): void => {
    this.renderList();
  };

  private readonly onListKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    const count = this.shown.length;
    if (event.key === "ArrowDown" && !event.altKey) {
      if (count > 0) this.setActive((this.activeIndex + 1) % count);
    } else if (event.key === "ArrowUp" && !event.altKey) {
      if (count > 0) this.setActive(this.activeIndex <= 0 ? count - 1 : this.activeIndex - 1);
    } else if (event.key === "Enter") this.commitList(event.shiftKey ? "up" : "down");
    else if (event.key === "Tab") this.commitList(event.shiftKey ? "left" : "right");
    else if (event.key === "Escape") this.cancel();
    else {
      // Other keys type into the box; the grid must not see them.
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onCheckboxKeyDown = (event: KeyboardEvent): void => {
    if (event.key === " " || event.key === "Spacebar") {
      this.toggleCheckbox();
      this.commitCheckbox("none");
    } else if (event.key === "Enter") this.commitCheckbox("down");
    else if (event.key === "Tab") this.commitCheckbox(event.shiftKey ? "left" : "right");
    else if (event.key === "Escape") this.cancel();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onBlur = (event: FocusEvent): void => {
    if (event.relatedTarget instanceof Node && this.root?.contains(event.relatedTarget)) return;
    this.cancel();
  };

  private setActive(position: number): void {
    const listbox = this.listbox;
    if (!listbox || !this.input) return;
    this.activeIndex = position;
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
  private commitList(navigate: EditNavigate): void {
    const options = this.options;
    const text = this.input?.value ?? "";
    if (!options) return;
    const highlighted = this.shown[this.activeIndex];
    if (highlighted !== undefined) {
      this.commitItem(highlighted, navigate);
      return;
    }
    const needle = text.toLocaleLowerCase();
    const named = this.values.findIndex(
      (value) => validationLabel(value).toLocaleLowerCase() === needle,
    );
    if (text !== "" && named >= 0) {
      this.commitItem(named, navigate);
      return;
    }
    this.cancel(false);
    options.onCommitText(text, navigate);
  }

  private commitItem(index: number, navigate: EditNavigate): void {
    const value = this.values[index];
    const options = this.options;
    if (value === undefined || !options) return;
    this.cancel(false);
    options.onCommit(value, navigate);
  }

  private toggleCheckbox(): void {
    const options = this.options;
    const root = this.root;
    if (!options || !(root instanceof HTMLButtonElement)) return;
    const condition = options.rule.condition;
    if (condition.kind !== "checkbox") return;
    const checked = condition.checkedValue ?? true;
    const unchecked = condition.uncheckedValue ?? false;
    this.checkboxValue = Object.is(this.checkboxValue, checked) ? unchecked : checked;
    this.renderCheckbox(root);
  }

  private renderCheckbox(root: HTMLButtonElement): void {
    const options = this.options;
    if (options?.rule.condition.kind !== "checkbox") return;
    const checked = options.rule.condition.checkedValue ?? true;
    const isChecked = Object.is(this.checkboxValue, checked);
    root.setAttribute("aria-checked", String(isChecked));
    root.textContent = isChecked ? "✓" : "";
  }

  private commitCheckbox(navigate: EditNavigate): void {
    const options = this.options;
    if (!options) return;
    const value = this.checkboxValue;
    this.cancel(false);
    options.onCommit(value, navigate);
  }
}

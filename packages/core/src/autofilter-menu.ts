// Excel's AutoFilter dropdown: sort, clear, the Number, Text or Date Filters
// conditions, and a searchable value list with (Select All) and (Blanks).
// The grid imports this module the first time a dropdown opens.

import { popupPosition } from "./menu-surface.js";
import { compareScalars } from "./panels/pivot-model.js";
import { checkStylePart } from "./style-parts.js";
import type { CellScalar } from "./types/cell.js";
import type { ColumnFilter, FilterCondition } from "./types/document.js";
import type { Theme } from "./types/render.js";
import { seedWidgetTheme } from "./widget-theme.js";

/** What a column holds, which picks Excel's Number, Text or Date Filters. */
type AutoFilterColumnKind = "number" | "text" | "date";

/** One opening of the dropdown, for one column. */
export interface AutoFilterMenuRequest {
  /** The header cell in client coordinates; the dropdown opens below it. */
  readonly anchor: { readonly left: number; readonly top: number; readonly bottom: number };
  /** The header cell's text, which names the column in labels. */
  readonly header: string;
  readonly kind: AutoFilterColumnKind;
  /** The values the list offers: those of the rows the other columns' filters keep. */
  readonly values: readonly CellScalar[];
  /** The listed values the column's filter keeps; `null` keeps them all. */
  readonly kept: readonly CellScalar[] | null;
  readonly filter: ColumnFilter | undefined;
  /** The text a value shows in the column. */
  readonly format: (value: CellScalar) => string;
  /** A typed condition value: a number, a date's serial, or text. */
  readonly parse: (text: string) => number | string;
  readonly canSort: boolean;
  readonly sort: (ascending: boolean) => void;
  /** Set the column's filter, or clear it with `null`. */
  readonly apply: (filter: ColumnFilter | null) => void;
  /** Called after the dropdown closes, to give the grid its focus back. */
  readonly closed: () => void;
}

const ROW_HEIGHT = 24;
const LIST_ROWS = 9;
/** Rows drawn above and below the visible ones, so short scrolls show no gap. */
const OVERSCAN = 4;

type Op = FilterCondition["op"];

const OP_LABELS: Readonly<Record<Op, string>> = {
  eq: "equals",
  neq: "does not equal",
  gt: "is greater than",
  gte: "is greater than or equal to",
  lt: "is less than",
  lte: "is less than or equal to",
  beginsWith: "begins with",
  endsWith: "ends with",
  contains: "contains",
  notContains: "does not contain",
};

const DATE_OP_LABELS: Readonly<Partial<Record<Op, string>>> = {
  gt: "is after",
  gte: "is after or equal to",
  lt: "is before",
  lte: "is before or equal to",
};

/** A Number, Text or Date Filters entry: the dialog it opens, pre-filled. */
interface Preset {
  readonly label: string;
  readonly first: Op;
  readonly second?: Op;
}

const PRESETS: Readonly<Record<AutoFilterColumnKind, readonly Preset[]>> = {
  text: [
    { label: "Equals…", first: "eq" },
    { label: "Does Not Equal…", first: "neq" },
    { label: "Begins With…", first: "beginsWith" },
    { label: "Ends With…", first: "endsWith" },
    { label: "Contains…", first: "contains" },
    { label: "Does Not Contain…", first: "notContains" },
    { label: "Custom Filter…", first: "eq" },
  ],
  number: [
    { label: "Equals…", first: "eq" },
    { label: "Does Not Equal…", first: "neq" },
    { label: "Greater Than…", first: "gt" },
    { label: "Greater Than Or Equal To…", first: "gte" },
    { label: "Less Than…", first: "lt" },
    { label: "Less Than Or Equal To…", first: "lte" },
    { label: "Between…", first: "gte", second: "lte" },
    { label: "Custom Filter…", first: "eq" },
  ],
  date: [
    { label: "Equals…", first: "eq" },
    { label: "Before…", first: "lt" },
    { label: "After…", first: "gt" },
    { label: "Between…", first: "gte", second: "lte" },
    { label: "Custom Filter…", first: "eq" },
  ],
};

const FILTERS_LABEL: Readonly<Record<AutoFilterColumnKind, string>> = {
  number: "Number Filters",
  text: "Text Filters",
  date: "Date Filters",
};

const SORT_LABELS: Readonly<Record<AutoFilterColumnKind, readonly [string, string]>> = {
  number: ["Sort Smallest to Largest", "Sort Largest to Smallest"],
  text: ["Sort A to Z", "Sort Z to A"],
  date: ["Sort Oldest to Newest", "Sort Newest to Oldest"],
};

/**
 * A row of the value list: (Select All), Add current selection to filter
 * (only while searching), a value, or (Blanks).
 */
type ListItem =
  | { readonly kind: "all" }
  | { readonly kind: "add" }
  | { readonly kind: "value"; readonly value: CellScalar };

const valueKey = (value: CellScalar): string => `${typeof value}:${String(value)}`;

let nextId = 0;

/** The open dropdown's state; built per opening and dropped when it closes. */
interface Session {
  readonly request: AutoFilterMenuRequest;
  readonly root: HTMLDivElement;
  readonly main: HTMLDivElement;
  readonly list: HTMLDivElement;
  readonly spacer: HTMLDivElement;
  readonly search: HTMLInputElement;
  readonly ok: HTMLButtonElement;
  readonly presets: HTMLDivElement;
  readonly presetButton: HTMLButtonElement;
  /** Every listed value, sorted, blanks last. */
  readonly values: readonly CellScalar[];
  /** The values checked in the whole list. */
  readonly checked: Set<string>;
  /** The search the list shows, trimmed and in lower case; empty without one. */
  query: string;
  /** The search results checked; each new search checks all of them, as in Excel. */
  found: Set<string>;
  /** Whether OK adds the checked search results to the values `checked` keeps. */
  addCurrent: boolean;
  /** The rows the search leaves, (Select All) first. */
  items: ListItem[];
  active: number;
  form: HTMLFormElement | null;
  readonly idPrefix: string;
}

/**
 * The dropdown of one AutoFilter header button. It is a labelled dialog: Tab
 * moves between its controls and stays inside it, the value list is a
 * multi-select listbox (arrows move, Space checks, Enter applies), and Escape
 * closes it and gives the cell its focus back.
 */
export class AutoFilterMenu {
  private session: Session | null = null;

  constructor(
    private readonly host: HTMLElement,
    theme: Theme,
  ) {
    seedWidgetTheme(host, theme);
  }

  get isOpen(): boolean {
    return this.session !== null;
  }

  open(request: AutoFilterMenuRequest): void {
    this.dismiss();
    const idPrefix = `sheetwrite-autofilter-${nextId++}`;
    const values = [...request.values].sort(blanksLast);
    const kept = request.kept === null ? values : request.kept;
    const root = document.createElement("div");
    root.className = "sheetwrite-autofilter";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", `Filter ${request.header}`);
    root.style.position = "fixed";

    const main = document.createElement("div");
    main.className = "sheetwrite-autofilter-main";
    const [ascending, descending] = SORT_LABELS[request.kind];
    const sortUp = this.command(ascending, () => this.run(() => request.sort(true)));
    const sortDown = this.command(descending, () => this.run(() => request.sort(false)));
    sortUp.disabled = sortDown.disabled = !request.canSort;
    const clear = this.command(`Clear Filter From "${request.header}"`, () =>
      this.run(() => request.apply(null)),
    );
    clear.disabled = request.filter === undefined;

    const presetButton = this.command(FILTERS_LABEL[request.kind], () => this.togglePresets());
    presetButton.setAttribute("aria-haspopup", "menu");
    presetButton.setAttribute("aria-expanded", "false");
    const presets = document.createElement("div");
    presets.className = "sheetwrite-autofilter-presets";
    presets.setAttribute("role", "menu");
    presets.setAttribute("aria-label", FILTERS_LABEL[request.kind]);
    presets.hidden = true;
    presets.id = `${idPrefix}-presets`;
    presetButton.setAttribute("aria-controls", presets.id);

    const search = document.createElement("input");
    search.type = "search";
    search.className = "sheetwrite-autofilter-search";
    search.placeholder = "Search";
    search.setAttribute("aria-label", `Search values of ${request.header}`);

    const list = document.createElement("div");
    list.className = "sheetwrite-autofilter-list";
    list.id = `${idPrefix}-list`;
    list.tabIndex = 0;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-multiselectable", "true");
    list.setAttribute("aria-label", `Values of ${request.header}`);
    list.style.height = `${ROW_HEIGHT * LIST_ROWS}px`;
    search.setAttribute("aria-controls", list.id);
    const spacer = document.createElement("div");
    spacer.className = "sheetwrite-autofilter-spacer";
    list.appendChild(spacer);

    const footer = document.createElement("div");
    footer.className = "sheetwrite-autofilter-footer";
    const ok = this.command("OK", () => this.applyValues());
    ok.classList.add("sheetwrite-autofilter-ok");
    const cancel = this.command("Cancel", () => this.close());
    footer.append(ok, cancel);

    main.append(
      sortUp,
      sortDown,
      this.separator(),
      clear,
      presetButton,
      presets,
      search,
      list,
      footer,
    );
    root.appendChild(main);

    const session: Session = {
      request,
      root,
      main,
      list,
      spacer,
      search,
      ok,
      presets,
      presetButton,
      values,
      checked: new Set(kept.map(valueKey)),
      query: "",
      found: new Set(),
      addCurrent: false,
      items: [],
      active: 0,
      form: null,
      idPrefix,
    };
    this.session = session;
    for (const preset of PRESETS[request.kind]) {
      presets.appendChild(this.presetItem(preset));
    }

    search.addEventListener("input", () => this.refilter());
    search.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        list.focus();
      } else if (event.key === "Enter") {
        event.preventDefault();
        this.applyValues();
      }
    });
    list.addEventListener("keydown", this.onListKey);
    list.addEventListener("scroll", () => this.renderRows());
    // Focus only marks the active row: redrawing the rows here would replace
    // the row under a pointer that is pressing it, and its click would be lost.
    list.addEventListener("focus", () => this.markActive());
    list.addEventListener("click", this.onListClick);
    root.addEventListener("keydown", this.onRootKey);
    document.addEventListener("pointerdown", this.onOutsidePointer, true);

    this.host.appendChild(root);
    checkStylePart(root, "context-menu", "The filter dropdown");
    this.refilter();
    const size = root.getBoundingClientRect();
    const position = popupPosition(request.anchor, size, { side: "below", gap: 2 });
    root.style.left = `${position.left}px`;
    root.style.top = `${position.top}px`;
    (sortUp.disabled ? search : sortUp).focus();
  }

  /** Close without applying, and give the grid its focus back. */
  close(): void {
    const session = this.session;
    if (!session) return;
    this.dismiss();
    session.request.closed();
  }

  destroy(): void {
    this.dismiss();
  }

  private dismiss(): void {
    const session = this.session;
    if (!session) return;
    this.session = null;
    document.removeEventListener("pointerdown", this.onOutsidePointer, true);
    session.root.remove();
  }

  private run(action: () => void): void {
    const session = this.session;
    if (!session) return;
    this.dismiss();
    action();
    session.request.closed();
  }

  private command(label: string, run: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheetwrite-autofilter-command";
    button.textContent = label;
    button.addEventListener("click", run);
    return button;
  }

  private separator(): HTMLElement {
    const line = document.createElement("div");
    line.className = "sheetwrite-autofilter-sep";
    line.setAttribute("role", "separator");
    return line;
  }

  private presetItem(preset: Preset): HTMLButtonElement {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "sheetwrite-autofilter-command";
    item.setAttribute("role", "menuitem");
    item.tabIndex = -1;
    item.textContent = preset.label;
    item.addEventListener("click", () => this.openForm(preset));
    return item;
  }

  private togglePresets(open?: boolean): void {
    const session = this.session;
    if (!session) return;
    const show = open ?? session.presets.hidden;
    session.presets.hidden = !show;
    session.presetButton.setAttribute("aria-expanded", String(show));
    if (show) session.presets.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    else session.presetButton.focus();
  }

  /** The Custom AutoFilter dialog: two conditions joined by And or Or. */
  private openForm(preset: Preset): void {
    const session = this.session;
    if (!session) return;
    const { request } = session;
    session.presets.hidden = true;
    session.presetButton.setAttribute("aria-expanded", "false");

    const form = document.createElement("form");
    form.className = "sheetwrite-autofilter-form";
    form.setAttribute("aria-label", `Custom AutoFilter for ${request.header}`);
    const heading = document.createElement("div");
    heading.className = "sheetwrite-autofilter-heading";
    heading.textContent = `Show rows where ${request.header}:`;

    const current = request.filter?.kind === "custom" ? request.filter : undefined;
    const first = this.conditionRow(
      1,
      current?.conditions[0]?.op ?? preset.first,
      false,
      current?.conditions[0],
    );
    const second = this.conditionRow(
      2,
      current?.conditions[1]?.op ?? preset.second ?? null,
      true,
      current?.conditions[1],
    );
    const join = document.createElement("div");
    join.className = "sheetwrite-autofilter-join";
    join.setAttribute("role", "radiogroup");
    join.setAttribute("aria-label", "Join");
    const radios = (["and", "or"] as const).map((value) => {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `${session.idPrefix}-join`;
      radio.value = value;
      radio.checked = (current?.join ?? "and") === value;
      label.append(radio, value === "and" ? "And" : "Or");
      join.appendChild(label);
      return radio;
    });

    const footer = document.createElement("div");
    footer.className = "sheetwrite-autofilter-footer";
    const ok = document.createElement("button");
    ok.type = "submit";
    ok.className = "sheetwrite-autofilter-command sheetwrite-autofilter-ok";
    ok.textContent = "OK";
    const cancel = this.command("Cancel", () => this.closeForm());
    footer.append(ok, cancel);
    form.append(heading, first.row, join, second.row, footer);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const conditions: FilterCondition[] = [];
      for (const row of [first, second]) {
        const op = row.op.value;
        if (op === "") continue;
        conditions.push({ op: op as Op, value: this.conditionValue(op as Op, row.value.value) });
      }
      const [one, two] = conditions;
      if (!one) return;
      const join = radios[1]?.checked ? "or" : "and";
      this.run(() => request.apply({ kind: "custom", join, conditions: two ? [one, two] : [one] }));
    });

    session.main.hidden = true;
    session.form = form;
    session.root.appendChild(form);
    first.value.focus();
  }

  private closeForm(): void {
    const session = this.session;
    if (!session?.form) return;
    session.form.remove();
    session.form = null;
    session.main.hidden = false;
    session.presetButton.focus();
  }

  private conditionValue(op: Op, text: string): number | string {
    const session = this.session;
    if (!session) return text;
    // Text comparisons keep the text as typed; the others read a number or date.
    if (op === "beginsWith" || op === "endsWith" || op === "contains" || op === "notContains") {
      return text;
    }
    return session.request.parse(text);
  }

  private conditionRow(
    index: number,
    op: Op | null,
    optional: boolean,
    condition: FilterCondition | undefined,
  ): { row: HTMLElement; op: HTMLSelectElement; value: HTMLInputElement } {
    const session = this.session;
    const kind = session?.request.kind ?? "text";
    const row = document.createElement("div");
    row.className = "sheetwrite-autofilter-condition";
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Condition ${index}`);
    if (optional) select.append(option("", ""));
    for (const [value, label] of Object.entries(OP_LABELS) as [Op, string][]) {
      select.append(option((kind === "date" && DATE_OP_LABELS[value]) || label, value));
    }
    select.value = op ?? "";
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", `Value ${index}`);
    if (condition && session) {
      input.value =
        typeof condition.value === "number"
          ? session.request.format(condition.value)
          : condition.value;
    }
    row.append(select, input);
    return { row, op: select, value: input };
  }

  /**
   * Narrow the list to values whose text holds the search, and redraw it. A
   * new search checks every result and unchecks Add current selection to
   * filter, as Excel does.
   */
  private refilter(): void {
    const session = this.session;
    if (!session) return;
    const query = session.search.value.trim().toLowerCase();
    const matches = session.values.filter(
      (value) => query === "" || this.label(value).toLowerCase().includes(query),
    );
    if (query !== session.query) {
      session.query = query;
      session.found = new Set(matches.map(valueKey));
      session.addCurrent = false;
    }
    session.items = [
      { kind: "all" },
      ...(query === "" ? [] : [{ kind: "add" } as const]),
      ...matches.map((value): ListItem => ({ kind: "value", value })),
    ];
    session.active = Math.min(session.active, session.items.length - 1);
    session.spacer.style.height = `${session.items.length * ROW_HEIGHT}px`;
    this.renderRows();
    this.updateOk();
  }

  private label(value: CellScalar): string {
    if (value === null || value === "") return "(Blanks)";
    return this.session?.request.format(value) ?? String(value);
  }

  /** The values the search leaves; all of them without a search. */
  private visibleValues(session: Session): CellScalar[] {
    return session.items.flatMap((item) => (item.kind === "value" ? [item.value] : []));
  }

  /** The checks the list shows: the search results' while searching, else the whole list's. */
  private shownChecks(session: Session): Set<string> {
    return session.query === "" ? session.checked : session.found;
  }

  private allState(session: Session): "true" | "false" | "mixed" {
    const values = this.visibleValues(session);
    const checks = this.shownChecks(session);
    const checked = values.filter((value) => checks.has(valueKey(value))).length;
    return checked === 0 ? "false" : checked === values.length ? "true" : "mixed";
  }

  /** Draw the rows in view, plus a few around them; the rest are spacer. */
  private renderRows(): void {
    const session = this.session;
    if (!session) return;
    const { list, items } = session;
    const first = Math.max(0, Math.floor(list.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const last = Math.min(items.length, first + LIST_ROWS + OVERSCAN * 2);
    for (const option of [...list.querySelectorAll('[role="option"]')]) option.remove();
    for (let index = first; index < last; index++) {
      list.appendChild(this.option(session, index));
    }
    if (document.activeElement === list) {
      list.setAttribute("aria-activedescendant", `${session.idPrefix}-option-${session.active}`);
    }
  }

  private option(session: Session, index: number): HTMLElement {
    const item = session.items[index]!;
    const option = document.createElement("div");
    option.className = "sheetwrite-autofilter-option";
    option.id = `${session.idPrefix}-option-${index}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-posinset", String(index + 1));
    option.setAttribute("aria-setsize", String(session.items.length));
    option.dataset.index = String(index);
    option.style.top = `${index * ROW_HEIGHT}px`;
    option.style.height = `${ROW_HEIGHT}px`;
    const checked =
      item.kind === "add"
        ? session.addCurrent
        : item.kind === "value" && this.shownChecks(session).has(valueKey(item.value));
    const state = item.kind === "all" ? this.allState(session) : checked ? "true" : "false";
    option.setAttribute("aria-selected", String(state === "true"));
    if (state === "mixed") option.setAttribute("aria-checked", "mixed");
    option.classList.toggle("sheetwrite-autofilter-active", index === session.active);
    const box = document.createElement("span");
    box.className = "sheetwrite-autofilter-check";
    box.dataset.state = state;
    box.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent =
      item.kind === "all"
        ? session.query
          ? "(Select All Search Results)"
          : "(Select All)"
        : item.kind === "add"
          ? "Add current selection to filter"
          : this.label(item.value);
    option.append(box, text);
    return option;
  }

  private markActive(): void {
    const session = this.session;
    if (!session) return;
    session.list.setAttribute(
      "aria-activedescendant",
      `${session.idPrefix}-option-${session.active}`,
    );
    for (const option of session.list.querySelectorAll<HTMLElement>('[role="option"]')) {
      option.classList.toggle(
        "sheetwrite-autofilter-active",
        Number(option.dataset.index) === session.active,
      );
    }
  }

  private toggle(index: number): void {
    const session = this.session;
    const item = session?.items[index];
    if (!session || !item) return;
    const checks = this.shownChecks(session);
    if (item.kind === "all") {
      const check = this.allState(session) !== "true";
      for (const value of this.visibleValues(session)) {
        if (check) checks.add(valueKey(value));
        else checks.delete(valueKey(value));
      }
    } else if (item.kind === "add") {
      session.addCurrent = !session.addCurrent;
    } else {
      const key = valueKey(item.value);
      if (!checks.delete(key)) checks.add(key);
    }
    this.renderRows();
    this.updateOk();
  }

  private moveActive(index: number): void {
    const session = this.session;
    if (!session) return;
    session.active = Math.max(0, Math.min(session.items.length - 1, index));
    const top = session.active * ROW_HEIGHT;
    const { list } = session;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + ROW_HEIGHT > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + ROW_HEIGHT - list.clientHeight;
    }
    this.renderRows();
  }

  /** Excel disables OK while it would keep nothing. */
  private updateOk(): void {
    const session = this.session;
    if (!session) return;
    session.ok.disabled = this.keptValues(session).length === 0;
  }

  /**
   * The values OK keeps, in list order: the checked ones; with a search, the
   * checked results, and with Add current selection to filter also the
   * values the whole list has checked.
   */
  private keptValues(session: Session): CellScalar[] {
    if (session.query === "") {
      return session.values.filter((value) => session.checked.has(valueKey(value)));
    }
    return session.values.filter((value) => {
      const key = valueKey(value);
      return session.found.has(key) || (session.addCurrent && session.checked.has(key));
    });
  }

  /** OK: keep the values {@link keptValues} lists; all of them clear the filter. */
  private applyValues(): void {
    const session = this.session;
    if (!session || session.ok.disabled) return;
    const keep = this.keptValues(session);
    const everything = keep.length === session.values.length;
    const { request } = session;
    this.run(() => request.apply(everything ? null : { kind: "values", values: keep }));
  }

  private readonly onListClick = (event: MouseEvent): void => {
    const option = (event.target as Element).closest<HTMLElement>('[role="option"]');
    if (!option) return;
    const index = Number(option.dataset.index);
    if (this.session) this.session.active = index;
    this.toggle(index);
  };

  private readonly onListKey = (event: KeyboardEvent): void => {
    const session = this.session;
    if (!session) return;
    const page = LIST_ROWS - 1;
    switch (event.key) {
      case "ArrowDown":
        this.moveActive(session.active + 1);
        break;
      case "ArrowUp":
        if (session.active === 0) session.search.focus();
        else this.moveActive(session.active - 1);
        break;
      case "PageDown":
        this.moveActive(session.active + page);
        break;
      case "PageUp":
        this.moveActive(session.active - page);
        break;
      case "Home":
        this.moveActive(0);
        break;
      case "End":
        this.moveActive(session.items.length - 1);
        break;
      case " ":
        this.toggle(session.active);
        break;
      case "Enter":
        this.applyValues();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  private readonly onRootKey = (event: KeyboardEvent): void => {
    // The dropdown's keys stay inside it, also the Enter or Escape that just
    // closed it: the grid behind must not start an edit or move.
    event.stopPropagation();
    const session = this.session;
    if (!session) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (!session.presets.hidden) this.togglePresets(false);
      else if (session.form) this.closeForm();
      else this.close();
      return;
    }

    if (!session.presets.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      const items = [...session.presets.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
      event.preventDefault();
      return;
    }

    if (event.key === "Tab") {
      const focusable = [
        ...session.root.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, [tabindex='0']",
        ),
      ].filter((element) => !element.closest("[hidden]") && element.tabIndex >= 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        last?.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first?.focus();
        event.preventDefault();
      }
    }
  };

  private readonly onOutsidePointer = (event: PointerEvent): void => {
    const session = this.session;
    if (session && !session.root.contains(event.target as Node)) this.close();
  };
}

/** Excel's list order: numbers, text, logicals, then (Blanks) last. */
function blanksLast(a: CellScalar, b: CellScalar): number {
  const blankA = a === null || a === "";
  const blankB = b === null || b === "";
  if (blankA || blankB) return Number(blankA) - Number(blankB);
  return compareScalars(a, b);
}

function option(label: string, value: string): HTMLOptionElement {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

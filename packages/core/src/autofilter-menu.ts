// Excel's AutoFilter dropdown: sort, clear, the Number, Text or Date Filters
// conditions, and a searchable value list with (Select All) and (Blanks),
// which groups dates by year, month and day. The grid imports this module
// the first time a dropdown opens.

import { serialToDate } from "./date-serial.js";
import { popupPosition } from "./menu-surface.js";
import { compareScalars } from "./panels/pivot-model.js";
import { checkStylePart } from "./style-parts.js";
import type { CellScalar } from "./types/cell.js";
import type { ColumnFilter, DynamicDateFilter, FilterCondition } from "./types/document.js";
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

/**
 * Date Filters' entries that apply at once, between Between… and Custom
 * Filter…, in Excel's groups.
 */
const DATE_SPANS: readonly (readonly (readonly [DynamicDateFilter, string])[])[] = [
  [
    ["tomorrow", "Tomorrow"],
    ["today", "Today"],
    ["yesterday", "Yesterday"],
  ],
  [
    ["nextWeek", "Next Week"],
    ["thisWeek", "This Week"],
    ["lastWeek", "Last Week"],
  ],
  [
    ["nextMonth", "Next Month"],
    ["thisMonth", "This Month"],
    ["lastMonth", "Last Month"],
  ],
  [
    ["nextQuarter", "Next Quarter"],
    ["thisQuarter", "This Quarter"],
    ["lastQuarter", "Last Quarter"],
  ],
  [
    ["nextYear", "Next Year"],
    ["thisYear", "This Year"],
    ["lastYear", "Last Year"],
  ],
  [["yearToDate", "Year to Date"]],
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** All Dates in the Period: each quarter, then each month, of any year. */
const DATE_PERIODS: readonly (readonly [DynamicDateFilter, string])[] = [
  ["Q1", "Quarter 1"],
  ["Q2", "Quarter 2"],
  ["Q3", "Quarter 3"],
  ["Q4", "Quarter 4"],
  ...MONTH_NAMES.map((name, index) => [`M${index + 1}` as DynamicDateFilter, name] as const),
];

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
 * (only while searching), a value, (Blanks), or in a date column a year,
 * month or day, which stands for the dates in it.
 */
type ListItem =
  | { readonly kind: "all" }
  | { readonly kind: "add" }
  | { readonly kind: "value"; readonly value: CellScalar }
  | {
      readonly kind: "group";
      /** 0 a year, 1 a month, 2 a day. */
      readonly level: number;
      readonly key: string;
      readonly label: string;
      readonly values: readonly number[];
      readonly open: boolean;
    };

const valueKey = (value: CellScalar): string => `${typeof value}:${String(value)}`;

/** Nesting of a date list: a year, a month and a day group, as Excel's. */
const DAY_LEVEL = 2;
/** Indent of each nesting level of a date list, in CSS pixels. */
const LEVEL_INDENT = 16;

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
  /** Whether the list groups dates by year, month and day. */
  readonly dated: boolean;
  /** The years and months a date list shows open, by group key. */
  readonly expanded: Set<string>;
  /** The values checked in the whole list. */
  readonly checked: Set<string>;
  /** The search the list shows, trimmed and in lower case; empty without one. */
  query: string;
  /** The values the search leaves; all of them without a search. */
  shown: CellScalar[];
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
 * multi-select listbox, or tree for dates (arrows move, Right and Left open
 * and close a year or month, Space checks, Enter applies), and Escape closes
 * it and gives the cell its focus back.
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
    list.setAttribute("role", request.kind === "date" ? "tree" : "listbox");
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
      dated: request.kind === "date",
      expanded: new Set(),
      checked: new Set(kept.map(valueKey)),
      query: "",
      shown: [],
      found: new Set(),
      addCurrent: false,
      items: [],
      active: 0,
      form: null,
      idPrefix,
    };
    this.session = session;
    const forms = PRESETS[request.kind];
    for (const preset of forms.slice(0, -1)) presets.appendChild(this.presetItem(preset));
    if (request.kind === "date") {
      const apply = (type: DynamicDateFilter) => () =>
        this.run(() => request.apply({ kind: "dynamic", type }));
      for (const group of DATE_SPANS) {
        presets.appendChild(this.separator());
        for (const [type, label] of group) presets.appendChild(this.menuItem(label, apply(type)));
      }
      presets.append(...this.periodMenu(apply));
      presets.appendChild(this.separator());
    }
    // Custom Filter… comes last, as in Excel.
    const custom = forms.at(-1);
    if (custom) presets.appendChild(this.presetItem(custom));

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
    return this.menuItem(preset.label, () => this.openForm(preset));
  }

  private menuItem(label: string, run: () => void): HTMLButtonElement {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "sheetwrite-autofilter-command";
    item.setAttribute("role", "menuitem");
    item.tabIndex = -1;
    item.textContent = label;
    item.addEventListener("click", run);
    return item;
  }

  /**
   * Date Filters › All Dates in the Period: a submenu of the quarters and
   * months. Right Arrow or a click opens it; Left Arrow or Escape closes it.
   */
  private periodMenu(apply: (type: DynamicDateFilter) => () => void): HTMLElement[] {
    const menu = document.createElement("div");
    menu.className = "sheetwrite-autofilter-presets";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "All Dates in the Period");
    menu.hidden = true;
    for (const [type, label] of DATE_PERIODS) menu.appendChild(this.menuItem(label, apply(type)));
    const show = (open: boolean): void => {
      menu.hidden = !open;
      parent.setAttribute("aria-expanded", String(open));
      (open ? menu.querySelector<HTMLElement>('[role="menuitem"]') : parent)?.focus();
    };
    const parent = this.menuItem("All Dates in the Period", () =>
      show(parent.getAttribute("aria-expanded") !== "true"),
    );
    parent.setAttribute("aria-haspopup", "menu");
    parent.setAttribute("aria-expanded", "false");
    parent.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight") return;
      event.preventDefault();
      show(true);
    });
    menu.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      show(false);
    });
    return [parent, menu];
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
    session.shown = matches;
    this.relist();
  }

  /** Rebuild the rows from the shown values and the open groups, and redraw them. */
  private relist(): void {
    const session = this.session;
    if (!session) return;
    const dates: number[] = [];
    const others: ListItem[] = [];
    for (const value of session.shown) {
      if (session.dated && typeof value === "number" && value >= 0) dates.push(value);
      else others.push({ kind: "value", value });
    }
    session.items = [
      { kind: "all" },
      ...(session.query === "" ? [] : [{ kind: "add" } as const]),
      ...this.dateGroups(session, dates),
      ...others,
    ];
    session.active = Math.min(session.active, session.items.length - 1);
    session.spacer.style.height = `${session.items.length * ROW_HEIGHT}px`;
    this.renderRows();
    this.updateOk();
  }

  /**
   * Ascending dates as Excel's list groups them: each year, its months when
   * it is open, and their days when a month is open. A search opens them all.
   */
  private dateGroups(session: Session, dates: readonly number[]): ListItem[] {
    interface DateGroup {
      readonly key: string;
      readonly label: string;
      readonly values: number[];
      readonly children: DateGroup[];
    }
    const years: DateGroup[] = [];
    for (const value of dates) {
      const date = serialToDate(Math.floor(value));
      let siblings = years;
      let key = "";
      for (const label of [
        String(date.getUTCFullYear()),
        MONTH_NAMES[date.getUTCMonth()] ?? "",
        String(date.getUTCDate()).padStart(2, "0"),
      ]) {
        key = `${key}/${label}`;
        let group = siblings.at(-1);
        if (group?.key !== key) {
          group = { key, label, values: [], children: [] };
          siblings.push(group);
        }
        group.values.push(value);
        siblings = group.children;
      }
    }

    const items: ListItem[] = [];
    const flatten = (groups: readonly DateGroup[], level: number): void => {
      for (const { key, label, values, children } of groups) {
        const open = level < DAY_LEVEL && (session.query !== "" || session.expanded.has(key));
        items.push({ kind: "group", level, key, label, values, open });
        if (open) flatten(children, level + 1);
      }
    };
    flatten(years, 0);
    return items;
  }

  private label(value: CellScalar): string {
    if (value === null || value === "") return "(Blanks)";
    return this.session?.request.format(value) ?? String(value);
  }

  /** The checks the list shows: the search results' while searching, else the whole list's. */
  private shownChecks(session: Session): Set<string> {
    return session.query === "" ? session.checked : session.found;
  }

  /** Whether the list shows all, none or some of `values` checked. */
  private stateOf(session: Session, values: readonly CellScalar[]): "true" | "false" | "mixed" {
    const checks = this.shownChecks(session);
    let checked = 0;
    for (const value of values) if (checks.has(valueKey(value))) checked++;
    return checked === 0 ? "false" : checked === values.length ? "true" : "mixed";
  }

  /** Draw the rows in view, plus a few around them; the rest are spacer. */
  private renderRows(): void {
    const session = this.session;
    if (!session) return;
    const { list, items } = session;
    const first = Math.max(0, Math.floor(list.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const last = Math.min(items.length, first + LIST_ROWS + OVERSCAN * 2);
    for (const option of [...list.querySelectorAll(".sheetwrite-autofilter-option")]) {
      option.remove();
    }
    for (let index = first; index < last; index++) {
      list.appendChild(this.option(session, index));
    }
    if (document.activeElement === list) {
      list.setAttribute("aria-activedescendant", `${session.idPrefix}-option-${session.active}`);
    }
  }

  private option(session: Session, index: number): HTMLElement {
    const item = session.items[index];
    if (!item) throw new Error(`The filter list has no row ${index}`);
    const option = document.createElement("div");
    option.className = "sheetwrite-autofilter-option";
    option.id = `${session.idPrefix}-option-${index}`;
    option.setAttribute("role", session.dated ? "treeitem" : "option");
    option.setAttribute("aria-posinset", String(index + 1));
    option.setAttribute("aria-setsize", String(session.items.length));
    option.dataset.index = String(index);
    option.style.top = `${index * ROW_HEIGHT}px`;
    option.style.height = `${ROW_HEIGHT}px`;
    let state: "true" | "false" | "mixed";
    if (item.kind === "all") state = this.stateOf(session, session.shown);
    else if (item.kind === "group") state = this.stateOf(session, item.values);
    else if (item.kind === "add") state = session.addCurrent ? "true" : "false";
    else state = this.shownChecks(session).has(valueKey(item.value)) ? "true" : "false";
    option.setAttribute("aria-selected", String(state === "true"));
    if (state === "mixed") option.setAttribute("aria-checked", "mixed");
    option.classList.toggle("sheetwrite-autofilter-active", index === session.active);

    // A date list indents its months and days, and opens a year or month from
    // the arrow before it.
    if (session.dated) {
      const level = item.kind === "group" ? item.level : 0;
      option.setAttribute("aria-level", String(level + 1));
      const expander = document.createElement("span");
      expander.className = "sheetwrite-autofilter-expander";
      expander.setAttribute("aria-hidden", "true");
      expander.style.marginInlineStart = `${level * LEVEL_INDENT}px`;
      if (item.kind === "group" && item.level < DAY_LEVEL) {
        option.setAttribute("aria-expanded", String(item.open));
        expander.dataset.open = String(item.open);
      }
      option.appendChild(expander);
    }
    const box = document.createElement("span");
    box.className = "sheetwrite-autofilter-check";
    box.dataset.state = state;
    box.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    if (item.kind === "all") {
      text.textContent = session.query ? "(Select All Search Results)" : "(Select All)";
    } else if (item.kind === "add") {
      text.textContent = "Add current selection to filter";
    } else {
      text.textContent = item.kind === "group" ? item.label : this.label(item.value);
    }
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
    for (const option of session.list.querySelectorAll<HTMLElement>(
      ".sheetwrite-autofilter-option",
    )) {
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
    if (item.kind === "add") {
      session.addCurrent = !session.addCurrent;
    } else if (item.kind === "value") {
      const key = valueKey(item.value);
      if (!checks.delete(key)) checks.add(key);
    } else {
      // (Select All), or a year, month or day: check all of it, or uncheck it
      // when all of it is checked.
      const values = item.kind === "all" ? session.shown : item.values;
      const check = this.stateOf(session, values) !== "true";
      for (const value of values) {
        if (check) checks.add(valueKey(value));
        else checks.delete(valueKey(value));
      }
    }
    this.renderRows();
    this.updateOk();
  }

  /** Open or close the year or month at `index`, and make it the active row. */
  private setOpen(index: number, open: boolean): void {
    const session = this.session;
    const item = session?.items[index];
    if (!session || item?.kind !== "group" || item.level === DAY_LEVEL) return;
    if (open) session.expanded.add(item.key);
    else session.expanded.delete(item.key);
    session.active = index;
    this.relist();
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
    const target = event.target as Element;
    const option = target.closest<HTMLElement>(".sheetwrite-autofilter-option");
    if (!option) return;
    const index = Number(option.dataset.index);
    const item = this.session?.items[index];
    if (item?.kind === "group" && target.closest("[data-open]")) {
      this.setOpen(index, !item.open);
      return;
    }
    if (this.session) this.session.active = index;
    this.toggle(index);
  };

  private readonly onListKey = (event: KeyboardEvent): void => {
    const session = this.session;
    if (!session) return;
    const page = LIST_ROWS - 1;
    const item = session.items[session.active];
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
      // A date list opens a year or month with Right and closes it, or moves
      // to the group it is in, with Left.
      case "ArrowRight":
        if (item?.kind !== "group" || item.level === DAY_LEVEL) return;
        if (item.open) this.moveActive(session.active + 1);
        else this.setOpen(session.active, true);
        break;
      case "ArrowLeft":
        if (item?.kind !== "group") return;
        if (item.open) this.setOpen(session.active, false);
        else {
          // The group it is in is the nearest group above at the level above.
          let parent = session.active - 1;
          for (; parent >= 0; parent--) {
            const candidate = session.items[parent];
            if (candidate?.kind === "group" && candidate.level === item.level - 1) break;
          }
          if (parent >= 0) this.moveActive(parent);
        }
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
      const items = [...session.presets.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(
        (menuItem) => !menuItem.closest("[hidden]"),
      );
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

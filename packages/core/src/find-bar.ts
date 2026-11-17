import { colToA1 } from "./a1.js";
import { actionFeedbackFor } from "./action-feedback.js";
import { checkStylePart } from "./style-parts.js";
import type { Grid, SearchOptions, SearchResult } from "./types/grid.js";
import type { Theme } from "./types/render.js";
import { seedWidgetTheme } from "./widget-theme.js";

/** Height of one Find All result row; `.sheetwrite-find-result` in find.css uses the same. */
const RESULT_ROW_HEIGHT = 24;
/** Rows drawn beyond the list's visible height, so a fast scroll shows no gap. */
const RESULT_OVERSCAN = 4;

/** Counter label: empty when idle, "No results", or "<active+1> of <total>". */
function formatCount(result: SearchResult): string {
  if (result.matches.length === 0) {
    return result.query ? "No results" : "";
  }

  return `${result.active + 1} of ${result.matches.length}`;
}

/** A unique element ID for ARIA references inside one find bar. */
function uniqueId(part: string): string {
  return `sheetwrite-find-${part}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A list of cells under the find bar: a header, a virtual list and a status
 * line. Only the rows in view are in the DOM, so thousands of matches list
 * without building thousands of rows. A click on a row, or Up, Down, Home
 * and End in the list, calls `onSelect` with the row's index.
 */
class CellList {
  readonly el = document.createElement("div");
  private readonly list = document.createElement("div");
  private readonly spacer = document.createElement("div");
  private readonly status = document.createElement("span");
  private rowCount = 0;
  private active = -1;
  private rowText: (index: number) => readonly string[] = () => [];

  constructor(
    className: string,
    label: string,
    headers: readonly string[],
    onSelect: (index: number) => void,
  ) {
    this.el.className = `sheetwrite-find-results ${className}`;
    this.el.hidden = true;

    const head = document.createElement("div");
    head.className = "sheetwrite-find-result sheetwrite-find-results-head";
    head.setAttribute("aria-hidden", "true");
    for (const text of headers) {
      const cell = document.createElement("span");
      cell.textContent = text;
      head.appendChild(cell);
    }

    const list = this.list;
    list.className = "sheetwrite-find-results-list";
    list.id = uniqueId("list");
    list.tabIndex = 0;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", label);
    list.style.position = "relative";
    list.style.overflowY = "auto";
    list.appendChild(this.spacer);
    list.addEventListener("scroll", () => {
      this.render();
    });
    list.addEventListener("keydown", (e) => {
      const last = this.rowCount - 1;
      const target =
        e.key === "ArrowDown"
          ? Math.min(last, this.active + 1)
          : e.key === "ArrowUp"
            ? Math.max(0, this.active - 1)
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? last
                : -1;
      if (target < 0) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(target);
    });
    // Rows keep the focus where it is, as the bar's buttons do.
    this.spacer.addEventListener("mousedown", (e) => e.preventDefault());
    this.spacer.addEventListener("click", (e) => {
      const row =
        e.target instanceof Element ? e.target.closest<HTMLElement>("[data-index]") : null;
      if (row) onSelect(Number(row.dataset.index));
    });

    this.status.className = "sheetwrite-find-results-status";
    this.status.setAttribute("aria-live", "polite");
    this.el.append(head, list, this.status);
  }

  /** List `rowCount` rows, with row `active` (or none, -1) highlighted and scrolled into view. */
  show(
    rowCount: number,
    active: number,
    status: string,
    rowText: (index: number) => readonly string[],
  ): void {
    this.rowCount = rowCount;
    this.active = active;
    this.rowText = rowText;
    this.status.textContent = status;
    this.spacer.style.height = `${rowCount * RESULT_ROW_HEIGHT}px`;

    const list = this.list;
    const top = active * RESULT_ROW_HEIGHT;
    if (active >= 0 && top < list.scrollTop) list.scrollTop = top;
    else if (active >= 0 && top + RESULT_ROW_HEIGHT > list.scrollTop + list.clientHeight)
      list.scrollTop = top + RESULT_ROW_HEIGHT - list.clientHeight;
    this.render();
  }

  /** Draw the rows the list's scroll position shows. */
  private render(): void {
    const list = this.list;
    const first = Math.max(0, Math.floor(list.scrollTop / RESULT_ROW_HEIGHT) - RESULT_OVERSCAN);
    const end = Math.min(
      this.rowCount,
      Math.ceil((list.scrollTop + list.clientHeight) / RESULT_ROW_HEIGHT) + RESULT_OVERSCAN,
    );
    const rows: HTMLDivElement[] = [];
    for (let index = first; index < end; index++) {
      const row = document.createElement("div");
      row.className = "sheetwrite-find-result";
      row.id = `${list.id}-${index}`;
      row.dataset.index = String(index);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(index === this.active));
      row.style.position = "absolute";
      row.style.top = `${index * RESULT_ROW_HEIGHT}px`;
      for (const text of this.rowText(index)) {
        const span = document.createElement("span");
        span.textContent = text;
        span.title = text;
        row.appendChild(span);
      }
      rows.push(row);
    }
    this.spacer.replaceChildren(...rows);

    if (this.active >= 0) list.setAttribute("aria-activedescendant", `${list.id}-${this.active}`);
    else list.removeAttribute("aria-activedescendant");
  }
}

/** The find bar's DOM, built on first open. */
interface FindBarElements {
  readonly el: HTMLDivElement;
  readonly input: HTMLInputElement;
  readonly count: HTMLSpanElement;
  readonly replaceInput: HTMLInputElement | null;
  readonly optionsToggle: HTMLButtonElement;
  readonly options: HTMLDivElement;
  readonly findAll: CellList;
}

/** A control the Windows dialog reaches with Alt and a letter. */
type AccessKeyAction = () => void;

/**
 * Google-Sheets-style floating find/replace box pinned to the top-right of the
 * grid host. Rows: find (query + counter + nav + Find All + Options), replace
 * (replacement + Replace/All), Excel's Options (Within, Search, Look in, Match
 * case, Match entire cell contents) and the Find All results. The DOM is
 * built on the first `open`, so a grid that never searches pays nothing for
 * it; after that `open`/`close` only toggle visibility and focus. Typing
 * searches; Enter/Shift+Enter cycle matches; Enter in the replace field
 * replaces the active match; Esc closes. Alt and the underlined letter of
 * Excel's dialog reach its controls. The replace row is omitted entirely on a
 * read-only grid. When `config.find === false` the whole widget (find and
 * replace) is never constructed.
 */
export class FindBar {
  private readonly host: HTMLElement;
  private readonly grid: Grid;
  private readonly readOnly: boolean;
  private elements: FindBarElements | null = null;
  private _open = false;
  private options: SearchOptions = {};
  private result: SearchResult = { query: "", matches: [], active: -1 };
  private unsubscribe: (() => void) | null = null;

  constructor(host: HTMLElement, theme: Theme, grid: Grid, readOnly = false) {
    this.host = host;
    this.grid = grid;
    this.readOnly = readOnly;

    seedWidgetTheme(host, theme);
  }

  /** Show the bar. `replace: true` focuses the replace field (Ctrl/Cmd+H). */
  open(opts: { replace?: boolean } = {}): void {
    const elements = this.elements ?? this.build();
    elements.el.style.display = "flex";
    this._open = true;

    const field = opts.replace && elements.replaceInput ? elements.replaceInput : elements.input;
    field.focus();
    field.select();

    if (elements.input.value) this.search();
  }

  close(): void {
    if (this.elements) {
      this.elements.el.style.display = "none";
      this.elements.findAll.el.hidden = true;
    }
    this._open = false;

    this.grid.clearSearch();
    this.host.focus();
  }

  get isOpen(): boolean {
    return this._open;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.elements?.el.remove();
    this.elements = null;
  }

  private search(): void {
    const input = this.elements?.input;
    if (input) this.grid.search(input.value, this.options);
  }

  private build(): FindBarElements {
    const el = document.createElement("div");
    el.className = "sheetwrite-find";
    // Anchoring + visibility are behavior; everything cosmetic lives in styles.css.
    el.style.position = "absolute";
    el.style.top = "10px";
    el.style.right = "10px";
    el.style.display = "none";

    const findRow = this.row("sheetwrite-find-row");

    // The match count sits inside the field, on the right, as in Google Sheets.
    const field = document.createElement("span");
    field.className = "sheetwrite-find-field";

    const input = document.createElement("input");
    input.className = "sheetwrite-find-input";
    input.placeholder = "Find in sheet";
    input.setAttribute("aria-label", "Find in sheet");

    const count = document.createElement("span");
    count.className = "sheetwrite-find-count";
    count.setAttribute("aria-live", "polite");
    field.append(input, count);

    const prev = this.button(
      "sheetwrite-find-prev",
      "sheetwrite-find-icon-btn",
      "↑",
      "Previous",
      () => {
        this.grid.findPrev();
      },
    );
    const next = this.button(
      "sheetwrite-find-next",
      "sheetwrite-find-icon-btn",
      "↓",
      "Next",
      () => {
        this.grid.findNext();
      },
    );
    const findAllButton = this.button(
      "sheetwrite-find-all",
      "sheetwrite-find-icon-btn",
      "≡",
      "Find all",
      () => {
        this.showFindAll();
      },
    );
    const optionsToggle = this.button(
      "sheetwrite-find-options-toggle",
      "sheetwrite-find-icon-btn",
      "⋯",
      "Options",
      () => {
        this.toggleOptions();
      },
    );
    optionsToggle.setAttribute("aria-expanded", "false");
    const close = this.button(
      "sheetwrite-find-close",
      "sheetwrite-find-icon-btn",
      "✕",
      "Close",
      () => {
        this.close();
      },
    );

    input.addEventListener("input", () => {
      this.search();
    });

    input.addEventListener("keydown", (e) => {
      if (this.handleFieldShortcut(e)) return;

      if (e.key === "Enter") {
        e.stopPropagation();
        if (e.shiftKey) this.grid.findPrev();
        else this.grid.findNext();
      }
    });

    findRow.append(field, prev, next, findAllButton, optionsToggle, close);
    el.appendChild(findRow);

    const replace = this.readOnly ? null : this.buildReplaceRow(el);
    const options = this.buildOptions();
    const findAll = new CellList(
      "sheetwrite-find-all-results",
      "Find all results",
      ["Sheet", "Cell", "Value", "Formula"],
      (index) => {
        this.grid.selectMatch(index);
      },
    );
    el.append(options.panel, findAll.el);
    this.host.appendChild(el);
    checkStylePart(el, "find", "The find bar");

    this.elements = {
      el,
      input,
      count,
      replaceInput: replace?.input ?? null,
      optionsToggle,
      options: options.panel,
      findAll,
    };
    options.panel.id = uniqueId("options");
    optionsToggle.setAttribute("aria-controls", options.panel.id);

    // Excel's Find and Replace dialog: Alt and the underlined letter.
    const accessKeys: Record<string, AccessKeyAction> = {
      n: () => input.focus(),
      f: () => this.grid.findNext(),
      i: () => this.showFindAll(),
      t: () => this.toggleOptions(),
      h: () => this.focusOption(options.within),
      s: () => this.focusOption(options.searchBy),
      l: () => this.focusOption(options.lookIn),
      c: () => this.focusOption(options.matchCase, true),
      o: () => this.focusOption(options.wholeCell, true),
      ...(replace && {
        e: () => replace.input.focus(),
        r: () => replace.replaceButton.click(),
        a: () => replace.allButton.click(),
      }),
    };
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      // On macOS Option+letter types a character instead (Option+C is ç), so
      // it never equals the letter and typing keeps working there.
      const action = accessKeys[e.key.toLowerCase()];
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      action();
    });

    this.unsubscribe = this.grid.on("search", (result) => {
      this.update(result);
    });
    return this.elements;
  }

  private buildReplaceRow(el: HTMLDivElement): {
    input: HTMLInputElement;
    replaceButton: HTMLButtonElement;
    allButton: HTMLButtonElement;
  } {
    const replaceRow = this.row("sheetwrite-find-replace-row");

    const replaceInput = document.createElement("input");
    replaceInput.className = "sheetwrite-find-replace-input";
    replaceInput.placeholder = "Replace with";
    replaceInput.setAttribute("aria-label", "Replace with");

    const replaceButton = this.button(
      "sheetwrite-find-replace",
      "sheetwrite-find-text-btn",
      "Replace",
      "Replace",
      () => {
        this.grid.replaceCurrent(replaceInput.value);
      },
    );

    const allButton = this.button(
      "sheetwrite-find-replace-all",
      "sheetwrite-find-text-btn",
      "Replace all",
      "Replace all",
      () => {
        this.grid.replaceAll(replaceInput.value);
      },
    );

    replaceInput.addEventListener("keydown", (e) => {
      if (this.handleFieldShortcut(e)) return;

      if (e.key === "Enter") {
        e.stopPropagation();
        e.preventDefault();
        replaceButton.click();
      }
    });

    replaceRow.append(replaceInput, replaceButton, allButton);
    el.appendChild(replaceRow);
    return { input: replaceInput, replaceButton, allButton };
  }

  /** Excel's Options: Within, Search and Look in, Match case, Match entire cell contents. */
  private buildOptions(): {
    panel: HTMLDivElement;
    within: HTMLSelectElement;
    searchBy: HTMLSelectElement;
    lookIn: HTMLSelectElement;
    matchCase: HTMLInputElement;
    wholeCell: HTMLInputElement;
  } {
    const panel = document.createElement("div");
    panel.className = "sheetwrite-find-options";
    panel.hidden = true;

    const within = this.select(panel, "Within:", "H", [
      ["sheet", "Sheet"],
      ["workbook", "Workbook"],
    ]);
    const searchBy = this.select(panel, "Search:", "S", [
      ["rows", "By Rows"],
      ["columns", "By Columns"],
    ]);
    const lookIn = this.select(panel, "Look in:", "L", [
      ["formulas", "Formulas"],
      ["values", "Values"],
      ["notes", "Notes"],
    ]);
    const matchCase = this.checkbox(panel, "Match case", "C");
    const wholeCell = this.checkbox(panel, "Match entire cell contents", "O");

    const apply = (): void => {
      this.options = {
        within: within.value === "workbook" ? "workbook" : "sheet",
        searchBy: searchBy.value === "columns" ? "columns" : "rows",
        lookIn: lookIn.value === "values" || lookIn.value === "notes" ? lookIn.value : "formulas",
        matchCase: matchCase.checked,
        wholeCell: wholeCell.checked,
      };
      const input = this.elements?.input;
      if (input) {
        const label = this.options.within === "workbook" ? "Find in workbook" : "Find in sheet";
        input.placeholder = label;
        input.setAttribute("aria-label", label);
      }
      this.search();
    };
    for (const control of [within, searchBy, lookIn, matchCase, wholeCell]) {
      control.addEventListener("change", apply);
    }

    return { panel, within, searchBy, lookIn, matchCase, wholeCell };
  }

  private toggleOptions(): void {
    const elements = this.elements;
    if (!elements) return;
    const hidden = !elements.options.hidden;
    elements.options.hidden = hidden;
    elements.optionsToggle.setAttribute("aria-expanded", String(!hidden));
  }

  /** Show the options, then focus `control`, or toggle a checkbox, as Alt+letter does in Excel. */
  private focusOption(control: HTMLSelectElement | HTMLInputElement, toggle = false): void {
    if (this.elements?.options.hidden) this.toggleOptions();
    control.focus();
    if (toggle) control.click();
  }

  /** Find All: list every match with its sheet, cell, value and formula. */
  private showFindAll(): void {
    const findAll = this.elements?.findAll;
    if (!findAll) return;
    if (findAll.el.hidden) {
      findAll.el.hidden = false;
      this.search();
    }
    this.renderFindAll();
  }

  private update(result: SearchResult): void {
    this.result = result;
    const elements = this.elements;
    if (!elements) return;
    elements.count.textContent = formatCount(result);
    if (!elements.findAll.el.hidden) this.renderFindAll();
  }

  private renderFindAll(): void {
    const { matches, active } = this.result;
    const store = this.grid.store;
    const names = new Map(store.getWorkbook().sheets.map((sheet) => [sheet.id, sheet.name]));
    this.elements?.findAll.show(
      matches.length,
      active,
      `${matches.length} ${matches.length === 1 ? "cell" : "cells"} found`,
      (index) => {
        const addr = matches[index];
        if (!addr) return [];
        return [
          names.get(addr.sheet) ?? addr.sheet,
          // Excel's Find All shows absolute references.
          `$${colToA1(addr.col)}$${addr.row + 1}`,
          this.grid.getCellText(addr),
          store.getFormula(addr) ?? "",
        ];
      },
    );
  }

  /**
   * Ctrl/Cmd+F and Ctrl/Cmd+H pressed while a find-bar field is focused switch
   * fields instead of falling through to the browser's native find dialog (the
   * grid's host handler never sees keys originating in editable widgets).
   */
  private handleFieldShortcut(e: KeyboardEvent): boolean {
    if (!(e.ctrlKey || e.metaKey)) return false;
    const key = e.key.toLowerCase();
    if (key !== "f" && key !== "h") return false;

    e.preventDefault();
    e.stopPropagation();
    this.open({ replace: key === "h" });
    return true;
  }

  private row(className: string): HTMLDivElement {
    const row = document.createElement("div");
    row.className = className;
    return row;
  }

  /** A labelled select in the options panel; `accessKey` is Excel's Alt letter. */
  private select(
    panel: HTMLDivElement,
    text: string,
    accessKey: string,
    choices: readonly (readonly [value: string, label: string])[],
  ): HTMLSelectElement {
    const label = document.createElement("label");
    label.className = "sheetwrite-find-option";
    const select = document.createElement("select");
    select.setAttribute("aria-keyshortcuts", `Alt+${accessKey}`);
    for (const [value, name] of choices) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = name;
      select.appendChild(option);
    }
    label.append(text, select);
    panel.appendChild(label);
    return select;
  }

  /** A labelled checkbox in the options panel; `accessKey` is Excel's Alt letter. */
  private checkbox(panel: HTMLDivElement, text: string, accessKey: string): HTMLInputElement {
    const label = document.createElement("label");
    label.className = "sheetwrite-find-option sheetwrite-find-check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.setAttribute("aria-keyshortcuts", `Alt+${accessKey}`);
    label.append(box, text);
    panel.appendChild(label);
    return box;
  }

  /**
   * A flat button that keeps grid focus (mousedown is suppressed). `typeClass`
   * selects the icon (square nav/close) vs. text (Replace / Replace all)
   * sizing rule; `className` is the per-button hook. `title` is also the
   * accessible name, so ↑, ↓ and ✕ are announced as Previous, Next and Close.
   * All cosmetics live in styles.css.
   */
  private button(
    className: string,
    typeClass: string,
    label: string,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `sheetwrite-find-btn ${typeClass} ${className}`;
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute("aria-label", title);

    // Keep grid focus so buttons act without observing focus oddly.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      const feedback =
        typeClass === "sheetwrite-find-text-btn" ? actionFeedbackFor(this.grid) : undefined;
      if (feedback) void feedback.run(`find:${className}`, onClick, btn);
      else onClick();
    });

    return btn;
  }
}

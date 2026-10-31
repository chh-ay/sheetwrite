import { actionFeedbackFor } from "./action-feedback.js";
import type { Grid, SearchResult } from "./types/grid.js";
import type { Theme } from "./types/render.js";
import { seedWidgetTheme } from "./widget-theme.js";

/** Counter label: empty when idle, "No results", or "<active+1> of <total>". */
function formatCount(result: SearchResult): string {
  if (result.matches.length === 0) {
    return result.query ? "No results" : "";
  }

  return `${result.active + 1} of ${result.matches.length}`;
}

/** The find bar's DOM, built on first open. */
interface FindBarElements {
  readonly el: HTMLDivElement;
  readonly input: HTMLInputElement;
  readonly count: HTMLSpanElement;
  readonly replaceInput: HTMLInputElement | null;
}

/**
 * Google-Sheets-style floating find/replace box pinned to the top-right of the
 * grid host. Two stacked rows: find (query + counter + nav) and replace
 * (replacement + Replace/All). The DOM is built on the first `open`, so a grid
 * that never searches pays nothing for it; after that `open`/`close` only
 * toggle visibility and focus. Typing searches; Enter/Shift+Enter cycle
 * matches; Enter in the replace field replaces the active match; Esc closes.
 * The replace row is omitted entirely on a read-only grid. When
 * `config.find === false` the whole widget (find and replace) is never
 * constructed.
 */
export class FindBar {
  private readonly host: HTMLElement;
  private readonly grid: Grid;
  private readonly readOnly: boolean;
  private elements: FindBarElements | null = null;
  private _open = false;

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

    if (elements.input.value) {
      this.update(this.grid.search(elements.input.value));
    }
  }

  close(): void {
    if (this.elements) this.elements.el.style.display = "none";
    this._open = false;

    this.grid.clearSearch();
    this.host.focus();
  }

  get isOpen(): boolean {
    return this._open;
  }

  destroy(): void {
    this.elements?.el.remove();
    this.elements = null;
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
        this.update(this.grid.findPrev());
      },
    );

    const next = this.button(
      "sheetwrite-find-next",
      "sheetwrite-find-icon-btn",
      "↓",
      "Next",
      () => {
        this.update(this.grid.findNext());
      },
    );

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
      this.update(this.grid.search(input.value));
    });

    input.addEventListener("keydown", (e) => {
      if (this.handleFieldShortcut(e)) return;

      if (e.key === "Enter") {
        e.stopPropagation();
        this.update(e.shiftKey ? this.grid.findPrev() : this.grid.findNext());
        return;
      }

      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    });

    findRow.append(field, prev, next, close);
    el.appendChild(findRow);

    const replaceInput = this.readOnly ? null : this.buildReplaceRow(el);
    this.host.appendChild(el);

    this.elements = { el, input, count, replaceInput };
    return this.elements;
  }

  private buildReplaceRow(el: HTMLDivElement): HTMLInputElement {
    const replaceRow = this.row("sheetwrite-find-replace-row");

    const replaceInput = document.createElement("input");
    replaceInput.className = "sheetwrite-find-replace-input";
    replaceInput.placeholder = "Replace with";
    replaceInput.setAttribute("aria-label", "Replace with");

    const replaceBtn = this.button(
      "sheetwrite-find-replace",
      "sheetwrite-find-text-btn",
      "Replace",
      "Replace",
      () => {
        this.update(this.grid.replaceCurrent(replaceInput.value));
      },
    );

    const allBtn = this.button(
      "sheetwrite-find-replace-all",
      "sheetwrite-find-text-btn",
      "Replace all",
      "Replace all",
      () => {
        this.update(this.grid.replaceAll(replaceInput.value).result);
      },
    );

    replaceInput.addEventListener("keydown", (e) => {
      if (this.handleFieldShortcut(e)) return;

      if (e.key === "Enter") {
        e.stopPropagation();
        e.preventDefault();
        replaceBtn.click();
        return;
      }

      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    });

    replaceRow.append(replaceInput, replaceBtn, allBtn);
    el.appendChild(replaceRow);
    return replaceInput;
  }

  private update(result: SearchResult): void {
    if (this.elements) this.elements.count.textContent = formatCount(result);
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

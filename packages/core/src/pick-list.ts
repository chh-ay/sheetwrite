// Lists of a column's text entries under a cell: Excel's Pick From
// Drop-down List (Alt+Down), and AutoComplete's list of the entries that
// begin the typed text. Loads with AutoComplete's chunk.

import type { EditNavigate, EditRect } from "./editor.js";
import type { Theme } from "./types/render.js";

/** Entries a Page Up or Page Down moves over. */
const PAGE_ENTRIES = 8;
/** A pause longer than this starts a new type-to-find word. */
const TYPEAHEAD_MS = 700;

let listCount = 0;

/**
 * A listbox of text entries placed under a cell. It never takes the focus
 * from its owner on a click: the owner reads the active entry and moves it.
 */
export class EntryList {
  readonly element: HTMLDivElement;
  private readonly id = `sheetwrite-entry-list-${++listCount}`;
  private entries: readonly string[] = [];
  private activeIndex = 0;

  constructor(host: HTMLElement, label: string, theme: Theme, onPick: (entry: string) => void) {
    const element = document.createElement("div");
    // The look of a list rule's list.
    element.className = "sheetwrite-validation-list sheetwrite-entry-list";
    element.id = this.id;
    element.setAttribute("role", "listbox");
    element.setAttribute("aria-label", label);
    element.style.setProperty("--sheetwrite-bg", theme.bg);
    element.style.setProperty("--sheetwrite-fg", theme.fg);
    element.style.setProperty("--sheetwrite-selection-border", theme.selectionBorder);
    // A press neither moves the focus nor reaches the grid, so the pick lands first.
    element.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    element.addEventListener("click", (event) => {
      const option = event.target instanceof Element ? event.target.closest("[role=option]") : null;
      const entry =
        option instanceof HTMLElement ? this.entries[Number(option.dataset.index)] : undefined;
      if (entry !== undefined) onPick(entry);
    });
    host.appendChild(element);
    this.element = element;
  }

  /** The entry Enter picks. */
  get active(): string | undefined {
    return this.entries[this.activeIndex];
  }

  /** The id of the selected option, for the owner's `aria-activedescendant`. */
  get activeId(): string {
    return `${this.id}-${this.activeIndex}`;
  }

  /** Show `entries` with the one at `active` selected. */
  show(entries: readonly string[], active: number): void {
    this.entries = entries;
    this.element.replaceChildren(
      ...entries.map((entry, index) => {
        const option = document.createElement("div");
        option.className = "sheetwrite-validation-option";
        option.id = `${this.id}-${index}`;
        option.dataset.index = String(index);
        option.setAttribute("role", "option");
        option.textContent = entry;
        return option;
      }),
    );
    this.select(active);
  }

  /** Select the entry at `index`, kept inside the list, and scroll it into view. */
  select(index: number): void {
    const count = this.entries.length;
    if (count === 0) return;
    this.activeIndex = Math.max(0, Math.min(count - 1, index));
    const options = this.element.children;
    for (let at = 0; at < options.length; at++) {
      options[at]!.setAttribute("aria-selected", String(at === this.activeIndex));
    }
    const active = options[this.activeIndex];
    if (active === undefined) return;
    this.element.setAttribute("aria-activedescendant", active.id);
    if (typeof active.scrollIntoView === "function") active.scrollIntoView({ block: "nearest" });
  }

  /** Show no entry as selected; a later move starts from the first. */
  deselect(): void {
    for (const option of this.element.children) option.setAttribute("aria-selected", "false");
    this.element.removeAttribute("aria-activedescendant");
    this.activeIndex = 0;
  }

  /**
   * Move the selection for a list key: arrows, Page Up and Page Down, Home
   * and End. False for any other key.
   */
  moveFor(key: string): boolean {
    const steps: Readonly<Record<string, number>> = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: PAGE_ENTRIES,
      PageUp: -PAGE_ENTRIES,
      Home: -this.entries.length,
      End: this.entries.length,
    };
    const step = steps[key];
    if (step === undefined) return false;
    this.select(this.activeIndex + step);
    return true;
  }

  /** Select the first entry that begins with `prefix`, ignoring letter case. */
  find(prefix: string): void {
    const key = prefix.toLowerCase();
    const index = this.entries.findIndex((entry) => entry.toLowerCase().startsWith(key));
    if (index >= 0) this.select(index);
  }

  /** Put the list under the cell at `rect`. */
  position(rect: EditRect): void {
    const { style } = this.element;
    style.left = `${rect.x}px`;
    style.top = `${rect.y + rect.h}px`;
    style.minWidth = `${Math.max(120, rect.w)}px`;
  }

  remove(): void {
    this.element.remove();
  }
}

/** What Pick From Drop-down List shows and where its pick goes. */
export interface BeginPickOptions {
  /** The entries, sorted. */
  readonly entries: readonly string[];
  /** The cell's text, selected in the list when it is an entry. */
  readonly current: string;
  readonly rect: EditRect;
  readonly theme: Theme;
  onCommit: (entry: string, navigate: EditNavigate) => void;
  onCancel: () => void;
}

/**
 * Excel's Pick From Drop-down List: the column's text entries under the
 * cell. Arrows, Page Up, Page Down, Home and End move, typing finds an
 * entry, Enter or a click puts it in the cell, Escape or a click away closes
 * the list.
 */
export class PickList {
  private readonly host: HTMLElement;
  private list: EntryList | null = null;
  private options: BeginPickOptions | null = null;
  private typed = "";
  private typedAt = 0;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  begin(options: BeginPickOptions): void {
    this.cancel(false);
    const list = new EntryList(this.host, "Pick From Drop-down List", options.theme, (entry) =>
      this.commit(entry),
    );
    const current = options.current.toLowerCase();
    list.show(
      options.entries,
      Math.max(
        0,
        options.entries.findIndex((entry) => entry.toLowerCase() === current),
      ),
    );
    list.position(options.rect);
    list.element.tabIndex = 0;
    list.element.addEventListener("keydown", this.onKeyDown);
    list.element.addEventListener("blur", this.onBlur);
    this.list = list;
    this.options = options;
    list.element.focus();
  }

  position(rect: EditRect): void {
    this.list?.position(rect);
  }

  cancel(notify = true): void {
    const options = this.options;
    const list = this.list;
    // Cleared first: removing the focused list may fire its blur.
    this.list = null;
    this.options = null;
    this.typed = "";
    list?.remove();
    if (notify) options?.onCancel();
  }

  destroy(): void {
    this.cancel(false);
  }

  private commit(entry: string): void {
    const options = this.options;
    if (options === null) return;
    this.cancel(false);
    // Excel keeps the cell active after a pick.
    options.onCommit(entry, "none");
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const list = this.list;
    if (list === null || !(list.moveFor(event.key) || this.keyAction(list, event))) return;
    event.preventDefault();
    event.stopPropagation();
  };

  /** Enter picks, Escape closes, and a character finds an entry; false for other keys. */
  private keyAction(list: EntryList, event: KeyboardEvent): boolean {
    if (event.key === "Enter") {
      const entry = list.active;
      if (entry !== undefined) this.commit(entry);
    } else if (event.key === "Escape") {
      this.cancel();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      this.typed = now - this.typedAt > TYPEAHEAD_MS ? event.key : this.typed + event.key;
      this.typedAt = now;
      list.find(this.typed);
    } else {
      return false;
    }
    return true;
  }

  private readonly onBlur = (): void => {
    this.cancel();
  };
}

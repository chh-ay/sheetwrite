// The part of formula help that every editor carries: it waits for the first
// formula and only then loads formula-help.ts, which holds the analysis, the
// function table and the DOM. Until the chunk arrives, keys go to the editor.

import type { FormulaHelp } from "./formula-help.js";
import type { HighlightRange, SheetId } from "./types/coordinates.js";
import type { Theme } from "./types/render.js";
import type { Store } from "./types/store.js";

/** The text fields formula help works in: the cell editor and the formula bar. */
export type FormulaEditorElement = HTMLInputElement | HTMLTextAreaElement;

/**
 * What formula help needs from the grid. Deliberately small, so the built-in
 * editors stay thin defaults over public grid methods.
 */
export interface AssistDeps {
  /**
   * Paint (or, with `null`, clear) the ranges referenced by the formula being
   * edited. Backed by `Grid.highlightCells`; per-range color is honored.
   */
  highlightCells: (ranges: HighlightRange[] | null) => void;
  /** Sheet id the formula's unqualified references resolve against (the active sheet). */
  sheet: () => SheetId;
  /** The store whose sheets and functions the formula uses. */
  store: Store;
}

/**
 * Formula help for one editor. Attached to a field while it is edited and
 * detached on teardown; the help chunk loads when the field first holds a
 * formula (text that starts with `=`).
 */
export class FormulaAssist {
  private readonly deps: AssistDeps;
  private help: FormulaHelp | null = null;
  private loading: Promise<FormulaHelp> | null = null;
  private field: FormulaEditorElement | null = null;
  private theme: Theme | null = null;

  constructor(deps: AssistDeps) {
    this.deps = deps;
  }

  get isOpen(): boolean {
    return this.help?.isOpen ?? false;
  }

  /** Bind to an editor field and show help for its text. */
  attach(field: FormulaEditorElement, theme: Theme | null): void {
    this.field = field;
    this.theme = theme;
    if (this.help !== null) this.help.attach(field, theme);
    else this.update();
  }

  /** Release the field, close the help and clear the reference colours. */
  detach(): void {
    this.help?.detach();
    this.field = null;
    this.theme = null;
  }

  /** Show help for the field's current text; the first formula loads the help chunk. */
  update(): void {
    if (this.help !== null) {
      this.help.update();
      return;
    }

    if (this.field?.value.startsWith("=") === true) void this.load();
  }

  /** Keys for the open function list; false while the help is not loaded. */
  handleKeyDown(event: KeyboardEvent): boolean {
    return this.help?.handleKeyDown(event) ?? false;
  }

  /** Follow the field after it moves; called by the editor on scroll. */
  reposition(): void {
    this.help?.reposition();
  }

  /**
   * Load the help chunk once. A failed load is not cached, so the next
   * formula edit tries again; the rejection stays observable to the host.
   */
  private load(): Promise<FormulaHelp> {
    this.loading ??= import("./formula-help.js").then(
      ({ FormulaHelp }) => {
        const help = new FormulaHelp(this.deps);
        this.help = help;
        if (this.field !== null) help.attach(this.field, this.theme);
        return help;
      },
      (error: unknown) => {
        this.loading = null;
        throw error;
      },
    );

    return this.loading;
  }
}

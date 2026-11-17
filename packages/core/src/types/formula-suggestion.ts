// Contracts between the formula bar and an add-on that suggests the rest of a
// formula. No runtime values live here.

import type { FormulaAnalysis } from "../formula-analysis.js";
import type { FormulaFunctionMetadata } from "../functions/types.js";
import type { CellScalar } from "./cell.js";
import type { CellAddress, Range, SheetId } from "./coordinates.js";
import type { Workbook } from "./document.js";

/** Text a suggester proposes to insert at the caret. */
export interface FormulaSuggestion {
  /** Inserted at the caret on Tab; the formula bar draws it dimmed after the text until then. */
  readonly text: string;
}

/**
 * What a suggester can read of the workbook while a formula is edited. Rows
 * and columns are zero-based data positions, the positions formula references
 * name.
 */
export interface FormulaSheetReads {
  /** The workbook's sheets, defined names and tables. */
  workbook(): Workbook;
  /** The formula of a cell as written, with its leading `=`; `null` when the cell holds no formula. */
  formula(sheet: SheetId, row: number, col: number): string | null;
  /** The value a cell shows: a formula's result, or the value typed in it. */
  value(sheet: SheetId, row: number, col: number): CellScalar;
  /**
   * Where Ctrl+Arrow lands from a cell: the row (for `dRow`) or column (for
   * `dCol`) at the edge of the block of filled cells. One of `dRow` and
   * `dCol` is -1 or 1, the other 0.
   */
  edge(sheet: SheetId, row: number, col: number, dRow: number, dCol: number): number;
  /** Excel's current region around a cell (Ctrl+*): the block bounded by empty rows and columns. */
  region(sheet: SheetId, row: number, col: number): Range | null;
  /**
   * The range the AutoSum command sums for a cell: the run of numbers right
   * above it, or else right to its left; `null` when there is none.
   */
  autoSumRange(sheet: SheetId, row: number, col: number): Range | null;
  /**
   * `source` copied `dRow` rows and `dCol` columns away: its relative
   * references move, as a fill or paste moves them.
   */
  translate(source: string, dRow: number, dCol: number): string;
}

/** One formula edit: the cell being edited and what can be read around it. */
export interface FormulaEdit {
  /** The data address of the cell being edited. */
  readonly cell: Readonly<CellAddress>;
  /** Reads of the workbook the cell is in. */
  readonly reads: FormulaSheetReads;
  /**
   * The functions the formula can call, built in and host-registered. Empty
   * until the list has loaded; read it on each `suggest` instead of keeping it.
   */
  functions(): readonly FormulaFunctionMetadata[];
}

/** Suggestions for one formula edit, from its first key to its commit or cancel. */
export interface FormulaSuggestionSession {
  /**
   * The suggestion for `text`, the field's text with the caret at its end;
   * `null` shows none. Runs on every key, so it must return within a frame.
   * `analysis` is the result formula help computed for this text.
   */
  suggest(text: string, analysis: FormulaAnalysis): FormulaSuggestion | null;
  /** What the user did with the last suggestion shown. */
  feedback?(event: "accept" | "accept-word" | "dismiss"): void;
  /** The edit ended; release what the session holds. */
  close(): void;
}

/**
 * Suggests the rest of formulas as they are typed in the formula bar. An
 * add-on registers one with `formulaSuggestions` in its grid hook.
 */
export interface FormulaSuggester {
  /** A formula edit starts; runs once per edit, before its first `suggest`. */
  open(edit: FormulaEdit): FormulaSuggestionSession;
}

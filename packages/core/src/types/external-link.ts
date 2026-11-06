// External workbook link contracts: the values a workbook keeps for the
// workbooks its formulas reference. No runtime values live here.

/**
 * One saved value of a linked workbook: a number, text, a logical value, or
 * an Excel error such as `{ error: "#N/A" }`.
 */
export type ExternalLinkValue = number | string | boolean | { error: string };

/** One saved cell of a linked sheet; `row` and `col` start at 0. */
export interface ExternalLinkCell {
  row: number;
  col: number;
  value: ExternalLinkValue;
}

/** The saved values of one sheet of a linked workbook. */
export interface ExternalLinkSheet {
  /** The sheet name in the linked workbook. */
  name: string;
  /** Saved cells in any order; a cell that is not listed reads as blank. */
  cells: ExternalLinkCell[];
}

/**
 * A defined name of a linked workbook, as Excel saves it in the external
 * link part. Formulas use it as `Budget.xlsx!Total`, or as
 * `[Budget.xlsx]Annual!Total` for a name of one sheet.
 */
export interface ExternalLinkName {
  /** The name: `Total` in `Budget.xlsx!Total`. */
  name: string;
  /** The cell or range of the linked workbook that the name refers to, such as `=Annual!$C$10`. */
  refersTo: string;
  /** The sheet whose scope holds the name; absent for a name of the whole workbook. */
  sheet?: string;
}

/**
 * A linked workbook and the values saved for it, as Excel keeps them in the
 * workbook's external link parts. Formulas read the values through
 * references such as `[Budget.xlsx]Annual!C10`.
 */
export interface ExternalLink {
  /** The file name that formulas use: `Budget.xlsx` in `[Budget.xlsx]Annual!C10`. */
  book: string;
  /** Where the linked workbook is, as saved: a relative path, a file path or a URL. */
  target: string;
  /** Sheets of the linked workbook with their saved values, in the linked workbook's order. */
  sheets: ExternalLinkSheet[];
  /** Defined names of the linked workbook; their values are cells of `sheets`. */
  names?: ExternalLinkName[];
}

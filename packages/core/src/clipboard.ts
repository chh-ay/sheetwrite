import { cellScalarToText } from "./cell-input.js";
import {
  type DelimitedTextOptions,
  encodeDelimitedText,
  parseDelimitedText,
} from "./delimited-text.js";
import type { CopiedConditionalFormat, CopiedNote } from "./paste-rules.js";
import type { CellHyperlink, CellScalar, CellStyle, CellValue } from "./types/cell.js";
import type { Range } from "./types/coordinates.js";
import type { CopiedValidation } from "./validation-transfer.js";

// Text beginning with `=`, `+`, `-`, `@`, tab or carriage return gets a leading
// apostrophe wherever Sheetwrite hands text to another application (clipboard
// TSV and HTML, CSV export), so "=cmd|..." cannot run as a formula there.
const INJECTION = /^[=+\-@\t\r]/;

export function neutralizeInjection(value: string): string {
  return INJECTION.test(value) ? `'${value}` : value;
}

/**
 * Serialize a rectangular block to external Excel/Sheets-compatible TSV.
 * Formula-sensitive string prefixes are neutralized; numbers (including
 * negatives) remain numeric text. The result is one synchronous in-memory
 * string and has no BOM because it is a clipboard flavor.
 */
export function rowsToTsv(
  rows: readonly (readonly CellScalar[])[],
  options: DelimitedTextOptions = {},
): string {
  function* external_rows(): Generator<readonly string[]> {
    for (const row of rows) {
      yield row.map((value) =>
        typeof value === "string" ? neutralizeInjection(value) : cellScalarToText(value),
      );
    }
  }
  return encodeDelimitedText(external_rows(), "\t", options);
}

/**
 * Parse external clipboard TSV with the shared bounded delimited parser. Quoted
 * tabs/newlines, doubled quotes, bare CR, LF, CRLF, Unicode, trailing empty
 * fields, syntactically present empty records, and one leading BOM are handled.
 * The synchronous input and returned grid are both fully in memory.
 */
export function parseTsv(text: string, options: DelimitedTextOptions = {}): string[][] {
  return parseDelimitedText(text, "\t", options);
}

/**
 * One copied cell in an internal clipboard snapshot: its source value (a formula
 * whose src is preserved, or a literal), the scalar it resolved to at copy time
 * (used by paste-values), and the style painted on it.
 */
export interface ClipboardCell {
  value: CellValue;
  resolved: CellScalar;
  style: CellStyle;
}

/**
 * Richer-than-TSV snapshot captured on every copy/cut. Paste reuses it —
 * re-anchoring formulas and carrying styles — only when the clipboard payload
 * carries the unguessable in-memory token the controller wrote with it. Any
 * other payload, including a Sheetwrite payload with a different token, pastes
 * as inert external data.
 */
export interface ClipboardSnapshot {
  /** Top-left source cell in data coordinates — the formula re-anchor origin. */
  anchor: { row: number; col: number };
  /** Row-major copied cells in the source's view order. */
  cells: ClipboardCell[][];
  /** Fully-contained source hyperlinks; source ranges retain stable data coordinates. */
  hyperlinks: CellHyperlink[];
  /**
   * The data validation rules over the copied cells, cut to them, which a
   * paste in this grid lands with the cells, as Excel's does.
   */
  validation?: readonly CopiedValidation[];
  /** The TSV written to the system clipboard as its plain-text flavor. */
  tsv: string;
  /** True when produced by cut; only the grid that cut the cells moves them on paste. */
  cut: boolean;
  /**
   * The copied cells in data rows, for Paste Link and the copied notes and
   * rules; null when a sorted view splits them or the payload is foreign.
   */
  source?: Range | null;
  /** Notes of the copied cells. */
  notes?: readonly CopiedNote[];
  /** The parts of conditional formats over the copied cells. */
  conditionalFormats?: readonly CopiedConditionalFormat[];
  /** Widths of the copied columns, for Paste Special's Column widths. */
  columnWidths?: readonly number[];
}

// The values Excel's Formula AutoComplete lists for some arguments, with
// Excel's words for them: `FALSE - Exact match` for VLOOKUP's range_lookup.
// https://support.microsoft.com/en-us/excel/use-formula-autocomplete
// Loads with the built-in function table, on first use only.

import type { FormulaArgumentChoice } from "./types.js";

type Choices = readonly FormulaArgumentChoice[];

function choices(entries: readonly (readonly [value: string, description: string])[]): Choices {
  return entries.map(([value, description]) => ({ value, description }));
}

const RANGE_LOOKUP = choices([
  ["TRUE", "Approximate match"],
  ["FALSE", "Exact match"],
]);
const PAYMENT_TYPE = choices([
  ["0", "End of period"],
  ["1", "Beginning of period"],
]);
const RANK_ORDER = choices([
  ["0", "Descending"],
  ["1", "Ascending"],
]);
const LOOKUP_MATCH_MODE = choices([
  ["0", "Exact match"],
  ["-1", "Exact match or next smaller item"],
  ["1", "Exact match or next larger item"],
  ["2", "Wildcard character match"],
]);
const LOOKUP_SEARCH_MODE = choices([
  ["1", "Search first-to-last"],
  ["-1", "Search last-to-first"],
  ["2", "Binary search (sorted ascending order)"],
  ["-2", "Binary search (sorted descending order)"],
]);
/** SUBTOTAL's functions: 1 to 11, and 101 to 111, which leave out hidden rows. */
const SUBTOTAL_FUNCTIONS = [
  "AVERAGE",
  "COUNT",
  "COUNTA",
  "MAX",
  "MIN",
  "PRODUCT",
  "STDEV",
  "STDEVP",
  "SUM",
  "VAR",
  "VARP",
];
const SUBTOTAL_CHOICES = choices(
  [0, 100].flatMap((base) =>
    SUBTOTAL_FUNCTIONS.map((name, index) => [String(base + index + 1), name] as const),
  ),
);

/**
 * Choices by function name and argument position. CELL lists only the
 * `info_type` values the engine reads.
 */
export const ARGUMENT_CHOICES: Readonly<Record<string, Readonly<Record<number, Choices>>>> = {
  CELL: {
    0: choices([
      ['"address"', "Reference of the first cell in reference, as text"],
      ['"col"', "Column number of the cell in reference"],
      ['"contents"', "Value of the upper-left cell in reference"],
      ['"row"', "Row number of the cell in reference"],
      ['"type"', "Text value corresponding to the type of data in the cell"],
    ]),
  },
  FV: { 4: PAYMENT_TYPE },
  HLOOKUP: { 3: RANGE_LOOKUP },
  MATCH: {
    2: choices([
      ["1", "Less than"],
      ["0", "Exact match"],
      ["-1", "Greater than"],
    ]),
  },
  PMT: { 4: PAYMENT_TYPE },
  PV: { 4: PAYMENT_TYPE },
  RANK: { 2: RANK_ORDER },
  "RANK.AVG": { 2: RANK_ORDER },
  "RANK.EQ": { 2: RANK_ORDER },
  SUBTOTAL: { 0: SUBTOTAL_CHOICES },
  VLOOKUP: { 3: RANGE_LOOKUP },
  XLOOKUP: { 4: LOOKUP_MATCH_MODE, 5: LOOKUP_SEARCH_MODE },
  XMATCH: { 2: LOOKUP_MATCH_MODE, 3: LOOKUP_SEARCH_MODE },
};

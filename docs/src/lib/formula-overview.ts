/**
 * Reader-facing text of the formula functions overview, which
 * scripts/formula-docs.ts generates from the formula inventory: what each
 * function family is for and its most used functions, and why each
 * unsupported group is unsupported. The generator fails when a family or group
 * of the inventory has no entry here, or names a function the family lacks.
 */
import type { IconName } from "../icons/icon-names.js";

export interface FormulaFamilyCard {
  readonly icon: IconName;
  /** One line: what the family's functions are for. */
  readonly purpose: string;
  /** The family's most used functions, most used first. */
  readonly common: readonly string[];
}

/** One card per function family, in the overview's reading order. */
export const FORMULA_FAMILY_CARDS: Readonly<Record<string, FormulaFamilyCard>> = {
  math: {
    icon: "sigma",
    purpose: "Add, round and multiply numbers; trigonometry and matrices.",
    common: ["SUM", "SUMIF", "SUMIFS", "ROUND", "SUMPRODUCT", "ABS", "MOD", "INT"],
  },
  statistical: {
    icon: "analysis",
    purpose: "Count, average and rank values; distributions and regression.",
    common: ["AVERAGE", "COUNT", "COUNTA", "COUNTIF", "COUNTIFS", "MAX", "MIN", "MEDIAN"],
  },
  "lookup-reference": {
    icon: "search",
    purpose: "Find values in a table and build references.",
    common: ["XLOOKUP", "VLOOKUP", "INDEX", "MATCH", "XMATCH", "CHOOSE", "OFFSET", "INDIRECT"],
  },
  text: {
    icon: "type",
    purpose: "Join, split, search and format text.",
    common: ["TEXT", "LEFT", "RIGHT", "MID", "LEN", "TRIM", "TEXTJOIN", "SUBSTITUTE"],
  },
  "date-time": {
    icon: "clock",
    purpose: "Build dates and times, and count the days between them.",
    common: ["TODAY", "DATE", "EOMONTH", "EDATE", "NETWORKDAYS", "WEEKDAY", "YEAR", "DATEDIF"],
  },
  "logical-control": {
    icon: "logic",
    purpose: "Choose between results, and name values with LET and LAMBDA.",
    common: ["IF", "IFS", "AND", "OR", "NOT", "SWITCH", "LET", "LAMBDA"],
  },
  "information-error": {
    icon: "info",
    purpose: "Test what a cell holds, and catch errors.",
    common: ["IFERROR", "IFNA", "ISBLANK", "ISNUMBER", "ISTEXT", "ISERROR", "NA", "CELL"],
  },
  array: {
    icon: "spill",
    purpose: "Filter, sort, stack and reshape ranges into results that spill.",
    common: ["FILTER", "SORT", "UNIQUE", "SEQUENCE", "SORTBY", "TRANSPOSE", "VSTACK", "GROUPBY"],
  },
  financial: {
    icon: "currency",
    purpose: "Loan payments, interest, depreciation and bond prices.",
    common: ["PMT", "PV", "FV", "NPV", "IRR", "RATE", "XNPV", "XIRR"],
  },
  database: {
    icon: "database",
    purpose: "Summarize the rows of a table that match criteria.",
    common: ["DSUM", "DAVERAGE", "DCOUNT", "DCOUNTA", "DGET", "DMAX", "DMIN"],
  },
  engineering: {
    icon: "function",
    purpose: "Convert units and number bases; complex numbers and bitwise math.",
    common: ["CONVERT", "DEC2BIN", "BIN2DEC", "DEC2HEX", "HEX2DEC", "BITAND", "COMPLEX", "ERF"],
  },
};

export interface UnsupportedFormulaGroup {
  /** The group in plain words: "Web functions". */
  readonly name: string;
  /** One sentence: why Sheetwrite does not run them. */
  readonly why: string;
  /** What a cell with one of them shows. */
  readonly shows: "#NAME?" | "#REF!";
  /** When the cell shows it, if not always: "when the workbook saved no values for the link". */
  readonly when?: string;
  readonly see: { readonly label: string; readonly href: string };
}

/** Each unsupported category of the formula inventory, by its id. */
export const UNSUPPORTED_FORMULA_GROUPS: Readonly<Record<string, UnsupportedFormulaGroup>> = {
  volatile: {
    name: "Random arrays",
    why: "RANDARRAY is not available; RAND and RANDBETWEEN give random numbers one cell at a time.",
    shows: "#NAME?",
    see: { label: "See volatile functions", href: "/docs/features/formulas/volatile-functions/" },
  },
  network: {
    name: "Web functions",
    why: "Formulas never make network requests.",
    shows: "#NAME?",
    see: {
      label: "See web functions",
      href: "/docs/reference/excel-function-coverage/#web-functions",
    },
  },
  external: {
    name: "External and live data",
    why: "Formulas do not query data providers or live connections.",
    shows: "#NAME?",
    see: { label: "See all Excel functions", href: "/docs/reference/excel-function-coverage/" },
  },
  cube: {
    name: "Cube functions",
    why: "There is no OLAP cube to read members, sets or values from.",
    shows: "#NAME?",
    see: { label: "See cube functions", href: "/docs/reference/excel-function-coverage/#cubes" },
  },
  "external-workbook": {
    name: "References into other workbooks",
    why: "Sheetwrite never opens another file; a reference reads the values the workbook saved for its link.",
    shows: "#REF!",
    when: "when the workbook saved no values for the link",
    see: {
      label: "See workbook references",
      href: "/docs/features/formulas/authoring-and-references/#references-ranges-and-named-ranges",
    },
  },
  "language-services": {
    name: "Translation and phonetics",
    why: "TRANSLATE and DETECTLANGUAGE need a translation service, and PHONETIC reads furigana that cells do not store.",
    shows: "#NAME?",
    see: {
      label: "See text functions",
      href: "/docs/reference/excel-function-coverage/#text-functions",
    },
  },
};

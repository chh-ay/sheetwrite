import { describe, expect, it } from "bun:test";

import {
  cellDisplayText,
  cellEditText,
  cellScalarToText,
  formulaBarText,
  parseCellEntry,
  parseCellInput,
  parseCellLiteralInput,
} from "../src/cell-input.js";
import type { CellFormat } from "../src/types.js";

const year = new Date().getFullYear();

describe("parseCellInput", () => {
  it.each([
    ["=Sales!E2", "text", undefined, { kind: "formula", src: "=Sales!E2" }],
    ["42.5", "number", undefined, 42.5],
    // A Text-formatted (@) cell keeps what is typed as text, formulas and booleans too.
    ["0123", "number", "@", "0123"],
    ["=A1", "number", "@", "=A1"],
    ["TRUE", "text", "@", "TRUE"],
    [" ", "number", "@", null],
    ["0123", "number", "0.00", 123],
    ["true", "text", undefined, true],
    ["FALSE", "number", undefined, false],
    ["   ", "text", undefined, null],
    ["2024-02-29", "date", undefined, 45_351],
    ["not-a-date", "date", undefined, "not-a-date"],
    ["($ 1,234.50)", "currency", undefined, -1234.5],
    ["USD 12", "currency", undefined, "USD 12"],
    // Text columns do not coerce; general ones do.
    ["5", "text", undefined, "5"],
    ["5", "general", undefined, 5],
  ] as const)("reads %p in a %s column (format %p)", (raw, type, format, expected) => {
    expect(parseCellInput(raw, type as CellFormat, format)).toEqual(
      typeof expected === "object" && expected !== null
        ? expected
        : { kind: "literal", value: expected },
    );
  });

  it("writes booleans in spreadsheet casing, and imported text keeps its type", () => {
    expect([cellScalarToText(true), cellScalarToText(false)]).toEqual(["TRUE", "FALSE"]);
    expect(parseCellLiteralInput("5", "general")).toBe("5");
  });

  it("keeps serial 60 through the editor and through its displayed date", () => {
    expect(cellDisplayText(60, "yyyy-mm-dd")).toBe("1900-02-29");
    expect(parseCellInput(cellScalarToText(60), "number")).toEqual({ kind: "literal", value: 60 });
    expect(parseCellInput(cellDisplayText(60, "yyyy-mm-dd"), "date")).toEqual({
      kind: "literal",
      value: 60,
    });
  });
});

// A `general` column reads typed text as Excel's General format does, and
// gives the cell the number format Excel gives it (#911).
// https://support.microsoft.com/en-us/office/available-number-formats-in-excel-0afe8f52-97db-41f1-b972-4b46e9f1e8d2
describe("typing into a general column", () => {
  const entry = (raw: string, locale?: string): [unknown, string | null] => {
    const { value, numberFormat: number_format } = parseCellEntry(
      raw,
      "general",
      undefined,
      locale,
    );
    return [value.kind === "literal" ? value.value : value, number_format ?? null];
  };
  const this_year = (text: string, locale?: string) => entry(text, locale)[0];

  it.each([
    // Numbers, leading zeros, grouping, signs and scientific notation.
    ["5", undefined, 5, null],
    [" 007 ", undefined, 7, null],
    ["-3.5", undefined, -3.5, null],
    ["+.5", undefined, 0.5, null],
    ["(42)", undefined, -42, null],
    ["1,234", undefined, 1234, "#,##0"],
    ["1,234.5", undefined, 1234.5, "#,##0.00"],
    ["12,34", undefined, "12,34", null],
    ["1e5", undefined, 100_000, "0.00E+00"],
    ["1.5E-3", undefined, 0.0015, "0.00E+00"],
    // Percentages and amounts.
    ["12%", undefined, 0.12, "0%"],
    ["12.5%", undefined, 0.125, "0.00%"],
    ["$4.50", undefined, 4.5, "$#,##0.00"],
    ["$1,200", undefined, 1200, "$#,##0"],
    ["-$4.50", undefined, -4.5, "$#,##0.00"],
    ["€7", undefined, 7, "€#,##0"],
    // Dates and fractions.
    ["1/15/2026", undefined, 46_037, "m/d/yyyy"],
    ["1/15/26", undefined, 46_037, "m/d/yyyy"],
    ["2026-01-15", undefined, 46_037, "m/d/yyyy"],
    ["15-Jan-2026", undefined, 46_037, "d-mmm-yy"],
    ["Jan 15, 2026", undefined, 46_037, "d-mmm-yy"],
    ["Jan-2026", undefined, 46_023, "mmm-yy"],
    ["1 1/2", undefined, 1.5, "# ?/?"],
    ["0 3/16", undefined, 0.1875, "# ??/??"],
    // Excel reads a date of two parts as day and month of this year, then as
    // month and year, then as text. No year has 30 February: February 1930.
    // https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/two-digit-year-numbers
    ["Feb-30", undefined, 10_990, "mmm-yy"],
    ["1/99", undefined, 36_161, "mmm-yy"],
    ["11/95", undefined, 35_004, "mmm-yy"],
    ["13/99", undefined, "13/99", null],
    // Text, and a leading apostrophe forces text.
    ["North", undefined, "North", null],
    ["'007", undefined, "007", null],
    ["'=A1", undefined, "=A1", null],
    ["1/2/3/4", undefined, "1/2/3/4", null],
    ["TRUE", undefined, true, null],
    // The column's number locale: separators and the short date's order.
    ["1.234,5", "de-DE", 1234.5, "#,##0.00"],
    ["4,5", "de-DE", 4.5, null],
    ["15.01.2026", "de-DE", 46_037, "dd.mm.yyyy"],
    ["15/01/2026", "en-GB", 46_037, "dd/mm/yyyy"],
    ["15/01/2026 12:00:00", "en-GB", 46_037.5, "dd/mm/yyyy h:mm:ss"],
    ["1/15/2026", "en-GB", "1/15/2026", null],
    ["2026-01-15", "nl-NL", 46_037, "dd-mm-yyyy"],
  ] as const)("reads %p (locale %p)", (raw, locale, value, format) => {
    expect(entry(raw, locale)).toEqual([value, format]);
  });

  it("reads dates without a year in this year, and times with their formats", () => {
    expect(entry("1/15")).toEqual([this_year(`1/15/${year}`), "d-mmm"]);
    expect(entry("Jan-26")).toEqual([this_year(`1/26/${year}`), "d-mmm"]);
    expect(entry("Jan 26")).toEqual([this_year(`1/26/${year}`), "d-mmm"]);
    expect(entry("15.01", "de-DE")).toEqual([this_year(`15.01.${year}`, "de-DE"), "d-mmm"]);
    for (const [raw, serial, format] of [
      ["9:30", 9.5 / 24, "h:mm"],
      ["9:30 PM", 21.5 / 24, "h:mm AM/PM"],
      ["9:30:15", (9.5 + 15 / 3600) / 24, "h:mm:ss"],
      ["1/15/2026 9:30", 46_037 + 9.5 / 24, "m/d/yyyy h:mm"],
    ] as const) {
      const [value, number_format] = entry(raw);
      expect(value as number).toBeCloseTo(serial, 9);
      expect(number_format).toBe(format);
    }
    expect(parseCellEntry("=A1*2", "general").value).toEqual({ kind: "formula", src: "=A1*2" });
    // The Text format still keeps what is typed.
    expect(parseCellEntry("007", "general", "@").value).toEqual({ kind: "literal", value: "007" });
  });

  it("reads long text in linear time and keeps it as text", () => {
    // A pasted or stored cell of a digit, many spaces and a letter once made
    // the date-and-time form backtrack in quadratic time.
    const text = `1${" ".repeat(20_000)}x`;
    const start = performance.now();
    const { value, numberFormat: number_format } = parseCellEntry(text, "general");
    expect(performance.now() - start).toBeLessThan(50);
    expect(value).toEqual({ kind: "literal", value: text });
    expect(number_format).toBeUndefined();
    expect(cellEditText(text, "general")).toBe(text);
  });

  // The editor opens a cell with text that reads back the same. In US English
  // Excel's formula bar shows a time on the 12-hour clock, whatever the cell's
  // format; other regions use their own clock and short date, with a
  // four-digit year.
  // https://learn.microsoft.com/en-us/answers/questions/5192081/why-does-excel-display-entries-in-am-or-pm-format
  it.each([
    ["007", "general", undefined, undefined, "'007"],
    ["North", "general", undefined, undefined, "North"],
    [46_037, "general", "m/d/yyyy", undefined, "1/15/2026"],
    [0.12, "general", "0%", undefined, "12%"],
    [0.07, "general", "0%", undefined, "7%"],
    [1234.5, "general", "#,##0.00", undefined, "1234.5"],
    // Other columns keep the scalar text, so a number column reads it back.
    [0.12, "number", "0%", undefined, "0.12"],
    [21.5 / 24, "general", "h:mm AM/PM", undefined, "9:30:00 PM"],
    [0, "general", "h:mm AM/PM", undefined, "12:00:00 AM"],
    [21.5 / 24, "general", "h:mm", undefined, "9:30:00 PM"],
    [46_037.5, "general", "m/d/yyyy h:mm", undefined, "1/15/2026 12:00:00 PM"],
    [21.5 / 24, "general", "h:mm", "de-DE", "21:30:00"],
    [21.5 / 24, "general", "h:mm AM/PM", "en-GB", "21:30:00"],
    [46_037.5, "general", "m/d/yyyy h:mm", "de-DE", "15.01.2026 12:00:00"],
    [46_037, "general", "m/d/yyyy", "de-DE", "15.01.2026"],
    [46_037, "general", "m/d/yyyy", "en-GB", "15/01/2026"],
    [46_037, "general", "m/d/yyyy", "en-US", "1/15/2026"],
    // Text that the locale reads as a date opens with an apostrophe.
    ["15.01.2026", "general", undefined, "de-DE", "'15.01.2026"],
    [21.5 / 24, "general", "h:mm", "en-US", "9:30:00 PM"],
    // A text column opens a boolean in spreadsheet casing.
    [true, "text", undefined, undefined, "TRUE"],
  ] as const)("opens %p (%s, %p, %p) in the editor as %p", (value, type, format, locale, text) => {
    expect(cellEditText(value, type, format, locale)).toBe(text);
  });

  it("shows a time in the formula bar on the clock of the locale", () => {
    expect(formulaBarText(21.5 / 24, "h:mm", "en-GB")).toBe("21:30:00");
  });
});

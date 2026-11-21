import { describe, expect, it } from "bun:test";

import {
  cellDisplayText,
  cellEditText,
  cellScalarToText,
  parseCellEntry,
  parseCellInput,
  parseCellLiteralInput,
} from "../src/cell-input.js";

describe("parseCellInput", () => {
  it("keeps cross-sheet links as formulas", () => {
    expect(parseCellInput("=Sales!E2", "text")).toEqual({
      kind: "formula",
      src: "=Sales!E2",
    });
  });

  it("still parses plain number literals for numeric columns", () => {
    expect(parseCellInput("42.5", "number")).toEqual({
      kind: "literal",
      value: 42.5,
    });
  });

  it("keeps input in a Text-formatted (@) cell as text, formulas and booleans too", () => {
    expect(parseCellInput("0123", "number", "@")).toEqual({ kind: "literal", value: "0123" });
    expect(parseCellInput("=A1", "number", "@")).toEqual({ kind: "literal", value: "=A1" });
    expect(parseCellInput("TRUE", "text", "@")).toEqual({ kind: "literal", value: "TRUE" });
    expect(parseCellInput(" ", "number", "@")).toEqual({ kind: "literal", value: null });
    expect(parseCellInput("0123", "number", "0.00")).toEqual({ kind: "literal", value: 123 });
  });

  it("parses and formats native boolean literals using spreadsheet casing", () => {
    expect(parseCellInput("true", "text")).toEqual({ kind: "literal", value: true });
    expect(parseCellInput("FALSE", "number")).toEqual({ kind: "literal", value: false });
    expect(cellScalarToText(true)).toBe("TRUE");
    expect(cellScalarToText(false)).toBe("FALSE");
  });
  it("parses spreadsheet blanks, dates, and accounting currency without coercing invalid text", () => {
    expect(parseCellInput("   ", "text")).toEqual({ kind: "literal", value: null });
    expect(parseCellInput("2024-02-29", "date")).toEqual({ kind: "literal", value: 45_351 });
    expect(parseCellInput("not-a-date", "date")).toEqual({
      kind: "literal",
      value: "not-a-date",
    });
    expect(parseCellInput("($ 1,234.50)", "currency")).toEqual({
      kind: "literal",
      value: -1234.5,
    });
    expect(parseCellInput("USD 12", "currency")).toEqual({
      kind: "literal",
      value: "USD 12",
    });
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
    const { value, numberFormat } = parseCellEntry(raw, "general", undefined, locale);
    return [value.kind === "literal" ? value.value : value, numberFormat ?? null];
  };

  it("reads numbers, leading zeros, grouping, signs and scientific notation", () => {
    expect(entry("5")).toEqual([5, null]);
    expect(entry(" 007 ")).toEqual([7, null]);
    expect(entry("-3.5")).toEqual([-3.5, null]);
    expect(entry("+.5")).toEqual([0.5, null]);
    expect(entry("(42)")).toEqual([-42, null]);
    expect(entry("1,234")).toEqual([1234, "#,##0"]);
    expect(entry("1,234.5")).toEqual([1234.5, "#,##0.00"]);
    expect(entry("12,34")).toEqual(["12,34", null]);
    expect(entry("1e5")).toEqual([100_000, "0.00E+00"]);
    expect(entry("1.5E-3")).toEqual([0.0015, "0.00E+00"]);
  });

  it("reads percentages and amounts with their formats", () => {
    expect(entry("12%")).toEqual([0.12, "0%"]);
    expect(entry("12.5%")).toEqual([0.125, "0.00%"]);
    expect(entry("$4.50")).toEqual([4.5, "$#,##0.00"]);
    expect(entry("$1,200")).toEqual([1200, "$#,##0"]);
    expect(entry("-$4.50")).toEqual([-4.5, "$#,##0.00"]);
    expect(entry("€7")).toEqual([7, "€#,##0"]);
  });

  it("reads dates, times and fractions with their formats", () => {
    expect(entry("1/15/2026")).toEqual([46_037, "m/d/yyyy"]);
    expect(entry("1/15/26")).toEqual([46_037, "m/d/yyyy"]);
    expect(entry("2026-01-15")).toEqual([46_037, "m/d/yyyy"]);
    expect(entry("15-Jan-2026")).toEqual([46_037, "d-mmm-yy"]);
    expect(entry("Jan 15, 2026")).toEqual([46_037, "d-mmm-yy"]);
    expect(entry("Jan-2026")).toEqual([46_023, "mmm-yy"]);
    const [thisYear] = entry(`1/15/${new Date().getFullYear()}`);
    expect(entry("1/15")).toEqual([thisYear, "d-mmm"]);

    const [time, timeFormat] = entry("9:30");
    expect(time).toBeCloseTo(9.5 / 24, 12);
    expect(timeFormat).toBe("h:mm");
    const [evening, eveningFormat] = entry("9:30 PM");
    expect(evening).toBeCloseTo(21.5 / 24, 12);
    expect(eveningFormat).toBe("h:mm AM/PM");
    expect(entry("9:30:15")[1]).toBe("h:mm:ss");
    const [stamp, stampFormat] = entry("1/15/2026 9:30");
    expect(stamp).toBeCloseTo(46_037 + 9.5 / 24, 9);
    expect(stampFormat).toBe("m/d/yyyy h:mm");

    expect(entry("1 1/2")).toEqual([1.5, "# ?/?"]);
    expect(entry("0 3/16")).toEqual([0.1875, "# ??/??"]);
  });

  // Excel reads a date of two parts as day and month of the current year,
  // then as month and year, then as text.
  // https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/two-digit-year-numbers
  it("reads a two-part date as day and month of this year, else as month and year", () => {
    const [january26] = entry(`1/26/${new Date().getFullYear()}`);
    expect(entry("Jan-26")).toEqual([january26, "d-mmm"]);
    expect(entry("Jan 26")).toEqual([january26, "d-mmm"]);
    // No year has 30 February, so this is February 1930.
    expect(entry("Feb-30")).toEqual([10_990, "mmm-yy"]);
    expect(entry("1/99")).toEqual([36_161, "mmm-yy"]);
    expect(entry("11/95")).toEqual([35_004, "mmm-yy"]);
    expect(entry("13/99")).toEqual(["13/99", null]);
  });

  it("keeps text, and a leading apostrophe forces text", () => {
    expect(entry("North")).toEqual(["North", null]);
    expect(entry("'007")).toEqual(["007", null]);
    expect(entry("'=A1")).toEqual(["=A1", null]);
    expect(entry("1/2/3/4")).toEqual(["1/2/3/4", null]);
    expect(entry("TRUE")).toEqual([true, null]);
    expect(parseCellEntry("=A1*2", "general").value).toEqual({ kind: "formula", src: "=A1*2" });
    // The Text format still keeps what is typed.
    expect(parseCellEntry("007", "general", "@").value).toEqual({ kind: "literal", value: "007" });
  });

  it("reads long text in linear time and keeps it as text", () => {
    // A pasted or stored cell of a digit, many spaces and a letter once made
    // the date-and-time form backtrack in quadratic time.
    const text = `1${" ".repeat(20_000)}x`;
    const start = performance.now();
    const { value, numberFormat } = parseCellEntry(text, "general");
    expect(performance.now() - start).toBeLessThan(50);
    expect(value).toEqual({ kind: "literal", value: text });
    expect(numberFormat).toBeUndefined();
    expect(cellEditText(text, "general")).toBe(text);
  });

  it("reads the separators of the column's number locale", () => {
    expect(entry("1.234,5", "de-DE")).toEqual([1234.5, "#,##0.00"]);
    expect(entry("4,5", "de-DE")).toEqual([4.5, null]);
  });

  it("leaves text columns as before, and imported text keeps its type", () => {
    expect(parseCellInput("5", "text")).toEqual({ kind: "literal", value: "5" });
    expect(parseCellInput("5", "general")).toEqual({ kind: "literal", value: 5 });
    expect(parseCellLiteralInput("5", "general")).toBe("5");
  });

  it("opens a cell in the editor with text that reads back the same", () => {
    expect(cellEditText("007", "general")).toBe("'007");
    expect(cellEditText("North", "general")).toBe("North");
    expect(cellEditText(46_037, "general", "m/d/yyyy")).toBe("1/15/2026");
    expect(cellEditText(0.12, "general", "0%")).toBe("12%");
    expect(cellEditText(0.07, "general", "0%")).toBe("7%");
    expect(cellEditText(1234.5, "general", "#,##0.00")).toBe("1234.5");
    // Other columns keep the scalar text, so a number column reads it back.
    expect(cellEditText(0.12, "number", "0%")).toBe("0.12");
  });
});

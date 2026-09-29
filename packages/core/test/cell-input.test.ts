import { describe, expect, it } from "bun:test";
import { cellScalarToText, parseCellInput } from "../src/cell-input.js";

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
});

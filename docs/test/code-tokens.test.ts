import { expect, it } from "bun:test";

import { type RuntimeCodeLanguage, tokenizeCode } from "../src/lib/code-tokens.ts";

const roles = (source: string, language: RuntimeCodeLanguage) =>
  tokenizeCode(source, language)
    .filter((token) => token.role !== undefined)
    .map((token) => [token.text, token.role]);

it("keeps every character of the source, in order", () => {
  const source = '=IF(A1>0, "ok", #N/A) & Sheet2!B$3 * 1.5%';
  expect(
    tokenizeCode(source, "formula")
      .map((token) => token.text)
      .join(""),
  ).toBe(source);
});

it("colours formula functions, references, strings, numbers, errors and operators", () => {
  expect(roles('=SUM(A1:B9)*2 & "x" & #REF!', "formula")).toEqual([
    ["=", "punctuation"],
    ["SUM", "function"],
    ["(", "punctuation"],
    ["A1:B9", "type"],
    [")", "punctuation"],
    ["*", "punctuation"],
    ["2", "number"],
    ["&", "punctuation"],
    ['"x"', "string"],
    ["&", "punctuation"],
    ["#REF!", "number"],
  ]);
});

it("reads sheet prefixes, spill references and names", () => {
  expect(roles("='Q1 sales'!A2# + region", "formula")).toEqual([
    ["=", "punctuation"],
    ["'Q1 sales'!", "property"],
    ["A2#", "type"],
    ["+", "punctuation"],
  ]);
});

it("does not read a cell reference inside a longer name", () => {
  expect(roles("=LAMBDA(x, x*ABC12x)", "formula")).not.toContainEqual(["ABC12", "type"]);
});

it("tells JSON keys from string values", () => {
  expect(roles('{"id": "a", "n": -1.5, "ok": true}', "json")).toEqual([
    ["{", "punctuation"],
    ['"id"', "property"],
    [":", "punctuation"],
    ['"a"', "string"],
    [",", "punctuation"],
    ['"n"', "property"],
    [":", "punctuation"],
    ["-1.5", "number"],
    [",", "punctuation"],
    ['"ok"', "property"],
    [":", "punctuation"],
    ["true", "keyword"],
    ["}", "punctuation"],
  ]);
});

it("colours TypeScript a reader edits: keywords, calls, types, keys, strings and comments", () => {
  const source = [
    'import { createGrid, type Workbook } from "@sheetwrite/core";',
    "// One sheet.",
    "const workbook: Workbook = {",
    '  activeSheet: "sales",',
    "};",
    "grid.store.getCell(addr).resolved; // 16",
  ].join("\n");
  expect(
    tokenizeCode(source, "typescript")
      .map((token) => token.text)
      .join(""),
  ).toBe(source);
  const coloured = roles(source, "typescript");
  expect(coloured).toContainEqual(["import", "keyword"]);
  expect(coloured).toContainEqual(["type", "keyword"]);
  expect(coloured).toContainEqual(['"@sheetwrite/core"', "string"]);
  expect(coloured).toContainEqual(["// One sheet.", "comment"]);
  expect(coloured).toContainEqual(["Workbook", "type"]);
  expect(coloured).toContainEqual(["activeSheet", "property"]);
  expect(coloured).toContainEqual(["getCell", "function"]);
  expect(coloured).toContainEqual(["resolved", "property"]);
  // A variable with a type annotation is not an object key.
  expect(coloured).not.toContainEqual(["workbook", "property"]);
});

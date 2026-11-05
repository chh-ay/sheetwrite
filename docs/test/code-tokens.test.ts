import { expect, it } from "bun:test";

import { tokenizeCode } from "../src/lib/code-tokens.ts";

const roles = (source: string, language: "json" | "formula") =>
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

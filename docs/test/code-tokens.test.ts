import { expect, it } from "bun:test";

import { tokenizeCode } from "../src/lib/code-tokens.ts";

it("tells JSON keys from string values", () => {
  expect(
    tokenizeCode('{"id": "a", "n": -1.5, "ok": true}', "json")
      .filter((token) => token.role !== undefined)
      .map((token) => [token.text, token.role]),
  ).toEqual([
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

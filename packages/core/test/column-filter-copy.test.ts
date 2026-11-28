import { describe, expect, it } from "bun:test";

import { cloneColumnFilter, cloneJsonValue } from "../src/plain-data.js";
import type { ColumnFilter } from "../src/types.js";

function with_hole(): unknown[] {
  const values: unknown[] = ["a", "b"];
  delete values[0];
  return values;
}

function with_getter(): unknown {
  const filter = { kind: "values" };
  Object.defineProperty(filter, "values", { get: () => ["g"], enumerable: true });
  return filter;
}

/** Filters whose copy must equal the JSON round trip, the pick-by-pick ones and the others. */
const FILTERS: ReadonlyArray<readonly [string, unknown]> = [
  [
    "plain scalars, -0 and a lone surrogate",
    { kind: "values", values: ["a", 1, -0, true, null, "\ud800", ""] },
  ],
  ["the other key order", { values: ["a"], kind: "values" }],
  ["non-finite numbers", { kind: "values", values: [Number.NaN, Number.POSITIVE_INFINITY] }],
  ["undefined", { kind: "values", values: [undefined] }],
  ["a hole", { kind: "values", values: with_hole() }],
  ["a named array field", { kind: "values", values: Object.assign(["x"], { extra: 1 }) }],
  ["a nested object", { kind: "values", values: [{ nested: -0 }] }],
  ["an undefined field", { kind: "values", values: ["a"], extra: undefined }],
  ["an extra field", { kind: "values", values: ["a"], extra: 2 }],
  ["a getter", with_getter()],
  ["toJSON", { kind: "values", values: [], toJSON: () => ({ kind: "values", values: ["t"] }) }],
  ["a contains filter", { kind: "contains", text: "x" }],
];

describe("cloneColumnFilter", () => {
  it.each(FILTERS)("copies a value filter with %s as JSON does", (_name, filter) => {
    const column_filter = filter as ColumnFilter;
    const copy = cloneColumnFilter(column_filter);
    const expected = cloneJsonValue(column_filter);

    expect(JSON.stringify(copy)).toBe(JSON.stringify(expected));
    if (copy.kind === "values" && expected.kind === "values") {
      expect(copy.values.map((value) => Object.is(value, -0))).toEqual(
        expected.values.map((value) => Object.is(value, -0)),
      );
    }
  });
});

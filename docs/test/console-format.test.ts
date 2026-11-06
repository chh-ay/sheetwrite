import { expect, it } from "bun:test";

import { formatValue } from "../src/playground/console-format.ts";

it("lists console values the way a browser console would", () => {
  expect(formatValue("plain text")).toBe("plain text");
  expect(formatValue(16)).toBe("16");
  expect(formatValue(10n)).toBe("10n");
  expect(formatValue(undefined)).toBe("undefined");
  expect(formatValue({ kind: "formula", src: "=SUM(B1:B2)" })).toBe(
    '{ kind: "formula", src: "=SUM(B1:B2)" }',
  );
  expect(formatValue([1, "a", null])).toBe('[1, "a", null]');
  expect(formatValue(new Float64Array([12, 4]))).toBe("Float64Array(2) [12, 4]");
  expect(formatValue(new RangeError("too far"))).toBe("RangeError: too far");
  expect(formatValue(function total() {})).toBe("[Function total]");
});

it("stops at circular, deep and long values", () => {
  const loop: Record<string, unknown> = { name: "loop" };
  loop.self = loop;
  expect(formatValue(loop)).toBe('{ name: "loop", self: [Circular] }');
  expect(formatValue({ a: { b: { c: { d: 1 } } } })).toBe("{ a: { b: { c: {…} } } }");
  expect(formatValue(Array.from({ length: 25 }, (_, index) => index))).toContain("… 5 more");
});

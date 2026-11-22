import { describe, expect, test } from "bun:test";

import { boundedJsonByteLength, JsonByteLengthError, measureJson } from "../src/json-bytes.js";

const ENOUGH_BYTES = 1024;

describe("boundedJsonByteLength", () => {
  test("rejects symbol-keyed fields, which JSON would drop", () => {
    const value = { [Symbol("hidden")]: 1, visible: 1 };

    expect(() => boundedJsonByteLength(value, ENOUGH_BYTES)).toThrow(JsonByteLengthError);
  });
});

describe("measureJson of a value its caller built", () => {
  /** An object that holds itself, beside text that passes `limit` on the second time round. */
  function cycle(text_bytes: number): Record<string, unknown> {
    const value: Record<string, unknown> = { text: "x".repeat(text_bytes) };
    value.self = value;
    return value;
  }

  test.each([
    ["inside the limit", 10, ENOUGH_BYTES],
    ["when going round it passes the limit", 600, ENOUGH_BYTES],
  ])("reports a cycle %s as a cycle", (_name, text_bytes, limit) => {
    const { issue } = measureJson(cycle(text_bytes), limit, { builtByCaller: true });

    expect(issue?.kind).toBe("invalid");
    expect(issue?.segments).toEqual(["self"]);
  });

  test("measures a value nested deeper than a snapshot as JSON.stringify does", () => {
    let value: unknown = 1;
    for (let depth = 0; depth < 200; depth++) value = depth % 2 === 0 ? [value] : { next: value };

    expect(measureJson(value, ENOUGH_BYTES * ENOUGH_BYTES, { builtByCaller: true })).toEqual({
      bytes: JSON.stringify(value).length,
    });
  });
});

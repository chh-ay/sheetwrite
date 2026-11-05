import { describe, expect, test } from "bun:test";

import { boundedJsonByteLength, JsonByteLengthError } from "../src/errors.js";

const ENOUGH_BYTES = 1024;

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

describe("boundedJsonByteLength", () => {
  test("measures a toJSON field that is not a function as ordinary data", () => {
    const value = { toJSON: "kept", count: 2 };

    expect(boundedJsonByteLength(value, ENOUGH_BYTES)).toBe(encodedBytes(value));
  });

  test("rejects symbol-keyed fields, which JSON would drop", () => {
    const value = { [Symbol("hidden")]: 1, visible: 1 };

    expect(() => boundedJsonByteLength(value, ENOUGH_BYTES)).toThrow(JsonByteLengthError);
  });
});

import { describe, expect, test } from "bun:test";

import { boundedJsonByteLength, JsonByteLengthError } from "../src/json-bytes.js";

const ENOUGH_BYTES = 1024;

describe("boundedJsonByteLength", () => {
  test("rejects symbol-keyed fields, which JSON would drop", () => {
    const value = { [Symbol("hidden")]: 1, visible: 1 };

    expect(() => boundedJsonByteLength(value, ENOUGH_BYTES)).toThrow(JsonByteLengthError);
  });
});

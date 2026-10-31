import { describe, expect, test } from "bun:test";

import { optionValue, requiredOption } from "../src/cli-options.js";

describe("optionValue", () => {
  test("reads a separate value and an inline value", () => {
    expect(optionValue(["--baseline", "base.json"], "--baseline")).toBe("base.json");
    expect(optionValue(["--baseline=base.json"], "--baseline")).toBe("base.json");
    expect(optionValue(["--other", "x"], "--baseline")).toBeUndefined();
  });

  test("does not read the next flag as the value", () => {
    expect(() => optionValue(["--baseline", "--fresh", "x"], "--baseline")).toThrow(
      "--baseline requires a value",
    );
    expect(() => optionValue(["--baseline"], "--baseline")).toThrow("--baseline requires a value");
    expect(() => optionValue(["--baseline="], "--baseline")).toThrow("--baseline requires a value");
  });

  test("does not take a longer flag that starts with the name", () => {
    expect(optionValue(["--rows-max", "5"], "--rows")).toBeUndefined();
  });
});

describe("requiredOption", () => {
  test("rejects a missing flag", () => {
    expect(() => requiredOption([], "--output")).toThrow("--output is required");
    expect(requiredOption(["--output", "out"], "--output")).toBe("out");
  });
});

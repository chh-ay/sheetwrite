import { describe, expect, it } from "bun:test";

import { exampleError, WRAPPER_LINES } from "../src/playground/example-error.ts";

/** An error from the example's frame, as each engine shapes it. */
function frame_error(fields: Record<string, unknown>): object {
  return { name: "RangeError", message: "broken at 2", ...fields };
}

/** The line of the function that runs the example, for an example line. */
const function_line = (example_line: number) => example_line + WRAPPER_LINES;

describe("the example line of an error", () => {
  it("reads V8's stack: `at eval (example.ts:line:column)`", () => {
    const stack = `RangeError: broken at 2\n    at eval (example.ts:${function_line(3)}:7)\n    at eval (example.ts:${function_line(4)}:3)`;
    expect(exampleError(frame_error({ stack })).line).toBe(3);
  });

  it('reads `name@url:line:column` frames without "at", as SpiderMonkey and JavaScriptCore write them', () => {
    const stack = `@example.ts:${function_line(3)}:7\n@example.ts:${function_line(4)}:3\nrun@http://localhost/assets/run-example.js:7:19`;
    expect(exampleError(frame_error({ stack })).line).toBe(3);
    expect(
      exampleError(frame_error({ stack: `boom@example.ts:${function_line(2)}:22` })).line,
    ).toBe(2);
  });

  it("reads JavaScriptCore's `line` when its stack names no file for `Function` code", () => {
    const error = frame_error({ stack: "@\nanonymous@\n@\n@", line: function_line(3), column: 21 });
    expect(exampleError(error)).toEqual({ name: "RangeError", message: "broken at 2", line: 3 });
  });

  it("points at no line when JavaScriptCore reports another file", () => {
    const error = frame_error({
      stack: "boom@http://localhost/assets/core.js:2:22\n@\nanonymous@\n@",
      line: 2,
      column: 22,
      sourceURL: "http://localhost/assets/core.js",
    });
    expect(exampleError(error).line).toBeUndefined();
  });

  it("points at no line before the example's first line", () => {
    expect(exampleError(frame_error({ stack: "@example.ts:2:1" })).line).toBeUndefined();
    expect(exampleError(frame_error({ stack: "@", line: WRAPPER_LINES })).line).toBeUndefined();
  });

  it("reads a thrown value that is not an error as its text", () => {
    expect(exampleError("text")).toEqual({ name: "Error", message: "text", line: undefined });
    expect(exampleError({ message: "plain", stack: "@" })).toEqual({
      name: "Error",
      message: "plain",
      line: undefined,
    });
  });
});

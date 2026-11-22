/**
 * Reads where an error of a runnable example happened, so the playground can
 * point at the line (see run-example.ts). The example runs as the body of a
 * `Function` made in the example's frame, so its errors come from another
 * realm and are read by shape, not with `instanceof`.
 *
 * Engines report the place differently:
 * - V8 names the example in its stack: `at eval (example.ts:6:7)`.
 * - SpiderMonkey names it too, without "at": `@example.ts:6:7`.
 * - JavaScriptCore writes the same `name@url:line:column` frames for files,
 *   but leaves the URL out for `Function` code (`@` or `anonymous@`), even
 *   with a `//# sourceURL`. It sets `line` (and `sourceURL` for a file) on the
 *   error instead, so an error with a `line` and no `sourceURL` was thrown in
 *   the example.
 */

/** An error of the example, at its line in the example when the engine reports it. */
export interface ExampleError {
  readonly name: string;
  readonly message: string;
  readonly line: number | undefined;
}

/** The example's file name in stack traces and compile errors. */
export const SOURCE_NAME = "example.ts";
/** A stack frame in the example: `example.ts:<line>:<column>`, with or without "at". */
const SOURCE_LOCATION = /example\.ts:(\d+):\d+/;
/**
 * Lines before the example's first line in the function that runs it: the two
 * lines every engine puts before a `Function` body, then the async wrapper.
 */
export const WRAPPER_LINES = 3;

/** An example line from a line of the function that runs it, if it is one. */
function from_function_line(line: number): number | undefined {
  const example_line = line - WRAPPER_LINES;
  return example_line >= 1 ? example_line : undefined;
}

/** The example line an error points at, from its stack or from the engine's own fields. */
function error_line(reason: object): number | undefined {
  const stack = Reflect.get(reason, "stack");
  const frame = SOURCE_LOCATION.exec(typeof stack === "string" ? stack : "")?.[1];
  if (frame !== undefined) return from_function_line(Number.parseInt(frame, 10));

  // JavaScriptCore: `line` is the throwing line; a `source_url` means it was in another file.
  const line = Reflect.get(reason, "line");
  const source_url = Reflect.get(reason, "sourceURL");
  if (typeof line !== "number" || !Number.isInteger(line) || source_url !== undefined) {
    return undefined;
  }
  return from_function_line(line);
}

/** An error the example threw or rejected with, as the playground shows it. */
export function exampleError(reason: unknown): ExampleError {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    const name = "name" in reason && typeof reason.name === "string" ? reason.name : "Error";
    return { name, message: String(reason.message), line: error_line(reason) };
  }
  return { name: "Error", message: String(reason), line: undefined };
}

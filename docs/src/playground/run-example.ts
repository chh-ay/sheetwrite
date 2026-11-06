import { formatValue } from "./console-format.js";
import { type PlaygroundRuntime, RUNTIME_KEY } from "./runtime-contract.js";
// A worker bundle is built on its own, so the engine and packages the frame
// loads never join the page's chunks.
import runtimeUrl from "./runtime.ts?worker&url";

/**
 * Runs a runnable example in its frame. The page compiles the example's
 * TypeScript to plain JavaScript, the frame loads the packages the example
 * imports (see runtime.ts), and the example then runs in the frame, with the
 * frame's `document`, so `#grid` is the frame's grid host. The example's
 * console output and errors come back to the page through the callbacks.
 */

/** One console call of the example, as text. */
export interface ConsoleEntry {
  readonly level: ConsoleLevel;
  readonly text: string;
}

/** An error of the example, at its line in the example when the stack names it. */
export interface ExampleError {
  readonly name: string;
  readonly message: string;
  readonly line: number | undefined;
}

/** Where a run reports to. */
export interface ExampleReporter {
  console(entry: ConsoleEntry): void;
  error(error: ExampleError): void;
}

type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";
const CONSOLE_LEVELS: readonly ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

/** The example's file name in stack traces and compile errors. */
const SOURCE_NAME = "example.ts";
/** A stack frame in the example: `example.ts:<line>:<column>`. */
const SOURCE_LOCATION = /example\.ts:(\d+):\d+/;
/**
 * Lines before the example's first line in the function that runs it: the two
 * lines every engine puts before a `Function` body, then the async wrapper.
 */
const WRAPPER_LINES = 3;
/** Compiles TypeScript to JavaScript; imports become `require` calls the frame answers. */
async function compile(code: string): Promise<string> {
  const { transform } = await import("sucrase");
  return transform(code, {
    transforms: ["typescript", "imports"],
    filePath: SOURCE_NAME,
    disableESTransforms: true,
  }).code;
}

/** The package specifiers compiled code requires, in order, once each. */
function requiredSpecifiers(compiled: string): string[] {
  const specifiers = [...compiled.matchAll(/\brequire\((['"])([^'"]+)\1\)/g)].map(
    (match) => match[2] ?? "",
  );
  return [...new Set(specifiers)];
}

/** The example line a stack trace or compile error points at. */
function exampleLine(text: string | undefined, offset: number): number | undefined {
  const match = SOURCE_LOCATION.exec(text ?? "");
  if (match?.[1] === undefined) return undefined;
  const line = Number.parseInt(match[1], 10) - offset;
  return line >= 1 ? line : undefined;
}

/** An error from the frame. Its realm differs from the page's, so it is read by shape. */
function exampleError(reason: unknown): ExampleError {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    const name = "name" in reason && typeof reason.name === "string" ? reason.name : "Error";
    const stack = "stack" in reason && typeof reason.stack === "string" ? reason.stack : undefined;
    return { name, message: String(reason.message), line: exampleLine(stack, WRAPPER_LINES) };
  }
  return { name: "Error", message: String(reason), line: undefined };
}

/** A compile error: Sucrase ends its message with the position, as `(line:column)`. */
function compileError(reason: unknown): ExampleError {
  const message = reason instanceof Error ? reason.message : String(reason);
  const position = /\s*\((\d+):\d+\)\s*$/.exec(message);
  return {
    name: "SyntaxError",
    message: message.slice(0, position?.index).replace(/^Error transforming [^:]+:\s*/, ""),
    line: position?.[1] === undefined ? undefined : Number.parseInt(position[1], 10),
  };
}

/** The frame's page: the site's stylesheets, its theme, and the `#grid` host examples use. */
export function frameDocument(): string {
  const stylesheets = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    (link) => `<link rel="stylesheet" href="${link.href}">`,
  ).join("");
  const theme = document.documentElement.dataset.theme ?? "light";
  return `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8">${stylesheets}<style>html,body{margin:0;background:transparent;color-scheme:${theme}}</style></head><body><div id="grid"></div></body></html>`;
}

/**
 * A global of the frame's realm. The frame's `Function`, `console` and
 * observers belong to the frame, so code made with them runs there.
 */
function frameGlobal<Value>(view: Window, name: PropertyKey): Value {
  return Reflect.get(view, name) as Value;
}

/** The runtime in the frame's realm, imported by the frame's own `import()`. */
async function frameRuntime(view: Window): Promise<PlaygroundRuntime> {
  const FrameFunction = frameGlobal<FunctionConstructor>(view, "Function");
  const importInFrame = new FrameFunction("url", "return import(url)") as (
    url: string,
  ) => Promise<unknown>;
  await importInFrame(new URL(runtimeUrl, location.href).href);
  const runtime = frameGlobal<PlaygroundRuntime | undefined>(view, RUNTIME_KEY);
  if (runtime === undefined) throw new Error("The playground runtime did not start in the frame");
  return runtime;
}

/** Reports the frame's console calls and uncaught errors to the page. */
function watchFrame(view: Window, report: ExampleReporter): void {
  const frameConsole = frameGlobal<Console>(view, "console");
  for (const level of CONSOLE_LEVELS) {
    const original = frameConsole[level].bind(frameConsole);
    frameConsole[level] = (...values: unknown[]) => {
      original(...values);
      report.console({ level, text: values.map((value) => formatValue(value)).join(" ") });
    };
  }
  view.addEventListener("error", (event) =>
    report.error(exampleError(event.error ?? event.message)),
  );
  view.addEventListener("unhandledrejection", (event) => report.error(exampleError(event.reason)));
}

/**
 * Runs `code` in `frame`, which shows {@link frameDocument}. Resolves `true`
 * when the example finished, or `false` after it reported an error.
 */
export async function runExample(
  frame: HTMLIFrameElement,
  code: string,
  report: ExampleReporter,
): Promise<boolean> {
  const view = frame.contentWindow;
  if (view === null) throw new Error("The example frame has no window");
  watchFrame(view, report);

  let compiled: string;
  try {
    compiled = await compile(code);
  } catch (error) {
    report.error(compileError(error));
    return false;
  }

  try {
    const runtime = await frameRuntime(view);
    const packages = await runtime.loadPackages(requiredSpecifiers(compiled));
    const require = (specifier: string) => packages.get(specifier);
    const FrameFunction = frameGlobal<FunctionConstructor>(view, "Function");
    const example = new FrameFunction(
      "require",
      "exports",
      "module",
      `return (async () => {\n${compiled}\n})();\n//# sourceURL=${SOURCE_NAME}`,
    ) as (...args: unknown[]) => Promise<void>;
    const exports = {};
    await example(require, exports, { exports });
    return true;
  } catch (error) {
    report.error(exampleError(error));
    return false;
  }
}

/** Repaints the example's grids after the page theme changes. */
/** Calls `observe` when the frame's body changes size, with the frame's own observer. */
export function watchFrameHeight(
  frame: HTMLIFrameElement,
  observe: (height: number) => void,
): void {
  const view = frame.contentWindow;
  if (view === null) return;
  const body = view.document.body;
  const FrameResizeObserver = frameGlobal<typeof ResizeObserver>(view, "ResizeObserver");
  new FrameResizeObserver(() => observe(body.scrollHeight)).observe(body);
}

export async function followSiteTheme(frame: HTMLIFrameElement): Promise<void> {
  const view = frame.contentWindow;
  if (view === null) return;
  const theme = document.documentElement.dataset.theme ?? "light";
  view.document.documentElement.dataset.theme = theme;
  view.document.documentElement.style.colorScheme = theme;
  (await frameRuntime(view)).applySiteTheme();
}

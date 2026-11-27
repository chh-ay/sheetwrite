export { installDatasourceClockForTest } from "./datasource-controller.js";
export { type GhostOnScreen, type ShownSuggestion, shownSuggestion } from "./formula-ghost.js";
export { openFormulaEdit } from "./formula-suggestions.js";
export { suggestionWordEnds } from "./formula-words.js";

/**
 * The stub 2D context the canvas test stubs install: every method is a no-op
 * that counts its invocations in `calls`, so tests can assert paint activity
 * (e.g. `ctx.calls.fillText > 0`) without a real canvas.
 */
export interface RecordingContext2D {
  /** Per-method invocation counts, keyed by the 2D-context method name. */
  readonly calls: Record<string, number>;
  /** The last fill style set; starts as `""`. */
  fillStyle: string;
  /** The last stroke style set; starts as `""`. */
  strokeStyle: string;
  /** The last font set; starts as `""`. */
  font: string;
  /** The last text alignment set; starts as `""`. */
  textAlign: string;
  /** The last text baseline set; starts as `""`. */
  textBaseline: string;
  /** The last line width set; starts as 1. */
  lineWidth: number;
  /** Any other context method: it does nothing and counts the call in `calls`. */
  [method: string]: unknown;
}

/** Layout dimensions installed by {@link installCanvasTestStubs} in DOM test environments. */
export interface CanvasTestStubOptions {
  /** Stubbed `clientWidth` for every element (happy-dom/jsdom have no layout). Default 800. */
  width?: number;
  /** Stubbed `clientHeight` for every element. Default 400. */
  height?: number;
}

function make_recording_context(canvas: HTMLCanvasElement): RecordingContext2D {
  const calls: Record<string, number> = {};
  const target: Record<string, unknown> = {
    calls,
    canvas,
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 1,
  };

  // A Proxy covers every context method the renderer may call — present and
  // future — while still recording per-method counts for paint assertions.
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return Reflect.get(object, property);
      if (typeof property !== "string") return undefined;
      return (...args: unknown[]) => {
        calls[property] = (calls[property] ?? 0) + 1;
        if (property === "measureText") {
          return { width: String(args[0] ?? "").length * 7 };
        }
      };
    },
    set(object, property, value) {
      Reflect.set(object, property, value);
      return true;
    },
  }) as unknown as RecordingContext2D;
}

/**
 * Install the canvas + layout stubs a DOM test environment (jsdom/happy-dom)
 * needs before `createGrid` can mount — without them the renderer throws
 * `"Sheetwrite: 2D canvas context is unavailable"`. Returns a restore
 * function that undoes every patch.
 *
 * The installed `getContext("2d")` returns a per-canvas
 * {@link RecordingContext2D}; re-request it from a mounted canvas to assert
 * paint activity. Nothing is painted — assert grid STATE, not pixels.
 * Test-only: never import from production code.
 *
 * @returns A function that removes the stubs and restores the originals.
 */
export function installCanvasTestStubs(options: CanvasTestStubOptions = {}): () => void {
  const width = options.width ?? 800;
  const height = options.height ?? 400;

  const original_get_context = HTMLCanvasElement.prototype.getContext;
  const original_client_width = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  const original_client_height = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  );

  const contexts = new WeakMap<HTMLCanvasElement, RecordingContext2D>();
  const stub = function (this: HTMLCanvasElement): CanvasRenderingContext2D {
    let context = contexts.get(this);
    if (!context) {
      context = make_recording_context(this);
      contexts.set(this, context);
    }
    return context as unknown as CanvasRenderingContext2D;
  };
  HTMLCanvasElement.prototype.getContext =
    stub as unknown as typeof HTMLCanvasElement.prototype.getContext;

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => height,
  });

  return () => {
    HTMLCanvasElement.prototype.getContext = original_get_context;
    if (original_client_width) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", original_client_width);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    }
    if (original_client_height) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", original_client_height);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    }
  };
}

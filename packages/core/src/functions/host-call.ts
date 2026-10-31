import type { FormulaArgument, FormulaFunction, FormulaScalar } from "./types.js";

/** Cell kinds in the flat argument buffers; `packages/wasm/src/eval/custom.rs` writes the same codes. */
const KIND_NUMBER = 1;
const KIND_TEXT = 2;
const KIND_BOOLEAN = 3;

/** The engine reads the result from this tag; an absent result is an empty cell. */
const VALUE_ERROR = "e";

/**
 * What the engine calls: every argument in flat buffers, as documented on the
 * `HostCallback` import in `packages/wasm/src/eval/custom.rs`. The buffers are
 * views into engine memory, so they are read before the host function runs.
 */
export type HostCall = (
  shapes: Uint32Array,
  kinds: Uint8Array,
  numbers: Float64Array,
  text: string,
  textEnds: Uint32Array,
) => string | undefined;

function decodeArguments(
  shapes: Uint32Array,
  kinds: Uint8Array,
  numbers: Float64Array,
  text: string,
  textEnds: Uint32Array,
): FormulaArgument[] {
  const values: FormulaArgument[] = [];
  let cell = 0;
  let textIndex = 0;

  const nextScalar = (): FormulaScalar => {
    const kind = kinds[cell];
    const number = numbers[cell] ?? 0;
    cell += 1;
    if (kind === KIND_NUMBER) return number;
    if (kind === KIND_BOOLEAN) return number !== 0;
    if (kind !== KIND_TEXT) return null;

    const start = textIndex === 0 ? 0 : (textEnds[textIndex - 1] ?? 0);
    const end = textEnds[textIndex] ?? start;
    textIndex += 1;
    return text.slice(start, end);
  };

  for (let shape = 0; shape + 1 < shapes.length; shape += 2) {
    const rowCount = shapes[shape] ?? 0;
    const colCount = shapes[shape + 1] ?? 0;

    // One cell reads as its scalar, so `F(A1)` and `F(1)` receive the same value.
    if (rowCount <= 1 && colCount <= 1) {
      values.push(rowCount * colCount === 0 ? null : nextScalar());
      continue;
    }

    const rows: FormulaScalar[][] = [];
    for (let row = 0; row < rowCount; row += 1) {
      rows.push(Array.from({ length: colCount }, nextScalar));
    }
    values.push(rows);
  }

  return values;
}

/** Only a scalar has a tag; a promise or any other value becomes `#VALUE!`. */
function encodeResult(result: unknown): string | undefined {
  if (result === null || result === undefined) return undefined;
  if (typeof result === "number") return `n${result}`;
  if (typeof result === "string") return `s${result}`;
  if (typeof result === "boolean") return result ? "b1" : "b0";

  return VALUE_ERROR;
}

/**
 * Wraps a host function for the engine. A JavaScript exception must not cross
 * into the engine, because it would unwind through the busy engine store and
 * leave it unable to be freed, so a thrown error becomes `#VALUE!` here.
 * `onCall` brackets the call so that the store can refuse use while it runs.
 */
export function hostCall(
  implementation: FormulaFunction,
  onCall: (running: boolean) => void,
): HostCall {
  return (shapes, kinds, numbers, text, textEnds) => {
    onCall(true);
    try {
      return encodeResult(
        implementation(...decodeArguments(shapes, kinds, numbers, text, textEnds)),
      );
    } catch {
      // The documented result of a failing host function; the formula shows it.
      return VALUE_ERROR;
    } finally {
      onCall(false);
    }
  };
}

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

function decode_arguments(
  shapes: Uint32Array,
  kinds: Uint8Array,
  numbers: Float64Array,
  text: string,
  text_ends: Uint32Array,
): FormulaArgument[] {
  const values: FormulaArgument[] = [];
  let cell = 0;
  let text_index = 0;

  const next_scalar = (): FormulaScalar => {
    const kind = kinds[cell];
    const number = numbers[cell] ?? 0;
    cell += 1;
    if (kind === KIND_NUMBER) return number;
    if (kind === KIND_BOOLEAN) return number !== 0;
    if (kind !== KIND_TEXT) return null;

    const start = text_index === 0 ? 0 : (text_ends[text_index - 1] ?? 0);
    const end = text_ends[text_index] ?? start;
    text_index += 1;
    return text.slice(start, end);
  };

  for (let shape = 0; shape + 1 < shapes.length; shape += 2) {
    const row_count = shapes[shape] ?? 0;
    const col_count = shapes[shape + 1] ?? 0;

    // One cell reads as its scalar, so `F(A1)` and `F(1)` receive the same value.
    if (row_count <= 1 && col_count <= 1) {
      values.push(row_count * col_count === 0 ? null : next_scalar());
      continue;
    }

    const rows: FormulaScalar[][] = [];
    for (let row = 0; row < row_count; row += 1) {
      rows.push(Array.from({ length: col_count }, next_scalar));
    }
    values.push(rows);
  }

  return values;
}

/** Only a scalar has a tag; a promise or any other value becomes `#VALUE!`. */
function encode_result(result: unknown): string | undefined {
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
  return (shapes, kinds, numbers, text, text_ends) => {
    onCall(true);
    try {
      return encode_result(
        implementation(...decode_arguments(shapes, kinds, numbers, text, text_ends)),
      );
    } catch {
      // The documented result of a failing host function; the formula shows it.
      return VALUE_ERROR;
    } finally {
      onCall(false);
    }
  };
}

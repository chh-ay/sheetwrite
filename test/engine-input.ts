import type { CellStore } from "@sheetwrite/wasm";

interface EngineInput {
  setBlockPacked: CellStore["setBlockPacked"];
}

type FixtureValue = string | number | boolean | null | { readonly formula: string };

/** Write fixture values through the same mixed-block transport used by core. */
export function writeEngineColumn(
  store: EngineInput,
  sheet: number,
  col: number,
  startRow: number,
  values: ArrayLike<FixtureValue>,
  style: number,
): void {
  if (values.length === 0) return;

  const kinds = new Uint8Array(values.length);
  const numbers = new Float64Array(values.length);
  const styles = new Uint32Array(values.length).fill(style);
  const formulaOffsets: number[] = [];
  const formulas: string[] = [];
  const textOffsets: number[] = [0];
  const textChunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let textLength = 0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (typeof value === "number") {
      kinds[index] = 1;
      numbers[index] = value;
    } else if (typeof value === "boolean") {
      kinds[index] = 3;
      numbers[index] = Number(value);
    } else if (typeof value === "string") {
      kinds[index] = 2;
      const bytes = encoder.encode(value);
      textChunks.push(bytes);
      textLength += bytes.length;
      textOffsets.push(textLength);
    } else if (value !== null && value !== undefined) {
      formulaOffsets.push(index);
      formulas.push(value.formula);
    }
  }

  const text = new Uint8Array(textLength);
  let textAt = 0;
  for (const chunk of textChunks) {
    text.set(chunk, textAt);
    textAt += chunk.length;
  }

  const status = store.setBlockPacked(
    sheet, startRow, col, values.length, 1, kinds, numbers,
    text, Uint32Array.from(textOffsets), styles,
    Uint32Array.from(formulaOffsets), formulas, new Uint32Array(), new Uint32Array(),
  );
  if (status !== 0) throw new Error(`Engine fixture block rejected with status ${status}`);
}

/** One-cell fixture writes still use the production mixed-block transport. */
export function writeEngineCell(
  store: EngineInput,
  sheet: number,
  row: number,
  col: number,
  value: FixtureValue,
  style: number,
): void {
  writeEngineColumn(store, sheet, col, row, [value], style);
}

/** Decode valid UTF-16 fixture lengths before using the packed block writer. */
export function writeEngineTextColumn(
  store: EngineInput,
  sheet: number,
  col: number,
  startRow: number,
  text: string,
  lengths: Uint32Array,
  style: number,
): void {
  let offset = 0;
  const values = Array.from(lengths, (length) => {
    const value = text.slice(offset, offset + length);
    offset += length;
    return value;
  });

  writeEngineColumn(store, sheet, col, startRow, values, style);
}

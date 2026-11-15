import type { CellStore } from "@sheetwrite/wasm";

/** The packed writer is shared by fixture setup and explicit ingest benchmarks. */
export type PackedFixtureStore = Pick<CellStore, "setBlockPacked">;

const EMPTY_BYTES = new Uint8Array();
const EMPTY_WORDS = new Uint32Array();
const NO_TEXT = Uint32Array.of(0);
const ENCODER = new TextEncoder();

function writeColumn(
  store: PackedFixtureStore,
  sheet: number,
  col: number,
  startRow: number,
  kinds: Uint8Array,
  numbers: Float64Array,
  text: Uint8Array,
  offsets: Uint32Array,
  style: number,
): void {
  if (kinds.length === 0) return;
  const status = store.setBlockPacked(
    sheet,
    startRow,
    col,
    kinds.length,
    1,
    kinds,
    numbers,
    text,
    offsets,
    new Uint32Array(kinds.length).fill(style),
    EMPTY_WORDS,
    [],
    EMPTY_WORDS,
    EMPTY_WORDS,
  );
  if (status !== 0) throw new Error(`Packed benchmark fixture rejected: ${status}`);
}

export function writeNumberColumn(
  store: PackedFixtureStore,
  sheet: number,
  col: number,
  startRow: number,
  values: Float64Array,
  style: number,
): void {
  writeColumn(
    store,
    sheet,
    col,
    startRow,
    new Uint8Array(values.length).fill(1),
    values,
    EMPTY_BYTES,
    NO_TEXT,
    style,
  );
}

export function writeStringColumn(
  store: PackedFixtureStore,
  sheet: number,
  col: number,
  startRow: number,
  values: readonly string[],
  style: number,
): void {
  const chunks = values.map((value) => ENCODER.encode(value));
  const offsets = new Uint32Array(chunks.length + 1);
  for (let index = 0; index < chunks.length; index++) {
    offsets[index + 1] = offsets[index]! + chunks[index]!.length;
  }
  const text = new Uint8Array(offsets[chunks.length]!);
  for (let index = 0; index < chunks.length; index++) text.set(chunks[index]!, offsets[index]!);
  writeColumn(
    store,
    sheet,
    col,
    startRow,
    new Uint8Array(values.length).fill(2),
    new Float64Array(values.length),
    text,
    offsets,
    style,
  );
}

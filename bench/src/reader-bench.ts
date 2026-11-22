/**
 * One engine, one process: builds the fixtures untimed, then times every
 * run-based `CellStorage` reader: window projection, formula range readers,
 * column queries, batched cell reads and capture/persistence readers. Prints
 * one JSON line on stdout. `reader-gate.ts` runs it once per side per pair.
 *
 *   bun bench/src/reader-bench.ts <checkout> calibrate
 *     -> {"<reader>": iterations, ...}
 *   bun bench/src/reader-bench.ts <checkout> run <iterations.json>
 *     -> {"results": [ReaderRunResult, ...]}
 *
 * `calibrate` sizes each reader's loop so one sample aims at TARGET_SAMPLE_MS
 * on the engine it runs on; `run` reuses fixed loop counts so both engines do
 * identical work per sample. After the timed samples, `run` calls each reader
 * again, untimed, and hashes its full results into the digest that both
 * engines must agree on. The harness always comes from
 * this checkout; `<checkout>` only supplies the built `packages/wasm/pkg`, so an
 * older base without this file can still be measured. The optional
 * `READER_CASES` regex narrows a run to the readers being attributed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateExactMatrix } from "./gate-protocol.js";
import { writeNumberColumn, writeStringColumn, type PackedFixtureStore } from "./packed-fixture.js";
import { now, summarize } from "./stats.js";

const ROWS = 100_000;
/** A num, B label, C mixed, D =A*2, E num with gaps, F..H num. */
const MAIN_COLUMNS = 8;
/** A..D as in the main sheet, E unused, F holds the range formulas. */
const RANGE_COLUMNS = 6;
const RANGE_RESULT_COLUMN = 5;
const RANGE_FORMULAS_PER_SCENARIO = 8;
const DISTINCT_LABELS = 5_000;
const FIRST_EDGE_GAP_ROW = 25_000;
const EDGE_GAP_ROWS = [FIRST_EDGE_GAP_ROW, 50_000, 75_000] as const;
const VIEWPORT_ROWS = 40;
const LARGE_WINDOW_ROWS = 1_000;
const SCATTERED_CELLS = 4_096;
const CAPTURE_ROWS = 1_000;
/** A prime stride walks window start rows across the whole sheet instead of re-reading one hot block. */
const ROW_START_STRIDE = 7_919;
const TARGET_SAMPLE_MS = 120;
const SAMPLES = 5;
const WARMUP_SAMPLES = 1;
/**
 * Loop iterations the untimed digest pass hashes. Window readers move their
 * start row each iteration, so a few iterations check several windows; the
 * range readers recompute once per iteration, so more would add seconds.
 */
const DIGEST_ITERATIONS = 4;
const COLUMN_A = 0;
const COLUMN_B = 1;
const COLUMN_C = 2;
const COLUMN_D = 3;
const COLUMN_E = 4;
/** `CellOut.kind` of a formula with a numeric result; an error result reads as text instead. */
const CELL_KIND_NUMERIC_FORMULA = 4;
const AGGREGATE_SUM = 0;
const AGGREGATE_AVERAGE = 1;
const AGGREGATE_COUNT = 4;
const FILTER_VALUE_SET = 0;
const FILTER_CONTAINS = 1;
const FILTER_NUMBER_COMPARE = 2;
const COMPARE_GREATER = 0;
const COND_GREATER = 0;
const COND_TEXT_EQUAL = 3;
const COND_CONTAINS = 5;
const COND_FORMULA = 6;
const SORT_ASCENDING = 1;
const SORT_DESCENDING = 0;
/** Conditional rule threshold on column A: about half the random 0..1000 values pass. */
const COND_A_THRESHOLD = 500;
/** filterRowsMulti threshold on column A: most rows pass, so later filters see real work. */
const FILTER_A_THRESHOLD = 100;
const DISTINCT_LIMIT = 100_000;
const LCG_SEED = 0x5eed;
const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;
const UINT32_RANGE = 2 ** 32;
const NUMBER_SCALE = 1_000;
const MIXED_KINDS = 4;
const MIXED_NUMBER_KIND = 0;
const MIXED_TEXT_KIND = 1;
const MIXED_BOOLEAN_KIND = 2;
const MIXED_TEXT_VARIANTS = 37;
const EDIT_LABEL_VARIANTS = 50;
/** Random numbers carry two decimals, like currency amounts. */
const CENTS = 100;
/** Boolean cells: rows ≡ 2 (mod 8) are TRUE, the other boolean rows FALSE. */
const TRUE_EVERY_ROWS = 8;
const TRUE_ROW_REMAINDER = 2;
/**
 * Calibration overshoots the target so samples stay near it on a faster
 * candidate. It is not a floor: a reader whose first loops run slower than
 * later ones can still sample well below the target (41 ms for AVG D).
 */
const CALIBRATION_HEADROOM = 1.25;
const MIN_MEASURABLE_MS = 0.01;
const MAX_CALIBRATION_GROWTH = 100;
const DEFAULT_STYLE = 0;
const WASM_PACKAGE = "packages/wasm/pkg";
/** filterRows needles: a label prefix shared by about 1 in 450 labels, and a mixed-column text. */
const FILTER_LABEL_NEEDLE = "item-12";
const FILTER_MIXED_NEEDLE = "x1";
/** search queries: a label substring, and one mixed-column text that must match a whole cell. */
const SEARCH_SUBSTRING = "item-123";
const SEARCH_WHOLE_CELL = "x7";
/** cyrb53 seeds, multipliers and output mask: a 53-bit hash fits a JSON number exactly. */
const HASH_SEED_HIGH = 0xdeadbeef;
const HASH_SEED_LOW = 0x41c6ce57;
const HASH_MULTIPLIER_HIGH = 2_654_435_761;
const HASH_MULTIPLIER_LOW = 1_597_334_677;
const HASH_FINAL_A = 2_246_822_507;
const HASH_FINAL_B = 3_266_489_909;
const HASH_HIGH_BITS_MASK = 0x1f_ffff;
const UINT32_SPAN = 2 ** 32;
const WORDS_PER_FLOAT64 = 2;

/**
 * Every reader the harness measures, in run order. `reader-gate.ts` validates
 * child output and the noise-floor file against this list without loading an
 * engine; the harness checks its built cases against it on every run.
 */
export const READER_CASE_NAMES = [
  "getWindow 40x8",
  "getWindow 1000x8",
  "getWindow 40x8 cond rules",
  "getWindow 1000x8 cond rules",
  "getWindow 1000x8 formula rule",
  "getWindowRows 40x8 sorted",
  "getWindowRows 1000x8 sorted",
  "aggregate SUM A",
  "aggregate AVG D (formulas)",
  "aggregate COUNT C (mixed)",
  "sortRowsMulti A numeric",
  "sortRowsMulti B text",
  "sortRowsMulti D formulas",
  "sortRowsMulti B,A all rows",
  "sortRowsMulti C,D 50k candidates",
  "filterRows B contains",
  "filterRows C mixed",
  "filterRowsMulti A>100,B~item-1,C set",
  "search B,C,D substring",
  "search all cols whole-cell",
  "distinctValues B text",
  "distinctValues D formulas",
  "dataEdge E down to gap",
  "dataEdge row right",
  "dataEdgeOrdered E by A order",
  "getCell 4096 scattered",
  "cellSnapshots 4096 scattered",
  "captureRange 1000x8 + numbers",
  "persistedCellData whole sheet",
  "rangeStyleIds whole sheet",
  "range SUM(A) dense numbers",
  "range SUM(D) calculated values",
  "range AVERAGE(A)",
  "range COUNTA(C) mixed",
  "range MAX(A,D) two ranges",
  "range COUNTIF(B) text",
  "range SUMIF(A,>500,D)",
  "range SUMIFS(A;B,C)",
  "range SUMPRODUCT(A,D) array args",
  "range MATCH(B) miss, full scan",
] as const;

export const READER_GROUPS = ["window", "query", "cells", "range"] as const;
export type ReaderGroup = (typeof READER_GROUPS)[number];

/** One reader's timed samples from one `run` process. */
export interface ReaderRunResult {
  name: string;
  group: ReaderGroup;
  fixture: string;
  iterations: number;
  sampleMs: number[];
  medianSampleMs: number;
  /** Hash of the reader's full results over DIGEST_ITERATIONS calls; both engines must agree. */
  digest: number;
}

/** The reader names a run measures, after the optional `READER_CASES` regex. */
export function selectedReaderCaseNames(filter = process.env.READER_CASES): string[] {
  const pattern = filter === undefined ? undefined : new RegExp(filter, "u");
  const names = READER_CASE_NAMES.filter((name) => pattern === undefined || pattern.test(name));
  if (names.length === 0) throw new Error(`READER_CASES=${String(filter)} selects no reader`);
  return names;
}

interface WindowViewHandle {
  takePacked(): Uint8Array;
  takeStrings(): string[];
  free(): void;
}
interface DistinctColumnHandle {
  takeKinds(): Uint8Array;
  takeNumbers(): Float64Array;
  takeTexts(): string[];
  free(): void;
}
interface CellHandle {
  readonly kind: number;
  readonly num: number;
  readonly string: string | undefined;
  free(): void;
}
interface CellSnapshotHandle {
  readonly kinds: Uint8Array;
  readonly numbers: Float64Array;
  readonly strings: string[];
  free(): void;
}
interface RangeSnapshotHandle {
  byteLength(): number;
  kinds(): Uint8Array;
  free(): void;
}
/** The `CellStore` surface the readers use, including packed fixture writes. */
interface Engine {
  addSheet(nCols: number, rowCount: number): number;
  setNumber(sheet: number, row: number, col: number, value: number, style: number): void;
  setString(sheet: number, row: number, col: number, value: string, style: number): void;
  setBool(sheet: number, row: number, col: number, value: boolean, style: number): void;
  setFormula(sheet: number, row: number, col: number, src: string, style: number): number;
  setBlockPacked: PackedFixtureStore["setBlockPacked"];
  setConditionalRules(
    sheet: number,
    kinds: Uint8Array,
    bounds: Uint32Array,
    nums: Float64Array,
    strs: string[],
    flags: Uint8Array,
  ): void;
  recompute(sheet: number): void;
  getCell(sheet: number, row: number, col: number): CellHandle;
  cellSnapshots(
    sheet: number,
    rows: Uint32Array,
    cols: Uint32Array,
  ): CellSnapshotHandle | undefined;
  captureRange(
    sheet: number,
    r0: number,
    c0: number,
    rows: number,
    cols: number,
  ): RangeSnapshotHandle | undefined;
  snapshotNumbers(snapshot: RangeSnapshotHandle): Float64Array;
  persistedCellData(sheet: number): Float64Array;
  rangeStyleIds(sheet: number, r0: number, c0: number, r1: number, c1: number): Uint32Array;
  aggregate(sheet: number, col: number, op: number): number;
  sortRowsMulti(
    sheet: number,
    cols: Uint32Array,
    ascending: Uint8Array,
    candidates: Uint32Array,
  ): Uint32Array;
  filterRows(sheet: number, col: number, needle: string): Uint32Array;
  filterRowsMulti(
    sheet: number,
    cols: Uint32Array,
    kinds: Uint8Array,
    flags: Uint8Array,
    nums: Float64Array,
    numCounts: Uint32Array,
    textCounts: Uint32Array,
    valueNums: Float64Array,
    valueTexts: string[],
  ): Uint32Array;
  search(
    sheet: number,
    cols: Uint32Array,
    query: string,
    caseInsensitive: boolean,
    wholeCell: boolean,
  ): Uint32Array;
  distinctValues(sheet: number, col: number, limit: number): DistinctColumnHandle;
  dataEdge(sheet: number, row: number, col: number, dRow: number, dCol: number): number;
  dataEdgeOrdered(
    sheet: number,
    order: Uint32Array,
    row: number,
    col: number,
    dRow: number,
    dCol: number,
  ): number;
  getWindow(sheet: number, rowStart: number, rowEnd: number, cols: Uint32Array): WindowViewHandle;
  getWindowRows(sheet: number, rows: Uint32Array, cols: Uint32Array): WindowViewHandle;
  free(): void;
}
interface EngineModule {
  CellStore: new () => Engine;
  initSync(options: { module: Uint8Array }): unknown;
}

/** Where a reader sends what it read. Timed samples discard it; the digest pass hashes it. */
interface ResultSink {
  number(value: number): void;
  numbers(values: Float64Array): void;
  integers(values: Uint8Array | Uint32Array): void;
  text(value: string | undefined): void;
  texts(values: readonly string[]): void;
}

/** One measured reader: `run` does one call and sends every result value to `sink`. */
interface ReaderCase {
  name: string;
  group: ReaderGroup;
  fixture: string;
  run(iteration: number, sink: ResultSink): void;
}

const DISCARD: ResultSink = {
  number() {},
  numbers() {},
  integers() {},
  text() {},
  texts() {},
};

/**
 * cyrb53 over 32-bit words. Numbers hash their IEEE bits, so NaN and the
 * infinities count, and every array hashes its length before its items.
 */
class ContentHash implements ResultSink {
  readonly #float = new Float64Array(1);
  readonly #float_words = new Uint32Array(this.#float.buffer);
  #high = HASH_SEED_HIGH;
  #low = HASH_SEED_LOW;

  number(value: number): void {
    this.#float[0] = value;
    this.#word(this.#float_words[0] ?? 0);
    this.#word(this.#float_words[1] ?? 0);
  }

  numbers(values: Float64Array): void {
    this.integers(
      new Uint32Array(values.buffer, values.byteOffset, values.length * WORDS_PER_FLOAT64),
    );
  }

  integers(values: Uint8Array | Uint32Array): void {
    this.#word(values.length);
    for (const value of values) this.#word(value);
  }

  text(value: string | undefined): void {
    if (value === undefined) {
      // Absent text and "" must differ, so absence hashes as length -1.
      this.#word(-1);
      return;
    }

    this.#word(value.length);
    for (let index = 0; index < value.length; index++) this.#word(value.charCodeAt(index));
  }

  texts(values: readonly string[]): void {
    this.#word(values.length);
    for (const value of values) this.text(value);
  }

  digest(): number {
    let high = this.#high;
    let low = this.#low;
    high = Math.imul(high ^ (high >>> 16), HASH_FINAL_A);
    high ^= Math.imul(low ^ (low >>> 13), HASH_FINAL_B);
    low = Math.imul(low ^ (low >>> 16), HASH_FINAL_A);
    low ^= Math.imul(high ^ (high >>> 13), HASH_FINAL_B);
    return UINT32_SPAN * (HASH_HIGH_BITS_MASK & low) + (high >>> 0);
  }

  #word(word: number): void {
    this.#high = Math.imul(this.#high ^ word, HASH_MULTIPLIER_HIGH);
    this.#low = Math.imul(this.#low ^ word, HASH_MULTIPLIER_LOW);
  }
}

/** Deterministic LCG: both engines must see byte-identical fixtures. */
function create_unit_random(): () => number {
  let state = LCG_SEED;
  return () => {
    state = (Math.imul(state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    return state / UINT32_RANGE;
  };
}

function consume_window(view: WindowViewHandle, sink: ResultSink): void {
  const packed = view.takePacked();
  const strings = view.takeStrings();
  view.free();
  sink.integers(packed);
  sink.texts(strings);
}

function consume_distinct(column: DistinctColumnHandle, sink: ResultSink): void {
  const kinds = column.takeKinds();
  const numbers = column.takeNumbers();
  const texts = column.takeTexts();
  column.free();
  sink.integers(kinds);
  sink.numbers(numbers);
  sink.texts(texts);
}

/** Read one cell's kind, number and text; error results read as text. */
function consume_cell(
  store: Engine,
  sheet: number,
  row: number,
  col: number,
  sink: ResultSink,
): void {
  const cell = store.getCell(sheet, row, col);
  sink.number(cell.kind);
  sink.number(cell.num);
  sink.text(cell.string);
  cell.free();
}

/**
 * Write a formula. A rejected write returns NaN; a parse failure returns 0,
 * like a valid formula over an empty cell, so callers check the value after
 * recompute.
 */
function write_formula(
  store: Engine,
  sheet: number,
  row: number,
  col: number,
  source: string,
): void {
  if (Number.isNaN(store.setFormula(sheet, row, col, source, DEFAULT_STYLE))) {
    throw new Error(`setFormula rejected ${source}`);
  }
}

/** A recomputed formula cell must hold a number; an error reads as text. */
function recomputed_number(store: Engine, sheet: number, row: number, col: number): number {
  const cell = store.getCell(sheet, row, col);
  const { kind, num, string } = cell;
  cell.free();
  if (kind !== CELL_KIND_NUMERIC_FORMULA || !Number.isFinite(num)) {
    throw new Error(`formula at row ${row}, column ${col} computed ${string ?? num}, not a number`);
  }
  return num;
}

function row_start_for(iteration: number): number {
  return (iteration * ROW_START_STRIDE) % (ROWS - LARGE_WINDOW_ROWS);
}

/** `X{index+1}:X100000`, so the formulas of one family are distinct but each spans ~100k rows. */
function range_of(col: number, index: number): string {
  const letter = String.fromCharCode("A".charCodeAt(0) + col);
  return `${letter}${index + 1}:${letter}${ROWS}`;
}

/** Writes the fixture sheets. Call order fixes the random stream, so keep it stable. */
class FixtureWriter {
  readonly #store: Engine;
  /** Shared with the scattered-cell picks, which draw from the same stream between sheets. */
  readonly nextUnit = create_unit_random();

  constructor(store: Engine) {
    this.#store = store;
  }

  /** A, B, C, D always; with MAIN_COLUMNS also E (gapped numbers) and F.. (numbers). */
  dataSheet(columns: number): number {
    const store = this.#store;
    const sheet = store.addSheet(columns, ROWS);
    const column_a = this.#random_numbers(ROWS);
    writeNumberColumn(store, sheet, COLUMN_A, 0, column_a, DEFAULT_STYLE);
    this.#write_labels(sheet, COLUMN_B);
    this.#write_mixed(sheet, COLUMN_C);
    this.#write_doubling_formulas(sheet, COLUMN_D);
    if (columns === MAIN_COLUMNS) {
      this.#write_numbers_with_gaps(sheet, COLUMN_E);
      for (let col = COLUMN_E + 1; col < MAIN_COLUMNS; col++) {
        writeNumberColumn(store, sheet, col, 0, this.#random_numbers(ROWS), DEFAULT_STYLE);
      }
    }

    store.recompute(sheet);
    this.#check_doubling(sheet, COLUMN_D, column_a);
    return sheet;
  }

  #random_numbers(length: number): Float64Array {
    return Float64Array.from(
      { length },
      () => Math.round(this.nextUnit() * NUMBER_SCALE * CENTS) / CENTS,
    );
  }

  #write_labels(sheet: number, col: number): void {
    const labels = Array.from(
      { length: ROWS },
      () => `item-${Math.floor(this.nextUnit() * DISTINCT_LABELS)}`,
    );
    writeStringColumn(this.#store, sheet, col, 0, labels, DEFAULT_STYLE);
  }

  /** Column C: number, text, boolean and blank cells in turn. */
  #write_mixed(sheet: number, col: number): void {
    const store = this.#store;
    for (let row = 0; row < ROWS; row++) {
      const kind = row % MIXED_KINDS;
      if (kind === MIXED_NUMBER_KIND) {
        store.setNumber(sheet, row, col, row, DEFAULT_STYLE);
      } else if (kind === MIXED_TEXT_KIND) {
        store.setString(sheet, row, col, `x${row % MIXED_TEXT_VARIANTS}`, DEFAULT_STYLE);
      } else if (kind === MIXED_BOOLEAN_KIND) {
        store.setBool(sheet, row, col, row % TRUE_EVERY_ROWS === TRUE_ROW_REMAINDER, DEFAULT_STYLE);
      }
    }
  }

  /** Column D: `=A{r}*2`, so readers see calculated values. */
  #write_doubling_formulas(sheet: number, col: number): void {
    for (let row = 0; row < ROWS; row++)
      write_formula(this.#store, sheet, row, col, `=A${row + 1}*2`);
  }

  /** Every `=A{r}*2` cell must hold twice A after recompute, or readers would time error cells. */
  #check_doubling(sheet: number, col: number, columnA: Float64Array): void {
    for (let row = 0; row < ROWS; row++) {
      const expected = (columnA[row] ?? Number.NaN) * 2;
      const actual = recomputed_number(this.#store, sheet, row, col);
      if (actual !== expected) {
        throw new Error(`row ${row}: =A${row + 1}*2 computed ${actual}, expected ${expected}`);
      }
    }
  }

  /** Numbers in every row except the EDGE_GAP_ROWS, which stay blank. */
  #write_numbers_with_gaps(sheet: number, col: number): void {
    let start = 0;
    for (const gap of [...EDGE_GAP_ROWS, ROWS]) {
      if (gap > start) {
        writeNumberColumn(
          this.#store,
          sheet,
          col,
          start,
          this.#random_numbers(gap - start),
          DEFAULT_STYLE,
        );
      }
      start = gap + 1;
    }
  }
}

const MAIN_FIXTURE =
  "100k x 8: A num, B 5k labels, C num/text/bool/blank, D =A*2, E num w/ 3 gaps, F-H num";
const COND_FIXTURE = `${MAIN_FIXTURE}; 4 conditional rules (A>${COND_A_THRESHOLD}, B="item-17", C contains "x1", =D1>A1*3)`;
/**
 * One formula rule over every column, so each visible cell evaluates it. The
 * other conditional sheet has one formula rule among four, on one column.
 */
const FORMULA_RULE_FIXTURE = `${MAIN_FIXTURE}; 1 formula rule over A:H (=$A1>${COND_A_THRESHOLD})`;
const RANGE_FIXTURE =
  "100k x 6 (A-D as main); 8 formulas over ~100k-row ranges; edit A/B/C last row + recompute";

/** Formula families for the range readers; each scenario holds RANGE_FORMULAS_PER_SCENARIO of one. */
const RANGE_FORMULAS: readonly { name: string; formula: (index: number) => string }[] = [
  { name: "range SUM(A) dense numbers", formula: (i) => `=SUM(${range_of(COLUMN_A, i)})` },
  { name: "range SUM(D) calculated values", formula: (i) => `=SUM(${range_of(COLUMN_D, i)})` },
  { name: "range AVERAGE(A)", formula: (i) => `=AVERAGE(${range_of(COLUMN_A, i)})` },
  { name: "range COUNTA(C) mixed", formula: (i) => `=COUNTA(${range_of(COLUMN_C, i)})` },
  {
    name: "range MAX(A,D) two ranges",
    formula: (i) => `=MAX(${range_of(COLUMN_A, i)},${range_of(COLUMN_D, i)})`,
  },
  {
    name: "range COUNTIF(B) text",
    formula: (i) => `=COUNTIF(${range_of(COLUMN_B, i)},"item-17")`,
  },
  {
    name: "range SUMIF(A,>500,D)",
    formula: (i) => `=SUMIF(${range_of(COLUMN_A, i)},">500",${range_of(COLUMN_D, i)})`,
  },
  {
    name: "range SUMIFS(A;B,C)",
    formula: (i) =>
      `=SUMIFS(${range_of(COLUMN_A, i)},${range_of(COLUMN_B, i)},"<>item-17",${range_of(COLUMN_C, i)},">0")`,
  },
  {
    name: "range SUMPRODUCT(A,D) array args",
    formula: (i) => `=SUMPRODUCT(${range_of(COLUMN_A, i)},${range_of(COLUMN_D, i)})`,
  },
  {
    name: "range MATCH(B) miss, full scan",
    formula: (i) => `=IFERROR(MATCH("absent",${range_of(COLUMN_B, i)},0),0)`,
  },
];

/**
 * A sheet whose recompute re-runs RANGE_FORMULAS_PER_SCENARIO formulas of one
 * family, each over a ~100k-row column range. Every iteration edits the last
 * row of A, B and C (D follows A), which every range contains, then recalculates.
 */
function range_scenario(
  store: Engine,
  fixtures: FixtureWriter,
  formula_for: (index: number) => string,
): ReaderCase["run"] {
  const sheet = fixtures.dataSheet(RANGE_COLUMNS);
  for (let index = 0; index < RANGE_FORMULAS_PER_SCENARIO; index++) {
    write_formula(store, sheet, index, RANGE_RESULT_COLUMN, formula_for(index));
  }

  store.recompute(sheet);
  for (let row = 0; row < RANGE_FORMULAS_PER_SCENARIO; row++) {
    recomputed_number(store, sheet, row, RANGE_RESULT_COLUMN);
  }

  const last_row = ROWS - 1;
  return (iteration, sink) => {
    store.setNumber(sheet, last_row, COLUMN_A, iteration % NUMBER_SCALE, DEFAULT_STYLE);
    store.setString(
      sheet,
      last_row,
      COLUMN_B,
      `item-${iteration % EDIT_LABEL_VARIANTS}`,
      DEFAULT_STYLE,
    );
    store.setNumber(sheet, last_row, COLUMN_C, iteration % MIXED_TEXT_VARIANTS, DEFAULT_STYLE);
    store.recompute(sheet);
    for (let row = 0; row < RANGE_FORMULAS_PER_SCENARIO; row++) {
      consume_cell(store, sheet, row, RANGE_RESULT_COLUMN, sink);
    }
  };
}

/** Build every fixture, untimed, and return the readers over them in READER_CASE_NAMES order. */
function build_reader_cases(store: Engine): ReaderCase[] {
  const fixtures = new FixtureWriter(store);
  const main_sheet = fixtures.dataSheet(MAIN_COLUMNS);
  const all_columns = Uint32Array.from({ length: MAIN_COLUMNS }, (_, col) => col);
  const sort_a = Uint32Array.of(COLUMN_A);
  const sort_b = Uint32Array.of(COLUMN_B);
  const sort_d = Uint32Array.of(COLUMN_D);
  const ascending = Uint8Array.of(SORT_ASCENDING);
  const descending = Uint8Array.of(SORT_DESCENDING);
  const all_rows = new Uint32Array(0);
  const ascending_by_a = store.sortRowsMulti(main_sheet, sort_a, ascending, all_rows);
  const sorted_viewport_rows = ascending_by_a.slice(0, VIEWPORT_ROWS);
  const sorted_large_rows = ascending_by_a.slice(0, LARGE_WINDOW_ROWS);
  const scattered_rows = Uint32Array.from({ length: SCATTERED_CELLS }, () =>
    Math.floor(fixtures.nextUnit() * ROWS),
  );
  const scattered_cols = Uint32Array.from({ length: SCATTERED_CELLS }, () =>
    Math.floor(fixtures.nextUnit() * MAIN_COLUMNS),
  );
  const even_rows = Uint32Array.from({ length: ROWS / 2 }, (_, index) => index * 2);

  const conditional_sheet = fixtures.dataSheet(MAIN_COLUMNS);
  const last_row = ROWS - 1;
  store.setConditionalRules(
    conditional_sheet,
    Uint8Array.of(COND_GREATER, COND_TEXT_EQUAL, COND_CONTAINS, COND_FORMULA),
    // (firstRow, col, lastRow, col) per rule: each rule covers one whole column A..D.
    Uint32Array.of(
      0,
      COLUMN_A,
      last_row,
      COLUMN_A,
      0,
      COLUMN_B,
      last_row,
      COLUMN_B,
      0,
      COLUMN_C,
      last_row,
      COLUMN_C,
      0,
      COLUMN_D,
      last_row,
      COLUMN_D,
    ),
    Float64Array.of(COND_A_THRESHOLD, 0, 0, 0),
    ["", "item-17", "x1", "=D1>A1*3"],
    Uint8Array.of(0, 0, 0, 0),
  );

  const formula_rule_sheet = fixtures.dataSheet(MAIN_COLUMNS);
  store.setConditionalRules(
    formula_rule_sheet,
    Uint8Array.of(COND_FORMULA),
    Uint32Array.of(0, COLUMN_A, last_row, MAIN_COLUMNS - 1),
    Float64Array.of(0),
    [`=$A1>${COND_A_THRESHOLD}`],
    Uint8Array.of(0),
  );

  // Range scenarios build their sheets last, after the main and conditional sheets.
  const range_cases = RANGE_FORMULAS.map(({ name, formula }): ReaderCase => ({
    name,
    group: "range",
    fixture: RANGE_FIXTURE,
    run: range_scenario(store, fixtures, formula),
  }));

  // A > 100 (most rows pass) AND B contains "item-1" AND C in {x1, x2, TRUE, 0, 4, 8}.
  const filter_multi = {
    cols: Uint32Array.of(COLUMN_A, COLUMN_B, COLUMN_C),
    kinds: Uint8Array.of(FILTER_NUMBER_COMPARE, FILTER_CONTAINS, FILTER_VALUE_SET),
    flags: Uint8Array.of(COMPARE_GREATER, 0, 0),
    nums: Float64Array.of(FILTER_A_THRESHOLD, 0, 0),
    numCounts: Uint32Array.of(0, 0, 3),
    textCounts: Uint32Array.of(0, 1, 3),
    valueNums: Float64Array.of(0, 4, 8),
    valueTexts: ["item-1", "x1", "x2", "TRUE"],
  };

  const reader =
    (group: ReaderGroup, fixture: string) =>
    (name: string, run: ReaderCase["run"]): ReaderCase => ({
      name,
      group,
      fixture,
      run,
    });
  const window_reader = reader("window", MAIN_FIXTURE);
  const conditional_window_reader = reader("window", COND_FIXTURE);
  const formula_rule_window_reader = reader("window", FORMULA_RULE_FIXTURE);
  const query_reader = reader("query", MAIN_FIXTURE);
  const cells_reader = reader("cells", MAIN_FIXTURE);
  const window_of = (sheet: number, iteration: number, rows: number, sink: ResultSink): void =>
    consume_window(
      store.getWindow(
        sheet,
        row_start_for(iteration),
        row_start_for(iteration) + rows,
        all_columns,
      ),
      sink,
    );

  const window_cases = [
    window_reader("getWindow 40x8", (i, sink) => window_of(main_sheet, i, VIEWPORT_ROWS, sink)),
    window_reader("getWindow 1000x8", (i, sink) =>
      window_of(main_sheet, i, LARGE_WINDOW_ROWS, sink),
    ),
    conditional_window_reader("getWindow 40x8 cond rules", (i, sink) =>
      window_of(conditional_sheet, i, VIEWPORT_ROWS, sink),
    ),
    conditional_window_reader("getWindow 1000x8 cond rules", (i, sink) =>
      window_of(conditional_sheet, i, LARGE_WINDOW_ROWS, sink),
    ),
    formula_rule_window_reader("getWindow 1000x8 formula rule", (i, sink) =>
      window_of(formula_rule_sheet, i, LARGE_WINDOW_ROWS, sink),
    ),
    window_reader("getWindowRows 40x8 sorted", (_, sink) =>
      consume_window(store.getWindowRows(main_sheet, sorted_viewport_rows, all_columns), sink),
    ),
    window_reader("getWindowRows 1000x8 sorted", (_, sink) =>
      consume_window(store.getWindowRows(main_sheet, sorted_large_rows, all_columns), sink),
    ),
  ];

  const query_cases = [
    query_reader("aggregate SUM A", (_, sink) =>
      sink.number(store.aggregate(main_sheet, COLUMN_A, AGGREGATE_SUM)),
    ),
    query_reader("aggregate AVG D (formulas)", (_, sink) =>
      sink.number(store.aggregate(main_sheet, COLUMN_D, AGGREGATE_AVERAGE)),
    ),
    query_reader("aggregate COUNT C (mixed)", (_, sink) =>
      sink.number(store.aggregate(main_sheet, COLUMN_C, AGGREGATE_COUNT)),
    ),
    query_reader("sortRowsMulti A numeric", (_, sink) =>
      sink.integers(store.sortRowsMulti(main_sheet, sort_a, ascending, all_rows)),
    ),
    query_reader("sortRowsMulti B text", (_, sink) =>
      sink.integers(store.sortRowsMulti(main_sheet, sort_b, ascending, all_rows)),
    ),
    query_reader("sortRowsMulti D formulas", (_, sink) =>
      sink.integers(store.sortRowsMulti(main_sheet, sort_d, descending, all_rows)),
    ),
    query_reader("sortRowsMulti B,A all rows", (_, sink) =>
      sink.integers(
        store.sortRowsMulti(
          main_sheet,
          Uint32Array.of(COLUMN_B, COLUMN_A),
          Uint8Array.of(SORT_ASCENDING, SORT_DESCENDING),
          all_rows,
        ),
      ),
    ),
    query_reader("sortRowsMulti C,D 50k candidates", (_, sink) =>
      sink.integers(
        store.sortRowsMulti(
          main_sheet,
          Uint32Array.of(COLUMN_C, COLUMN_D),
          Uint8Array.of(SORT_ASCENDING, SORT_ASCENDING),
          even_rows,
        ),
      ),
    ),
    query_reader("filterRows B contains", (_, sink) =>
      sink.integers(store.filterRows(main_sheet, COLUMN_B, FILTER_LABEL_NEEDLE)),
    ),
    query_reader("filterRows C mixed", (_, sink) =>
      sink.integers(store.filterRows(main_sheet, COLUMN_C, FILTER_MIXED_NEEDLE)),
    ),
    query_reader("filterRowsMulti A>100,B~item-1,C set", (_, sink) =>
      sink.integers(
        store.filterRowsMulti(
          main_sheet,
          filter_multi.cols,
          filter_multi.kinds,
          filter_multi.flags,
          filter_multi.nums,
          filter_multi.numCounts,
          filter_multi.textCounts,
          filter_multi.valueNums,
          filter_multi.valueTexts,
        ),
      ),
    ),
    query_reader("search B,C,D substring", (_, sink) =>
      sink.integers(
        store.search(
          main_sheet,
          Uint32Array.of(COLUMN_B, COLUMN_C, COLUMN_D),
          SEARCH_SUBSTRING,
          true,
          false,
        ),
      ),
    ),
    query_reader("search all cols whole-cell", (_, sink) =>
      sink.integers(store.search(main_sheet, all_columns, SEARCH_WHOLE_CELL, true, true)),
    ),
    query_reader("distinctValues B text", (_, sink) =>
      consume_distinct(store.distinctValues(main_sheet, COLUMN_B, DISTINCT_LIMIT), sink),
    ),
    query_reader("distinctValues D formulas", (_, sink) =>
      consume_distinct(store.distinctValues(main_sheet, COLUMN_D, DISTINCT_LIMIT), sink),
    ),
    query_reader("dataEdge E down to gap", (i, sink) =>
      sink.number(
        store.dataEdge(main_sheet, row_start_for(i) % FIRST_EDGE_GAP_ROW, COLUMN_E, 1, 0),
      ),
    ),
    query_reader("dataEdge row right", (i, sink) =>
      sink.number(store.dataEdge(main_sheet, row_start_for(i), 0, 0, 1)),
    ),
    query_reader("dataEdgeOrdered E by A order", (i, sink) =>
      sink.number(
        store.dataEdgeOrdered(
          main_sheet,
          ascending_by_a,
          row_start_for(i) % FIRST_EDGE_GAP_ROW,
          COLUMN_E,
          1,
          0,
        ),
      ),
    ),
  ];

  const cell_cases = [
    cells_reader("getCell 4096 scattered", (_, sink) => {
      for (let index = 0; index < SCATTERED_CELLS; index++) {
        consume_cell(
          store,
          main_sheet,
          scattered_rows[index] ?? 0,
          scattered_cols[index] ?? 0,
          sink,
        );
      }
    }),
    cells_reader("cellSnapshots 4096 scattered", (_, sink) => {
      const snapshot = store.cellSnapshots(main_sheet, scattered_rows, scattered_cols);
      if (snapshot === undefined) throw new Error("cellSnapshots returned nothing");
      sink.integers(snapshot.kinds);
      sink.numbers(snapshot.numbers);
      sink.texts(snapshot.strings);
      snapshot.free();
    }),
    cells_reader("captureRange 1000x8 + numbers", (i, sink) => {
      const snapshot = store.captureRange(
        main_sheet,
        row_start_for(i),
        0,
        CAPTURE_ROWS,
        MAIN_COLUMNS,
      );
      if (snapshot === undefined) throw new Error("captureRange returned nothing");
      sink.number(snapshot.byteLength());
      sink.integers(snapshot.kinds());
      sink.numbers(store.snapshotNumbers(snapshot));
      snapshot.free();
    }),
    cells_reader("persistedCellData whole sheet", (_, sink) =>
      sink.numbers(store.persistedCellData(main_sheet)),
    ),
    cells_reader("rangeStyleIds whole sheet", (_, sink) =>
      sink.integers(store.rangeStyleIds(main_sheet, 0, 0, last_row, MAIN_COLUMNS - 1)),
    ),
  ];

  const cases = [...window_cases, ...query_cases, ...cell_cases, ...range_cases];
  validateExactMatrix(
    "reader bench cases",
    READER_CASE_NAMES,
    cases.map((reader_case) => reader_case.name),
  );
  return cases;
}

function time_loop(reader: ReaderCase, iterations: number): number {
  const started = now();
  for (let iteration = 0; iteration < iterations; iteration++) reader.run(iteration, DISCARD);
  return now() - started;
}

/** Hash the first iterations' full results. Untimed, so hashing cost never dilutes a ratio. */
function digest_of(reader: ReaderCase, iterations: number): number {
  const hash = new ContentHash();
  for (let iteration = 0; iteration < Math.min(iterations, DIGEST_ITERATIONS); iteration++) {
    reader.run(iteration, hash);
  }
  return hash.digest();
}

function calibrate(reader: ReaderCase): number {
  // Warm the reader so JIT tier-up does not inflate the first sizing loop.
  time_loop(reader, 1);
  let iterations = 1;
  for (;;) {
    const elapsed_ms = time_loop(reader, iterations);
    if (elapsed_ms >= TARGET_SAMPLE_MS) return iterations;
    const scaled = Math.ceil(
      (iterations * TARGET_SAMPLE_MS * CALIBRATION_HEADROOM) /
        Math.max(elapsed_ms, MIN_MEASURABLE_MS),
    );
    iterations = Math.max(iterations * 2, Math.min(scaled, iterations * MAX_CALIBRATION_GROWTH));
  }
}

function measure(reader: ReaderCase, iterations: number): ReaderRunResult {
  for (let warmup = 0; warmup < WARMUP_SAMPLES; warmup++) time_loop(reader, iterations);
  const sample_ms = Array.from({ length: SAMPLES }, () => time_loop(reader, iterations));
  return {
    name: reader.name,
    group: reader.group,
    fixture: reader.fixture,
    iterations,
    sampleMs: sample_ms,
    medianSampleMs: summarize(sample_ms).median,
    digest: digest_of(reader, iterations),
  };
}

function read_iterations(path: string): Record<string, number> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} must map reader names to iteration counts`);
  }
  const iterations: Record<string, number> = {};
  for (const [name, count] of Object.entries(parsed)) {
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) {
      throw new Error(`${path}: ${name} needs a positive integer iteration count`);
    }
    iterations[name] = count;
  }
  return iterations;
}

async function load_engine(checkout: string): Promise<Engine> {
  const pkg_dir = resolve(checkout, WASM_PACKAGE);
  // Dynamic import: the engine package is chosen per process from argv (base or candidate).
  const engine_module = (await import(resolve(pkg_dir, "sheetwrite_wasm.js"))) as EngineModule;
  engine_module.initSync({ module: readFileSync(resolve(pkg_dir, "sheetwrite_wasm_bg.wasm")) });
  return new engine_module.CellStore();
}

if (import.meta.main) {
  const [checkout, mode, iterations_path] = process.argv.slice(2);
  const usage = "usage: bun reader-bench.ts <checkout> <calibrate | run <iterations.json>>";
  if (checkout === undefined || (mode !== "calibrate" && mode !== "run")) throw new Error(usage);
  if ((mode === "run") !== (iterations_path !== undefined)) throw new Error(usage);
  const iterations = iterations_path === undefined ? undefined : read_iterations(iterations_path);
  const store = await load_engine(resolve(checkout));
  const selected = new Set(selectedReaderCaseNames());
  const cases = build_reader_cases(store).filter((reader_case) => selected.has(reader_case.name));
  if (iterations === undefined) {
    const calibrated: Record<string, number> = {};
    for (const reader_case of cases) calibrated[reader_case.name] = calibrate(reader_case);
    process.stdout.write(`${JSON.stringify(calibrated)}\n`);
  } else {
    const results = cases.map((reader_case) => {
      const loop_count = iterations[reader_case.name];
      if (loop_count === undefined)
        throw new Error(`no calibrated iterations for ${reader_case.name}`);
      return measure(reader_case, loop_count);
    });
    process.stdout.write(`${JSON.stringify({ results })}\n`);
  }
  store.free();
}

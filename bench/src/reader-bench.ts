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
 * `calibrate` sizes each reader's loop so one sample takes at least
 * TARGET_SAMPLE_MS on the engine it runs on; `run` reuses fixed loop counts so
 * both engines do identical work per sample. The harness always comes from
 * this checkout; `<checkout>` only supplies the built `packages/wasm/pkg`, so an
 * older base without this file can still be measured. The optional
 * `READER_CASES` regex narrows a run to the readers being attributed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateExactMatrix } from "./gate-protocol.js";
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
const COLUMN_A = 0;
const COLUMN_B = 1;
const COLUMN_C = 2;
const COLUMN_D = 3;
const COLUMN_E = 4;
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
/** Calibration overshoots the target so candidate-side speedups still leave ≥ 50 ms samples. */
const CALIBRATION_HEADROOM = 1.25;
const MIN_MEASURABLE_MS = 0.01;
const MAX_CALIBRATION_GROWTH = 100;
const DEFAULT_STYLE = 0;
const WASM_PACKAGE = "packages/wasm/pkg";

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
  /** Sum of the reader's return values over one sample; both engines must agree. */
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
/** The `CellStore` surface the readers use; present in 0.5.x and later engines. */
interface Engine {
  addSheet(nCols: number, rowCount: number): number;
  setNumber(sheet: number, row: number, col: number, value: number, style: number): void;
  setString(sheet: number, row: number, col: number, value: string, style: number): void;
  setBool(sheet: number, row: number, col: number, value: boolean, style: number): void;
  setFormula(sheet: number, row: number, col: number, src: string, style: number): number;
  setColumnNumbers(
    sheet: number,
    col: number,
    startRow: number,
    values: Float64Array,
    style: number,
  ): void;
  setColumnStringsPacked(
    sheet: number,
    col: number,
    startRow: number,
    buf: string,
    utf16Lens: Uint32Array,
    style: number,
  ): void;
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

/** One measured reader: `run` does one call and returns a number folded into the digest. */
interface ReaderCase {
  name: string;
  group: ReaderGroup;
  fixture: string;
  run(iteration: number): number;
}

/** Deterministic LCG: both engines must see byte-identical fixtures. */
function createUnitRandom(): () => number {
  let state = LCG_SEED;
  return () => {
    state = (Math.imul(state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    return state / UINT32_RANGE;
  };
}

function sumOf(values: ArrayLike<number>): number {
  let total = 0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index] ?? 0;
    if (Number.isFinite(value)) total += value;
  }
  return total;
}

function consumeWindow(view: WindowViewHandle): number {
  const packed = view.takePacked();
  const strings = view.takeStrings();
  view.free();
  return packed.length + strings.length;
}

function consumeDistinct(column: DistinctColumnHandle): number {
  const kinds = column.takeKinds();
  const numbers = column.takeNumbers();
  const texts = column.takeTexts();
  column.free();
  return kinds.length + sumOf(numbers) + texts.length;
}

function rowStartFor(iteration: number): number {
  return (iteration * ROW_START_STRIDE) % (ROWS - LARGE_WINDOW_ROWS);
}

/** `X{index+1}:X100000`, so the formulas of one family are distinct but each spans ~100k rows. */
function rangeOf(col: number, index: number): string {
  const letter = String.fromCharCode("A".charCodeAt(0) + col);
  return `${letter}${index + 1}:${letter}${ROWS}`;
}

/** Writes the fixture sheets. Call order fixes the random stream, so keep it stable. */
class FixtureWriter {
  readonly #store: Engine;
  /** Shared with the scattered-cell picks, which draw from the same stream between sheets. */
  readonly nextUnit = createUnitRandom();

  constructor(store: Engine) {
    this.#store = store;
  }

  /** A, B, C, D always; with MAIN_COLUMNS also E (gapped numbers) and F.. (numbers). */
  dataSheet(columns: number): number {
    const store = this.#store;
    const sheet = store.addSheet(columns, ROWS);
    store.setColumnNumbers(sheet, COLUMN_A, 0, this.#randomNumbers(ROWS), DEFAULT_STYLE);
    this.#writeLabels(sheet, COLUMN_B);
    this.#writeMixed(sheet, COLUMN_C);
    this.#writeDoublingFormulas(sheet, COLUMN_D);
    if (columns === MAIN_COLUMNS) {
      this.#writeNumbersWithGaps(sheet, COLUMN_E);
      for (let col = COLUMN_E + 1; col < MAIN_COLUMNS; col++) {
        store.setColumnNumbers(sheet, col, 0, this.#randomNumbers(ROWS), DEFAULT_STYLE);
      }
    }
    store.recompute(sheet);
    return sheet;
  }

  #randomNumbers(length: number): Float64Array {
    return Float64Array.from(
      { length },
      () => Math.round(this.nextUnit() * NUMBER_SCALE * CENTS) / CENTS,
    );
  }

  #writeLabels(sheet: number, col: number): void {
    const labels = Array.from(
      { length: ROWS },
      () => `item-${Math.floor(this.nextUnit() * DISTINCT_LABELS)}`,
    );
    const lengths = Uint32Array.from(labels, (label) => label.length);
    this.#store.setColumnStringsPacked(sheet, col, 0, labels.join(""), lengths, DEFAULT_STYLE);
  }

  /** Column C: number, text, boolean and blank cells in turn. */
  #writeMixed(sheet: number, col: number): void {
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
  #writeDoublingFormulas(sheet: number, col: number): void {
    for (let row = 0; row < ROWS; row++) {
      const source = `=A${row + 1}*2`;
      if (this.#store.setFormula(sheet, row, col, source, DEFAULT_STYLE) < 0) {
        throw new Error(`setFormula rejected ${source}`);
      }
    }
  }

  /** Numbers in every row except the EDGE_GAP_ROWS, which stay blank. */
  #writeNumbersWithGaps(sheet: number, col: number): void {
    let start = 0;
    for (const gap of [...EDGE_GAP_ROWS, ROWS]) {
      if (gap > start) {
        this.#store.setColumnNumbers(
          sheet,
          col,
          start,
          this.#randomNumbers(gap - start),
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
const RANGE_FIXTURE =
  "100k x 6 (A-D as main); 8 formulas over ~100k-row ranges; edit A/B/C last row + recompute";

/** Formula families for the range readers; each scenario holds RANGE_FORMULAS_PER_SCENARIO of one. */
const RANGE_FORMULAS: readonly { name: string; formula: (index: number) => string }[] = [
  { name: "range SUM(A) dense numbers", formula: (i) => `=SUM(${rangeOf(COLUMN_A, i)})` },
  { name: "range SUM(D) calculated values", formula: (i) => `=SUM(${rangeOf(COLUMN_D, i)})` },
  { name: "range AVERAGE(A)", formula: (i) => `=AVERAGE(${rangeOf(COLUMN_A, i)})` },
  { name: "range COUNTA(C) mixed", formula: (i) => `=COUNTA(${rangeOf(COLUMN_C, i)})` },
  {
    name: "range MAX(A,D) two ranges",
    formula: (i) => `=MAX(${rangeOf(COLUMN_A, i)},${rangeOf(COLUMN_D, i)})`,
  },
  {
    name: "range COUNTIF(B) text",
    formula: (i) => `=COUNTIF(${rangeOf(COLUMN_B, i)},"item-17")`,
  },
  {
    name: "range SUMIF(A,>500,D)",
    formula: (i) => `=SUMIF(${rangeOf(COLUMN_A, i)},">500",${rangeOf(COLUMN_D, i)})`,
  },
  {
    name: "range SUMIFS(A;B,C)",
    formula: (i) =>
      `=SUMIFS(${rangeOf(COLUMN_A, i)},${rangeOf(COLUMN_B, i)},"<>item-17",${rangeOf(COLUMN_C, i)},">0")`,
  },
  {
    name: "range SUMPRODUCT(A,D) array args",
    formula: (i) => `=SUMPRODUCT(${rangeOf(COLUMN_A, i)},${rangeOf(COLUMN_D, i)})`,
  },
  {
    name: "range MATCH(B) miss, full scan",
    formula: (i) => `=IFERROR(MATCH("absent",${rangeOf(COLUMN_B, i)},0),0)`,
  },
];

/**
 * A sheet whose recompute re-runs RANGE_FORMULAS_PER_SCENARIO formulas of one
 * family, each over a ~100k-row column range. Every iteration edits the last
 * row of A, B and C (D follows A), which every range contains, then recalculates.
 */
function rangeScenario(
  store: Engine,
  fixtures: FixtureWriter,
  formulaFor: (index: number) => string,
): (iteration: number) => number {
  const sheet = fixtures.dataSheet(RANGE_COLUMNS);
  for (let index = 0; index < RANGE_FORMULAS_PER_SCENARIO; index++) {
    const source = formulaFor(index);
    if (store.setFormula(sheet, index, RANGE_RESULT_COLUMN, source, DEFAULT_STYLE) < 0) {
      throw new Error(`setFormula rejected ${source}`);
    }
  }
  store.recompute(sheet);
  const lastRow = ROWS - 1;
  return (iteration) => {
    store.setNumber(sheet, lastRow, COLUMN_A, iteration % NUMBER_SCALE, DEFAULT_STYLE);
    store.setString(
      sheet,
      lastRow,
      COLUMN_B,
      `item-${iteration % EDIT_LABEL_VARIANTS}`,
      DEFAULT_STYLE,
    );
    store.setNumber(sheet, lastRow, COLUMN_C, iteration % MIXED_TEXT_VARIANTS, DEFAULT_STYLE);
    store.recompute(sheet);
    let total = 0;
    for (let row = 0; row < RANGE_FORMULAS_PER_SCENARIO; row++) {
      const cell = store.getCell(sheet, row, RANGE_RESULT_COLUMN);
      if (Number.isFinite(cell.num)) total += cell.num;
      cell.free();
    }
    return total;
  };
}

/** Build every fixture, untimed, and return the readers over them in READER_CASE_NAMES order. */
function buildReaderCases(store: Engine): ReaderCase[] {
  const fixtures = new FixtureWriter(store);
  const mainSheet = fixtures.dataSheet(MAIN_COLUMNS);
  const allColumns = Uint32Array.from({ length: MAIN_COLUMNS }, (_, col) => col);
  const sortA = Uint32Array.of(COLUMN_A);
  const sortB = Uint32Array.of(COLUMN_B);
  const sortD = Uint32Array.of(COLUMN_D);
  const ascending = Uint8Array.of(SORT_ASCENDING);
  const descending = Uint8Array.of(SORT_DESCENDING);
  const allRows = new Uint32Array(0);
  const ascendingByA = store.sortRowsMulti(mainSheet, sortA, ascending, allRows);
  const sortedViewportRows = ascendingByA.slice(0, VIEWPORT_ROWS);
  const sortedLargeRows = ascendingByA.slice(0, LARGE_WINDOW_ROWS);
  const scatteredRows = Uint32Array.from({ length: SCATTERED_CELLS }, () =>
    Math.floor(fixtures.nextUnit() * ROWS),
  );
  const scatteredCols = Uint32Array.from({ length: SCATTERED_CELLS }, () =>
    Math.floor(fixtures.nextUnit() * MAIN_COLUMNS),
  );
  const evenRows = Uint32Array.from({ length: ROWS / 2 }, (_, index) => index * 2);

  const conditionalSheet = fixtures.dataSheet(MAIN_COLUMNS);
  const lastRow = ROWS - 1;
  store.setConditionalRules(
    conditionalSheet,
    Uint8Array.of(COND_GREATER, COND_TEXT_EQUAL, COND_CONTAINS, COND_FORMULA),
    // (firstRow, col, lastRow, col) per rule: each rule covers one whole column A..D.
    Uint32Array.of(
      0,
      COLUMN_A,
      lastRow,
      COLUMN_A,
      0,
      COLUMN_B,
      lastRow,
      COLUMN_B,
      0,
      COLUMN_C,
      lastRow,
      COLUMN_C,
      0,
      COLUMN_D,
      lastRow,
      COLUMN_D,
    ),
    Float64Array.of(COND_A_THRESHOLD, 0, 0, 0),
    ["", "item-17", "x1", "=D1>A1*3"],
    Uint8Array.of(0, 0, 0, 0),
  );

  // Range scenarios build their sheets last, after the main and conditional sheets.
  const rangeCases = RANGE_FORMULAS.map(({ name, formula }): ReaderCase => ({
    name,
    group: "range",
    fixture: RANGE_FIXTURE,
    run: rangeScenario(store, fixtures, formula),
  }));

  // A > 100 (most rows pass) AND B contains "item-1" AND C in {x1, x2, TRUE, 0, 4, 8}.
  const filterMulti = {
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
    (name: string, run: (iteration: number) => number): ReaderCase => ({
      name,
      group,
      fixture,
      run,
    });
  const windowReader = reader("window", MAIN_FIXTURE);
  const conditionalWindowReader = reader("window", COND_FIXTURE);
  const queryReader = reader("query", MAIN_FIXTURE);
  const cellsReader = reader("cells", MAIN_FIXTURE);
  const windowOf = (sheet: number, iteration: number, rows: number): number =>
    consumeWindow(
      store.getWindow(sheet, rowStartFor(iteration), rowStartFor(iteration) + rows, allColumns),
    );

  const windowCases = [
    windowReader("getWindow 40x8", (i) => windowOf(mainSheet, i, VIEWPORT_ROWS)),
    windowReader("getWindow 1000x8", (i) => windowOf(mainSheet, i, LARGE_WINDOW_ROWS)),
    conditionalWindowReader("getWindow 40x8 cond rules", (i) =>
      windowOf(conditionalSheet, i, VIEWPORT_ROWS),
    ),
    conditionalWindowReader("getWindow 1000x8 cond rules", (i) =>
      windowOf(conditionalSheet, i, LARGE_WINDOW_ROWS),
    ),
    windowReader("getWindowRows 40x8 sorted", () =>
      consumeWindow(store.getWindowRows(mainSheet, sortedViewportRows, allColumns)),
    ),
    windowReader("getWindowRows 1000x8 sorted", () =>
      consumeWindow(store.getWindowRows(mainSheet, sortedLargeRows, allColumns)),
    ),
  ];

  const queryCases = [
    queryReader("aggregate SUM A", () => store.aggregate(mainSheet, COLUMN_A, AGGREGATE_SUM)),
    queryReader("aggregate AVG D (formulas)", () =>
      store.aggregate(mainSheet, COLUMN_D, AGGREGATE_AVERAGE),
    ),
    queryReader("aggregate COUNT C (mixed)", () =>
      store.aggregate(mainSheet, COLUMN_C, AGGREGATE_COUNT),
    ),
    queryReader(
      "sortRowsMulti A numeric",
      () => store.sortRowsMulti(mainSheet, sortA, ascending, allRows)[0] ?? 0,
    ),
    queryReader(
      "sortRowsMulti B text",
      () => store.sortRowsMulti(mainSheet, sortB, ascending, allRows)[0] ?? 0,
    ),
    queryReader(
      "sortRowsMulti D formulas",
      () => store.sortRowsMulti(mainSheet, sortD, descending, allRows)[0] ?? 0,
    ),
    queryReader(
      "sortRowsMulti B,A all rows",
      () =>
        store.sortRowsMulti(
          mainSheet,
          Uint32Array.of(COLUMN_B, COLUMN_A),
          Uint8Array.of(SORT_ASCENDING, SORT_DESCENDING),
          allRows,
        )[0] ?? 0,
    ),
    queryReader(
      "sortRowsMulti C,D 50k candidates",
      () =>
        store.sortRowsMulti(
          mainSheet,
          Uint32Array.of(COLUMN_C, COLUMN_D),
          Uint8Array.of(SORT_ASCENDING, SORT_ASCENDING),
          evenRows,
        )[0] ?? 0,
    ),
    queryReader(
      "filterRows B contains",
      () => store.filterRows(mainSheet, COLUMN_B, "item-12").length,
    ),
    queryReader("filterRows C mixed", () => store.filterRows(mainSheet, COLUMN_C, "x1").length),
    queryReader(
      "filterRowsMulti A>100,B~item-1,C set",
      () =>
        store.filterRowsMulti(
          mainSheet,
          filterMulti.cols,
          filterMulti.kinds,
          filterMulti.flags,
          filterMulti.nums,
          filterMulti.numCounts,
          filterMulti.textCounts,
          filterMulti.valueNums,
          filterMulti.valueTexts,
        ).length,
    ),
    queryReader(
      "search B,C,D substring",
      () =>
        store.search(
          mainSheet,
          Uint32Array.of(COLUMN_B, COLUMN_C, COLUMN_D),
          "item-123",
          true,
          false,
        ).length,
    ),
    queryReader(
      "search all cols whole-cell",
      () => store.search(mainSheet, allColumns, "x7", true, true).length,
    ),
    queryReader("distinctValues B text", () =>
      consumeDistinct(store.distinctValues(mainSheet, COLUMN_B, DISTINCT_LIMIT)),
    ),
    queryReader("distinctValues D formulas", () =>
      consumeDistinct(store.distinctValues(mainSheet, COLUMN_D, DISTINCT_LIMIT)),
    ),
    queryReader("dataEdge E down to gap", (i) =>
      store.dataEdge(mainSheet, rowStartFor(i) % FIRST_EDGE_GAP_ROW, COLUMN_E, 1, 0),
    ),
    queryReader("dataEdge row right", (i) => store.dataEdge(mainSheet, rowStartFor(i), 0, 0, 1)),
    queryReader("dataEdgeOrdered E by A order", (i) =>
      store.dataEdgeOrdered(
        mainSheet,
        ascendingByA,
        rowStartFor(i) % FIRST_EDGE_GAP_ROW,
        COLUMN_E,
        1,
        0,
      ),
    ),
  ];

  const cellCases = [
    cellsReader("getCell 4096 scattered", () => {
      let total = 0;
      for (let index = 0; index < SCATTERED_CELLS; index++) {
        const cell = store.getCell(mainSheet, scatteredRows[index] ?? 0, scatteredCols[index] ?? 0);
        total += cell.kind;
        cell.free();
      }
      return total;
    }),
    cellsReader("cellSnapshots 4096 scattered", () => {
      const snapshot = store.cellSnapshots(mainSheet, scatteredRows, scatteredCols);
      if (snapshot === undefined) throw new Error("cellSnapshots returned nothing");
      const total = snapshot.kinds.length + sumOf(snapshot.numbers) + snapshot.strings.length;
      snapshot.free();
      return total;
    }),
    cellsReader("captureRange 1000x8 + numbers", (i) => {
      const snapshot = store.captureRange(mainSheet, rowStartFor(i), 0, CAPTURE_ROWS, MAIN_COLUMNS);
      if (snapshot === undefined) throw new Error("captureRange returned nothing");
      const total = snapshot.byteLength() + sumOf(store.snapshotNumbers(snapshot));
      snapshot.free();
      return total;
    }),
    cellsReader("persistedCellData whole sheet", () => store.persistedCellData(mainSheet).length),
    cellsReader(
      "rangeStyleIds whole sheet",
      () => store.rangeStyleIds(mainSheet, 0, 0, lastRow, MAIN_COLUMNS - 1).length,
    ),
  ];

  const cases = [...windowCases, ...queryCases, ...cellCases, ...rangeCases];
  validateExactMatrix(
    "reader bench cases",
    READER_CASE_NAMES,
    cases.map((readerCase) => readerCase.name),
  );
  return cases;
}

function timeLoop(reader: ReaderCase, iterations: number): { elapsedMs: number; digest: number } {
  let digest = 0;
  const started = now();
  for (let iteration = 0; iteration < iterations; iteration++) digest += reader.run(iteration);
  return { elapsedMs: now() - started, digest };
}

function calibrate(reader: ReaderCase): number {
  // Warm the reader so JIT tier-up does not inflate the first sizing loop.
  timeLoop(reader, 1);
  let iterations = 1;
  for (;;) {
    const { elapsedMs } = timeLoop(reader, iterations);
    if (elapsedMs >= TARGET_SAMPLE_MS) return iterations;
    const scaled = Math.ceil(
      (iterations * TARGET_SAMPLE_MS * CALIBRATION_HEADROOM) /
        Math.max(elapsedMs, MIN_MEASURABLE_MS),
    );
    iterations = Math.max(iterations * 2, Math.min(scaled, iterations * MAX_CALIBRATION_GROWTH));
  }
}

function measure(reader: ReaderCase, iterations: number): ReaderRunResult {
  for (let warmup = 0; warmup < WARMUP_SAMPLES; warmup++) timeLoop(reader, iterations);
  const samples = Array.from({ length: SAMPLES }, () => timeLoop(reader, iterations));
  const digest = samples[0]?.digest ?? Number.NaN;
  // A non-finite digest cannot be compared across engines, so it would hide disagreement.
  if (!Number.isFinite(digest)) throw new Error(`${reader.name} produced a non-finite digest`);
  const sampleMs = samples.map((sample) => sample.elapsedMs);
  return {
    name: reader.name,
    group: reader.group,
    fixture: reader.fixture,
    iterations,
    sampleMs,
    medianSampleMs: summarize(sampleMs).median,
    digest,
  };
}

function readIterations(path: string): Record<string, number> {
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

async function loadEngine(checkout: string): Promise<Engine> {
  const pkgDir = resolve(checkout, WASM_PACKAGE);
  // Dynamic import: the engine package is chosen per process from argv (base or candidate).
  const engineModule = (await import(resolve(pkgDir, "sheetwrite_wasm.js"))) as EngineModule;
  engineModule.initSync({ module: readFileSync(resolve(pkgDir, "sheetwrite_wasm_bg.wasm")) });
  return new engineModule.CellStore();
}

if (import.meta.main) {
  const [checkout, mode, iterationsPath] = process.argv.slice(2);
  const usage = "usage: bun reader-bench.ts <checkout> <calibrate | run <iterations.json>>";
  if (checkout === undefined || (mode !== "calibrate" && mode !== "run")) throw new Error(usage);
  if ((mode === "run") !== (iterationsPath !== undefined)) throw new Error(usage);
  const iterations = iterationsPath === undefined ? undefined : readIterations(iterationsPath);
  const store = await loadEngine(resolve(checkout));
  const selected = new Set(selectedReaderCaseNames());
  const cases = buildReaderCases(store).filter((readerCase) => selected.has(readerCase.name));
  if (iterations === undefined) {
    const calibrated: Record<string, number> = {};
    for (const readerCase of cases) calibrated[readerCase.name] = calibrate(readerCase);
    process.stdout.write(`${JSON.stringify(calibrated)}\n`);
  } else {
    const results = cases.map((readerCase) => {
      const loopCount = iterations[readerCase.name];
      if (loopCount === undefined)
        throw new Error(`no calibrated iterations for ${readerCase.name}`);
      return measure(readerCase, loopCount);
    });
    process.stdout.write(`${JSON.stringify({ results })}\n`);
  }
  store.free();
}

import { SheetwriteStore } from "@sheetwrite/core";
import type * as formulas from "@sheetwrite/formulas";

import type { FormulaOutput } from "./formula-artifact.js";
import {
  dependencyClosureFormulas,
  diamondFormulas,
  distinctRangeFormulas,
  type FormulaCell,
  fanOutFormulas,
  independentFormulas,
  linearChain,
  sharedRangeFormulas,
} from "./formula-dataset.js";
import { CellStore, historyKernel } from "./formula-engine.js";
import { writeNumberColumn, writeStringColumn } from "./packed-fixture.js";
import { now, summarize } from "./stats.js";

function diamondOutput(levels: number): number {
  let expected = 2;
  for (let level = 0; level < levels; level++) expected = expected + 1 + (expected + 2);
  return expected;
}

export function expectedFormulaOutput(id: string, size: number): FormulaOutput {
  const lookup = lookupVariantOutput(id);
  if (lookup !== undefined) return lookup;
  switch (id) {
    case "independent-parse-load":
    case "independent-first-recompute":
    case "linear-chain":
      return size;
    case "wide-fan-out-edit":
    case "scalar-edit-affects-1":
    case "scalar-edit-affects-1000":
    case "scalar-edit-affects-100000":
      return size + 10;
    case "scalar-edit-affects-0":
      return size + 1;
    case "formula-constant-edit":
      return `${CONSTANT_EDIT_FILL + CONSTANT_EDIT_EDITED_BASE}:${size + CONSTANT_EDIT_FILL}`;
    case "diamond-edit":
      return diamondOutput(size);
    case "shared-range-edit":
      return 101;
    case "distinct-range-edit":
      return "11:10";
    case "cross-sheet-range-edit":
      return size + 100;
    case "topology-remove-add":
      return `2:${size}`;
    case "cycles":
      return "#CYCLE!";
    case "removed-sheet-ref":
      return "#REF!";
    case "error-propagation":
      return "#DIV/0!";
    case "criteria-range-edit":
      return size - Math.floor(size / 2) + 1;
    case "xlookup-mixed-exact":
      return mixedLookupOutput(size);
    case "lookup-range-edit":
      return (size - 1) * 2;
    case "spill-filter-resize":
      return `${size - 1}:0`;
    case "sumproduct-vector-edit":
      return size * 11 + 4;
    case "sumproduct-matrix-edit":
      return size * 2 + 4;
    case "criteria-multi-range-edit":
      return size * 0.75 - 1;
    case "sum-multi-range":
      // Compared as text: the relative tolerance would hide a small error in a 5-billion total.
      return `${(size * (size - 1)) / 2 + size * SUM_MULTI_RANGE_FILL}`;
    case "sumifs-3-criteria":
      return sumifsCriteriaTotal(size);
    case "countif-100k":
      return size - Math.floor(size / COUNTIF_MATCH_SHARE);
    case "unicode-text-date-edit":
      return 173_864;
    case "percentile-covariance":
      return (size * size - 1) / 6 + size * 0.9 + 0.1;
    case "let-reuse-edit":
      return 3 * (size + 1);
    case "let-repeat":
      return `${LET_REPEAT_FACTOR * LOOKUP_RESULT_FACTOR * (size - 1)}:${size - 1}`;
    case "let-many": {
      const x = size * LET_MANY_EDITED_SCALE;
      return x + (x + 1) + (x + 1) * x;
    }
    case "round-many":
      return Number(((size + ROUND_MANY_FRACTION) * SHAPE_EDITED_SCALE).toFixed(2));
    case "concat-many":
      return `item${(size - 1) % CONCAT_MANY_LABELS} ${CONCAT_MANY_EDITED_SUFFIX}`;
    case "offset-many":
    case "indirect-many":
      return size + SHAPE_EDITED_SCALE;
    case "let-calls": {
      const x = size * SHAPE_EDITED_SCALE + 1;
      const y = Math.round((x / 3) * 100) / 100;
      return x + y + y * x;
    }
    case "name-define":
    case "row-insert-names":
      return (size - NAMED_FORMULA_STRIDE + 1) * NAME_SCALE;
    case "table-append-row":
      return ((size + 1) * (size + 2)) / 2;
    case "sort-formula-column":
      return 2 * (sortedSourceRow(size, size - 1) + 1);
    case "parse-load-qualified":
      return size;
    case "parse-load-table":
    case "memory-import":
      return size * 2;
    case "groupby-sum":
      return groupingEditedTotal(size);
    case "pivotby-percentof":
      return groupingFirstQuarterShare(size);
    case "pivot-rebuild":
      return pivotRebuildOutput(size);
    case "getpivotdata-many":
      return pivotDataValue(size - 1);
    case "analysis-calls":
      return analysisCallsOutput(size);
    case "history-diff":
      return historyDiffOutput();
    case "iterative-finance":
      return 0.08663094803653158 + 0.08144165646436567;
    case "incremental-dependency-closure-edit":
      return `12:${size + 1}`;
    case "spill-sequence-admission":
      return `1:${size}:0`;
    case "spill-filter-same-range":
      return `${SAME_RANGE_EDITED_FIRST}:0`;
    case "paged-cell-reads":
      return pagedCellReadsOutput(size);
    case "paged-insert-row":
      return pagedInsertRowOutput(size);
    case "paged-range-loaded":
      return 1;
    case "paged-eviction":
      return pagedEvictionOutput(size);
    case "index-match-many":
      return INDEX_MATCH_VALUE_SCALE * (SHAPE_EDITED_SCALE + size - 1);
    case "rank-many":
      return `${size}:${RANK_MANY_EDITED_FIRST}`;
    case "sort-unique-filter":
      return sortUniqueOutput(SORT_UNIQUE_EDITED_ROWS);
    case "subtotal-filtered":
      return subtotalOutput(size, SUBTOTAL_EDITED_FIRST);
    case "sort-mixed-blanks":
      return sortMixedBlanksOutput(size);
    case "sort-rows-labels":
      return sortRowsOutput(size, sortRowsLabel);
    case "sort-rows-numbers":
      return sortRowsOutput(size, sortRowsNumber);
    case "sparse-page-write":
      return sparsePageOutput(size);
    case "map-lambda":
    case "lambda-call":
    case "named-lambda":
      return size * CLOSURE_EDITED_SCALE + 1;
    case "reduce-lambda":
      return (CLOSURE_EDITED_SCALE * size * (size + 1)) / 2;
    case "byrow-lambda":
      return 2 * size * CLOSURE_EDITED_SCALE;
    case "measure-pivot":
      return measurePivotOutput(size);
    default:
      throw new Error(`formula benchmark has no expected output for workload=${id};size=${size}`);
  }
}

export interface TimedFixture {
  store: CellStore;
  run(): void;
  check(): FormulaOutput;
  dispose(): void;
  /**
   * Return the store to its state before `run`, recalculated, so the same
   * edit can be timed again on this fixture. Only edit workloads define it:
   * load and first-recalculation runs consume state that no edit can restore.
   */
  restore?(): void;
}

export type FixtureFactory = () => TimedFixture;

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`formula benchmark correctness failure: ${message}`);
}

function setFormulas(store: CellStore, sheet: number, formulas: readonly FormulaCell[]): void {
  for (const formula of formulas) {
    store.setFormula(sheet, formula.row, formula.col, formula.src, 0);
  }
}

function numberAt(store: CellStore, sheet: number, row: number, col: number): number {
  const cell = store.getCell(sheet, row, col);
  const value = cell.num;
  cell.free();
  return value;
}

function textAt(store: CellStore, sheet: number, row: number, col: number): string | undefined {
  const cell = store.getCell(sheet, row, col);
  const value = cell.string;
  cell.free();
  return value;
}

function numericColumn(count: number, value: (row: number) => number): Float64Array {
  return Float64Array.from({ length: count }, (_, row) => value(row));
}

function independentLoadFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  const formulas = independentFormulas(count);
  return {
    store,
    run: () => setFormulas(store, sheet, formulas),
    check: () => {
      store.recompute(sheet);
      return numberAt(store, sheet, count - 1, 1);
    },
    dispose: () => store.free(),
  };
}

function independentRecomputeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, independentFormulas(count));
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function chainFixture(depth: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, depth);
  store.setNumber(sheet, 0, 0, 1, 0);
  setFormulas(store, sheet, linearChain(depth));
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, depth - 1, 0),
    dispose: () => store.free(),
  };
}

/** A1 starts at the source value; the timed edit writes the edited value to A1, or to unrelated C1. */
const FAN_OUT_SOURCE_VALUE = 1;
const FAN_OUT_EDITED_VALUE = 10;

function fanOutEditFixture(count: number, unrelated = false): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, Math.max(1, count));
  const editedColumn = unrelated ? 2 : 0;
  store.setNumber(sheet, 0, 0, FAN_OUT_SOURCE_VALUE, 0);
  setFormulas(store, sheet, fanOutFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, editedColumn, FAN_OUT_EDITED_VALUE, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      if (unrelated) store.clearCell(sheet, 0, editedColumn, 0);
      else store.setNumber(sheet, 0, editedColumn, FAN_OUT_SOURCE_VALUE, 0);
      store.recompute(sheet);
    },
  };
}

/** Column B holds a fill value; the timed edit rewrites the literal of one formula only. */
const CONSTANT_EDIT_FILL = 10;
const CONSTANT_EDIT_BASE = 1;
const CONSTANT_EDIT_EDITED_BASE = 2;

function constantEditFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(count, () => CONSTANT_EDIT_FILL),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 2, `=A${row + 1}+B${row + 1}+${CONSTANT_EDIT_BASE}`, 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setFormula(sheet, 0, 2, `=A1+B1+${CONSTANT_EDIT_EDITED_BASE}`, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 2)}:${numberAt(store, sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: () => {
      store.setFormula(sheet, 0, 2, `=A1+B1+${CONSTANT_EDIT_BASE}`, 0);
      store.recompute(sheet);
    },
  };
}

/** Measure the single-cell transaction used by Grid, not the scalar WASM adapter. */
export function gridConstantEditSample(count: number) {
  const store = new SheetwriteStore(
    {
      activeSheet: "constant-edit",
      sheets: [
        {
          id: "constant-edit",
          name: "Constant edit",
          rowCount: count,
          columns: ["a", "b", "c"].map((id) => ({
            id,
            key: id,
            header: id,
            width: 100,
            type: "number" as const,
          })),
        },
      ],
    },
    {
      rowCount: count,
      columns: {
        a: Array.from({ length: count }, (_, row) => row),
        b: Array.from({ length: count }, () => CONSTANT_EDIT_FILL),
        c: Array.from({ length: count }, (_, row) => ({
          kind: "formula" as const,
          src: `=A${row + 1}+B${row + 1}+${CONSTANT_EDIT_BASE}`,
        })),
      },
    },
  );
  try {
    const samplesMs: number[] = [];
    // Alternate constants so every sample is a real source replacement.
    for (let sample = 0; sample < 12; sample++) {
      const constant = sample % 2 === 0 ? CONSTANT_EDIT_EDITED_BASE : CONSTANT_EDIT_BASE;
      const started = now();
      const result = store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "constant-edit", row: 0, col: 2 },
            value: { kind: "formula", src: `=A1+B1+${constant}` },
          },
        ],
      });
      const elapsedMs = now() - started;
      assert(result.status === "applied", "Grid constant edit must apply");
      assert(
        store.getCell({ sheet: "constant-edit", row: 0, col: 2 }).resolved ===
          CONSTANT_EDIT_FILL + constant,
        "Grid constant edit output",
      );
      if (sample >= 2) samplesMs.push(elapsedMs);
    }
    const output = `${store.getCell({ sheet: "constant-edit", row: 0, col: 2 }).resolved}:${store.getCell({ sheet: "constant-edit", row: count - 1, col: 2 }).resolved}`;
    return {
      id: "grid-formula-constant-edit",
      size: count,
      samplesMs,
      stat: summarize(samplesMs),
      output,
    };
  } finally {
    store.dispose();
  }
}

/** Undo a timed one-cell number edit, untimed, so the next timed edit repeats the same work. */
function restoreNumber(
  store: CellStore,
  sheet: number,
  cell: { row: number; col: number; value: number },
): () => void {
  return () => {
    store.setNumber(sheet, cell.row, cell.col, cell.value, 0);
    store.recompute(sheet);
  };
}

function diamondFixture(levels: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, levels);
  store.setNumber(sheet, 0, 0, 1, 0);
  setFormulas(store, sheet, diamondFormulas(levels));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, levels - 1, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function sharedRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, Math.max(count, 100));
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(100, () => 1),
    0,
  );
  setFormulas(store, sheet, sharedRangeFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function distinctRangeFixture(count: number): TimedFixture {
  const rows = count * 10;
  const store = new CellStore();
  const sheet = store.addSheet(2, rows);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(rows, () => 1),
    0,
  );
  setFormulas(store, sheet, distinctRangeFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 1)}:${numberAt(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function crossSheetFixture(count: number): TimedFixture {
  const store = new CellStore();
  const source = store.addSheet(1, 100);
  const summary = store.addSheet(1, count);
  store.setSheetName(source, "source", "Source");
  store.setSheetName(summary, "summary", "Summary");
  writeNumberColumn(
    store,
    source,
    0,
    0,
    numericColumn(100, () => 1),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(summary, row, 0, `=SUM(Source!A1:A100)+${row}`, 0);
  }
  store.recompute(summary);
  return {
    store,
    run: () => {
      store.setNumber(source, 0, 0, 2, 0);
      store.recompute(source);
    },
    check: () => numberAt(store, summary, count - 1, 0),
    dispose: () => store.free(),
    restore: restoreNumber(store, source, { row: 0, col: 0, value: 1 }),
  };
}

function topologyFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, independentFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      for (let row = 0; row < count; row += 2) store.clearCell(sheet, row, 1, 0);
      store.recompute(sheet);
      for (let row = 0; row < count; row += 2) {
        store.setFormula(sheet, row, 1, `=A${row + 1}+2`, 0);
      }
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 1)}:${numberAt(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
  };
}

function cycleFixture(pairs: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, pairs);
  for (let row = 0; row < pairs; row++) {
    store.setFormula(sheet, row, 0, `=B${row + 1}`, 0);
    store.setFormula(sheet, row, 1, `=A${row + 1}`, 0);
  }
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => textAt(store, sheet, pairs - 1, 1) ?? "",
    dispose: () => store.free(),
  };
}

function refRemovalFixture(count: number): TimedFixture {
  const store = new CellStore();
  const source = store.addSheet(1, 1);
  const summary = store.addSheet(1, count);
  store.setSheetName(source, "source", "Source");
  store.setSheetName(summary, "summary", "Summary");
  store.setNumber(source, 0, 0, 1, 0);
  for (let row = 0; row < count; row++) store.setFormula(summary, row, 0, "=Source!A1", 0);
  store.recompute(summary);
  return {
    store,
    run: () => {
      store.removeSheet(source);
    },
    check: () => textAt(store, summary, count - 1, 0) ?? "",
    dispose: () => store.free(),
  };
}

function errorPropagationFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setFormula(sheet, 0, 0, "=1/0", 0);
  for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, "=$A$1", 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => textAt(store, sheet, count - 1, 1) ?? "",
    dispose: () => store.free(),
  };
}

function criteriaRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(count, () => 1),
    0,
  );
  const threshold = Math.floor(count / 2);
  store.setFormula(sheet, 0, 2, `=SUMIF(A1:A${count},">=${threshold}",B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, count, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

function lookupRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(count, (row) => row * 2),
    0,
  );
  store.setNumber(sheet, 0, 2, 0, 0);
  store.setFormula(sheet, 0, 3, `=XLOOKUP(C1,A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, count - 1, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: 0 }),
  };
}

/** Every lookup scenario pairs ten ascending table rows with each lookup formula. */
const LOOKUP_TABLE_ROWS_PER_FORMULA = 10;
const LOOKUP_RESULT_FACTOR = 2;
const NUMERIC_LOOKUP_INITIAL_KEY = 5;
const NUMERIC_LOOKUP_EDITED_KEY = 7;
const NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY = 5.5;
const NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY = 7.5;
const TEXT_LOOKUP_KEY_PREFIX = "ITEM";
const TEXT_LOOKUP_QUERY_PREFIX = "ItEm";
const TEXT_LOOKUP_KEY_PADDING = 6;
const TEXT_LOOKUP_INITIAL_ROW = 12;
const TEXT_LOOKUP_EDITED_ROW = 37;
const TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW = 11;
const TEXT_LOOKUP_APPROXIMATE_ROW = 36;

/** Ascending numeric key column plus a result column that scales with the key. */
function lookupTableStore(tableRows: number): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(4, tableRows);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(tableRows, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(tableRows, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
  return { store, sheet };
}

/** Zero-padded text keys stay ascending under the case-insensitive lookup comparison. */
function textLookupKeyAt(row: number): string {
  return `${TEXT_LOOKUP_KEY_PREFIX}${String(row).padStart(TEXT_LOOKUP_KEY_PADDING, "0")}`;
}

/** The query key differs from the stored key only by letter case. */
function textLookupQueryKey(row: number): string {
  return `${TEXT_LOOKUP_QUERY_PREFIX}${String(row).padStart(TEXT_LOOKUP_KEY_PADDING, "0")}`;
}

/** Sorts between the stored keys of `row` and `row + 1`, so only approximate matching can land. */
function textLookupBetweenQueryKey(row: number): string {
  return `${textLookupQueryKey(row)}5`;
}

/** Ascending text key column plus the same result column as the numeric table. */
function textLookupTableStore(tableRows: number): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(4, tableRows);
  for (let row = 0; row < tableRows; row++) {
    store.setString(sheet, row, 0, textLookupKeyAt(row), 0);
  }
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(tableRows, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
  return { store, sheet };
}

/** The shared key cell takes a number for numeric tables and text for text tables. */
function writeLookupKey(store: CellStore, sheet: number, key: number | string): void {
  if (typeof key === "number") store.setNumber(sheet, 0, 2, key, 0);
  else store.setString(sheet, 0, 2, key, 0);
}

interface LookupVariant {
  readonly id: string;
  readonly table: (tableRows: number) => { store: CellStore; sheet: number };
  readonly formula: (tableRows: number) => string;
  readonly initialKey: number | string;
  readonly editedKey: number | string;
  readonly initialValue: number;
  readonly editedValue: number;
}

/** Each lookup function runs once as a first-recalculation workload and once as a key-edit one. */
const LOOKUP_EDIT_SUFFIX = "-edit";

const LOOKUP_VARIANTS: readonly LookupVariant[] = [
  {
    id: "vlookup-many",
    table: lookupTableStore,
    formula: (tableRows) => `=VLOOKUP($C$1,A1:B${tableRows},2,FALSE)`,
    initialKey: NUMERIC_LOOKUP_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_EDITED_KEY,
    initialValue: NUMERIC_LOOKUP_INITIAL_KEY * LOOKUP_RESULT_FACTOR,
    editedValue: NUMERIC_LOOKUP_EDITED_KEY * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "vlookup-many-sorted",
    table: lookupTableStore,
    formula: (tableRows) => `=VLOOKUP($C$1,A1:B${tableRows},2,TRUE)`,
    initialKey: NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY,
    initialValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY) * LOOKUP_RESULT_FACTOR,
    editedValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "xlookup-many",
    table: lookupTableStore,
    formula: (tableRows) => `=XLOOKUP($C$1,A1:A${tableRows},B1:B${tableRows})`,
    initialKey: NUMERIC_LOOKUP_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_EDITED_KEY,
    initialValue: NUMERIC_LOOKUP_INITIAL_KEY * LOOKUP_RESULT_FACTOR,
    editedValue: NUMERIC_LOOKUP_EDITED_KEY * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "xlookup-many-sorted",
    table: lookupTableStore,
    formula: (tableRows) => `=XLOOKUP($C$1,A1:A${tableRows},B1:B${tableRows},,-1,2)`,
    initialKey: NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY,
    initialValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY) * LOOKUP_RESULT_FACTOR,
    editedValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "text-lookup-many",
    table: textLookupTableStore,
    formula: (tableRows) => `=XLOOKUP($C$1,A1:A${tableRows},B1:B${tableRows})`,
    initialKey: textLookupQueryKey(TEXT_LOOKUP_INITIAL_ROW),
    editedKey: textLookupQueryKey(TEXT_LOOKUP_EDITED_ROW),
    initialValue: (TEXT_LOOKUP_INITIAL_ROW + 1) * LOOKUP_RESULT_FACTOR,
    editedValue: (TEXT_LOOKUP_EDITED_ROW + 1) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "text-lookup-many-sorted",
    table: textLookupTableStore,
    formula: (tableRows) => `=VLOOKUP($C$1,A1:B${tableRows},2,TRUE)`,
    initialKey: textLookupBetweenQueryKey(TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW),
    editedKey: textLookupBetweenQueryKey(TEXT_LOOKUP_APPROXIMATE_ROW),
    initialValue: (TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW + 1) * LOOKUP_RESULT_FACTOR,
    editedValue: (TEXT_LOOKUP_APPROXIMATE_ROW + 1) * LOOKUP_RESULT_FACTOR,
  },
];

/** Every lookup workload reports the shared result plus the key its formulas were last queried with. */
function lookupVariantOutput(id: string): FormulaOutput | undefined {
  const editsKey = id.endsWith(LOOKUP_EDIT_SUFFIX);
  const baseId = editsKey ? id.slice(0, -LOOKUP_EDIT_SUFFIX.length) : id;
  const variant = LOOKUP_VARIANTS.find((candidate) => candidate.id === baseId);
  if (variant === undefined) return undefined;
  return editsKey
    ? `${variant.editedValue}:${variant.editedKey}`
    : `${variant.initialValue}:${variant.initialKey}`;
}

/** The two timed units of a lookup workload; each one has its own workload id. */
type LookupPhase = "first-recompute" | "key-edit";

/**
 * One shared key cell in C1 drives every lookup formula. The timed unit is either the first
 * recalculation of all formulas or one key edit with its recalculation; afterwards every formula
 * is read outside the timed interval and compared with the value computed here.
 */
function lookupFixture(count: number, phase: LookupPhase, variant: LookupVariant): TimedFixture {
  const tableRows = count * LOOKUP_TABLE_ROWS_PER_FORMULA;
  const { store, sheet } = variant.table(tableRows);
  writeLookupKey(store, sheet, variant.initialKey);
  const source = variant.formula(tableRows);
  for (let row = 0; row < count; row++) store.setFormula(sheet, row, 3, source, 0);
  const editsKey = phase === "key-edit";
  const expectedValue = editsKey ? variant.editedValue : variant.initialValue;
  const expectedKey = editsKey ? variant.editedKey : variant.initialKey;
  // The edit phase starts from computed values, so its timed unit is the key edit alone.
  if (editsKey) store.recompute(sheet);
  return {
    store,
    run: () => {
      if (editsKey) writeLookupKey(store, sheet, variant.editedKey);
      store.recompute(sheet);
    },
    check: () => {
      for (let row = 0; row < count; row++) {
        const value = numberAt(store, sheet, row, 3);
        assert(
          value === expectedValue,
          `${variant.id} row ${row} expected ${expectedValue}, observed ${value}`,
        );
      }
      return `${expectedValue}:${expectedKey}`;
    },
    dispose: () => store.free(),
    ...(editsKey && {
      restore: () => {
        writeLookupKey(store, sheet, variant.initialKey);
        store.recompute(sheet);
      },
    }),
  };
}

/** Key-table sizes of the mixed-type exact lookup rows. */

/** Table rows per lookup formula of the mixed-type rows. */
const MIXED_LOOKUP_ROWS_PER_FORMULA = 10;

/** Even rows hold numbers and odd rows text, so one key column mixes types. */
function mixedLookupKeyAt(row: number): number | string {
  return row % 2 === 0 ? row : `Key${row}`;
}

/** Formula `formula` looks up table row `formula * 10 + formula % 2`, so the
 * keys alternate between numbers and text. Text keys differ from the table
 * only in case. */
function mixedLookupRowOf(formula: number): number {
  return formula * MIXED_LOOKUP_ROWS_PER_FORMULA + (formula % 2);
}

function mixedLookupOutput(tableRows: number): string {
  const last = tableRows / MIXED_LOOKUP_ROWS_PER_FORMULA - 1;
  return `${mixedLookupRowOf(last) + 1}`;
}

/**
 * Exact `XLOOKUP`s on one key column that mixes numbers and text. The timed
 * unit is the first recalculation of all formulas; every result is checked
 * outside the timed interval.
 */
function mixedLookupFixture(tableRows: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, tableRows);
  for (let row = 0; row < tableRows; row++) {
    const key = mixedLookupKeyAt(row);
    if (typeof key === "number") store.setNumber(sheet, row, 0, key, 0);
    else store.setString(sheet, row, 0, key, 0);
  }
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(tableRows, (row) => row + 1),
    0,
  );

  const formulas = tableRows / MIXED_LOOKUP_ROWS_PER_FORMULA;
  for (let formula = 0; formula < formulas; formula++) {
    const key = mixedLookupKeyAt(mixedLookupRowOf(formula));
    if (typeof key === "number") store.setNumber(sheet, formula, 2, key, 0);
    else store.setString(sheet, formula, 2, key.toLowerCase(), 0);
    store.setFormula(
      sheet,
      formula,
      3,
      `=XLOOKUP(C${formula + 1},A1:A${tableRows},B1:B${tableRows})`,
      0,
    );
  }

  return {
    store,
    run: () => store.recompute(sheet),
    check: () => {
      for (let formula = 0; formula < formulas; formula++) {
        const value = numberAt(store, sheet, formula, 3);
        const expected = mixedLookupRowOf(formula) + 1;
        assert(
          value === expected,
          `xlookup-mixed-exact row ${formula} expected ${expected}, observed ${value}`,
        );
      }
      return mixedLookupOutput(tableRows);
    },
    dispose: () => store.free(),
  };
}

function spillFilterResizeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  for (let row = 0; row < count; row++) store.setBool(sheet, row, 1, row + 1 < count, 0);
  store.setFormula(sheet, 0, 2, `=FILTER(A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setBool(sheet, count - 1, 1, true, 0);
      store.recompute(sheet);
    },
    check: () =>
      `${numberAt(store, sheet, count - 1, 2)}:${store.spillAnchorRow(sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: () => {
      store.setBool(sheet, count - 1, 1, false, 0);
      store.recompute(sheet);
    },
  };
}

/** The `spill-filter-same-range` edit writes this into A1, the spill's first value. */
const SAME_RANGE_EDITED_FIRST = -1;

/**
 * The spill of `spill-filter-resize`, but the edit changes one source value
 * instead of the filter, so the spill comes back over the same range with one
 * changed cell: the anchor.
 */
function spillFilterSameRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  for (let row = 0; row < count; row++) store.setBool(sheet, row, 1, true, 0);
  store.setFormula(sheet, 0, 2, `=FILTER(A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, SAME_RANGE_EDITED_FIRST, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 2)}:${store.spillAnchorRow(sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

function spillSequenceAdmissionFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, count);
  store.setFormula(sheet, 0, 0, `=SEQUENCE(${count})`, 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () =>
      `${numberAt(store, sheet, 0, 0)}:${numberAt(store, sheet, count - 1, 0)}:${store.spillAnchorRow(sheet, count - 1, 0)}`,
    dispose: () => store.free(),
  };
}

function sumProductVectorFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => (row % 10) + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(count, () => 2),
    0,
  );
  store.setFormula(sheet, 0, 2, `=SUMPRODUCT(A1:A${count},B1:B${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 3, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function sumProductMatrixFixture(elements: number): TimedFixture {
  const columns = 10;
  const rows = elements / columns;
  assert(Number.isInteger(rows), "SUMPRODUCT matrix shape");
  const store = new CellStore();
  const sheet = store.addSheet(columns * 2 + 1, rows);
  for (let col = 0; col < columns; col++) {
    writeNumberColumn(
      store,
      sheet,
      col,
      0,
      numericColumn(rows, () => 1),
      0,
    );
    writeNumberColumn(
      store,
      sheet,
      columns + col,
      0,
      numericColumn(rows, () => 2),
      0,
    );
  }
  store.setFormula(sheet, 0, columns * 2, `=SUMPRODUCT(A1:J${rows},K1:T${rows})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 3, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, columns * 2),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function criteriaMultiRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(count, (row) => row % 2),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    2,
    0,
    numericColumn(count, () => 2),
    0,
  );
  const threshold = count / 2;
  store.setFormula(
    sheet,
    0,
    3,
    `=SUMIFS(C1:C${count},A1:A${count},">=${threshold}",B1:B${count},1)+COUNTIFS(A1:A${count},"<${threshold}",B1:B${count},0)`,
    0,
  );
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, count, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

/** Column B repeats one fill value, so the two-range total is closed-form. */
const SUM_MULTI_RANGE_FILL = 2;
const COUNTIF_MATCH_SHARE = 2;

function sumMultiRangeFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(count, () => SUM_MULTI_RANGE_FILL),
    0,
  );
  store.setFormula(sheet, 0, 2, `=SUM(A1:A${count},B1:B${count})`, 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => `${numberAt(store, sheet, 0, 2)}`,
    dispose: () => store.free(),
  };
}

/** Criteria rows repeat every six rows: odd, divisible by three, and past the halfway threshold. */
const SUMIFS_CRITERIA_PERIOD = 6;
const SUMIFS_CRITERIA_OFFSET = 3;
const SUMIFS_TEXT_MATCH = "keep";
const SUMIFS_TEXT_OTHER = "skip";

function sumifsCriteriaTotal(count: number): number {
  const threshold = Math.floor(count / COUNTIF_MATCH_SHARE);
  let total = 0;
  for (let row = SUMIFS_CRITERIA_OFFSET; row < count; row += SUMIFS_CRITERIA_PERIOD) {
    if (row >= threshold) total += row + 1;
  }
  return total;
}

function sumifsCriteriaFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(5, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(count, (row) => row % 2),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setString(
      sheet,
      row,
      2,
      row % (SUMIFS_CRITERIA_PERIOD / 2) === 0 ? SUMIFS_TEXT_MATCH : SUMIFS_TEXT_OTHER,
      0,
    );
  }
  writeNumberColumn(
    store,
    sheet,
    3,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setFormula(
    sheet,
    0,
    4,
    `=SUMIFS(D1:D${count},A1:A${count},">=${Math.floor(count / COUNTIF_MATCH_SHARE)}",B1:B${count},1,C1:C${count},"${SUMIFS_TEXT_MATCH}")`,
    0,
  );
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, 0, 4),
    dispose: () => store.free(),
  };
}

function countifFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setFormula(
    sheet,
    0,
    1,
    `=COUNTIF(A1:A${count},">=${Math.floor(count / COUNTIF_MATCH_SHARE)}")`,
    0,
  );
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, 0, 1),
    dispose: () => store.free(),
  };
}

function unicodeTextDateFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setString(sheet, 0, 0, "café😀-2024-02-29", 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, "=UNICODE(MID($A$1,5,1))+DATEVALUE(RIGHT($A$1,10))", 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setString(sheet, 0, 0, "naïv😀-2024-03-01", 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      store.setString(sheet, 0, 0, "café😀-2024-02-29", 0);
      store.recompute(sheet);
    },
  };
}

function percentileCovarianceFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(count, (row) => 2 * (row + 1) + 3),
    0,
  );
  store.setFormula(
    sheet,
    0,
    2,
    `=PERCENTILE.INC(A1:A${count},0.9)+COVARIANCE.P(A1:A${count},B1:B${count})`,
    0,
  );
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, 0, 2),
    dispose: () => store.free(),
  };
}

function letReuseFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, () => 1),
    0,
  );
  store.setFormula(sheet, 0, 1, `=LET(total,SUM(A1:A${count}),total+total+total)`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

/** The `let-many` sizes: a normal sheet and a large one. */
/** Every `let-many` formula reads this scale from `$C$1`, so one edit dirties all of them. */
const LET_MANY_SCALE = 2;
const LET_MANY_EDITED_SCALE = 3;

/**
 * Rows for formula shapes the other rows do not exercise: ROUND, text
 * concatenation, OFFSET, INDIRECT and LETs that bind function calls, one
 * formula per row. Each formula reads `$C$1`, so the timed edit recalculates
 * all of them.
 */
const SHAPE_SCALE = 2;
const SHAPE_EDITED_SCALE = 3;
/** Column A's fractional part: a multiple of it never ends in a rounding tie at two places. */
const ROUND_MANY_FRACTION = 0.1234;
/** Column A cycles through this many text labels. */
const CONCAT_MANY_LABELS = 97;
const CONCAT_MANY_SUFFIX = "a";
const CONCAT_MANY_EDITED_SUFFIX = "b";

/** A sheet with one formula per row in column B; `$C$1` holds what the timed edit changes. */
function shapeRowsFixture(
  count: number,
  fill: (store: CellStore, sheet: number, rows: number) => void,
  formula: (row: number) => string,
  source: string | number,
  edited: string | number,
  check: (store: CellStore, sheet: number) => number | string,
): TimedFixture {
  const store = new CellStore();
  // OFFSET and INDIRECT read up to `SHAPE_EDITED_SCALE` rows below the last formula.
  const rows = count + SHAPE_EDITED_SCALE;
  const sheet = store.addSheet(3, rows);
  fill(store, sheet, rows);
  const setSource = (value: string | number) =>
    typeof value === "string"
      ? store.setString(sheet, 0, 2, value, 0)
      : store.setNumber(sheet, 0, 2, value, 0);
  setSource(source);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, formula(row), 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      setSource(edited);
      store.recompute(sheet);
    },
    check: () => check(store, sheet),
    dispose: () => store.free(),
    restore: () => {
      setSource(source);
      store.recompute(sheet);
    },
  };
}

function numbersInA(fraction = 0): (store: CellStore, sheet: number, rows: number) => void {
  return (store, sheet, rows) =>
    writeNumberColumn(
      store,
      sheet,
      0,
      0,
      numericColumn(rows, (row) => row + 1 + fraction),
      0,
    );
}

function shapeRowFixture(id: string, count: number): TimedFixture {
  const last = (store: CellStore, sheet: number) => numberAt(store, sheet, count - 1, 1);
  switch (id) {
    case "round-many":
      return shapeRowsFixture(
        count,
        numbersInA(ROUND_MANY_FRACTION),
        (row) => `=ROUND(A${row + 1}*$C$1,2)`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "concat-many":
      return shapeRowsFixture(
        count,
        (store, sheet, rows) => {
          for (let row = 0; row < rows; row++) {
            store.setString(sheet, row, 0, `item${row % CONCAT_MANY_LABELS}`, 0);
          }
        },
        (row) => `=A${row + 1}&" "&$C$1`,
        CONCAT_MANY_SUFFIX,
        CONCAT_MANY_EDITED_SUFFIX,
        (store, sheet) => textAt(store, sheet, count - 1, 1) ?? "",
      );
    case "offset-many":
      return shapeRowsFixture(
        count,
        numbersInA(),
        (row) => `=OFFSET(A${row + 1},$C$1,0)`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "indirect-many":
      return shapeRowsFixture(
        count,
        numbersInA(),
        () => `=INDIRECT("A"&(ROW()+$C$1))`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "let-calls":
      return shapeRowsFixture(
        count,
        numbersInA(),
        letCallsFormula,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    default:
      throw new Error(`unknown formula fixture: ${id}`);
  }
}

/** `let-many` with function-call bindings: even rows one, odd rows three. */
function letCallsFormula(row: number): string {
  const source = `A${row + 1}*$C$1`;
  return row % 2 === 0
    ? `=LET(x,ROUND(${source},2),x+x+x)`
    : `=LET(x,SUM(${source},1),y,ROUND(x/3,2),z,y*x,x+y+z)`;
}

/**
 * Rows for binding formulas to sheets, names and tables: defining names, a
 * row insert in a workbook with names, a table that grows by a row, a sort
 * that moves formulas, loading formulas that name another sheet or a table
 * column, and restoring a released engine from its memory state.
 */
/** Defined names `Scale_0`…`Scale_9`; each points at one cell holding `NAME_SCALE`. */
const BINDING_NAMES = 10;
/** One formula in this many uses a name; the others are plain. */
const NAMED_FORMULA_STRIDE = 10;
const NAME_SCALE = 2;
/** Sorting moves row `i` to row `(i * SORT_STRIDE) % rows`; prime, so it permutes every size. */
const SORT_STRIDE = 7_919;

function bindingName(index: number): string {
  return `Scale_${index}`;
}

/** Every `NAMED_FORMULA_STRIDE`th formula multiplies by a defined name, the others by 2. */
function namedRowFormula(row: number, cell: string): string {
  const scale =
    row % NAMED_FORMULA_STRIDE === 0
      ? bindingName((row / NAMED_FORMULA_STRIDE) % BINDING_NAMES)
      : String(NAME_SCALE);
  return `=${cell}*${scale}`;
}

/** Points the names at `C1`…`C10` of `sheet`, one name at a time. */
function defineBindingNames(store: CellStore, sheet: number): void {
  for (let index = 0; index < BINDING_NAMES; index++) {
    assert(
      store.setNamedRange(bindingName(index), -1, sheet, index, 2, index, 2),
      "binding name defined",
    );
  }
}

/** Column A holds 1…count, column B a formula per row, and C1:C10 the values the names point at. */
function namedFormulasSheet(store: CellStore, count: number): number {
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    2,
    0,
    numericColumn(BINDING_NAMES, () => NAME_SCALE),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, namedRowFormula(row, `A${row + 1}`), 0);
  }
  return sheet;
}

/** The value of the last formula that uses a name, `offset` rows below where it was written. */
function lastNamedFormula(store: CellStore, sheet: number, count: number, offset = 0): number {
  return numberAt(store, sheet, count - NAMED_FORMULA_STRIDE + offset, 1);
}

/**
 * The formulas exist before the names, as when a workbook defines its names
 * after its formulas. The timed run defines the ten names one at a time.
 */
function nameDefineFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = namedFormulasSheet(store, count);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      defineBindingNames(store, sheet);
      store.recompute(sheet);
    },
    check: () => lastNamedFormula(store, sheet, count),
    dispose: () => store.free(),
    restore: () => {
      for (let index = 0; index < BINDING_NAMES; index++) {
        store.removeNamedRange(bindingName(index), -1);
      }
      store.recompute(sheet);
    },
  };
}

/** The timed run inserts one row above everything, so every formula and name moves. */
function rowInsertNamesFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = namedFormulasSheet(store, count);
  defineBindingNames(store, sheet);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      assert(store.addRows(sheet, 0, 1), "row inserted");
      store.recompute(sheet);
    },
    check: () => lastNamedFormula(store, sheet, count, 1),
    dispose: () => store.free(),
    restore: () => {
      assert(store.removeRows(sheet, 0, 1), "row removed");
      store.recompute(sheet);
    },
  };
}

/** Table `Sales` over A:B with a header row: `Amount` holds numbers, `Double` is `=[@Amount]*2`. */
function setSalesTable(store: CellStore, sheet: number, bodyRows: number): void {
  assert(
    store.setTable(
      "sales",
      "Sales",
      sheet,
      0,
      0,
      bodyRows,
      1,
      true,
      false,
      ["amount", "double"],
      ["Amount", "Double"],
    ),
    "table set",
  );
}

/** A sheet whose rows 1…count are the body of `Sales`, with `Amount` 1…count and room for one more row. */
function salesSheet(store: CellStore, count: number): number {
  const sheet = store.addSheet(4, count + 2);
  store.setString(sheet, 0, 0, "Amount", 0);
  store.setString(sheet, 0, 1, "Double", 0);
  writeNumberColumn(
    store,
    sheet,
    0,
    1,
    numericColumn(count, (row) => row + 1),
    0,
  );
  setSalesTable(store, sheet, count);
  return sheet;
}

const TABLE_ROW_FORMULA = "=[@Amount]*2";

/**
 * Every body row has `=[@Amount]*2`, and D1 sums the column. The timed run
 * appends a row the way a user does: a value, the table grown by one row,
 * and the column's formula in the new row.
 */
function tableAppendRowFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = salesSheet(store, count);
  for (let row = 1; row <= count; row++) {
    store.setFormula(sheet, row, 1, TABLE_ROW_FORMULA, 0);
  }
  store.setFormula(sheet, 0, 3, "=SUM(Sales[Amount])", 0);
  store.recompute(sheet);
  const added = count + 1;
  return {
    store,
    run: () => {
      store.setNumber(sheet, added, 0, added, 0);
      setSalesTable(store, sheet, added);
      store.setFormula(sheet, added, 1, TABLE_ROW_FORMULA, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: () => {
      setSalesTable(store, sheet, count);
      store.clearCell(sheet, added, 1, 0);
      store.clearCell(sheet, added, 0, 0);
      store.recompute(sheet);
    },
  };
}

/** The source row that sorting moves to target row `row`. */
function sortedSourceRow(rows: number, row: number): number {
  return (row * SORT_STRIDE) % rows;
}

/** Column A holds 1…count and column B `=A{r}*2`. The timed run sorts A:B by a fixed shuffle. */
function sortFormulaColumnFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, `=A${row + 1}*2`, 0);
  }
  store.recompute(sheet);
  const order = Uint32Array.from({ length: count }, (_, row) => sortedSourceRow(count, row));
  const inverse = new Uint32Array(count);
  for (const [target, source] of order.entries()) inverse[source] = target;
  return {
    store,
    run: () => {
      assert(store.permuteRows(sheet, 0, 0, 2, order) === 0, "rows sorted");
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      assert(store.permuteRows(sheet, 0, 0, 2, inverse) === 0, "rows unsorted");
      store.recompute(sheet);
    },
  };
}

/** Loads `=Data!A{r}+Data!B{r}` into a second sheet; A holds the row and B holds 1. */
function parseLoadQualifiedFixture(count: number): TimedFixture {
  const store = new CellStore();
  const data = store.addSheet(2, count);
  const calc = store.addSheet(1, count);
  store.setSheetName(data, "data", "Data");
  store.setSheetName(calc, "calc", "Calc");
  writeNumberColumn(
    store,
    data,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    data,
    1,
    0,
    numericColumn(count, () => 1),
    0,
  );
  const formulas = Array.from({ length: count }, (_, row) => `=Data!A${row + 1}+Data!B${row + 1}`);
  return {
    store,
    run: () => {
      for (const [row, formula] of formulas.entries()) store.setFormula(calc, row, 0, formula, 0);
    },
    check: () => {
      store.recompute(calc);
      return numberAt(store, calc, count - 1, 0);
    },
    dispose: () => store.free(),
  };
}

/** Loads `=[@Amount]*2` into every body row of `Sales`. */
function parseLoadTableFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = salesSheet(store, count);
  return {
    store,
    run: () => {
      for (let row = 1; row <= count; row++) {
        store.setFormula(sheet, row, 1, TABLE_ROW_FORMULA, 0);
      }
    },
    check: () => {
      store.recompute(sheet);
      return numberAt(store, sheet, count, 1);
    },
    dispose: () => store.free(),
  };
}

/**
 * A released engine's state restored: formulas on `Calc` read `Data`, and
 * every tenth one also uses a defined name. The timed run imports the state
 * exported at setup.
 */
function memoryImportFixture(count: number): TimedFixture {
  const store = new CellStore();
  const data = store.addSheet(3, count);
  const calc = store.addSheet(1, count);
  store.setSheetName(data, "data", "Data");
  store.setSheetName(calc, "calc", "Calc");
  writeNumberColumn(
    store,
    data,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    data,
    2,
    0,
    numericColumn(BINDING_NAMES, () => NAME_SCALE),
    0,
  );
  defineBindingNames(store, data);
  for (let row = 0; row < count; row++) {
    store.setFormula(calc, row, 0, namedRowFormula(row, `Data!A${row + 1}`), 0);
  }
  store.recompute(calc);
  const state = store.exportMemoryState();
  let imported: CellStore | undefined;
  return {
    store,
    run: () => {
      imported = CellStore.importMemoryState(state);
    },
    check: () => {
      assert(imported, "memory state imported");
      imported.recompute(calc);
      return numberAt(imported, calc, count - 1, 0);
    },
    dispose: () => {
      imported?.free();
      store.free();
    },
    restore: () => {
      imported?.free();
      imported = undefined;
    },
  };
}

function bindingRowFixture(id: string, count: number): TimedFixture {
  switch (id) {
    case "name-define":
      return nameDefineFixture(count);
    case "row-insert-names":
      return rowInsertNamesFixture(count);
    case "table-append-row":
      return tableAppendRowFixture(count);
    case "sort-formula-column":
      return sortFormulaColumnFixture(count);
    case "parse-load-qualified":
      return parseLoadQualifiedFixture(count);
    case "parse-load-table":
      return parseLoadTableFixture(count);
    case "memory-import":
      return memoryImportFixture(count);
    default:
      throw new Error(`unknown formula fixture: ${id}`);
  }
}

/**
 * Full-engine rows for closures, which only that engine has: LAMBDA helpers
 * over a range, a LAMBDA call in every row (written inline and through a
 * defined name), and a data-model pivot whose measures run for every pivot
 * cell. The timed edit reaches every call: the helpers and calls read `$C$1`,
 * and the pivot's source changes in one row.
 */
const CLOSURE_SCALE = 2;
const CLOSURE_EDITED_SCALE = 3;
/** The defined name `named-lambda` calls. */
const CLOSURE_NAME = "Affine";
const CLOSURE_LAMBDA = "LAMBDA(x,s,x*s+1)";

/**
 * One helper formula in D1 over `count` rows: A and B hold 1…count and `$C$1`
 * the scale the timed edit changes.
 */
function closureRangeFixture(
  count: number,
  formula: string,
  check: (store: CellStore, sheet: number) => number,
): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  for (const col of [0, 1]) {
    writeNumberColumn(
      store,
      sheet,
      col,
      0,
      numericColumn(count, (row) => row + 1),
      0,
    );
  }
  store.setNumber(sheet, 0, 2, CLOSURE_SCALE, 0);
  store.setFormula(sheet, 0, 3, formula, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, CLOSURE_EDITED_SCALE, 0);
      store.recompute(sheet);
    },
    check: () => check(store, sheet),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: CLOSURE_SCALE }),
  };
}

/** The columns of the `orders` table behind `measure-pivot`, and how each row fills them. */
const ORDER_COLUMNS = ["region", "quarter", "amount", "qty"] as const;
const ORDER_REGIONS = 25;
const orderRegion = (row: number) => row % ORDER_REGIONS;
const orderQuarter = (row: number) => (Math.floor(row / ORDER_REGIONS) % 4) + 1;
const orderAmount = (row: number) => (row % 7) + 1;
const orderQty = (row: number) => (row % 3) + 1;
const ORDER_EDITED_AMOUNT = 101;

/**
 * The two measures: average price, and a region's share of its quarter, which
 * removes the region filter with `CALCULATE(…,ALL(…))`.
 */
const ORDER_MEASURES = [
  "=SUM(orders[amount])/SUM(orders[qty])",
  "=SUM(orders[amount])/CALCULATE(SUM(orders[amount]),ALL(orders[region]))",
] as const;

/**
 * The pivot's first cell (region `R0`, quarter 1) after the timed edit: the
 * sum of its two measures.
 */
function measurePivotOutput(rows: number): number {
  let amount = 0;
  let qty = 0;
  let quarterAmount = 0;
  for (let row = 0; row < rows; row++) {
    if (orderQuarter(row) !== 1) continue;
    const value = row === 0 ? ORDER_EDITED_AMOUNT : orderAmount(row);
    quarterAmount += value;
    if (orderRegion(row) !== 0) continue;
    amount += value;
    qty += orderQty(row);
  }
  return amount / qty + amount / quarterAmount;
}

/**
 * Table `orders` with `count` body rows on one sheet, and on another a model
 * pivot over it: regions down, quarters across, both measures in each cell.
 * The timed run changes the first order's amount, so every cell updates.
 */
function measurePivotFixture(count: number): TimedFixture {
  // Only the full engine has pivots and measures.
  const store = new CellStore() as unknown as InstanceType<formulas.EngineInstance["CellStore"]>;
  const orders = store.addSheet(ORDER_COLUMNS.length, count + 1);
  const output = store.addSheet(1 + 4 * ORDER_MEASURES.length, ORDER_REGIONS + 2);
  for (const [col, header] of ORDER_COLUMNS.entries()) {
    store.setString(orders, 0, col, header, 0);
  }
  for (let row = 0; row < count; row++) {
    store.setString(orders, row + 1, 0, `R${orderRegion(row)}`, 0);
  }
  for (const [col, value] of [orderQuarter, orderAmount, orderQty].entries()) {
    writeNumberColumn(store, orders, col + 1, 1, numericColumn(count, value), 0);
  }
  assert(
    store.setTable(
      "orders",
      "orders",
      orders,
      0,
      0,
      count,
      ORDER_COLUMNS.length - 1,
      true,
      false,
      [...ORDER_COLUMNS],
      [...ORDER_COLUMNS],
    ),
    "orders table set",
  );
  // Measure records: [id, homeTable, formula, "", name].
  assert(
    store.setRelationships(
      ORDER_MEASURES.flatMap((formula, index) => [
        `m${index}`,
        "orders",
        formula,
        "",
        `Measure ${index}`,
      ]),
    ),
    "measures set",
  );
  // Pivot "pivot" from a model source (kind 3) over `orders`, every column a
  // field by table and column string, anchored at A1: regions down, quarters
  // across, each measure a value field; no filters, sorts or totals.
  const strings = [
    "pivot",
    "orders",
    ...ORDER_COLUMNS,
    ...ORDER_MEASURES.map((_, index) => `m${index}`),
  ];
  const definition = [0, 3, 1, ORDER_COLUMNS.length];
  for (const col of ORDER_COLUMNS.keys()) definition.push(1, 2 + col);
  definition.push(0, 0, 1, 0, 1, 1, ORDER_MEASURES.length);
  for (const index of ORDER_MEASURES.keys()) {
    definition.push(2 + ORDER_COLUMNS.length + index, 7, -1);
  }
  definition.push(0, 0, 0);
  assert(store.setPivots(output, new Float64Array(definition), strings), "pivot set");
  store.recompute(orders);
  const edit = (value: number) => {
    store.setNumber(orders, 1, 2, value, 0);
    store.recompute(orders);
  };
  return {
    store,
    run: () => edit(ORDER_EDITED_AMOUNT),
    // Below the quarter labels and the measure names: region R0 in quarter 1.
    check: () => numberAt(store, output, 2, 1) + numberAt(store, output, 2, 2),
    dispose: () => store.free(),
    restore: () => edit(orderAmount(0)),
  };
}

function closureRowFixture(id: string, count: number): TimedFixture {
  const last = (store: CellStore, sheet: number) => numberAt(store, sheet, count - 1, 1);
  switch (id) {
    case "map-lambda":
      return closureRangeFixture(count, `=MAP(A1:A${count},LAMBDA(x,x*$C$1+1))`, (store, sheet) =>
        numberAt(store, sheet, count - 1, 3),
      );
    case "reduce-lambda":
      return closureRangeFixture(
        count,
        `=REDUCE(0,A1:A${count},LAMBDA(a,x,a+x*$C$1))`,
        (store, sheet) => numberAt(store, sheet, 0, 3),
      );
    case "byrow-lambda":
      return closureRangeFixture(
        count,
        `=BYROW(A1:B${count},LAMBDA(r,SUM(r)*$C$1))`,
        (store, sheet) => numberAt(store, sheet, count - 1, 3),
      );
    case "lambda-call":
      return shapeRowsFixture(
        count,
        numbersInA(),
        (row) => `=${CLOSURE_LAMBDA}(A${row + 1},$C$1)`,
        CLOSURE_SCALE,
        CLOSURE_EDITED_SCALE,
        last,
      );
    case "named-lambda":
      return shapeRowsFixture(
        count,
        (store, sheet, rows) => {
          numbersInA()(store, sheet, rows);
          assert(store.setNamedFormula(CLOSURE_NAME, -1, `=${CLOSURE_LAMBDA}`), "LAMBDA name set");
        },
        (row) => `=${CLOSURE_NAME}(A${row + 1},$C$1)`,
        CLOSURE_SCALE,
        CLOSURE_EDITED_SCALE,
        last,
      );
    case "measure-pivot":
      return measurePivotFixture(count);
    default:
      throw new Error(`unknown formula fixture: ${id}`);
  }
}

/**
 * Rows for the full engine's grouping, pivot and analysis functions, which
 * the default engine does not have: GROUPBY with SUM and PIVOTBY with
 * PERCENTOF over two text key levels, a pivot table built again, many
 * GETPIVOTDATA cells, and one formula per row that calls four analysis
 * functions.
 */
/** Keys of the grouping rows: ten regions, each with ten of the hundred products. */
const GROUPING_REGIONS = 10;
const GROUPING_PRODUCTS = 100;
const GROUPING_QUARTERS = 4;
/** Each run of this many source rows shares a quarter, so quarters mix with products. */
const GROUPING_QUARTER_RUN = 7;
const GROUPING_AMOUNT = 1;
const GROUPING_EDITED_AMOUNT = 2;
const GROUPING_AMOUNT_COL = 2;
const GROUPING_QUARTER_COL = 3;
/** Source in A:D; the formula spills from F1. */
const GROUPING_FORMULA_COL = 5;
const GROUPING_KEY_FIELDS = 2;
/** One row per product, one subtotal per region and the grand total. */
const GROUPING_OUTPUT_ROWS = GROUPING_PRODUCTS + GROUPING_REGIONS + 1;
/** The two key columns, a column per quarter and the total. */
const GROUPING_OUTPUT_COLS = GROUPING_KEY_FIELDS + GROUPING_QUARTERS + 1;

function groupingQuarter(row: number): number {
  return Math.floor(row / GROUPING_QUARTER_RUN) % GROUPING_QUARTERS;
}

/** The sum of the amounts after the timed edit, which raises the first one. */
function groupingEditedTotal(rows: number): number {
  return rows * GROUPING_AMOUNT + GROUPING_EDITED_AMOUNT - GROUPING_AMOUNT;
}

/** The first quarter's share of the edited total; the edited first row is in it. */
function groupingFirstQuarterShare(rows: number): number {
  let firstQuarter = GROUPING_EDITED_AMOUNT - GROUPING_AMOUNT;
  for (let row = 0; row < rows; row++) {
    if (groupingQuarter(row) === 0) firstQuarter += GROUPING_AMOUNT;
  }
  return firstQuarter / groupingEditedTotal(rows);
}

/**
 * Source rows in A:D: region text `R0`…`R9`, product text `P00`…`P99` (each
 * product in one region), the amount, and quarter text `Q0`…`Q3`. `formula`
 * goes in F1; the timed run edits the first amount.
 */
function groupingFixture(
  rows: number,
  formula: string,
  check: (store: CellStore, sheet: number) => number,
): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(GROUPING_FORMULA_COL + GROUPING_OUTPUT_COLS, rows);
  const textColumn = (col: number, text: (row: number) => string) =>
    writeStringColumn(
      store,
      sheet,
      col,
      0,
      Array.from({ length: rows }, (_, row) => text(row)),
      0,
    );
  textColumn(0, (row) => `R${row % GROUPING_REGIONS}`);
  textColumn(1, (row) => `P${String(row % GROUPING_PRODUCTS).padStart(2, "0")}`);
  writeNumberColumn(
    store,
    sheet,
    GROUPING_AMOUNT_COL,
    0,
    numericColumn(rows, () => GROUPING_AMOUNT),
    0,
  );
  textColumn(GROUPING_QUARTER_COL, (row) => `Q${groupingQuarter(row)}`);
  store.setFormula(sheet, 0, GROUPING_FORMULA_COL, formula, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, GROUPING_AMOUNT_COL, GROUPING_EDITED_AMOUNT, 0);
      store.recompute(sheet);
    },
    check: () => check(store, sheet),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, {
      row: 0,
      col: GROUPING_AMOUNT_COL,
      value: GROUPING_AMOUNT,
    }),
  };
}

/** `GROUPBY` with SUM by region and product, with subtotals; checks the grand total. */
function groupBySumFixture(rows: number): TimedFixture {
  const last = GROUPING_OUTPUT_ROWS - 1;
  return groupingFixture(rows, `=GROUPBY(A1:B${rows},C1:C${rows},SUM,0,2)`, (store, sheet) =>
    numberAt(store, sheet, last, GROUPING_FORMULA_COL + GROUPING_KEY_FIELDS),
  );
}

/**
 * `PIVOTBY` with PERCENTOF of the grand total, by region and product with
 * subtotals and by quarter with a total; checks the first quarter's share in
 * the grand-total row.
 */
function pivotByPercentOfFixture(rows: number): TimedFixture {
  // One header row holds the quarters.
  const last = GROUPING_OUTPUT_ROWS;
  return groupingFixture(
    rows,
    `=PIVOTBY(A1:B${rows},D1:D${rows},C1:C${rows},PERCENTOF,0,2,,1,,,2)`,
    (store, sheet) => numberAt(store, sheet, last, GROUPING_FORMULA_COL + GROUPING_KEY_FIELDS),
  );
}

/**
 * Pivot sources: a header row `Field0`…`Field5`, then fields 0–3 hold the
 * row's decimal digits from the last (`row % 10`, `row / 10 % 10`, …) and
 * fields 4 and 5 hold `row + 4` and `row + 5`, as in the pivot benchmark.
 */
const PIVOT_FIELDS = 6;
const PIVOT_DIGIT_FIELDS = 4;
const PIVOT_DIGITS = 10;
const PIVOT_SUM_FIELD = 4;
const PIVOT_SUM = 0;
const PIVOT_AVERAGE = 2;
const PIVOT_AVERAGE_FIELD = 5;
/** Totals, subtotals and headers. */
const PIVOT_ALL_TOTALS = 7;
const PIVOT_NO_NAME = -1;
const PIVOT_RANGE_SOURCE = 0;
const PIVOT_OUTPUT_ROWS = 2_000;
const PIVOT_OUTPUT_COLS = 32;

function pivotSourceSheet(store: CellStore, rows: number): number {
  const sheet = store.addSheet(PIVOT_FIELDS, rows + 1);
  for (let field = 0; field < PIVOT_FIELDS; field++) {
    store.setString(sheet, 0, field, `Field${field}`, 0);
    const values = numericColumn(rows, (row) =>
      field < PIVOT_DIGIT_FIELDS
        ? Math.floor(row / PIVOT_DIGITS ** field) % PIVOT_DIGITS
        : row + field,
    );
    writeNumberColumn(store, sheet, field, 1, values, 0);
  }
  return sheet;
}

/** The packed definition `setPivots` takes, anchored at A1, with every total. */
function pivotDefinition(
  source: number,
  rows: number,
  axes: { rowFields: number[]; colFields: number[]; values: [number, number][] },
): Float64Array {
  return new Float64Array([
    0,
    PIVOT_RANGE_SOURCE,
    source,
    0,
    0,
    rows,
    PIVOT_FIELDS - 1,
    0,
    0,
    axes.rowFields.length,
    ...axes.rowFields,
    axes.colFields.length,
    ...axes.colFields,
    axes.values.length,
    ...axes.values.flatMap(([field, aggregation]) => [field, aggregation, PIVOT_NO_NAME]),
    0,
    0,
    PIVOT_ALL_TOTALS,
  ]);
}

const PIVOT_ID = "pivot";

/** A store whose engine has pivot tables: the full engine. */
type PivotStore = CellStore &
  Pick<InstanceType<typeof formulas.CellStore>, "setPivots" | "pivotStatus">;

function hasPivots(store: CellStore): store is PivotStore {
  return "setPivots" in store && "pivotStatus" in store;
}

/**
 * The pivot benchmark's pivot: three row fields, one column field, SUM and
 * AVERAGE. The timed run installs it and recalculates; restoring removes it.
 */
function pivotRebuildFixture(rows: number): TimedFixture {
  const store = new CellStore();
  assert(hasPivots(store), "the full engine has pivot tables");
  const source = pivotSourceSheet(store, rows);
  const output = store.addSheet(PIVOT_OUTPUT_COLS, PIVOT_OUTPUT_ROWS);
  store.commitSources();
  const definition = pivotDefinition(source, rows, {
    rowFields: [0, 1, 2],
    colFields: [3],
    values: [
      [PIVOT_SUM_FIELD, PIVOT_SUM],
      [PIVOT_AVERAGE_FIELD, PIVOT_AVERAGE],
    ],
  });
  // The first leaf group's SUM: below the column and value headers.
  const leafRow = PIVOT_DIGIT_FIELDS;
  return {
    store,
    run: () => {
      assert(store.setPivots(output, definition, [PIVOT_ID]), "pivot installed");
      store.recompute(output);
    },
    check: () => {
      assert(store.pivotStatus(output)[0] === 0, "pivot built");
      return numberAt(store, output, leafRow, 1);
    },
    dispose: () => store.free(),
    restore: () => {
      assert(store.setPivots(output, new Float64Array(), []), "pivot removed");
      store.recompute(output);
    },
  };
}

/** The first leaf group holds every row whose four digit fields are 0. */
function pivotRebuildOutput(rows: number): number {
  const stride = PIVOT_DIGITS ** PIVOT_DIGIT_FIELDS;
  let sum = 0;
  for (let row = 0; row < rows; row += stride) sum += row + PIVOT_SUM_FIELD;
  return sum;
}

/** Source rows of the pivot that `getpivotdata-many` reads: 100 groups of 100. */
const PIVOT_DATA_SOURCE_ROWS = 10_000;
const PIVOT_DATA_EDIT = 1;
const PIVOT_DATA_EDITED = 2;

/** The item pair that GETPIVOTDATA cell `index` names. */
function pivotDataItems(index: number): [number, number] {
  return [index % PIVOT_DIGITS, Math.floor(index / PIVOT_DIGITS) % PIVOT_DIGITS];
}

/** Sum of field 4 over the source rows whose last two digits are `first` and `second`. */
function pivotDataValue(index: number): number {
  const [first, second] = pivotDataItems(index);
  let sum = 0;
  for (let row = first + second * PIVOT_DIGITS; row < PIVOT_DATA_SOURCE_ROWS; row += 100) {
    sum += row + PIVOT_SUM_FIELD;
  }
  return sum;
}

/**
 * A pivot on sheet `Pivot` sums field 4 by fields 0 and 1; `count` cells on
 * another sheet read it with `GETPIVOTDATA`. GETPIVOTDATA is volatile, so the
 * timed edit of an unrelated cell recalculates all of them.
 */
function getPivotDataManyFixture(count: number): TimedFixture {
  const store = new CellStore();
  assert(hasPivots(store), "the full engine has pivot tables");
  const source = pivotSourceSheet(store, PIVOT_DATA_SOURCE_ROWS);
  const pivot = store.addSheet(PIVOT_OUTPUT_COLS, PIVOT_OUTPUT_ROWS);
  const calc = store.addSheet(2, count);
  store.setSheetName(pivot, "pivot", "Pivot");
  store.commitSources();
  assert(
    store.setPivots(
      pivot,
      pivotDefinition(source, PIVOT_DATA_SOURCE_ROWS, {
        rowFields: [0, 1],
        colFields: [],
        values: [[PIVOT_SUM_FIELD, PIVOT_SUM]],
      }),
      [PIVOT_ID],
    ),
    "pivot installed",
  );
  store.recompute(pivot);
  store.setNumber(calc, 0, 0, PIVOT_DATA_EDIT, 0);
  for (let index = 0; index < count; index++) {
    const [first, second] = pivotDataItems(index);
    store.setFormula(
      calc,
      index,
      1,
      `=GETPIVOTDATA("Sum of Field4",Pivot!$A$1,"Field0",${first},"Field1",${second})`,
      0,
    );
  }
  store.recompute(calc);
  return {
    store,
    run: () => {
      store.setNumber(calc, 0, 0, PIVOT_DATA_EDITED, 0);
      store.recompute(calc);
    },
    check: () => numberAt(store, calc, count - 1, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, calc, { row: 0, col: 0, value: PIVOT_DATA_EDIT }),
  };
}

const ANALYSIS_PREFIX = "ab";

/**
 * One formula per row with four analysis functions: SUMSQ, AGGREGATE (SUM,
 * ignoring errors), FORECAST.LINEAR and TEXTBEFORE. Each reads `$C$1`, so the
 * timed edit recalculates all of them. FORECAST.LINEAR fits `$A$2:$A$3` (2, 3)
 * over `$A$1:$A$2` (1, 2), the line y = x + 1.
 */
function analysisCallsFixture(count: number): TimedFixture {
  return shapeRowsFixture(
    count,
    numbersInA(),
    (row) =>
      `=SUMSQ(A${row + 1},$C$1)+AGGREGATE(9,6,A${row + 1},$C$1)` +
      `+FORECAST.LINEAR(A${row + 1},$A$2:$A$3,$A$1:$A$2)` +
      `+LEN(TEXTBEFORE("${ANALYSIS_PREFIX}-"&A${row + 1}&$C$1,"-"))`,
    SHAPE_SCALE,
    SHAPE_EDITED_SCALE,
    (store, sheet) => numberAt(store, sheet, count - 1, 1),
  );
}

/** The last formula, after the edit: its row holds `count` and `$C$1` holds the edited scale. */
function analysisCallsOutput(count: number): number {
  const scale = SHAPE_EDITED_SCALE;
  const sumOfSquares = count * count + scale * scale;
  const sum = count + scale;
  const forecast = count + 1;
  return sumOfSquares + sum + forecast + ANALYSIS_PREFIX.length;
}

function fullEngineRowFixture(id: string, size: number): TimedFixture {
  switch (id) {
    case "groupby-sum":
      return groupBySumFixture(size);
    case "pivotby-percentof":
      return pivotByPercentOfFixture(size);
    case "pivot-rebuild":
      return pivotRebuildFixture(size);
    case "getpivotdata-many":
      return getPivotDataManyFixture(size);
    case "analysis-calls":
      return analysisCallsFixture(size);
    default:
      throw new Error(`unknown formula fixture: ${id}`);
  }
}

/**
 * The version-history diff kernel on the version-history benchmark's sheet:
 * 5,000 rows by 20 columns, with 12,000 logged writes. The timed run diffs one
 * page of 1,000 changes, as a diff request does: it creates the kernel, logs
 * the writes, and compares the windows of both versions until the page is
 * full. The engine's window bytes are captured at setup, so the row times the
 * kernel only.
 */
const HISTORY_ROWS = 5_000;
const HISTORY_COLS = 20;
const HISTORY_CELLS = HISTORY_ROWS * HISTORY_COLS;
const HISTORY_WRITES = 12_000;
const HISTORY_AUTHORS = 8;
/** One diff page; it is also the number of changed cells, so the page ends at the last one. */
const HISTORY_PAGE = 1_000;
/** Changed cell `k` is in row `HISTORY_CHANGE_STRIDE * k + HISTORY_CHANGE_ROW`. */
const HISTORY_CHANGE_STRIDE = 5;
const HISTORY_CHANGE_ROW = 2;
const HISTORY_CHANGE_COL_STRIDE = 7;
const HISTORY_CHANGE = 0.5;
/** Earlier writes land on row `(i * HISTORY_WRITE_STRIDE) % HISTORY_ROWS`; prime, so they spread. */
const HISTORY_WRITE_STRIDE = 7_919;
/** The version-history diff reads windows of about this many cells. */
const HISTORY_WINDOW_CELLS = 65_536;

interface HistoryWrite {
  row: number;
  col: number;
  author: number;
}

function historyChange(index: number): HistoryWrite {
  return {
    row: HISTORY_CHANGE_STRIDE * index + HISTORY_CHANGE_ROW,
    col: (index * HISTORY_CHANGE_COL_STRIDE) % HISTORY_COLS,
    author: index % HISTORY_AUTHORS,
  };
}

/** Scattered writes first, then the write of each changed cell, so its author is the last one. */
function historyWrites(): HistoryWrite[] {
  const scattered = HISTORY_WRITES - HISTORY_PAGE;
  return [
    ...Array.from({ length: scattered }, (_, index) => ({
      row: (index * HISTORY_WRITE_STRIDE) % HISTORY_ROWS,
      col: index % HISTORY_COLS,
      author: index % HISTORY_AUTHORS,
    })),
    ...Array.from({ length: HISTORY_PAGE }, (_, index) => historyChange(index)),
  ];
}

/** Each change counts its cell's position plus its author times the cell count. */
function historyChangeChecksum(row: number, col: number, author: number): number {
  return row * HISTORY_COLS + col + author * HISTORY_CELLS;
}

function historyDiffOutput(): number {
  let checksum = 0;
  for (let index = 0; index < HISTORY_PAGE; index++) {
    const change = historyChange(index);
    checksum += historyChangeChecksum(change.row, change.col, change.author);
  }
  return checksum;
}

/** A sheet of 5,000 × 20 numbers, column by column. */
function historyVersion(changes: readonly HistoryWrite[]): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(HISTORY_COLS, HISTORY_ROWS);
  for (let col = 0; col < HISTORY_COLS; col++) {
    writeNumberColumn(
      store,
      sheet,
      col,
      0,
      numericColumn(HISTORY_ROWS, (row) => row * HISTORY_COLS + col),
      0,
    );
  }
  for (const change of changes) {
    store.setNumber(
      sheet,
      change.row,
      change.col,
      change.row * HISTORY_COLS + change.col + HISTORY_CHANGE,
      0,
    );
  }
  return { store, sheet };
}

interface HistoryWindow {
  row0: number;
  rows: number;
  before: Uint8Array;
  after: Uint8Array;
}

function historyWindowBytes(
  version: { store: CellStore; sheet: number },
  row0: number,
  rows: number,
): Uint8Array {
  const range = version.store.captureRange(version.sheet, row0, 0, rows, HISTORY_COLS);
  assert(range !== undefined, "history window captured");
  try {
    return range.exportMemoryState(version.sheet);
  } finally {
    range.free();
  }
}

function historyDiffFixture(): TimedFixture {
  const before = historyVersion([]);
  const after = historyVersion(Array.from({ length: HISTORY_PAGE }, (_, k) => historyChange(k)));
  const windowRows = Math.floor(HISTORY_WINDOW_CELLS / HISTORY_COLS);
  const windows: HistoryWindow[] = [];
  for (let row0 = 0; row0 < HISTORY_ROWS; row0 += windowRows) {
    const rows = Math.min(windowRows, HISTORY_ROWS - row0);
    windows.push({
      row0,
      rows,
      before: historyWindowBytes(before, row0, rows),
      after: historyWindowBytes(after, row0, rows),
    });
  }
  before.store.free();
  const writes = historyWrites();
  const noStyles = new Uint32Array();
  let checksum = Number.NaN;
  return {
    store: after.store,
    run: () => {
      const kernel = new historyKernel.DiffKernel(HISTORY_PAGE);
      try {
        const slot = kernel.addSheet(HISTORY_ROWS, HISTORY_COLS, true);
        for (const write of writes) {
          kernel.touch(slot, write.row, write.col, write.row, write.col, write.author);
        }
        kernel.setStyles(noStyles, noStyles);
        for (const window of windows) {
          assert(kernel.loadAfter(window.after), "later window loaded");
          assert(kernel.loadBefore(window.before), "earlier window loaded");
          const cells = window.rows * HISTORY_COLS;
          const next = kernel.compare(
            slot,
            true,
            0,
            0,
            window.rows,
            HISTORY_COLS,
            window.row0,
            0,
            window.row0,
            0,
            0,
          );
          if (next < cells) break;
        }
        const rows = kernel.pageRows();
        const cols = kernel.pageCols();
        const authors = kernel.pageAuthors();
        assert(
          kernel.pageSheets().length === rows.length &&
            kernel.pageBeforeRows().length === rows.length &&
            kernel.pageBeforeCols().length === rows.length &&
            kernel.pageFlags().length === rows.length,
          "page columns have one entry per change",
        );
        checksum = 0;
        for (const [index, row] of rows.entries()) {
          checksum += historyChangeChecksum(row, cols[index] ?? 0, authors[index] ?? 0);
        }
      } finally {
        kernel.free();
      }
    },
    check: () => checksum,
    dispose: () => after.store.free(),
    // Each run builds and frees its own kernel; the versions stay unchanged.
    restore: () => undefined,
  };
}

/** Even rows bind one name, odd rows bind three that build on each other. */
function letManyFormula(row: number): string {
  const source = `A${row + 1}*$C$1`;
  return row % 2 === 0 ? `=LET(x,${source},x+x+x)` : `=LET(x,${source},y,x+1,z,y*x,x+y+z)`;
}

/**
 * Rows for how functions read ranges: INDEX/MATCH, RANK and LARGE filled
 * down, SORT(UNIQUE(FILTER())), SUBTOTAL over a filtered column, and one
 * sparse block written during a page load.
 */
const INDEX_MATCH_VALUE_SCALE = 10;
/** Lookups in `index-match-many`. Each reads a 100,000-row table, so a few hundred is enough. */
/**
 * Rows of `rank-many`. Every formula reads the whole column, so the work grows with the square.
 */
/** The `rank-many` edit moves A1 below every other value. */
const RANK_MANY_EDITED_FIRST = -1;
/** `sort-unique-filter` keys cycle through this many labels (a prime, so a row step visits all). */
const SORT_UNIQUE_KEYS = 997;
const SORT_UNIQUE_STEP = 7_919;
/** The timed edit keeps only the rows before this one. */
const SORT_UNIQUE_EDITED_ROWS = 500;
/**
 * `sort-mixed-blanks` cycles through a number, a text, a logical value and a
 * blank cell. Numbers and labels follow a prime step, so the column is not
 * already in order.
 */
const SORT_MIXED_KINDS = 4;
const SORT_MIXED_STEP = 7_919;
const SORT_MIXED_NUMBERS = 2_000;
const SORT_MIXED_LABELS = 997;
/** Logical values are TRUE in one row of this many. */
const SORT_MIXED_TRUE_EVERY = 8;
/** The timed edit writes this number into A1. */
const SORT_MIXED_EDITED_FIRST = 12_345;
/**
 * The `sort-rows-*` rows sort one column through `sortRowsMulti`, ascending
 * then descending. Values follow a prime step and repeat, so many rows tie.
 */
const SORT_ROWS_STEP = 7_919;
const SORT_ROWS_LABELS = 5_000;
const SORT_ROWS_LABEL_DIGITS = 5;
const SORT_ROWS_NUMBERS = 1_000;
const SORT_ROWS_NUMBER_SCALE = 4;
/** The order digest is a weighted sum modulo this prime. */
const SORT_ROWS_DIGEST_MODULUS = 1_000_000_007;
/** `subtotal-filtered` hides every other block of this many rows. */
const SUBTOTAL_BLOCK_ROWS = 10;
const SUBTOTAL_EDITED_FIRST = 2;
const SPARSE_PAGE_COLUMNS = 10;
/** One cell in this many is blank, so the block is sparse. */
const SPARSE_PAGE_BLANK_EVERY = 10;
const SPARSE_PAGE_LABELS = 97;
const KIND_NUMBER = 1;
const KIND_STRING = 2;

function sortUniqueKey(row: number): string {
  return `k${(row * SORT_UNIQUE_STEP) % SORT_UNIQUE_KEYS}`;
}

/** First and last of the sorted distinct keys of the rows before `rows`, and their count. */
function sortUniqueOutput(rows: number): string {
  const keys = [...new Set(Array.from({ length: rows }, (_, row) => sortUniqueKey(row)))].sort();
  return `${keys[0]}:${keys.at(-1)}:${keys.length}`;
}

/** The `sort-mixed-blanks` cell of one row; `null` is a blank cell. */
function sortMixedValue(row: number): number | string | boolean | null {
  const step = row * SORT_MIXED_STEP;
  switch (row % SORT_MIXED_KINDS) {
    case 0:
      return (step % SORT_MIXED_NUMBERS) - SORT_MIXED_NUMBERS / 2;
    case 1:
      return `t${step % SORT_MIXED_LABELS}`;
    case 2:
      return row % SORT_MIXED_TRUE_EVERY === 2;
    default:
      return null;
  }
}

/**
 * The sorted spill's text count and the sum of its other values, TRUE as 1
 * and a blank as 0, after the edit. Neither depends on the order: a blank
 * compares equal to 0, "" and FALSE at once, so the order of this column
 * depends on the sort algorithm, and the row checks only what it must keep.
 */
function sortMixedBlanksOutput(count: number): string {
  let texts = 0;
  let sum = SORT_MIXED_EDITED_FIRST;
  for (let row = 1; row < count; row++) {
    const value = sortMixedValue(row);
    if (typeof value === "string") texts++;
    else if (typeof value === "number") sum += value;
    else if (value === true) sum++;
  }
  return `${texts}:${sum}`;
}

/** A label without hyphens or case, so its collation order is its code order. */
function sortRowsLabel(row: number): string {
  const label = (row * SORT_ROWS_STEP) % SORT_ROWS_LABELS;
  return `L${String(label).padStart(SORT_ROWS_LABEL_DIGITS, "0")}`;
}

function sortRowsNumber(row: number): number {
  return ((row * SORT_ROWS_STEP) % SORT_ROWS_NUMBERS) / SORT_ROWS_NUMBER_SCALE;
}

/** First, middle and last row of a sorted order and a weighted sum of all of it. */
function sortRowsDigest(order: ArrayLike<number>): string {
  let sum = 0;
  for (let position = 0; position < order.length; position++) {
    sum = (sum + (position + 1) * (order[position] ?? 0)) % SORT_ROWS_DIGEST_MODULUS;
  }
  const middle = order[Math.floor(order.length / 2)];
  return `${order[0]}:${middle}:${order[order.length - 1]}:${sum}`;
}

/** `sortRowsOutput` results, computed once per row and size. */
const sortRowsOutputs = new Map<string, string>();

/**
 * The digests of the ascending and the descending order of `size` rows of
 * `value`: equal values keep their row order in both directions.
 */
function sortRowsOutput(size: number, value: (row: number) => number | string): string {
  const cacheKey = `${value.name}:${size}`;
  const cached = sortRowsOutputs.get(cacheKey);
  if (cached !== undefined) return cached;
  const values = Array.from({ length: size }, (_, row) => value(row));
  const rows = Array.from({ length: size }, (_, row) => row);
  const ascending = [...rows].sort((left, right) => {
    const a = values[left]!;
    const b = values[right]!;
    return a < b ? -1 : a > b ? 1 : left - right;
  });
  const descending = [...rows].sort((left, right) => {
    const a = values[left]!;
    const b = values[right]!;
    return a > b ? -1 : a < b ? 1 : left - right;
  });
  const output = `${sortRowsDigest(ascending)}|${sortRowsDigest(descending)}`;
  sortRowsOutputs.set(cacheKey, output);
  return output;
}

function subtotalVisible(row: number): boolean {
  return Math.floor(row / SUBTOTAL_BLOCK_ROWS) % 2 === 0;
}

/** Sum of `row + 1` over the visible rows, with A1 holding `first`. */
function subtotalOutput(count: number, first: number): number {
  let total = first;
  for (let row = 1; row < count; row++) if (subtotalVisible(row)) total += row + 1;
  return total;
}

/** The value a `sparse-page-write` block holds at one offset: blank, a number or a label. */
function sparsePageValue(offset: number): number | string | null {
  if (offset % SPARSE_PAGE_BLANK_EVERY === 0) return null;
  return offset % 2 === 0 ? offset : `label${offset % SPARSE_PAGE_LABELS}`;
}

function sparsePageOutput(rows: number): string {
  const last = (rows - 1) * SPARSE_PAGE_COLUMNS;
  return `${String(sparsePageValue(last + SPARSE_PAGE_COLUMNS - 2))}:${String(sparsePageValue(last + SPARSE_PAGE_COLUMNS - 1))}`;
}

/**
 * `formulas` INDEX/MATCH lookups over a `rows`-row table: keys in A, values in
 * B. Each key is `$C$1` plus the formula's row, so the timed edit recomputes
 * every lookup, and each match lands near the top of the table.
 */
function indexMatchFixture(formulas: number, rows: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, rows);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(rows, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(rows, (row) => (row + 1) * INDEX_MATCH_VALUE_SCALE),
    0,
  );
  store.setNumber(sheet, 0, 2, SHAPE_SCALE, 0);
  for (let row = 0; row < formulas; row++) {
    store.setFormula(
      sheet,
      row,
      3,
      `=INDEX($B$1:$B$${rows},MATCH($C$1+${row},$A$1:$A$${rows},0))`,
      0,
    );
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, SHAPE_EDITED_SCALE, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, formulas - 1, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: SHAPE_SCALE }),
  };
}

/**
 * RANK.EQ in even rows and LARGE in odd rows, each over the whole column, so
 * one edit of A1 recomputes all of them: the fill-down shape that reads the
 * column once per formula.
 */
function rankManyFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(
      sheet,
      row,
      1,
      row % 2 === 0 ? `=RANK.EQ(A${row + 1},$A$1:$A$${count})` : `=LARGE($A$1:$A$${count},ROW())`,
      0,
    );
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, RANK_MANY_EDITED_FIRST, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 1)}:${numberAt(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

/**
 * One `SORT(UNIQUE(FILTER()))` over text keys in A, kept while B is below
 * `$D$1`. The timed edit narrows the filter to the first rows.
 */
function sortUniqueFilterFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  for (let row = 0; row < count; row++) store.setString(sheet, row, 0, sortUniqueKey(row), 0);
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  store.setNumber(sheet, 0, 3, count, 0);
  store.setFormula(sheet, 0, 2, `=SORT(UNIQUE(FILTER(A1:A${count},B1:B${count}<$D$1)))`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 3, SORT_UNIQUE_EDITED_ROWS, 0);
      store.recompute(sheet);
    },
    check: () => {
      const last = SORT_UNIQUE_EDITED_ROWS - 1;
      const spilled = store.spillAnchorRow(sheet, last, 2) === 0 ? SORT_UNIQUE_EDITED_ROWS : 0;
      return `${textAt(store, sheet, 0, 2) ?? ""}:${textAt(store, sheet, last, 2) ?? ""}:${spilled}`;
    },
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 3, value: count }),
  };
}

/**
 * `=SORT(A1:An)` over numbers, text, logical values and blank cells in turn.
 * The timed edit changes the number in A1.
 */
function sortMixedBlanksFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  for (let row = 0; row < count; row++) {
    const value = sortMixedValue(row);
    if (typeof value === "number") store.setNumber(sheet, row, 0, value, 0);
    else if (typeof value === "string") store.setString(sheet, row, 0, value, 0);
    else if (typeof value === "boolean") store.setBool(sheet, row, 0, value, 0);
  }
  store.setFormula(sheet, 0, 2, `=SORT(A1:A${count})`, 0);
  store.recompute(sheet);
  const first = sortMixedValue(0);
  assert(typeof first === "number", "sort-mixed-blanks: A1 holds a number");
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, SORT_MIXED_EDITED_FIRST, 0);
      store.recompute(sheet);
    },
    check: () => {
      let texts = 0;
      let sum = 0;
      for (let row = 0; row < count; row++) {
        const cell = store.getCell(sheet, row, 2);
        if (cell.string === undefined) sum += cell.num;
        else texts++;
        cell.free();
      }
      return `${texts}:${sum}`;
    },
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: first }),
  };
}

/**
 * Sorts the rows of one column of `value`s through `sortRowsMulti`,
 * ascending then descending, as the sort command does. Sorting changes no
 * cell, so every run repeats the same work.
 */
function sortRowsFixture(count: number, value: (row: number) => number | string): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, count);
  const values = Array.from({ length: count }, (_, row) => value(row));
  if (typeof values[0] === "string") {
    writeStringColumn(store, sheet, 0, 0, values as string[], 0);
  } else {
    writeNumberColumn(store, sheet, 0, 0, Float64Array.from(values as number[]), 0);
  }
  const column = Uint32Array.of(0);
  const allRows = new Uint32Array(0);
  let ascending: Uint32Array = new Uint32Array(0);
  let descending: Uint32Array = new Uint32Array(0);
  return {
    store,
    run: () => {
      ascending = store.sortRowsMulti(sheet, column, Uint8Array.of(1), allRows);
      descending = store.sortRowsMulti(sheet, column, Uint8Array.of(0), allRows);
    },
    check: () => `${sortRowsDigest(ascending)}|${sortRowsDigest(descending)}`,
    dispose: () => store.free(),
    restore: () => {},
  };
}

/** `SUBTOTAL(109)` over a column whose filter hides every other block of rows. */
function subtotalFilteredFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  const hidden: number[] = [];
  for (let start = SUBTOTAL_BLOCK_ROWS; start < count; start += 2 * SUBTOTAL_BLOCK_ROWS) {
    hidden.push(start, Math.min(start + SUBTOTAL_BLOCK_ROWS, count) - 1);
  }
  assert(
    store.setHiddenRows(sheet, new Uint32Array(), Uint32Array.from(hidden)),
    "subtotal-filtered: hidden rows rejected",
  );
  store.setFormula(sheet, 0, 1, `=SUBTOTAL(109,A1:A${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, SUBTOTAL_EDITED_FIRST, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, 0, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

/**
 * One sparse block of `rows` × 10 cells written inside a page load, as
 * snapshot hydration and datasource pages write: numbers and labels, with
 * every tenth cell blank. The inputs are built before the timed write.
 */
function sparsePageWriteFixture(rows: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(SPARSE_PAGE_COLUMNS, rows);
  const offsets: number[] = [];
  const kinds: number[] = [];
  const numbers: number[] = [];
  const texts: string[] = [];
  for (let offset = 0; offset < rows * SPARSE_PAGE_COLUMNS; offset++) {
    const value = sparsePageValue(offset);
    if (value === null) continue;
    offsets.push(offset);
    kinds.push(typeof value === "number" ? KIND_NUMBER : KIND_STRING);
    numbers.push(typeof value === "number" ? value : 0);
    if (typeof value === "string") texts.push(value);
  }
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(texts.join(""));
  const textOffsets = new Uint32Array(texts.length + 1);
  for (let index = 0; index < texts.length; index++) {
    textOffsets[index + 1] = (textOffsets[index] ?? 0) + encoder.encode(texts[index]).length;
  }
  const entryOffsets = Uint32Array.from(offsets);
  const entryKinds = Uint8Array.from(kinds);
  const entryNumbers = Float64Array.from(numbers);
  const styles = new Uint32Array(offsets.length);
  const none = new Uint32Array();
  return {
    store,
    run: () => {
      store.beginPageLoad();
      const status = store.setSparseBlock(
        sheet,
        0,
        0,
        rows,
        SPARSE_PAGE_COLUMNS,
        entryOffsets,
        entryKinds,
        entryNumbers,
        textBytes,
        textOffsets,
        styles,
        none,
        [],
        none,
        none,
      );
      store.commitSources();
      assert(status === 0, `sparse-page-write: block rejected with ${status}`);
    },
    check: () => {
      const last = rows - 1;
      const number = numberAt(store, sheet, last, SPARSE_PAGE_COLUMNS - 2);
      return `${number}:${textAt(store, sheet, last, SPARSE_PAGE_COLUMNS - 1) ?? ""}`;
    },
    dispose: () => store.free(),
  };
}

/**
 * A LET in every row, as modern workbooks write them. The timed edit changes
 * the shared scale, so every LET recalculates.
 */
function letManyFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  store.setNumber(sheet, 0, 2, LET_MANY_SCALE, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, letManyFormula(row), 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, LET_MANY_EDITED_SCALE, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: LET_MANY_SCALE }),
  };
}

/** The LET binding is used three times (`x+x+x`), so a re-evaluated binding costs that multiple. */
const LET_REPEAT_FACTOR = 3;

function letRepeatFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numericColumn(count, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
  store.setNumber(sheet, 0, 2, count, 0);
  store.setFormula(sheet, 0, 3, `=LET(x,XLOOKUP($C$1,A1:A${count},B1:B${count}),x+x+x)`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, count - 1, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 3)}:${numberAt(store, sheet, 0, 2)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: count }),
  };
}

function iterativeFinanceFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  const cashflows = [-70_000, 12_000, 15_000, 18_000, 21_000, 26_000];
  for (const [row, value] of cashflows.entries()) store.setNumber(sheet, row, 0, value, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, "=IRR($A$1:$A$6)+RATE(10,-150,1000)", 0);
  }
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => numberAt(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function incrementalDependencyClosureFixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numericColumn(count, (row) => row),
    0,
  );
  setFormulas(store, sheet, dependencyClosureFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 10, 0);
      store.recompute(sheet);
    },
    check: () => `${numberAt(store, sheet, 0, 2)}:${numberAt(store, sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

/**
 * Rows for paged storage: single-cell reads through formulas, a row insert
 * near the top, the loaded-range check, and page loads through a full cache.
 * Every paged sheet loads its values as clean pages, the way datasource pages
 * arrive, and keeps some local edits on top.
 */
const PAGED_CHUNK_ROWS = 4_096;
/** Local edits spread over column B of the insert and range-check sheets. */
const PAGED_DIRTY_CELLS = 1_000;
const PAGED_DIRTY_OFFSET = 0.5;
const PAGED_INSERT_AT = 10;
const PAGED_READ_SCALE = 2;
const PAGED_READ_EDITED_SCALE = 3;
/** The eviction row loads 4-row pages through a cache that holds 512 of them. */
const PAGED_EVICTION_CHUNK_ROWS = 4;
const PAGED_EVICTION_RESIDENT = 512;
/** Pages a viewport band pins at the top of the eviction sheet. */
const PAGED_EVICTION_PINNED = 16;
/** Bytes of one resident page: kind, payload and style per row, plus the loaded bits. */
const PAGED_EVICTION_PAGE_BYTES =
  PAGED_EVICTION_CHUNK_ROWS *
    (Uint8Array.BYTES_PER_ELEMENT +
      Float64Array.BYTES_PER_ELEMENT +
      Uint32Array.BYTES_PER_ELEMENT) +
  BigUint64Array.BYTES_PER_ELEMENT;

/** Column A holds `row`, column B `row + 1`, and `$C$1` the scale. */
function pagedCellReadsOutput(count: number): number {
  const last = count - 1;
  return last + (last + 1) * PAGED_READ_EDITED_SCALE;
}

/** Old row 10 of column A one row lower, and every loaded and edited cell kept. */
function pagedInsertRowOutput(rows: number): string {
  return `${PAGED_INSERT_AT}:${rows * 2}:${PAGED_DIRTY_CELLS}`;
}

function pagedEvictionOutput(pages: number): string {
  return `${PAGED_EVICTION_RESIDENT}:${pages * PAGED_EVICTION_CHUNK_ROWS - 1}:0`;
}

/**
 * A paged sheet whose first `loaded` columns hold `row + col` in clean,
 * loaded pages. A budget of 0 keeps every page resident.
 */
function loadedPagedSheet(
  cols: number,
  rows: number,
  loaded: number,
  chunkRows: number,
  byteBudget: number,
): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addPagedSheet(cols, rows, chunkRows, byteBudget, 0);
  store.beginPageLoad();
  for (let col = 0; col < loaded; col++) {
    writeNumberColumn(
      store,
      sheet,
      col,
      0,
      numericColumn(rows, (row) => row + col),
      0,
    );
  }
  store.commitSources();
  return { store, sheet };
}

/** `PAGED_DIRTY_CELLS` local edits spread evenly down column B. */
function addPagedEdits(store: CellStore, sheet: number, rows: number): void {
  for (let index = 0; index < PAGED_DIRTY_CELLS; index++) {
    const row = Math.floor((index * rows) / PAGED_DIRTY_CELLS);
    store.setNumber(sheet, row, 1, row + 1 + PAGED_DIRTY_OFFSET, 0);
  }
}

/**
 * `=A{r}+B{r}*$C$1` in every row of a paged sheet: each formula reads two
 * loaded cells and one edited cell, one at a time. The timed edit changes the
 * scale, so every formula recalculates.
 */
function pagedCellReadsFixture(count: number): TimedFixture {
  const { store, sheet } = loadedPagedSheet(4, count, 2, PAGED_CHUNK_ROWS, 0);
  store.setNumber(sheet, 0, 2, PAGED_READ_SCALE, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 3, `=A${row + 1}+B${row + 1}*$C$1`, 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, PAGED_READ_EDITED_SCALE, 0);
      store.recompute(sheet);
    },
    check: () => numberAt(store, sheet, count - 1, 3),
    dispose: () => store.free(),
    restore: restoreNumber(store, sheet, { row: 0, col: 2, value: PAGED_READ_SCALE }),
  };
}

/** Two loaded columns of `rows` rows, with local edits in column B. */
function editedPagedSheet(rows: number): { store: CellStore; sheet: number } {
  const paged = loadedPagedSheet(2, rows, 2, PAGED_CHUNK_ROWS, 0);
  addPagedEdits(paged.store, paged.sheet, rows);
  return paged;
}

function pagedInsertRowCheck(store: CellStore, sheet: number): string {
  const stats = store.pagedStats(sheet);
  return `${numberAt(store, sheet, PAGED_INSERT_AT + 1, 0)}:${stats[1]}:${stats[2]}`;
}

/** One row inserted near the top of a paged sheet; removing it again restores the sheet. */
function pagedInsertRowFixture(rows: number): TimedFixture {
  const { store, sheet } = editedPagedSheet(rows);
  return {
    store,
    run: () => assert(store.addRows(sheet, PAGED_INSERT_AT, 1), "paged-insert-row: insert"),
    check: () => pagedInsertRowCheck(store, sheet),
    dispose: () => store.free(),
    restore: () => assert(store.removeRows(sheet, PAGED_INSERT_AT, 1), "paged-insert-row: restore"),
  };
}

/** Whether every cell of both columns is loaded. The check changes nothing to restore. */
function pagedRangeLoadedFixture(rows: number): TimedFixture {
  const { store, sheet } = editedPagedSheet(rows);
  let loaded = false;
  return {
    store,
    run: () => {
      loaded = store.rangeFullyLoaded(sheet, 0, 0, rows - 1, 1);
    },
    check: () => (loaded ? 1 : 0),
    dispose: () => store.free(),
    restore: () => {},
  };
}

/**
 * One page load of `pages` 4-row pages through a cache that holds 512, with
 * the top 16 pages pinned by a viewport band, so every unpinned page the load
 * writes evicts the oldest one. The fixture starts in the state a run leaves:
 * the pinned pages and the newest pages resident. So a run needs no restore.
 */
function pagedEvictionFixture(pages: number): TimedFixture {
  const rows = pages * PAGED_EVICTION_CHUNK_ROWS;
  const store = new CellStore();
  const sheet = store.addPagedSheet(
    1,
    rows,
    PAGED_EVICTION_CHUNK_ROWS,
    PAGED_EVICTION_RESIDENT * PAGED_EVICTION_PAGE_BYTES,
    0,
  );
  const pinnedRows = PAGED_EVICTION_PINNED * PAGED_EVICTION_CHUNK_ROWS;
  store.pinViewportBands(sheet, Uint32Array.of(0, pinnedRows, 0, 1));
  const values = numericColumn(rows, (row) => row);
  const load = (start: number, end: number) => {
    store.beginPageLoad();
    writeNumberColumn(store, sheet, 0, start, values.subarray(start, end), 0);
    store.commitSources();
  };
  load(0, pinnedRows);
  load(rows - (PAGED_EVICTION_RESIDENT - PAGED_EVICTION_PINNED) * PAGED_EVICTION_CHUNK_ROWS, rows);
  return {
    store,
    run: () => load(0, rows),
    check: () =>
      `${store.pagedStats(sheet)[0]}:${numberAt(store, sheet, rows - 1, 0)}:${numberAt(store, sheet, 0, 0)}`,
    dispose: () => store.free(),
    restore: () => {},
  };
}

/** Build a fresh fixture. Construction and checks are outside the timed run. */
export function createFormulaFixture(id: string, size: number, rangeSize?: number): TimedFixture {
  const lookup = LOOKUP_VARIANTS.find(
    (variant) => id === variant.id || id === `${variant.id}${LOOKUP_EDIT_SUFFIX}`,
  );
  if (lookup !== undefined)
    return lookupFixture(
      size,
      id.endsWith(LOOKUP_EDIT_SUFFIX) ? "key-edit" : "first-recompute",
      lookup,
    );
  switch (id) {
    case "round-many":
    case "concat-many":
    case "offset-many":
    case "indirect-many":
    case "let-calls":
      return shapeRowFixture(id, size);
    case "name-define":
    case "row-insert-names":
    case "table-append-row":
    case "sort-formula-column":
    case "parse-load-qualified":
    case "parse-load-table":
    case "memory-import":
      return bindingRowFixture(id, size);
    case "map-lambda":
    case "reduce-lambda":
    case "byrow-lambda":
    case "lambda-call":
    case "named-lambda":
    case "measure-pivot":
      return closureRowFixture(id, size);
    case "groupby-sum":
    case "pivotby-percentof":
    case "pivot-rebuild":
    case "getpivotdata-many":
    case "analysis-calls":
      return fullEngineRowFixture(id, size);
    case "paged-cell-reads":
      return pagedCellReadsFixture(size);
    case "paged-insert-row":
      return pagedInsertRowFixture(size);
    case "paged-range-loaded":
      return pagedRangeLoadedFixture(size);
    case "paged-eviction":
      return pagedEvictionFixture(size);
    case "rank-many":
      return rankManyFixture(size);
    case "sort-unique-filter":
      return sortUniqueFilterFixture(size);
    case "subtotal-filtered":
      return subtotalFilteredFixture(size);
    case "sort-mixed-blanks":
      return sortMixedBlanksFixture(size);
    case "sort-rows-labels":
      return sortRowsFixture(size, sortRowsLabel);
    case "sort-rows-numbers":
      return sortRowsFixture(size, sortRowsNumber);
    case "sparse-page-write":
      return sparsePageWriteFixture(size);
    case "index-match-many":
      assert(rangeSize !== undefined, "INDEX/MATCH range size");
      return indexMatchFixture(size, rangeSize);
    case "history-diff":
      return historyDiffFixture();
    case "independent-parse-load":
      return independentLoadFixture(size);
    case "independent-first-recompute":
      return independentRecomputeFixture(size);
    case "linear-chain":
      return chainFixture(size);
    case "wide-fan-out-edit":
      return fanOutEditFixture(size);
    case "scalar-edit-affects-1":
      return fanOutEditFixture(size);
    case "scalar-edit-affects-1000":
      return fanOutEditFixture(size);
    case "scalar-edit-affects-100000":
      return fanOutEditFixture(size);
    case "formula-constant-edit":
      return constantEditFixture(size);
    case "diamond-edit":
      return diamondFixture(size);
    case "shared-range-edit":
      return sharedRangeFixture(size);
    case "distinct-range-edit":
      return distinctRangeFixture(size);
    case "cross-sheet-range-edit":
      return crossSheetFixture(size);
    case "topology-remove-add":
      return topologyFixture(size);
    case "cycles":
      return cycleFixture(size);
    case "removed-sheet-ref":
      return refRemovalFixture(size);
    case "error-propagation":
      return errorPropagationFixture(size);
    case "criteria-range-edit":
      return criteriaRangeFixture(size);
    case "lookup-range-edit":
      return lookupRangeFixture(size);
    case "xlookup-mixed-exact":
      return mixedLookupFixture(size);
    case "spill-filter-resize":
      return spillFilterResizeFixture(size);
    case "sumproduct-vector-edit":
      return sumProductVectorFixture(size);
    case "sumproduct-matrix-edit":
      return sumProductMatrixFixture(size);
    case "criteria-multi-range-edit":
      return criteriaMultiRangeFixture(size);
    case "sum-multi-range":
      return sumMultiRangeFixture(size);
    case "sumifs-3-criteria":
      return sumifsCriteriaFixture(size);
    case "countif-100k":
      return countifFixture(size);
    case "unicode-text-date-edit":
      return unicodeTextDateFixture(size);
    case "percentile-covariance":
      return percentileCovarianceFixture(size);
    case "let-reuse-edit":
      return letReuseFixture(size);
    case "let-repeat":
      return letRepeatFixture(size);
    case "let-many":
      return letManyFixture(size);
    case "iterative-finance":
      return iterativeFinanceFixture(size);
    case "incremental-dependency-closure-edit":
      return incrementalDependencyClosureFixture(size);
    case "spill-sequence-admission":
      return spillSequenceAdmissionFixture(size);
    case "spill-filter-same-range":
      return spillFilterSameRangeFixture(size);
    case "scalar-edit-affects-0":
      return fanOutEditFixture(size, true);
    default:
      throw new Error(`unknown formula fixture: ${id}`);
  }
}

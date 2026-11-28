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

function diamond_output(levels: number): number {
  let expected = 2;
  for (let level = 0; level < levels; level++) expected = expected + 1 + (expected + 2);
  return expected;
}

export function expectedFormulaOutput(id: string, size: number): FormulaOutput {
  const lookup = lookup_variant_output(id);
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
      return diamond_output(size);
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
      return mixed_lookup_output(size);
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
      return sumifs_criteria_total(size);
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
    case "name-define-unused":
      return size * NAME_SCALE;
    case "table-append-row":
      return ((size + 1) * (size + 2)) / 2;
    case "sort-formula-column":
      return 2 * (sorted_source_row(size, size - 1) + 1);
    case "cell-move-refs":
      return size * CELL_MOVE_SCALE;
    case "parse-load-qualified":
      return size;
    case "parse-load-table":
    case "memory-import":
      return size * 2;
    case "groupby-sum":
      return grouping_edited_total(size);
    case "pivotby-percentof":
      return grouping_first_quarter_share(size);
    case "pivot-rebuild":
      return pivot_rebuild_output(size);
    case "getpivotdata-many":
      return pivot_data_value(size - 1);
    case "getpivotdata-source-edit":
      return pivot_data_value(size - 1) + PIVOT_DATA_SOURCE_DELTA;
    case "analysis-calls":
      return analysis_calls_output(size);
    case "history-diff":
      return history_diff_output();
    case "iterative-finance":
      return 0.08663094803653158 + 0.08144165646436567;
    case "incremental-dependency-closure-edit":
      return `12:${size + 1}`;
    case "spill-sequence-admission":
      return `1:${size}:0`;
    case "spill-filter-same-range":
      return `${SAME_RANGE_EDITED_FIRST}:0`;
    case "conditional-format-window":
      return conditional_window_output(size);
    case "take-sort-filter":
      return `${take_sort_filter_first(size)}:0`;
    case "paged-cell-reads":
      return paged_cell_reads_output(size);
    case "paged-insert-row":
      return paged_insert_row_output(size);
    case "paged-range-loaded":
      return 1;
    case "paged-eviction":
      return paged_eviction_output(size);
    case "index-match-many":
      return INDEX_MATCH_VALUE_SCALE * (SHAPE_EDITED_SCALE + size - 1);
    case "rank-many":
      return `${size}:${RANK_MANY_EDITED_FIRST}`;
    case "sort-unique-filter":
      return sort_unique_output(SORT_UNIQUE_EDITED_ROWS);
    case "subtotal-filtered":
      return subtotal_output(size, SUBTOTAL_EDITED_FIRST);
    case "sort-mixed-blanks":
      return sort_mixed_blanks_output(size);
    case "sort-rows-labels":
      return sort_rows_output(size, sort_rows_label);
    case "sort-rows-numbers":
      return sort_rows_output(size, sort_rows_number);
    case "sparse-page-write":
      return sparse_page_output(size);
    case "map-lambda":
    case "lambda-call":
    case "named-lambda":
      return size * CLOSURE_EDITED_SCALE + 1;
    case "reduce-lambda":
      return (CLOSURE_EDITED_SCALE * size * (size + 1)) / 2;
    case "byrow-lambda":
      return 2 * size * CLOSURE_EDITED_SCALE;
    case "measure-pivot":
      return measure_pivot_output(size);
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

function set_formulas(store: CellStore, sheet: number, formulas: readonly FormulaCell[]): void {
  for (const formula of formulas) {
    store.setFormula(sheet, formula.row, formula.col, formula.src, 0);
  }
}

function number_at(store: CellStore, sheet: number, row: number, col: number): number {
  const cell = store.getCell(sheet, row, col);
  const value = cell.num;
  cell.free();
  return value;
}

function text_at(store: CellStore, sheet: number, row: number, col: number): string | undefined {
  const cell = store.getCell(sheet, row, col);
  const value = cell.string;
  cell.free();
  return value;
}

function numeric_column(count: number, value: (row: number) => number): Float64Array {
  return Float64Array.from({ length: count }, (_, row) => value(row));
}

function independent_load_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
    0,
  );
  const formulas = independentFormulas(count);
  return {
    store,
    run: () => set_formulas(store, sheet, formulas),
    check: () => {
      store.recompute(sheet);
      return number_at(store, sheet, count - 1, 1);
    },
    dispose: () => store.free(),
  };
}

function independent_recompute_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
    0,
  );
  set_formulas(store, sheet, independentFormulas(count));
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => number_at(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function chain_fixture(depth: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, depth);
  store.setNumber(sheet, 0, 0, 1, 0);
  set_formulas(store, sheet, linearChain(depth));
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => number_at(store, sheet, depth - 1, 0),
    dispose: () => store.free(),
  };
}

/** A1 starts at the source value; the timed edit writes the edited value to A1, or to unrelated C1. */
const FAN_OUT_SOURCE_VALUE = 1;
const FAN_OUT_EDITED_VALUE = 10;

function fan_out_edit_fixture(count: number, unrelated = false): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, Math.max(1, count));
  const edited_column = unrelated ? 2 : 0;
  store.setNumber(sheet, 0, 0, FAN_OUT_SOURCE_VALUE, 0);
  set_formulas(store, sheet, fanOutFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, edited_column, FAN_OUT_EDITED_VALUE, 0);
      store.recompute(sheet);
    },
    check: () => number_at(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      if (unrelated) store.clearCell(sheet, 0, edited_column, 0);
      else store.setNumber(sheet, 0, edited_column, FAN_OUT_SOURCE_VALUE, 0);
      store.recompute(sheet);
    },
  };
}

/** Column B holds a fill value; the timed edit rewrites the literal of one formula only. */
const CONSTANT_EDIT_FILL = 10;
const CONSTANT_EDIT_BASE = 1;
const CONSTANT_EDIT_EDITED_BASE = 2;

function constant_edit_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(count, () => CONSTANT_EDIT_FILL),
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
    check: () => `${number_at(store, sheet, 0, 2)}:${number_at(store, sheet, count - 1, 2)}`,
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
    const samples_ms: number[] = [];
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
      const elapsed_ms = now() - started;
      assert(result.status === "applied", "Grid constant edit must apply");
      assert(
        store.getCell({ sheet: "constant-edit", row: 0, col: 2 }).resolved ===
          CONSTANT_EDIT_FILL + constant,
        "Grid constant edit output",
      );
      if (sample >= 2) samples_ms.push(elapsed_ms);
    }
    const output = `${store.getCell({ sheet: "constant-edit", row: 0, col: 2 }).resolved}:${store.getCell({ sheet: "constant-edit", row: count - 1, col: 2 }).resolved}`;
    return {
      id: "grid-formula-constant-edit",
      size: count,
      samplesMs: samples_ms,
      stat: summarize(samples_ms),
      output,
    };
  } finally {
    store.dispose();
  }
}

/** Undo a timed one-cell number edit, untimed, so the next timed edit repeats the same work. */
function restore_number(
  store: CellStore,
  sheet: number,
  cell: { row: number; col: number; value: number },
): () => void {
  return () => {
    store.setNumber(sheet, cell.row, cell.col, cell.value, 0);
    store.recompute(sheet);
  };
}

function diamond_fixture(levels: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, levels);
  store.setNumber(sheet, 0, 0, 1, 0);
  set_formulas(store, sheet, diamondFormulas(levels));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => number_at(store, sheet, levels - 1, 3),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function shared_range_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, Math.max(count, 100));
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(100, () => 1),
    0,
  );
  set_formulas(store, sheet, sharedRangeFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => number_at(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function distinct_range_fixture(count: number): TimedFixture {
  const rows = count * 10;
  const store = new CellStore();
  const sheet = store.addSheet(2, rows);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(rows, () => 1),
    0,
  );
  set_formulas(store, sheet, distinctRangeFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 2, 0);
      store.recompute(sheet);
    },
    check: () => `${number_at(store, sheet, 0, 1)}:${number_at(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function cross_sheet_fixture(count: number): TimedFixture {
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
    numeric_column(100, () => 1),
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
    check: () => number_at(store, summary, count - 1, 0),
    dispose: () => store.free(),
    restore: restore_number(store, source, { row: 0, col: 0, value: 1 }),
  };
}

function topology_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
    0,
  );
  set_formulas(store, sheet, independentFormulas(count));
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
    check: () => `${number_at(store, sheet, 0, 1)}:${number_at(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
  };
}

function cycle_fixture(pairs: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, pairs);
  for (let row = 0; row < pairs; row++) {
    store.setFormula(sheet, row, 0, `=B${row + 1}`, 0);
    store.setFormula(sheet, row, 1, `=A${row + 1}`, 0);
  }
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => text_at(store, sheet, pairs - 1, 1) ?? "",
    dispose: () => store.free(),
  };
}

function ref_removal_fixture(count: number): TimedFixture {
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
    check: () => text_at(store, summary, count - 1, 0) ?? "",
    dispose: () => store.free(),
  };
}

function error_propagation_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  store.setFormula(sheet, 0, 0, "=1/0", 0);
  for (let row = 0; row < count; row++) store.setFormula(sheet, row, 1, "=$A$1", 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => text_at(store, sheet, count - 1, 1) ?? "",
    dispose: () => store.free(),
  };
}

function criteria_range_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(count, () => 1),
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
    check: () => number_at(store, sheet, 0, 2),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

function lookup_range_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(count, (row) => row * 2),
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
    check: () => number_at(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 2, value: 0 }),
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
function lookup_table_store(table_rows: number): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(4, table_rows);
  write_lookup_table(store, sheet, table_rows);
  return { store, sheet };
}

/**
 * The lookup table in a datasource-backed paged sheet: every page loaded
 * from the host and none evicted, so lookups read clean pages.
 */
function paged_lookup_table_store(table_rows: number): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addPagedSheet(4, table_rows, PAGED_CHUNK_ROWS, 0, 0);
  store.beginPageLoad();
  write_lookup_table(store, sheet, table_rows);
  store.commitSources();
  return { store, sheet };
}

/** Keys `1..=table_rows` in A, results in B. */
function write_lookup_table(store: CellStore, sheet: number, table_rows: number): void {
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(table_rows, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(table_rows, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
}

/** Zero-padded text keys stay ascending under the case-insensitive lookup comparison. */
function text_lookup_key_at(row: number): string {
  return `${TEXT_LOOKUP_KEY_PREFIX}${String(row).padStart(TEXT_LOOKUP_KEY_PADDING, "0")}`;
}

/** The query key differs from the stored key only by letter case. */
function text_lookup_query_key(row: number): string {
  return `${TEXT_LOOKUP_QUERY_PREFIX}${String(row).padStart(TEXT_LOOKUP_KEY_PADDING, "0")}`;
}

/** Sorts between the stored keys of `row` and `row + 1`, so only approximate matching can land. */
function text_lookup_between_query_key(row: number): string {
  return `${text_lookup_query_key(row)}5`;
}

/** Ascending text key column plus the same result column as the numeric table. */
function text_lookup_table_store(table_rows: number): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(4, table_rows);
  for (let row = 0; row < table_rows; row++) {
    store.setString(sheet, row, 0, text_lookup_key_at(row), 0);
  }
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(table_rows, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
    0,
  );
  return { store, sheet };
}

/** The shared key cell takes a number for numeric tables and text for text tables. */
function write_lookup_key(store: CellStore, sheet: number, key: number | string): void {
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
    table: lookup_table_store,
    formula: (table_rows) => `=VLOOKUP($C$1,A1:B${table_rows},2,FALSE)`,
    initialKey: NUMERIC_LOOKUP_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_EDITED_KEY,
    initialValue: NUMERIC_LOOKUP_INITIAL_KEY * LOOKUP_RESULT_FACTOR,
    editedValue: NUMERIC_LOOKUP_EDITED_KEY * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "vlookup-many-sorted",
    table: lookup_table_store,
    formula: (table_rows) => `=VLOOKUP($C$1,A1:B${table_rows},2,TRUE)`,
    initialKey: NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY,
    initialValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY) * LOOKUP_RESULT_FACTOR,
    editedValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "xlookup-many",
    table: lookup_table_store,
    formula: (table_rows) => `=XLOOKUP($C$1,A1:A${table_rows},B1:B${table_rows})`,
    initialKey: NUMERIC_LOOKUP_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_EDITED_KEY,
    initialValue: NUMERIC_LOOKUP_INITIAL_KEY * LOOKUP_RESULT_FACTOR,
    editedValue: NUMERIC_LOOKUP_EDITED_KEY * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "paged-vlookup-many",
    table: paged_lookup_table_store,
    formula: (table_rows) => `=VLOOKUP($C$1,A1:B${table_rows},2,FALSE)`,
    initialKey: NUMERIC_LOOKUP_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_EDITED_KEY,
    initialValue: NUMERIC_LOOKUP_INITIAL_KEY * LOOKUP_RESULT_FACTOR,
    editedValue: NUMERIC_LOOKUP_EDITED_KEY * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "paged-xlookup-many",
    table: paged_lookup_table_store,
    formula: (table_rows) => `=XLOOKUP($C$1,A1:A${table_rows},B1:B${table_rows})`,
    initialKey: NUMERIC_LOOKUP_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_EDITED_KEY,
    initialValue: NUMERIC_LOOKUP_INITIAL_KEY * LOOKUP_RESULT_FACTOR,
    editedValue: NUMERIC_LOOKUP_EDITED_KEY * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "xlookup-many-sorted",
    table: lookup_table_store,
    formula: (table_rows) => `=XLOOKUP($C$1,A1:A${table_rows},B1:B${table_rows},,-1,2)`,
    initialKey: NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY,
    editedKey: NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY,
    initialValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_INITIAL_KEY) * LOOKUP_RESULT_FACTOR,
    editedValue: Math.floor(NUMERIC_LOOKUP_APPROXIMATE_EDITED_KEY) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "text-lookup-many",
    table: text_lookup_table_store,
    formula: (table_rows) => `=XLOOKUP($C$1,A1:A${table_rows},B1:B${table_rows})`,
    initialKey: text_lookup_query_key(TEXT_LOOKUP_INITIAL_ROW),
    editedKey: text_lookup_query_key(TEXT_LOOKUP_EDITED_ROW),
    initialValue: (TEXT_LOOKUP_INITIAL_ROW + 1) * LOOKUP_RESULT_FACTOR,
    editedValue: (TEXT_LOOKUP_EDITED_ROW + 1) * LOOKUP_RESULT_FACTOR,
  },
  {
    id: "text-lookup-many-sorted",
    table: text_lookup_table_store,
    formula: (table_rows) => `=VLOOKUP($C$1,A1:B${table_rows},2,TRUE)`,
    initialKey: text_lookup_between_query_key(TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW),
    editedKey: text_lookup_between_query_key(TEXT_LOOKUP_APPROXIMATE_ROW),
    initialValue: (TEXT_LOOKUP_APPROXIMATE_INITIAL_ROW + 1) * LOOKUP_RESULT_FACTOR,
    editedValue: (TEXT_LOOKUP_APPROXIMATE_ROW + 1) * LOOKUP_RESULT_FACTOR,
  },
];

/** Every lookup workload reports the shared result plus the key its formulas were last queried with. */
function lookup_variant_output(id: string): FormulaOutput | undefined {
  const edits_key = id.endsWith(LOOKUP_EDIT_SUFFIX);
  const base_id = edits_key ? id.slice(0, -LOOKUP_EDIT_SUFFIX.length) : id;
  const variant = LOOKUP_VARIANTS.find((candidate) => candidate.id === base_id);
  if (variant === undefined) return undefined;
  return edits_key
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
function lookup_fixture(count: number, phase: LookupPhase, variant: LookupVariant): TimedFixture {
  const table_rows = count * LOOKUP_TABLE_ROWS_PER_FORMULA;
  const { store, sheet } = variant.table(table_rows);
  write_lookup_key(store, sheet, variant.initialKey);
  const source = variant.formula(table_rows);
  for (let row = 0; row < count; row++) store.setFormula(sheet, row, 3, source, 0);
  const edits_key = phase === "key-edit";
  const expected_value = edits_key ? variant.editedValue : variant.initialValue;
  const expected_key = edits_key ? variant.editedKey : variant.initialKey;
  // The edit phase starts from computed values, so its timed unit is the key edit alone.
  if (edits_key) store.recompute(sheet);
  return {
    store,
    run: () => {
      if (edits_key) write_lookup_key(store, sheet, variant.editedKey);
      store.recompute(sheet);
    },
    check: () => {
      for (let row = 0; row < count; row++) {
        const value = number_at(store, sheet, row, 3);
        assert(
          value === expected_value,
          `${variant.id} row ${row} expected ${expected_value}, observed ${value}`,
        );
      }
      return `${expected_value}:${expected_key}`;
    },
    dispose: () => store.free(),
    ...(edits_key && {
      restore: () => {
        write_lookup_key(store, sheet, variant.initialKey);
        store.recompute(sheet);
      },
    }),
  };
}

/** Table rows per lookup formula of the mixed-type rows. */
const MIXED_LOOKUP_ROWS_PER_FORMULA = 10;

/** Even rows hold numbers and odd rows text, so one key column mixes types. */
function mixed_lookup_key_at(row: number): number | string {
  return row % 2 === 0 ? row : `Key${row}`;
}

/** Formula `formula` looks up table row `formula * 10 + formula % 2`, so the
 * keys alternate between numbers and text. Text keys differ from the table
 * only in case. */
function mixed_lookup_row_of(formula: number): number {
  return formula * MIXED_LOOKUP_ROWS_PER_FORMULA + (formula % 2);
}

function mixed_lookup_output(table_rows: number): string {
  const last = table_rows / MIXED_LOOKUP_ROWS_PER_FORMULA - 1;
  return `${mixed_lookup_row_of(last) + 1}`;
}

/**
 * Exact `XLOOKUP`s on one key column that mixes numbers and text. The timed
 * unit is the first recalculation of all formulas; every result is checked
 * outside the timed interval.
 */
function mixed_lookup_fixture(table_rows: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, table_rows);
  for (let row = 0; row < table_rows; row++) {
    const key = mixed_lookup_key_at(row);
    if (typeof key === "number") store.setNumber(sheet, row, 0, key, 0);
    else store.setString(sheet, row, 0, key, 0);
  }
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(table_rows, (row) => row + 1),
    0,
  );

  const formulas = table_rows / MIXED_LOOKUP_ROWS_PER_FORMULA;
  for (let formula = 0; formula < formulas; formula++) {
    const key = mixed_lookup_key_at(mixed_lookup_row_of(formula));
    if (typeof key === "number") store.setNumber(sheet, formula, 2, key, 0);
    else store.setString(sheet, formula, 2, key.toLowerCase(), 0);
    store.setFormula(
      sheet,
      formula,
      3,
      `=XLOOKUP(C${formula + 1},A1:A${table_rows},B1:B${table_rows})`,
      0,
    );
  }

  return {
    store,
    run: () => store.recompute(sheet),
    check: () => {
      for (let formula = 0; formula < formulas; formula++) {
        const value = number_at(store, sheet, formula, 3);
        const expected = mixed_lookup_row_of(formula) + 1;
        assert(
          value === expected,
          `xlookup-mixed-exact row ${formula} expected ${expected}, observed ${value}`,
        );
      }
      return mixed_lookup_output(table_rows);
    },
    dispose: () => store.free(),
  };
}

function spill_filter_resize_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
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
      `${number_at(store, sheet, count - 1, 2)}:${store.spillAnchorRow(sheet, count - 1, 2)}`,
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
function spill_filter_same_range_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
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
    check: () => `${number_at(store, sheet, 0, 2)}:${store.spillAnchorRow(sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

/** Columns of the `conditional-format-window` read; the row size is its visible cell count. */
const CONDITIONAL_WINDOW_COLS = 100;
/**
 * Formula rules of `conditional-format-window`, each over the whole window
 * and written for A1: a relative cell against an absolute one, two relative
 * cells with ROW(), and a range with absolute column edges and relative rows.
 */
const CONDITIONAL_WINDOW_FORMULAS = [
  "=A1>$A$2",
  "=AND(A1>B1,MOD(ROW(),2)=1)",
  "=SUM($A1:$C1)>12",
] as const;
/** The window's one value rule: greater than this number. */
const CONDITIONAL_WINDOW_GREATER_THAN = 4;
const CONDITIONAL_FORMULA_KIND = 6;
const CONDITIONAL_GREATER_KIND = 0;

/** The window's cell values; the sheet's one column right of the window is blank. */
function conditional_window_value(row: number, col: number): number {
  return col < CONDITIONAL_WINDOW_COLS ? (row * 7 + col * 3) % 10 : 0;
}

/** Matched rule bits over the window, counted here from the same rules. */
function conditional_window_output(size: number): number {
  const value = conditional_window_value;
  let matches = 0;
  for (let row = 0; row < size / CONDITIONAL_WINDOW_COLS; row++) {
    const row_sum = value(row, 0) + value(row, 1) + value(row, 2);
    for (let col = 0; col < CONDITIONAL_WINDOW_COLS; col++) {
      const cell = value(row, col);
      if (cell > value(1, 0)) matches++;
      if (cell > value(row, col + 1) && row % 2 === 0) matches++;
      if (row_sum > 12) matches++;
      if (cell > CONDITIONAL_WINDOW_GREATER_THAN) matches++;
    }
  }
  return matches;
}

/** Set bits in the conditional-match words at the end of a packed window. */
function packed_conditional_matches(packed: Uint8Array): number {
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  const words = view.getUint32(32, true);
  let matches = 0;
  for (let offset = packed.byteLength - words * 4; offset < packed.byteLength; offset += 4) {
    for (let word = view.getUint32(offset, true); word !== 0; word &= word - 1) matches++;
  }
  return matches;
}

/**
 * One render-window read of `size` visible cells, 100 columns wide, under
 * three formula rules and one value rule. Nothing changes between reads.
 */
function conditional_format_window_fixture(size: number): TimedFixture {
  const rows = size / CONDITIONAL_WINDOW_COLS;
  const store = new CellStore();
  const sheet = store.addSheet(CONDITIONAL_WINDOW_COLS + 1, rows);
  for (let col = 0; col < CONDITIONAL_WINDOW_COLS; col++) {
    const values = numeric_column(rows, (row) => conditional_window_value(row, col));
    writeNumberColumn(store, sheet, col, 0, values, 0);
  }
  const rule_count = CONDITIONAL_WINDOW_FORMULAS.length + 1;
  const bounds = [0, 0, rows - 1, CONDITIONAL_WINDOW_COLS - 1];
  store.setConditionalRules(
    sheet,
    Uint8Array.from([
      ...CONDITIONAL_WINDOW_FORMULAS.map(() => CONDITIONAL_FORMULA_KIND),
      CONDITIONAL_GREATER_KIND,
    ]),
    Uint32Array.from(Array.from({ length: rule_count }, () => bounds).flat()),
    Float64Array.from([
      ...CONDITIONAL_WINDOW_FORMULAS.map(() => 0),
      CONDITIONAL_WINDOW_GREATER_THAN,
    ]),
    [...CONDITIONAL_WINDOW_FORMULAS, ""],
    new Uint8Array(rule_count),
  );
  const cols = Uint32Array.from({ length: CONDITIONAL_WINDOW_COLS }, (_, col) => col);
  let packed: Uint8Array = new Uint8Array();
  return {
    store,
    run: () => {
      const view = store.getWindow(sheet, 0, rows, cols);
      packed = view.takePacked();
      view.free();
    },
    check: () => packed_conditional_matches(packed),
    dispose: () => store.free(),
    // A read changes nothing, so the next read needs no undo.
    restore: () => {},
  };
}

/** `take-sort-filter` columns: A holds each key twice, B counts down, C cycles through 0..99. */
const TAKE_SORT_FILTER_KEYS_PER_VALUE = 2;
const TAKE_SORT_FILTER_FLAGS = 100;
const TAKE_SORT_FILTER_FLAG_STEP = 7;
/** The rows the formula keeps after sorting: the spill's height. */
const TAKE_SORT_FILTER_TAKEN = 1_000;
/** The threshold in E1 before and after the timed edit; C must be above it. */
const TAKE_SORT_FILTER_THRESHOLD = 10;
const TAKE_SORT_FILTER_EDITED_THRESHOLD = 11;
const take_sort_filter_flag = (row: number) =>
  (row * TAKE_SORT_FILTER_FLAG_STEP) % TAKE_SORT_FILTER_FLAGS;

/** Column B of the first spilled row: the largest B among rows above the edited threshold. */
function take_sort_filter_first(count: number): number {
  for (let row = 0; row < count; row++) {
    if (take_sort_filter_flag(row) > TAKE_SORT_FILTER_EDITED_THRESHOLD) return count - row;
  }
  throw new Error("take-sort-filter keeps no row");
}

/**
 * A chain of three row steps over a three-column range,
 * `=TAKE(SORT(FILTER(A1:C100000,C1:C100000>$E$1),2,-1),1000)`, where the
 * timed run edits the threshold in E1. Each step picks rows of the range it
 * read instead of copying them, so the chain copies only the 1,000 rows it
 * spills (#325, R4).
 */
function take_sort_filter_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(9, count);
  const keys = Math.floor(count / TAKE_SORT_FILTER_KEYS_PER_VALUE);
  const columns = [
    (row: number) => row % keys,
    (row: number) => count - row,
    take_sort_filter_flag,
  ];
  columns.forEach((value, col) =>
    writeNumberColumn(store, sheet, col, 0, numeric_column(count, value), 0),
  );
  store.setNumber(sheet, 0, 4, TAKE_SORT_FILTER_THRESHOLD, 0);
  store.setFormula(
    sheet,
    0,
    5,
    `=TAKE(SORT(FILTER(A1:C${count},C1:C${count}>$E$1),2,-1),${TAKE_SORT_FILTER_TAKEN})`,
    0,
  );
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 4, TAKE_SORT_FILTER_EDITED_THRESHOLD, 0);
      store.recompute(sheet);
    },
    check: () =>
      `${number_at(store, sheet, 0, 6)}:${store.spillAnchorRow(sheet, TAKE_SORT_FILTER_TAKEN - 1, 5)}`,
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 4, value: TAKE_SORT_FILTER_THRESHOLD }),
  };
}

function spill_sequence_admission_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, count);
  store.setFormula(sheet, 0, 0, `=SEQUENCE(${count})`, 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () =>
      `${number_at(store, sheet, 0, 0)}:${number_at(store, sheet, count - 1, 0)}:${store.spillAnchorRow(sheet, count - 1, 0)}`,
    dispose: () => store.free(),
  };
}

function sum_product_vector_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => (row % 10) + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(count, () => 2),
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
    check: () => number_at(store, sheet, 0, 2),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function sum_product_matrix_fixture(elements: number): TimedFixture {
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
      numeric_column(rows, () => 1),
      0,
    );
    writeNumberColumn(
      store,
      sheet,
      columns + col,
      0,
      numeric_column(rows, () => 2),
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
    check: () => number_at(store, sheet, 0, columns * 2),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

function criteria_multi_range_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(count, (row) => row % 2),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    2,
    0,
    numeric_column(count, () => 2),
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
    check: () => number_at(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 0 }),
  };
}

/** Column B repeats one fill value, so the two-range total is closed-form. */
const SUM_MULTI_RANGE_FILL = 2;
const COUNTIF_MATCH_SHARE = 2;

function sum_multi_range_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(count, () => SUM_MULTI_RANGE_FILL),
    0,
  );
  store.setFormula(sheet, 0, 2, `=SUM(A1:A${count},B1:B${count})`, 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => `${number_at(store, sheet, 0, 2)}`,
    dispose: () => store.free(),
  };
}

/** Criteria rows repeat every six rows: odd, divisible by three, and past the halfway threshold. */
const SUMIFS_CRITERIA_PERIOD = 6;
const SUMIFS_CRITERIA_OFFSET = 3;
const SUMIFS_TEXT_MATCH = "keep";
const SUMIFS_TEXT_OTHER = "skip";

function sumifs_criteria_total(count: number): number {
  const threshold = Math.floor(count / COUNTIF_MATCH_SHARE);
  let total = 0;
  for (let row = SUMIFS_CRITERIA_OFFSET; row < count; row += SUMIFS_CRITERIA_PERIOD) {
    if (row >= threshold) total += row + 1;
  }
  return total;
}

function sumifs_criteria_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(5, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(count, (row) => row % 2),
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
    numeric_column(count, (row) => row + 1),
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
    check: () => number_at(store, sheet, 0, 4),
    dispose: () => store.free(),
  };
}

function countif_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
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
    check: () => number_at(store, sheet, 0, 1),
    dispose: () => store.free(),
  };
}

function unicode_text_date_fixture(count: number): TimedFixture {
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
    check: () => number_at(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      store.setString(sheet, 0, 0, "café😀-2024-02-29", 0);
      store.recompute(sheet);
    },
  };
}

function percentile_covariance_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(count, (row) => 2 * (row + 1) + 3),
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
    check: () => number_at(store, sheet, 0, 2),
    dispose: () => store.free(),
  };
}

function let_reuse_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, () => 1),
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
    check: () => number_at(store, sheet, 0, 1),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

/** Every `let-many` formula reads this scale from `$C$1`, so one edit dirties all of them. */
const LET_MANY_SCALE = 2;
const LET_MANY_EDITED_SCALE = 3;

/** Every shape formula reads this scale from `$C$1`, so one edit recalculates all of them. */
const SHAPE_SCALE = 2;
const SHAPE_EDITED_SCALE = 3;
/** Column A's fractional part: a multiple of it never ends in a rounding tie at two places. */
const ROUND_MANY_FRACTION = 0.1234;
/** Column A cycles through this many text labels. */
const CONCAT_MANY_LABELS = 97;
const CONCAT_MANY_SUFFIX = "a";
const CONCAT_MANY_EDITED_SUFFIX = "b";

/** A sheet with one formula per row in column B; `$C$1` holds what the timed edit changes. */
function shape_rows_fixture(
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
  const set_source = (value: string | number) =>
    typeof value === "string"
      ? store.setString(sheet, 0, 2, value, 0)
      : store.setNumber(sheet, 0, 2, value, 0);
  set_source(source);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, formula(row), 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      set_source(edited);
      store.recompute(sheet);
    },
    check: () => check(store, sheet),
    dispose: () => store.free(),
    restore: () => {
      set_source(source);
      store.recompute(sheet);
    },
  };
}

function numbers_in_a(fraction = 0): (store: CellStore, sheet: number, rows: number) => void {
  return (store, sheet, rows) =>
    writeNumberColumn(
      store,
      sheet,
      0,
      0,
      numeric_column(rows, (row) => row + 1 + fraction),
      0,
    );
}

function shape_row_fixture(id: string, count: number): TimedFixture {
  const last = (store: CellStore, sheet: number) => number_at(store, sheet, count - 1, 1);
  switch (id) {
    case "round-many":
      return shape_rows_fixture(
        count,
        numbers_in_a(ROUND_MANY_FRACTION),
        (row) => `=ROUND(A${row + 1}*$C$1,2)`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "concat-many":
      return shape_rows_fixture(
        count,
        (store, sheet, rows) => {
          for (let row = 0; row < rows; row++) {
            store.setString(sheet, row, 0, `item${row % CONCAT_MANY_LABELS}`, 0);
          }
        },
        (row) => `=A${row + 1}&" "&$C$1`,
        CONCAT_MANY_SUFFIX,
        CONCAT_MANY_EDITED_SUFFIX,
        (store, sheet) => text_at(store, sheet, count - 1, 1) ?? "",
      );
    case "offset-many":
      return shape_rows_fixture(
        count,
        numbers_in_a(),
        (row) => `=OFFSET(A${row + 1},$C$1,0)`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "indirect-many":
      return shape_rows_fixture(
        count,
        numbers_in_a(),
        () => `=INDIRECT("A"&(ROW()+$C$1))`,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    case "let-calls":
      return shape_rows_fixture(
        count,
        numbers_in_a(),
        let_calls_formula,
        SHAPE_SCALE,
        SHAPE_EDITED_SCALE,
        last,
      );
    default:
      throw new Error(`unknown formula fixture: ${id}`);
  }
}

/** `let-many` with function-call bindings: even rows one, odd rows three. */
function let_calls_formula(row: number): string {
  const source = `A${row + 1}*$C$1`;
  return row % 2 === 0
    ? `=LET(x,ROUND(${source},2),x+x+x)`
    : `=LET(x,SUM(${source},1),y,ROUND(x/3,2),z,y*x,x+y+z)`;
}

/** Defined names `Scale_0`…`Scale_9`; each points at one cell holding `NAME_SCALE`. */
const BINDING_NAMES = 10;
/** One formula in this many uses a name; the others are plain. */
const NAMED_FORMULA_STRIDE = 10;
const NAME_SCALE = 2;
/** Sorting moves row `i` to row `(i * SORT_STRIDE) % rows`; prime, so it permutes every size. */
const SORT_STRIDE = 7_919;

function binding_name(index: number): string {
  return `Scale_${index}`;
}

/** Every `NAMED_FORMULA_STRIDE`th formula multiplies by a defined name, the others by 2. */
function named_row_formula(row: number, cell: string): string {
  const scale =
    row % NAMED_FORMULA_STRIDE === 0
      ? binding_name((row / NAMED_FORMULA_STRIDE) % BINDING_NAMES)
      : String(NAME_SCALE);
  return `=${cell}*${scale}`;
}

/** Points the names at `C1`…`C10` of `sheet`, one name at a time. */
function define_binding_names(store: CellStore, sheet: number): void {
  for (let index = 0; index < BINDING_NAMES; index++) {
    assert(
      store.setNamedRange(binding_name(index), -1, sheet, index, 2, index, 2),
      "binding name defined",
    );
  }
}

/**
 * Column A holds 1…count, column B a formula per row, and C1:C10 the values
 * the names point at. Without `uses_names`, every formula is `=A1*2`.
 */
function named_formulas_sheet(store: CellStore, count: number, uses_names = true): number {
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    2,
    0,
    numeric_column(BINDING_NAMES, () => NAME_SCALE),
    0,
  );
  for (let row = 0; row < count; row++) {
    const cell = `A${row + 1}`;
    const formula = uses_names ? named_row_formula(row, cell) : `=${cell}*${NAME_SCALE}`;
    store.setFormula(sheet, row, 1, formula, 0);
  }
  return sheet;
}

/** The value of the last formula that uses a name, `offset` rows below where it was written. */
function last_named_formula(store: CellStore, sheet: number, count: number, offset = 0): number {
  return number_at(store, sheet, count - NAMED_FORMULA_STRIDE + offset, 1);
}

/**
 * The formulas exist before the names, as when a workbook defines its names
 * after its formulas. The timed run defines the ten names one at a time.
 */
function name_define_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = named_formulas_sheet(store, count);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      define_binding_names(store, sheet);
      store.recompute(sheet);
    },
    check: () => last_named_formula(store, sheet, count),
    dispose: () => store.free(),
    restore: () => {
      for (let index = 0; index < BINDING_NAMES; index++) {
        store.removeNamedRange(binding_name(index), -1);
      }
      store.recompute(sheet);
    },
  };
}

/**
 * `name-define` over a sheet whose formulas use no name: defining names
 * must cost no more than the names themselves.
 */
function name_define_unused_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = named_formulas_sheet(store, count, false);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      define_binding_names(store, sheet);
      store.recompute(sheet);
    },
    check: () => number_at(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      for (let index = 0; index < BINDING_NAMES; index++) {
        store.removeNamedRange(binding_name(index), -1);
      }
      store.recompute(sheet);
    },
  };
}

/** The timed run inserts one row above everything, so every formula and name moves. */
function row_insert_names_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = named_formulas_sheet(store, count);
  define_binding_names(store, sheet);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      assert(store.addRows(sheet, 0, 1), "row inserted");
      store.recompute(sheet);
    },
    check: () => last_named_formula(store, sheet, count, 1),
    dispose: () => store.free(),
    restore: () => {
      assert(store.removeRows(sheet, 0, 1), "row removed");
      store.recompute(sheet);
    },
  };
}

/** Table `Sales` over A:B with a header row: `Amount` holds numbers, `Double` is `=[@Amount]*2`. */
function set_sales_table(store: CellStore, sheet: number, body_rows: number): void {
  assert(
    store.setTable(
      "sales",
      "Sales",
      sheet,
      0,
      0,
      body_rows,
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
function sales_sheet(store: CellStore, count: number): number {
  const sheet = store.addSheet(4, count + 2);
  store.setString(sheet, 0, 0, "Amount", 0);
  store.setString(sheet, 0, 1, "Double", 0);
  writeNumberColumn(
    store,
    sheet,
    0,
    1,
    numeric_column(count, (row) => row + 1),
    0,
  );
  set_sales_table(store, sheet, count);
  return sheet;
}

const TABLE_ROW_FORMULA = "=[@Amount]*2";

/**
 * Every body row has `=[@Amount]*2`, and D1 sums the column. The timed run
 * appends a row the way a user does: a value, the table grown by one row,
 * and the column's formula in the new row.
 */
function table_append_row_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = sales_sheet(store, count);
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
      set_sales_table(store, sheet, added);
      store.setFormula(sheet, added, 1, TABLE_ROW_FORMULA, 0);
      store.recompute(sheet);
    },
    check: () => number_at(store, sheet, 0, 3),
    dispose: () => store.free(),
    restore: () => {
      set_sales_table(store, sheet, count);
      store.clearCell(sheet, added, 1, 0);
      store.clearCell(sheet, added, 0, 0);
      store.recompute(sheet);
    },
  };
}

/** The source row that sorting moves to target row `row`. */
function sorted_source_row(rows: number, row: number): number {
  return (row * SORT_STRIDE) % rows;
}

/** The value of the cell that every formula of `cell-move-refs` multiplies by. */
const CELL_MOVE_SCALE = 2;

/**
 * Column A holds 1…count and column B `=A{r}*$D$1`. The timed run moves D1 to
 * D2, as a cut and paste does, so every formula's reference follows it.
 */
function cell_move_refs_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row + 1),
    0,
  );
  store.setNumber(sheet, 0, 3, CELL_MOVE_SCALE, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, `=A${row + 1}*$D$1`, 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      assert(store.moveCells(sheet, 0, 3, 1, 1, sheet, 1, 3, false) === 0, "cell moved");
      store.recompute(sheet);
    },
    check: () => number_at(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      assert(store.moveCells(sheet, 1, 3, 1, 1, sheet, 0, 3, false) === 0, "cell moved back");
      store.recompute(sheet);
    },
  };
}

/** Column A holds 1…count and column B `=A{r}*2`. The timed run sorts A:B by a fixed shuffle. */
function sort_formula_column_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row + 1),
    0,
  );
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, `=A${row + 1}*2`, 0);
  }
  store.recompute(sheet);
  const order = Uint32Array.from({ length: count }, (_, row) => sorted_source_row(count, row));
  const inverse = new Uint32Array(count);
  for (const [target, source] of order.entries()) inverse[source] = target;
  return {
    store,
    run: () => {
      assert(store.permuteRows(sheet, 0, 0, 2, order) === 0, "rows sorted");
      store.recompute(sheet);
    },
    check: () => number_at(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: () => {
      assert(store.permuteRows(sheet, 0, 0, 2, inverse) === 0, "rows unsorted");
      store.recompute(sheet);
    },
  };
}

/** Loads `=Data!A{r}+Data!B{r}` into a second sheet; A holds the row and B holds 1. */
function parse_load_qualified_fixture(count: number): TimedFixture {
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
    numeric_column(count, (row) => row),
    0,
  );
  writeNumberColumn(
    store,
    data,
    1,
    0,
    numeric_column(count, () => 1),
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
      return number_at(store, calc, count - 1, 0);
    },
    dispose: () => store.free(),
  };
}

/** Loads `=[@Amount]*2` into every body row of `Sales`. */
function parse_load_table_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = sales_sheet(store, count);
  return {
    store,
    run: () => {
      for (let row = 1; row <= count; row++) {
        store.setFormula(sheet, row, 1, TABLE_ROW_FORMULA, 0);
      }
    },
    check: () => {
      store.recompute(sheet);
      return number_at(store, sheet, count, 1);
    },
    dispose: () => store.free(),
  };
}

/**
 * A released engine's state restored: formulas on `Calc` read `Data`, and
 * every tenth one also uses a defined name. The timed run imports the state
 * exported at setup.
 */
function memory_import_fixture(count: number): TimedFixture {
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
    numeric_column(count, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    data,
    2,
    0,
    numeric_column(BINDING_NAMES, () => NAME_SCALE),
    0,
  );
  define_binding_names(store, data);
  for (let row = 0; row < count; row++) {
    store.setFormula(calc, row, 0, named_row_formula(row, `Data!A${row + 1}`), 0);
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
      return number_at(imported, calc, count - 1, 0);
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

function binding_row_fixture(id: string, count: number): TimedFixture {
  switch (id) {
    case "name-define":
      return name_define_fixture(count);
    case "name-define-unused":
      return name_define_unused_fixture(count);
    case "row-insert-names":
      return row_insert_names_fixture(count);
    case "table-append-row":
      return table_append_row_fixture(count);
    case "sort-formula-column":
      return sort_formula_column_fixture(count);
    case "cell-move-refs":
      return cell_move_refs_fixture(count);
    case "parse-load-qualified":
      return parse_load_qualified_fixture(count);
    case "parse-load-table":
      return parse_load_table_fixture(count);
    case "memory-import":
      return memory_import_fixture(count);
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
function closure_range_fixture(
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
      numeric_column(count, (row) => row + 1),
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
    restore: restore_number(store, sheet, { row: 0, col: 2, value: CLOSURE_SCALE }),
  };
}

/** The columns of the `orders` table behind `measure-pivot`, and how each row fills them. */
const ORDER_COLUMNS = ["region", "quarter", "amount", "qty"] as const;
const ORDER_REGIONS = 25;
const order_region = (row: number) => row % ORDER_REGIONS;
const order_quarter = (row: number) => (Math.floor(row / ORDER_REGIONS) % 4) + 1;
const order_amount = (row: number) => (row % 7) + 1;
const order_qty = (row: number) => (row % 3) + 1;
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
function measure_pivot_output(rows: number): number {
  let amount = 0;
  let qty = 0;
  let quarter_amount = 0;
  for (let row = 0; row < rows; row++) {
    if (order_quarter(row) !== 1) continue;
    const value = row === 0 ? ORDER_EDITED_AMOUNT : order_amount(row);
    quarter_amount += value;
    if (order_region(row) !== 0) continue;
    amount += value;
    qty += order_qty(row);
  }
  return amount / qty + amount / quarter_amount;
}

/**
 * Table `orders` with `count` body rows on one sheet, and on another a model
 * pivot over it: regions down, quarters across, both measures in each cell.
 * The timed run changes the first order's amount, so every cell updates.
 */
function measure_pivot_fixture(count: number): TimedFixture {
  // Only the full engine has pivots and measures.
  const store = new CellStore() as unknown as InstanceType<formulas.EngineInstance["CellStore"]>;
  const orders = store.addSheet(ORDER_COLUMNS.length, count + 1);
  const output = store.addSheet(1 + 4 * ORDER_MEASURES.length, ORDER_REGIONS + 2);
  for (const [col, header] of ORDER_COLUMNS.entries()) {
    store.setString(orders, 0, col, header, 0);
  }
  for (let row = 0; row < count; row++) {
    store.setString(orders, row + 1, 0, `R${order_region(row)}`, 0);
  }
  for (const [col, value] of [order_quarter, order_amount, order_qty].entries()) {
    writeNumberColumn(store, orders, col + 1, 1, numeric_column(count, value), 0);
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
    check: () => number_at(store, output, 2, 1) + number_at(store, output, 2, 2),
    dispose: () => store.free(),
    restore: () => edit(order_amount(0)),
  };
}

function closure_row_fixture(id: string, count: number): TimedFixture {
  const last = (store: CellStore, sheet: number) => number_at(store, sheet, count - 1, 1);
  switch (id) {
    case "map-lambda":
      return closure_range_fixture(count, `=MAP(A1:A${count},LAMBDA(x,x*$C$1+1))`, (store, sheet) =>
        number_at(store, sheet, count - 1, 3),
      );
    case "reduce-lambda":
      return closure_range_fixture(
        count,
        `=REDUCE(0,A1:A${count},LAMBDA(a,x,a+x*$C$1))`,
        (store, sheet) => number_at(store, sheet, 0, 3),
      );
    case "byrow-lambda":
      return closure_range_fixture(
        count,
        `=BYROW(A1:B${count},LAMBDA(r,SUM(r)*$C$1))`,
        (store, sheet) => number_at(store, sheet, count - 1, 3),
      );
    case "lambda-call":
      return shape_rows_fixture(
        count,
        numbers_in_a(),
        (row) => `=${CLOSURE_LAMBDA}(A${row + 1},$C$1)`,
        CLOSURE_SCALE,
        CLOSURE_EDITED_SCALE,
        last,
      );
    case "named-lambda":
      return shape_rows_fixture(
        count,
        (store, sheet, rows) => {
          numbers_in_a()(store, sheet, rows);
          assert(store.setNamedFormula(CLOSURE_NAME, -1, `=${CLOSURE_LAMBDA}`), "LAMBDA name set");
        },
        (row) => `=${CLOSURE_NAME}(A${row + 1},$C$1)`,
        CLOSURE_SCALE,
        CLOSURE_EDITED_SCALE,
        last,
      );
    case "measure-pivot":
      return measure_pivot_fixture(count);
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

function grouping_quarter(row: number): number {
  return Math.floor(row / GROUPING_QUARTER_RUN) % GROUPING_QUARTERS;
}

/** The sum of the amounts after the timed edit, which raises the first one. */
function grouping_edited_total(rows: number): number {
  return rows * GROUPING_AMOUNT + GROUPING_EDITED_AMOUNT - GROUPING_AMOUNT;
}

/** The first quarter's share of the edited total; the edited first row is in it. */
function grouping_first_quarter_share(rows: number): number {
  let first_quarter = GROUPING_EDITED_AMOUNT - GROUPING_AMOUNT;
  for (let row = 0; row < rows; row++) {
    if (grouping_quarter(row) === 0) first_quarter += GROUPING_AMOUNT;
  }
  return first_quarter / grouping_edited_total(rows);
}

/**
 * Source rows in A:D: region text `R0`…`R9`, product text `P00`…`P99` (each
 * product in one region), the amount, and quarter text `Q0`…`Q3`. `formula`
 * goes in F1; the timed run edits the first amount.
 */
function grouping_fixture(
  rows: number,
  formula: string,
  check: (store: CellStore, sheet: number) => number,
): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(GROUPING_FORMULA_COL + GROUPING_OUTPUT_COLS, rows);
  const text_column = (col: number, text: (row: number) => string) =>
    writeStringColumn(
      store,
      sheet,
      col,
      0,
      Array.from({ length: rows }, (_, row) => text(row)),
      0,
    );
  text_column(0, (row) => `R${row % GROUPING_REGIONS}`);
  text_column(1, (row) => `P${String(row % GROUPING_PRODUCTS).padStart(2, "0")}`);
  writeNumberColumn(
    store,
    sheet,
    GROUPING_AMOUNT_COL,
    0,
    numeric_column(rows, () => GROUPING_AMOUNT),
    0,
  );
  text_column(GROUPING_QUARTER_COL, (row) => `Q${grouping_quarter(row)}`);
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
    restore: restore_number(store, sheet, {
      row: 0,
      col: GROUPING_AMOUNT_COL,
      value: GROUPING_AMOUNT,
    }),
  };
}

/** `GROUPBY` with SUM by region and product, with subtotals; checks the grand total. */
function group_by_sum_fixture(rows: number): TimedFixture {
  const last = GROUPING_OUTPUT_ROWS - 1;
  return grouping_fixture(rows, `=GROUPBY(A1:B${rows},C1:C${rows},SUM,0,2)`, (store, sheet) =>
    number_at(store, sheet, last, GROUPING_FORMULA_COL + GROUPING_KEY_FIELDS),
  );
}

/**
 * `PIVOTBY` with PERCENTOF of the grand total, by region and product with
 * subtotals and by quarter with a total; checks the first quarter's share in
 * the grand-total row.
 */
function pivot_by_percent_of_fixture(rows: number): TimedFixture {
  // One header row holds the quarters.
  const last = GROUPING_OUTPUT_ROWS;
  return grouping_fixture(
    rows,
    `=PIVOTBY(A1:B${rows},D1:D${rows},C1:C${rows},PERCENTOF,0,2,,1,,,2)`,
    (store, sheet) => number_at(store, sheet, last, GROUPING_FORMULA_COL + GROUPING_KEY_FIELDS),
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

function pivot_source_sheet(store: CellStore, rows: number): number {
  const sheet = store.addSheet(PIVOT_FIELDS, rows + 1);
  for (let field = 0; field < PIVOT_FIELDS; field++) {
    store.setString(sheet, 0, field, `Field${field}`, 0);
    const values = numeric_column(rows, (row) =>
      field < PIVOT_DIGIT_FIELDS
        ? Math.floor(row / PIVOT_DIGITS ** field) % PIVOT_DIGITS
        : row + field,
    );
    writeNumberColumn(store, sheet, field, 1, values, 0);
  }
  return sheet;
}

/** The packed definition `setPivots` takes, anchored at A1, with every total. */
function pivot_definition(
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

function has_pivots(store: CellStore): store is PivotStore {
  return "setPivots" in store && "pivotStatus" in store;
}

/**
 * The pivot benchmark's pivot: three row fields, one column field, SUM and
 * AVERAGE. The timed run installs it and recalculates; restoring removes it.
 */
function pivot_rebuild_fixture(rows: number): TimedFixture {
  const store = new CellStore();
  assert(has_pivots(store), "the full engine has pivot tables");
  const source = pivot_source_sheet(store, rows);
  const output = store.addSheet(PIVOT_OUTPUT_COLS, PIVOT_OUTPUT_ROWS);
  store.commitSources();
  const definition = pivot_definition(source, rows, {
    rowFields: [0, 1, 2],
    colFields: [3],
    values: [
      [PIVOT_SUM_FIELD, PIVOT_SUM],
      [PIVOT_AVERAGE_FIELD, PIVOT_AVERAGE],
    ],
  });
  // The first leaf group's SUM: below the column and value headers.
  const leaf_row = PIVOT_DIGIT_FIELDS;
  return {
    store,
    run: () => {
      assert(store.setPivots(output, definition, [PIVOT_ID]), "pivot installed");
      store.recompute(output);
    },
    check: () => {
      assert(store.pivotStatus(output)[0] === 0, "pivot built");
      return number_at(store, output, leaf_row, 1);
    },
    dispose: () => store.free(),
    restore: () => {
      assert(store.setPivots(output, new Float64Array(), []), "pivot removed");
      store.recompute(output);
    },
  };
}

/** The first leaf group holds every row whose four digit fields are 0. */
function pivot_rebuild_output(rows: number): number {
  const stride = PIVOT_DIGITS ** PIVOT_DIGIT_FIELDS;
  let sum = 0;
  for (let row = 0; row < rows; row += stride) sum += row + PIVOT_SUM_FIELD;
  return sum;
}

/** Source rows of the pivot that `getpivotdata-many` reads: 100 groups of 100. */
const PIVOT_DATA_SOURCE_ROWS = 10_000;
const PIVOT_DATA_EDIT = 1;
const PIVOT_DATA_EDITED = 2;
/** `getpivotdata-source-edit` adds this to the sum field of source row 99. */
const PIVOT_DATA_SOURCE_DELTA = 1_000;
/** The source row it edits: its items are (9, 9), as the last cell's are. */
const PIVOT_DATA_SOURCE_ROW = 99;

/** The item pair that GETPIVOTDATA cell `index` names. */
function pivot_data_items(index: number): [number, number] {
  return [index % PIVOT_DIGITS, Math.floor(index / PIVOT_DIGITS) % PIVOT_DIGITS];
}

/** Sum of field 4 over the source rows whose last two digits are `first` and `second`. */
function pivot_data_value(index: number): number {
  const [first, second] = pivot_data_items(index);
  let sum = 0;
  for (let row = first + second * PIVOT_DIGITS; row < PIVOT_DATA_SOURCE_ROWS; row += 100) {
    sum += row + PIVOT_SUM_FIELD;
  }
  return sum;
}

/**
 * A pivot on sheet `Pivot` sums field 4 by fields 0 and 1; `count` cells on
 * another sheet read it with `GETPIVOTDATA`. With `edit` "unrelated" the
 * timed edit changes a cell nothing reads: GETPIVOTDATA depends on its
 * pivot, so it recalculates none of them (before 0.7.0 it was volatile and
 * recalculated all of them). With "source" the timed edit changes one source
 * value: the pivot updates, then all of them recalculate once.
 */
function get_pivot_data_many_fixture(count: number, edit: "unrelated" | "source"): TimedFixture {
  const store = new CellStore();
  assert(has_pivots(store), "the full engine has pivot tables");
  const source = pivot_source_sheet(store, PIVOT_DATA_SOURCE_ROWS);
  const pivot = store.addSheet(PIVOT_OUTPUT_COLS, PIVOT_OUTPUT_ROWS);
  const calc = store.addSheet(2, count);
  store.setSheetName(pivot, "pivot", "Pivot");
  store.commitSources();
  assert(
    store.setPivots(
      pivot,
      pivot_definition(source, PIVOT_DATA_SOURCE_ROWS, {
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
    const [first, second] = pivot_data_items(index);
    store.setFormula(
      calc,
      index,
      1,
      `=GETPIVOTDATA("Sum of Field4",Pivot!$A$1,"Field0",${first},"Field1",${second})`,
      0,
    );
  }
  store.recompute(calc);
  if (edit === "source") {
    // Sheet row 0 holds the headers.
    const row = PIVOT_DATA_SOURCE_ROW + 1;
    const value = PIVOT_DATA_SOURCE_ROW + PIVOT_SUM_FIELD;
    return {
      store,
      run: () => {
        store.setNumber(source, row, PIVOT_SUM_FIELD, value + PIVOT_DATA_SOURCE_DELTA, 0);
        store.recompute(source);
      },
      check: () => number_at(store, calc, count - 1, 1),
      dispose: () => store.free(),
      restore: restore_number(store, source, { row, col: PIVOT_SUM_FIELD, value }),
    };
  }
  return {
    store,
    run: () => {
      store.setNumber(calc, 0, 0, PIVOT_DATA_EDITED, 0);
      store.recompute(calc);
    },
    check: () => number_at(store, calc, count - 1, 1),
    dispose: () => store.free(),
    restore: restore_number(store, calc, { row: 0, col: 0, value: PIVOT_DATA_EDIT }),
  };
}

const ANALYSIS_PREFIX = "ab";

/**
 * One formula per row with four analysis functions: SUMSQ, AGGREGATE (SUM,
 * ignoring errors), FORECAST.LINEAR and TEXTBEFORE. Each reads `$C$1`, so the
 * timed edit recalculates all of them. FORECAST.LINEAR fits `$A$2:$A$3` (2, 3)
 * over `$A$1:$A$2` (1, 2), the line y = x + 1.
 */
function analysis_calls_fixture(count: number): TimedFixture {
  return shape_rows_fixture(
    count,
    numbers_in_a(),
    (row) =>
      `=SUMSQ(A${row + 1},$C$1)+AGGREGATE(9,6,A${row + 1},$C$1)` +
      `+FORECAST.LINEAR(A${row + 1},$A$2:$A$3,$A$1:$A$2)` +
      `+LEN(TEXTBEFORE("${ANALYSIS_PREFIX}-"&A${row + 1}&$C$1,"-"))`,
    SHAPE_SCALE,
    SHAPE_EDITED_SCALE,
    (store, sheet) => number_at(store, sheet, count - 1, 1),
  );
}

/** The last formula, after the edit: its row holds `count` and `$C$1` holds the edited scale. */
function analysis_calls_output(count: number): number {
  const scale = SHAPE_EDITED_SCALE;
  const sum_of_squares = count * count + scale * scale;
  const sum = count + scale;
  const forecast = count + 1;
  return sum_of_squares + sum + forecast + ANALYSIS_PREFIX.length;
}

function full_engine_row_fixture(id: string, size: number): TimedFixture {
  switch (id) {
    case "groupby-sum":
      return group_by_sum_fixture(size);
    case "pivotby-percentof":
      return pivot_by_percent_of_fixture(size);
    case "pivot-rebuild":
      return pivot_rebuild_fixture(size);
    case "getpivotdata-many":
      return get_pivot_data_many_fixture(size, "unrelated");
    case "getpivotdata-source-edit":
      return get_pivot_data_many_fixture(size, "source");
    case "analysis-calls":
      return analysis_calls_fixture(size);
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

function history_change(index: number): HistoryWrite {
  return {
    row: HISTORY_CHANGE_STRIDE * index + HISTORY_CHANGE_ROW,
    col: (index * HISTORY_CHANGE_COL_STRIDE) % HISTORY_COLS,
    author: index % HISTORY_AUTHORS,
  };
}

/** Scattered writes first, then the write of each changed cell, so its author is the last one. */
function history_writes(): HistoryWrite[] {
  const scattered = HISTORY_WRITES - HISTORY_PAGE;
  return [
    ...Array.from({ length: scattered }, (_, index) => ({
      row: (index * HISTORY_WRITE_STRIDE) % HISTORY_ROWS,
      col: index % HISTORY_COLS,
      author: index % HISTORY_AUTHORS,
    })),
    ...Array.from({ length: HISTORY_PAGE }, (_, index) => history_change(index)),
  ];
}

/** Each change counts its cell's position plus its author times the cell count. */
function history_change_checksum(row: number, col: number, author: number): number {
  return row * HISTORY_COLS + col + author * HISTORY_CELLS;
}

function history_diff_output(): number {
  let checksum = 0;
  for (let index = 0; index < HISTORY_PAGE; index++) {
    const change = history_change(index);
    checksum += history_change_checksum(change.row, change.col, change.author);
  }
  return checksum;
}

/** A sheet of 5,000 × 20 numbers, column by column. */
function history_version(changes: readonly HistoryWrite[]): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addSheet(HISTORY_COLS, HISTORY_ROWS);
  for (let col = 0; col < HISTORY_COLS; col++) {
    writeNumberColumn(
      store,
      sheet,
      col,
      0,
      numeric_column(HISTORY_ROWS, (row) => row * HISTORY_COLS + col),
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

function history_window_bytes(
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

function history_diff_fixture(): TimedFixture {
  if (historyKernel === undefined) throw new Error("this engine has no version-history kernel");
  const { DiffKernel } = historyKernel;
  const before = history_version([]);
  const after = history_version(Array.from({ length: HISTORY_PAGE }, (_, k) => history_change(k)));
  const window_rows = Math.floor(HISTORY_WINDOW_CELLS / HISTORY_COLS);
  const windows: HistoryWindow[] = [];
  for (let row0 = 0; row0 < HISTORY_ROWS; row0 += window_rows) {
    const rows = Math.min(window_rows, HISTORY_ROWS - row0);
    windows.push({
      row0,
      rows,
      before: history_window_bytes(before, row0, rows),
      after: history_window_bytes(after, row0, rows),
    });
  }
  before.store.free();
  const writes = history_writes();
  const no_styles = new Uint32Array();
  let checksum = Number.NaN;
  return {
    store: after.store,
    run: () => {
      const kernel = new DiffKernel(HISTORY_PAGE);
      try {
        const slot = kernel.addSheet(HISTORY_ROWS, HISTORY_COLS, true);
        for (const write of writes) {
          kernel.touch(slot, write.row, write.col, write.row, write.col, write.author);
        }
        kernel.setStyles(no_styles, no_styles);
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
          checksum += history_change_checksum(row, cols[index] ?? 0, authors[index] ?? 0);
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
function let_many_formula(row: number): string {
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

function sort_unique_key(row: number): string {
  return `k${(row * SORT_UNIQUE_STEP) % SORT_UNIQUE_KEYS}`;
}

/** First and last of the sorted distinct keys of the rows before `rows`, and their count. */
function sort_unique_output(rows: number): string {
  const keys = [...new Set(Array.from({ length: rows }, (_, row) => sort_unique_key(row)))].sort();
  return `${keys[0]}:${keys.at(-1)}:${keys.length}`;
}

/** The `sort-mixed-blanks` cell of one row; `null` is a blank cell. */
function sort_mixed_value(row: number): number | string | boolean | null {
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
function sort_mixed_blanks_output(count: number): string {
  let texts = 0;
  let sum = SORT_MIXED_EDITED_FIRST;
  for (let row = 1; row < count; row++) {
    const value = sort_mixed_value(row);
    if (typeof value === "string") texts++;
    else if (typeof value === "number") sum += value;
    else if (value === true) sum++;
  }
  return `${texts}:${sum}`;
}

/** A label without hyphens or case, so its collation order is its code order. */
function sort_rows_label(row: number): string {
  const label = (row * SORT_ROWS_STEP) % SORT_ROWS_LABELS;
  return `L${String(label).padStart(SORT_ROWS_LABEL_DIGITS, "0")}`;
}

function sort_rows_number(row: number): number {
  return ((row * SORT_ROWS_STEP) % SORT_ROWS_NUMBERS) / SORT_ROWS_NUMBER_SCALE;
}

/** First, middle and last row of a sorted order and a weighted sum of all of it. */
function sort_rows_digest(order: ArrayLike<number>): string {
  let sum = 0;
  for (let position = 0; position < order.length; position++) {
    sum = (sum + (position + 1) * (order[position] ?? 0)) % SORT_ROWS_DIGEST_MODULUS;
  }
  const middle = order[Math.floor(order.length / 2)];
  return `${order[0]}:${middle}:${order[order.length - 1]}:${sum}`;
}

/** `sort_rows_output` results, computed once per row and size. */
const sort_rows_outputs = new Map<string, string>();

/**
 * The digests of the ascending and the descending order of `size` rows of
 * `value`: equal values keep their row order in both directions.
 */
function sort_rows_output(size: number, value: (row: number) => number | string): string {
  const cache_key = `${value.name}:${size}`;
  const cached = sort_rows_outputs.get(cache_key);
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
  const output = `${sort_rows_digest(ascending)}|${sort_rows_digest(descending)}`;
  sort_rows_outputs.set(cache_key, output);
  return output;
}

function subtotal_visible(row: number): boolean {
  return Math.floor(row / SUBTOTAL_BLOCK_ROWS) % 2 === 0;
}

/** Sum of `row + 1` over the visible rows, with A1 holding `first`. */
function subtotal_output(count: number, first: number): number {
  let total = first;
  for (let row = 1; row < count; row++) if (subtotal_visible(row)) total += row + 1;
  return total;
}

/** The value a `sparse-page-write` block holds at one offset: blank, a number or a label. */
function sparse_page_value(offset: number): number | string | null {
  if (offset % SPARSE_PAGE_BLANK_EVERY === 0) return null;
  return offset % 2 === 0 ? offset : `label${offset % SPARSE_PAGE_LABELS}`;
}

function sparse_page_output(rows: number): string {
  const last = (rows - 1) * SPARSE_PAGE_COLUMNS;
  return `${String(sparse_page_value(last + SPARSE_PAGE_COLUMNS - 2))}:${String(sparse_page_value(last + SPARSE_PAGE_COLUMNS - 1))}`;
}

/**
 * `formulas` INDEX/MATCH lookups over a `rows`-row table: keys in A, values in
 * B. Each key is `$C$1` plus the formula's row, so the timed edit recomputes
 * every lookup, and each match lands near the top of the table.
 */
function index_match_fixture(formulas: number, rows: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, rows);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(rows, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(rows, (row) => (row + 1) * INDEX_MATCH_VALUE_SCALE),
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
    check: () => number_at(store, sheet, formulas - 1, 3),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 2, value: SHAPE_SCALE }),
  };
}

/**
 * RANK.EQ in even rows and LARGE in odd rows, each over the whole column, so
 * one edit of A1 recomputes all of them: the fill-down shape that reads the
 * column once per formula.
 */
function rank_many_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row + 1),
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
    check: () => `${number_at(store, sheet, 0, 1)}:${number_at(store, sheet, count - 1, 1)}`,
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

/**
 * One `SORT(UNIQUE(FILTER()))` over text keys in A, kept while B is below
 * `$D$1`. The timed edit narrows the filter to the first rows.
 */
function sort_unique_filter_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  for (let row = 0; row < count; row++) store.setString(sheet, row, 0, sort_unique_key(row), 0);
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(count, (row) => row),
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
      return `${text_at(store, sheet, 0, 2) ?? ""}:${text_at(store, sheet, last, 2) ?? ""}:${spilled}`;
    },
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 3, value: count }),
  };
}

/**
 * `=SORT(A1:An)` over numbers, text, logical values and blank cells in turn.
 * The timed edit changes the number in A1.
 */
function sort_mixed_blanks_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  for (let row = 0; row < count; row++) {
    const value = sort_mixed_value(row);
    if (typeof value === "number") store.setNumber(sheet, row, 0, value, 0);
    else if (typeof value === "string") store.setString(sheet, row, 0, value, 0);
    else if (typeof value === "boolean") store.setBool(sheet, row, 0, value, 0);
  }
  store.setFormula(sheet, 0, 2, `=SORT(A1:A${count})`, 0);
  store.recompute(sheet);
  const first = sort_mixed_value(0);
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
    restore: restore_number(store, sheet, { row: 0, col: 0, value: first }),
  };
}

/**
 * Sorts the rows of one column of `value`s through `sortRowsMulti`,
 * ascending then descending, as the sort command does. Sorting changes no
 * cell, so every run repeats the same work.
 */
function sort_rows_fixture(count: number, value: (row: number) => number | string): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(1, count);
  const values = Array.from({ length: count }, (_, row) => value(row));
  if (typeof values[0] === "string") {
    writeStringColumn(store, sheet, 0, 0, values as string[], 0);
  } else {
    writeNumberColumn(store, sheet, 0, 0, Float64Array.from(values as number[]), 0);
  }
  const column = Uint32Array.of(0);
  const all_rows = new Uint32Array(0);
  let ascending: Uint32Array = new Uint32Array(0);
  let descending: Uint32Array = new Uint32Array(0);
  return {
    store,
    run: () => {
      ascending = store.sortRowsMulti(sheet, column, Uint8Array.of(1), all_rows);
      descending = store.sortRowsMulti(sheet, column, Uint8Array.of(0), all_rows);
    },
    check: () => `${sort_rows_digest(ascending)}|${sort_rows_digest(descending)}`,
    dispose: () => store.free(),
    restore: () => {},
  };
}

/** `SUBTOTAL(109)` over a column whose filter hides every other block of rows. */
function subtotal_filtered_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(2, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row + 1),
    0,
  );
  assert(hide_every_other_block(store, sheet, count), "subtotal-filtered: hidden rows rejected");
  store.setFormula(sheet, 0, 1, `=SUBTOTAL(109,A1:A${count})`, 0);
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, SUBTOTAL_EDITED_FIRST, 0);
      store.recompute(sheet);
    },
    check: () => number_at(store, sheet, 0, 1),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 1 }),
  };
}

/** An engine before `setRowVisibility`, which took the filtered rows as runs. */
interface HiddenRunsStore {
  setHiddenRows(sheet: number, manual: Uint32Array, filtered: Uint32Array): boolean;
}

function takes_hidden_runs(store: object): store is HiddenRunsStore {
  return "setHiddenRows" in store && !("setRowVisibility" in store);
}

/**
 * Hides every other block of `SUBTOTAL_BLOCK_ROWS` rows, as a filter would.
 * The gate runs this harness on older base engines too, which take the
 * filtered rows as runs instead of the rows the filter keeps.
 */
function hide_every_other_block(store: CellStore, sheet: number, count: number): boolean {
  const manual = new Uint32Array();
  if (takes_hidden_runs(store)) {
    const hidden: number[] = [];
    for (let start = SUBTOTAL_BLOCK_ROWS; start < count; start += 2 * SUBTOTAL_BLOCK_ROWS) {
      hidden.push(start, Math.min(start + SUBTOTAL_BLOCK_ROWS, count) - 1);
    }
    return store.setHiddenRows(sheet, manual, Uint32Array.from(hidden));
  }

  const kept: number[] = [];
  for (let row = 0; row < count; row++) {
    if (Math.floor(row / SUBTOTAL_BLOCK_ROWS) % 2 === 0) kept.push(row);
  }
  return store.setRowVisibility(sheet, manual, Uint32Array.from(kept));
}

/**
 * One sparse block of `rows` × 10 cells written inside a page load, as
 * snapshot hydration and datasource pages write: numbers and labels, with
 * every tenth cell blank. The inputs are built before the timed write.
 */
function sparse_page_write_fixture(rows: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(SPARSE_PAGE_COLUMNS, rows);
  const offsets: number[] = [];
  const kinds: number[] = [];
  const numbers: number[] = [];
  const texts: string[] = [];
  for (let offset = 0; offset < rows * SPARSE_PAGE_COLUMNS; offset++) {
    const value = sparse_page_value(offset);
    if (value === null) continue;
    offsets.push(offset);
    kinds.push(typeof value === "number" ? KIND_NUMBER : KIND_STRING);
    numbers.push(typeof value === "number" ? value : 0);
    if (typeof value === "string") texts.push(value);
  }
  const encoder = new TextEncoder();
  const text_bytes = encoder.encode(texts.join(""));
  const text_offsets = new Uint32Array(texts.length + 1);
  for (let index = 0; index < texts.length; index++) {
    text_offsets[index + 1] = (text_offsets[index] ?? 0) + encoder.encode(texts[index]).length;
  }
  const entry_offsets = Uint32Array.from(offsets);
  const entry_kinds = Uint8Array.from(kinds);
  const entry_numbers = Float64Array.from(numbers);
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
        entry_offsets,
        entry_kinds,
        entry_numbers,
        text_bytes,
        text_offsets,
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
      const number = number_at(store, sheet, last, SPARSE_PAGE_COLUMNS - 2);
      return `${number}:${text_at(store, sheet, last, SPARSE_PAGE_COLUMNS - 1) ?? ""}`;
    },
    dispose: () => store.free(),
  };
}

/**
 * A LET in every row, as modern workbooks write them. The timed edit changes
 * the shared scale, so every LET recalculates.
 */
function let_many_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row + 1),
    0,
  );
  store.setNumber(sheet, 0, 2, LET_MANY_SCALE, 0);
  for (let row = 0; row < count; row++) {
    store.setFormula(sheet, row, 1, let_many_formula(row), 0);
  }
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 2, LET_MANY_EDITED_SCALE, 0);
      store.recompute(sheet);
    },
    check: () => number_at(store, sheet, count - 1, 1),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 2, value: LET_MANY_SCALE }),
  };
}

/** The LET binding is used three times (`x+x+x`), so a re-evaluated binding costs that multiple. */
const LET_REPEAT_FACTOR = 3;

function let_repeat_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(4, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row + 1),
    0,
  );
  writeNumberColumn(
    store,
    sheet,
    1,
    0,
    numeric_column(count, (row) => (row + 1) * LOOKUP_RESULT_FACTOR),
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
    check: () => `${number_at(store, sheet, 0, 3)}:${number_at(store, sheet, 0, 2)}`,
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 2, value: count }),
  };
}

function iterative_finance_fixture(count: number): TimedFixture {
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
    check: () => number_at(store, sheet, count - 1, 1),
    dispose: () => store.free(),
  };
}

function incremental_dependency_closure_fixture(count: number): TimedFixture {
  const store = new CellStore();
  const sheet = store.addSheet(3, count);
  writeNumberColumn(
    store,
    sheet,
    0,
    0,
    numeric_column(count, (row) => row),
    0,
  );
  set_formulas(store, sheet, dependencyClosureFormulas(count));
  store.recompute(sheet);
  return {
    store,
    run: () => {
      store.setNumber(sheet, 0, 0, 10, 0);
      store.recompute(sheet);
    },
    check: () => `${number_at(store, sheet, 0, 2)}:${number_at(store, sheet, count - 1, 2)}`,
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 0, value: 0 }),
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
function paged_cell_reads_output(count: number): number {
  const last = count - 1;
  return last + (last + 1) * PAGED_READ_EDITED_SCALE;
}

/** Old row 10 of column A one row lower, and every loaded and edited cell kept. */
function paged_insert_row_output(rows: number): string {
  return `${PAGED_INSERT_AT}:${rows * 2}:${PAGED_DIRTY_CELLS}`;
}

function paged_eviction_output(pages: number): string {
  return `${PAGED_EVICTION_RESIDENT}:${pages * PAGED_EVICTION_CHUNK_ROWS - 1}:0`;
}

/**
 * A paged sheet whose first `loaded` columns hold `row + col` in clean,
 * loaded pages. A budget of 0 keeps every page resident.
 */
function loaded_paged_sheet(
  cols: number,
  rows: number,
  loaded: number,
  chunk_rows: number,
  byte_budget: number,
): { store: CellStore; sheet: number } {
  const store = new CellStore();
  const sheet = store.addPagedSheet(cols, rows, chunk_rows, byte_budget, 0);
  store.beginPageLoad();
  for (let col = 0; col < loaded; col++) {
    writeNumberColumn(
      store,
      sheet,
      col,
      0,
      numeric_column(rows, (row) => row + col),
      0,
    );
  }
  store.commitSources();
  return { store, sheet };
}

/** `PAGED_DIRTY_CELLS` local edits spread evenly down column B. */
function add_paged_edits(store: CellStore, sheet: number, rows: number): void {
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
function paged_cell_reads_fixture(count: number): TimedFixture {
  const { store, sheet } = loaded_paged_sheet(4, count, 2, PAGED_CHUNK_ROWS, 0);
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
    check: () => number_at(store, sheet, count - 1, 3),
    dispose: () => store.free(),
    restore: restore_number(store, sheet, { row: 0, col: 2, value: PAGED_READ_SCALE }),
  };
}

/** Two loaded columns of `rows` rows, with local edits in column B. */
function edited_paged_sheet(rows: number): { store: CellStore; sheet: number } {
  const paged = loaded_paged_sheet(2, rows, 2, PAGED_CHUNK_ROWS, 0);
  add_paged_edits(paged.store, paged.sheet, rows);
  return paged;
}

function paged_insert_row_check(store: CellStore, sheet: number): string {
  const stats = store.pagedStats(sheet);
  return `${number_at(store, sheet, PAGED_INSERT_AT + 1, 0)}:${stats[1]}:${stats[2]}`;
}

/** One row inserted near the top of a paged sheet; removing it again restores the sheet. */
function paged_insert_row_fixture(rows: number): TimedFixture {
  const { store, sheet } = edited_paged_sheet(rows);
  return {
    store,
    run: () => assert(store.addRows(sheet, PAGED_INSERT_AT, 1), "paged-insert-row: insert"),
    check: () => paged_insert_row_check(store, sheet),
    dispose: () => store.free(),
    restore: () => assert(store.removeRows(sheet, PAGED_INSERT_AT, 1), "paged-insert-row: restore"),
  };
}

/** Whether every cell of both columns is loaded. The check changes nothing to restore. */
function paged_range_loaded_fixture(rows: number): TimedFixture {
  const { store, sheet } = edited_paged_sheet(rows);
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
function paged_eviction_fixture(pages: number): TimedFixture {
  const rows = pages * PAGED_EVICTION_CHUNK_ROWS;
  const store = new CellStore();
  const sheet = store.addPagedSheet(
    1,
    rows,
    PAGED_EVICTION_CHUNK_ROWS,
    PAGED_EVICTION_RESIDENT * PAGED_EVICTION_PAGE_BYTES,
    0,
  );
  const pinned_rows = PAGED_EVICTION_PINNED * PAGED_EVICTION_CHUNK_ROWS;
  store.pinViewportBands(sheet, Uint32Array.of(0, pinned_rows, 0, 1));
  const values = numeric_column(rows, (row) => row);
  const load = (start: number, end: number) => {
    store.beginPageLoad();
    writeNumberColumn(store, sheet, 0, start, values.subarray(start, end), 0);
    store.commitSources();
  };
  load(0, pinned_rows);
  load(rows - (PAGED_EVICTION_RESIDENT - PAGED_EVICTION_PINNED) * PAGED_EVICTION_CHUNK_ROWS, rows);
  return {
    store,
    run: () => load(0, rows),
    check: () =>
      `${store.pagedStats(sheet)[0]}:${number_at(store, sheet, rows - 1, 0)}:${number_at(store, sheet, 0, 0)}`,
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
    return lookup_fixture(
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
      return shape_row_fixture(id, size);
    case "name-define":
    case "name-define-unused":
    case "row-insert-names":
    case "table-append-row":
    case "sort-formula-column":
    case "cell-move-refs":
    case "parse-load-qualified":
    case "parse-load-table":
    case "memory-import":
      return binding_row_fixture(id, size);
    case "map-lambda":
    case "reduce-lambda":
    case "byrow-lambda":
    case "lambda-call":
    case "named-lambda":
    case "measure-pivot":
      return closure_row_fixture(id, size);
    case "groupby-sum":
    case "pivotby-percentof":
    case "pivot-rebuild":
    case "getpivotdata-many":
    case "getpivotdata-source-edit":
    case "analysis-calls":
      return full_engine_row_fixture(id, size);
    case "paged-cell-reads":
      return paged_cell_reads_fixture(size);
    case "paged-insert-row":
      return paged_insert_row_fixture(size);
    case "paged-range-loaded":
      return paged_range_loaded_fixture(size);
    case "paged-eviction":
      return paged_eviction_fixture(size);
    case "rank-many":
      return rank_many_fixture(size);
    case "sort-unique-filter":
      return sort_unique_filter_fixture(size);
    case "subtotal-filtered":
      return subtotal_filtered_fixture(size);
    case "sort-mixed-blanks":
      return sort_mixed_blanks_fixture(size);
    case "sort-rows-labels":
      return sort_rows_fixture(size, sort_rows_label);
    case "sort-rows-numbers":
      return sort_rows_fixture(size, sort_rows_number);
    case "sparse-page-write":
      return sparse_page_write_fixture(size);
    case "index-match-many":
      assert(rangeSize !== undefined, "INDEX/MATCH range size");
      return index_match_fixture(size, rangeSize);
    case "history-diff":
      return history_diff_fixture();
    case "independent-parse-load":
      return independent_load_fixture(size);
    case "independent-first-recompute":
      return independent_recompute_fixture(size);
    case "linear-chain":
      return chain_fixture(size);
    case "wide-fan-out-edit":
      return fan_out_edit_fixture(size);
    case "scalar-edit-affects-1":
      return fan_out_edit_fixture(size);
    case "scalar-edit-affects-1000":
      return fan_out_edit_fixture(size);
    case "scalar-edit-affects-100000":
      return fan_out_edit_fixture(size);
    case "formula-constant-edit":
      return constant_edit_fixture(size);
    case "diamond-edit":
      return diamond_fixture(size);
    case "shared-range-edit":
      return shared_range_fixture(size);
    case "distinct-range-edit":
      return distinct_range_fixture(size);
    case "cross-sheet-range-edit":
      return cross_sheet_fixture(size);
    case "topology-remove-add":
      return topology_fixture(size);
    case "cycles":
      return cycle_fixture(size);
    case "removed-sheet-ref":
      return ref_removal_fixture(size);
    case "error-propagation":
      return error_propagation_fixture(size);
    case "criteria-range-edit":
      return criteria_range_fixture(size);
    case "lookup-range-edit":
      return lookup_range_fixture(size);
    case "xlookup-mixed-exact":
      return mixed_lookup_fixture(size);
    case "spill-filter-resize":
      return spill_filter_resize_fixture(size);
    case "sumproduct-vector-edit":
      return sum_product_vector_fixture(size);
    case "sumproduct-matrix-edit":
      return sum_product_matrix_fixture(size);
    case "criteria-multi-range-edit":
      return criteria_multi_range_fixture(size);
    case "sum-multi-range":
      return sum_multi_range_fixture(size);
    case "sumifs-3-criteria":
      return sumifs_criteria_fixture(size);
    case "countif-100k":
      return countif_fixture(size);
    case "unicode-text-date-edit":
      return unicode_text_date_fixture(size);
    case "percentile-covariance":
      return percentile_covariance_fixture(size);
    case "let-reuse-edit":
      return let_reuse_fixture(size);
    case "let-repeat":
      return let_repeat_fixture(size);
    case "let-many":
      return let_many_fixture(size);
    case "iterative-finance":
      return iterative_finance_fixture(size);
    case "incremental-dependency-closure-edit":
      return incremental_dependency_closure_fixture(size);
    case "spill-sequence-admission":
      return spill_sequence_admission_fixture(size);
    case "spill-filter-same-range":
      return spill_filter_same_range_fixture(size);
    case "conditional-format-window":
      return conditional_format_window_fixture(size);
    case "take-sort-filter":
      return take_sort_filter_fixture(size);
    case "scalar-edit-affects-0":
      return fan_out_edit_fixture(size, true);
    default:
      throw new Error(`unknown formula fixture: ${id}`);
  }
}

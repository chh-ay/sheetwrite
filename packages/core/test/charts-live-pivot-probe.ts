// Engine providers are selected once per process; this probe owns the full provider,
// because the default engine computes no pivot output.
import assert from "node:assert/strict";

import * as formulas from "@sheetwrite/formulas";

import { resolveChartView, subscribeChartChanges } from "../src/charts-live.js";
import { initSheetwrite } from "../src/grid.js";
import type {
  ChartChangeEvent,
  ChartDefinition,
  DocumentOp,
  PivotDefinition,
  Range,
  Workbook,
} from "../src/index.js";
import { SheetwriteStore } from "../src/store.js";

await initSheetwrite(undefined, formulas);

const SHEET_ROWS = 20;
const SHEET_COLS = 8;
/** Pivot output: a header row at the anchor, then East and West, then the grand total. */
const PIVOT_ANCHOR = { row: 2, col: 1 };
const EAST_ROW = 3;
const WEST_ROW = 4;
const SUM_COL = 2;
/** Grand total row once a third region adds an output row. */
const GROWN_TOTAL_ROW = 6;
const GRAND_TOTAL = 35;

const columns = Array.from({ length: SHEET_COLS }, (_, index) => ({
  key: `c${index}`,
  header: `C${index}`,
  width: 80,
  type: "text" as const,
}));

const pivot: PivotDefinition = {
  id: "sales",
  name: "Sales",
  source: { range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } } },
  anchor: PIVOT_ANCHOR,
  rows: [0],
  columns: [],
  values: [{ field: 1, aggregation: "SUM" }],
  rowTotals: true,
  columnTotals: false,
};

const sums: Range = {
  sheet: "report",
  start: { row: EAST_ROW, col: SUM_COL },
  end: { row: WEST_ROW, col: SUM_COL },
};

function workbook(pivots: PivotDefinition[]): Workbook {
  return {
    activeSheet: "report",
    sheets: [
      { id: "report", name: "Report", rowCount: SHEET_ROWS, columns, pivots },
      { id: "data", name: "Data", rowCount: SHEET_ROWS, columns },
      { id: "plain", name: "Plain", rowCount: SHEET_ROWS, columns },
    ],
  };
}

function chart(id: string, values: Range): ChartDefinition {
  return {
    id,
    kind: "column",
    anchor: { row: 0, col: 5, offsetX: 0, offsetY: 0, width: 400, height: 300 },
    series: [{ values }],
  };
}

function set(sheet: string, row: number, col: number, value: number | string): DocumentOp {
  return { op: "set", addr: { sheet, row, col }, value: { kind: "literal", value } };
}

function apply(store: SheetwriteStore, patches: DocumentOp[]): void {
  assert.equal(store.applyTransaction({ patches }).status, "applied");
}

/** A store with the pivot source on `data` and a chart `sheet`/`id` over `values`. */
function setup(pivots: PivotDefinition[], sheet: string, id: string, values: Range) {
  const store = new SheetwriteStore(workbook(pivots));
  const data = [
    ["Region", "Amount"],
    ["East", 10],
    ["West", 20],
    ["East", 5],
  ] as const;
  apply(
    store,
    data.flatMap((row, r) => row.map((value, col) => set("data", r, col, value))),
  );
  apply(store, [{ op: "setChart", sheet, chart: chart(id, values) }]);

  const events: ChartChangeEvent[] = [];
  subscribeChartChanges(store, (event) => events.push(event));
  return { store, events };
}

function seriesValues(store: SheetwriteStore, sheet: string, id: string) {
  return resolveChartView(store, sheet, id)?.series[0]?.values;
}

const scenarios: Record<string, () => void> = {
  "source-edit": () => {
    // The cell under the grand total: the output reaches it only after a third group appears.
    // A chart over cells the output already holds is tracked through its spill children.
    const grown: Range = {
      sheet: "report",
      start: { row: GROWN_TOTAL_ROW, col: SUM_COL },
      end: { row: GROWN_TOTAL_ROW, col: SUM_COL },
    };
    const { store, events } = setup([pivot], "report", "total", grown);
    try {
      const empty = seriesValues(store, "report", "total");

      // The edited cell is outside the series; only the pivot carries the change into it.
      apply(store, [set("data", 3, 0, "North")]);
      assert.equal(events.length, 1, "a pivot source edit reaches the chart");
      assert.deepEqual(events[0]?.charts, [{ sheet: "report", id: "total" }]);
      assert.notDeepEqual(seriesValues(store, "report", "total"), empty);
      assert.deepEqual(seriesValues(store, "report", "total"), [GRAND_TOTAL]);
    } finally {
      store.dispose();
    }
  },

  set: () => {
    const { store, events } = setup([], "report", "sums", sums);
    try {
      assert.equal(store.setPivot(pivot, "report").status, "applied");
      assert.equal(events.length, 1, "setPivot reaches a chart under its output");
      assert.deepEqual(events[0]?.charts, [{ sheet: "report", id: "sums" }]);
      assert.deepEqual(seriesValues(store, "report", "sums"), [15, 20]);
    } finally {
      store.dispose();
    }
  },

  remove: () => {
    const { store, events } = setup([pivot], "report", "sums", sums);
    try {
      assert.deepEqual(seriesValues(store, "report", "sums"), [15, 20]);

      assert.equal(store.removePivot("sales").status, "applied");
      assert.equal(events.length, 1, "removePivot reaches a chart under its old output");
      assert.deepEqual(events[0]?.charts, [{ sheet: "report", id: "sums" }]);
      assert.deepEqual(seriesValues(store, "report", "sums"), [null, null]);
    } finally {
      store.dispose();
    }
  },

  "other-sheet": () => {
    // The same cells as `sums`, so a pivot test that ignores the sheet would match them.
    const plain: Range = { ...sums, sheet: "plain" };
    const { store, events } = setup([pivot], "plain", "flat", plain);
    try {
      apply(store, [set("plain", EAST_ROW, SUM_COL, 1), set("plain", WEST_ROW, SUM_COL, 2)]);
      events.length = 0;

      // Each edit changes the pivot output on `report`, which the chart on `plain` never reads.
      apply(store, [set("data", 1, 1, 11)]);
      assert.equal(store.setPivot({ ...pivot, name: "Renamed" }, "report").status, "applied");
      assert.equal(store.removePivot("sales").status, "applied");
      assert.deepEqual(events, []);
      assert.deepEqual(seriesValues(store, "plain", "flat"), [1, 2]);
    } finally {
      store.dispose();
    }
  },
};

const scenario = scenarios[process.argv[2] ?? ""];
assert.ok(scenario, `unknown scenario: ${process.argv[2]}`);
scenario();

// Charts over worksheet pivots need the full engine, and engine selection is
// process-wide, so `charts-live.test.ts` runs this file in its own process.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import * as formulas from "@sheetwrite/formulas";

import {
  type ChartDefinition,
  type ChartView,
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  type PivotDefinition,
  resolveChartView,
  subscribeChartChanges,
  toXlsxWorkbook,
  type WorkbookSnapshot,
} from "../src/index.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { setXlsxWorkbookBackend } from "../src/xlsx-backends.js";

const RIBBON_MODULE = "../src/ribbon/ribbon.js";

beforeAll(async () => {
  await initSheetwrite({ engine: formulas });
});

let restore: () => void;
const grids: Grid[] = [];
beforeEach(() => {
  restore = installCanvasTestStubs();
});
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
  document.body.replaceChildren();
  restore();
});

/** Source fields of the Orders table. */
const REGION = 0;
const SEGMENT = 1;
const QUARTER = 2;
const AMOUNT = 3;

/** Orders: region, segment, quarter and amount. */
const ORDERS: readonly (readonly [string, string, string, number])[] = [
  ["East", "Retail", "Q1", 10],
  ["East", "Retail", "Q2", 5],
  ["East", "Online", "Q1", 7],
  ["West", "Retail", "Q2", 4],
  ["West", "Online", "Q1", 3],
  ["West", "Online", "Q2", 8],
  ["North", "Retail", "Q1", 6],
];
type Order = (typeof ORDERS)[number];

/** Sales by region, then segment, on Report at B2. */
function salesPivot(changes: Partial<PivotDefinition> = {}): PivotDefinition {
  return {
    id: "sales",
    name: "Sales",
    source: { table: "orders" },
    anchor: { row: 1, col: 1 },
    rows: [REGION, SEGMENT],
    columns: [],
    values: [{ field: AMOUNT, aggregation: "SUM" }],
    ...changes,
  };
}

const CHART: ChartDefinition = {
  id: "chart1",
  kind: "column",
  anchor: { row: 1, col: 8, offsetX: 0, offsetY: 0, width: 400, height: 300 },
  series: [],
  pivot: "sales",
};

const literal = (row: number, col: number, value: string | number) => ({
  rowOffset: row,
  colOffset: col,
  value: { kind: "literal" as const, value },
});

/** Orders on Data, and Report with `pivot` and a column chart over it. */
function snapshot(pivot: PivotDefinition): WorkbookSnapshot {
  const columns = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      key: `c${index}`,
      header: `C${index}`,
      width: 80,
      type: "text" as const,
    }));
  const headers = ["Region", "Segment", "Quarter", "Amount"];
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "report" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 20,
        columns: columns(4),
        tables: [
          {
            id: "orders",
            name: "Orders",
            range: {
              sheet: "data",
              start: { row: 0, col: 0 },
              end: { row: ORDERS.length, col: 3 },
            },
            columns: headers.map((name) => ({ id: name.toLowerCase(), name })),
            headerRow: true,
            totalsRow: false,
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: ORDERS.length + 1,
            colCount: 4,
            cells: [
              ...headers.map((header, col) => literal(0, col, header)),
              ...ORDERS.flatMap((order, row) =>
                order.map((value, col) => literal(row + 1, col, value)),
              ),
            ],
          },
        ],
      },
      {
        id: "report",
        name: "Report",
        order: 1,
        rowCount: 40,
        columns: columns(16),
        pivots: [pivot],
        charts: [CHART],
        cells: [],
      },
    ],
  };
}

function mount(pivot: PivotDefinition = salesPivot()): Grid {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, snapshot(pivot));
  grids.push(grid);
  return grid;
}

/** "Region / Segment" of each leaf item of `orders`, in the pivot's label order. */
function leafLabels(orders: readonly Order[]): string[] {
  return [...new Set(orders.map(([region, segment]) => `${region} / ${segment}`))].sort();
}

/** The sum of the amounts of `orders` for each leaf item; null where it has none. */
function leafSums(orders: readonly Order[], labels: readonly string[]): (number | null)[] {
  return labels.map((label) => {
    const matching = orders.filter(([region, segment]) => `${region} / ${segment}` === label);
    return matching.length === 0 ? null : matching.reduce((sum, order) => sum + order[AMOUNT], 0);
  });
}

/**
 * The chart's view once the pivot views are computed. The first resolve
 * loads them, and a change event names the chart when they are ready.
 */
async function loadedView(grid: Grid): Promise<ChartView | null> {
  const { promise: ready, resolve } = Promise.withResolvers<void>();
  const stop = subscribeChartChanges(grid.store, (event) => {
    if (!event.charts.some((chart) => chart.sheet === "report" && chart.id === CHART.id)) return;
    stop();
    resolve();
  });
  resolveChartView(grid.store, "report", CHART.id);
  await ready;
  return view(grid);
}

/** The chart's view now. */
function view(grid: Grid): ChartView | null {
  return resolveChartView(grid.store, "report", CHART.id);
}

/** Each series as its categories and values. */
function points(chartView: ChartView | null) {
  return chartView?.series.map((series) => [series.categories, series.values]);
}

describe("a chart over a worksheet pivot", () => {
  const labels = leafLabels(ORDERS);
  const sums = leafSums(ORDERS, labels);

  for (const layout of ["compact", "tabular"] as const) {
    for (const subtotals of [true, false]) {
      it(`plots only the leaf items of a ${layout} pivot, subtotals ${subtotals ? "on" : "off"}`, async () => {
        const grid = mount(salesPivot({ layout, subtotals }));

        expect(points(await loadedView(grid))).toEqual([[labels, sums]]);
        // The pivot on the sheet keeps its totals; the chart never plots them.
        expect(grid.getPivotResult("report", "sales")?.cells).toContain("Total");
      });
    }
  }

  it("plots one series per column item, with gaps where a leaf item has no value", async () => {
    const grid = mount(salesPivot({ columns: [QUARTER] }));
    const chartView = await loadedView(grid);

    const quarters = ["Q1", "Q2"];
    // Each series is named by its column item.
    expect(
      chartView?.series.map((series) => quarters.find((quarter) => series.name.includes(quarter))),
    ).toEqual(quarters);
    expect(points(chartView)).toEqual(
      quarters.map((quarter) => [
        labels,
        leafSums(
          ORDERS.filter((order) => order[QUARTER] === quarter),
          labels,
        ),
      ]),
    );
  });

  it("plots only the chosen value fields", async () => {
    const grid = mount(
      salesPivot({
        values: [
          { field: AMOUNT, aggregation: "SUM" },
          { field: AMOUNT, aggregation: "COUNT" },
        ],
      }),
    );
    await loadedView(grid);
    expect(grid.setChart({ ...CHART, pivotValues: [1] }, "report").status).toBe("applied");

    const counts = labels.map(
      (label) => ORDERS.filter(([region, segment]) => `${region} / ${segment}` === label).length,
    );
    expect(points(view(grid))).toEqual([[labels, counts]]);
  });

  it("follows a filter change and a source edit, and keeps no values of its own", async () => {
    const grid = mount();
    await loadedView(grid);

    const kept = ORDERS.filter(([region]) => region !== "North");
    const filtered = salesPivot({ filters: [{ field: REGION, values: ["East", "West"] }] });
    expect(grid.setPivot(filtered, "report").status).toBe("applied");
    expect(points(view(grid))).toEqual([[leafLabels(kept), leafSums(kept, leafLabels(kept))]]);

    // Data row 2 is East, Retail, Q2: its amount goes from 5 to 50.
    grid.store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "data", row: 2, col: 3 },
          value: { kind: "literal", value: 50 },
        },
      ],
    });
    const edited = kept.map((order, index): Order =>
      index === 1 ? [order[0], order[1], order[2], 50] : order,
    );
    expect(points(view(grid))).toEqual([
      [leafLabels(edited), leafSums(edited, leafLabels(edited))],
    ]);

    const report = grid.store.getWorkbook().sheets.find((sheet) => sheet.id === "report");
    expect(report?.charts).toEqual([CHART]);
    expect(report?.pivots?.map((pivot) => pivot.id)).toEqual(["sales"]);
  });

  it("plots a measure as the pivot computes it for each item", async () => {
    const input = snapshot(
      salesPivot({
        source: {
          model: {
            table: "orders",
            fields: [
              { table: "orders", column: "region" },
              { table: "orders", column: "amount" },
            ],
          },
        },
        rows: [0],
        values: [{ measure: "twice" }],
      }),
    );
    input.workbook.dataModel = {
      relationships: [],
      measures: [
        { id: "twice", name: "Twice", table: "orders", formula: "=SUM(Orders[Amount])*2" },
      ],
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = createGridFromSnapshot(host, input);
    grids.push(grid);

    const regions = [...new Set(ORDERS.map(([region]) => region))].sort();
    const twice = regions.map((region) => {
      const orders = ORDERS.filter((order) => order[REGION] === region);
      return 2 * orders.reduce((sum, order) => sum + order[AMOUNT], 0);
    });
    expect(points(await loadedView(grid))).toEqual([[regions, twice]]);
  });

  it("passes the chart's view to the XLSX export", async () => {
    const grid = mount();
    let passed: ReadonlyMap<string, ReadonlyMap<string, ChartView>> | undefined;
    setXlsxWorkbookBackend({
      name: "capture",
      async toXlsxWorkbook(_snapshot, _options, context) {
        passed = context?.pivotCharts;
        return new Uint8Array();
      },
      async fromXlsxWorkbook() {
        throw new Error("not used");
      },
    });
    try {
      await toXlsxWorkbook(grid);
    } finally {
      setXlsxWorkbookBackend(null);
    }

    expect(points(passed?.get("report")?.get(CHART.id) ?? null)).toEqual([[labels, sums]]);
  });
});

describe("Insert › Charts › PivotChart on a worksheet", () => {
  it("shows with the active cell in a pivot and inserts a chart over that pivot", async () => {
    const host = document.createElement("div");
    Object.defineProperties(host, { clientWidth: { value: 1400 }, clientHeight: { value: 500 } });
    document.body.appendChild(host);
    const input = snapshot(salesPivot());
    const report = input.sheets[1];
    if (report === undefined) throw new Error("the fixture has a report sheet");
    report.charts = [];
    const grid = createGridFromSnapshot(host, input, { config: { ribbon: true } });
    grids.push(grid);
    // Await the ribbon's lazy mount, which loads its own chunk.
    await import(RIBBON_MODULE);

    const insertTab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (tab) => tab.textContent === "Insert",
    );
    insertTab?.click();
    /** The face of the PivotChart command while the ribbon shows it; hidden commands stay in the DOM. */
    const pivotChartButton = (): HTMLButtonElement | null => {
      const command = host.querySelector<HTMLElement>(
        '.sheetwrite-ribbon [data-command="pivotChart"]',
      );
      for (let node = command; node !== null; node = node.parentElement) {
        if (node.hidden) return null;
      }
      return command?.querySelector("button") ?? null;
    };

    grid.setSelection({ kind: "cell", addr: { sheet: "report", row: 0, col: 0 } });
    expect(pivotChartButton()).toBeNull();

    grid.setSelection({ kind: "cell", addr: { sheet: "report", row: 3, col: 2 } });
    const button = pivotChartButton();
    expect(button).not.toBeNull();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    await loadPanels(grid);
    await Promise.resolve();

    const inserted = grid.getCharts("report");
    expect(inserted).toMatchObject([{ kind: "column", pivot: "sales", series: [] }]);
    // The chart floats right of the pivot's output.
    const output = grid.getPivotResult("report", "sales");
    expect(inserted[0]?.anchor.col).toBe((output?.anchor.col ?? 0) + (output?.cols ?? 0));
  });
});

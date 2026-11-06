// Dashboard pivots need the full engine, and engine selection is
// process-wide, so `dashboard-view.test.ts` runs this file in its own process.
import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import * as formulas from "@sheetwrite/formulas";

import { dashboardPivotResult } from "../src/dashboard/dashboard-view.js";
import {
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  resolveChartView,
  type PivotDefinition,
  type WorkbookSnapshot,
} from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite(undefined, formulas);
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

const text = (row: number, col: number, value: string | number) => ({
  rowOffset: row,
  colOffset: col,
  value: { kind: "literal" as const, value },
});

const byRegion = (anchorRow: number): PivotDefinition => ({
  id: anchorRow === 0 ? "on-dashboard" : "on-sheet",
  name: "By region",
  source: { table: "orders" },
  anchor: { row: anchorRow, col: 0 },
  rows: [0],
  columns: [],
  values: [{ field: 1, aggregation: "SUM" }],
});

/** Orders A1:B4 on Data, a worksheet pivot below it, and the same pivot on the dashboard Dash. */
function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 20,
        columns: ["a", "b"].map((key) => ({ key, header: key, width: 80, type: "text" as const })),
        tables: [
          {
            id: "orders",
            name: "Orders",
            range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } },
            columns: [
              { id: "region", name: "Region" },
              { id: "amount", name: "Amount" },
            ],
            headerRow: true,
            totalsRow: false,
          },
        ],
        pivots: [byRegion(6)],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 4,
            colCount: 2,
            cells: [
              text(0, 0, "Region"),
              text(0, 1, "Amount"),
              text(1, 0, "East"),
              text(1, 1, 1),
              text(2, 0, "West"),
              text(2, 1, 2),
              text(3, 0, "East"),
              text(3, 1, 3),
            ],
          },
        ],
      },
      {
        id: "dash",
        name: "Dash",
        order: 1,
        kind: "dashboard",
        dashboard: {
          items: [
            { id: "sales", box: { x: 0, y: 0, w: 6, h: 6 }, kind: "pivot", pivot: "on-dashboard" },
          ],
        },
        rowCount: 0,
        columns: [],
        // Dashboard pivots place no output, so they can share the anchor A1.
        pivots: [byRegion(0), { ...byRegion(0), id: "second" }],
        cells: [],
      },
    ],
  };
}

function mount(): Grid {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, snapshot());
  grids.push(grid);
  return grid;
}

it("computes a dashboard pivot without cells, equal to the same pivot on a worksheet, after edits", () => {
  const grid = mount();
  // A dashboard pivot places no output; the dashboard view reads its cells from the engine.
  const cells = (sheet: string, id: string) => {
    const result =
      sheet === "dash" ? dashboardPivotResult(grid, sheet, id) : grid.getPivotResult(sheet, id);
    expect(result?.status).toBe("ok");
    return result?.cells;
  };

  expect(cells("dash", "on-dashboard")).toEqual([
    "Region",
    "Sum of Amount",
    "East",
    4,
    "West",
    2,
    "Total",
    6,
  ]);
  expect(cells("dash", "on-dashboard")).toEqual(cells("data", "on-sheet"));
  expect(cells("dash", "second")).toEqual(cells("data", "on-sheet"));

  grid.applyTransaction({
    patches: [
      { op: "set", addr: { sheet: "data", row: 2, col: 1 }, value: { kind: "literal", value: 10 } },
    ],
  });
  expect(cells("dash", "on-dashboard")).toEqual(cells("data", "on-sheet"));

  grid.undo();
  expect(cells("dash", "on-dashboard")).toEqual(cells("data", "on-sheet"));
});

it("shows the pivot result as a table in the dashboard view", async () => {
  const grid = mount();
  grid.setActiveSheet("dash");
  await import("../src/dashboard/dashboard-view.js");
  await Promise.resolve();

  const rows = [...document.querySelectorAll(".sheetwrite-dashboard-pivot tr")].map((row) =>
    [...row.children].map((cell) => cell.textContent),
  );
  expect(rows).toEqual([
    ["Region", "Sum of Amount"],
    ["East", "4"],
    ["West", "2"],
    ["Total", "6"],
  ]);
});

it("shows measure values in a dashboard pivot, equal to the same pivot on a worksheet", () => {
  const input = snapshot();
  input.workbook.dataModel = {
    relationships: [],
    measures: [{ id: "twice", name: "Twice", table: "orders", formula: "=SUM(Orders[Amount])*2" }],
  };
  const byMeasure = (id: string, anchorRow: number): PivotDefinition => ({
    id,
    name: "Twice by region",
    source: {
      model: {
        table: "orders",
        fields: [
          { table: "orders", column: "region" },
          { table: "orders", column: "amount" },
        ],
      },
    },
    anchor: { row: anchorRow, col: 0 },
    rows: [0],
    columns: [],
    values: [{ measure: "twice" }],
  });
  const [data, dash] = input.sheets;
  if (data === undefined || dash === undefined) throw new Error("the fixture has two sheets");
  data.pivots = [byMeasure("measure-on-sheet", 6)];
  dash.pivots = [byMeasure("measure-on-dashboard", 0)];
  dash.dashboard = { items: [] };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, input);
  grids.push(grid);

  const onSheet = grid.getPivotResult("data", "measure-on-sheet");
  const onDashboard = dashboardPivotResult(grid, "dash", "measure-on-dashboard");
  expect(onSheet?.status).toBe("ok");
  expect(onDashboard?.cells).toEqual(onSheet?.cells);
  expect(onDashboard?.cells).toContain(8);
});

it("shows a value field's number format in the dashboard view", async () => {
  const input = snapshot();
  const dash = input.sheets[1];
  if (dash === undefined) throw new Error("the fixture has a dashboard");
  dash.pivots = [
    { ...byRegion(0), values: [{ field: 1, aggregation: "SUM", numberFormat: "$#,##0.00" }] },
  ];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, input);
  grids.push(grid);
  grid.setActiveSheet("dash");
  await import("../src/dashboard/dashboard-view.js");
  await Promise.resolve();

  const values = [...document.querySelectorAll(".sheetwrite-dashboard-pivot td")].map(
    (cell) => cell.textContent,
  );
  expect(values).toEqual(["$4.00", "$2.00", "$6.00"]);
});

/** The dashboard Dash with a slicer on Orders[Region] beside its pivot; `readOnly` mounts a read-only grid. */
async function withSlicer(readOnly = false) {
  const input = snapshot();
  const dash = input.sheets[1];
  if (dash === undefined) throw new Error("the fixture has a dashboard");
  dash.pivots = [byRegion(0)];
  dash.dashboard = {
    items: [
      { id: "sales", box: { x: 0, y: 0, w: 6, h: 6 }, kind: "pivot", pivot: "on-dashboard" },
      {
        id: "region",
        box: { x: 6, y: 0, w: 3, h: 6 },
        kind: "slicer",
        field: { table: "orders", column: "region" },
      },
    ],
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, input, { readOnly });
  grids.push(grid);
  grid.setActiveSheet("dash");
  await import("../src/dashboard/dashboard-view.js");
  await Promise.resolve();
  const press = (label: string) => {
    const button = [
      ...host.querySelectorAll<HTMLElement>(".sheetwrite-dashboard-slicer-value"),
    ].find((candidate) => candidate.textContent === label);
    if (button === undefined) throw new Error(`no slicer value ${label}`);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };
  const body = () => dashboardPivotResult(grid, "dash", "on-dashboard")?.cells.slice(2);
  return { grid, press, body };
}

it("filters the dashboard pivot by a slicer as a saved change, and undo clears it", async () => {
  const { grid, press, body } = await withSlicer();
  expect(body()).toEqual(["East", 4, "West", 2, "Total", 6]);

  press("West");
  expect(body()).toEqual(["West", 2, "Total", 2]);
  expect(grid.store.getWorkbook().sheets[1]?.dashboard?.items[1]).toMatchObject({
    selected: ["West"],
  });
  // The saved pivot keeps its own definition.
  expect(grid.getPivots("dash")[0]?.filters).toBeUndefined();

  grid.undo();
  expect(body()).toEqual(["East", 4, "West", 2, "Total", 6]);
});

it("filters only a read-only viewer's own view, without a document change", async () => {
  const { grid, press, body } = await withSlicer(true);

  press("East");
  expect(body()).toEqual(["East", 4, "Total", 4]);
  expect(grid.store.getWorkbook().sheets[1]?.dashboard?.items[1]).not.toHaveProperty("selected");
});

it("dims the slicer values that no row has under the other slicers, or hides them", async () => {
  const input = snapshot();
  const dash = input.sheets[1];
  if (dash === undefined) throw new Error("the fixture has a dashboard");
  dash.pivots = [byRegion(0)];
  const amount = {
    id: "amount",
    box: { x: 0, y: 0, w: 3, h: 6 },
    kind: "slicer" as const,
    field: { table: "orders", column: "amount" },
    selected: [2],
  };
  const region = {
    id: "region",
    box: { x: 3, y: 0, w: 3, h: 6 },
    kind: "slicer" as const,
    field: { table: "orders", column: "region" },
  };
  dash.dashboard = { items: [amount, region] };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, input);
  grids.push(grid);
  grid.setActiveSheet("dash");
  await import("../src/dashboard/dashboard-view.js");
  await Promise.resolve();
  const regionValues = () =>
    [
      ...host.querySelectorAll<HTMLElement>(
        '[data-item-id="region"] .sheetwrite-dashboard-slicer-value',
      ),
    ].map(
      (button) => `${button.textContent}${button.dataset.noData === undefined ? "" : " (no data)"}`,
    );

  // Only West has the amount 2.
  expect(regionValues()).toEqual(["East (no data)", "West"]);

  // The item menu sets Excel's "Hide items with no data" as one saved change.
  const press = (target: Element | null | undefined) =>
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  press(host.querySelector('[aria-label="Region item actions"]'));
  press(
    [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (entry) => entry.textContent === "Hide Items with No Data",
    ),
  );
  expect(regionValues()).toEqual(["West"]);
  expect(grid.store.getWorkbook().sheets[1]?.dashboard?.items[1]).toMatchObject({
    itemsWithNoData: "hide",
  });
});

it("charts a dashboard pivot without its total, through the slicers, and one undo removes it", async () => {
  const { grid, press } = await withSlicer();
  const { insertPivotChart } = await import("../src/panels/panel-controller.js");

  expect(insertPivotChart(grid, "column")).toBe(true);
  const chart = grid.getCharts("dash")[0];
  expect(chart).toMatchObject({ kind: "column", title: "By region", pivot: "on-dashboard" });
  const id = chart?.id ?? "";
  expect(grid.store.getWorkbook().sheets[1]?.dashboard?.items).toContainEqual(
    expect.objectContaining({ kind: "chart", chart: id }),
  );
  // As an Excel PivotChart: row items are categories, the value field is a series, no total.
  const points = () =>
    resolveChartView(grid.store, "dash", id)?.series.map((series) => [
      series.name,
      series.categories,
      series.values,
    ]);
  expect(points()).toEqual([["Sum of Amount", ["East", "West"], [4, 2]]]);

  press("West");
  expect(points()).toEqual([["Sum of Amount", ["West"], [2]]]);

  grid.undo();
  grid.undo();
  expect(grid.getCharts("dash")).toEqual([]);
  expect(grid.store.getWorkbook().sheets[1]?.dashboard?.items.map((item) => item.kind)).toEqual([
    "pivot",
    "slicer",
  ]);
});

it("shows a measure on a KPI card in the slicers' filter context", async () => {
  const input = snapshot();
  input.workbook.dataModel = {
    relationships: [],
    measures: [{ id: "twice", name: "Twice", table: "orders", formula: "=SUM(Orders[Amount])*2" }],
  };
  const dash = input.sheets[1];
  if (dash === undefined) throw new Error("the fixture has a dashboard");
  dash.pivots = [];
  dash.dashboard = {
    items: [
      {
        id: "region",
        box: { x: 0, y: 0, w: 3, h: 6 },
        kind: "slicer",
        field: { table: "orders", column: "region" },
      },
      {
        id: "total",
        box: { x: 3, y: 0, w: 3, h: 3 },
        kind: "kpi",
        measure: "twice",
        numberFormat: "#,##0.0",
      },
    ],
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, input);
  grids.push(grid);
  grid.setActiveSheet("dash");
  await import("../src/dashboard/dashboard-view.js");
  await Promise.resolve();
  const card = () => host.querySelector(".sheetwrite-dashboard-kpi")?.textContent;

  // Twice the sum of Amount: 2 × (1 + 2 + 3).
  expect(card()).toBe("12.0");
  expect(host.querySelector('[data-item-id="total"]')?.getAttribute("aria-label")).toBe("Twice");

  // The Region slicer keeps West: 2 × 2.
  const west = [...host.querySelectorAll<HTMLElement>(".sheetwrite-dashboard-slicer-value")].find(
    (candidate) => candidate.textContent === "West",
  );
  west?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(card()).toBe("4.0");
});

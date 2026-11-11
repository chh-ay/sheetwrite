// Pivot output needs the full engine, and engine selection is process-wide,
// so `full-engine.test.ts` runs this file apart from the default-engine suites.
import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import * as formulas from "@sheetwrite/formulas";

import {
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  type PivotDefinition,
  type WorkbookSnapshot,
} from "../src/index.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { installCanvasTestStubs } from "../src/testing.js";

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

const literal = (row: number, col: number, value: string | number) => ({
  rowOffset: row,
  colOffset: col,
  value: { kind: "literal" as const, value },
});

/** Region and Amount in A1:B4; the pivot sums and counts Amount by region at D1. */
const pivot: PivotDefinition = {
  id: "by-region",
  name: "By region",
  source: { range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } } },
  anchor: { row: 0, col: 3 },
  rows: [0],
  columns: [],
  values: [
    { field: 1, aggregation: "SUM", numberFormat: "$#,##0" },
    { field: 1, aggregation: "COUNT" },
  ],
};

function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 10,
        columns: ["a", "b", "c", "d", "e", "f"].map((key) => ({
          key,
          header: key,
          width: 80,
          type: "text" as const,
        })),
        pivots: [pivot],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 4,
            colCount: 2,
            cells: [
              literal(0, 0, "Region"),
              literal(0, 1, "Amount"),
              literal(1, 0, "East"),
              literal(1, 1, 1200),
              literal(2, 0, "West"),
              literal(2, 1, 300),
              literal(3, 0, "East"),
              literal(3, 1, 50),
            ],
          },
        ],
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

/** The number format the grid paints in each cell of D1:F4, row by row. */
function formats(grid: Grid): (string | undefined)[][] {
  const window = grid.store.getVisibleWindow("data", { start: 0, end: 4 }, [3, 4, 5]);
  return [0, 1, 2, 3].map((row) =>
    [0, 1, 2].map((col) => window.styles[window.styleIds[row * 3 + col] ?? 0]?.numberFormat),
  );
}

it("paints a value field's number format on its value cells only, as Excel does", () => {
  const grid = mount();

  // Header row and labels keep General; the COUNT column has no format.
  expect(formats(grid)).toEqual([
    [undefined, undefined, undefined],
    [undefined, "$#,##0", undefined],
    [undefined, "$#,##0", undefined],
    [undefined, "$#,##0", undefined],
  ]);
});

it("sets a value field's number format from the field list in one undo step", async () => {
  const grid = mount();
  const press = (target: Element | null | undefined) => {
    if (target == null) throw new Error("missing control");
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  };
  (await loadPanels(grid)).openPivotPanel(grid, "data", "by-region");
  const panel = () => document.querySelector(".sheetwrite-panel");

  press(panel()?.querySelector('[aria-label="Count Numbers of Amount in Values actions"]'));
  press(
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === "Number Format…",
    ),
  );
  const category = panel()?.querySelector<HTMLSelectElement>('[aria-label="Category"]');
  if (category == null) throw new Error("no Category control");
  category.value = "0.00%";
  category.dispatchEvent(new Event("change", { bubbles: true }));
  panel()
    ?.querySelector("form.sheetwrite-panel-format")
    ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

  expect(grid.getPivots("data")[0]?.values[1]).toEqual({
    field: 1,
    aggregation: "COUNT",
    numberFormat: "0.00%",
  });
  expect(formats(grid)[1]).toEqual([undefined, "$#,##0", "0.00%"]);

  grid.undo();
  expect(grid.getPivots("data")[0]?.values[1]).toEqual({ field: 1, aggregation: "COUNT" });
});

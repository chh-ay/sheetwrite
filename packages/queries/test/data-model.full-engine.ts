// Model pivots need the full engine, and engine selection is process-wide,
// so `data-model.test.ts` runs this file in its own process.
import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import {
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  type PivotDefinition,
  type SavedQuery,
  type TableRelationship,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
import * as formulas from "@sheetwrite/formulas";

import { queriesAddon, querySession } from "../src/node.js";

beforeAll(async () => {
  await initSheetwrite({ engine: formulas, addons: [queriesAddon()] });
});

let restoreStubs: () => void;
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => restoreStubs());

const text = (row: number, col: number, value: string) => ({
  rowOffset: row,
  colOffset: col,
  value: { kind: "literal" as const, value },
});

/** A Regions table in E1:F3; the query writes its Sales table from A1. */
const snapshot = (): WorkbookSnapshot => ({
  schemaVersion: 1,
  workbook: { activeSheet: "data" },
  sheets: [
    {
      id: "data",
      name: "Data",
      order: 0,
      rowCount: 30,
      columns: ["A", "B", "C", "D", "E", "F"].map((key) => ({
        key,
        header: key,
        width: 80,
        type: "text" as const,
      })),
      tables: [
        {
          id: "regions",
          name: "Regions",
          range: { sheet: "data", start: { row: 0, col: 4 }, end: { row: 2, col: 5 } },
          columns: [
            { id: "region", name: "Region" },
            { id: "manager", name: "Manager" },
          ],
          headerRow: true,
          totalsRow: false,
        },
      ],
      cells: [
        {
          startRow: 0,
          startCol: 4,
          rowCount: 3,
          colCount: 2,
          cells: [
            text(0, 0, "Region"),
            text(0, 1, "Manager"),
            text(1, 0, "North"),
            text(1, 1, "Ann"),
            text(2, 0, "South"),
            text(2, 1, "Bo"),
          ],
        },
      ],
    },
  ],
});

const sales: SavedQuery = {
  id: "sales",
  name: "Sales",
  source: {
    kind: "csv",
    sourceId: "sales-feed",
    locator: "https://example.test/sales.csv",
    columns: [
      { id: "region", name: "Region", type: "text" },
      { id: "total", name: "Total", type: "number" },
    ],
  },
  steps: [],
  output: { table: "sales-table", tableName: "Sales", anchor: { sheet: "data", row: 0, col: 0 } },
};

const salesToRegions: TableRelationship = {
  id: "sales-regions",
  from: { table: "sales-table", column: "region" },
  to: { table: "regions", column: "region" },
};

const byManager: PivotDefinition = {
  id: "by-manager",
  name: "By manager",
  source: {
    model: {
      table: "sales-table",
      fields: [
        { table: "regions", column: "manager" },
        { table: "sales-table", column: "total" },
      ],
    },
  },
  anchor: { row: 10, col: 0 },
  rows: [0],
  columns: [],
  values: [{ field: 1, aggregation: "SUM" }],
};

/** Manager and total pairs of the pivot body, without its header and grand total rows. */
function totals(grid: Grid): [unknown, unknown][] {
  const result = grid.getPivotResult("data", byManager.id);
  if (result?.status !== "ok") throw new Error(`pivot status ${result?.status} ${result?.error}`);
  const pairs: [unknown, unknown][] = [];
  for (let row = result.headerRows; row < result.rows - 1; row++) {
    pairs.push([result.cells[row * result.cols], result.cells[row * result.cols + 1]]);
  }
  return pairs;
}

const relationships = (grid: Grid) => grid.store.getWorkbook().dataModel?.relationships;

it("keeps a query output table's relationship through a refresh that updates the model pivot in one undo step", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let feed = "Region,Total\nNorth,5\nSouth,7\n";
  const grid = createGridFromSnapshot(host, snapshot(), {
    addons: {
      queries: {
        fetchSource: async () => ({ kind: "bytes", bytes: new TextEncoder().encode(feed) }),
      },
    },
  });
  const session = await querySession(grid);
  try {
    session.define(sales);
    expect((await session.refresh("sales")).status).toBe("applied");
    const relate = { op: "setRelationship" as const, relationship: salesToRegions };
    expect(grid.applyTransaction({ patches: [relate] }).status).toBe("applied");
    expect(grid.setPivot(byManager, "data").status).toBe("applied");
    expect(totals(grid)).toEqual([
      ["Ann", 5],
      ["Bo", 7],
    ]);

    // The refresh replaces the table's rows; its ID and column IDs stay, so the relationship holds.
    feed = "Region,Total\nNorth,5\nSouth,7\nnorth,4\n";
    expect((await session.refresh("sales")).status).toBe("applied");
    expect(relationships(grid)).toEqual([salesToRegions]);
    expect(totals(grid)).toEqual([
      ["Ann", 9],
      ["Bo", 7],
    ]);

    grid.undo();
    expect(relationships(grid)).toEqual([salesToRegions]);
    expect(totals(grid)).toEqual([
      ["Ann", 5],
      ["Bo", 7],
    ]);
  } finally {
    session.dispose();
    grid.destroy();
    host.remove();
  }
});

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import {
  createGridFromSnapshot,
  type DashboardItem,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  type PivotDefinition,
  rebaseDocumentOperations,
  SheetwriteStore,
  validateWorkbookSnapshot,
  type WorkbookSnapshot,
} from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => restoreStubs());

const grids: Grid[] = [];
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
});

const byRegion: PivotDefinition = {
  id: "by-region",
  name: "By region",
  source: { table: "orders" },
  anchor: { row: 0, col: 0 },
  rows: [0],
  columns: [],
  values: [{ field: 1, aggregation: "SUM" }],
};

const pivotItem: DashboardItem = {
  id: "sales",
  box: { x: 0, y: 0, w: 8, h: 6 },
  kind: "pivot",
  pivot: "by-region",
};

const slicer: DashboardItem = {
  id: "region",
  box: { x: 8, y: 0, w: 4, h: 6 },
  kind: "slicer",
  field: { table: "orders", column: "region" },
  selected: ["East"],
};

/** Orders A1:B3 on Data; the dashboard Dash shows a pivot over it and a slicer. */
function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 3,
        columns: [
          { key: "a", header: "A", width: 80, type: "text" },
          { key: "b", header: "B", width: 80, type: "number" },
        ],
        tables: [
          {
            id: "orders",
            name: "Orders",
            range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
            columns: [
              { id: "region", name: "Region" },
              { id: "amount", name: "Amount" },
            ],
            headerRow: true,
            totalsRow: false,
          },
        ],
        cells: [],
      },
      {
        id: "dash",
        name: "Dash",
        order: 1,
        kind: "dashboard",
        dashboard: { items: [pivotItem, slicer] },
        rowCount: 0,
        columns: [],
        pivots: [byRegion],
        cells: [],
      },
    ],
  };
}

function mount(input: WorkbookSnapshot = snapshot()): Grid {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGridFromSnapshot(host, input);
  grids.push(grid);
  return grid;
}

/** The items of the dashboard Dash, as the grid holds them. */
const dashboardOf = (grid: Grid) =>
  grid.store.getWorkbook().sheets.find((sheet) => sheet.id === "dash")?.dashboard;

const apply = (grid: Grid, ...patches: DocumentOp[]) => grid.applyTransaction({ patches }).status;

describe("dashboard sheets", () => {
  it("keeps the kind and the items through a snapshot and an added dashboard", () => {
    const store = SheetwriteStore.fromSnapshot(snapshot());
    const restored = SheetwriteStore.fromSnapshot(store.exportSnapshot());

    expect(restored.getDashboard("dash")).toEqual({ items: [pivotItem, slicer] });
    expect(restored.getDashboard("data")).toBeNull();

    const grid = mount();
    expect(grid.addSheet({ name: "Report", kind: "dashboard" }).status).toBe("applied");
    const added = grid.store.getWorkbook().sheets.find((sheet) => sheet.name === "Report");
    expect(added).toMatchObject({ kind: "dashboard", rowCount: 0, columns: [] });
  });

  it("leaves a dashboard unchanged by cell, row, column and sheet-format operations", () => {
    const grid = mount();
    const literal = { kind: "literal" as const, value: 1 };

    expect(
      apply(grid, { op: "set", addr: { sheet: "dash", row: 0, col: 0 }, value: literal }),
    ).toBe("noop");
    expect(apply(grid, { op: "addRows", sheet: "dash", at: 0, count: 1 })).toBe("noop");
    expect(
      apply(grid, {
        op: "addColumns",
        sheet: "dash",
        at: 0,
        columns: [{ key: "x", header: "X", width: 80, type: "text" }],
      }),
    ).toBe("noop");
    expect(apply(grid, { op: "setSheetMeta", sheet: "dash", patch: { frozenRows: 0 } })).toBe(
      "noop",
    );
    expect(apply(grid, { op: "renameSheet", sheet: "dash", name: "Board" })).toBe("applied");
  });

  it("refuses an invalid snapshot dashboard", () => {
    const withCells = snapshot();
    const dash = withCells.sheets[1];
    if (dash === undefined) throw new Error("the fixture has a dashboard");
    dash.rowCount = 2;
    expect(validateWorkbookSnapshot(withCells).ok).toBe(false);

    const onWorksheet = snapshot();
    const data = onWorksheet.sheets[0];
    if (data === undefined) throw new Error("the fixture has a worksheet");
    data.dashboard = { items: [] };
    expect(validateWorkbookSnapshot(onWorksheet).ok).toBe(false);

    const overlapping = snapshot();
    overlapping.sheets[1]?.dashboard?.items.push({ ...slicer, id: "again" });
    expect(validateWorkbookSnapshot(overlapping).ok).toBe(false);

    const rangePivot = snapshot();
    const range = { sheet: "data", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } };
    rangePivot.sheets[1]?.pivots?.splice(0, 1, { ...byRegion, source: { range } });
    expect(validateWorkbookSnapshot(rangePivot).ok).toBe(false);
  });

  it("admits items inside the grid that do not overlap", () => {
    const grid = mount();
    const set = (item: DashboardItem) =>
      apply(grid, { op: "setDashboardItem", sheet: "dash", item });

    expect(set({ ...slicer, id: "wide", box: { x: 4, y: 6, w: 9, h: 2 } })).toBe("rejected");
    expect(set({ ...slicer, id: "under", box: { x: 4, y: 5, w: 4, h: 2 } })).toBe("noop");
    expect(apply(grid, { op: "setDashboardItem", sheet: "data", item: slicer })).toBe("noop");

    expect(set({ ...slicer, id: "below", box: { x: 0, y: 6, w: 12, h: 2 } })).toBe("applied");
    expect(set({ ...slicer, box: { x: 8, y: 0, w: 4, h: 5 }, selected: ["West"] })).toBe("applied");
    expect(dashboardOf(grid)?.items.map((item) => item.id)).toEqual(["sales", "region", "below"]);
  });

  it("keeps a pivot item whose pivot is removed, and undo brings the pivot back", () => {
    const grid = mount();

    expect(apply(grid, { op: "removePivot", sheet: "dash", id: "by-region" })).toBe("applied");
    expect(dashboardOf(grid)?.items).toEqual([pivotItem, slicer]);

    grid.undo();
    expect(grid.getPivots("dash")).toEqual([byRegion]);

    expect(
      apply(
        grid,
        { op: "removeDashboardItem", sheet: "dash", id: "sales" },
        { op: "removePivot", sheet: "dash", id: "by-region" },
      ),
    ).toBe("applied");
    grid.undo();
    expect(dashboardOf(grid)?.items).toEqual([pivotItem, slicer]);
    expect(grid.getPivots("dash")).toEqual([byRegion]);
  });

  it("undoes and redoes a slicer selection", () => {
    const grid = mount();
    const west = { ...slicer, selected: ["West"] };

    expect(apply(grid, { op: "setDashboardItem", sheet: "dash", item: west })).toBe("applied");
    grid.undo();
    expect(dashboardOf(grid)?.items[1]).toEqual(slicer);
    grid.redo();
    expect(dashboardOf(grid)?.items[1]).toEqual(west);
  });
});

describe("dashboard rebase", () => {
  const item = (id: string, x: number): DocumentOp => ({
    op: "setDashboardItem",
    sheet: "dash",
    item: { ...slicer, id, box: { x, y: 6, w: 4, h: 2 } },
  });

  it("rebases items that do not overlap and conflicts on overlap", () => {
    expect(rebaseDocumentOperations([item("left", 0)], [item("right", 4)]).status).toBe("rebased");
    expect(rebaseDocumentOperations([item("left", 0)], [item("near", 2)]).status).toBe("conflict");
    expect(rebaseDocumentOperations([item("left", 0)], [item("left", 4)]).status).toBe("conflict");
  });
});

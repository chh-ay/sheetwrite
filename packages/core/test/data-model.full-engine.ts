// Key checks need the full engine, and engine selection is process-wide,
// so `data-model.test.ts` runs this file in its own process.
import { beforeAll, expect, it } from "bun:test";

import * as formulas from "@sheetwrite/formulas";

import {
  createGridFromSnapshot,
  initSheetwrite,
  releaseEngineMemory,
  SheetwriteStore,
} from "../src/index.js";
import type {
  DocumentOp,
  PivotDefinition,
  TableRelationship,
  WorkbookSnapshot,
} from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite(undefined, formulas);
});

const relationship: TableRelationship = {
  id: "orders-customers",
  from: { table: "orders", column: "customer" },
  to: { table: "customers", column: "id" },
};

const text = (row: number, col: number, value: string) => ({
  rowOffset: row,
  colOffset: col,
  value: { kind: "literal" as const, value },
});

/** Orders A1:A5 refer to C1, c2 (case differs), a blank key and C9; customers C1:C4 hold C1-C3. */
const snapshot = (): WorkbookSnapshot => ({
  schemaVersion: 1,
  workbook: { activeSheet: "data", dataModel: { relationships: [relationship] } },
  sheets: [
    {
      id: "data",
      name: "Data",
      order: 0,
      rowCount: 10,
      columns: ["A", "B", "C"].map((key) => ({ key, header: key, width: 80, type: "text" })),
      tables: [
        {
          id: "orders",
          name: "Orders",
          range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 4, col: 0 } },
          columns: [{ id: "customer", name: "Customer" }],
          headerRow: true,
          totalsRow: false,
        },
        {
          id: "customers",
          name: "Customers",
          range: { sheet: "data", start: { row: 0, col: 2 }, end: { row: 3, col: 2 } },
          columns: [{ id: "id", name: "ID" }],
          headerRow: true,
          totalsRow: false,
        },
      ],
      cells: [
        {
          startRow: 0,
          startCol: 0,
          rowCount: 5,
          colCount: 3,
          cells: [
            text(0, 0, "Customer"),
            text(1, 0, "C1"),
            text(2, 0, "c2"),
            text(4, 0, "C9"),
            text(0, 2, "ID"),
            text(1, 2, "C1"),
            text(2, 2, "C2"),
            text(3, 2, "C3"),
          ],
        },
      ],
    },
  ],
});

it("checks keys from the current cells and keeps checking after a memory release", async () => {
  const store = SheetwriteStore.fromSnapshot(snapshot());
  try {
    expect(store.getRelationshipStatus(relationship.id)).toEqual({ status: "ok", unmatched: 1 });
    expect(store.getRelationshipStatus("unknown")).toEqual({ status: "unavailable" });

    const addr = { sheet: "data", row: 3, col: 2 };
    const edit = { op: "set" as const, addr, value: { kind: "literal" as const, value: "c1" } };
    expect(store.applyTransaction({ patches: [edit] }).status).toBe("applied");
    expect(store.getRelationshipStatus(relationship.id)).toEqual({
      status: "duplicateKey",
      rows: [0, 2],
    });

    await releaseEngineMemory();
    expect(store.getRelationshipStatus(relationship.id)).toEqual({
      status: "duplicateKey",
      rows: [0, 2],
    });

    store.removeRelationship(relationship.id);
    expect(store.getRelationshipStatus(relationship.id)).toEqual({ status: "unavailable" });
  } finally {
    store.dispose();
  }
});

it("keeps model pivot results equal to a flattened range through edits, undo and transfer", async () => {
  const restore = installCanvasTestStubs();
  const input = snapshot();
  const data = input.sheets[0];
  const orders = data?.tables?.find((table) => table.id === "orders");
  const block = data?.cells[0];
  if (!data || !orders || !block) throw new Error("the fixture needs orders and cells");
  data.columns = ["A", "B", "C", "D", "E", "F"].map((key) => ({
    key,
    header: key,
    width: 80,
    type: "text",
  }));
  orders.range.end.col = 1;
  orders.columns.push({ id: "amount", name: "Amount" });
  block.colCount = 6;
  block.cells.push(text(0, 1, "Amount"), text(0, 4, "ID"), text(0, 5, "Amount"));
  block.cells.push(text(1, 4, "C1"), text(2, 4, "C2"));
  for (let row = 1; row <= 4; row++) {
    for (const col of [1, 5]) {
      block.cells.push({ rowOffset: row, colOffset: col, value: { kind: "literal", value: row } });
    }
  }
  input.sheets.push({
    id: "report",
    name: "Report",
    order: 1,
    rowCount: 30,
    columns: data.columns.map((column) => ({ ...column })),
    cells: [],
  });
  input.workbook.activeSheet = "report";
  const host = document.createElement("div");
  document.body.append(host);
  const grid = createGridFromSnapshot(host, input);
  const pivot: PivotDefinition = {
    id: "related",
    name: "Related",
    anchor: { row: 0, col: 0 },
    source: {
      model: {
        table: "orders",
        fields: [
          { table: "customers", column: "id" },
          { table: "orders", column: "amount" },
        ],
      },
    },
    rows: [0],
    columns: [],
    values: [{ field: 1, aggregation: "SUM" }],
  };
  const compare = () => {
    const actual = grid.getPivotResult("report", "related");
    const flat = grid.getPivotResult("report", "flat");
    expect(actual?.status).toBe("ok");
    expect(actual?.cells).toEqual(flat?.cells);
    expect(actual?.rows).toBe(flat?.rows);
    expect(actual?.cols).toBe(flat?.cols);
  };
  try {
    expect(grid.setPivot(pivot).status).toBe("applied");
    expect(
      grid.setPivot({
        ...pivot,
        id: "flat",
        name: "Flat",
        anchor: { row: 15, col: 0 },
        source: { range: { sheet: "data", start: { row: 0, col: 4 }, end: { row: 4, col: 5 } } },
      }).status,
    ).toBe("applied");
    compare();

    expect(
      grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "data", row: 1, col: 2 },
            value: { kind: "literal", value: "C9" },
          },
          {
            op: "set",
            addr: { sheet: "data", row: 1, col: 4 },
            value: { kind: "literal", value: null },
          },
          {
            op: "set",
            addr: { sheet: "data", row: 4, col: 4 },
            value: { kind: "literal", value: "C9" },
          },
        ],
      }).status,
    ).toBe("applied");
    compare();
    grid.undo();
    compare();
    grid.redo();
    compare();

    expect(
      grid.applyTransaction({ patches: [{ op: "removeRelationship", id: relationship.id }] })
        .status,
    ).toBe("applied");
    expect(grid.getPivotResult("report", "related")?.error).toBe("#REF!");
    grid.undo();
    compare();

    expect(
      grid.applyTransaction({
        patches: [{ op: "removeTable", sheet: "data", tableId: "customers" }],
      }).status,
    ).toBe("applied");
    expect(grid.getPivotResult("report", "related")?.error).toBe("#REF!");
    grid.undo();
    compare();

    for (const patch of [
      { op: "addRows", sheet: "data", at: 2, count: 1 },
      {
        op: "addColumns",
        sheet: "data",
        at: 1,
        columns: [{ key: "inserted", header: "", type: "text", width: 80 }],
      },
    ] satisfies DocumentOp[]) {
      expect(grid.applyTransaction({ patches: [patch] }).status).toBe("applied");
      compare();
      grid.undo();
      compare();
    }

    await releaseEngineMemory();
    compare();
    expect(grid.getPivots().find((definition) => definition.id === "related")?.source).toEqual(
      pivot.source,
    );
  } finally {
    grid.destroy();
    host.remove();
    restore();
  }
});

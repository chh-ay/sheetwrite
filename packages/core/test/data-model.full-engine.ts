// Key checks need the full engine, and engine selection is process-wide,
// so `data-model.test.ts` runs this file in its own process.
import { beforeAll, expect, it } from "bun:test";

import * as formulas from "@sheetwrite/formulas";

import {
  createGridFromSnapshot,
  initSheetwrite,
  releaseEngineMemory,
  setXlsxWorkbookBackend,
  SheetwriteStore,
  toXlsxWorkbook,
} from "../src/index.js";
import type {
  DashboardExport,
  DocumentOp,
  PivotDefinition,
  TableRelationship,
  WorkbookSnapshot,
} from "../src/index.js";
import { loadPanels } from "../src/panels/panel-loader.js";
import { installCanvasTestStubs } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite({ engine: formulas });
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

it("refuses a relationship in the panel while its lookup keys repeat", async () => {
  const restore = installCanvasTestStubs();
  const input = snapshot();
  delete input.workbook.dataModel;
  const host = document.createElement("div");
  document.body.append(host);
  const grid = createGridFromSnapshot(host, input);
  const press = (target: Element | null) => {
    if (target === null) throw new Error("missing control");
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  };
  const panelText = () => host.querySelector(".sheetwrite-panel")?.textContent ?? "";
  const setId = (value: string) =>
    grid.applyTransaction({
      patches: [
        { op: "set", addr: { sheet: "data", row: 3, col: 2 }, value: { kind: "literal", value } },
      ],
    });
  try {
    expect(setId("c1").status).toBe("applied");
    (await loadPanels(grid)).openDataModelPanel(grid);
    const save = host.querySelector('[data-focus-key="save-relationship"]');

    // Orders is the data table and Customers the lookup table; each has one key column.
    const [dataTable, , lookupTable] = host.querySelectorAll<HTMLSelectElement>(
      ".sheetwrite-panel select",
    );
    if (dataTable === undefined || lookupTable === undefined) throw new Error("missing pickers");
    for (const [picker, value] of [
      [dataTable, "orders"],
      [lookupTable, "customers"],
    ] as const) {
      picker.value = value;
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    }
    press(save);
    expect(grid.store.getWorkbook().dataModel).toBeUndefined();
    expect(panelText()).toContain("The lookup table repeats a key in rows 1 and 3.");

    expect(setId("C3").status).toBe("applied");
    press(save);
    expect(grid.store.getWorkbook().dataModel?.relationships).toHaveLength(1);
    expect(panelText()).toContain("1 keys match no row and show as blank.");
  } finally {
    grid.destroy();
    host.remove();
    restore();
  }
});

/** Orders with amounts on Data, a lookup-flattened copy in E:F, and an empty Report sheet. */
const mountReport = () => {
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
  const destroy = () => {
    grid.destroy();
    host.remove();
    restore();
  };
  return { grid, destroy };
};

it("keeps model pivot results equal to a flattened range through edits, undo and transfer", async () => {
  const { grid, destroy } = mountReport();
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
    destroy();
  }
});

it("evaluates a measure in each pivot cell like the flattened rows of that cell", async () => {
  const { grid, destroy } = mountReport();
  const measure = {
    id: "mean",
    name: "Mean Amount",
    table: "orders",
    formula: "=SUM(Orders[Amount])/COUNT(Orders[Amount])",
  };
  const modelPivot = (values: PivotDefinition["values"]): PivotDefinition => ({
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
    values,
  });
  const body = (id: string) => grid.getPivotResult("report", id)?.cells.slice(2);
  const compare = () => {
    expect(grid.getPivotResult("report", "related")?.status).toBe("ok");
    expect(body("related")).toEqual(body("flat"));
  };
  try {
    const store = grid.store;
    if (!(store instanceof SheetwriteStore)) throw new Error("the grid must use a SheetwriteStore");
    expect(store.setMeasure(measure).status).toBe("applied");
    expect(store.getMeasureStatus(measure.id)).toEqual({ status: "ok" });
    expect(grid.setPivot(modelPivot([{ measure: measure.id }])).status).toBe("applied");
    expect(
      grid.setPivot({
        ...modelPivot([{ field: 1, aggregation: "AVERAGE" }]),
        id: "flat",
        name: "Flat",
        anchor: { row: 15, col: 0 },
        source: { range: { sheet: "data", start: { row: 0, col: 4 }, end: { row: 4, col: 5 } } },
      }).status,
    ).toBe("applied");
    expect(grid.getPivotResult("report", "related")?.cells[1]).toBe("Mean Amount");
    compare();

    const edits: DocumentOp[] = [1, 5].map((col) => ({
      op: "set",
      addr: { sheet: "data", row: 2, col },
      value: { kind: "literal", value: 40 },
    }));
    expect(grid.applyTransaction({ patches: edits }).status).toBe("applied");
    compare();
    grid.undo();
    compare();

    const removal: DocumentOp = { op: "removeMeasure", id: measure.id };
    expect(grid.applyTransaction({ patches: [removal] }).status).toBe("applied");
    expect(grid.getPivotResult("report", "related")?.error).toBe("#REF!");
    grid.undo();
    compare();

    expect(
      grid.setPivot({ ...modelPivot([{ measure: measure.id }]), source: { table: "orders" } })
        .status,
    ).not.toBe("applied");
    await releaseEngineMemory();
    compare();
  } finally {
    destroy();
  }
});

it("adds a related table's column to a table pivot from the field list, as one undo step", async () => {
  const restore = installCanvasTestStubs();
  const input = snapshot();
  const data = input.sheets[0];
  if (data === undefined) throw new Error("the fixture needs its data sheet");
  data.rowCount = 20;
  const host = document.createElement("div");
  document.body.append(host);
  const grid = createGridFromSnapshot(host, input);
  const press = (target: Element | null | undefined) => {
    if (target == null) throw new Error("missing control");
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  };
  const runMenu = (button: string, entry: string) => {
    press(host.querySelector(`[aria-label="${button}"]`));
    press(
      [...host.querySelectorAll<HTMLElement>('.sheetwrite-panel-menu [role="menuitem"]')].find(
        (candidate) => candidate.textContent === entry,
      ),
    );
  };
  const pivot: PivotDefinition = {
    id: "orders",
    name: "Orders",
    source: { table: "orders" },
    anchor: { row: 6, col: 0 },
    rows: [],
    columns: [],
    values: [{ field: 0, aggregation: "COUNTA" }],
  };
  try {
    expect(grid.setPivot(pivot, "data").status).toBe("applied");
    (await loadPanels(grid)).openPivotPanel(grid, "data", "orders");
    expect(host.querySelector(".sheetwrite-panel")?.textContent).toContain("Related: Customers");

    runMenu("Customers › ID field actions", "Add to Rows");
    const added = grid.getPivots("data")[0];
    expect(added?.source).toEqual({
      model: {
        table: "orders",
        fields: [
          { table: "orders", column: "customer" },
          { table: "customers", column: "id" },
        ],
      },
    });
    expect(added?.rows).toEqual([1]);
    expect(grid.getPivotResult("data", "orders")?.status).toBe("ok");
    // The column moves from the related section to the pivot's own fields, named with its table.
    const panelText = host.querySelector(".sheetwrite-panel")?.textContent ?? "";
    expect(panelText.includes("Related: Customers")).toBe(false);
    expect(panelText.includes("Customers › ID")).toBe(true);

    grid.undo();
    expect(grid.getPivots("data")[0]).toEqual(pivot);
  } finally {
    grid.destroy();
    host.remove();
    restore();
  }
});

it("passes each worksheet pivot's current output, measures included, to the XLSX export", async () => {
  const { grid, destroy } = mountReport();
  let passed: readonly DashboardExport[] | undefined;
  setXlsxWorkbookBackend({
    name: "capture",
    async toXlsxWorkbook(_snapshot, _options, context) {
      passed = context?.pivotOutputs;
      return new Uint8Array();
    },
    async fromXlsxWorkbook() {
      throw new Error("not used");
    },
  });
  try {
    const store = grid.store;
    if (!(store instanceof SheetwriteStore)) throw new Error("the grid must use a SheetwriteStore");
    const measure = {
      id: "twice",
      name: "Twice",
      table: "orders",
      formula: "=SUM(Orders[Amount])*2",
    };
    expect(store.setMeasure(measure).status).toBe("applied");
    expect(
      grid.setPivot({
        id: "related",
        name: "Related",
        anchor: { row: 2, col: 1 },
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
        values: [{ field: 1, aggregation: "SUM", numberFormat: "0.0" }, { measure: "twice" }],
      }).status,
    ).toBe("applied");
    const result = grid.getPivotResult("report", "related");
    if (result?.status !== "ok") throw new Error("the pivot computes");

    await toXlsxWorkbook(grid);

    const item = passed?.find((entry) => entry.sheet === "report")?.items[0];
    const rows = Array.from({ length: result.rows }, (_, row) =>
      result.cells.slice(row * result.cols, (row + 1) * result.cols),
    );
    expect(item?.id).toBe("related");
    expect(item?.cells).toEqual(rows);
    // The total row holds both values: the Sum and the measure, which doubles it.
    const total = item?.cells.at(-1);
    expect(total?.[0]).toBe("Total");
    expect(total?.[2]).toBe(Number(total?.[1]) * 2);
    expect(item?.numberFormats.at(-1)).toEqual([null, "0.0", null]);
    expect(item?.numberFormats[0]).toEqual([null, null, null]);
  } finally {
    setXlsxWorkbookBackend(null);
    destroy();
  }
});

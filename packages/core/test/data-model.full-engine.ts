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
import type { TableRelationship, WorkbookSnapshot } from "../src/index.js";
import { loadPanels } from "../src/panels/panel-loader.js";
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

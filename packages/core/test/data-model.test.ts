import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { validateDocumentOperationShape } from "../src/document-protocol.js";
import {
  type Column,
  createGrid,
  createGridFromSnapshot,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  MemoryPersistenceAdapter,
  rebaseDocumentOperations,
  SheetwriteStore,
  SyncCoordinator,
  type TableRelationship,
  validateWorkbookSnapshot,
  type Workbook,
  type WorkbookSnapshot,
  type WorkbookTable,
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

const columns = (count: number): Column[] =>
  Array.from({ length: count }, (_, index) => ({
    key: `c${index}`,
    header: `C${index}`,
    width: 80,
    type: "text" as const,
  }));

/** A two-column table on `sheet` whose rectangle starts at column `col`. */
const table = (
  id: string,
  sheet: string,
  col: number,
  columnIds: [string, string],
): WorkbookTable => ({
  id,
  name: id,
  range: { sheet, start: { row: 0, col }, end: { row: 4, col: col + 1 } },
  columns: columnIds.map((columnId) => ({ id: columnId, name: columnId })),
  headerRow: true,
  totalsRow: false,
});

const workbook = (): Workbook => ({
  activeSheet: "data",
  sheets: [
    {
      id: "data",
      name: "Data",
      rowCount: 10,
      columns: columns(6),
      tables: [
        table("orders", "data", 0, ["customer", "amount"]),
        table("customers", "data", 2, ["id", "region"]),
        table("regions", "data", 4, ["code", "name"]),
      ],
    },
    { id: "other", name: "Other", rowCount: 10, columns: columns(2) },
  ],
});

const ordersToCustomers: TableRelationship = {
  id: "r-orders-customers",
  from: { table: "orders", column: "customer" },
  to: { table: "customers", column: "id" },
};

const customersToRegions: TableRelationship = {
  id: "r-customers-regions",
  from: { table: "customers", column: "region" },
  to: { table: "regions", column: "code" },
};

const snapshot = (relationships: TableRelationship[]): WorkbookSnapshot => ({
  schemaVersion: 1,
  workbook: { activeSheet: "data", dataModel: { relationships } },
  sheets: workbook().sheets.map((sheet, order) => ({
    id: sheet.id,
    name: sheet.name,
    order,
    rowCount: sheet.rowCount,
    columns: sheet.columns,
    ...(sheet.tables ? { tables: sheet.tables } : {}),
    cells: [],
  })),
});

const grids: Grid[] = [];
const mountGrid = (): Grid => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGrid(host, { workbook: workbook() });
  grids.push(grid);
  return grid;
};
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
});

const revenueMeasure = {
  id: "revenue",
  name: "Revenue",
  table: "orders",
  formula: "=SUM(orders[amount])",
};

describe("saved measures", () => {
  it("preserves measures through relationship edits, snapshot loading, undo and redo", () => {
    const grid = mountGrid();
    const apply = (operation: unknown) =>
      grid.applyTransaction({ patches: [operation as DocumentOp] }).status;

    expect(apply({ op: "setMeasure", measure: revenueMeasure })).toBe("applied");
    expect(apply({ op: "setRelationship", relationship: ordersToCustomers })).toBe("applied");
    expect(apply({ op: "removeRelationship", id: ordersToCustomers.id })).toBe("applied");
    expect(grid.store.getWorkbook().dataModel).toEqual({
      relationships: [],
      measures: [revenueMeasure],
    });

    const exported = grid.store.exportSnapshot?.();
    if (!exported) throw new Error("snapshot export is required");
    expect(validateWorkbookSnapshot(exported).ok).toBe(true);
    const restored = SheetwriteStore.fromSnapshot(exported);
    try {
      expect(restored.getWorkbook().dataModel).toEqual(grid.store.getWorkbook().dataModel);
    } finally {
      restored.dispose();
    }

    expect(apply({ op: "removeMeasure", id: revenueMeasure.id })).toBe("applied");
    expect(grid.store.getWorkbook().dataModel).toBeUndefined();
    grid.undo();
    expect(grid.store.getWorkbook().dataModel?.measures).toEqual([revenueMeasure]);
    grid.redo();
    expect(grid.store.getWorkbook().dataModel).toBeUndefined();
  });

  it("reports a measure's syntax and home table from the saved model on any engine", () => {
    const grid = mountGrid();
    const store = grid.store;
    if (!(store instanceof SheetwriteStore)) throw new Error("the grid must use a SheetwriteStore");
    const broken = { ...revenueMeasure, id: "broken", name: "Broken", formula: "=SUM(" };
    expect(store.setMeasure(revenueMeasure).status).toBe("applied");
    expect(store.setMeasure(broken).status).toBe("applied");

    expect(store.getMeasureStatus(revenueMeasure.id)).toEqual({ status: "ok" });
    expect(store.getMeasureStatus(broken.id)).toEqual({ status: "syntax" });
    expect(store.getMeasureStatus("unknown")).toEqual({ status: "unavailable" });

    const removal: DocumentOp = { op: "removeTable", sheet: "data", tableId: "orders" };
    expect(grid.applyTransaction({ patches: [removal] }).status).toBe("applied");
    expect(store.getMeasureStatus(revenueMeasure.id)).toEqual({ status: "missingTable" });
  });

  it("renames table, column and measure references in measure formulas, undone in one step", () => {
    const grid = mountGrid();
    const apply = (operation: DocumentOp) => grid.applyTransaction({ patches: [operation] }).status;
    const share = {
      id: "share",
      name: "Share",
      table: "customers",
      formula: "=[revenue] / COUNTA(Customers[id]) + orders[@Amount]",
    };
    const formulas = () =>
      grid.store.getWorkbook().dataModel?.measures?.map((measure) => measure.formula);
    expect(apply({ op: "setMeasure", measure: revenueMeasure })).toBe("applied");
    expect(apply({ op: "setMeasure", measure: share })).toBe("applied");

    const renamedTable: DocumentOp = {
      op: "updateTable",
      sheet: "data",
      tableId: "orders",
      patch: {
        name: "Sales",
        columns: [
          { id: "customer", name: "customer" },
          { id: "amount", name: "Net" },
        ],
      },
    };
    expect(apply(renamedTable)).toBe("applied");
    expect(formulas()).toEqual([
      "=SUM(Sales[Net])",
      "=[revenue] / COUNTA(Customers[id]) + Sales[@Net]",
    ]);

    expect(apply({ op: "setMeasure", measure: { ...revenueMeasure, name: "Income" } })).toBe(
      "applied",
    );
    expect(formulas()).toEqual([
      "=SUM(orders[amount])",
      "=[Income] / COUNTA(Customers[id]) + Sales[@Net]",
    ]);

    grid.undo();
    expect(formulas()).toEqual([
      "=SUM(Sales[Net])",
      "=[Revenue] / COUNTA(Customers[id]) + Sales[@Net]",
    ]);
    grid.undo();
    expect(formulas()).toEqual([
      "=SUM(orders[amount])",
      "=[Revenue] / COUNTA(Customers[id]) + orders[@amount]",
    ]);
  });

  it("validates saved measure names and formulas without parsing them in TypeScript", () => {
    expect(validateDocumentOperationShape({ op: "setMeasure", measure: revenueMeasure })).toEqual(
      [],
    );
    for (const patch of [{ name: "" }, { name: "[Revenue]" }, { formula: "SUM(orders[amount])" }]) {
      expect(
        validateDocumentOperationShape({
          op: "setMeasure",
          measure: { ...revenueMeasure, ...patch },
        }).length,
      ).toBeGreaterThan(0);
    }
  });
});

describe("relationship shape", () => {
  it("validates setRelationship and removeRelationship operations", () => {
    expect(
      validateDocumentOperationShape({ op: "setRelationship", relationship: ordersToCustomers }),
    ).toEqual([]);
    expect(validateDocumentOperationShape({ op: "removeRelationship", id: "r" })).toEqual([]);
    expect(
      validateDocumentOperationShape({
        op: "setRelationship",
        relationship: { ...ordersToCustomers, to: { table: "customers" } },
      }),
    ).toContainEqual(expect.objectContaining({ path: "operation.relationship.to.column" }));
  });

  it("refuses saved models with a cycle, a repeated table pair or a self link", () => {
    const cycle: TableRelationship = {
      id: "r-regions-orders",
      from: { table: "regions", column: "name" },
      to: { table: "orders", column: "customer" },
    };
    const reversedPair: TableRelationship = {
      id: "r-customers-orders",
      from: { table: "customers", column: "id" },
      to: { table: "orders", column: "customer" },
    };
    const selfLink: TableRelationship = {
      id: "r-self",
      from: { table: "orders", column: "customer" },
      to: { table: "orders", column: "amount" },
    };

    for (const relationships of [
      [ordersToCustomers, customersToRegions, cycle],
      [ordersToCustomers, reversedPair],
      [selfLink],
      [ordersToCustomers, { ...customersToRegions, id: ordersToCustomers.id }],
    ]) {
      expect(validateWorkbookSnapshot(snapshot(relationships)).ok).toBe(false);
    }
    expect(validateWorkbookSnapshot(snapshot([ordersToCustomers, customersToRegions])).ok).toBe(
      true,
    );
  });
});

describe("relationships in the store", () => {
  it("round-trips through a snapshot and drops an empty model", () => {
    const store = SheetwriteStore.fromSnapshot(snapshot([ordersToCustomers, customersToRegions]));
    const empty = SheetwriteStore.fromSnapshot(snapshot([]));
    try {
      expect(store.getRelationships()).toEqual([ordersToCustomers, customersToRegions]);
      expect(store.exportSnapshot().workbook.dataModel).toEqual({
        relationships: [ordersToCustomers, customersToRegions],
      });
      expect(empty.exportSnapshot().workbook.dataModel).toBeUndefined();
    } finally {
      store.dispose();
      empty.dispose();
    }
  });

  it("admits a relationship only between existing columns and without a cycle", () => {
    const store = SheetwriteStore.fromSnapshot(snapshot([]));
    try {
      expect(store.setRelationship(ordersToCustomers).status).toBe("applied");
      expect(store.setRelationship(customersToRegions).status).toBe("applied");

      const missingColumn = {
        ...ordersToCustomers,
        id: "r2",
        to: { table: "regions", column: "x" },
      };
      const missingTable = { ...ordersToCustomers, id: "r3", to: { table: "gone", column: "id" } };
      const cycle: TableRelationship = {
        id: "r4",
        from: { table: "regions", column: "name" },
        to: { table: "orders", column: "customer" },
      };
      for (const refused of [missingColumn, missingTable, cycle]) {
        expect(store.setRelationship(refused).status).not.toBe("applied");
      }

      // Replacing by ID may change the key columns of the same pair.
      const replaced = { ...ordersToCustomers, from: { table: "orders", column: "amount" } };
      expect(store.setRelationship(replaced).status).toBe("applied");
      expect(store.getRelationships()).toEqual([replaced, customersToRegions]);

      expect(store.removeRelationship("unknown").status).not.toBe("applied");
      expect(store.removeRelationship(replaced.id).status).toBe("applied");
      expect(store.getRelationships()).toEqual([customersToRegions]);
    } finally {
      store.dispose();
    }
  });
});

describe("relationship history", () => {
  it("undoes and redoes each relationship change as one step", () => {
    const grid = mountGrid();
    const apply = (patch: DocumentOp) => grid.applyTransaction({ patches: [patch] }).status;
    const relationships = () => grid.store.getWorkbook().dataModel?.relationships ?? [];
    const renamedKey = { ...ordersToCustomers, from: { table: "orders", column: "amount" } };

    expect(apply({ op: "setRelationship", relationship: ordersToCustomers })).toBe("applied");
    expect(apply({ op: "setRelationship", relationship: renamedKey })).toBe("applied");
    expect(apply({ op: "removeRelationship", id: ordersToCustomers.id })).toBe("applied");
    expect(relationships()).toEqual([]);

    grid.undo();
    expect(relationships()).toEqual([renamedKey]);
    grid.undo();
    expect(relationships()).toEqual([ordersToCustomers]);
    grid.undo();
    expect(grid.store.getWorkbook().dataModel).toBeUndefined();
    grid.redo();
    expect(relationships()).toEqual([ordersToCustomers]);
  });

  it("keeps a relationship whose table is removed, so undo restores a working model", () => {
    const grid = mountGrid();
    grid.applyTransaction({
      patches: [{ op: "setRelationship", relationship: ordersToCustomers }],
    });

    expect(
      grid.applyTransaction({
        patches: [{ op: "removeTable", sheet: "data", tableId: "customers" }],
      }).status,
    ).toBe("applied");
    expect(grid.store.getWorkbook().dataModel?.relationships).toEqual([ordersToCustomers]);

    // A saved relationship to a removed table is valid in a snapshot.
    const exported = grid.store.exportSnapshot?.();
    if (!exported) throw new Error("the store must export snapshots");
    expect(validateWorkbookSnapshot(exported).ok).toBe(true);

    grid.undo();
    const tables = grid.store.getWorkbook().sheets[0]?.tables?.map((entry) => entry.id);
    expect(tables).toContain("customers");
    expect(grid.store.getWorkbook().dataModel?.relationships).toEqual([ordersToCustomers]);
  });
});

describe("relationship collaboration", () => {
  it("conflicts on concurrent model changes and on a removed or changed table", () => {
    const local: DocumentOp[] = [{ op: "setRelationship", relationship: ordersToCustomers }];

    expect(
      rebaseDocumentOperations(local, [{ op: "addRows", sheet: "data", at: 0, count: 2 }]),
    ).toEqual({ status: "rebased", operations: local });
    expect(
      rebaseDocumentOperations(local, [{ op: "removeTable", sheet: "data", tableId: "regions" }]),
    ).toEqual({ status: "rebased", operations: local });

    for (const remote of [
      { op: "setRelationship", relationship: customersToRegions },
      { op: "removeRelationship", id: "anything" },
      { op: "setMeasure", measure: revenueMeasure },
      { op: "removeMeasure", id: "anything" },
      { op: "removeTable", sheet: "data", tableId: "customers" },
      { op: "updateTable", sheet: "data", tableId: "orders", patch: { name: "Sales" } },
    ] satisfies DocumentOp[]) {
      expect(rebaseDocumentOperations(local, [remote])).toMatchObject({
        status: "conflict",
        conflict: { code: "overlapping-edit" },
      });
    }
    expect(rebaseDocumentOperations(local, [{ op: "removeSheet", sheet: "other" }])).toMatchObject({
      status: "conflict",
      conflict: { code: "sheet-removed" },
    });
  });

  it("conflicts on a measure write and a concurrent table or column rename, either way", () => {
    const measure: DocumentOp = { op: "setMeasure", measure: revenueMeasure };
    const renames: DocumentOp[] = [
      { op: "updateTable", sheet: "data", tableId: "orders", patch: { name: "Sales" } },
      {
        op: "updateTable",
        sheet: "data",
        tableId: "customers",
        patch: {
          columns: [
            { id: "id", name: "id" },
            { id: "region", name: "Area" },
          ],
        },
      },
    ];
    for (const rename of renames) {
      for (const [local, remote] of [
        [measure, rename],
        [rename, measure],
      ]) {
        expect(rebaseDocumentOperations([local!], [remote!])).toMatchObject({
          status: "conflict",
          conflict: { code: "overlapping-edit" },
        });
      }
    }

    const styled: DocumentOp = {
      op: "updateTable",
      sheet: "data",
      tableId: "orders",
      patch: { headerRow: true },
    };
    expect(rebaseDocumentOperations([measure], [styled])).toEqual({
      status: "rebased",
      operations: [measure],
    });
  });

  it("delivers relationship and measure changes to a synced peer", async () => {
    const base = { ...snapshot([]), documentId: "model-doc", version: 0 };
    const adapter = new MemoryPersistenceAdapter(base);
    const senderHost = document.createElement("div");
    const peerHost = document.createElement("div");
    document.body.append(senderHost, peerHost);
    const sender = createGridFromSnapshot(senderHost, structuredClone(base));
    const peer = createGridFromSnapshot(peerHost, structuredClone(base));
    grids.push(sender, peer);
    const options = { documentId: "model-doc", serverVersion: 0 };
    const senderSync = new SyncCoordinator(sender, adapter, options);
    const peerSync = new SyncCoordinator(peer, adapter, options);
    try {
      expect(
        sender.applyTransaction({
          patches: [
            { op: "setRelationship", relationship: ordersToCustomers },
            { op: "setMeasure", measure: revenueMeasure },
          ],
        }).status,
      ).toBe("applied");
      expect(await senderSync.sendNext()).toMatchObject({ status: "applied", version: 1 });

      const tail = await adapter.commit({
        documentId: "model-doc",
        baseVersion: 0,
        clientMutationId: "read-tail",
        operations: [],
      });
      if (tail.status !== "conflict" || !tail.operationsSinceBase) {
        throw new Error("the adapter must return the committed version");
      }
      for (const version of tail.operationsSinceBase) {
        await peerSync.applyVersionedOperation(version);
      }
      expect(peer.store.getWorkbook().dataModel).toEqual({
        relationships: [ordersToCustomers],
        measures: [revenueMeasure],
      });
    } finally {
      senderSync.destroy();
      peerSync.destroy();
    }
  });
});

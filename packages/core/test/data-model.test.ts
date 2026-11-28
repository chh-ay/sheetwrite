import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { validateDocumentOperationShape } from "../src/document-protocol.js";
import {
  type Column,
  createGrid,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  rebaseDocumentOperations,
  type SavedQuery,
  SheetwriteStore,
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

let restore_stubs: () => void;
beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
});
afterEach(() => restore_stubs());

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
  column_ids: [string, string],
): WorkbookTable => ({
  id,
  name: id,
  range: { sheet, start: { row: 0, col }, end: { row: 4, col: col + 1 } },
  columns: column_ids.map((column_id) => ({ id: column_id, name: column_id })),
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

const orders_to_customers: TableRelationship = {
  id: "r-orders-customers",
  from: { table: "orders", column: "customer" },
  to: { table: "customers", column: "id" },
};

const customers_to_regions: TableRelationship = {
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
const mount_grid = (): Grid => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const grid = createGrid(host, { workbook: workbook() });
  grids.push(grid);
  return grid;
};
afterEach(() => {
  for (const grid of grids.splice(0)) grid.destroy();
});

const revenue_measure = {
  id: "revenue",
  name: "Revenue",
  table: "orders",
  formula: "=SUM(orders[amount])",
};

describe("saved measures", () => {
  it("preserves measures through relationship edits, snapshot loading, undo and redo", () => {
    const grid = mount_grid();
    const apply = (operation: unknown) =>
      grid.applyTransaction({ patches: [operation as DocumentOp] }).status;

    expect(apply({ op: "setMeasure", measure: revenue_measure })).toBe("applied");
    expect(apply({ op: "setRelationship", relationship: orders_to_customers })).toBe("applied");
    expect(apply({ op: "removeRelationship", id: orders_to_customers.id })).toBe("applied");
    expect(grid.store.getWorkbook().dataModel).toEqual({
      relationships: [],
      measures: [revenue_measure],
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

    expect(apply({ op: "removeMeasure", id: revenue_measure.id })).toBe("applied");
    expect(grid.store.getWorkbook().dataModel).toBeUndefined();
    grid.undo();
    expect(grid.store.getWorkbook().dataModel?.measures).toEqual([revenue_measure]);
    grid.redo();
    expect(grid.store.getWorkbook().dataModel).toBeUndefined();
  });

  it("reports a measure's syntax and home table from the saved model on any engine", () => {
    const grid = mount_grid();
    const store = grid.store;
    if (!(store instanceof SheetwriteStore)) throw new Error("the grid must use a SheetwriteStore");
    const broken = { ...revenue_measure, id: "broken", name: "Broken", formula: "=SUM(" };
    expect(store.setMeasure(revenue_measure).status).toBe("applied");
    expect(store.setMeasure(broken).status).toBe("applied");

    expect(store.getMeasureStatus(revenue_measure.id)).toEqual({ status: "ok" });
    expect(store.getMeasureStatus(broken.id)).toEqual({ status: "syntax" });
    expect(store.getMeasureStatus("unknown")).toEqual({ status: "unavailable" });

    const removal: DocumentOp = { op: "removeTable", sheet: "data", tableId: "orders" };
    expect(grid.applyTransaction({ patches: [removal] }).status).toBe("applied");
    expect(store.getMeasureStatus(revenue_measure.id)).toEqual({ status: "missingTable" });
  });

  it("renames table, column and measure references in measure formulas, undone in one step", () => {
    const grid = mount_grid();
    const apply = (operation: DocumentOp) => grid.applyTransaction({ patches: [operation] }).status;
    const share = {
      id: "share",
      name: "Share",
      table: "customers",
      formula: "=[revenue] / COUNTA(Customers[id]) + orders[@Amount]",
    };
    const formulas = () =>
      grid.store.getWorkbook().dataModel?.measures?.map((measure) => measure.formula);
    expect(apply({ op: "setMeasure", measure: revenue_measure })).toBe("applied");
    expect(apply({ op: "setMeasure", measure: share })).toBe("applied");

    const renamed_table: DocumentOp = {
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
    expect(apply(renamed_table)).toBe("applied");
    expect(formulas()).toEqual([
      "=SUM(Sales[Net])",
      "=[revenue] / COUNTA(Customers[id]) + Sales[@Net]",
    ]);

    expect(apply({ op: "setMeasure", measure: { ...revenue_measure, name: "Income" } })).toBe(
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
    expect(validateDocumentOperationShape({ op: "setMeasure", measure: revenue_measure })).toEqual(
      [],
    );
    for (const patch of [{ name: "" }, { name: "[Revenue]" }, { formula: "SUM(orders[amount])" }]) {
      expect(
        validateDocumentOperationShape({
          op: "setMeasure",
          measure: { ...revenue_measure, ...patch },
        }).length,
      ).toBeGreaterThan(0);
    }
  });
});

describe("relationship shape", () => {
  it("refuses saved models with a cycle, a repeated table pair or a self link", () => {
    const cycle: TableRelationship = {
      id: "r-regions-orders",
      from: { table: "regions", column: "name" },
      to: { table: "orders", column: "customer" },
    };
    const reversed_pair: TableRelationship = {
      id: "r-customers-orders",
      from: { table: "customers", column: "id" },
      to: { table: "orders", column: "customer" },
    };
    const self_link: TableRelationship = {
      id: "r-self",
      from: { table: "orders", column: "customer" },
      to: { table: "orders", column: "amount" },
    };

    for (const relationships of [
      [orders_to_customers, customers_to_regions, cycle],
      [orders_to_customers, reversed_pair],
      [self_link],
      [orders_to_customers, { ...customers_to_regions, id: orders_to_customers.id }],
      [{ ...orders_to_customers, to: { table: "customers" } } as TableRelationship],
    ]) {
      expect(validateWorkbookSnapshot(snapshot(relationships)).ok).toBe(false);
    }
    expect(validateWorkbookSnapshot(snapshot([orders_to_customers, customers_to_regions])).ok).toBe(
      true,
    );
  });
});

describe("relationships in the store", () => {
  it("round-trips through a snapshot and drops an empty model", () => {
    const store = SheetwriteStore.fromSnapshot(
      snapshot([orders_to_customers, customers_to_regions]),
    );
    const empty = SheetwriteStore.fromSnapshot(snapshot([]));
    try {
      expect(store.getRelationships()).toEqual([orders_to_customers, customers_to_regions]);
      expect(store.exportSnapshot().workbook.dataModel).toEqual({
        relationships: [orders_to_customers, customers_to_regions],
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
      expect(store.setRelationship(orders_to_customers).status).toBe("applied");
      expect(store.setRelationship(customers_to_regions).status).toBe("applied");

      const missing_column = {
        ...orders_to_customers,
        id: "r2",
        to: { table: "regions", column: "x" },
      };
      const missing_table = {
        ...orders_to_customers,
        id: "r3",
        to: { table: "gone", column: "id" },
      };
      const cycle: TableRelationship = {
        id: "r4",
        from: { table: "regions", column: "name" },
        to: { table: "orders", column: "customer" },
      };
      for (const refused of [missing_column, missing_table, cycle]) {
        expect(store.setRelationship(refused).status).not.toBe("applied");
      }

      // Replacing by ID may change the key columns of the same pair.
      const replaced = { ...orders_to_customers, from: { table: "orders", column: "amount" } };
      expect(store.setRelationship(replaced).status).toBe("applied");
      expect(store.getRelationships()).toEqual([replaced, customers_to_regions]);

      expect(store.removeRelationship("unknown").status).not.toBe("applied");
      expect(store.removeRelationship(replaced.id).status).toBe("applied");
      expect(store.getRelationships()).toEqual([customers_to_regions]);
    } finally {
      store.dispose();
    }
  });
});

describe("relationship history", () => {
  it("keeps a relationship whose table is removed, so undo restores a working model", () => {
    const grid = mount_grid();
    grid.applyTransaction({
      patches: [{ op: "setRelationship", relationship: orders_to_customers }],
    });

    expect(
      grid.applyTransaction({
        patches: [{ op: "removeTable", sheet: "data", tableId: "customers" }],
      }).status,
    ).toBe("applied");
    expect(grid.store.getWorkbook().dataModel?.relationships).toEqual([orders_to_customers]);

    // A saved relationship to a removed table is valid in a snapshot.
    const exported = grid.store.exportSnapshot?.();
    if (!exported) throw new Error("the store must export snapshots");
    expect(validateWorkbookSnapshot(exported).ok).toBe(true);

    grid.undo();
    const tables = grid.store.getWorkbook().sheets[0]?.tables?.map((entry) => entry.id);
    expect(tables).toContain("customers");
    expect(grid.store.getWorkbook().dataModel?.relationships).toEqual([orders_to_customers]);
  });
});

describe("relationship collaboration", () => {
  it("conflicts on concurrent model changes and on a removed or changed table", () => {
    const local: DocumentOp[] = [{ op: "setRelationship", relationship: orders_to_customers }];

    expect(
      rebaseDocumentOperations(local, [{ op: "addRows", sheet: "data", at: 0, count: 2 }]),
    ).toEqual({ status: "rebased", operations: local });
    expect(
      rebaseDocumentOperations(local, [{ op: "removeTable", sheet: "data", tableId: "regions" }]),
    ).toEqual({ status: "rebased", operations: local });

    for (const remote of [
      { op: "setRelationship", relationship: customers_to_regions },
      { op: "removeRelationship", id: "anything" },
      { op: "setMeasure", measure: revenue_measure },
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
    const measure: DocumentOp = { op: "setMeasure", measure: revenue_measure };
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
});

const customers: SavedQuery = {
  id: "customers",
  name: "Customers",
  source: {
    kind: "csv",
    sourceId: "crm",
    locator: "https://example.test/customers.csv",
    columns: [
      { id: "id", name: "Id", type: "number" },
      { id: "region", name: "Region", type: "text" },
    ],
  },
  steps: [],
};

const orders: SavedQuery = {
  id: "orders",
  name: "Orders",
  source: {
    kind: "json",
    sourceId: "shop",
    columns: [
      { id: "customer", name: "Customer", type: "number" },
      { id: "total", name: "Total", type: "number" },
    ],
  },
  steps: [{ kind: "join", input: "customers", keys: [["customer", "id"]], join: "left" }],
  output: { table: "orders-table", tableName: "Orders", anchor: { sheet: "data", row: 0, col: 0 } },
};

const query_snapshot = (queries: SavedQuery[]): WorkbookSnapshot => ({
  schemaVersion: 1,
  workbook: { activeSheet: "data", queries },
  sheets: [{ id: "data", name: "Data", order: 0, rowCount: 20, columns: columns(6), cells: [] }],
});

describe("saved query shape", () => {
  it("validates setQuery and removeQuery operations", () => {
    expect(validateDocumentOperationShape({ op: "setQuery", query: orders })).toEqual([]);
    expect(validateDocumentOperationShape({ op: "removeQuery", id: "orders" })).toEqual([]);

    for (const [query, path] of [
      [{ ...orders, source: { ...orders.source, kind: "ftp" } }, "operation.query.source.kind"],
      [
        { ...customers, source: { ...customers.source, delimiter: 0 } },
        "operation.query.source.delimiter",
      ],
      [{ ...orders, steps: [{ kind: "join" }] }, "operation.query.steps[0].input"],
      [
        { ...orders, output: { ...orders.output, anchor: { sheet: "data", row: -1, col: 0 } } },
        "operation.query.output.anchor",
      ],
    ] as const) {
      expect(validateDocumentOperationShape({ op: "setQuery", query })).toContainEqual(
        expect.objectContaining({ path }),
      );
    }
  });

  it("refuses a locator with credentials so a secret is never saved", () => {
    const leaked = {
      ...customers,
      source: { ...customers.source, locator: "https://user:secret@example.test/data.csv" },
    };

    expect(validateDocumentOperationShape({ op: "setQuery", query: leaked })).toContainEqual(
      expect.objectContaining({ path: "operation.query.source.locator" }),
    );
  });

  it("refuses saved lists with duplicate identities, missing inputs, cycles or shared tables", () => {
    const loop: SavedQuery = {
      ...customers,
      steps: [{ kind: "join", input: "orders", keys: [["id", "customer"]], join: "inner" }],
    };
    const shared_table: SavedQuery = { ...customers, output: orders.output };

    for (const list of [
      [customers, { ...orders, id: "customers" }],
      [customers, { ...orders, name: "CUSTOMERS" }],
      [
        { ...customers, name: "\u00C4" },
        { ...orders, name: "A\u0308" },
      ],
      [orders],
      [loop, orders],
      [shared_table, orders],
    ]) {
      expect(validateWorkbookSnapshot(query_snapshot(list)).ok).toBe(false);
    }

    expect(validateWorkbookSnapshot(query_snapshot([customers, orders])).ok).toBe(true);
  });
});

describe("saved queries in the store", () => {
  it("round-trips through a snapshot and drops an empty list", () => {
    const store = SheetwriteStore.fromSnapshot(query_snapshot([customers, orders]));
    const empty = SheetwriteStore.fromSnapshot(query_snapshot([]));
    try {
      expect(store.exportSnapshot().workbook.queries).toEqual([customers, orders]);
      expect(empty.exportSnapshot().workbook.queries).toBeUndefined();
    } finally {
      store.dispose();
      empty.dispose();
    }
  });
});

describe("saved query collaboration", () => {
  it("conflicts on any concurrent definition change", () => {
    const local: DocumentOp[] = [{ op: "setQuery", query: customers }];

    expect(
      rebaseDocumentOperations(local, [{ op: "addRows", sheet: "data", at: 0, count: 2 }]),
    ).toEqual({ status: "rebased", operations: local });

    for (const remote of [
      { op: "setQuery", query: orders },
      { op: "removeQuery", id: "anything" },
    ] satisfies DocumentOp[]) {
      expect(rebaseDocumentOperations(local, [remote])).toMatchObject({
        status: "conflict",
        conflict: { code: "overlapping-edit" },
      });
    }
  });
});

describe("kept Power Query members on a retained graph", () => {
  const snapshot_with = (unsupported_queries: unknown): unknown => ({
    schemaVersion: 1,
    workbook: {
      activeSheet: "data",
      xlsxSource: {
        parts: [
          {
            name: "customXml/item1.xml",
            contentType: "application/xml",
            method: 0,
            crc32: 0,
            uncompressedSize: 0,
            data: "",
          },
        ],
        graphs: [
          {
            owner: "workbook",
            type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml",
            target: "customXml/item1.xml",
            queries: "0123456789abcdef",
            unsupportedQueries: unsupported_queries,
            parts: ["customXml/item1.xml"],
            dependencies: [],
          },
        ],
      },
    },
    sheets: [],
  });
  const paths = (input: unknown): string[] => {
    const result = validateWorkbookSnapshot(input);
    return result.ok ? [] : result.errors.map((error) => error.path);
  };
  const path = "workbook.xlsxSource.graphs[0].unsupportedQueries";

  it("accepts bounded member names and reasons, and rejects anything past the caps", () => {
    expect(paths(snapshot_with([{ member: "Budget", reason: "schema" }]))).not.toContain(path);
    expect(paths(snapshot_with("Budget"))).toContain(path);
    expect(paths(snapshot_with([{ member: "Budget" }]))).toContain(`${path}[0].reason`);
    expect(paths(snapshot_with([{ member: "Budget", reason: "x".repeat(65) }]))).toContain(
      `${path}[0].reason`,
    );
    expect(paths(snapshot_with([{ member: "m".repeat(1025), reason: "schema" }]))).toContain(
      `${path}[0].member`,
    );
    const many = Array.from({ length: 257 }, (_, index) => ({
      member: `M${index}`,
      reason: "schema",
    }));
    expect(paths(snapshot_with(many))).toContain(path);
  });
});
